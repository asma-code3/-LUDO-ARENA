import mongoose from 'mongoose'

const gameInviteSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRoom', required: true },
  roomCode: { type: String, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'dismissed'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true })

gameInviteSchema.index({ recipient: 1, room: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } })
gameInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const GameInvite = mongoose.model('GameInvite', gameInviteSchema)
