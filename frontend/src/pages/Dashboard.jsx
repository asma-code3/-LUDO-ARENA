import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { StatCard } from '../components/StatCard.jsx'
import { SectionHeading } from '../components/SectionHeading.jsx'
import { claimDailyReward, loadDashboard, loadFriends, loadLeaderboard } from '../services/api.js'

const modes = [
  { id: 'offline', title: 'Offline play', description: 'Choose 2 or 3 players on one device', icon: '♟', tone: 'mint', tag: '2 OR 3' },
  { id: 'online', title: 'Online play', description: 'Choose 2 or 3 players to find or invite', icon: '◉', tone: 'violet', tag: '2 OR 3' },
]

function elapsed(date) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.floor(hours / 24)} days ago`
}

export function Dashboard({ onNavigate, user, dashboard, onProfileUpdate }) {
  const [rewardMessage, setRewardMessage] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [friends, setFriends] = useState([])
  const [leaderboard, setLeaderboard] = useState([])

  useEffect(() => {
    if (!user) { setFriends([]); setLeaderboard([]); return undefined }
    let active = true
    const refresh = () => Promise.all([loadFriends(), loadLeaderboard()]).then(([friendData, boardData]) => {
      if (!active) return
      setFriends(friendData.friends ?? [])
      setLeaderboard(boardData.players ?? [])
    }).catch(() => {})
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [user?._id, user?.id])

  const claimReward = async () => {
    if (!user) return onNavigate('auth')
    setClaiming(true)
    try {
      await claimDailyReward()
      setRewardMessage('150 coins added to your balance!')
      onProfileUpdate?.(await loadDashboard())
    } catch (error) { setRewardMessage(error.message) }
    finally { setClaiming(false) }
  }

  const matches = dashboard?.recentMatches ?? []
  const rankedAt = leaderboard.findIndex((entry) => String(entry._id) === String(user?._id ?? user?.id))
  const onlineFriends = friends.filter((friend) => friend.isOnline)
  const dailyStreak = user?.dailyStreak ?? 0

  return <div className="dashboard-page">
    <section className="welcome-row"><div><div className="eyebrow welcome-eyebrow"><span className="live-dot" /> YOUR ARENA IS READY</div><h1>Make your next move,<br /><span>{user?.username ?? 'Player'}.</span></h1><p>{user ? 'Your stats and recent games are up to date.' : 'Sign in to save your progress and play online.'}</p></div><button className="streak-pill" onClick={() => onNavigate('rewards')}><span>✦</span><b>{dailyStreak} day streak</b><small>{user ? 'Daily challenge and rewards' : 'Sign in to track progress'}</small></button></section>
    <motion.section className="hero-banner" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }}><div className="hero-art"><div className="hero-glow"/><div className="hero-dice">⚄</div><span className="orbit orbit-one"/><span className="orbit orbit-two"/><span className="hero-spark spark-a">✦</span><span className="hero-spark spark-b">✧</span></div><div className="hero-content"><div className="hero-kicker"><span>✦</span> LUDO ARENA</div><h2>Roll into<br />the spotlight.</h2><p>Climb the ranks, collect your rewards,<br/>and make every roll count.</p><button onClick={() => onNavigate('play')} className="button button-white">Play now <span>→</span></button></div><div className="hero-index">01 <i /> 03</div></motion.section>
    <section className="stats-grid"><StatCard label="MATCHES PLAYED" value={(user?.matchesPlayed ?? 0).toLocaleString()} note="Completed matches" icon="▦" tone="violet"/><StatCard label="WIN RATE" value={user?.matchesPlayed ? `${Math.round((user.wins / user.matchesPlayed) * 100)}%` : '—'} note="From completed matches" icon="◒" tone="mint"/><StatCard label="ARENA COINS" value={(user?.coins ?? 0).toLocaleString()} note={<button className="inline-link" onClick={() => onNavigate('rewards')}>Visit rewards →</button>} icon="◉" tone="gold"/><StatCard label="GLOBAL RANK" value={rankedAt >= 0 ? `#${rankedAt + 1}` : '—'} note={rankedAt >= 0 ? `${user?.xp ?? 0} XP` : 'Play to join the leaderboard'} icon="♜" tone="pink"/></section>
    <div className="dashboard-columns"><div className="dashboard-main-col"><section className="section-block"><SectionHeading eyebrow="PICK YOUR PLAYSTYLE" title="Jump into a game" action="Choose mode" onAction={() => onNavigate('play')}/><div className="mode-grid">{modes.map((mode) => <button key={mode.id} onClick={() => onNavigate('play')} className="mode-card"><span className={`mode-icon ${mode.tone}`}>{mode.icon}</span><span className="mode-tag">{mode.tag}</span><b>{mode.title}</b><small>{mode.description}</small><span className="mode-arrow">↗</span></button>)}</div></section>
      <section className="section-block recent-block"><SectionHeading eyebrow="BACK IN THE ARENA" title="Recent matches" action="View history" onAction={() => onNavigate('history')}/><div className="recent-list">{matches.map((match) => { const mine = match.players.find((entry) => String(entry.user?._id ?? entry.user) === String(user?._id ?? user?.id)); const opponents = match.players.filter((entry) => String(entry.user?._id ?? entry.user) !== String(user?._id ?? user?.id)).map((entry) => entry.user?.username).filter(Boolean); return <article className="recent-row" key={match._id}><span className={`match-mark ${mine?.placement === 1 ? 'purple' : 'mint'}`}>{mine?.placement === 1 ? '✦' : '♟'}</span><div className="match-info"><b>{mine?.placement === 1 ? 'Victory' : `Place ${mine?.placement ?? '—'}`}</b><small>{opponents.length ? `vs ${opponents.join(', ')}` : `${match.mode} match`}</small></div><span className="match-result"><b>{match.mode}</b><small>{elapsed(match.completedAt)}</small></span><span className="match-score">+{mine?.coinsEarned ?? 0}<small>coins</small></span></article>})}{matches.length === 0 && <p className="empty-note">Your completed matches will appear here.</p>}</div></section></div>
      <aside className="dashboard-side-col"><section className="side-widget daily-widget"><div className="widget-heading"><div><div className="eyebrow">DAILY PROGRESS</div><h3>Daily rewards</h3></div><span className="widget-icon reward-icon">✧</span></div><p>{user ? `Current streak: ${dailyStreak} day${dailyStreak === 1 ? '' : 's'}. Claim your daily coins and XP.` : 'Sign in to claim your daily coins and XP.'}</p><button className="button button-dark full-button" onClick={claimReward} disabled={claiming}>{claiming ? 'Claiming…' : rewardMessage || 'Claim 150 coins'} <span>→</span></button></section>
      <section className="side-widget friends-widget"><div className="widget-heading"><div><div className="eyebrow">{onlineFriends.length} FRIENDS ONLINE</div><h3>Your crew</h3></div><button className="text-action" onClick={() => onNavigate('friends')}>See all <span>↗</span></button></div>{onlineFriends.slice(0, 3).map((friend) => <div className="friend-row" key={friend._id}><span className="friend-avatar mint">{friend.username.slice(0, 2).toUpperCase()}<i /></span><span className="friend-name"><b>{friend.username}</b><small>Online now</small></span><button className="invite-mini" onClick={() => onNavigate('play', 'online', '', friend._id)}>Invite</button></div>)}{user && onlineFriends.length === 0 && <p className="empty-note">No friends online right now.</p>}{!user && <p className="empty-note">Sign in to see your friends.</p>}</section>
      <section className="leaderboard-teaser"><div><span className="eyebrow">GLOBAL LEADERBOARD</span><h3>{rankedAt >= 0 ? `You are #${rankedAt + 1}.` : 'Find your place.'}</h3><p>{rankedAt >= 0 ? `${user?.xp ?? 0} XP · Level ${user?.level ?? 1}` : 'Play and earn XP to rank up.'}</p></div><button onClick={() => onNavigate('leaderboard')} aria-label="View leaderboard">↗</button></section></aside></div>
    <footer className="page-footer"><span>© 2026 Ludo Arena</span><span>Play fair. Play together. <b>✦</b></span></footer>
  </div>
}
