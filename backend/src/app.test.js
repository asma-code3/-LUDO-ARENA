import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp } from './app.js'

test('health endpoint reports API status', async () => {
  const server = createServer(createApp())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok', service: 'ludo-arena-api', checks: { api: true } })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('health endpoint reports unavailable dependencies as not ready', async () => {
  const server = createServer(createApp({ readiness: () => ({ database: true, redis: false }) }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { status: 'not-ready', service: 'ludo-arena-api', checks: { database: true, redis: false } })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('arena data routes require authentication', async () => {
  const server = createServer(createApp())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/arena/dashboard`)
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Sign in to continue.' })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
