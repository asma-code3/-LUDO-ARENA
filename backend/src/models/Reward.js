import mongoose from 'mongoose'

const rewardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['daily-login', 'match-win', 'challenge', 'achievement', 'tournament'], required: true },
  coins: { type: Number, min: 0, default: 0 },
  xp: { type: Number, min: 0, default: 0 },
  claimedAt: { type: Date, default: Date.now },
  sourceId: { type: String, default: null },
}, { timestamps: true })
rewardSchema.index({ user: 1, kind: 1, sourceId: 1 }, { unique: true, partialFilterExpression: { sourceId: { $type: 'string' } } })

export const Reward = mongoose.model('Reward', rewardSchema)
