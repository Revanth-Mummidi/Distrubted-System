# Distributed Task Queue System

A production-grade, microservice-based distributed task queue built with Node.js, Redis, BullMQ, React, and Docker. Targets 10,000+ concurrent async jobs with <100 ms enqueue latency.

## Architecture

- **API Gateway** ([gateway/](gateway/)) — Express; JWT auth + rate limiting; proxies `/api/jobs` to ingestion.
- **Job Ingestion** ([ingestion/](ingestion/)) — REST endpoint that pushes jobs onto BullMQ priority queues (HIGH / NORMAL / LOW), with delay and exponential backoff (max 3 retries).
- **Job Status** ([status/](status/)) — Subscribes to `QueueEvents`, broadcasts live queue depth, throughput, and per-job updates over Socket.io.
- **Notification** ([notification/](notification/)) — Listens for `completed` / `failed` events; fires webhook callbacks if `webhookUrl` was provided at submission.
- **Worker Pool** ([worker/](worker/)) — One process running three BullMQ workers: `email` (concurrency 10), `data_processing` (20), `report_generation` (5).
- **React Frontend** ([frontend/](frontend/)) — Vite + Recharts dashboard with live queue depth, throughput chart, recent-job feed, and a submission form.
- **Redis** — BullMQ persistence and pub/sub.

```
browser ──► frontend (5173) ──► gateway (3000) ──► ingestion (3001) ──► Redis ──► worker
                              \─► status (3002) ◄── QueueEvents ─────────┘
                                                                         └─► notification (webhooks)
```

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 24+ | Required for the Docker path |
| [Node.js](https://nodejs.org/) | 18 LTS | Required for the local-dev path |
| [npm](https://www.npmjs.com/) | 9+ | Comes with Node.js |

## Quick Start — Docker (recommended)

1. Install [Docker Desktop](https://www.docker.com/) and make sure it is running.
2. Clone the repo and open a terminal in its root directory.
3. Copy the env template (optional — sensible defaults are already baked in):
   ```bash
   cp .env.example .env
   ```
4. Build images and start all services:
   ```bash
   docker-compose up --build
   ```
5. Open the dashboard: [http://localhost:5173](http://localhost:5173)
6. Gateway API base URL: [http://localhost:3000](http://localhost:3000)

To stop everything and remove volumes:
```bash
docker-compose down -v
```

### Port reference

| Service | Host port | Description |
|---------|-----------|-------------|
| Frontend | 5173 | React dashboard |
| Gateway | 3000 | API entry point (JWT auth, rate-limit, proxy) |
| Ingestion | 3001 | Job submission REST endpoint |
| Status | 3002 | Socket.io real-time feed |
| Redis | 6380 | BullMQ backing store (mapped from container 6379) |

---

## Local Development (without Docker)

Use this path if you want to iterate quickly on a single service without rebuilding containers.

### 1. Start Redis

The easiest way is still Docker for just Redis:
```bash
docker run -d -p 6379:6379 --name arena-redis redis:7-alpine
```
Or install Redis locally (`brew install redis && brew services start redis` on macOS).

### 2. Install dependencies for each service

Run the following from the repo root — each service is an independent Node package:

```bash
cd gateway      && npm install && cd ..
cd ingestion    && npm install && cd ..
cd status       && npm install && cd ..
cd notification && npm install && cd ..
cd worker       && npm install && cd ..
cd frontend     && npm install && cd ..
```

### 3. Start each service in its own terminal tab

```bash
# Tab 1 — Gateway (port 3000)
cd gateway && node index.js

# Tab 2 — Ingestion (port 3001)
cd ingestion && node index.js

# Tab 3 — Status / WebSocket (port 3002)
cd status && node index.js

# Tab 4 — Notification (webhook dispatcher)
cd notification && node index.js

# Tab 5 — Worker pool
cd worker && node index.js

# Tab 6 — Frontend dev server (port 5173, with HMR)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — the frontend talks to `localhost:3000` (gateway) and `localhost:3002` (status WebSocket) directly.

> **Note:** The frontend hardcodes `localhost` URLs in [frontend/src/App.tsx](frontend/src/App.tsx). If you change any ports, update `GATEWAY_URL` and `WS_URL` there.

---

## What Was Wrong (and Fixed)

If you cloned this repo and the stack crashed, the recent fixes were:

- **`status` and `notification` services were missing `bullmq` (and `notification` was missing `ioredis`) in their `package.json`** — both crashed on startup with `Cannot find module 'bullmq'`. Added.
- **`docker-compose.yml` referenced `${JWT_SECRET}` with no default** — emitted a warning and passed empty string. Now uses `${JWT_SECRET:-super_secret_jwt_key_12345}` and added healthchecks so dependent services wait for Redis.
- **`.env.example`** added so the JWT secret is documented.

If you previously built with the broken deps, force a rebuild: `docker-compose build --no-cache status notification`.

## Testing

### 1. Smoke test (manual)

After `docker-compose up --build`:

```bash
# Get a JWT
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login | jq -r .token)

# Submit a high-priority email job
curl -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"email","priority":"HIGH","payload":{"to":"a@b.com"}}'

# Submit a delayed data-processing job
curl -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"data_processing","priority":"NORMAL","delay":2000,"payload":{"rows":500}}'
```

Then watch the dashboard at <http://localhost:5173> — the throughput chart, queue depth, and live feed should update in real time.

### 2. Webhook test

Use a free request bin (e.g. `webhook.site`) and submit:

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"email","priority":"HIGH","payload":{"to":"a@b.com"},"webhookUrl":"https://webhook.site/<your-id>"}'
```

Workers have a 10% random-failure rate, so retries (with exponential backoff) and the dead-letter queue are exercised automatically. After 4 total attempts the job lands in the `failed` set — visible in the dashboard and forwarded to the webhook.

### 3. Load test (10k+ jobs, <100 ms enqueue)

From the repo root:

```bash
npm install        # installs autocannon
npm run load-test  # 500 connections × 10 pipelining × 20s against /api/jobs
```

Look for **`Latency` (avg / p99)** in the autocannon output — that's the enqueue latency through the gateway. While it runs, the React dashboard shows live `jobs/sec` throughput as the worker pool drains the backlog.

### 4. Per-service logs

```bash
docker-compose logs -f gateway
docker-compose logs -f ingestion
docker-compose logs -f worker
docker-compose logs -f status
docker-compose logs -f notification
```

You should see workers logging `Processing email job <id>`, occasional `Random simulated failure` lines (those exercise the retry path), and the status service logging socket connections.

### 5. Redis inspection

```bash
docker-compose exec redis redis-cli
> KEYS bull:*
> XLEN bull:email:events
```

## Job submission contract

`POST /api/jobs` (Bearer JWT optional in dev — gateway falls back to a demo user)

```json
{
  "type": "email | data_processing | report_generation",
  "priority": "HIGH | NORMAL | LOW",
  "delay": 0,
  "payload": { "anything": "goes" },
  "webhookUrl": "https://example.com/callback"
}
```

Response: `{ "success": true, "jobId": "123", "type": "email" }`.

Retry policy: `attempts: 4` (1 initial + 3 retries), `backoff: exponential, 1000ms base`.

## Project layout

```
.
├── docker-compose.yml
├── .env.example
├── gateway/         # Express + JWT + rate-limit + proxy
├── ingestion/       # POST /api/jobs → BullMQ
├── status/          # Socket.io + QueueEvents fan-out
├── notification/    # Webhook dispatcher
├── worker/          # 3 BullMQ workers (email/data/report)
├── frontend/        # Vite + React + Recharts dashboard
└── load-test.js     # autocannon driver
```
