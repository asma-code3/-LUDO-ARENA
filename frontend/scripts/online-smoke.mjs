import assert from 'node:assert/strict'
import { io } from 'socket.io-client'
import { getLegalTokenIds } from '../src/game/engine.js'

const API = process.env.TEST_API_URL ?? 'http://localhost:4000/api'
const SOCKET = process.env.TEST_SOCKET_URL ?? 'http://localhost:4000'
const SECOND_SOCKET = process.env.TEST_SOCKET_URL_SECOND ?? SOCKET
const stamp = `${Date.now().toString(36).slice(-7)}${Math.random().toString(16).slice(2, 6)}`

async function register(username) {
  const response = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.test`, password: 'ArenaPass2026!' }),
  })
  const data = await response.json()
  assert.equal(response.status, 201, data.error)
  return data
}

function connect(token, url = SOCKET) {
  return new Promise((resolve, reject) => {
    const socket = io(url, { auth: { token }, reconnection: false, timeout: 5000 })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 5000)
    socket.emit(event, payload, (result) => { clearTimeout(timer); resolve(result) })
  })
}

function waitForState(getState, predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const check = () => {
      const state = getState()
      if (state && predicate(state)) return resolve(state)
      if (Date.now() - startedAt > timeout) return reject(new Error('Game state update timed out'))
      setTimeout(check, 10)
    }
    check()
  })
}

const host = await register(`host_${stamp}`)
const guest = await register(`guest_${stamp}`)
const spectator = await register(`spec_${stamp}`)
const teammate = await register(`team_${stamp}`)
let hostSocket = await connect(host.token)
const guestSocket = await connect(guest.token, SECOND_SOCKET)
const spectatorSocket = await connect(spectator.token)
const teammateSocket = await connect(teammate.token, SECOND_SOCKET)
let liveGame = null
let stateVersion = 0
const onGameState = ({ game }) => { liveGame = game; stateVersion += 1 }
hostSocket.on('game:state', onGameState)
guestSocket.on('game:state', onGameState)

try {
  const authHeader = { authorization: `Bearer ${host.token}`, 'content-type': 'application/json' }
  const challenge = await fetch(`${API}/arena/challenges/daily`, { headers: authHeader })
  assert.equal(challenge.status, 200, 'daily challenge endpoint should be authenticated and available')
  const challengeData = await challenge.json()
  assert.equal(challengeData.challenge.goal, 2)
  assert.equal(challengeData.challenge.progress, 0)
  const voiceConfig = await fetch(`${API}/arena/voice-credentials`, { headers: authHeader })
  assert.equal(voiceConfig.status, 200)
  assert.ok((await voiceConfig.json()).iceServers.some((server) => String(server.urls).startsWith('stun:')))
  const reward = await fetch(`${API}/arena/rewards/daily`, { method: 'POST', headers: authHeader, body: '{}' })
  assert.equal(reward.status, 201, 'first daily reward claim should succeed')
  const duplicateReward = await fetch(`${API}/arena/rewards/daily`, { method: 'POST', headers: authHeader, body: '{}' })
  assert.equal(duplicateReward.status, 409, 'daily reward must not be claimed twice')
  const cosmeticCatalogResponse = await fetch(`${API}/arena/cosmetics`, { headers: authHeader })
  assert.equal(cosmeticCatalogResponse.status, 200)
  const cosmeticCatalog = await cosmeticCatalogResponse.json()
  assert.ok(cosmeticCatalog.items.some((item) => item.id === 'avatar-fox' && item.price === 300))
  const themePurchase = await fetch(`${API}/arena/cosmetics/board-neon/purchase`, { method: 'POST', headers: authHeader, body: '{}' })
  assert.equal(themePurchase.status, 201)
  assert.equal((await themePurchase.json()).user.coins, 150)
  const duplicateThemePurchase = await fetch(`${API}/arena/cosmetics/board-neon/purchase`, { method: 'POST', headers: authHeader, body: '{}' })
  assert.equal(duplicateThemePurchase.status, 409, 'cosmetics cannot be bought twice')
  const equippedTheme = await fetch(`${API}/arena/cosmetics/equip`, { method: 'PATCH', headers: authHeader, body: JSON.stringify({ itemId: 'board-neon' }) })
  assert.equal(equippedTheme.status, 200)
  assert.equal((await equippedTheme.json()).user.boardTheme, 'board-neon')
  const insufficientCosmetic = await fetch(`${API}/arena/cosmetics/avatar-fox/purchase`, { method: 'POST', headers: authHeader, body: '{}' })
  assert.equal(insufficientCosmetic.status, 409, 'purchases require enough virtual coins')
  const tournamentResponse = await fetch(`${API}/tournaments`, { headers: authHeader })
  assert.equal(tournamentResponse.status, 200)
  const tournamentList = await tournamentResponse.json()
  assert.ok(tournamentList.tournaments.length > 0, 'seeded tournaments should be available')
  const tournamentId = tournamentList.tournaments[0]._id
  const registration = await fetch(`${API}/tournaments/${tournamentId}/register`, { method: 'POST', headers: authHeader, body: '{}' })
  assert.equal(registration.status, 201, (await registration.clone().json()).error)
  const duplicateRegistration = await fetch(`${API}/tournaments/${tournamentId}/register`, { method: 'POST', headers: authHeader, body: '{}' })
  assert.equal(duplicateRegistration.status, 409, 'a player cannot register twice')
  const achievements = await fetch(`${API}/arena/achievements`, { headers: { authorization: `Bearer ${host.token}` } })
  assert.equal(achievements.status, 200)
  assert.ok((await achievements.json()).achievements.length >= 3)
  const friendRequestResponse = await fetch(`${API}/community/requests/${guest.user.id}`, { method: 'POST', headers: authHeader, body: '{}' })
  assert.equal(friendRequestResponse.status, 201)
  const friendRequest = await friendRequestResponse.json()
  const accepted = await fetch(`${API}/community/requests/${friendRequest.request._id}`, { method: 'PATCH', headers: { authorization: `Bearer ${guest.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  assert.equal(accepted.status, 200, 'friend request should be accepted by the recipient')
  const connectedFriends = await fetch(`${API}/community/friends`, { headers: authHeader })
  const connectedFriendList = await connectedFriends.json()
  assert.equal(connectedFriendList.friends.find((friend) => friend._id === guest.user.id)?.isOnline, true, 'authenticated app sockets should keep online presence accurate outside a game room')
  const teammateFriendRequestResponse = await fetch(`${API}/community/requests/${teammate.user.id}`, { method: 'POST', headers: authHeader, body: '{}' })
  const teammateFriendRequest = await teammateFriendRequestResponse.json()
  assert.equal(teammateFriendRequestResponse.status, 201)
  const teammateFriendAccepted = await fetch(`${API}/community/requests/${teammateFriendRequest.request._id}`, { method: 'PATCH', headers: { authorization: `Bearer ${teammate.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  assert.equal(teammateFriendAccepted.status, 200)

  const created = await emitAck(hostSocket, 'room:create')
  assert.equal(created.ok, true, created.error)
  const joined = await emitAck(guestSocket, 'room:join', { code: created.room.code })
  assert.equal(joined.ok, true, joined.error)
  const started = await emitAck(hostSocket, 'game:start', { code: created.room.code })
  assert.equal(started.ok, true, started.error)
  await waitForState(() => liveGame, (game) => game.status === 'playing')
  const wrongTurn = await emitAck(guestSocket, 'game:roll', { code: created.room.code })
  assert.equal(wrongTurn.ok, false, 'server must reject a roll from the wrong player')
  hostSocket.disconnect()
  hostSocket = await connect(host.token, SECOND_SOCKET)
  hostSocket.on('game:state', onGameState)
  const resumed = await emitAck(hostSocket, 'room:join', { code: created.room.code })
  assert.equal(resumed.ok, true, 'a disconnected player should be able to rejoin their live room')
  assert.equal(resumed.room.status, 'playing')
  const forwardedVoiceSignal = new Promise((resolve) => guestSocket.once('voice:signal', resolve))
  const voiceSignal = await emitAck(hostSocket, 'voice:signal', { code: created.room.code, to: guest.user.id, signal: { type: 'offer', description: { type: 'offer', sdp: 'test-offer' } } })
  assert.equal(voiceSignal.ok, true, voiceSignal.error)
  assert.equal((await forwardedVoiceSignal).from, host.user.id)
  let checkedInvalidMove = false
  for (let turn = 0; turn < 1500 && liveGame.status !== 'finished'; turn += 1) {
    const playerIndex = liveGame.currentPlayer
    const playerSocket = playerIndex === 0 ? hostSocket : guestSocket
    const versionBeforeRoll = stateVersion
    const rollState = waitForState(() => ({ game: liveGame, version: stateVersion }), ({ game, version }) => version > versionBeforeRoll && game.lastAction?.type === 'roll' && game.lastAction.player === playerIndex)
    const rollResult = await emitAck(playerSocket, 'game:roll', { code: created.room.code })
    assert.equal(rollResult.ok, true, rollResult.error)
    const { game: afterRoll } = await rollState
    if (!checkedInvalidMove) {
      const invalidMove = await emitAck(playerSocket, 'game:move', { code: created.room.code, tokenIndex: 99 })
      assert.equal(invalidMove.ok, false, 'server must reject an invalid token index')
      checkedInvalidMove = true
    }
    if (afterRoll.dice !== null) {
      const tokenIndex = getLegalTokenIds(afterRoll)[0]
      const versionBeforeMove = stateVersion
      const moveState = waitForState(() => ({ game: liveGame, version: stateVersion }), ({ game, version }) => version > versionBeforeMove && game.lastAction?.type === 'move' && game.lastAction.player === playerIndex)
      const moveResult = await emitAck(playerSocket, 'game:move', { code: created.room.code, tokenIndex })
      assert.equal(moveResult.ok, true, moveResult.error)
      await moveState
    }
  }
  assert.equal(liveGame.status, 'finished', 'the complete match should produce a winner')
  const historyResponse = await fetch(`${API}/arena/history`, { headers: authHeader })
  assert.equal(historyResponse.status, 200)
  const history = (await historyResponse.json()).history
  assert.ok(history.length > 0, 'finished matches should be recorded')
  const guestDashboardResponse = await fetch(`${API}/arena/dashboard`, { headers: { authorization: `Bearer ${guest.token}` } })
  const hostDashboardResponse = await fetch(`${API}/arena/dashboard`, { headers: authHeader })
  const guestDashboard = await guestDashboardResponse.json()
  const hostDashboard = await hostDashboardResponse.json()
  assert.equal(hostDashboard.user.matchesPlayed, 1)
  assert.equal(guestDashboard.user.matchesPlayed, 1)
  assert.equal(hostDashboard.user.wins + guestDashboard.user.wins, 1, 'exactly one winner should be recorded')
  const winnerToken = hostDashboard.user.wins ? host.token : guest.token
  const winnerChallengeResponse = await fetch(`${API}/arena/challenges/daily`, { headers: { authorization: `Bearer ${winnerToken}` } })
  const winnerChallenge = await winnerChallengeResponse.json()
  assert.equal(winnerChallenge.challenge.progress, 1, 'a match win should advance the winner daily challenge')
  const inviteRoom = await emitAck(hostSocket, 'room:create')
  assert.equal(inviteRoom.ok, true)
  const teammateAuth = { authorization: `Bearer ${teammate.token}`, 'content-type': 'application/json' }
  const firstInvitePush = new Promise((resolve) => teammateSocket.once('arena:invite', resolve))
  const firstInvite = await emitAck(hostSocket, 'room:invite', { code: inviteRoom.room.code, recipientId: teammate.user.id })
  assert.equal(firstInvite.ok, true, firstInvite.error)
  assert.equal((await firstInvitePush).roomCode, inviteRoom.room.code)
  const disableInvites = await fetch(`${API}/arena/settings`, { method: 'PATCH', headers: teammateAuth, body: JSON.stringify({ allowFriendInvites: false }) })
  assert.equal(disableInvites.status, 200)
  assert.equal((await disableInvites.json()).settings.allowFriendInvites, false)
  const hiddenInvites = await fetch(`${API}/community/invites`, { headers: { authorization: `Bearer ${teammate.token}` } })
  assert.deepEqual((await hiddenInvites.json()).invites, [], 'disabled invitations must not be shown in the inbox')
  const dismissedInvite = await fetch(`${API}/community/invites/${firstInvite.invitation.id}`, { method: 'PATCH', headers: teammateAuth, body: JSON.stringify({ action: 'accept' }) })
  assert.equal(dismissedInvite.status, 403, 'the server must block invite actions while invitations are disabled')
  const blockedInvite = await emitAck(hostSocket, 'room:invite', { code: inviteRoom.room.code, recipientId: teammate.user.id })
  assert.equal(blockedInvite.ok, false, 'server must enforce the recipient invitation preference')
  const enableInvites = await fetch(`${API}/arena/settings`, { method: 'PATCH', headers: teammateAuth, body: JSON.stringify({ allowFriendInvites: true }) })
  assert.equal(enableInvites.status, 200)
  const clearedInvites = await fetch(`${API}/community/invites`, { headers: { authorization: `Bearer ${teammate.token}` } })
  assert.deepEqual((await clearedInvites.json()).invites, [], 'turning invitations off should dismiss existing pending invites')
  const invitePush = new Promise((resolve) => teammateSocket.once('arena:invite', resolve))
  const inviteSent = await emitAck(hostSocket, 'room:invite', { code: inviteRoom.room.code, recipientId: teammate.user.id })
  assert.equal(inviteSent.ok, true, inviteSent.error)
  assert.equal((await invitePush).roomCode, inviteRoom.room.code)
  const inviteListResponse = await fetch(`${API}/community/invites`, { headers: { authorization: `Bearer ${teammate.token}` } })
  assert.equal(inviteListResponse.status, 200)
  const inviteList = await inviteListResponse.json()
  const pendingInvite = inviteList.invites.find((invite) => invite.roomCode === inviteRoom.room.code)
  assert.ok(pendingInvite)
  const acceptedInvite = await fetch(`${API}/community/invites/${pendingInvite._id}`, { method: 'PATCH', headers: teammateAuth, body: JSON.stringify({ action: 'accept' }) })
  assert.equal(acceptedInvite.status, 200)
  assert.equal((await emitAck(teammateSocket, 'room:join', { code: inviteRoom.room.code })).ok, true)
  const teamRoom = await emitAck(hostSocket, 'room:create', { mode: 'team' })
  assert.equal(teamRoom.ok, true)
  assert.equal(teamRoom.room.mode, 'team')
  assert.equal((await emitAck(guestSocket, 'room:join', { code: teamRoom.room.code })).ok, true)
  const prematureTeamStart = await emitAck(hostSocket, 'game:start', { code: teamRoom.room.code })
  assert.equal(prematureTeamStart.ok, false, '2v2 rooms must wait until all four seats are filled')
  assert.equal((await emitAck(spectatorSocket, 'room:join', { code: teamRoom.room.code })).ok, true)
  assert.equal((await emitAck(teammateSocket, 'room:join', { code: teamRoom.room.code })).ok, true)
  const teamStart = await emitAck(hostSocket, 'game:start', { code: teamRoom.room.code })
  assert.equal(teamStart.ok, true, teamStart.error)
  await waitForState(() => liveGame, (game) => game.teamMode === true)
  assert.equal(liveGame.players.length, 4)
  const queued = await emitAck(hostSocket, 'matchmaking:join')
  assert.equal(queued.ok, true)
  assert.equal(queued.waiting, true)
  const paired = await emitAck(guestSocket, 'matchmaking:join')
  assert.equal(paired.ok, true, paired.error)
  assert.equal(paired.room.status, 'playing')
  assert.equal(paired.room.mode, 'online')
  const spectatorJoin = await emitAck(spectatorSocket, 'room:spectate', { code: paired.room.code })
  assert.equal(spectatorJoin.ok, true, spectatorJoin.error)
  assert.equal((await emitAck(hostSocket, 'matchmaking:join', { mode: 'team' })).waiting, true)
  assert.equal((await emitAck(guestSocket, 'matchmaking:join', { mode: 'team' })).waiting, true)
  assert.equal((await emitAck(spectatorSocket, 'matchmaking:join', { mode: 'team' })).waiting, true)
  const teamMatch = await emitAck(teammateSocket, 'matchmaking:join', { mode: 'team' })
  assert.equal(teamMatch.ok, true, teamMatch.error)
  assert.equal(teamMatch.room.mode, 'team')
  assert.equal(teamMatch.room.players.length, 4)
  assert.equal(teamMatch.room.status, 'playing')
  const chat = await emitAck(hostSocket, 'game:chat', { code: created.room.code, text: 'smoke test' })
  assert.equal(chat.ok, true, chat.error)
  for (let index = 0; index < 7; index += 1) {
    const allowedChat = await emitAck(hostSocket, 'game:chat', { code: created.room.code, text: `rate check ${index}` })
    assert.equal(allowedChat.ok, true, allowedChat.error)
  }
  const spamChat = await emitAck(hostSocket, 'game:chat', { code: created.room.code, text: 'this one should be throttled' })
  assert.equal(spamChat.ok, false, 'socket chat must have a per-player rate limit')
  const reaction = await emitAck(hostSocket, 'game:reaction', { code: created.room.code, emoji: '👏' })
  assert.equal(reaction.ok, true, reaction.error)
  const chatHistoryResponse = await fetch(`${API}/chat/${created.room.code}/messages`, { headers: authHeader })
  assert.equal(chatHistoryResponse.status, 200)
  const chatHistory = await chatHistoryResponse.json()
  assert.ok(chatHistory.messages.some((message) => message.text === 'smoke test'))
  assert.ok(chatHistory.messages.some((message) => message.emoji === '👏'))
  const spectatorChatResponse = await fetch(`${API}/chat/${paired.room.code}/messages`, { headers: { authorization: `Bearer ${spectator.token}` } })
  assert.equal(spectatorChatResponse.status, 403, 'spectators cannot read private player chat')
console.log('ONLINE_SMOKE_OK: accounts, virtual rewards, cosmetic purchases/equipment, daily challenges, achievements, tournaments, friend requests/invites, private rooms, 2v2 matchmaking, spectator joins, server-validated match/history, persistent chat, reconnect')
} finally {
  hostSocket.disconnect()
  guestSocket.disconnect()
  spectatorSocket.disconnect()
  teammateSocket.disconnect()
}
