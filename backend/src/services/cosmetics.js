export const COSMETICS = [
  { id: 'avatar-default', category: 'avatar', name: 'Arena Ace', description: 'The original Arena avatar.', price: 0, symbol: 'A' },
  { id: 'avatar-fox', category: 'avatar', name: 'Ember Fox', description: 'A quick and clever arena regular.', price: 300, symbol: '🦊' },
  { id: 'avatar-robot', category: 'avatar', name: 'Neon Bot', description: 'Built for one more roll.', price: 350, symbol: '🤖' },
  { id: 'board-classic', category: 'board', name: 'Classic Board', description: 'The familiar Ludo board.', price: 0, symbol: '▦' },
  { id: 'board-neon', category: 'board', name: 'Neon Circuit', description: 'A glowing midnight arena.', price: 500, symbol: '✦' },
  { id: 'board-forest', category: 'board', name: 'Forest Grove', description: 'A calm green board theme.', price: 500, symbol: '❋' },
  { id: 'dice-classic', category: 'dice', name: 'Classic Dice', description: 'The standard six-sided die.', price: 0, symbol: '⚄' },
  { id: 'dice-galaxy', category: 'dice', name: 'Galaxy Dice', description: 'A stellar look for every roll.', price: 300, symbol: '✧' },
  { id: 'dice-gold', category: 'dice', name: 'Gilded Dice', description: 'A gold finish for the table.', price: 300, symbol: '◆' },
]

export function findCosmetic(id) {
  return COSMETICS.find((item) => item.id === id) ?? null
}

export function cosmeticField(item) {
  return item.category === 'avatar' ? 'avatar' : item.category === 'board' ? 'boardTheme' : 'diceSkin'
}
