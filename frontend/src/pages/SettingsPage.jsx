import { useEffect, useState } from 'react'
import { updateAccountSettings } from '../services/api.js'

export function SettingsPage({ authenticated, user, onProfileUpdate, onNavigate }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('ludo-arena-theme') || 'dark')
  const [sound, setSound] = useState(() => localStorage.getItem('ludo-arena-sound') !== 'off')
  const [invites, setInvites] = useState(() => user?.allowFriendInvites ?? true)
  const [savingInvites, setSavingInvites] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('ludo-arena-theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('ludo-arena-sound', sound ? 'on' : 'off') }, [sound])
  useEffect(() => { setInvites(user?.allowFriendInvites ?? true) }, [user?.allowFriendInvites])
  const updateInvites = async (nextValue) => {
    if (!authenticated) return onNavigate?.('auth')
    setInvites(nextValue)
    setSavingInvites(true)
    setError('')
    try {
      const { settings } = await updateAccountSettings({ allowFriendInvites: nextValue })
      onProfileUpdate?.((current) => current ? { ...current, user: { ...current.user, ...settings } } : current)
    } catch (cause) {
      setInvites(!nextValue)
      setError(cause.message)
    } finally {
      setSavingInvites(false)
    }
  }
  return <section className="simple-page"><div className="simple-intro"><span className="eyebrow">MAKE IT YOURS</span><h1>Settings</h1><p>Choose how Ludo Arena looks and sounds on this device.</p></div><div className="settings-list"><label><span><b>Appearance</b><small>Choose a light or dark arena.</small></span><select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label><label><span><b>Game sounds</b><small>Sound effects for dice and moves.</small></span><input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)}/></label><label><span><b>Friend invites</b><small>{authenticated ? 'Allow friends to invite you to rooms.' : 'Sign in to manage who can invite you.'}</small></span><input type="checkbox" checked={invites} disabled={!authenticated || savingInvites} onChange={(event) => updateInvites(event.target.checked)}/></label></div>{error && <p className="auth-error" role="alert">{error}</p>}{savingInvites && <p className="empty-note" role="status">Saving invitation preference…</p>}</section>
}
