import assert from 'node:assert/strict'
import test from 'node:test'
import { withRoomLock } from './distributedLock.js'

test('local room locks serialize commands for the same room', async () => {
  let active = 0
  const order = []
  const operation = (name) => withRoomLock(null, 'ABC123', async () => {
    active += 1
    assert.equal(active, 1)
    order.push(`${name}:start`)
    await new Promise((resolve) => setTimeout(resolve, 10))
    order.push(`${name}:end`)
    active -= 1
  })
  await Promise.all([operation('first'), operation('second')])
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end'])
})

test('local room locks release after a failed command', async () => {
  await assert.rejects(withRoomLock(null, 'FAIL01', async () => { throw new Error('expected') }), /expected/)
  assert.equal(await withRoomLock(null, 'FAIL01', async () => 'recovered'), 'recovered')
})
