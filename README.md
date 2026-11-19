# Ludo Arena

Ludo Arena is an interactive Ludo platform under active development. The repository is split into a Vite React client and an Express/MongoDB API.

## Run the frontend

Use Node.js 22.12 or later, then install from the checked-in lockfile:

```powershell
cd frontend
npm ci
npm run dev
```

The Vite client runs at `http://localhost:5173`; its API and Socket.IO clients connect to `http://localhost:4000` by default. Override the API addresses with `VITE_API_URL` and `VITE_SOCKET_URL` when needed.

## Run the backend

```powershell
cd backend
Copy-Item .env.example .env
npm ci
npm run dev
```

Set `MONGODB_URI` and a private `JWT_SECRET` in `backend/.env`. MongoDB must be running before the API starts.

## Important files

- `frontend/app.jsx` mounts the app shell and page navigation.
- `frontend/src/pages/Dashboard.jsx` contains the arena dashboard and game-mode entry points.
- `frontend/src/pages/GameRoom.jsx` renders local, AI, and online room play.
- `frontend/src/pages/CustomizationPage.jsx` purchases and equips avatars, board themes, and dice skins with virtual coins.
- `frontend/src/pages/RewardsPage.jsx` displays daily rewards, challenge progress, and unlocked or locked achievements.
- `frontend/src/pages/SettingsPage.jsx` controls local appearance and sound plus the server-enforced friend invite preference.
- `frontend/src/game/engine.js` contains the shared Ludo rules used by the client and API.
- `backend/src/server.js` starts Express, MongoDB, and Socket.IO.
- `backend/src/sockets/gameSocket.js` authenticates live connections and validates room/game actions on the server.
- `backend/src/services/challenges.js` creates the daily win challenge, records progress from server-confirmed match results, and grants its virtual prize once.
- `backend/src/models/` contains the MongoDB schemas.
- `DEPLOYMENT.md` documents environment setup, production startup checks, Redis-backed multi-instance Socket.IO, and a two-instance smoke test.

## Current implementation status

The live dashboard offers offline two-player games and online one-versus-one rooms or matchmaking. Registration/sign-in, MongoDB models, daily login rewards and win challenges, achievements, virtual coin cosmetics, leaderboard/history APIs, friend requests and game invites, tournament registration and automatic brackets, spectator joins, authenticated Socket.IO game/chat/reaction handlers, persisted room chat, and WebRTC voice signaling are implemented. Online rooms enforce a two-player limit. Tournament brackets create match rooms, advance winners, announce champions, and award virtual coins and XP. Match results update history, wins, XP, levels, and virtual coins. Authenticated app sockets maintain player presence across pages, friend invite preferences are enforced by the API, and room creation, matchmaking, chat, reactions, invites, and voice signaling have per-socket rate limits. Rewards displays unlocked and locked achievement milestones. The seed command creates daily/weekly tournament listings and the achievement catalog.

Production startup checks and deployment instructions are in place. Setting `REDIS_URL` enables cross-instance Socket.IO, shared matchmaking, and distributed per-room action locks; room state remains in MongoDB. Without Redis, run a single API instance. Daily/weekly tournament slots are generated automatically by the server scheduler and use unique series keys to avoid duplicates; `npm run seed` creates the next slots and achievement catalog. Cosmetic ownership and equipped avatar, dice skin, and board theme are saved in MongoDB; purchases spend virtual coins only. Accepted friends can receive persisted two-hour game invites through the app inbox. Daily challenge progress is stored by UTC day and awards 300 virtual coins plus 100 XP after two wins. Voice chat uses short-lived TURN credentials when configured, with STUN fallback; microphone permissions and HTTPS are required outside localhost. Virtual coins are game points only. Online rooms and their latest 50 chat messages are stored in MongoDB and room players can restore chat after reconnecting.

## Checks

```powershell
cd frontend; npm test; npm run build
cd frontend; npm run test:online # requires the API and MongoDB running
cd ../backend; npm test
npm run test:challenges # requires MongoDB running
npm run test:tournaments # requires MongoDB running
```

For Redis-backed multi-instance verification, follow the two-instance smoke-test steps in `DEPLOYMENT.md` and set `TEST_SOCKET_URL_SECOND` to the second API instance.

Run `cd backend; npm run seed` once to create the starter daily/weekly tournaments and achievement catalog.
"# -LUDO-ARENA" 
