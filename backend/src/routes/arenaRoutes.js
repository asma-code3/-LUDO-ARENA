import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { GameHistory } from '../models/GameHistory.js'
import { GameInvite } from '../models/GameInvite.js'
import { Reward } from '../models/Reward.js'
import { Tournament } from '../models/Tournament.js'
import { User } from '../models/User.js'
import { getAchievementCatalog, unlockAchievement } from '../services/rewards.js'
import { levelForXp } from '../services/progression.js'
import { getDailyChallenge } from '../services/challenges.js'
import { COSMETICS, cosmeticField, findCosmetic } from '../services/cosmetics.js'
import { getVoiceIceServers } from '../services/voice.js'

const router = Router()
router.use(requireAuth)

router.get('/dashboard', async (req, res, next) => {
  try {
    const [user, matches, history, friendsOnline] = await Promise.all([
      User.findById(req.userId).select('username avatar boardTheme diceSkin ownedCosmetics allowFriendInvites level xp coins wins matchesPlayed dailyStreak lastDailyRewardAt'),
      GameHistory.countDocuments({ 'players.user': req.userId }),
      GameHistory.find({ 'players.user': req.userId }).sort({ completedAt: -1 }).limit(5).populate('players.user', 'username avatar'),
      User.countDocuments({ _id: { $ne: req.userId }, friends: req.userId, isOnline: true }),
    ])
    if (!user) return res.status(404).json({ error: 'Player account not found.' })
    return res.json({ user, matches: matches || user.matchesPlayed, recentMatches: history, friendsOnline })
  } catch (error) { next(error) }
})

router.patch('/settings', async (req, res, next) => {
  try {
    if (typeof req.body.allowFriendInvites !== 'boolean') return res.status(400).json({ error: 'Choose whether friends can invite you.' })
    const user = await User.findByIdAndUpdate(req.userId, { $set: { allowFriendInvites: req.body.allowFriendInvites } }, { new: true }).select('allowFriendInvites')
    if (!user) return res.status(404).json({ error: 'Player account not found.' })
    if (!user.allowFriendInvites) await GameInvite.updateMany({ recipient: req.userId, status: 'pending' }, { $set: { status: 'dismissed' } })
    return res.json({ settings: { allowFriendInvites: user.allowFriendInvites } })
  } catch (error) { next(error) }
})

router.get('/voice-credentials', (req, res) => {
  return res.json({ iceServers: getVoiceIceServers(req.userId) })
})

router.get('/leaderboard', async (req, res, next) => {
  try {
    const players = await User.find().sort({ xp: -1, wins: -1 }).limit(25).select('username avatar level xp wins')
    return res.json({ players })
  } catch (error) { next(error) }
})

router.get('/cosmetics', async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('coins avatar boardTheme diceSkin ownedCosmetics')
    if (!user) return res.status(404).json({ error: 'Player account not found.' })
    const owned = new Set(user.ownedCosmetics ?? [])
    const equipped = { avatar: user.avatar || 'avatar-default', board: user.boardTheme || 'board-classic', dice: user.diceSkin || 'dice-classic' }
    return res.json({ coins: user.coins, items: COSMETICS.map((item) => ({ ...item, owned: owned.has(item.id) || item.price === 0, equipped: equipped[item.category] === item.id })) })
  } catch (error) { next(error) }
})

router.post('/cosmetics/:itemId/purchase', async (req, res, next) => {
  try {
    const item = findCosmetic(req.params.itemId)
    if (!item || item.price === 0) return res.status(400).json({ error: 'That item cannot be purchased.' })
    const user = await User.findOneAndUpdate(
      { _id: req.userId, coins: { $gte: item.price }, ownedCosmetics: { $ne: item.id } },
      { $inc: { coins: -item.price }, $addToSet: { ownedCosmetics: item.id } },
      { new: true },
    ).select('coins avatar boardTheme diceSkin ownedCosmetics')
    if (user) return res.status(201).json({ user, item })
    const current = await User.findById(req.userId).select('coins ownedCosmetics')
    if (!current) return res.status(404).json({ error: 'Player account not found.' })
    if (current.ownedCosmetics?.includes(item.id)) return res.status(409).json({ error: 'You already own this cosmetic.' })
    return res.status(409).json({ error: 'You need more virtual coins to buy this cosmetic.' })
  } catch (error) { next(error) }
})

router.patch('/cosmetics/equip', async (req, res, next) => {
  try {
    const item = findCosmetic(String(req.body.itemId ?? ''))
    if (!item) return res.status(400).json({ error: 'Choose an available cosmetic.' })
    const field = cosmeticField(item)
    const ownedFilter = item.price === 0 ? {} : { ownedCosmetics: item.id }
    const user = await User.findOneAndUpdate(
      { _id: req.userId, ...ownedFilter },
      { $set: { [field]: item.id } },
      { new: true },
    ).select('coins avatar boardTheme diceSkin ownedCosmetics')
    if (!user) return res.status(403).json({ error: 'Buy this cosmetic before equipping it.' })
    return res.json({ user, item })
  } catch (error) { next(error) }
})

router.get('/tournaments', async (_req, res, next) => {
  try {
    const tournaments = await Tournament.find({ status: { $ne: 'completed' } }).sort({ startsAt: 1 }).limit(30)
      .populate('bracket.players', 'username avatar')
      .populate('bracket.winner', 'username avatar')
      .populate('bracket.room', 'code status')
    return res.json({ tournaments })
  } catch (error) { next(error) }
})

router.get('/history', async (req, res, next) => {
  try {
    const history = await GameHistory.find({ 'players.user': req.userId })
      .sort({ completedAt: -1 }).limit(50).populate('players.user', 'username avatar')
    return res.json({ history })
  } catch (error) { next(error) }
})

router.get('/achievements', async (req, res, next) => {
  try { return res.json({ achievements: await getAchievementCatalog(req.userId) }) }
  catch (error) { next(error) }
})

router.get('/challenges/daily', async (req, res, next) => {
  try { return res.json({ challenge: await getDailyChallenge(req.userId) }) }
  catch (error) { next(error) }
})

router.post('/rewards/daily', async (req, res, next) => {
  try {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const dayKey = today.toISOString().slice(0, 10)
    const result = await Reward.updateOne(
      { user: req.userId, kind: 'daily-login', sourceId: dayKey },
      { $setOnInsert: { coins: 150, xp: 25, claimedAt: new Date() } },
      { upsert: true },
    )
    if (!result.upsertedCount) return res.status(409).json({ error: 'Daily reward already claimed.' })
    const reward = await Reward.findOne({ user: req.userId, kind: 'daily-login', sourceId: dayKey })
    const current = await User.findById(req.userId).select('lastDailyRewardAt dailyStreak')
    const previousDay = new Date(today)
    previousDay.setUTCDate(previousDay.getUTCDate() - 1)
    const wasYesterday = current?.lastDailyRewardAt && new Date(current.lastDailyRewardAt) >= previousDay && new Date(current.lastDailyRewardAt) < today
    const dailyStreak = wasYesterday ? current.dailyStreak + 1 : 1
    const user = await User.findByIdAndUpdate(req.userId, { $inc: { coins: 150, xp: 25 }, $set: { lastDailyRewardAt: new Date(), dailyStreak } }, { new: true }).select('coins xp level dailyStreak')
    if (user && user.level !== levelForXp(user.xp)) {
      user.level = levelForXp(user.xp)
      await user.save()
    }
    if (dailyStreak >= 5) await unlockAchievement(req.userId, 'five-day-streak')
    return res.status(201).json({ reward, user })
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'Daily reward already claimed.' })
    next(error)
  }
})

export default router
