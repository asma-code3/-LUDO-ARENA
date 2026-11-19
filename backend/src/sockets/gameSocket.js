import { randomInt, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createGame, moveToken, rollDice } from '../../../frontend/src/game/engine.js'
import { GameRoom } from '../models/GameRoom.js'
import { ChatMessage } from '../models/ChatMessage.js'
import { GameInvite } from '../models/GameInvite.js'
import { Friend } from '../models/Friend.js'
import { GameHistory } from '../models/GameHistory.js'
import { Reward } from '../models/Reward.js'
import { User } from '../models/User.js'
import { unlockAchievement } from '../services/rewards.js'
import { levelForXp } from '../services/progression.js'
import { settleTournamentMatch } from '../services/tournaments.js'
import { recordMatchWinChallenge } from '../services/challenges.js'
import { getAllowedOrigins } from '../config/origins.js'
import { withRoomLock } from '../services/distributedLock.js'
import { joinSharedMatchmakingQueue, leaveSharedMatchmakingQueue, requeueSharedMatchmakingPlayers } from '../services/matchmakingQueue.js'

const rooms = new Map()
const colors = ['coral', 'green', 'gold', 'blue']
const activeConnections = new Map()
const matchmakingQueue = []

function makeCode() {
  return randomBytes(3).toString('hex').toUpperCase()
}

export async function attachGameSockets(httpServer, { redis = null, redisSub = null } = {}) {
  activeConnections.clear()
  matchmakingQueue.length = 0
  if (!redis) await User.updateMany({ isOnline: true }, { $set: { isOnline: false, lastSeenAt: new Date() } })
  const io = new Server(httpServer, {
    cors: { origin: getAllowedOrigins(), credentials: true },
    pingInterval: 25000,
    pingTimeout: 20000,
  })
  if (redis && redisSub) io.adapter(createAdapter(redis, redisSub))
  else await restoreRooms()
  if (redis) {
    const presenceSweep = setInterval(() => sweepSharedPresence(redis).catch((error) => console.error('Presence sweep error:', error.message)), 45_000)
    presenceSweep.unref?.()
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      const { sub } = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findById(sub).select('username avatar')
      if (!user) return next(new Error('AUTH_REQUIRED'))
      socket.user = { id: user.id, username: user.username, avatar: user.avatar }
      socket.data.userId = user.id
      const connections = activeConnections.get(user.id) ?? new Set()
      connections.add(socket.id)
      activeConnections.set(user.id, connections)
      if (redis) await registerSharedPresence(redis, user.id, socket.id)
      await User.updateOne({ _id: user.id }, { $set: { isOnline: true } })
      next()
    } catch {
      next(new Error('AUTH_REQUIRED'))
    }
  })

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`)
    if (redis) {
      socket.data.presenceHeartbeat = setInterval(() => {
        refreshSharedPresence(redis, socket.user.id, socket.id).catch((error) => console.error('Presence heartbeat error:', error.message))
      }, 30_000)
      socket.data.presenceHeartbeat.unref?.()
    }
    socket.emit('arena:connected', { player: socket.user })

    socket.on('room:create', async (payload = {}, ack = () => {}) => {
      if (!allowSocketAction(socket, 'room:create', 5, 60_000)) return ack({ ok: false, error: 'Wait before creating another room.' })
      try {
        const code = makeCode()
        const playerLimit = Number(payload.playerLimit) === 3 ? 3 : 2
        const room = {
          code,
          hostId: socket.user.id,
          members: [{ userId: socket.user.id, username: socket.user.username, socketId: socket.id, color: colors[0] }],
          game: null,
          status: 'waiting',
          mode: 'private',
          playerLimit,
        }
        rooms.set(code, room)
        const record = await GameRoom.create({ code, host: socket.user.id, mode: room.mode, playerLimit, players: [{ user: socket.user.id, color: colors[0], ready: true }] })
        room.documentId = record.id
        room.createdAt = record.createdAt
        socket.join(code)
        ack({ ok: true, room: publicRoom(room) })
        io.to(code).emit('room:updated', publicRoom(room))
      } catch (error) { ack({ ok: false, error: safeMessage(error) }) }
    })

    socket.on('room:join', async ({ code } = {}, ack = () => {}) => {
      try {
        await withRoomLock(redis, String(code ?? '').trim().toUpperCase(), async () => {
          const room = await loadRoom(code)
          if (!room) return ack({ ok: false, error: 'Room not found.' })
          const existingMember = room.members.find((member) => member.userId === socket.user.id)
          if (existingMember) {
            existingMember.socketId = socket.id
            socket.join(room.code)
            io.to(room.code).emit('room:presence', { userId: existingMember.userId, online: true })
            return ack({ ok: true, room: publicRoom(room), game: room.game })
          }
          if (room.status !== 'waiting') return ack({ ok: false, error: 'Room not found or already started.' })
          if (room.mode === 'tournament') return ack({ ok: false, error: 'Only players in the bracket can join this room.' })
          if (room.members.length >= (room.playerLimit ?? 2)) return ack({ ok: false, error: `This room is full. It allows ${room.playerLimit ?? 2} players.` })
          const player = { userId: socket.user.id, username: socket.user.username, socketId: socket.id, color: colors[room.members.length] }
          room.members.push(player)
          socket.join(room.code)
          await GameRoom.updateOne({ code: room.code }, { $push: { players: { user: player.userId, color: player.color, ready: true } } })
          ack({ ok: true, room: publicRoom(room) })
          io.to(room.code).emit('room:updated', publicRoom(room))
        })
      } catch (error) { ack({ ok: false, error: safeMessage(error) }) }
    })

    socket.on('room:spectate', async ({ code } = {}, ack = () => {}) => {
      const room = await loadRoom(code)
      if (!room || room.status !== 'playing') return ack({ ok: false, error: 'That game is not available to spectate.' })
      socket.join(room.code)
      ack({ ok: true, room: publicRoom(room), game: room.game })
    })

    socket.on('matchmaking:join', async (payload = {}, ack = () => {}) => {
      if (!allowSocketAction(socket, 'matchmaking', 3, 30_000)) return ack({ ok: false, error: 'Wait before searching for another match.' })
      const mode = 'online'
      const requiredPlayers = Number(payload.playerCount) === 3 ? 3 : 2
      const currentPlayer = { userId: socket.user.id, username: socket.user.username, socketId: socket.id, mode, playerCount: requiredPlayers, enqueuedAt: Date.now() }
      let candidates = []
      if (redis) {
        const queued = await joinSharedMatchmakingQueue(redis, { ...currentPlayer, playersNeeded: requiredPlayers - 1 })
        if (queued.waiting) {
          socket.emit('matchmaking:waiting', { queued: true, mode, playersNeeded: requiredPlayers - 1 })
          return ack({ ok: true, waiting: true })
        }
        for (const entry of queued.candidates) {
          const connected = await io.in(entry.socketId).fetchSockets()
          if (connected.length) candidates.push({ entry })
        }
        if (candidates.length < requiredPlayers - 1) {
          const requeue = [...candidates.map(({ entry }) => entry), currentPlayer]
          await requeueSharedMatchmakingPlayers(redis, requeue)
          socket.emit('matchmaking:waiting', { queued: true, mode, playersNeeded: requiredPlayers - candidates.length })
          return ack({ ok: true, waiting: true })
        }
      } else {
        const duplicate = matchmakingQueue.findIndex((entry) => entry.userId === socket.user.id)
        if (duplicate >= 0) matchmakingQueue.splice(duplicate, 1)
        for (let index = 0; index < matchmakingQueue.length && candidates.length < requiredPlayers - 1; index += 1) {
          const entry = matchmakingQueue[index]
          if (entry.mode === mode && entry.playerCount === requiredPlayers && entry.userId !== socket.user.id && io.sockets.sockets.has(entry.socketId)) candidates.push({ index, entry })
        }
        if (candidates.length < requiredPlayers - 1) {
          matchmakingQueue.push(currentPlayer)
          socket.emit('matchmaking:waiting', { queued: true, mode, playersNeeded: requiredPlayers - candidates.length })
          return ack({ ok: true, waiting: true })
        }
        for (const candidate of [...candidates].reverse()) matchmakingQueue.splice(candidate.index, 1)
      }
      const players = [...candidates.map(({ entry }) => entry), currentPlayer]
      try {
        const code = makeCode()
        const members = players.map((member, index) => ({ ...member, color: colors[index] }))
        const game = createGame({ playerNames: Object.fromEntries(members.map((member) => [member.color, member.username])), playerColors: members.map((member) => member.color) })
        const room = { code, hostId: members[0].userId, members, game, status: 'playing', mode, playerLimit: requiredPlayers, startedAt: new Date() }
        const record = await GameRoom.create({ code, host: members[0].userId, mode, playerLimit: requiredPlayers, status: 'playing', startedAt: room.startedAt, players: members.map((member) => ({ user: member.userId, color: member.color, ready: true })), state: room.game })
        room.documentId = record.id
        room.createdAt = record.createdAt
        rooms.set(code, room)
        for (const member of members) io.in(member.socketId).socketsJoin(code)
        const result = { ok: true, room: publicRoom(room), game: room.game }
        for (const member of members) io.to(member.socketId).emit('matchmaking:matched', result)
        ack({ ok: true, room: publicRoom(room) })
        io.to(code).emit('game:state', { room: publicRoom(room), game: room.game })
      } catch (error) {
        const waitingPlayers = players.filter((member) => member.socketId !== socket.id)
        if (redis) await requeueSharedMatchmakingPlayers(redis, waitingPlayers).catch(() => {})
        else for (const member of waitingPlayers) if (io.sockets.sockets.has(member.socketId)) matchmakingQueue.push(member)
        ack({ ok: false, error: safeMessage(error) })
      }
    })

    socket.on('matchmaking:leave', async (ack = () => {}) => {
      const index = matchmakingQueue.findIndex((entry) => entry.socketId === socket.id)
      if (index >= 0) matchmakingQueue.splice(index, 1)
      if (redis) await leaveSharedMatchmakingQueue(redis, socket.user.id, socket.id).catch(() => {})
      ack({ ok: true })
    })

    socket.on('game:start', async ({ code } = {}, ack = () => {}) => {
      try {
        await withRoomLock(redis, String(code ?? '').trim().toUpperCase(), async () => {
          const room = await loadRoom(code)
          if (!room || room.hostId !== socket.user.id) return ack({ ok: false, error: 'Only the room host can start the game.' })
          const requiredPlayers = room.playerLimit ?? 2
          if (room.members.length !== requiredPlayers || room.status !== 'waiting') return ack({ ok: false, error: `This room needs exactly ${requiredPlayers} players to start.` })
          room.status = 'playing'
          room.startedAt = new Date()
          room.game = createGame({ playerNames: Object.fromEntries(room.members.map((member) => [member.color, member.username])), playerColors: room.members.map((member) => member.color) })
          await GameRoom.updateOne({ code: room.code, status: 'waiting' }, { $set: { status: 'playing', state: room.game, startedAt: room.startedAt } })
          io.to(room.code).emit('game:state', { room: publicRoom(room), game: room.game })
          ack({ ok: true })
        })
      } catch (error) { ack({ ok: false, error: safeMessage(error) }) }
    })

    socket.on('game:roll', async ({ code } = {}, ack = () => {}) => {
      try {
        await withRoomLock(redis, String(code ?? '').trim().toUpperCase(), async () => {
          const room = await loadRoom(code)
          if (!canAct(room, socket, ack)) return
          room.game = rollDice(room.game, () => (randomInt(1, 7) - 1) / 6)
          await persistState(room)
          io.to(room.code).emit('game:state', { room: publicRoom(room), game: room.game })
          ack({ ok: true, dice: room.game.dice })
        })
      } catch (error) { ack({ ok: false, error: safeMessage(error) }) }
    })

    socket.on('game:move', async ({ code, tokenIndex } = {}, ack = () => {}) => {
      try {
        await withRoomLock(redis, String(code ?? '').trim().toUpperCase(), async () => {
          const room = await loadRoom(code)
          if (!canAct(room, socket, ack)) return
          room.game = moveToken(room.game, Number(tokenIndex))
          if (room.game.status === 'finished') {
            room.status = 'finished'
            await saveGameResult(room)
            await settleTournamentMatch(room.documentId, room.winnerId, io, room.code)
          }
          await persistState(room)
          io.to(room.code).emit('game:state', { room: publicRoom(room), game: room.game })
          ack({ ok: true })
        })
      } catch (error) { ack({ ok: false, error: safeMessage(error) }) }
    })

    socket.on('game:chat', async ({ code, text } = {}, ack = () => {}) => {
      if (!allowSocketAction(socket, 'chat', 8, 10_000)) return ack({ ok: false, error: 'Slow down before sending another chat message.' })
      const room = await loadRoom(code)
      if (!room || !room.members.some((member) => member.userId === socket.user.id)) return ack({ ok: false, error: 'Join a room to chat.' })
      const message = String(text ?? '').trim().slice(0, 280)
      if (!message) return ack({ ok: false, error: 'Message cannot be empty.' })
      try {
        const saved = await ChatMessage.create({ room: room.documentId, sender: socket.user.id, kind: 'text', text: message })
        io.to(room.code).emit('game:chat', { id: saved.id, roomCode: room.code, player: socket.user.username, text: message, sentAt: saved.createdAt.toISOString() })
        ack({ ok: true })
      } catch (error) { ack({ ok: false, error: safeMessage(error) }) }
    })

    socket.on('game:reaction', async ({ code, emoji } = {}, ack = () => {}) => {
      if (!allowSocketAction(socket, 'reaction', 15, 10_000)) return ack({ ok: false, error: 'Slow down before sending another reaction.' })
      const room = await loadRoom(code)
      if (!room || !room.members.some((member) => member.userId === socket.user.id)) return ack({ ok: false, error: 'Join a room to react.' })
      const allowed = new Set(['👏', '😂', '🔥', '😮', '💚'])
      if (!allowed.has(emoji)) return ack({ ok: false, error: 'Unsupported reaction.' })
      try {
        const saved = await ChatMessage.create({ room: room.documentId, sender: socket.user.id, kind: 'reaction', emoji })
        io.to(room.code).emit('game:reaction', { id: saved.id, roomCode: room.code, player: socket.user.username, emoji, sentAt: saved.createdAt.toISOString() })
        ack({ ok: true })
      } catch (error) { ack({ ok: false, error: safeMessage(error) }) }
    })

    socket.on('room:invite', async ({ code, recipientId } = {}, ack = () => {}) => {
      if (!allowSocketAction(socket, 'invite', 5, 60_000)) return ack({ ok: false, error: 'Wait before sending more game invites.' })
      const room = await loadRoom(code)
      if (!room || room.status !== 'waiting' || room.mode === 'tournament') return ack({ ok: false, error: 'This room is not accepting invites.' })
      if (!room.members.some((member) => member.userId === socket.user.id)) return ack({ ok: false, error: 'Join the room before inviting friends.' })
      const targetId = String(recipientId ?? '')
      if (!/^[a-f\d]{24}$/i.test(targetId) || targetId === socket.user.id || room.members.some((member) => member.userId === targetId)) return ack({ ok: false, error: 'Choose a friend who is not already in the room.' })
      if (room.members.length >= (room.playerLimit ?? 2)) return ack({ ok: false, error: `This room is full. It allows ${room.playerLimit ?? 2} players.` })
      try {
        const recipient = await User.findById(targetId).select('allowFriendInvites')
        if (!recipient || recipient.allowFriendInvites === false) return ack({ ok: false, error: 'This player is not accepting friend invites.' })
        const friendship = await Friend.exists({ status: 'accepted', $or: [{ requester: socket.user.id, recipient: targetId }, { requester: targetId, recipient: socket.user.id }] })
        if (!friendship) return ack({ ok: false, error: 'You can only invite an accepted friend.' })
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
        const invitation = await GameInvite.findOneAndUpdate(
          { recipient: targetId, room: room.documentId, status: 'pending' },
          { $setOnInsert: { sender: socket.user.id, roomCode: room.code, expiresAt } },
          { new: true, upsert: true },
        )
        const payload = { id: invitation.id, sender: socket.user.username, roomCode: room.code, expiresAt: invitation.expiresAt.toISOString() }
        io.to(`user:${targetId}`).emit('arena:invite', payload)
        ack({ ok: true, invitation: payload })
      } catch (error) { ack({ ok: false, error: safeMessage(error) }) }
    })

    socket.on('voice:signal', async ({ code, to, signal } = {}, ack = () => {}) => {
      if (!allowSocketAction(socket, 'voice', 80, 10_000)) return ack({ ok: false, error: 'Voice signaling is temporarily rate limited.' })
      const room = await loadRoom(code)
      const member = room?.members.find((entry) => entry.userId === socket.user.id)
      const recipient = room?.members.find((entry) => entry.userId === String(to))
      if (!member || !recipient) return ack({ ok: false, error: 'Voice peer is not connected to this room.' })
      if (!signal || !['offer', 'answer', 'candidate'].includes(signal.type)) return ack({ ok: false, error: 'Invalid voice signal.' })
      const roomSockets = await io.in(room.code).fetchSockets()
      const peer = roomSockets.find((connection) => connection.data.userId === recipient.userId)
      if (!peer) return ack({ ok: false, error: 'Voice peer is not connected to this room.' })
      io.to(peer.id).emit('voice:signal', { from: socket.user.id, signal })
      ack({ ok: true })
    })

    socket.on('disconnect', async () => {
      const queueIndex = matchmakingQueue.findIndex((entry) => entry.socketId === socket.id)
      if (queueIndex >= 0) matchmakingQueue.splice(queueIndex, 1)
      if (redis) void leaveSharedMatchmakingQueue(redis, socket.user.id, socket.id).catch((error) => console.error('Matchmaking cleanup error:', error.message))
      if (socket.data.presenceHeartbeat) clearInterval(socket.data.presenceHeartbeat)
      const connections = activeConnections.get(socket.user.id)
      connections?.delete(socket.id)
      if (connections?.size === 0) activeConnections.delete(socket.user.id)
      if (redis) {
        const online = await unregisterSharedPresence(redis, socket.user.id, socket.id).catch((error) => { console.error('Presence cleanup error:', error.message); return true })
        if (!online) {
          await User.updateOne({ _id: socket.user.id }, { $set: { isOnline: false, lastSeenAt: new Date() } })
        }
      } else if (connections?.size === 0) {
        void User.updateOne({ _id: socket.user.id }, { $set: { isOnline: false, lastSeenAt: new Date() } })
      }
      const activeRooms = await GameRoom.find({ 'players.user': socket.user.id, status: { $in: ['waiting', 'playing'] } }).select('code').lean()
      for (const { code } of activeRooms) {
        const room = await loadRoom(code)
        const member = room?.members.find((entry) => entry.userId === socket.user.id)
        if (!room || !member) continue
        const roomSockets = await io.in(room.code).fetchSockets()
        const replacement = roomSockets.find((connection) => connection.data.userId === member.userId)
        member.socketId = replacement?.id ?? null
        member.online = Boolean(replacement) || (redis ? await hasSharedPresence(redis, member.userId) : Boolean(connections?.size))
        io.to(room.code).emit('room:presence', { userId: member.userId, online: member.online })
      }
    })
  })

  return io
}

function canAct(room, socket, ack) {
  if (!room || room.status !== 'playing' || !room.game) {
    ack({ ok: false, error: 'The game is not active.' })
    return false
  }
  const player = room.members[room.game.currentPlayer]
  if (!player || player.userId !== socket.user.id) {
    ack({ ok: false, error: 'It is not your turn.' })
    return false
  }
  return true
}

function allowSocketAction(socket, action, limit, windowMs) {
  const now = Date.now()
  socket.data.rateLimits ??= new Map()
  const current = socket.data.rateLimits.get(action)
  if (!current || now - current.startedAt >= windowMs) {
    socket.data.rateLimits.set(action, { startedAt: now, count: 1 })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}

function userSocketSetKey(userId) { return `arena:{ludo}:presence:${userId}:sockets` }
function socketPresenceKey(userId, socketId) { return `arena:{ludo}:presence:${userId}:${socketId}` }

async function registerSharedPresence(redis, userId, socketId) {
  await redis.pipeline()
    .sadd(userSocketSetKey(userId), socketId)
    .set(socketPresenceKey(userId, socketId), '1', 'EX', 75)
    .expire(userSocketSetKey(userId), 90)
    .exec()
}

async function refreshSharedPresence(redis, userId, socketId) {
  await redis.pipeline()
    .sadd(userSocketSetKey(userId), socketId)
    .set(socketPresenceKey(userId, socketId), '1', 'EX', 75)
    .expire(userSocketSetKey(userId), 90)
    .exec()
}

async function hasSharedPresence(redis, userId) {
  const setKey = userSocketSetKey(userId)
  const socketIds = await redis.smembers(setKey)
  if (!socketIds.length) return false
  const pipeline = redis.pipeline()
  for (const socketId of socketIds) pipeline.exists(socketPresenceKey(userId, socketId))
  const results = await pipeline.exec()
  const staleIds = socketIds.filter((_socketId, index) => Number(results[index]?.[1] ?? 0) === 0)
  if (staleIds.length) await redis.srem(setKey, ...staleIds)
  const activeCount = socketIds.length - staleIds.length
  if (activeCount === 0) await redis.del(setKey)
  return activeCount > 0
}

async function unregisterSharedPresence(redis, userId, socketId) {
  const setKey = userSocketSetKey(userId)
  await redis.del(socketPresenceKey(userId, socketId))
  await redis.srem(setKey, socketId)
  return hasSharedPresence(redis, userId)
}

async function sweepSharedPresence(redis) {
  const onlineUsers = await User.find({ isOnline: true }).select('_id').lean()
  await Promise.all(onlineUsers.map(async ({ _id }) => {
    if (!(await hasSharedPresence(redis, String(_id)))) {
      await User.updateOne({ _id }, { $set: { isOnline: false, lastSeenAt: new Date() } })
    }
  }))
}

async function persistState(room) {
  await GameRoom.updateOne({ code: room.code }, { $set: { state: room.game, status: room.status, winner: room.winnerId ?? null } })
}

async function restoreRooms() {
  const active = await GameRoom.find({ status: { $in: ['waiting', 'playing'] } }).populate('players.user', 'username avatar isOnline')
  for (const record of active) {
    const members = record.players.filter((entry) => entry.user).map((entry) => ({
      userId: entry.user.id,
      username: entry.user.username,
      socketId: null,
      online: entry.user.isOnline,
      color: entry.color,
    }))
    if (!members.length) continue
    rooms.set(record.code, {
      code: record.code,
      documentId: record.id,
      hostId: String(record.host),
      members,
      game: record.state,
      status: record.status,
      mode: record.mode,
      playerLimit: record.playerLimit ?? 2,
      tournamentId: record.tournament ? String(record.tournament) : null,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
    })
  }
}

async function loadRoom(code) {
  const normalized = String(code ?? '').trim().toUpperCase()
  if (!normalized) return null
  const cached = rooms.get(normalized)
  const record = await GameRoom.findOne({ code: normalized }).populate('players.user', 'username avatar isOnline')
  if (!record) return null
  const members = record.players.filter((entry) => entry.user).map((entry) => ({
    userId: entry.user.id,
    username: entry.user.username,
    socketId: activeSocketId(entry.user.id, cached?.members.find((member) => member.userId === entry.user.id)?.socketId),
    online: entry.user.isOnline,
    color: entry.color,
  }))
  if (!members.length) return null
  const room = {
    code: record.code,
    documentId: record.id,
    hostId: String(record.host),
    members,
    game: record.state,
    status: record.status,
    mode: record.mode,
    playerLimit: record.playerLimit ?? 2,
    tournamentId: record.tournament ? String(record.tournament) : null,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
  }
  rooms.set(normalized, room)
  return room
}

function activeSocketId(userId, socketId) {
  return socketId && activeConnections.get(userId)?.has(socketId) ? socketId : null
}

async function saveGameResult(room) {
  if (await GameHistory.exists({ room: room.documentId })) return
  const winnerIndex = room.game.players.findIndex((player) => player.color === room.game.winner)
  const winner = room.members[winnerIndex]
  if (!winner) throw new Error('The winning player could not be matched to this room.')
  const winningIndices = room.mode === 'team' ? room.game.winningPlayers : [winnerIndex]
  if (winningIndices.length === 0) throw new Error('The winning team could not be matched to this room.')
  const durationSeconds = Math.max(0, Math.floor((Date.now() - new Date(room.startedAt ?? room.createdAt).getTime()) / 1000))
  const historyPlayers = room.members.map((member, index) => ({
    user: member.userId,
    placement: winningIndices.includes(index) ? 1 : 2,
    coinsEarned: winningIndices.includes(index) ? 240 : 80,
  }))
  await GameHistory.create({ room: room.documentId, players: historyPlayers, mode: room.mode, durationSeconds })
  await Promise.all(room.members.map(async (member, index) => {
    const won = winningIndices.includes(index)
    const user = await User.findByIdAndUpdate(member.userId, { $inc: { matchesPlayed: 1, wins: won ? 1 : 0, coins: won ? 240 : 80, xp: won ? 50 : 20 } }, { new: true }).select('matchesPlayed wins xp level')
    if (user && user.level !== levelForXp(user.xp)) {
      user.level = levelForXp(user.xp)
      await user.save()
    }
    if (won) await unlockAchievement(member.userId, 'first-win')
    if (user?.matchesPlayed >= 10) await unlockAchievement(member.userId, 'ten-matches')
    if (won) await Reward.create({ user: member.userId, kind: 'match-win', coins: 240, xp: 50, sourceId: `room:${room.documentId}` })
    if (won) await recordMatchWinChallenge(member.userId).catch((error) => console.error('Daily challenge progress error:', error.message))
    return user
  }))
  room.winnerId = winner.userId
  await GameRoom.updateOne({ code: room.code }, { $set: { winner: winner.userId, status: 'finished' } })
}

function publicRoom(room) {
  return { code: room.code, status: room.status, mode: room.mode, playerLimit: room.playerLimit ?? 2, hostId: room.hostId, players: room.members.map(({ userId, username, color, socketId, online }) => ({ userId, username, color, online: Boolean(socketId || online) })) }
}

function safeMessage(error) {
  if (error?.name === 'ValidationError') return error.message
  return error instanceof Error ? error.message : 'Could not complete that action.'
}
