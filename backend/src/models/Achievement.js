import mongoose from 'mongoose'

const achievementSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  coins: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
}, { timestamps: true })

export const Achievement = mongoose.model('Achievement', achievementSchema)
