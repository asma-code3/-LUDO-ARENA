import assert from 'node:assert/strict'
import test from 'node:test'
import { joinSharedMatchmakingQueue, leaveSharedMatchmakingQueue, requeueSharedMatchmakingPlayers } from './matchmakingQueue.js'

test('shared matchmaking queue parses a Redis match and uses same-slot queue keys', async () => {
  const candidate = { userId: 'player-1', socketId: 'socket-1', username: 'One', mode: 'online', enqueuedAt: 100 }
  const calls = []
  const redis = { eval: async (...args) => { calls.push(args); return [1, JSON.stringify(candidate)] } }
  const result = await joinSharedMatchmakingQueue(redis, { userId: 'player-2', socketId: 'socket-2', username: 'Two', mode: 'online', playersNeeded: 1 })
  assert.equal(result.waiting, false)
  assert.deepEqual(result.candidates, [candidate])
  assert.equal(calls[0][1], 3)
  assert.ok(calls[0][2].includes('{ludo}'))
  assert.ok(calls[0][3].includes('{ludo}'))
  assert.ok(calls[0][4].includes('{ludo}'))
})

test('queue cleanup and recovery scripts receive the correct player identities', async () => {
  const calls = []
  const redis = { eval: async (...args) => { calls.push(args); return 1 } }
  await leaveSharedMatchmakingQueue(redis, 'player-1', 'socket-1')
  await requeueSharedMatchmakingPlayers(redis, [{ userId: 'player-2', socketId: 'socket-2', username: 'Two', mode: 'team' }])
  assert.equal(calls[0][1], 3)
  assert.equal(calls[0].at(-2), 'player-1')
  assert.equal(calls[0].at(-1), 'socket-1')
  assert.equal(calls[1][1], 3)
  assert.equal(JSON.parse(calls[1].at(-1)).userId, 'player-2')
})
