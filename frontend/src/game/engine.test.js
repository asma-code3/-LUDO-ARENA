import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, getLegalTokenIds, moveToken, rollDice } from './engine.js'

test('a six lets a token leave the yard and grants another roll', () => {
  const rolled = rollDice(createGame(), () => 0.99)
  assert.equal(rolled.dice, 6)
  assert.deepEqual(getLegalTokenIds(rolled), [0, 1, 2, 3])
  const moved = moveToken(rolled, 0)
  assert.equal(moved.players[0].tokens[0], 0)
  assert.equal(moved.currentPlayer, 0)
})

test('a token in the yard cannot move on a roll below six', () => {
  const rolled = rollDice(createGame(), () => 0.5)
  assert.equal(rolled.dice, null)
  assert.deepEqual(getLegalTokenIds(rolled), [])
  assert.equal(rolled.currentPlayer, 1)
  assert.equal(rolled.dice, null)
})

test('tokens advance by the rolled value and turns pass after ordinary moves', () => {
  const game = createGame()
  game.players[0].tokens[0] = 3
  const moved = moveToken(rollDice(game, () => 0.33), 0)
  assert.equal(moved.players[0].tokens[0], 5)
  assert.equal(moved.currentPlayer, 1)
})

test('a roll cannot overshoot the finish', () => {
  const game = createGame()
  game.players[0].tokens[0] = 55
  const rolled = rollDice(game, () => 0.5)
  assert.deepEqual(getLegalTokenIds(rolled), [])
  assert.equal(rolled.currentPlayer, 1)
})

test('a six with no legal token also passes the turn', () => {
  const game = createGame()
  game.players[0].tokens = [55, 56, 57, 57]
  const rolled = rollDice(game, () => 0.99)
  assert.equal(rolled.currentPlayer, 1)
  assert.equal(rolled.dice, null)
})

test('landing on an unsafe opponent square captures and grants a bonus turn', () => {
  const game = createGame()
  game.players[0].tokens[0] = 0
  game.players[1].tokens[0] = 43
  const moved = moveToken(rollDice(game, () => 0.5), 0)
  assert.equal(moved.players[1].tokens[0], -1)
  assert.equal(moved.lastAction.captured, true)
  assert.equal(moved.currentPlayer, 0)
})

test('a six can be used to finish a token and exact finish is enforced', () => {
  const game = createGame()
  game.players[0].tokens = [56, 57, 57, 57]
  const moved = moveToken(rollDice(game, () => 0), 0)
  assert.equal(moved.status, 'finished')
  assert.equal(moved.winner, 'coral')
})

test('two-player rooms rotate only between their joined players', () => {
  const game = createGame({ playerColors: ['coral', 'green'] })
  assert.equal(game.players.length, 2)
  game.players[0].tokens[0] = 0
  const moved = moveToken(rollDice(game, () => 0.33), 0)
  assert.equal(moved.currentPlayer, 1)
})

test('2v2 mode ends only after both teammates finish all four tokens', () => {
  const game = createGame({ teamMode: true })
  game.players[0].tokens = [56, 57, 57, 57]
  game.players[2].tokens = [57, 57, 57, 57]
  const moved = moveToken(rollDice(game, () => 0), 0)
  assert.equal(moved.status, 'finished')
  assert.equal(moved.winner, 'coral')
  assert.equal(moved.winningTeam, 'team-a')
  assert.deepEqual(moved.winningPlayers, [0, 2])
})

test('team partners cannot capture each other', () => {
  const game = createGame({ teamMode: true })
  game.players[0].tokens[0] = 0
  game.players[2].tokens[0] = 43
  const moved = moveToken(rollDice(game, () => 0.5), 0)
  assert.equal(moved.players[2].tokens[0], 43)
  assert.equal(moved.lastAction.captured, false)
})
