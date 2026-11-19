import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { Tournament } from '../models/Tournament.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (_req, res, next) => {
  try {
    const tournaments = await Tournament.find().sort({ startsAt: 1 }).limit(50)
      .populate('champion', 'username avatar')
      .populate('bracket.players', 'username avatar')
      .populate('bracket.winner', 'username avatar')
      .populate('bracket.room', 'code status')
    return res.json({ tournaments })
  } catch (error) { next(error) }
})

router.post('/:tournamentId/register', async (req, res, next) => {
  try {
    const tournament = await Tournament.findOneAndUpdate(
      { _id: req.params.tournamentId, status: 'registration', startsAt: { $gt: new Date() }, entrants: { $ne: req.userId }, $expr: { $lt: [{ $size: '$entrants' }, '$maxPlayers'] } },
      { $addToSet: { entrants: req.userId } },
      { new: true },
    )
    if (tournament) return res.status(201).json({ tournament })
    const existing = await Tournament.findById(req.params.tournamentId).select('status startsAt entrants maxPlayers')
    if (!existing) return res.status(404).json({ error: 'Tournament not found.' })
    if (existing.entrants.some((id) => String(id) === req.userId)) return res.status(409).json({ error: 'You are already registered.' })
    if (existing.status !== 'registration' || existing.startsAt <= new Date()) return res.status(409).json({ error: 'Registration is closed.' })
    return res.status(409).json({ error: 'Tournament is full.' })
  } catch (error) { next(error) }
})

router.get('/history', async (_req, res, next) => {
  try {
    const tournaments = await Tournament.find({ status: 'completed' }).sort({ endsAt: -1 }).limit(30).populate('champion', 'username avatar')
    return res.json({ tournaments })
  } catch (error) { next(error) }
})

export default router
