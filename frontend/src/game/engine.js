export const PLAYERS = ['coral', 'green', 'gold', 'blue']
export const TOKENS_PER_PLAYER = 4
export const TRACK_LENGTH = 52
export const FINISH_PROGRESS = 57
export const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47])

const START_OFFSETS = { coral: 0, green: 13, gold: 26, blue: 39 }

export function createGame({ playerNames = {}, playerColors = PLAYERS, teamMode = false } = {}) {
  if (teamMode && playerColors.length !== 4) throw new Error('Team mode requires four players.')
  return {
    status: 'playing',
    currentPlayer: 0,
    dice: null,
    winner: null,
    teamMode,
    winningTeam: null,
    winningPlayers: [],
    turnNumber: 1,
    players: playerColors.map((color) => ({
      color,
      name: playerNames[color] ?? color[0].toUpperCase() + color.slice(1),
      tokens: Array(TOKENS_PER_PLAYER).fill(-1),
    })),
    lastAction: null,
  }
}

export function getGlobalSquare(color, progress) {
  if (progress < 0 || progress >= 51) return null
  return (START_OFFSETS[color] + progress) % TRACK_LENGTH
}

export function getLegalTokenIds(game, playerIndex = game.currentPlayer) {
  if (game.status !== 'playing' || !Number.isInteger(game.dice) || game.dice < 1) return []
  const player = game.players[playerIndex]
  if (!player) return []
  return player.tokens.flatMap((progress, tokenIndex) => {
    if (progress === -1) return game.dice === 6 ? [tokenIndex] : []
    const next = progress + game.dice
    return next <= FINISH_PROGRESS ? [tokenIndex] : []
  })
}

export function rollDice(game, random = Math.random) {
  if (game.status !== 'playing') throw new Error('The game is not active.')
  if (game.dice !== null) throw new Error('Move a token before rolling again.')
  const value = Math.floor(random() * 6) + 1
  const next = { ...game, dice: value, lastAction: { type: 'roll', player: game.currentPlayer, value } }
  const legalMoves = getLegalTokenIds(next)
  if (legalMoves.length === 0) return advanceTurn({ ...next, dice: null }, false)
  return next
}

export function moveToken(game, tokenIndex) {
  if (game.status !== 'playing') throw new Error('The game is not active.')
  if (game.dice === null) throw new Error('Roll the dice before moving.')
  if (!getLegalTokenIds(game).includes(tokenIndex)) throw new Error('That token cannot move with this roll.')

  const playerIndex = game.currentPlayer
  const player = game.players[playerIndex]
  const oldProgress = player.tokens[tokenIndex]
  const newProgress = oldProgress === -1 ? 0 : oldProgress + game.dice
  const tokens = player.tokens.map((progress, index) => index === tokenIndex ? newProgress : progress)
  const players = game.players.map((entry, index) => index === playerIndex ? { ...entry, tokens } : entry)
  let captured = false

  const movedSquare = getGlobalSquare(player.color, newProgress)
  if (movedSquare !== null && !SAFE_SQUARES.has(movedSquare)) {
    players.forEach((opponent, opponentIndex) => {
      if (opponentIndex === playerIndex) return
      if (game.teamMode && opponentIndex % 2 === playerIndex % 2) return
      const returned = opponent.tokens.map((progress) => {
        if (getGlobalSquare(opponent.color, progress) !== movedSquare) return progress
        captured = true
        return -1
      })
      players[opponentIndex] = { ...opponent, tokens: returned }
    })
  }

  const winningPlayers = game.teamMode
    ? players.flatMap((entry, index) => index % 2 === playerIndex % 2 && entry.tokens.every((progress) => progress === FINISH_PROGRESS) ? [index] : [])
    : tokens.every((progress) => progress === FINISH_PROGRESS) ? [playerIndex] : []
  const won = game.teamMode
    ? winningPlayers.length === 2
    : winningPlayers.length === 1
  const result = {
    ...game,
    players,
    dice: null,
    status: won ? 'finished' : 'playing',
    winner: won ? player.color : null,
    winningTeam: won && game.teamMode ? (playerIndex % 2 === 0 ? 'team-a' : 'team-b') : null,
    winningPlayers: won ? winningPlayers : [],
    lastAction: { type: 'move', player: playerIndex, token: tokenIndex, from: oldProgress, to: newProgress, captured },
  }
  const bonusTurn = game.dice === 6 || captured
  return won ? result : advanceTurn(result, bonusTurn)
}

function advanceTurn(game, bonusTurn) {
  return {
    ...game,
    currentPlayer: bonusTurn ? game.currentPlayer : (game.currentPlayer + 1) % game.players.length,
    turnNumber: bonusTurn ? game.turnNumber : game.turnNumber + 1,
  }
}
