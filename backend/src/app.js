import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/authRoutes.js'
import arenaRoutes from './routes/arenaRoutes.js'
import communityRoutes from './routes/communityRoutes.js'
import tournamentRoutes from './routes/tournamentRoutes.js'
import chatRoutes from './routes/chatRoutes.js'
import { getAllowedOrigins } from './config/origins.js'

export function createApp({ readiness = () => ({ api: true }) } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: getAllowedOrigins(), credentials: true }))
  app.use(express.json({ limit: '32kb' }))
  app.get('/api/health', async (_req, res) => {
    try {
      const checks = await readiness()
      const ready = Object.values(checks).every(Boolean)
      return res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'not-ready', service: 'ludo-arena-api', checks })
    } catch {
      return res.status(503).json({ status: 'not-ready', service: 'ludo-arena-api' })
    }
  })
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), authRoutes)
  app.use('/api/arena', arenaRoutes)
  app.use('/api/community', communityRoutes)
  app.use('/api/tournaments', tournamentRoutes)
  app.use('/api/chat', chatRoutes)
  app.use((error, _req, res, _next) => {
    console.error(error)
    return res.status(500).json({ error: 'The arena hit an unexpected error.' })
  })
  return app
}
