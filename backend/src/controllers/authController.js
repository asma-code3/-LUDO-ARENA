import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { User } from '../models/User.js'

function issueToken(user) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required.')
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, avatar: user.avatar, level: user.level, xp: user.xp, coins: user.coins }
}

export async function register(req, res, next) {
  try {
    const username = String(req.body.username ?? '').trim()
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const password = String(req.body.password ?? '')
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username must be 3–24 letters, numbers, or underscores.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be between 8 and 72 characters.' })
    const duplicate = await User.exists({ $or: [{ email }, { username }] })
    if (duplicate) return res.status(409).json({ error: 'That email or username is already registered.' })
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.create({ username, email, passwordHash })
    return res.status(201).json({ token: issueToken(user), user: publicUser(user) })
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'That email or username is already registered.' })
    next(error)
  }
}

export async function login(req, res, next) {
  try {
    const identity = String(req.body.identity ?? '').trim().toLowerCase()
    const password = String(req.body.password ?? '')
    const user = await User.findOne({ $or: [{ email: identity }, { username: identity }] }).select('+passwordHash')
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Email/username or password is incorrect.' })
    return res.json({ token: issueToken(user), user: publicUser(user) })
  } catch (error) {
    next(error)
  }
}

export async function currentUser(req, res, next) {
  try {
    const user = await User.findById(req.userId).select('username email avatar level xp coins wins matchesPlayed createdAt')
    if (!user) return res.status(404).json({ error: 'Player account not found.' })
    return res.json({ user })
  } catch (error) {
    next(error)
  }
}
