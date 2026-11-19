import { useEffect, useState } from 'react'
import { Dashboard } from './src/pages/Dashboard.jsx'
import { GameRoom } from './src/pages/GameRoom.jsx'
import { Navigation } from './src/components/Navigation.jsx'
import { AuthPage } from './src/pages/AuthPage.jsx'
import { authToken, loadDashboard, loadGameInvites, respondToGameInvite } from './src/services/api.js'
import { FriendsPage } from './src/pages/FriendsPage.jsx'
import { TournamentsPage } from './src/pages/TournamentsPage.jsx'
import { LeaderboardPage } from './src/pages/LeaderboardPage.jsx'
import { HistoryPage } from './src/pages/HistoryPage.jsx'
import { SettingsPage } from './src/pages/SettingsPage.jsx'
import { RewardsPage } from './src/pages/RewardsPage.jsx'
import { ProfilePage } from './src/pages/ProfilePage.jsx'
import { CustomizationPage } from './src/pages/CustomizationPage.jsx'
import { createArenaSocket } from './src/services/socket.js'
import './src/components/InviteInbox.css'

const items = [
  { id: 'home', label: 'Overview', icon: '◫' },
  { id: 'play', label: 'Play Ludo', icon: '♟' },
  { id: 'tournaments', label: 'Tournaments', icon: '♜' },
  { id: 'friends', label: 'Friends', icon: '♧' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '⌁' },
]
const libraryItems = [
  { id: 'shop', label: 'Customization', icon: '✧' },
  { id: 'rewards', label: 'Rewards', icon: '✧' },
  { id: 'history', label: 'Match history', icon: '◷' },
]

export default function App() {
  const [page, setPage] = useState('home')
  const [gameMode, setGameMode] = useState('online')
  const [roomCode, setRoomCode] = useState('')
  const [inviteFriendId, setInviteFriendId] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [token, setToken] = useState(() => authToken.get())
  const [profile, setProfile] = useState(null)
  const [invites, setInvites] = useState([])
  const [showInvites, setShowInvites] = useState(false)
  const [inviteError, setInviteError] = useState('')
  useEffect(() => {
    if (!token) return
    loadDashboard().then(setProfile).catch(() => {})
  }, [token])
  useEffect(() => {
    if (!token) return undefined
    const connection = createArenaSocket(token)
    connection.connect()
    return () => connection.disconnect()
  }, [token])
  useEffect(() => {
    if (!token) { setInvites([]); return undefined }
    let active = true
    const refresh = () => loadGameInvites().then(({ invites: next }) => { if (active) setInvites(next) }).catch(() => {})
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [token])
  const navigate = (next, mode, nextRoomCode = '', nextInviteFriendId = '') => {
    setPage(next)
    if (mode) setGameMode(mode)
    setRoomCode(nextRoomCode)
    setInviteFriendId(nextInviteFriendId)
    setMobileNavOpen(false)
  }
  const respondInvite = async (invite, action) => {
    setInviteError('')
    try {
      await respondToGameInvite(invite._id, action)
      setInvites((current) => current.filter((entry) => entry._id !== invite._id))
      if (action === 'accept') { setShowInvites(false); navigate('play', invite.room?.mode === 'team' ? 'team' : 'online', invite.roomCode) }
    } catch (error) { setInviteError(error.message) }
  }
  return <div className="app-shell">
    <Navigation items={items} libraryItems={libraryItems} current={page} onNavigate={navigate} open={mobileNavOpen} onToggle={() => setMobileNavOpen((v) => !v)} user={profile?.user} authenticated={Boolean(token)} />
    <main className="main-content">
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setMobileNavOpen((v) => !v)} aria-label="Open navigation">☰</button>
        <div className="breadcrumb"><span>Arena</span><b>/</b><strong>{items.concat(libraryItems).find((item) => item.id === page)?.label ?? 'Profile'}</strong></div>
        <div className="topbar-actions">{token?<><div className="invite-inbox"><button className="icon-button notification" aria-label="Game invitations" aria-expanded={showInvites} onClick={()=>{setShowInvites((value)=>!value);setInviteError('')}}>♧<i />{invites.length>0&&<span className="invite-count">{invites.length}</span>}</button>{showInvites&&<div className="invite-popover"><b>Game invites</b>{inviteError&&<small className="room-error">{inviteError}</small>}{invites.map((invite)=><article key={invite._id}><span><strong>{invite.sender?.username ?? 'A player'}</strong> invited you to room {invite.roomCode}.</span><div><button onClick={()=>respondInvite(invite,'accept')}>Join</button><button className="quiet-button" onClick={()=>respondInvite(invite,'dismiss')}>Dismiss</button></div></article>)}{invites.length===0&&!inviteError&&<small>No pending invites.</small>}</div>}</div><button className="profile-button" onClick={() => navigate('profile')}><span className="profile-avatar">{profile?.user?.avatar === 'avatar-fox' ? '🦊' : profile?.user?.avatar === 'avatar-robot' ? '🤖' : (profile?.user?.username??'A')[0].toUpperCase()}</span><span className="profile-label"><b>{profile?.user?.username??'Player'}</b><small>Level {profile?.user?.level??1}</small></span><span className="chevron">⌄</span></button></>:<button className="button button-dark" onClick={()=>navigate('auth')}>Sign in <span>→</span></button>}</div>
      </header>
      {page === 'auth' ? <AuthPage onBack={()=>navigate('home')} onSuccess={(result)=>{authToken.set(result.token);setToken(result.token);setProfile({user:result.user});navigate('home')}}/> : page === 'home' ? <Dashboard user={profile?.user} dashboard={profile} onProfileUpdate={setProfile} onNavigate={navigate} /> : page === 'play' ? <GameRoom user={profile?.user} aiMode={gameMode === 'ai'} teamMode={gameMode === 'team'} onlineMode={gameMode === 'online' || gameMode === 'team'} token={token} userId={profile?.user?.id ?? profile?.user?._id} initialRoomCode={roomCode} inviteFriendId={inviteFriendId} onProfileUpdate={setProfile} onSignIn={()=>navigate('auth')} onExit={() => navigate('home')} /> : page === 'friends' ? <FriendsPage authenticated={Boolean(token)} onNavigate={navigate}/> : page === 'tournaments' ? <TournamentsPage authenticated={Boolean(token)} userId={profile?.user?.id ?? profile?.user?._id} onNavigate={navigate}/> : page === 'leaderboard' ? <LeaderboardPage authenticated={Boolean(token)} onNavigate={navigate}/> : page==='history'?<HistoryPage authenticated={Boolean(token)} userId={profile?.user?.id ?? profile?.user?._id} onNavigate={navigate}/>:page==='rewards'?<RewardsPage authenticated={Boolean(token)} user={profile?.user} onProfileUpdate={setProfile} onNavigate={navigate}/>:page==='shop'?<CustomizationPage authenticated={Boolean(token)} onProfileUpdate={setProfile} onNavigate={navigate}/>:page==='settings'?<SettingsPage authenticated={Boolean(token)} user={profile?.user} onProfileUpdate={setProfile} onNavigate={navigate}/>:<ProfilePage authenticated={Boolean(token)} user={profile?.user} onNavigate={navigate} onLogout={()=>{authToken.clear();setToken(null);setProfile(null);navigate('home')}}/>}
    </main>
  </div>
}
