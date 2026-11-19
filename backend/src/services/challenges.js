import { DailyChallenge } from '../models/DailyChallenge.js'
import { Reward } from '../models/Reward.js'
import { User } from '../models/User.js'
import { UserChallenge } from '../models/UserChallenge.js'
import { levelForXp } from './progression.js'

const challengeKey = 'win-two-matches'

export async function getDailyChallenge(userId) {
  const challenge = await ensureDailyChallenge()
  await ensureProgress(userId, challenge._id)
  const progress = await UserChallenge.findOne({ user: userId, challenge: challenge._id }).lean()
  return { ...challenge.toObject(), progress: progress.progress, completedAt: progress.completedAt }
}

export async function recordMatchWinChallenge(userId) {
  const challenge = await ensureDailyChallenge()
  await ensureProgress(userId, challenge._id)
  let progress = await UserChallenge.findOneAndUpdate(
    { user: userId, challenge: challenge._id, completedAt: null, progress: { $lt: challenge.goal } },
    { $inc: { progress: 1 } },
    { new: true },
  )
  if (progress?.progress >= challenge.goal && !progress.completedAt) {
    progress = await UserChallenge.findOneAndUpdate(
      { _id: progress._id, completedAt: null },
      { $set: { completedAt: new Date() } },
      { new: true },
    ) ?? await UserChallenge.findById(progress._id)
  }
  if (!progress) progress = await UserChallenge.findOne({ user: userId, challenge: challenge._id })
  if (!progress || progress.progress < challenge.goal) return { completed: false, progress: progress?.progress ?? 0, goal: challenge.goal }

  const reward = await Reward.updateOne(
    { user: userId, kind: 'challenge', sourceId: `challenge:${challenge.id}` },
    { $setOnInsert: { coins: challenge.coins, xp: challenge.xp } },
    { upsert: true },
  )
  if (reward.upsertedCount) {
    const user = await User.findByIdAndUpdate(userId, { $inc: { coins: challenge.coins, xp: challenge.xp } }, { new: true }).select('coins xp level')
    if (user && user.level !== levelForXp(user.xp)) {
      user.level = levelForXp(user.xp)
      await user.save()
    }
  }
  return { completed: true, progress: challenge.goal, goal: challenge.goal, reward: { coins: challenge.coins, xp: challenge.xp } }
}

async function ensureDailyChallenge() {
  const dateKey = new Date().toISOString().slice(0, 10)
  return DailyChallenge.findOneAndUpdate(
    { key: challengeKey, dateKey },
    { $setOnInsert: { title: 'Daily champion', description: 'Win 2 matches today', goal: 2, coins: 300, xp: 100 } },
    { new: true, upsert: true },
  )
}

async function ensureProgress(userId, challengeId) {
  try {
    await UserChallenge.updateOne({ user: userId, challenge: challengeId }, { $setOnInsert: { progress: 0 } }, { upsert: true })
  } catch (error) {
    if (error?.code !== 11000) throw error
  }
}
