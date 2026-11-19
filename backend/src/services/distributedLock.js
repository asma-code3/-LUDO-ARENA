import { randomBytes } from 'node:crypto'

const localLocks = new Map()
const RELEASE_LOCK_SCRIPT = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end"

export async function withRoomLock(redis, roomCode, operation) {
  const key = `arena:{ludo}:room-lock:${roomCode}`
  if (!redis) return withLocalLock(key, operation)

  const token = randomBytes(18).toString('hex')
  const until = Date.now() + 8_000
  while (Date.now() < until) {
    const acquired = await redis.set(key, token, 'PX', 30_000, 'NX')
    if (acquired === 'OK') {
      try { return await operation() }
      finally { await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token).catch(() => {}) }
    }
    await new Promise((resolve) => setTimeout(resolve, 35 + Math.floor(Math.random() * 25)))
  }
  throw new Error('This room is busy. Please retry your move.')
}

async function withLocalLock(key, operation) {
  const previous = localLocks.get(key) ?? Promise.resolve()
  let unlock
  const current = new Promise((resolve) => { unlock = resolve })
  const tail = previous.then(() => current)
  localLocks.set(key, tail)
  await previous
  try { return await operation() }
  finally {
    unlock()
    if (localLocks.get(key) === tail) localLocks.delete(key)
  }
}
