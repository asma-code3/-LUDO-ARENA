import mongoose from 'mongoose'

const tournamentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  cadence: { type: String, enum: ['daily', 'weekly', 'special'], default: 'daily' },
  seriesKey: { type: String, default: null },
  status: { type: String, enum: ['registration', 'starting', 'in-progress', 'completed'], default: 'registration', index: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date },
  maxPlayers: { type: Number, default: 64, min: 4, max: 1024 },
  entrants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  bracket: [{ room: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRoom' }, round: Number, players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }],
  activeRound: { type: Number, default: 0 },
  advancingRound: { type: Number, default: 0 },
  startLockAt: { type: Date, default: null },
  champion: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

tournamentSchema.index({ seriesKey: 1 }, { unique: true, partialFilterExpression: { seriesKey: { $type: 'string' } } })

export const Tournament = mongoose.model('Tournament', tournamentSchema)
