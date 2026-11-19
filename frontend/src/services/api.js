const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const TOKEN_KEY = 'ludo-arena-token'

export const authToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export async function apiRequest(path, { token = authToken.get(), ...options } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}

export const registerAccount = (payload) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(payload), token: null })
export const loginAccount = (payload) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(payload), token: null })
export const loadDashboard = () => apiRequest('/arena/dashboard')
export const updateAccountSettings = (settings) => apiRequest('/arena/settings', { method: 'PATCH', body: JSON.stringify(settings) })
export const claimDailyReward = () => apiRequest('/arena/rewards/daily', { method: 'POST', body: '{}' })
export const loadFriends = () => apiRequest('/community/friends')
export const loadFriendRequests = () => apiRequest('/community/requests')
export const loadGameInvites = () => apiRequest('/community/invites')
export const respondToGameInvite = (id, action) => apiRequest(`/community/invites/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) })
export const searchPlayers = (query) => apiRequest(`/community/search?q=${encodeURIComponent(query)}`)
export const sendFriendRequest = (userId) => apiRequest(`/community/requests/${userId}`, { method: 'POST', body: '{}' })
export const respondToFriendRequest = (requestId, accept) => apiRequest(`/community/requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ accept }) })
export const loadTournaments = () => apiRequest('/tournaments')
export const loadTournamentHistory = () => apiRequest('/tournaments/history')
export const registerTournament = (id) => apiRequest(`/tournaments/${id}/register`, { method: 'POST', body: '{}' })
export const loadLeaderboard = () => apiRequest('/arena/leaderboard')
export const loadHistory = () => apiRequest('/arena/history')
export const loadAchievements = () => apiRequest('/arena/achievements')
export const loadVoiceCredentials = () => apiRequest('/arena/voice-credentials')
export const loadDailyChallenge = () => apiRequest('/arena/challenges/daily')
export const loadRoomMessages = (code) => apiRequest(`/chat/${encodeURIComponent(code)}/messages`)
export const loadCosmetics = () => apiRequest('/arena/cosmetics')
export const purchaseCosmetic = (id) => apiRequest(`/arena/cosmetics/${encodeURIComponent(id)}/purchase`, { method: 'POST', body: '{}' })
export const equipCosmetic = (itemId) => apiRequest('/arena/cosmetics/equip', { method: 'PATCH', body: JSON.stringify({ itemId }) })
