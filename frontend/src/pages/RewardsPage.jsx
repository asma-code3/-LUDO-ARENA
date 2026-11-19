import { useEffect, useState } from 'react'
import { claimDailyReward, loadAchievements, loadDailyChallenge, loadDashboard } from '../services/api.js'
import './RewardsPage.css'

export function RewardsPage({ authenticated, onNavigate, onProfileUpdate, user }) {
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [balance, setBalance] = useState(user?.coins ?? 0)
  const [challenge, setChallenge] = useState(null)
  const [challengeError, setChallengeError] = useState('')
  const [achievements, setAchievements] = useState([])

  useEffect(() => setBalance(user?.coins ?? 0), [user?.coins])
  useEffect(() => {
    if (!authenticated) return undefined
    const refresh = () => {
      loadDailyChallenge().then((result) => { setChallenge(result.challenge); setChallengeError('') }).catch((error) => setChallengeError(error.message))
      loadAchievements().then((result) => setAchievements(result.achievements ?? [])).catch(() => {})
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => window.clearInterval(timer)
  }, [authenticated])

  const claim = async () => {
    if (!authenticated) return onNavigate('auth')
    setBusy(true)
    setNotice('')
    try {
      const result = await claimDailyReward()
      setBalance(result.user.coins)
      setNotice('Daily login reward claimed: 150 virtual coins and 25 XP.')
      onProfileUpdate?.(await loadDashboard())
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy(false)
    }
  }

  const progress = challenge?.progress ?? 0
  const goal = challenge?.goal ?? 2
  const complete = Boolean(challenge?.completedAt)

  return <section className="simple-page">
    <div className="simple-intro"><span className="eyebrow">PLAY MORE, EARN MORE</span><h1>Rewards center</h1><p>Balance: {balance.toLocaleString()} virtual coins. Coins are game points with no cash value.</p></div>
    <div className="simple-cards">
      <article className="simple-card"><span className="simple-card-icon">✦</span><div><b>Daily login</b><small>Claim 150 coins and 25 XP once per day.</small></div><button onClick={claim} disabled={busy}>{busy ? 'Claiming…' : 'Claim reward'} <span>→</span></button></article>
      <article className="simple-card"><span className="simple-card-icon">♟</span><div><b>Win a match</b><small>Winners earn 240 coins and 50 XP.</small></div><span className="reward-virtual-label">VIRTUAL POINTS</span></article>
      <article className="simple-card"><span className="simple-card-icon">🏆</span><div><b>{challenge?.title ?? 'Daily champion'}</b><small>{challenge?.description ?? 'Win 2 matches today'} · {progress}/{goal} wins</small>{challenge && <small>{complete ? 'Completed today' : `Reward: ${challenge.coins} coins and ${challenge.xp} XP`}</small>}{challengeError && <small>{challengeError}</small>}</div><div className="challenge-progress" role="progressbar" aria-label="Daily challenge progress" aria-valuenow={progress} aria-valuemin="0" aria-valuemax={goal}><i style={{ width: `${Math.min(progress / goal, 1) * 100}%` }}/></div><span className="reward-virtual-label">{complete ? 'COMPLETE' : 'DAILY CHALLENGE'}</span></article>
    </div>
    {!authenticated && <p className="empty-note">Sign in to track challenge progress and claim rewards.</p>}
    {notice && <p className="empty-note" role="status">{notice}</p>}
    <section className="achievement-section">
      <div className="section-heading"><div><span className="eyebrow">MILESTONES</span><h2>Achievements</h2></div><span className="achievement-count">{achievements.filter((achievement) => achievement.unlocked).length}/{achievements.length} unlocked</span></div>
      {!authenticated ? <p className="empty-note">Sign in to track your achievements.</p> : achievements.length > 0 ? <div className="achievement-grid">{achievements.map((achievement) => <article className={`achievement-card ${achievement.unlocked ? 'is-unlocked' : ''}`} key={achievement._id}>
        <span className="achievement-mark">{achievement.unlocked ? '✦' : '◇'}</span>
        <div><b>{achievement.name}</b><small>{achievement.description}</small><small>Reward: {achievement.coins} coins · {achievement.xp} XP</small></div>
        <strong>{achievement.unlocked ? 'Unlocked' : 'Locked'}</strong>
      </article>)}</div> : <p className="empty-note">Achievement milestones will appear after the arena catalog is seeded.</p>}
    </section>
  </section>
}
