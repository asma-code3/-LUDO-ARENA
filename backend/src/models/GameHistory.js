import mongoose from 'mongoose'

const gameHistorySchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRoom' },
  players: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, placement: Number, coinsEarned: Number }],
  mode: { type: String, required: true },
  durationSeconds: { type: Number, default: 0 },
  completedAt: { type: Date, default: Date.now },
}, { timestamps: true })

export const GameHistory = mongoose.model('GameHistory', gameHistorySchema)
