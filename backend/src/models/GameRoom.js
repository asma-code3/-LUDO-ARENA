import mongoose from 'mongoose'

const gameRoomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  players: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, color: String, ready: { type: Boolean, default: false } }],
  status: { type: String, enum: ['waiting', 'playing', 'finished'], default: 'waiting', index: true },
  startedAt: { type: Date, default: null },
  mode: { type: String, enum: ['private', 'online', 'team', 'tournament'], default: 'private' },
  playerLimit: { type: Number, enum: [2, 3], default: 2 },
  tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
  tournamentRound: { type: Number, default: null },
  state: { type: mongoose.Schema.Types.Mixed, default: null },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

export const GameRoom = mongoose.model('GameRoom', gameRoomSchema)
