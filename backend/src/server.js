import 'dotenv/config'
import { createServer } from 'node:http'
import mongoose from 'mongoose'
import Redis from 'ioredis'
import { createApp } from './app.js'
import { connectDatabase } from './config/database.js'
import { attachGameSockets } from './sockets/gameSocket.js'
import { startDueTournaments } from './services/tournaments.js'

const port = Number(process.env.PORT ?? 4000)
let redis = null
let redisSub = null
let socketIo = null
let tournamentTimer = null
let isShuttingDown = false
const app = createApp({
  readiness: () => ({
    database: mongoose.connection.readyState === 1,
    ...(process.env.REDIS_URL ? { redis: redis?.status === 'ready' && redisSub?.status === 'ready' } : {}),
  }),
})
const server = createServer(app)

try {
  validateEnvironment()
  await connectDatabase()
  redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, connectTimeout: 8_000 }) : null
  redisSub = redis?.duplicate()
  if (redis && redisSub) await Promise.all([redis.ping(), redisSub.ping()])
  await startDueTournaments()
  tournamentTimer = setInterval(() => { startDueTournaments().catch((error) => console.error('Tournament scheduler error:', error.message)) }, 30_000)
  tournamentTimer.unref?.()
  socketIo = await attachGameSockets(server, { redis, redisSub })
  server.listen(port, () => console.info(`Ludo Arena API listening on http://localhost:${port}`))
} catch (error) {
  console.error('Could not start Ludo Arena API:', error.message)
  redisSub?.disconnect()
  redis?.disconnect()
  await mongoose.disconnect()
  process.exitCode = 1
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

async function shutdown() {
  if (isShuttingDown) return
  isShuttingDown = true
  if (tournamentTimer) clearInterval(tournamentTimer)
  if (socketIo) await new Promise((resolve) => socketIo.close(resolve))
  else if (server.listening) await new Promise((resolve) => server.close(resolve))
  await Promise.all([redisSub?.quit().catch(() => {}), redis?.quit().catch(() => {})])
  await mongoose.disconnect()
}

function validateEnvironment() {
  const production = process.env.NODE_ENV === 'production'
  const secret = process.env.JWT_SECRET ?? ''
  const origins = String(process.env.CLIENT_ORIGIN ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.')
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.')
  if (production && !process.env.REDIS_URL) console.warn('REDIS_URL is unset; this API instance will use local matchmaking and Socket.IO state.')
  if (secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.')
  if (Boolean(process.env.TURN_URL) !== Boolean(process.env.TURN_SHARED_SECRET)) throw new Error('Configure both TURN_URL and TURN_SHARED_SECRET, or leave both unset.')
  if (process.env.TURN_URL && process.env.TURN_URL.split(',').some((url) => !/^turns?:/i.test(url.trim()))) throw new Error('TURN_URL entries must use turn: or turns:.')
  if (process.env.TURN_SHARED_SECRET && process.env.TURN_SHARED_SECRET.length < 32) throw new Error('TURN_SHARED_SECRET must contain at least 32 characters.')
  if (production && /^(replace|change-me|your-)/i.test(secret)) throw new Error('Set a private JWT_SECRET before production startup.')
  if (production && (origins.length === 0 || origins.some((origin) => !origin.startsWith('https://')))) throw new Error('Production CLIENT_ORIGIN values must be explicit HTTPS origins.')
}
