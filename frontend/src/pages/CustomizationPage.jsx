import { useEffect, useState } from 'react'
import { equipCosmetic, loadCosmetics, loadDashboard, purchaseCosmetic } from '../services/api.js'
import './CustomizationPage.css'

const categoryNames = { avatar: 'Avatars', board: 'Board themes', dice: 'Dice skins' }

export function CustomizationPage({ authenticated, onNavigate, onProfileUpdate }) {
  const [items, setItems] = useState([])
  const [coins, setCoins] = useState(0)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const refresh = async () => {
    const result = await loadCosmetics()
    setItems(result.items)
    setCoins(result.coins)
  }
  useEffect(() => { if (authenticated) refresh().catch((cause) => setError(cause.message)) }, [authenticated])

  const act = async (item) => {
    if (!authenticated) return onNavigate('auth')
    setBusyId(item.id)
    setError('')
    try {
      if (item.owned) await equipCosmetic(item.id)
      else await purchaseCosmetic(item.id)
      await refresh()
      onProfileUpdate?.(await loadDashboard())
    } catch (cause) { setError(cause.message) }
    finally { setBusyId('') }
  }

  if (!authenticated) return <section className="simple-page"><div className="simple-intro"><span className="eyebrow">MAKE IT YOURS</span><h1>Customization</h1><p>Sign in to equip avatars, dice skins, and board themes.</p><button className="button button-dark" onClick={() => onNavigate('auth')}>Sign in <span>→</span></button></div></section>

  return <section className="simple-page">
    <div className="simple-intro"><span className="eyebrow">MAKE IT YOURS</span><h1>Customization</h1><p>Spend virtual coins on arena looks. Coins have no cash value. Balance: {coins.toLocaleString()} coins.</p></div>
    {error && <p className="empty-note" role="status">{error}</p>}
    {Object.entries(categoryNames).map(([category, title]) => <section className="shop-section" key={category}><h2>{title}</h2><div className="simple-cards">{items.filter((item) => item.category === category).map((item) => <article className={`simple-card cosmetic-card ${item.equipped ? 'cosmetic-equipped' : ''}`} key={item.id}><span className="simple-card-icon cosmetic-symbol">{item.symbol}</span><div><b>{item.name}</b><small>{item.description}</small></div><span className="reward-virtual-label">{item.equipped ? 'EQUIPPED' : item.owned ? 'OWNED' : `${item.price} COINS`}</span><button className="button button-soft" disabled={busyId === item.id || item.equipped} onClick={() => act(item)}>{busyId === item.id ? 'Saving…' : item.equipped ? 'Equipped' : item.owned ? 'Equip' : 'Buy'}</button></article>)}</div></section>)}
  </section>
}
