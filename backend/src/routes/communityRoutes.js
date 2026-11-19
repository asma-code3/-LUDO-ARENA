import { Router } from 'express'
import mongoose from 'mongoose'
import { requireAuth } from '../middleware/auth.js'
import { Friend } from '../models/Friend.js'
import { User } from '../models/User.js'
import { GameInvite } from '../models/GameInvite.js'
import { GameRoom } from '../models/GameRoom.js'

const router = Router()
router.use(requireAuth)

router.get('/friends', async (req, res, next) => {
  try {
    const friendships = await Friend.find({ status: 'accepted', $or: [{ requester: req.userId }, { recipient: req.userId }] })
      .populate('requester', 'username avatar level xp isOnline lastSeenAt')
      .populate('recipient', 'username avatar level xp isOnline lastSeenAt')
      .sort({ updatedAt: -1 })
    const friends = friendships.map((friendship) => String(friendship.requester._id) === req.userId ? friendship.recipient : friendship.requester)
    return res.json({ friends })
  } catch (error) { next(error) }
})

router.get('/requests', async (req, res, next) => {
  try {
    const [incoming, outgoing] = await Promise.all([
      Friend.find({ recipient: req.userId, status: 'pending' }).populate('requester', 'username avatar level').sort({ createdAt: -1 }),
      Friend.find({ requester: req.userId, status: 'pending' }).populate('recipient', 'username avatar level').sort({ createdAt: -1 }),
    ])
    return res.json({ incoming, outgoing })
  } catch (error) { next(error) }
})

router.get('/invites', async (req, res, next) => {
  try {
    const recipient = await User.findById(req.userId).select('allowFriendInvites')
    if (!recipient || recipient.allowFriendInvites === false) return res.json({ invites: [] })
    const invites = await GameInvite.find({ recipient: req.userId, status: 'pending', expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 }).limit(20).populate('sender', 'username avatar').populate('room', 'status mode')
    return res.json({ invites })
  } catch (error) { next(error) }
})

router.patch('/invites/:inviteId', async (req, res, next) => {
  try {
    const recipient = await User.findById(req.userId).select('allowFriendInvites')
    if (!recipient || recipient.allowFriendInvites === false) return res.status(403).json({ error: 'This player is not accepting friend invites.' })
    const action = req.body.action
    if (!['accept', 'dismiss'].includes(action)) return res.status(400).json({ error: 'Choose accept or dismiss.' })
    const invite = await GameInvite.findOne({ _id: req.params.inviteId, recipient: req.userId, status: 'pending', expiresAt: { $gt: new Date() } })
    if (!invite) return res.status(404).json({ error: 'Invite not found or expired.' })
    if (action === 'accept') {
      const room = await GameRoom.findById(invite.room).select('status players')
      if (!room || room.status !== 'waiting' || room.players.length >= 2 || room.players.some((player) => String(player.user) === req.userId)) {
        return res.status(409).json({ error: 'That room has already started or filled up.' })
      }
    }
    invite.status = action === 'accept' ? 'accepted' : 'dismissed'
    await invite.save()
    return res.json({ invite })
  } catch (error) { next(error) }
})

router.get('/search', async (req, res, next) => {
  try {
    const query = String(req.query.q ?? '').trim()
    if (query.length < 2) return res.json({ players: [] })
    const players = await User.find({ _id: { $ne: req.userId }, username: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }).limit(10).select('username avatar level xp')
    return res.json({ players })
  } catch (error) { next(error) }
})

router.post('/requests/:userId', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId) || req.params.userId === req.userId) return res.status(400).json({ error: 'Choose another player.' })
    const target = await User.findById(req.params.userId).select('_id')
    if (!target) return res.status(404).json({ error: 'Player not found.' })
    const alreadyFriends = await Friend.exists({ status: 'accepted', $or: [{ requester: req.userId, recipient: target.id }, { requester: target.id, recipient: req.userId }] })
    if (alreadyFriends) return res.status(409).json({ error: 'You are already friends.' })
    const reciprocal = await Friend.findOne({ requester: target.id, recipient: req.userId, status: 'pending' })
    if (reciprocal) {
      reciprocal.status = 'accepted'
      await reciprocal.save()
      await Promise.all([
        User.updateOne({ _id: req.userId }, { $addToSet: { friends: target.id } }),
        User.updateOne({ _id: target.id }, { $addToSet: { friends: req.userId } }),
      ])
      return res.json({ accepted: true, request: reciprocal })
    }
    const request = await Friend.findOneAndUpdate(
      { requester: req.userId, recipient: target.id },
      { $set: { status: 'pending' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
    if (request.status === 'accepted') return res.status(409).json({ error: 'You are already friends.' })
    return res.status(201).json({ request })
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'A request already exists.' })
    next(error)
  }
})

router.patch('/requests/:requestId', async (req, res, next) => {
  try {
    const accept = req.body.accept === true
    const request = await Friend.findOneAndUpdate(
      { _id: req.params.requestId, recipient: req.userId, status: 'pending' },
      { $set: { status: accept ? 'accepted' : 'declined' } },
      { new: true },
    )
    if (!request) return res.status(404).json({ error: 'Friend request not found.' })
    if (accept) await Promise.all([
      User.updateOne({ _id: request.requester }, { $addToSet: { friends: request.recipient } }),
      User.updateOne({ _id: request.recipient }, { $addToSet: { friends: request.requester } }),
    ])
    return res.json({ request })
  } catch (error) { next(error) }
})

router.delete('/friends/:userId', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId) || req.params.userId === req.userId) return res.status(400).json({ error: 'Invalid friend account.' })
    await Friend.deleteMany({ status: 'accepted', $or: [{ requester: req.userId, recipient: req.params.userId }, { requester: req.params.userId, recipient: req.userId }] })
    await Promise.all([
      User.updateOne({ _id: req.userId }, { $pull: { friends: req.params.userId } }),
      User.updateOne({ _id: req.params.userId }, { $pull: { friends: req.userId } }),
    ])
    return res.status(204).end()
  } catch (error) { next(error) }
})

export default router
