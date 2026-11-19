import assert from 'node:assert/strict'
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/database.js'
import { GameRoom } from '../models/GameRoom.js'
import { Reward } from '../models/Reward.js'
import { Tournament } from '../models/Tournament.js'
import { User } from '../models/User.js'
import { settleTournamentMatch, startDueTournaments } from '../services/tournaments.js'

await connectDatabase()
const marker = `bracket_${Date.now().toString(36)}`
let accountIds = []
let tournamentId
let roomIds = []
try {
  const accounts = await User.create(Array.from({ length: 4 }, (_, index) => ({
    username: `${marker}${index}`,
    email: `${marker}${index}@example.test`,
    passwordHash: 'smoke',
  })))
  accountIds = accounts.map((account) => account._id)
  const tournament = await Tournament.create({ name: `${marker} Tournament`, cadence: 'special', startsAt: new Date(Date.now() - 1000), entrants: accountIds, maxPlayers: 4 })
  tournamentId = tournament._id
  await startDueTournaments()
  const scheduled = await Tournament.find({ cadence: { $in: ['daily', 'weekly'] }, status: 'registration', startsAt: { $gt: new Date() } }).select('cadence')
  assert.ok(scheduled.some((entry) => entry.cadence === 'daily'))
  assert.ok(scheduled.some((entry) => entry.cadence === 'weekly'))
  let active = await Tournament.findById(tournamentId)
  assert.equal(active.status, 'in-progress')
  assert.equal(active.activeRound, 1)
  assert.equal(active.bracket.length, 2)
  const firstRound = active.bracket.map((entry) => entry.room)
  roomIds.push(...firstRound)
  for (let index = 0; index < firstRound.length; index += 1) {
    const room = await GameRoom.findById(firstRound[index])
    assert.equal(room.mode, 'tournament')
    assert.equal(room.players.length, 2)
    const fakeIo = { to: () => ({ emit: () => {} }) }
    await settleTournamentMatch(room._id, accountIds[index], fakeIo, room.code)
  }

  active = await Tournament.findById(tournamentId)
  assert.equal(active.activeRound, 2)
  assert.equal(active.bracket.length, 3)
  const finalEntry = active.bracket.find((entry) => entry.round === 2)
  assert.ok(finalEntry?.room)
  roomIds.push(finalEntry.room)
  const finalRoom = await GameRoom.findById(finalEntry.room)
  const announcements = []
  const fakeIo = { to: (channel) => ({ emit: (event, payload) => announcements.push({ channel, event, payload }) }) }
  const championId = active.bracket.find((entry) => entry.round === 1).winner
  await settleTournamentMatch(finalRoom._id, championId, fakeIo, finalRoom.code)

  const completed = await Tournament.findById(tournamentId)
  assert.equal(completed.status, 'completed')
  assert.equal(String(completed.champion), String(championId))
  assert.ok(announcements.some((entry) => entry.event === 'tournament:winner'))
  assert.ok(await Reward.exists({ user: championId, kind: 'tournament', sourceId: `tournament:${tournamentId}` }))
  console.log('TOURNAMENT_SMOKE_OK: recurring schedule, semifinal/final advancement, champion announcement, virtual prize')
} finally {
  if (roomIds.length) await GameRoom.deleteMany({ _id: { $in: roomIds } })
  if (tournamentId) await Tournament.deleteOne({ _id: tournamentId })
  if (accountIds.length) {
    await Reward.deleteMany({ user: { $in: accountIds } })
    await User.deleteMany({ _id: { $in: accountIds } })
  }
  await mongoose.disconnect()
}
