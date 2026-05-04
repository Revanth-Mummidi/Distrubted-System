# Distributed Task Queue System

A production-grade, microservice-based distributed task queue built with Node.js, Redis, BullMQ, React, and Docker.

## Architecture
- **API Gateway (Express)**: Manages JWT Auth and Request Rate Limiting. Proxies to backend services.
- **Job Ingestion Service**: Submits jobs to BullMQ Redis queues, supports Priority, Delays, and exponential backoff retries.
- **Job Status Service**: Monitors queue events using `QueueEvents` and broadcasts real-time updates to the React app via Socket.io.
- **Worker Pools**: Three isolated worker pools (`email` [concurrency: 10], `data_processing` [concurrency: 20], `report_generation` [concurrency: 5]) simulating real processing.
- **Notification Service**: Listens for completed/failed jobs across all queues and fires webhook callbacks if specified.
- **React Frontend**: A dynamic Vite React application showing live queue depths, success/failure analytics via Recharts, throughput metrics, and a task submission UI.
- **Redis**: The backbone for BullMQ persistence and communication.

## Quick Start

1. Ensure [Docker Desktop](https://www.docker.com/) is installed and running.
2. Clone this repository and navigate to the project directory.
3. Run `docker-compose up --build`
4. Access the frontend dashboard at `http://localhost:5173`.
5. Access the API gateway at `http://localhost:3000`.

## Load Testing

1. In the project root, run `npm install` to install `autocannon`.
2. Ensure the system is running using `docker-compose up`.
3. Run `npm run load-test` (or `node load-test.js`) to fire 10,000+ jobs via high concurrency autocannon script.
4. Watch the enqueue latency in the command prompt and live throughput metrics on the React dashboard!
