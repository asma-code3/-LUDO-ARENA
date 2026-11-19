import assert from 'node:assert/strict'
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/database.js'
import { Reward } from '../models/Reward.js'
import { User } from '../models/User.js'
import { UserChallenge } from '../models/UserChallenge.js'
import { getDailyChallenge, recordMatchWinChallenge } from '../services/challenges.js'

await connectDatabase()
const marker = `challenge_${Date.now().toString(36)}`
let user
try {
  user = await User.create({ username: marker, email: `${marker}@example.test`, passwordHash: 'smoke' })
  const initial = await getDailyChallenge(user._id)
  assert.equal(initial.progress, 0)
  assert.equal(initial.goal, 2)

  const firstWin = await recordMatchWinChallenge(user._id)
  assert.equal(firstWin.completed, false)
  assert.equal(firstWin.progress, 1)
  const secondWin = await recordMatchWinChallenge(user._id)
  assert.equal(secondWin.completed, true)
  const repeat = await recordMatchWinChallenge(user._id)
  assert.equal(repeat.completed, true)

  const [updated, progress, rewards] = await Promise.all([
    User.findById(user._id),
    UserChallenge.findOne({ user: user._id }).lean(),
    Reward.find({ user: user._id, kind: 'challenge' }).lean(),
  ])
  assert.equal(progress.progress, 2)
  assert.ok(progress.completedAt)
  assert.equal(rewards.length, 1)
  assert.equal(rewards[0].coins, 300)
  assert.equal(rewards[0].xp, 100)
  assert.equal(updated.coins, 800)
  assert.equal(updated.xp, 100)
  console.log('CHALLENGE_SMOKE_OK: persisted daily progress, completion, idempotent virtual reward')
} finally {
  if (user) {
    await UserChallenge.deleteMany({ user: user._id })
    await Reward.deleteMany({ user: user._id })
    await User.deleteOne({ _id: user._id })
  }
  await mongoose.disconnect()
}
