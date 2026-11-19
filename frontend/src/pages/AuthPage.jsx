import { useState } from 'react'
import { loginAccount, registerAccount } from '../services/api.js'

export function AuthPage({ onSuccess, onBack }) {
  const [mode, setMode] = useState('login')
  const [identity, setIdentity] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = mode === 'login'
        ? await loginAccount({ identity, password })
        : await registerAccount({ username, email, password })
      onSuccess(result)
    } catch (cause) {
      setError(cause.message || 'Could not connect to Ludo Arena.')
    } finally { setBusy(false) }
  }
  return <div className="auth-screen"><button className="auth-back" onClick={onBack}>← Back to arena</button><div className="auth-card"><div className="auth-brand"><span className="brand-mark"><i/><i/><i/><i/></span><span>LUDO<span className="brand-light">ARENA</span></span></div><span className="eyebrow">YOUR NEXT GAME STARTS HERE</span><h1>{mode==='login'?'Welcome back.':'Join the arena.'}</h1><p>{mode==='login'?'Sign in and pick up where your crew left off.':'Create a player account and meet your next rivals.'}</p><form onSubmit={submit} className="auth-form">{mode==='register'&&<label>Username<input value={username} onChange={(event)=>setUsername(event.target.value)} autoComplete="username" minLength={3} maxLength={24} required placeholder="Your arena name"/></label>}{mode==='register'&&<label>Email<input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com"/></label>}{mode==='login'&&<label>Email or username<input value={identity} onChange={(event)=>setIdentity(event.target.value)} autoComplete="username" required placeholder="Your email or username"/></label>}<label>Password<input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} required placeholder="At least 8 characters"/></label>{error&&<div className="auth-error" role="alert">{error}</div>}<button className="button button-dark full-button" disabled={busy}>{busy?'One moment…':mode==='login'?'Sign in':'Create account'} <span>→</span></button></form><div className="auth-switch">{mode==='login'?"New to the arena?":"Already have an account?"}<button onClick={()=>{setMode(mode==='login'?'register':'login');setError('')}}>{mode==='login'?'Create an account':'Sign in'}</button></div><small className="auth-note">Coins are virtual game points and have no real-world cash value.</small></div></div>
}
