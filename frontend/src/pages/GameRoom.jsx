import { useEffect, useRef, useState } from 'react'
import { LayoutGroup, motion } from 'framer-motion'
import { createGame, getGlobalSquare, getLegalTokenIds, moveToken, rollDice } from '../game/engine.js'
import { BOARD_COLORS as colors, getBoardSeats } from '../game/board.js'
import { createArenaSocket } from '../services/socket.js'
import { loadDashboard, loadFriends, loadRoomMessages } from '../services/api.js'
import { VoiceChat } from '../components/VoiceChat.jsx'
import './GameRoom.css'

const track = [[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]]
const safeSpaces = new Set([0, 8, 13, 21, 26, 34, 39, 47])
const homeLanes = {
  coral: Array.from({ length: 6 }, (_, index) => [7, index]),
  green: Array.from({ length: 6 }, (_, index) => [index, 7]),
  gold: Array.from({ length: 6 }, (_, index) => [7, 14 - index]),
  blue: Array.from({ length: 6 }, (_, index) => [14 - index, 7]),
}

function playGameSound(kind) {
  if (localStorage.getItem('ludo-arena-sound') === 'off') return
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const duration = kind === 'dice' ? 0.16 : 0.11
  oscillator.type = kind === 'dice' ? 'triangle' : 'sine'
  oscillator.frequency.setValueAtTime(kind === 'dice' ? 520 : 350, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(kind === 'dice' ? 210 : 560, context.currentTime + duration * 0.72)
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + duration + 0.01)
  oscillator.onended = () => context.close()
}

function mergeMessages(current, incoming) {
  const merged = new Map([...incoming, ...current].map((message) => [message.id, message]))
  return [...merged.values()].sort((left, right) => new Date(left.sentAt) - new Date(right.sentAt)).slice(-50)
}

function RoomPanel({ onlineMode, authenticated, room, error, joinCode, setJoinCode, createRoom, joinRoom, spectateRoom, startGame, userId, matchmaking, searching, cancelMatchmaking, spectator, onSignIn }) {
  if (!onlineMode) return null
  if (!authenticated) return <div className="online-room-bar"><div><b>Play online · 1 vs 1</b><small>Sign in to create a room, invite a friend, or find a player.</small></div><button className="button button-dark" onClick={onSignIn}>Sign in <span>→</span></button></div>
  if (!room) return <div className="online-room-bar"><div><b>{searching ? 'Finding a player…' : 'Play online · 1 vs 1'}</b><small>{searching ? 'Waiting for one other player.' : 'Create a private room, watch a game, or find a random player.'}</small></div>{searching ? <button className="button button-soft" onClick={cancelMatchmaking}>Cancel</button> : <><button className="button button-dark" onClick={matchmaking}>Find player <span>↗</span></button><button className="button button-soft" onClick={createRoom}>Create room <span>＋</span></button><span className="room-or">ROOM CODE</span><input className="room-code-input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))} placeholder="6 CHARACTERS" aria-label="Room code"/><button className="button button-soft" disabled={joinCode.length !== 6} onClick={joinRoom}>Join</button><button className="button button-soft" disabled={joinCode.length !== 6} onClick={spectateRoom}>Watch</button></>}{error && <small className="room-error">{error}</small>}</div>
  return <div className="online-room-bar"><div><b>{spectator ? 'Watching' : 'Room'} #{room.code}</b><small>{room.players.length} / 2 players · {room.status === 'playing' ? 'Game in progress' : 'Waiting for one more player'}</small></div><div className="room-players-mini">{room.players.map((player) => <span key={player.userId}>{player.username}{player.online ? ' · online' : ' · reconnecting'}</span>)}</div>{!spectator && room.status === 'waiting' && room.hostId === userId && <button className="button button-dark" disabled={room.players.length < 2} onClick={startGame}>Start game <span>→</span></button>}{error && <small className="room-error">{error}</small>}</div>
}

function HomeZone({ player, color, index, turn, legalTokens, onMove }) {
  const zoneClass = ['home-red', 'home-green', 'home-yellow', 'home-blue'][index]
  return <div className={`board-home ${zoneClass}`}><div className="home-inner">{Array.from({ length: 4 }, (_, tokenIndex) => {
    const progress = player?.tokens[tokenIndex]
    return progress === -1
      ? <motion.button layoutId={`token-${color}-${tokenIndex}`} transition={{ type: 'spring', stiffness: 420, damping: 34 }} key={tokenIndex} className={`yard-piece ${color} ${turn === index && legalTokens.includes(tokenIndex) ? 'token-available' : ''}`} disabled={!player || turn !== index || !legalTokens.includes(tokenIndex)} onClick={() => onMove(tokenIndex)} aria-label={`Move ${player?.name ?? color} token ${tokenIndex + 1}`}/>
      : <span className="yard-empty" key={tokenIndex}/>
  })}</div></div>
}

function ChatPanel({ onlineMode, authenticated, room, messages, value, setValue, onSend, onReact }) {
  return <div className="game-chat"><div className="chat-title"><b>Room chat</b><span>● {onlineMode && authenticated ? room ? room.status === 'playing' ? 'Connected' : 'Room ready' : 'Connect to play' : 'Local room'}</span></div><div className="chat-messages">{messages.map((message) => <p key={message.id}><b>{message.player}</b> {message.emoji || message.text}</p>)}{messages.length === 0 && <p className="system-message">{onlineMode && authenticated ? 'Say hello to your room' : 'Local game · chat with your crew'}</p>}</div><div className="chat-reactions">{['👏', '😂', '🔥', '😮', '💚'].map((emoji) => <button key={emoji} onClick={() => onReact(emoji)} aria-label={`React ${emoji}`}>{emoji}</button>)}</div><form className="chat-input" onSubmit={onSend}><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Say something..." aria-label="Chat message" maxLength={280}/><button aria-label="Send message">↑</button></form></div>
}

export function GameRoom({ onExit, onSignIn, onProfileUpdate, user, onlineMode = false, token = null, userId, initialRoomCode = '', inviteFriendId = '' }) {
  const [game, setGame] = useState(() => createGame({ playerNames: { coral: user?.username ?? 'Player 1', green: 'Player 2' }, playerColors: ['coral', 'green'] }))
  const [rolling, setRolling] = useState(false)
  const [soundsOn, setSoundsOn] = useState(() => localStorage.getItem('ludo-arena-sound') !== 'off')
  const [socket, setSocket] = useState(null)
  const [room, setRoom] = useState(null)
  const [joinCode, setJoinCode] = useState(initialRoomCode)
  const [roomError, setRoomError] = useState('')
  const [searching, setSearching] = useState(false)
  const [spectator, setSpectator] = useState(false)
  const [messages, setMessages] = useState([])
  const [chatValue, setChatValue] = useState('')
  const [roomFriends, setRoomFriends] = useState([])
  const [inviteNotice, setInviteNotice] = useState('')
  const activeRoomCode = useRef(null)
  const activeAsSpectator = useRef(false)
  const chatRoomCode = useRef(null)
  const authenticated = Boolean(token)
  const isOnline = onlineMode && authenticated
  const turn = game.currentPlayer
  const legalTokens = getLegalTokenIds(game)
  const currentName = game.players[turn]?.name ?? 'Player'
  const myPlayerIndex = isOnline && room ? game.players.findIndex((player) => room.players.some((member) => member.color === player.color && member.userId === userId)) : 0
  const boardSeats = getBoardSeats(game.players)

  useEffect(() => { activeRoomCode.current = room?.code ?? initialRoomCode ?? null; activeAsSpectator.current = spectator }, [room?.code, spectator, initialRoomCode])

  useEffect(() => {
    if (!isOnline) return undefined
    const connection = createArenaSocket(token)
    setSocket(connection)
    connection.on('connect', () => {
      if (activeRoomCode.current) connection.emit(activeAsSpectator.current ? 'room:spectate' : 'room:join', { code: activeRoomCode.current }, (result) => {
        if (!result?.ok) { setRoomError(result?.error || 'Could not rejoin that room.'); return }
        setRoom(result.room)
        if (result.game) setGame(result.game)
        if (!activeAsSpectator.current) loadRoomMessages(activeRoomCode.current).then(({ messages: saved }) => setMessages((current) => mergeMessages(current, saved))).catch(() => {})
      })
    })
    connection.on('room:updated', setRoom)
    connection.on('matchmaking:waiting', () => { setSearching(true); setRoomError('') })
    connection.on('matchmaking:matched', ({ room: matchedRoom, game: matchedGame }) => { setSearching(false); setSpectator(false); setRoom(matchedRoom); setGame(matchedGame); setRoomError('') })
    connection.on('room:presence', ({ userId: changedId, online }) => setRoom((current) => current && ({ ...current, players: current.players.map((player) => player.userId === changedId ? { ...player, online } : player) })))
    connection.on('game:state', ({ room: nextRoom, game: nextGame }) => { setRoom(nextRoom); setGame(nextGame); setRoomError('') })
    connection.on('game:chat', (message) => { if (message.roomCode === activeRoomCode.current) setMessages((current) => [...current.slice(-49), message]) })
    connection.on('game:reaction', (reaction) => { if (reaction.roomCode === activeRoomCode.current) setMessages((current) => [...current.slice(-49), reaction]) })
    connection.on('tournament:winner', ({ champion }) => setRoomError(`${champion} won the tournament!`))
    connection.on('tournament:round', ({ round }) => setRoomError(`Tournament advanced to round ${round}.`))
    connection.on('connect_error', (error) => setRoomError(error.message === 'AUTH_REQUIRED' ? 'Your sign-in expired. Sign in again.' : 'Could not connect to the arena server.'))
    connection.connect()
    return () => { connection.disconnect(); setSocket(null) }
  }, [isOnline, token])

  useEffect(() => {
    if (!isOnline || spectator || !room?.code) { setMessages([]); return undefined }
    if (chatRoomCode.current !== room.code) { chatRoomCode.current = room.code; setMessages([]) }
    let active = true
    loadRoomMessages(room.code).then(({ messages: saved }) => {
      if (!active) return
      setMessages((current) => mergeMessages(current, saved))
    }).catch((error) => { if (active && error.message !== 'Only room players can view its chat.') setRoomError(error.message) })
    return () => { active = false }
  }, [isOnline, spectator, room?.code])

  useEffect(() => {
    if (isOnline && room?.status === 'finished') loadDashboard().then(onProfileUpdate).catch(() => {})
  }, [isOnline, room?.status, onProfileUpdate])

  useEffect(() => {
    if (!isOnline || spectator || room?.status !== 'waiting') { setRoomFriends([]); return undefined }
    let active = true
    loadFriends().then(({ friends }) => { if (active) setRoomFriends(friends) }).catch(() => {})
    return () => { active = false }
  }, [isOnline, spectator, room?.code, room?.status])

  useEffect(() => {
    if (!isOnline || !socket || !inviteFriendId || room || initialRoomCode) return
    socket.emit('room:create', { mode: 'private' }, (created) => {
      if (!created?.ok) { setRoomError(created?.error || 'Could not create a room.'); return }
      setRoom(created.room)
      socket.emit('room:invite', { code: created.room.code, recipientId: inviteFriendId }, (result) => {
        setInviteNotice(result?.ok ? 'Game invite sent.' : result?.error || 'Could not send the invite.')
      })
    })
  }, [isOnline, socket, inviteFriendId, room, initialRoomCode])

  const createRoom = () => socket?.emit('room:create', { mode: 'private' }, (result) => result?.ok ? (setSpectator(false), setRoom(result.room), setRoomError('')) : setRoomError(result?.error || 'Could not create a room.'))
  const joinRoom = () => socket?.emit('room:join', { code: joinCode }, (result) => result?.ok ? (setSpectator(false), setRoom(result.room), setRoomError('')) : setRoomError(result?.error || 'Could not join that room.'))
  const spectateRoom = () => socket?.emit('room:spectate', { code: joinCode }, (result) => result?.ok ? (setRoom(result.room), setGame(result.game), setSpectator(true), setRoomError('')) : setRoomError(result?.error || 'Could not watch that game.'))
  const startGame = () => socket?.emit('game:start', { code: room?.code }, (result) => { if (!result?.ok) setRoomError(result?.error || 'Could not start the game.') })
  const inviteFriend = (friendId) => socket?.emit('room:invite', { code: room?.code, recipientId: friendId }, (result) => setInviteNotice(result?.ok ? 'Game invite sent.' : result?.error || 'Could not send the invite.'))
  const findMatch = () => socket?.emit('matchmaking:join', { mode: 'online' }, (result) => { if (!result?.ok) setRoomError(result?.error || 'Could not find a match.'); else if (result.waiting) setSearching(true) })
  const cancelMatchmaking = () => socket?.emit('matchmaking:leave', () => setSearching(false))

  const roll = () => {
    if (isOnline) {
      if (spectator) return
      if (room?.status !== 'playing') return
      playGameSound('dice')
      socket?.emit('game:roll', { code: room.code }, (result) => { if (!result?.ok) setRoomError(result?.error || 'The server rejected that roll.') })
      return
    }
    if (rolling || game.dice !== null || game.status !== 'playing') return
    playGameSound('dice')
    setRolling(true)
    window.setTimeout(() => { setGame((current) => rollDice(current)); setRolling(false) }, 450)
  }

  const move = (tokenIndex) => {
    if (isOnline) {
      if (spectator) return
      if (room?.status !== 'playing') return
      socket?.emit('game:move', { code: room.code, tokenIndex }, (result) => { if (!result?.ok) setRoomError(result?.error || 'The server rejected that move.'); else playGameSound('move') })
      return
    }
    if (game.dice !== null && legalTokens.includes(tokenIndex)) playGameSound('move')
    setGame((current) => moveToken(current, tokenIndex))
  }

  const sendMessage = (event) => {
    event.preventDefault()
    const text = chatValue.trim()
    if (!text) return
    if (isOnline && room) socket?.emit('game:chat', { code: room.code, text }, (result) => { if (!result?.ok) setRoomError(result?.error || 'Could not send that message.') })
    else setMessages((current) => [...current.slice(-19), { id: `${Date.now()}`, player: 'Alex', text }])
    setChatValue('')
  }

  const sendReaction = (emoji) => {
    if (isOnline && room) socket?.emit('game:reaction', { code: room.code, emoji }, (result) => { if (!result?.ok) setRoomError(result?.error || 'Could not send that reaction.') })
    else setMessages((current) => [...current.slice(-19), { id: `${Date.now()}-${Math.random()}`, player: 'Alex', emoji }])
  }

  const heading = room ? `Room ${room.code}` : onlineMode ? 'Online 1 vs 1' : 'Offline 1 vs 1'
  return <div className="game-page">
    <div className="game-topline"><div><span className="eyebrow">{isOnline ? `REAL-TIME MULTIPLAYER · ${room ? `#${room.code}` : 'ROOM SETUP'}` : 'LOCAL TWO-PLAYER GAME'}</span><h1>{heading}</h1></div><button className="button button-soft" onClick={onExit}>← Back to arena</button></div>
    <RoomPanel onlineMode={onlineMode} authenticated={authenticated} room={room} error={roomError} joinCode={joinCode} setJoinCode={setJoinCode} createRoom={createRoom} joinRoom={joinRoom} spectateRoom={spectateRoom} startGame={startGame} userId={userId} matchmaking={findMatch} searching={searching} cancelMatchmaking={cancelMatchmaking} spectator={spectator} onSignIn={onSignIn}/>
    {isOnline && room?.status === 'waiting' && !spectator && <div className="online-room-bar"><div><b>Invite a friend</b><small>Invites expire after two hours and only accepted friends can join.</small></div><div className="room-invite-list">{roomFriends.filter((friend) => !room.players.some((player) => player.userId === friend._id)).map((friend) => <button className="button button-soft" key={friend._id} onClick={() => inviteFriend(friend._id)}>Invite {friend.username}</button>)}{roomFriends.length === 0 && <small>Add friends in your community page to invite them.</small>}</div>{inviteNotice && <small>{inviteNotice}</small>}</div>}
      <div className="game-layout"><div className="board-column">
      <div className="game-player-strip">{game.players.map((player, index) => { const mine = index === myPlayerIndex; return <div key={player.color} className={`game-player ${turn === index ? 'active' : ''}`}><span className={`player-piece ${player.color}`}>{player.name[0]}</span><div><b>{player.name}{mine && isOnline ? ' (You)' : ''}</b><small>{turn === index ? mine ? 'Your turn' : 'Playing now' : 'In the game'}</small></div>{turn === index && <i className="turn-live"/>}</div>})}</div>
      <div className={`ludo-board ${user?.boardTheme ?? 'board-classic'}`}><LayoutGroup id={`ludo-${room?.code ?? 'local'}`}>{boardSeats.map(({ color, index, player }) => <HomeZone key={color} player={player} color={color} index={index} turn={turn} legalTokens={legalTokens} onMove={move}/>)}<div className="path-track">
        {Object.entries(homeLanes).flatMap(([color, lane]) => lane.map(([row, col], index) => {
          const playerIndex = colors.indexOf(color)
          const tokenIndexes = (boardSeats[playerIndex].player?.tokens ?? []).flatMap((progress, tokenIndex) => progress === 51 + index ? [tokenIndex] : [])
          return <button key={`${color}-home-${index}`} className={`home-lane-space ${color}`} style={{ gridColumn: col + 1, gridRow: row + 1 }} onClick={() => tokenIndexes.some((tokenIndex) => playerIndex === turn && legalTokens.includes(tokenIndex)) && move(tokenIndexes.find((tokenIndex) => playerIndex === turn && legalTokens.includes(tokenIndex)))} aria-label={`${color} home lane ${index + 1}`}>{tokenIndexes.map((tokenIndex) => <motion.span layoutId={`token-${color}-${tokenIndex}`} transition={{ type: 'spring', stiffness: 420, damping: 34 }} key={tokenIndex} className={`moving-piece ${color}`}/>)}</button>
        }))}
        {track.map(([row, col], spot) => {
          const occupants = game.players.flatMap((player, playerIndex) => player.tokens.map((progress, tokenIndex) => getGlobalSquare(player.color, progress) === spot ? { player: playerIndex, token: tokenIndex } : null).filter(Boolean))
          return <button key={spot} style={{ gridColumn: col + 1, gridRow: row + 1 }} className={`path-space ${safeSpaces.has(spot) ? 'safe-space' : ''}`} aria-label={`Track space ${spot + 1}`} onClick={() => { const own = occupants.find((entry) => entry.player === turn); if (own && legalTokens.includes(own.token)) move(own.token) }}>{occupants.map((entry) => <motion.span layoutId={`token-${colors[entry.player]}-${entry.token}`} transition={{ type: 'spring', stiffness: 420, damping: 34 }} key={`${entry.player}-${entry.token}`} className={`moving-piece ${colors[entry.player]}`}/>)}</button>
        })}
        <div className="board-center"><div className="finish-pieces">{game.players.flatMap((player) => player.tokens.map((progress, tokenIndex) => progress === 57 ? <motion.span layoutId={`token-${player.color}-${tokenIndex}`} transition={{ type: 'spring', stiffness: 420, damping: 34 }} key={`${player.color}-${tokenIndex}`} className={`moving-piece ${player.color}`}/> : null))}</div><div className="center-star">✦</div><span>{game.winner ? 'WINNER' : 'ARENA'}</span></div>
      </div></LayoutGroup></div>
      <ChatPanel onlineMode={onlineMode} authenticated={authenticated} room={room} messages={messages} value={chatValue} setValue={setChatValue} onSend={sendMessage} onReact={sendReaction}/>
    </div><aside className="game-control">
      <div className="game-round"><span className="eyebrow">ROUND {String(game.turnNumber).padStart(2, '0')}</span><b>Classic 1 vs 1 Ludo</b><small>First player to bring all tokens home wins</small></div>
      <div className="turn-card"><div className="turn-card-label">CURRENT TURN</div><div className="turn-player"><span className={`player-piece ${game.players[turn].color}`}>{currentName[0]}</span><div><b>{game.winner ? `${currentName} wins!` : currentName}</b><small>{isOnline ? turn === myPlayerIndex ? 'That’s you' : 'Opponent is playing' : `${currentName}'s turn`}</small></div></div></div>
      <div className="dice-area"><button className={`large-die ${user?.diceSkin ?? 'dice-classic'} ${rolling ? 'shake' : ''}`} onClick={roll} aria-label="Roll dice" disabled={spectator || game.dice !== null || (isOnline && room?.status !== 'playing')}><span>{rolling ? '⚄' : game.dice ?? '⚄'}</span></button><small>{spectator?'Spectator mode':game.dice ? 'Choose a highlighted token' : isOnline && room?.status !== 'playing' ? 'Start the room to roll' : 'Tap to roll'}</small></div>
      <button className="button button-dark full-button" onClick={() => legalTokens.length === 1 ? move(legalTokens[0]) : roll()} disabled={spectator || game.status === 'finished' || (isOnline && room?.status !== 'playing')}>{spectator ? 'Watching' : game.dice && legalTokens.length === 1 ? 'Move token' : game.dice ? 'Choose a token' : isOnline ? `Roll ${turn === myPlayerIndex ? 'your' : 'the'} dice` : `Roll ${currentName}'s dice`} <span>→</span></button>
      <div className="game-control-divider"/><div className="room-tools"><button onClick={() => navigator.clipboard?.writeText(room?.code ?? '')}><span>♧</span> Copy room code <b>＋</b></button><button onClick={() => { const next = !soundsOn; setSoundsOn(next); localStorage.setItem('ludo-arena-sound', next ? 'on' : 'off') }} aria-pressed={soundsOn}><span>◖</span> Sound effects <b className={soundsOn ? 'toggle-on' : ''}>{soundsOn ? 'On' : 'Off'}</b></button><button><span>⚑</span> Report a problem <b>↗</b></button></div><VoiceChat room={room} socket={socket} userId={userId}/><div className="game-note"><span>✦</span><p>Have fun and play fair.<br/><b>Good luck, everyone!</b></p></div>
    </aside></div>
  </div>
}
