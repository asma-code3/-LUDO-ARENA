import mongoose from 'mongoose'

const userChallengeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  challenge: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyChallenge', required: true },
  progress: { type: Number, min: 0, default: 0 },
  completedAt: { type: Date, default: null },
}, { timestamps: true })

userChallengeSchema.index({ user: 1, challenge: 1 }, { unique: true })

export const UserChallenge = mongoose.model('UserChallenge', userChallengeSchema)
