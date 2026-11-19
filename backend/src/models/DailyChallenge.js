import mongoose from 'mongoose'

const dailyChallengeSchema = new mongoose.Schema({
  key: { type: String, required: true },
  dateKey: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  goal: { type: Number, min: 1, required: true },
  coins: { type: Number, min: 0, required: true },
  xp: { type: Number, min: 0, required: true },
}, { timestamps: true })

dailyChallengeSchema.index({ key: 1, dateKey: 1 }, { unique: true })

export const DailyChallenge = mongoose.model('DailyChallenge', dailyChallengeSchema)
