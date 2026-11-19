export const BOARD_COLORS = Object.freeze(['coral', 'green', 'gold', 'blue'])

export function getBoardSeats(players = []) {
  const activePlayers = players ?? []
  return BOARD_COLORS.map((color, index) => ({
    color,
    index,
    player: activePlayers.find((entry) => entry.color === color) ?? null,
  }))
}
