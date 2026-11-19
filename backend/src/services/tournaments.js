import { randomBytes, randomInt } from 'node:crypto'
import { GameRoom } from '../models/GameRoom.js'
import { Tournament } from '../models/Tournament.js'
import { User } from '../models/User.js'
import { Reward } from '../models/Reward.js'
import { levelForXp } from './progression.js'

const seatColors = ['coral', 'green', 'gold', 'blue']

export async function startDueTournaments() {
  await ensureTournamentSchedule()
  const staleLock = new Date(Date.now() - 5 * 60 * 1000)
  await Tournament.updateMany({ status: 'starting', $or: [{ startLockAt: { $lt: staleLock } }, { startLockAt: null }] }, { $set: { status: 'registration' }, $unset: { startLockAt: 1 } })
  const due = await Tournament.find({ status: 'registration', startsAt: { $lte: new Date() } }).select('_id')
  for (const entry of due) {
    const locked = await Tournament.findOneAndUpdate({ _id: entry._id, status: 'registration' }, { $set: { status: 'starting', startLockAt: new Date() } }, { new: true })
    if (!locked) continue
    try {
      const tournament = await Tournament.findById(locked._id).select('entrants maxPlayers')
      const entrants = shuffle(tournament.entrants).slice(0, tournament.maxPlayers)
      if (entrants.length < 2) {
        await Tournament.updateOne({ _id: locked._id }, { $set: { status: 'completed', endsAt: new Date() }, $unset: { startLockAt: 1 } })
        continue
      }
      const bracket = await makeRound(locked._id, 1, entrants)
      await Tournament.updateOne({ _id: locked._id, status: 'starting' }, { $set: { status: 'in-progress', activeRound: 1, advancingRound: 0, bracket }, $unset: { startLockAt: 1 } })
    } catch (error) {
      await Tournament.updateOne({ _id: locked._id, status: 'starting' }, { $set: { status: 'registration' }, $unset: { startLockAt: 1 } })
      throw error
    }
  }
}

export async function ensureTournamentSchedule(now = new Date()) {
  for (const cadence of ['daily', 'weekly']) {
    const upcoming = await Tournament.exists({ cadence, status: 'registration', startsAt: { $gt: now } })
    if (upcoming) continue
    const startsAt = nextStart(cadence, now)
    const date = startsAt.toISOString().slice(0, 10)
    const seriesKey = `${cadence}:${date}`
    const duration = cadence === 'daily' ? 60 * 60 * 1000 : 3 * 60 * 60 * 1000
    const name = cadence === 'daily' ? `Daily Dash · ${date}` : `Weekend Showdown · ${date}`
    try {
      await Tournament.updateOne(
        { seriesKey },
        { $setOnInsert: { seriesKey, name, cadence, status: 'registration', startsAt, endsAt: new Date(startsAt.getTime() + duration), maxPlayers: cadence === 'daily' ? 64 : 128 } },
        { upsert: true },
      )
    } catch (error) {
      if (error?.code !== 11000) throw error
    }
  }
}

export async function settleTournamentMatch(roomId, winnerId, io, roomCode) {
  const tournamentId = (await Tournament.findOne({ 'bracket.room': roomId }).select('_id'))?._id
  if (!tournamentId) return
  await Tournament.updateOne({ _id: tournamentId, 'bracket.room': roomId, 'bracket.winner': null }, { $set: { 'bracket.$.winner': winnerId } })
  const tournament = await Tournament.findById(tournamentId)
  if (!tournament || tournament.status !== 'in-progress') return
  const roundEntries = tournament.bracket.filter((entry) => entry.round === tournament.activeRound)
  if (!roundEntries.length || roundEntries.some((entry) => !entry.winner)) return
  const lock = await Tournament.updateOne({ _id: tournament._id, advancingRound: { $lt: tournament.activeRound } }, { $set: { advancingRound: tournament.activeRound } })
  if (!lock.modifiedCount) return
  const winners = roundEntries.map((entry) => entry.winner)
  if (winners.length === 1) {
    const champion = await User.findById(winners[0]).select('username')
    await Tournament.updateOne({ _id: tournament._id }, { $set: { status: 'completed', champion: winners[0], endsAt: new Date() } })
    const winner = await User.findByIdAndUpdate(winners[0], { $inc: { coins: 1000, xp: 500 } }, { new: true }).select('level xp')
    if (winner && winner.level !== levelForXp(winner.xp)) {
      winner.level = levelForXp(winner.xp)
      await winner.save()
    }
    await Reward.updateOne({ user: winners[0], kind: 'tournament', sourceId: `tournament:${tournament.id}` }, { $setOnInsert: { coins: 1000, xp: 500 } }, { upsert: true })
    const announcement = { tournamentId: tournament.id, champion: champion?.username ?? 'Champion' }
    io.to(`tournament:${tournament.id}`).emit('tournament:winner', announcement)
    io.to(roomCode).emit('tournament:winner', announcement)
    return
  }
  const nextRound = tournament.activeRound + 1
  const entries = await makeRound(tournament._id, nextRound, winners)
  await Tournament.updateOne({ _id: tournament._id }, { $set: { activeRound: nextRound }, $push: { bracket: { $each: entries } } })
  const update = { tournamentId: tournament.id, round: nextRound }
  io.to(`tournament:${tournament.id}`).emit('tournament:round', update)
  io.to(roomCode).emit('tournament:round', update)
}

async function makeRound(tournamentId, round, entrants) {
  const bracket = []
  for (let index = 0; index < entrants.length; index += 2) {
    const players = entrants.slice(index, index + 2)
    if (players.length === 1) {
      bracket.push({ round, players, winner: players[0], room: null })
      continue
    }
    const code = randomBytes(3).toString('hex').toUpperCase()
    const seats = players.map((user, seat) => ({ user, color: seatColors[seat], ready: true }))
    const room = await GameRoom.create({ code, host: players[0], mode: 'tournament', tournament: tournamentId, tournamentRound: round, players: seats })
    bracket.push({ round, players, room: room._id, winner: null })
  }
  return bracket
}

function shuffle(values) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(0, index + 1)
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function nextStart(cadence, now) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), cadence === 'daily' ? 23 : 18, 0, 0, 0))
  if (cadence === 'daily') {
    if (start <= now) start.setUTCDate(start.getUTCDate() + 1)
    return start
  }
  const daysUntilSaturday = (6 - now.getUTCDay() + 7) % 7
  start.setUTCDate(start.getUTCDate() + daysUntilSaturday)
  if (start <= now) start.setUTCDate(start.getUTCDate() + 7)
  return start
}
