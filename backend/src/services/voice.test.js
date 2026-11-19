import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { getVoiceIceServers } from './voice.js'

test('voice ICE config provides STUN fallback and expiring TURN REST credentials', () => {
  const previousUrl = process.env.TURN_URL
  const previousSecret = process.env.TURN_SHARED_SECRET
  process.env.TURN_URL = 'turn:turn.example.test:3478?transport=udp, turns:turn.example.test:5349'
  process.env.TURN_SHARED_SECRET = 'test-turn-shared-secret'
  try {
    const now = 1_800_000_000_000
    const [stun, turn] = getVoiceIceServers('player-id', now)
    const expectedUsername = `${Math.floor(now / 1000) + 3600}:player-id`
    assert.equal(stun.urls, 'stun:stun.l.google.com:19302')
    assert.deepEqual(turn.urls, ['turn:turn.example.test:3478?transport=udp', 'turns:turn.example.test:5349'])
    assert.equal(turn.username, expectedUsername)
    assert.equal(turn.credential, createHmac('sha1', 'test-turn-shared-secret').update(expectedUsername).digest('base64'))
  } finally {
    if (previousUrl === undefined) delete process.env.TURN_URL
    else process.env.TURN_URL = previousUrl
    if (previousSecret === undefined) delete process.env.TURN_SHARED_SECRET
    else process.env.TURN_SHARED_SECRET = previousSecret
  }
})
