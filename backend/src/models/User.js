import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 24, unique: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  avatar: { type: String, default: '' },
  boardTheme: { type: String, default: 'board-classic' },
  diceSkin: { type: String, default: 'dice-classic' },
  ownedCosmetics: { type: [String], default: ['avatar-default', 'board-classic', 'dice-classic'] },
  level: { type: Number, default: 1, min: 1 },
  xp: { type: Number, default: 0, min: 0 },
  coins: { type: Number, default: 500, min: 0 },
  wins: { type: Number, default: 0, min: 0 },
  matchesPlayed: { type: Number, default: 0, min: 0 },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  allowFriendInvites: { type: Boolean, default: true },
  isOnline: { type: Boolean, default: false, index: true },
  lastSeenAt: { type: Date, default: null },
  lastDailyRewardAt: { type: Date, default: null },
  dailyStreak: { type: Number, default: 0, min: 0 },
  achievements: [{ achievement: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement' }, unlockedAt: { type: Date, default: Date.now } }],
}, { timestamps: true })

export const User = mongoose.model('User', userSchema)
