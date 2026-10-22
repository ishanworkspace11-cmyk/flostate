# THE DORMAMMU LOOP — Distributed DAG Workflow & Automation Engine

> *"Dormammu, I've come to bargain!"* — An enterprise-grade, visual Directed Acyclic Graph (DAG) orchestration and automation engine designed for resilient, distributed task execution, durable state persistence, and real-time observability.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-Express%20v4-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7%20%2F%20BullMQ-dc382d.svg)](https://redis.io/)
[![React Flow](https://img.shields.io/badge/@xyflow/react-12.4-ff0072.svg)](https://reactflow.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8.svg)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-95%20Tests%20Passing-success.svg)](https://vitest.dev/)

---

## 1. Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │    React 18 + React Flow Frontend    │
                      │  (Canvas, Live SSE Logs, Dashboards) │
                      └──────────────────┬───────────────────┘
                                         │  HTTP / SSE
                                         ▼
                      ┌──────────────────────────────────────┐
                      │      Express v4 REST & Ingress       │
                      │  (Rate Limiter, Helmet, CORS, SSRF)  │
                      └─────────┬──────────────────┬─────────┘
                                │                  │
             Topological Order  │                  │  Queue Dispatch
             & State Records    ▼                  ▼
      ┌───────────────────────────────┐      ┌──────────────────────────────┐
      │   PostgreSQL 16 (Prisma ORM)  │      │     Redis 7 + BullMQ Queues  │
      │ Workflows, Runs, Nodes, Logs  │      │  Ready Nodes, Delays, Retries│
      └───────────────────────────────┘      └──────────────┬───────────────┘
                                                            │
                                        Distributed Pull    │  Job Leases
                                                            ▼
                                             ┌─────────────────────────────┐
                                             │    BullMQ Worker Daemon     │
                                             │ (SSRF Filter, Node Engine,  │
                                             │  Heartbeat Telemetry Loop)  │
                                             └─────────────────────────────┘
```

The system orchestrates visual DAG workflows through clear separation of concerns:
1. **Frontend Canvas & Observability**: React 18 SPA utilizing `@xyflow/react` for drag-and-drop workflow authoring, live step-by-step Server-Sent Events (SSE) telemetry, real-time worker cluster health, and operational settings.
2. **REST API & Ingress Gateway**: Express backend hosting validated endpoints (`/api/v1/*`), public webhook ingress with HMAC verification and idempotency protection, and Server-Sent Event streaming (`/api/v1/runs/:runId/events`).
3. **DAG Orchestration Engine**: Independent topological ordering and execution coordinator that enforces strict graph validation (cycles, orphans, multiple triggers, missing ports) and evaluates ready nodes dynamically as upstream dependencies complete.
4. **Distributed Worker Daemon (`BullMQ`)**: Decoupled worker process that leases ready DAG nodes as durable jobs, executes step handlers (`HttpRequest`, `Transform`, `Delay`, `WebhookAction`), enforces SSRF boundary restrictions, and reports heartbeats and job metrics to Redis and PostgreSQL.
5. **Persistence Tier**: Dual-mode storage using Prisma ORM with PostgreSQL for persistent production execution records and a high-performance in-memory fallback for zero-dependency local development and unit testing.

---

## 2. Monorepo Project Structure

```text
flostate/
├── docker-compose.yml              # Local PostgreSQL 16 & Redis 7 services
├── package.json                    # Monorepo workspace configuration
├── .env.example                    # Global environment variables template
│
├── frontend/                       # React 18 + Vite + Tailwind CSS SPA
│   ├── src/
│   │   ├── app/                    # Routing, query client & root application
│   │   ├── components/             # Reusable UI widgets & React Flow node cards
│   │   ├── features/               # Typed domain services (workflows, runs, triggers, workers, settings)
│   │   ├── layouts/                # App shell, responsive header, and navigation sidebar
│   │   ├── pages/                  # 8 Core UI Views (Overview, Workflows, Builder, Runs, RunDetails, etc.)
│   │   └── types/                  # Typed graph schemas, node definitions, and API response contracts
│   └── package.json
│
├── backend/                        # Node.js + Express + Prisma + BullMQ
│   ├── prisma/
│   │   ├── schema.prisma           # Prisma models (Workflow, Execution, Trigger, Worker, Setting)
│   │   ├── migrations/             # SQL schema migrations
│   │   └── seed.ts                 # Idempotent seed data for workflows and sample runs
│   ├── src/
│   │   ├── config/                 # Zod-validated environment config & worker thresholds
│   │   ├── database/               # Prisma client singleton & connection health check
│   │   ├── engine/                 # Graph validator, topological sorter, and node executors
│   │   ├── models/                 # Typed interfaces, DTOs, and state schemas
│   │   ├── queues/                 # BullMQ queue managers & Redis connection factory
│   │   ├── repositories/           # Database repositories with memory-fallback capability
│   │   ├── routes/                 # Express v1 route controllers
│   │   ├── services/               # Core business services (workflow, orchestration, ingress, telemetry)
│   │   ├── utils/                  # SSRF filter, secret redaction, and logger
│   │   ├── worker/                 # Distributed worker process & heartbeat loop
│   │   ├── server.ts               # Express HTTP server bootstrap
│   │   └── worker.ts               # Standalone worker daemon CLI entrypoint
│   └── package.json
```

---

## 3. Prerequisites

- **Node.js**: `v18.18.0` or higher (`v20+` or `v22+` recommended)
- **npm**: `v9.0.0` or higher
- **Docker & Docker Compose** (for running PostgreSQL and Redis containers)
  - *Note: If running without Docker, a local PostgreSQL instance on port `5432` and Redis on port `6379` can be used.*

---

## 4. Quick Start & Local Setup

### Step 1: Install Dependencies
From the repository root:
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `backend/.env`:
```bash
# Windows PowerShell:
Copy-Item .env.example backend\.env

# Linux / macOS:
cp .env.example backend/.env
```

### Step 3: Start Infrastructure (PostgreSQL 16 & Redis 7)
Launch the containerized database and queue broker:
```bash
docker compose up -d
```
Verify services are healthy:
```bash
docker compose ps
```

### Step 4: Run Database Migrations & Seeds
Initialize the database schema and populate starter data:
```bash
npm run db:migrate --workspace=backend
npm run db:seed --workspace=backend
```

### Step 5: Start the Development Servers

#### Option A: Running All Components
Open two terminal windows:
```bash
# Terminal 1: Backend API & Integrated Worker (Port 4000)
npm run dev:backend

# Terminal 2: Frontend Vite Development Server (Port 5173)
npm run dev:frontend
```

#### Option B: Running Dedicated Worker Daemons (Distributed Architecture)
To run workers as decoupled autonomous processes:
```bash
# Terminal 1: Backend REST API only (with auto-worker disabled)
AUTO_START_DEFAULT_WORKER=false npm run dev:backend

# Terminal 2: Distributed Worker 1
WORKER_ID="worker-us-east-1" WORKER_CONCURRENCY=10 npm run worker:dev

# Terminal 3: Distributed Worker 2
WORKER_ID="worker-us-west-1" WORKER_CONCURRENCY=5 npm run worker:dev

# Terminal 4: Frontend Vite UI
npm run dev:frontend
```

Now open **`http://localhost:5173`** in your browser.

---

## 5. Running Without Docker

If you prefer using pre-installed local services:
1. Ensure PostgreSQL is running on `localhost:5432` with a database named `dormammu_db` owned by `dormammu:dormammu_secret`.
2. Ensure Redis is running on `localhost:6379`.
3. If your credentials differ, update `DATABASE_URL` and `REDIS_URL` in `backend/.env`:
   ```env
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/<dbname>?schema=public"
   REDIS_URL="redis://localhost:6379"
   ```
4. Run migrations and dev servers as outlined above.
5. If PostgreSQL or Redis are unavailable, the backend gracefully activates its built-in in-memory repository fallback for immediate development and graph design.

---

## 6. Complete API Route Table

All operational endpoints are versioned under `/api/v1/` with the exception of `/api/health`.

### Health & System Telemetry
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Comprehensive cluster health: DB connection status, Redis status, queue backlog, and registered workers |

### Workflow Management
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/workflows` | List workflows with search (`search`), status filter (`status`), and pagination (`page`, `pageSize`) |
| `POST` | `/api/v1/workflows` | Create a new workflow draft with name, description, and optional initial graph |
| `GET` | `/api/v1/workflows/:workflowId` | Retrieve full workflow definition including nodes, edges, versions, and publication status |
| `PATCH` | `/api/v1/workflows/:workflowId` | Save draft changes (metadata, graph nodes, positions, and edges) without publishing |
| `DELETE` | `/api/v1/workflows/:workflowId` | Safe deletion of workflow and associated trigger references |
| `POST` | `/api/v1/workflows/:workflowId/duplicate` | Clone workflow with regenerated UUIDs for workflow, nodes, and edges |
| `POST` | `/api/v1/workflows/:workflowId/validate` | Reusable graph validation: checks cycles, orphans, missing endpoints, and node configs |
| `POST` | `/api/v1/workflows/:workflowId/publish` | Validates graph, creates immutable published snapshot, and increments version |
| `POST` | `/api/v1/workflows/:workflowId/activate` | Mark workflow active for automated trigger execution |
| `POST` | `/api/v1/workflows/:workflowId/pause` | Pause active workflow (halts new trigger dispatches) |

### Execution Engine & History
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/runs` | Search & filter execution runs by `workflowId`, `status`, `triggerType`, `dateFrom`, `dateTo` |
| `POST` | `/api/v1/workflows/:workflowId/run` | Enqueue durable execution of published graph (with optional initial payload) |
| `GET` | `/api/v1/runs/:runId` | Execution summary: status, version, duration, error trace, and step execution counts |
| `GET` | `/api/v1/runs/:runId/nodes` | List node execution steps, statuses, attempt counts, and timings |
| `GET` | `/api/v1/runs/:runId/nodes/:nodeExecutionId` | Step execution details: input payload, sanitized output payload, and structured logs |
| `GET` | `/api/v1/runs/:runId/events` | **Server-Sent Events (SSE)**: Real-time streaming of run state updates and node completions |
| `POST` | `/api/v1/runs/:runId/retry` | Retry failed run: restores initial input and re-evaluates graph from failed node |

### Triggers & Inbound Webhooks
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/triggers` | List all configured triggers with status filter |
| `POST` | `/api/v1/triggers` | Create a new webhook or cron trigger |
| `GET` | `/api/v1/triggers/:triggerId` | Get trigger configuration and safe metadata |
| `PATCH` | `/api/v1/triggers/:triggerId` | Update trigger configuration |
| `DELETE` | `/api/v1/triggers/:triggerId` | Delete trigger |
| `POST` | `/api/v1/triggers/:triggerId/toggle` | Toggle trigger enabled / disabled state |
| `GET` | `/api/v1/triggers/:triggerId/deliveries` | View recent delivery / invocation log history |
| `POST` | `/api/v1/triggers/webhook/:slug` | **Live Webhook Ingress**: Validates HMAC signature, checks idempotency key, enqueues workflow run |

### Distributed Workers & Queue Observability
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/workers` | List all registered cluster workers, status (`online`, `stale`, `offline`), and concurrency |
| `GET` | `/api/v1/workers/queues` | Live BullMQ metrics: `waiting`, `active`, `completed`, `failed`, `delayed` counts |
| `GET` | `/api/v1/workers/:workerId` | Worker inspection: current job, completed/failed tasks, and system resource metrics |
| `POST` | `/api/v1/workers/heartbeat` | Internal worker heartbeat ingestion (secured via `x-worker-secret`) |

### System Settings & Disaster Recovery
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/settings` | Retrieve active operational configurations (concurrency, retry policies, timeouts) |
| `PATCH` | `/api/v1/settings` | Update operational configurations with strict numeric validation |
| `POST` | `/api/v1/settings/reset-demo` | Guarded demo reset: restores seed workflows and executions (gated by `ALLOW_DEMO_RESET`) |

---

## 7. Security Hardening & SSRF Protection

The engine implements defense-in-depth measures against common workflow and integration vulnerabilities:

1. **SSRF Boundary Protection (`backend/src/utils/ssrf-protection.ts`)**:
   - Outbound requests executed by `HttpRequest` and `WebhookAction` nodes are resolved against DNS and filtered prior to dispatch.
   - Blocks IPv4 and IPv6 loopback addresses (`127.0.0.0/8`, `::1`).
   - Blocks private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
   - Blocks link-local and cloud provider metadata IPs (`169.254.169.254`, `fe80::/10`).
   - Strict redirect enforcement (`redirect: 'error'`) prevents attackers from bypassing IP filters via HTTP 301/302 redirects.
   - Restricts permitted outbound schemes strictly to `http:` and `https:`.
2. **Secret Redaction**:
   - Structured run logs and payload outputs scrub sensitive authorization headers (`Authorization: Bearer ***`), API keys, passwords, and tokens before persistence and API responses.
3. **Webhook Ingress Security**:
   - Stored signing secrets are never returned over public endpoints.
   - Optional HMAC-SHA256 signature verification via `X-Signature-256` or `X-Hub-Signature-256`.
   - Idempotency key tracking via `X-Idempotency-Key` prevents duplicate execution invocations.
   - Ingress endpoints are rate-limited and capped by payload size limits (1MB).
4. **Worker Authentication**:
   - Internal heartbeat and queue modification endpoints require an internal worker authentication token (`x-worker-secret` / `x-internal-secret`).
5. **Database Parameterization**:
   - All persistence queries utilize Prisma ORM prepared statements, preventing SQL injection vulnerabilities.

---

## 8. Automated Test Suite

The project includes unit, integration, SSRF security, and end-to-end lifecycle test suites:

```bash
# Run all frontend and backend tests
npm test

# Run backend test suite only (84 tests across 13 suites)
npm run test:backend

# Run frontend test suite only (11 tests)
npm run test:frontend
```

### Verified Test Suites:
- `backend/src/tests/e2e-lifecycle.test.ts`: Complete 15-step end-to-end lifecycle (draft creation, persistence, validation, publish, execution, step logs, controlled error, retry, telemetry sync, webhook ingress).
- `backend/src/tests/ssrf.test.ts`: SSRF protection filter against loopback, private RFC1918 subnets, cloud metadata `169.254.169.254`, and non-HTTP protocols.
- `backend/src/tests/settings.test.ts`: Operational configuration persistence, secret isolation, and demo reset safeguards.
- `backend/src/tests/workers.test.ts`: Heartbeat lifecycle, stale worker detection, queue metrics, and unauthorized heartbeat rejection.
- `backend/src/tests/triggers.test.ts`: Webhook slug routing, HMAC signature verification, idempotency deduplication, and cron triggers.
- `backend/src/tests/durable.execution.test.ts`: BullMQ distributed worker scheduling, dependency resolution, and node execution.
- `backend/src/tests/runs.details.test.ts` & `runs.history.test.ts`: Run queries, secret scrubbing, node step retrieval, and SSE event streaming.
- `backend/src/tests/builder.validation.test.ts` & `workflows.test.ts`: Cycle detection, orphan node checking, version bumping, and draft persistence.
- `frontend/src/features/executions/execution.test.ts`: Frontend state badges, retry controls, and canvas node transitions.

---

## 9. Operational Limitations & Single-Workspace Mode

To ensure transparency for deployment and operations:
1. **Single-Workspace Mode**: User authentication and multi-tenant Role-Based Access Control (RBAC) are not implemented. The engine operates in a single-workspace mode intended for internal teams or local orchestration. Do not expose administrative routes directly to the public internet without an upstream reverse proxy authentication layer (e.g., OAuth2 Proxy, Cloudflare Access).
2. **Code Execution Sandbox**: Node tasks (`Transform`, `HttpRequest`) execute within the Node.js process runtime. While network access is restricted by the SSRF filter and timeouts are enforced, this is not an isolated container/gVisor microVM sandbox.
3. **In-Memory Store vs Distributed Queue**: When Redis or PostgreSQL are unavailable, the system defaults to an in-memory execution store. In this fallback mode, job scheduling is local to the server process and distributed multi-process workers cannot lease jobs. Production deployments should always maintain PostgreSQL 16 and Redis 7.

---

## 10. Production Build

To verify build integrity and produce production artifacts:
```bash
npm run build
```
- Frontend bundle compiles to `frontend/dist/`.
- Backend TypeScript compiles to `backend/dist/`.

---

## 11. License

MIT
