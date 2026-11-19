import 'dotenv/config'
import { connectDatabase } from '../config/database.js'
import { Achievement } from '../models/Achievement.js'
import { Tournament } from '../models/Tournament.js'

await connectDatabase()
const now = new Date()
const dailyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 0, 0, 0))
if (dailyStart <= now) dailyStart.setUTCDate(dailyStart.getUTCDate() + 1)
const weeklyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18, 0, 0, 0))
weeklyStart.setUTCDate(weeklyStart.getUTCDate() + ((6 - now.getUTCDay() + 7) % 7))
if (weeklyStart <= now) weeklyStart.setUTCDate(weeklyStart.getUTCDate() + 7)
const dailyKey = `daily:${dailyStart.toISOString().slice(0, 10)}`
const weeklyKey = `weekly:${weeklyStart.toISOString().slice(0, 10)}`

await Tournament.updateOne({ seriesKey: dailyKey }, { $setOnInsert: { seriesKey: dailyKey, name: `Daily Dash · ${dailyStart.toISOString().slice(0, 10)}`, cadence: 'daily', status: 'registration', startsAt: dailyStart, endsAt: new Date(dailyStart.getTime() + 60 * 60 * 1000), maxPlayers: 64 } }, { upsert: true })
await Tournament.updateOne({ seriesKey: weeklyKey }, { $setOnInsert: { seriesKey: weeklyKey, name: `Weekend Showdown · ${weeklyStart.toISOString().slice(0, 10)}`, cadence: 'weekly', status: 'registration', startsAt: weeklyStart, endsAt: new Date(weeklyStart.getTime() + 3 * 60 * 60 * 1000), maxPlayers: 128 } }, { upsert: true })
await Achievement.bulkWrite([
  { updateOne: { filter: { key: 'first-win' }, update: { $setOnInsert: { key: 'first-win', name: 'First Victory', description: 'Win your first Ludo Arena match.', coins: 100, xp: 100 } }, upsert: true } },
  { updateOne: { filter: { key: 'ten-matches' }, update: { $setOnInsert: { key: 'ten-matches', name: 'Getting Warm', description: 'Play ten matches in the arena.', coins: 250, xp: 250 } }, upsert: true } },
  { updateOne: { filter: { key: 'five-day-streak' }, update: { $setOnInsert: { key: 'five-day-streak', name: 'On a Roll', description: 'Claim daily rewards for five days in a row.', coins: 300, xp: 300 } }, upsert: true } },
])
console.info('Seeded the daily/weekly tournaments and achievement catalog.')
process.exit(0)
