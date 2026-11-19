import { useCallback, useEffect, useState } from 'react'
import { loadTournaments, loadTournamentHistory, registerTournament } from '../services/api.js'
import { SectionHeading } from '../components/SectionHeading.jsx'

export function TournamentsPage({ authenticated, userId, onNavigate }) {
  const [tournaments, setTournaments] = useState([])
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const refresh = useCallback(async () => {
    const [active, completed] = await Promise.all([loadTournaments(), loadTournamentHistory()])
    setTournaments(active.tournaments)
    setHistory(completed.tournaments)
  }, [])

  useEffect(() => {
    if (!authenticated) return undefined
    refresh().catch((cause) => setError(cause.message))
    const timer = window.setInterval(() => refresh().catch(() => {}), 15000)
    return () => window.clearInterval(timer)
  }, [authenticated, refresh])

  const join = async (id) => {
    setBusyId(id)
    setError('')
    try {
      await registerTournament(id)
      await refresh()
      setError('You are registered. Good luck!')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!authenticated) return <section className="simple-page"><div className="simple-intro"><span className="eyebrow">COMPETE TOGETHER</span><h1>Tournaments</h1><p>Sign in to browse and join arena tournaments.</p><button className="button button-dark" onClick={() => onNavigate('auth')}>Sign in <span>→</span></button></div></section>

  return <section className="simple-page">
    <div className="simple-intro"><span className="eyebrow">COMPETE TOGETHER</span><h1>Tournaments</h1><p>Register for a bracket and play for virtual game points.</p></div>
    {error && <p className="empty-note" role="status">{error}</p>}
    <div className="simple-cards">
      {tournaments.map((tournament) => <article className="tournament-card" key={tournament._id}>
        <div className="tournament-summary">
          <span className="simple-card-icon">♜</span>
          <div><b>{tournament.name}</b><small>{tournament.cadence} · {tournament.entrants.length}/{tournament.maxPlayers} players · {new Date(tournament.startsAt).toLocaleString()}</small>{tournament.champion && <small className="champion-label">Champion: {tournament.champion.username}</small>}</div>
          {tournament.status === 'registration' && (() => {
            const registered = tournament.entrants.some((entrant) => String(entrant?._id ?? entrant) === String(userId))
            return <button disabled={registered || busyId === tournament._id} onClick={() => join(tournament._id)}>{busyId === tournament._id ? 'Joining…' : registered ? 'Registered' : 'Register'} {!registered && <span>→</span>}</button>
          })()}
        </div>
        {tournament.bracket?.length > 0 && <div className="bracket-list">
          <b>{tournament.status === 'completed' ? 'Final bracket' : `Round ${tournament.activeRound} bracket`}</b>
          {tournament.bracket.map((match, index) => {
            const enrolled = match.players.some((player) => String(player._id) === String(userId))
            const playable = enrolled && match.room?.status !== 'finished'
            return <div className="bracket-match" key={`${match.round}-${index}`}>
              <span>R{match.round}</span><span>{match.players.map((player) => player.username).join(' vs ')}</span>
              <strong>{match.winner?.username ?? (match.room?.status === 'playing' ? 'In progress' : 'Waiting')}</strong>
              {playable && match.room?.code && <button className="button button-soft" onClick={() => onNavigate('play', 'online', match.room.code)}>{match.room.status === 'playing' ? 'Rejoin match' : 'Open match'}</button>}
            </div>
          })}
        </div>}
      </article>)}
    </div>
    {!tournaments.length && !error && <p className="empty-note">No tournaments are open right now.</p>}
    <section className="tournament-history">
      <SectionHeading eyebrow="PAST CHAMPIONS" title="Tournament history" />
      <div className="simple-cards">{history.map((tournament) => <article className="simple-card" key={tournament._id}>
        <span className="simple-card-icon">♜</span>
        <div><b>{tournament.name}</b><small>{tournament.cadence} · {tournament.endsAt ? new Date(tournament.endsAt).toLocaleDateString() : 'Completed'}</small></div>
        <strong className="champion-label">{tournament.champion?.username ?? 'Champion pending'}</strong>
      </article>)}</div>
      {history.length === 0 && <p className="empty-note">Completed tournaments and champions will appear here.</p>}
    </section>
  </section>
}
