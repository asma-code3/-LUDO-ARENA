import { useEffect, useState } from 'react'
import { loadHistory } from '../services/api.js'

export function HistoryPage({ authenticated, onNavigate, userId }) {
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { if (authenticated) loadHistory().then((data) => setHistory(data.history)).catch((cause) => setError(cause.message)) }, [authenticated])
  if (!authenticated) return <section className="simple-page"><div className="simple-intro"><span className="eyebrow">YOUR RECENT GAMES</span><h1>Match history</h1><p>Sign in to see your recent arena matches.</p><button className="button button-dark" onClick={() => onNavigate('auth')}>Sign in <span>→</span></button></div></section>
  return <section className="simple-page"><div className="simple-intro"><span className="eyebrow">YOUR RECENT GAMES</span><h1>Match history</h1><p>Every roll tells a story.</p></div>{error && <p className="auth-error">{error}</p>}<div className="simple-cards">{history.map((match) => { const you = match.players.find((entry) => String(entry.user?._id) === userId); return <article className="simple-card" key={match._id}><span className="simple-card-icon">{you?.placement === 1 ? '✦' : '♟'}</span><div><b>{you?.placement === 1 ? 'Victory' : `Place ${you?.placement ?? '—'}`} · {match.mode} match</b><small>{new Date(match.completedAt).toLocaleString()} · {match.durationSeconds}s</small></div><strong className="leaderboard-xp">+{you?.coinsEarned ?? 0} coins</strong></article>})}</div>{!history.length&&!error&&<p className="empty-note">Your first match will show up here.</p>}</section>
}
