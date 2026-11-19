const QUEUE_KEYS = ['arena:{ludo}:matchmaking:online', 'arena:{ludo}:matchmaking:team']

const JOIN_QUEUE_SCRIPT = `
local userId = ARGV[1]
local socketId = ARGV[2]
local username = ARGV[3]
local mode = ARGV[4]
local needed = tonumber(ARGV[5])
local now = tonumber(ARGV[6])
local staleBefore = now - 45000
for _, key in ipairs(KEYS) do
  local entries = redis.call('LRANGE', key, 0, -1)
  for _, raw in ipairs(entries) do
    local item = cjson.decode(raw)
    if item.userId == userId or tonumber(item.enqueuedAt) < staleBefore then
      redis.call('LREM', key, 1, raw)
    end
  end
end
local target = mode == 'team' and KEYS[2] or KEYS[1]
local candidates = redis.call('LRANGE', target, 0, needed - 1)
if #candidates < needed then
  redis.call('RPUSH', target, cjson.encode({ userId = userId, socketId = socketId, username = username, mode = mode, enqueuedAt = now }))
  redis.call('EXPIRE', target, 600)
  return { 0 }
end
for _, raw in ipairs(candidates) do redis.call('LREM', target, 1, raw) end
local result = { 1 }
for _, raw in ipairs(candidates) do table.insert(result, raw) end
return result
`

const LEAVE_QUEUE_SCRIPT = `
local userId = ARGV[1]
local socketId = ARGV[2]
for _, key in ipairs(KEYS) do
  local entries = redis.call('LRANGE', key, 0, -1)
  for _, raw in ipairs(entries) do
    local item = cjson.decode(raw)
    if item.userId == userId and (socketId == '' or item.socketId == socketId) then redis.call('LREM', key, 1, raw) end
  end
end
return 1
`

const REQUEUE_SCRIPT = `
local now = tonumber(ARGV[1])
for index = 2, #ARGV do
  local item = cjson.decode(ARGV[index])
  local exists = false
  for _, key in ipairs(KEYS) do
    for _, raw in ipairs(redis.call('LRANGE', key, 0, -1)) do
      if cjson.decode(raw).userId == item.userId then exists = true end
    end
  end
  if not exists then
    item.enqueuedAt = now
    local target = item.mode == 'team' and KEYS[2] or KEYS[1]
    redis.call('RPUSH', target, cjson.encode(item))
    redis.call('EXPIRE', target, 600)
  end
end
return 1
`

export async function joinSharedMatchmakingQueue(redis, { userId, socketId, username, mode, playersNeeded }) {
  const result = await redis.eval(JOIN_QUEUE_SCRIPT, QUEUE_KEYS.length, ...QUEUE_KEYS, userId, socketId, username, mode, String(playersNeeded), String(Date.now()))
  return { waiting: Number(result[0]) === 0, candidates: result.slice(1).map((entry) => JSON.parse(entry)) }
}

export async function leaveSharedMatchmakingQueue(redis, userId, socketId = '') {
  return redis.eval(LEAVE_QUEUE_SCRIPT, QUEUE_KEYS.length, ...QUEUE_KEYS, userId, socketId)
}

export async function requeueSharedMatchmakingPlayers(redis, players) {
  if (!players.length) return
  return redis.eval(REQUEUE_SCRIPT, QUEUE_KEYS.length, ...QUEUE_KEYS, String(Date.now()), ...players.map((player) => JSON.stringify(player)))
}
