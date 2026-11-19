import { Achievement } from '../models/Achievement.js'
import { Reward } from '../models/Reward.js'
import { User } from '../models/User.js'

export async function unlockAchievement(userId, key) {
  const achievement = await Achievement.findOne({ key })
  if (!achievement) return null
  const update = await User.updateOne(
    { _id: userId, 'achievements.achievement': { $ne: achievement._id } },
    { $push: { achievements: { achievement: achievement._id, unlockedAt: new Date() } }, $inc: { coins: achievement.coins, xp: achievement.xp } },
  )
  if (!update.modifiedCount) return null
  await Reward.create({ user: userId, kind: 'achievement', coins: achievement.coins, xp: achievement.xp, sourceId: `achievement:${key}` })
  return achievement
}

export async function getAchievementCatalog(userId) {
  const [catalog, player] = await Promise.all([
    Achievement.find().sort({ createdAt: 1 }).lean(),
    User.findById(userId).select('achievements').lean(),
  ])
  const unlocked = new Set((player?.achievements ?? []).map((entry) => String(entry.achievement)))
  return catalog.map((entry) => ({ ...entry, unlocked: unlocked.has(String(entry._id)) }))
}
