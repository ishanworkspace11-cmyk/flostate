# THE DORMAMMU LOOP — Distributed DAG Workflow & Automation Engine

> *"Dormammu, I've come to bargain!"* — An enterprise-grade, visual Directed Acyclic Graph (DAG) orchestration and automation engine designed for resilient distributed task execution.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.1-646cff.svg)](https://vitejs.dev/)
[![React Flow](https://img.shields.io/badge/@xyflow/react-12.4-ff0072.svg)](https://reactflow.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8.svg)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Vitest-Passing%20(7%2F7)-success.svg)](https://vitest.dev/)

---

## 1. Project Overview

**The Dormammu Loop** is a visual workflow orchestration system that empowers developers to build, validate, execute, and monitor Directed Acyclic Graph (DAG) automation pipelines.

Built with React, TypeScript, and `@xyflow/react`, it features:
- A drag-and-drop workflow canvas with customizable nodes.
- Graph validation that detects cycles, disconnected nodes, and configuration errors before execution.
- A **genuine local TypeScript DAG execution engine** that calculates topological execution order, enforces parent-child dependencies, carries data between steps, captures node-level execution logs, and propagates failures to skip blocked downstream tasks.
- A full suite of SaaS management pages: Overview, Workflows, Visual Builder, Run History, Run Details & Node Inspector, Triggers, Distributed Workers, and Settings.

---

## 2. Architecture & Implementation Status

```
┌────────────────────────────────────────────────────────────────────────┐
│                        THE DORMAMMU LOOP ENGINE                        │
├─────────────────────────┬──────────────────────────────────────────────┤
│ Frontend Presentation   │ React 18, React Router v6, Tailwind CSS     │
│ Visual Canvas           │ @xyflow/react v12, Custom Node Renderers     │
│ Persistence Layer       │ Service Adapter (LocalStorage with Seeds)   │
│ DAG Engine              │ Pure TypeScript (Acyclic topological order)  │
│ Future Backend Target   │ Node.js, Express, PostgreSQL, Redis, BullMQ  │
└─────────────────────────┴──────────────────────────────────────────────┘
```

### Fully Implemented Features (Operational)
- **Visual DAG Editor (`/builder`, `/builder/:workflowId`)**:
  - Palette with 5 draggable node types: `Trigger`, `Transform`, `HTTP Request`, `Delay`, `Webhook Action`.
  - Node connection with handle validations, smooth-step edges, selection, moving, and deletion.
  - Interactive right-side configuration panel for each node type.
  - Graph Validation with Tarjan/DFS cycle detection, disconnected node detection, and configuration requirements.
  - Interactive **Test Run**: Live DAG execution on the canvas with pulsing node highlights, real elapsed timings, and output inspection.
  - Save, Duplicate, and Publish workflows with version bumping.
- **Pure Local Execution Engine (`execution.engine.ts`)**:
  - Independent of React (can be run directly in backend Node.js worker processes).
  - Topological sorting via Kahn's algorithm.
  - Upstream output forwarding and safe dot-notation extraction (`getNestedValue`).
  - Predefined safe transformation operations (`pass_through`, `json_extract`, `string_template`, `filter_array`, `math_aggregate`, `map_fields`).
  - Real timer delays with execution duration capture.
  - External HTTP requests with timeout controller and mock response support for unit/integration testing.
  - Upstream failure propagation (downstream nodes automatically marked as `Skipped`).
- **Workflow Management (`/workflows`)**:
  - Search, status filtering (`all`, `published`, `draft`, `paused`).
  - Create workflow modal.
  - Manual execution directly from the workflows table.
  - Duplicate workflow with copy renaming.
  - Delete with safety confirmation dialog.
- **Run History & Deep Inspection (`/runs`, `/runs/:runId`)**:
  - Execution summary with status badges (`Pending`, `Ready`, `Running`, `Succeeded`, `Failed`, `Retrying`, `Skipped`).
  - Node-by-node timeline with attempt counts and millisecond durations.
  - Input and output payload viewers with JSON formatting and one-click copy.
  - Step execution log stream with timestamp and severity levels.
  - **Live Retry Action**: Genuinely re-executes the DAG workflow and persists a new run record.
- **Overview Dashboard (`/`)**:
  - Real computed metrics (total workflows, published workflows, recent runs, failure rate).
  - Recent workflows and execution lists.
- **Settings & Demo Management (`/settings`)**:
  - LocalStorage size estimator and record count.
  - Reset to initial factory demo seed records with confirmation.
- **404 Not Found Page (`*`)**:
  - Custom Dormammu-themed error page with navigation back to overview.

### Transparently Simulated Features (Demo Indicators Present)
- **Triggers Page (`/triggers`)**:
  - Webhook URL paths and cron schedule configurations are preserved and editable.
  - Clearly marked with **"Demo / Not Connected"** badges, acknowledging that inbound external webhooks cannot reach browser clients without an active public server gateway.
- **Workers Page (`/workers`)**:
  - Displays worker cluster telemetry, queue depths, job concurrency, and heartbeats.
  - Clearly marked with **"Simulated Cluster Architecture"** badges, reflecting the BullMQ / Redis worker queue design.

---

## 3. Technology Stack

- **Framework**: React 18 with TypeScript 5.7
- **Bundler**: Vite 6.1
- **Routing**: React Router DOM 6.28
- **Canvas / Graph**: `@xyflow/react` 12.4
- **Icons**: `lucide-react`
- **Styling**: Tailwind CSS 3.4
- **Testing**: Vitest 3.0

---

## 4. Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or pnpm

### Installation
```bash
# Clone the repository
git clone https://github.com/ishanworkspace11-cmyk/flostate.git
cd flostate

# Install dependencies
npm install
```

### Running Locally
```bash
# Start development server
npm run dev
```
Open your browser at `http://localhost:5173`.

### Running Tests
```bash
# Execute unit test suite for DAG validation and engine
npm test
```

### Production Build
```bash
# Typecheck and bundle for production
npm run build
```

---

## 5. File Structure

```text
src/
├── app/
│   ├── App.tsx                    # Root application component
│   └── router.tsx                 # Route definitions and layouts
├── layouts/
│   └── AppLayout.tsx              # Shell with sidebar & top navigation
├── components/
│   ├── common/                    # Shared reusable components
│   │   ├── ConfirmDialog.tsx      # Modal confirmation dialog
│   │   ├── EmptyState.tsx         # Empty state placeholder
│   │   ├── PageHeader.tsx         # Unified page titles and actions
│   │   ├── StatCard.tsx           # KPI metrics card
│   │   └── StatusBadge.tsx        # Succeeded/Failed/Running badges
│   ├── editor/                    # Visual builder components
│   │   ├── NodeConfigPanel.tsx    # Right-hand node properties editor
│   │   ├── NodePalette.tsx        # Left-hand draggable node catalog
│   │   ├── ValidationResults.tsx  # Floating graph error inspector
│   │   ├── WorkflowCanvas.tsx     # React Flow canvas wrapper
│   │   └── WorkflowNode.tsx       # Custom DAG nodes with status halos
│   ├── executions/                # Execution inspection components
│   │   ├── ExecutionTimeline.tsx  # Node execution step sequence
│   │   ├── LogViewer.tsx          # Terminal log viewer with levels
│   │   └── PayloadViewer.tsx      # JSON syntax payload viewer
│   ├── navigation/
│   │   ├── Sidebar.tsx            # Left navigation bar
│   │   └── Topbar.tsx             # Header bar with environment status
│   └── workflows/
│       └── WorkflowTable.tsx      # Workflows table with inline actions
├── features/
│   ├── executions/
│   │   ├── execution.engine.ts    # Pure TypeScript topological DAG executor
│   │   ├── execution.service.ts   # LocalStorage execution persistence
│   │   ├── execution.test.ts      # Vitest test suite for DAG runner
│   │   └── execution.types.ts     # Execution and NodeExecution models
│   ├── triggers/
│   │   ├── trigger.service.ts     # Ingress trigger management
│   │   └── trigger.types.ts       # Webhook and cron configuration types
│   ├── workers/
│   │   ├── worker.service.ts      # Distributed worker pool telemetry
│   │   └── worker.types.ts        # Worker instance and queue types
│   └── workflows/
│       ├── workflow.service.ts    # CRUD and publish operations
│       ├── workflow.types.ts      # Workflow, node, edge, and config models
│       └── workflow.validation.ts # Cycle detection & DAG graph validator
├── lib/
│   ├── date.ts                    # Timestamp & duration formatting
│   └── utils.ts                   # Classnames helper & ID generator
├── pages/
│   ├── DashboardPage.tsx          # Overview dashboard (/)
│   ├── NotFoundPage.tsx           # 404 page (*)
│   ├── RunDetailsPage.tsx         # Run inspector (/runs/:runId)
│   ├── RunsPage.tsx               # Execution history (/runs)
│   ├── SettingsPage.tsx           # Settings & demo reset (/settings)
│   ├── TriggersPage.tsx           # Webhook/Cron triggers (/triggers)
│   ├── WorkersPage.tsx            # Worker cluster & queues (/workers)
│   ├── WorkflowBuilderPage.tsx    # Visual DAG builder (/builder/:id)
│   └── WorkflowsPage.tsx          # Workflow catalog (/workflows)
├── styles/
│   └── globals.css                # Tailwind CSS and React Flow rules
└── main.tsx                       # Entry point
```

---

## 6. Path to Distributed Production Backend

The frontend architecture was designed from day one to connect seamlessly to a backend:

1. **Backend API (`Node.js` + `Express` / `NestJS`)**:
   - Replace the LocalStorage adapter in `WorkflowService` and `ExecutionService` with `fetch`/`axios` calls.
2. **Database (`PostgreSQL`)**:
   - Store workflows, node configurations, revisions, and execution runs with indexed relational foreign keys.
3. **Distributed Task Queue (`Redis` + `BullMQ`)**:
   - Workflows are enqueued upon webhook or cron trigger.
   - The topological sorting logic in `execution.engine.ts` dispatches parallel leaf jobs to BullMQ workers.
   - When upstream parent jobs succeed, BullMQ hooks unlock and schedule child jobs.
4. **Worker Nodes**:
   - The TypeScript `ExecutionEngine` can be imported directly into worker daemons with zero code modifications, running headless inside Docker containers.

---

## 7. License

MIT
