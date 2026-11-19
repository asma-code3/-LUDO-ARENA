# Deployment setup

Ludo Arena deploys as a static Vite client, a Node.js API/Socket.IO service, and MongoDB.

## Render Blueprint

The repository-root `render.yaml` defines a free API web service and a free static frontend. It wires the public API, Socket.IO, and client CORS origins between the two services, generates a private JWT secret, and runs the idempotent seed command before starting the API. The frontend and API build and test workflows run in GitHub Actions; Render deploys after checks pass.

To deploy, push this repository to GitHub, connect the repository to Render, and create a Blueprint from `render.yaml`. Enter the MongoDB Atlas connection string as `MONGODB_URI` when Render requests it. Keep that URI in Render's environment settings; do not commit it to the repository. The generated JWT secret and service URLs are configured by the Blueprint.

The free API service can spin down after inactivity and may take time to wake for the next request. Use it for a preview or hobby deployment; choose a paid always-on service before relying on real-time matches in production. See [Render's free service limits](https://render.com/docs/free).

## API service

Use Node.js 22.12 or later. Configure these environment variables in the hosting provider:

- `NODE_ENV=production`
- `PORT` to the port assigned by the host
- `MONGODB_URI` to a private MongoDB Atlas connection string
- `JWT_SECRET` to a randomly generated secret of at least 32 characters
- `REDIS_URL` to a private Redis URL (`rediss://` recommended in managed hosting) when running more than one API instance
- `CLIENT_ORIGIN` to the exact HTTPS client origin, such as `https://ludo.example.com`
- `TURN_URL` and `TURN_SHARED_SECRET` (optional but recommended for voice chat), using Coturn REST authentication and a secret of at least 32 characters

The API rejects short/example JWT secrets and non-HTTPS client origins in production. Build and start it with:

```powershell
cd backend
npm ci
npm run seed
npm start
```

Point the provider health check to `/api/health`. It returns HTTP 503 until MongoDB is connected, and also checks both Redis clients when `REDIS_URL` is configured.

## Web client

Copy `frontend/.env.example` to the hosting provider's build environment and replace both example addresses with the API's HTTPS origin. Build the static site with:

```powershell
cd frontend
npm ci
npm run build
```

Publish `frontend/dist` and set the API's `CLIENT_ORIGIN` to the published site origin. Rebuild the client after changing its `VITE_*` variables because Vite embeds them into the static output.

## Multiple API instances

Set `REDIS_URL` on every API instance to enable Socket.IO Redis Pub/Sub, an atomic shared matchmaking queue, shared per-room action locks, and cross-instance player/invite/voice events. Game room state remains persisted in MongoDB. Configure the load balancer for Socket.IO sticky sessions when it allows HTTP long-polling, and ensure WebSocket upgrades are supported. If Redis is unset, run one API instance; queues and locks then use local memory. Protect Redis with private networking, TLS, and dedicated credentials.

To verify a two-instance setup, start the API twice with the same `MONGODB_URI`, `JWT_SECRET`, and `REDIS_URL`, using `PORT=4001` and `PORT=4002`. Then run the online smoke script with `TEST_API_URL=http://127.0.0.1:4001/api`, `TEST_SOCKET_URL=http://127.0.0.1:4001`, and `TEST_SOCKET_URL_SECOND=http://127.0.0.1:4002`. The smoke flow places players on both instances and exercises room joins, game state broadcasts, voice signaling, invites, reconnects, and random matchmaking across the shared adapter.

Voice chat uses short-lived TURN credentials when `TURN_URL` and `TURN_SHARED_SECRET` are configured, with a public STUN fallback; voice also requires HTTPS and users' microphone permission. Keep MongoDB network access restricted to the API host, rotate `JWT_SECRET` if exposed, and use a managed HTTPS frontend/API host before opening public registration.
