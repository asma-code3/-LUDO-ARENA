import { useCallback, useEffect, useState } from 'react'
import { loadFriends, loadFriendRequests, respondToFriendRequest, searchPlayers, sendFriendRequest } from '../services/api.js'

export function FriendsPage({ onNavigate, authenticated }) {
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const refresh = useCallback(() => Promise.all([loadFriends(), loadFriendRequests()]).then(([friendData, requestData]) => { setFriends(friendData.friends); setRequests(requestData) }), [])
  useEffect(() => {
    if (!authenticated) return undefined
    refresh().catch((cause) => setError(cause.message))
    const timer = window.setInterval(() => refresh().catch(() => {}), 15000)
    return () => window.clearInterval(timer)
  }, [authenticated, refresh])
  const search = async (event) => { event.preventDefault(); setError(''); try { setResults((await searchPlayers(query)).players) } catch (cause) { setError(cause.message) } }
  const add = async (id) => { setError(''); try { await sendFriendRequest(id); setResults((current) => current.filter((player) => player._id !== id)); await refresh() } catch (cause) { setError(cause.message) } }
  const respond = async (id, accept) => { setError(''); try { await respondToFriendRequest(id, accept); await refresh() } catch (cause) { setError(cause.message) } }
  if (!authenticated) return <section className="simple-page"><div className="simple-intro"><span className="eyebrow">YOUR COMMUNITY</span><h1>Friends</h1><p>Sign in to find friends and manage requests.</p><button className="button button-dark" onClick={()=>onNavigate('auth')}>Sign in <span>→</span></button></div></section>
  return <section className="simple-page"><div className="simple-intro"><span className="eyebrow">YOUR COMMUNITY</span><h1>Friends</h1><p>Find your crew, accept requests, and invite friends to a room.</p></div><form className="friend-search" onSubmit={search}><input value={query} onChange={(event)=>setQuery(event.target.value)} minLength={2} placeholder="Search player names" aria-label="Search players"/><button className="button button-dark">Search</button></form>{error&&<p className="auth-error">{error}</p>}{results.length>0&&<div className="simple-cards">{results.map((player)=><article className="simple-card" key={player._id}><span className="simple-card-icon">{player.username.slice(0,1).toUpperCase()}</span><div><b>{player.username}</b><small>Level {player.level}</small></div><button onClick={()=>add(player._id)}>Add friend <span>＋</span></button></article>)}</div>}<div className="community-columns"><section><h2>Friend requests <span>{requests.incoming.length}</span></h2>{requests.incoming.length?requests.incoming.map((request)=><article className="simple-card" key={request._id}><span className="simple-card-icon">{request.requester.username.slice(0,1).toUpperCase()}</span><div><b>{request.requester.username}</b><small>Wants to join your crew</small></div><button onClick={()=>respond(request._id,true)}>Accept</button><button className="quiet-button" onClick={()=>respond(request._id,false)}>Decline</button></article>):<p className="empty-note">No new requests.</p>}</section><section><h2>Your friends <span>{friends.length}</span></h2>{friends.length?friends.map((friend)=><article className="simple-card" key={friend._id}><span className="simple-card-icon">{friend.username.slice(0,1).toUpperCase()}</span><div><b>{friend.username}</b><small>Level {friend.level} · {friend.isOnline?'Online now':friend.lastSeenAt?`Last seen ${new Date(friend.lastSeenAt).toLocaleString()}`:'Offline'}</small></div><button onClick={()=>onNavigate('play','online','',friend._id)}>Invite <span>→</span></button></article>):<p className="empty-note">Search for players to add your first friend.</p>}</section></div></section>
}
