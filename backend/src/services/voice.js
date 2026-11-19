import { createHmac } from 'node:crypto'

const STUN_SERVER = { urls: 'stun:stun.l.google.com:19302' }

export function getVoiceIceServers(userId, now = Date.now()) {
  const iceServers = [STUN_SERVER]
  const urls = String(process.env.TURN_URL ?? '').split(',').map((url) => url.trim()).filter(Boolean)
  const secret = process.env.TURN_SHARED_SECRET
  if (!urls.length || !secret) return iceServers

  const username = `${Math.floor(now / 1000) + 3600}:${userId}`
  const credential = createHmac('sha1', secret).update(username).digest('base64')
  iceServers.push({ urls, username, credential })
  return iceServers
}
