import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { ChatMessage } from '../models/ChatMessage.js'
import { GameRoom } from '../models/GameRoom.js'

const router = Router()
router.use(requireAuth)

router.get('/:code/messages', async (req, res, next) => {
  try {
    const code = String(req.params.code ?? '').trim().toUpperCase()
    if (!/^[A-F0-9]{6}$/.test(code)) return res.status(400).json({ error: 'Room code is invalid.' })
    const room = await GameRoom.findOne({ code }).select('_id players.user')
    if (!room) return res.status(404).json({ error: 'Room not found.' })
    if (!room.players.some((player) => String(player.user) === req.userId)) return res.status(403).json({ error: 'Only room players can view its chat.' })
    const records = await ChatMessage.find({ room: room._id }).sort({ createdAt: -1 }).limit(50).populate('sender', 'username').lean()
    const messages = records.reverse().map((record) => ({
      id: String(record._id),
      player: record.sender?.username ?? 'Player',
      ...(record.kind === 'reaction' ? { emoji: record.emoji } : { text: record.text }),
      sentAt: record.createdAt.toISOString(),
    }))
    return res.json({ messages })
  } catch (error) { next(error) }
})

export default router
