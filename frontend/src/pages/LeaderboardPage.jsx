import { useEffect, useState } from 'react'
import { loadLeaderboard } from '../services/api.js'

export function LeaderboardPage({ authenticated, onNavigate }) {
  const [players, setPlayers] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { if (authenticated) loadLeaderboard().then((data)=>setPlayers(data.players)).catch((cause)=>setError(cause.message)) }, [authenticated])
  if (!authenticated) return <section className="simple-page"><div className="simple-intro"><span className="eyebrow">SEASON RANKINGS</span><h1>Leaderboard</h1><p>Sign in to see the arena standings.</p><button className="button button-dark" onClick={()=>onNavigate('auth')}>Sign in <span>→</span></button></div></section>
  return <section className="simple-page"><div className="simple-intro"><span className="eyebrow">SEASON RANKINGS</span><h1>Leaderboard</h1><p>Top players ranked by experience and wins.</p></div>{error&&<p className="auth-error">{error}</p>}<div className="simple-cards">{players.map((player,index)=><article className="simple-card" key={player._id}><span className="simple-card-icon">{String(index+1).padStart(2,'0')}</span><div><b>{player.username}</b><small>Level {player.level} · {player.wins} wins</small></div><strong className="leaderboard-xp">{player.xp.toLocaleString()} XP</strong></article>)}</div></section>
}
