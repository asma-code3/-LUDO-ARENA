import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'

export function createArenaSocket(token) {
  return io(SOCKET_URL, { autoConnect: false, auth: { token }, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 700 })
}
