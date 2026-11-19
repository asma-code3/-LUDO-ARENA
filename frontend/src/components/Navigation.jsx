export function Navigation({ items, libraryItems, current, onNavigate, open, user, authenticated }) {
  const renderItems = (list) => list.map((item) => <button key={item.id} onClick={() => onNavigate(item.id)} className={`nav-link ${current === item.id ? 'selected' : ''}`}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)
  const xpInLevel = (user?.xp ?? 0) % 1000

  return <>
    <div className={`mobile-scrim ${open ? 'visible' : ''}`} onClick={() => onNavigate(current)} />
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <button className="brand" onClick={() => onNavigate('home')}><span className="brand-mark"><i /><i /><i /><i /></span><span>LUDO<span className="brand-light">ARENA</span></span></button>
      <div className="sidebar-label">PLAY</div>{renderItems(items)}
      <div className="sidebar-label library-label">YOUR ARENA</div>{renderItems(libraryItems)}
      <div className="sidebar-spacer" />
      <div className="season-card"><div className="season-orb">*</div><div><b>Level {user?.level ?? 1}</b><small>Arena progress</small></div><span className="season-arrow">&gt;</span><div className="season-progress"><i style={{ width: `${xpInLevel / 10}%` }} /></div><small className="season-caption">{xpInLevel.toLocaleString()} / 1,000 XP</small></div>
      <button onClick={() => onNavigate('settings')} className={`nav-link settings-link ${current === 'settings' ? 'selected' : ''}`}><span className="nav-icon">&#9881;</span><span>Settings</span></button>
      <button className="sidebar-user flex items-center gap-2" onClick={() => onNavigate(authenticated ? 'profile' : 'auth')}><div className="profile-avatar">{user?.avatar === 'avatar-fox' ? '🦊' : user?.avatar === 'avatar-robot' ? '🤖' : (user?.username?.[0] ?? 'G').toUpperCase()}</div><div><b>{user?.username ?? 'Guest player'}</b><small>{authenticated ? `Level ${user?.level ?? 1}` : 'Sign in to save progress'}</small></div><span aria-hidden="true">...</span></button>
    </aside>
  </>
}
