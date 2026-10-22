# THE DORMAMMU LOOP — Distributed DAG Workflow & Automation Engine

> *"Dormammu, I've come to bargain!"* — An enterprise-grade, visual Directed Acyclic Graph (DAG) orchestration and automation engine designed for resilient distributed task execution.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-Express%20v4-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.1-646cff.svg)](https://vitejs.dev/)
[![React Flow](https://img.shields.io/badge/@xyflow/react-12.4-ff0072.svg)](https://reactflow.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8.svg)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Vitest-Passing%20(9%2F9)-success.svg)](https://vitest.dev/)

---

## 1. Monorepo Project Structure

The project is cleanly divided into separate folders for **frontend** and **backend**:

```text
flostate/
├── frontend/                      # React 18 + Vite + @xyflow/react SPA
│   ├── public/                    # Assets and favicons
│   ├── src/                       # Application code
│   │   ├── app/                   # App root & React Router
│   │   ├── components/            # UI components (editor, common, executions, nav)
│   │   ├── features/              # Workflow types, validation, and execution engine
│   │   ├── layouts/               # Shell layout with responsive navigation
│   │   ├── pages/                 # Overview, Workflows, Builder, Runs, Triggers, Workers, Settings
│   │   └── styles/                # Tailwind CSS and global canvas theme
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/                       # Node.js + Express + TypeScript Server
│   ├── src/
│   │   ├── engine/                # Backend topological DAG execution engine & validator
│   │   ├── models/                # Typed data models (workflow, execution, trigger, worker)
│   │   ├── routes/                # REST endpoints & live webhook ingress router
│   │   │   ├── health.routes.ts   # GET /api/health
│   │   │   ├── workflow.routes.ts # CRUD & POST /api/workflows/:id/run
│   │   │   ├── execution.routes.ts# GET /api/runs & POST /api/runs/:id/retry
│   │   │   ├── trigger.routes.ts  # CRUD & POST /api/webhooks/:path(*) ingress
│   │   │   └── worker.routes.ts   # GET /api/workers & queue telemetry
│   │   ├── services/              # Store abstraction (in-memory / PG ready)
│   │   ├── tests/                 # Backend Vitest unit test suite
│   │   └── server.ts              # Express application startup
│   ├── package.json
│   └── tsconfig.json
│
├── package.json                   # Root monorepo workspace configuration
└── README.md
```

---

## 2. Quick Start

### 1. Install Dependencies
```bash
# Install frontend and backend dependencies
npm install --workspace=frontend
npm install --workspace=backend
```

### 2. Run Applications

#### Running Frontend (React SPA)
```bash
npm run dev:frontend
```
Frontend runs at `http://localhost:5173`.

#### Running Backend (Express Server)
```bash
npm run dev:backend
```
Backend runs at `http://localhost:4000`.

---

## 3. Testing & Building

### Run All Tests
```bash
npm test
```
Runs test suites across both `frontend` (7 tests) and `backend` (2 tests).

### Build for Production
```bash
npm run build
```
Builds both the Vite frontend (`frontend/dist/`) and the compiled Node.js backend (`backend/dist/`).

---

## 4. Backend Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | System status, engine telemetry, and worker counts |
| `GET` | `/api/workflows` | List all stored DAG workflows |
| `POST` | `/api/workflows` | Create a new workflow |
| `GET` | `/api/workflows/:id` | Get workflow by ID |
| `PUT` | `/api/workflows/:id` | Update workflow definition |
| `DELETE`| `/api/workflows/:id` | Delete workflow |
| `POST` | `/api/workflows/:id/run` | Execute workflow on backend DAG engine |
| `GET` | `/api/runs` | List execution history and status traces |
| `GET` | `/api/runs/:id` | Get single run details and step logs |
| `POST` | `/api/runs/:id/retry` | Re-run a previous execution with the original payload |
| `GET` | `/api/triggers` | List configured webhook and cron triggers |
| `POST` | `/api/webhooks/:path(*)` | **Live Inbound Webhook Ingress**: Receives webhook payloads, matches target workflow, executes on backend engine, and returns execution ID |
| `GET` | `/api/workers` | Cluster workers telemetry and concurrency stats |
| `GET` | `/api/workers/queues` | BullMQ queue backlog depths |

---

## 5. License

MIT
