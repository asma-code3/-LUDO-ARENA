import { useEffect, useRef, useState } from 'react'
import { loadVoiceCredentials } from '../services/api.js'

const defaultIceServers = [{ urls: 'stun:stun.l.google.com:19302' }]

export function VoiceChat({ room, socket, userId }) {
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState('')
  const [streams, setStreams] = useState({})
  const localStream = useRef(null)
  const peers = useRef(new Map())
  const rtcConfig = useRef({ iceServers: defaultIceServers })
  const roomCode = room?.code
  const playerIds = room?.players?.map((player) => player.userId).filter((id) => id !== userId).join(',') ?? ''

  useEffect(() => {
    if (!enabled || !socket || !roomCode || !localStream.current) return undefined
    const playerList = playerIds ? playerIds.split(',') : []
    const sendSignal = (to, signal) => socket.emit('voice:signal', { code: roomCode, to, signal })
    const makePeer = (peerId) => {
      if (peers.current.has(peerId)) return peers.current.get(peerId)
      const peer = new RTCPeerConnection(rtcConfig.current)
      peer.polite = String(userId) > String(peerId)
      peer.makingOffer = false
      peer.ignoreOffer = false
      peer.isSettingRemoteAnswerPending = false
      localStream.current.getTracks().forEach((track) => peer.addTrack(track, localStream.current))
      peer.onicecandidate = (event) => { if (event.candidate) sendSignal(peerId, { type: 'candidate', candidate: event.candidate }) }
      peer.ontrack = (event) => setStreams((current) => ({ ...current, [peerId]: event.streams[0] }))
      peer.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true
          await peer.setLocalDescription()
          sendSignal(peerId, { type: peer.localDescription.type, description: peer.localDescription })
        } catch (cause) { setError(cause.message || 'Could not start voice chat.') }
        finally { peer.makingOffer = false }
      }
      peer.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) setStreams((current) => { const next = { ...current }; delete next[peerId]; return next })
      }
      peers.current.set(peerId, peer)
      return peer
    }
    const onSignal = async ({ from, signal }) => {
      if (!playerList.includes(from)) return
      const peer = makePeer(from)
      try {
        if (signal.type === 'offer' || signal.type === 'answer') {
          const readyForOffer = !peer.makingOffer && (peer.signalingState === 'stable' || peer.isSettingRemoteAnswerPending)
          const offerCollision = signal.type === 'offer' && !readyForOffer
          peer.ignoreOffer = !peer.polite && offerCollision
          if (peer.ignoreOffer) return
          peer.isSettingRemoteAnswerPending = signal.type === 'answer'
          if (offerCollision) await peer.setLocalDescription({ type: 'rollback' })
          await peer.setRemoteDescription(signal.description)
          peer.isSettingRemoteAnswerPending = false
          if (signal.type === 'offer') {
            await peer.setLocalDescription()
            sendSignal(from, { type: 'answer', description: peer.localDescription })
          }
        } else if (signal.type === 'candidate' && signal.candidate) {
          if (!peer.ignoreOffer) await peer.addIceCandidate(signal.candidate)
        }
      } catch (cause) { setError(cause.message || 'Could not connect voice chat.') }
    }
    socket.on('voice:signal', onSignal)
    playerList.forEach(makePeer)
    return () => {
      socket.off('voice:signal', onSignal)
      for (const peer of peers.current.values()) peer.close()
      peers.current.clear()
      setStreams({})
    }
  }, [enabled, socket, roomCode, playerIds, userId])

  useEffect(() => () => { localStream.current?.getTracks().forEach((track) => track.stop()) }, [])

  const toggle = async () => {
    setError('')
    if (enabled) {
      setEnabled(false)
      localStream.current?.getTracks().forEach((track) => track.stop())
      localStream.current = null
      return
    }
    try {
      const streamRequest = navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const credentialsRequest = loadVoiceCredentials().catch(() => null)
      const [stream, credentials] = await Promise.all([streamRequest, credentialsRequest])
      localStream.current = stream
      rtcConfig.current = { iceServers: credentials?.iceServers?.length ? credentials.iceServers : defaultIceServers }
      setEnabled(true)
    } catch (cause) {
      setError(cause.name === 'NotAllowedError' ? 'Allow microphone access to use voice chat.' : 'A microphone could not be found.')
    }
  }

  return <div className="voice-chat"><button className={`voice-toggle ${enabled ? 'voice-on' : ''}`} onClick={toggle} disabled={!roomCode || !socket}>{enabled ? '🎙 Mic on' : '🎙 Voice chat'}</button>{error && <small>{error}</small>}{Object.entries(streams).map(([peerId, stream]) => <RemoteAudio key={peerId} stream={stream}/>)}</div>
}

function RemoteAudio({ stream }) {
  const audio = useRef(null)
  useEffect(() => { if (audio.current) audio.current.srcObject = stream }, [stream])
  return <audio ref={audio} autoPlay playsInline />
}
