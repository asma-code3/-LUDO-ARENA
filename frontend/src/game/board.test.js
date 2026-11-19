import test from 'node:test'
import assert from 'node:assert/strict'
import { getBoardSeats } from './board.js'

test('two-player matches keep all four board seats while leaving unused colors empty', () => {
  const players = [{ color: 'coral', tokens: [-1, -1, -1, -1] }, { color: 'green', tokens: [0, -1, -1, -1] }]
  const seats = getBoardSeats(players)

  assert.deepEqual(seats.map(({ color }) => color), ['coral', 'green', 'gold', 'blue'])
  assert.equal(seats[0].player, players[0])
  assert.equal(seats[1].player, players[1])
  assert.equal(seats[2].player, null)
  assert.equal(seats[3].player, null)
})

test('four-player matches map each game player to the matching colored board zone', () => {
  const players = ['blue', 'gold', 'coral', 'green'].map((color) => ({ color }))
  const seats = getBoardSeats(players)

  assert.deepEqual(seats.map(({ player }) => player?.color), ['coral', 'green', 'gold', 'blue'])
})
