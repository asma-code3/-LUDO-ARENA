import mongoose from 'mongoose'

const chatMessageSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRoom', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['text', 'reaction'], required: true },
  text: { type: String, trim: true, maxlength: 280, default: '' },
  emoji: { type: String, maxlength: 16, default: '' },
}, { timestamps: true })

chatMessageSchema.index({ room: 1, createdAt: -1 })

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema)
