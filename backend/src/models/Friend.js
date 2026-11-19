import mongoose from 'mongoose'

const friendSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending', index: true },
}, { timestamps: true })
friendSchema.index({ requester: 1, recipient: 1 }, { unique: true })

export const Friend = mongoose.model('Friend', friendSchema)
