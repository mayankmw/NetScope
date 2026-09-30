# NetScope Architecture

> Status: **Step 2 — PostgreSQL foundation.** Items marked _(Step N)_ are designed here but built in that step.
> Related: [API](API.md) · [Database](DATABASE.md) · [Roadmap](ROADMAP.md)

## 1. System overview

NetScope is a **local-first, single-host** application. The server runs on a machine attached to
the LAN being monitored; a browser UI talks to it over HTTP (REST) and a WebSocket, both on the
**same origin and port**.

```
┌──────────────────────────────── Browser ────────────────────────────────┐
│  React SPA                                                              │
│  pages → components → hooks → stores (Zustand) → services               │
│                                                  ├─ apiClient  (REST)   │
│                                                  └─ socketClient (WS)   │
└───────────────────┬──────────────────────────────────────┬──────────────┘
      REST /api/*   │ commands + queries        WS /ws     │ live events (push)
┌───────────────────▼──────────────────────────────────────▼──────────────┐
│  Node.js server — one process, one port                                 │
│                                                                         │
│  routes → middleware → controllers → services ──→ repositories ──→ SQL  │
│                                         │  │                            │
│                                         │  └──→ event bus ──→ wsManager │
│                                         └──→ job runner ──→ network layer
│                                                     (safe exec: arp, ping, nmap)
└───────────────┬─────────────────────────────────────────┬───────────────┘
                │ pg connection pool                      │ execFile (no shell)
         ┌──────▼───────┐                         ┌───────▼────────────────┐
         │ PostgreSQL   │                         │ OS tools → local subnet │
         └──────────────┘                         └────────────────────────┘
```

**Guiding principles**

- **The server is the only trust boundary.** It validates every input, enforces the network
  safety policy, and is the only component that touches the database or runs OS commands.
- **REST for commands and queries, WebSocket for push.** State changes go through validated REST
  endpoints; the WebSocket only notifies clients that something changed.
- **Snapshot + delta.** Clients load state over REST, then apply WebSocket events. After a
  reconnect they reload the snapshot, so a missed event can never leave the UI permanently wrong.
- **Defensive by construction.** The network layer can only target private addresses on the
  subnet the host is attached to. There is no configuration switch that widens this.

## 2. Responsibilities

| Component                        | Owns                                                                                                                                                                 | Never does                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Frontend** (`client/`)         | Presentation, routing, client-side state, rendering live updates, user input (with basic client-side validation for UX).                                             | Enforce rules (the server does), talk to the DB or OS tools, hold secrets.            |
| **Backend** (`server/`)          | HTTP API, input validation, safety policy, scan orchestration, persistence, event publication, logging.                                                              | Render UI, trust client input, expose internals in errors.                            |
| **PostgreSQL**                   | System of record: networks, device inventory, scans, per-scan observations, ports, alerts.                                                                           | Act as a queue or cache; be accessed outside repositories.                            |
| **WebSocket layer**              | Fan-out of domain events (device found/changed, scan progress, alerts) to connected browsers; connection liveness.                                                   | Accept commands that change state; be the source of truth.                            |
| **Network discovery layer**      | Finding hosts on the local subnet: detect the interface/subnet/gateway, stimulate (ping sweep / `nmap -sn`), read the ARP cache, merge results, look up MAC vendors. | Know about HTTP, the DB, or WebSockets. It returns plain objects.                     |
| **Network diagnostic utilities** | Targeted, on-demand checks against one known local host: ping latency/loss, reverse DNS, safe TCP port check _(Step 7)_, gateway reachability.                       | Target anything outside the local private subnet; run privileged or intrusive probes. |

## 3. Repository layout

A monorepo using **npm workspaces**: one clone, one install, one lockfile, one `npm run dev`.
Client and server remain independently buildable and deployable.

```
netscope/
├── client/                        React SPA (Vite)
│   ├── public/                    Static files served as-is (favicon)
│   ├── src/
│   │   ├── app/                   Bootstrap: App, router, app-wide providers
│   │   ├── components/
│   │   │   ├── ui/                shadcn/ui primitives (generated — do not hand-edit)
│   │   │   ├── system/            API / connection status
│   │   │   ├── common/            (4) Shared building blocks: StatCard, EmptyState, StatusDot
│   │   │   ├── devices/           (4) Device table, filters, device card
│   │   │   ├── scans/             (3/9) Scan button, progress, history
│   │   │   ├── topology/          (8) Cytoscape graph wrapper
│   │   │   └── alerts/            (10) Alert list, toasts
│   │   ├── config/                env.js — the only reader of import.meta.env
│   │   ├── hooks/                 Reusable hooks (useApiHealth; useSocketEvent (5))
│   │   ├── layouts/               AppLayout; Sidebar + TopBar (4)
│   │   ├── lib/                   shadcn `cn` helper and configured third-party adapters
│   │   ├── pages/                 One component per route
│   │   ├── services/              apiClient + one module per API resource; socketClient (5)
│   │   ├── stores/                (4) Zustand stores
│   │   ├── types/                 JSDoc typedefs for API / WebSocket contracts
│   │   ├── utils/                 Pure helpers (formatting, sorting)
│   │   ├── index.css              Tailwind entry + theme tokens
│   │   └── main.jsx
│   ├── .env.example
│   ├── components.json            shadcn/ui configuration
│   ├── eslint.config.js
│   ├── jsconfig.json              `@/` path alias for editors
│   └── vite.config.js             Plugins, alias, dev proxy
│
├── server/                        Express API + WebSocket + network layer
│   ├── src/
│   │   ├── config/                Env schema (zod) → validated, frozen config
│   │   ├── routes/                URL → middleware chain → controller
│   │   ├── controllers/           HTTP adapters: read validated input, call service, send envelope
│   │   ├── services/              Business logic and orchestration
│   │   ├── validators/            (3) zod schemas for params / query / body
│   │   ├── middleware/            requestId, httpLogger, notFound, errorHandler; validate (3), rateLimit (7)
│   │   ├── errors/                AppError + stable error codes
│   │   ├── db/                    pool.js, errors.js, migrator.js, migrate.js (CLI), migrations/; repositories/ (3)
│   │   ├── network/               (3) Discovery + diagnostics (see §5)
│   │   ├── jobs/                  (3) In-process scan job runner
│   │   ├── events/                (5) Internal event bus
│   │   ├── websocket/             (5) wsManager, message schemas
│   │   ├── utils/                 logger, apiResponse
│   │   ├── app.js                 Builds the Express app (no port binding → testable)
│   │   └── server.js              Entry point: HTTP server, listen, graceful shutdown
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/              (3) Captured arp / ping / nmap output for parser tests
│   ├── .env.example
│   ├── eslint.config.js
│   └── vitest.config.js
│
├── shared/                        (5) @netscope/shared — contracts used by both sides
│                                  (WebSocket event names, error codes)
├── docker/postgres/init/          SQL run once when the dev database volume is created
├── docs/                          Architecture, API, database, roadmap
├── compose.yaml                   Local PostgreSQL container (dev only; the server runs on the host)
├── .github/workflows/             (12) CI: format, lint, test, build
├── package.json                   Workspaces + orchestration scripts
├── .editorconfig · .gitignore · .nvmrc · .prettierrc.json · .prettierignore
└── LICENSE · README.md
```

**Improvements over a plain `client/` + `server/` split**

- **npm workspaces** instead of two unrelated projects: shared tooling, a single lockfile, and
  root scripts (`dev`, `lint`, `test`, `check`) that run across both.
- **`shared/` package** _(Step 5)_ for the WebSocket event catalog and error codes, so client and
  server cannot drift apart silently.
- **`docs/`** holds decisions next to the code that implements them.

## 4. Backend architecture

### 4.1 Request lifecycle

```
request
  → requestId        assign/propagate X-Request-Id (validated if client-supplied)
  → httpLogger       pino-http: one structured log line per request, req.log child logger
  → helmet           security headers
  → cors             allowlist from CORS_ORIGIN
  → express.json     100 kB body limit
  → /api router      route → [validate(schema)] → controller → service → repository
  → notFound         unmatched route → AppError(404, NOT_FOUND)
  → errorHandler     the ONLY place errors become HTTP responses
```

### 4.2 Layer rules

Dependencies point one way: **routes → controllers → services → repositories / network / events**.
Nothing points back.

| Layer             | Responsibility                                                               | Must not                                           |
| ----------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| `routes/`         | Map URL + method to a middleware chain and a controller.                     | Contain logic.                                     |
| `validators/`     | zod schemas for `params`, `query`, `body` (and WS messages).                 | Perform I/O.                                       |
| `middleware/`     | Cross-cutting HTTP concerns (IDs, logging, validation, rate limits, errors). | Contain business rules.                            |
| `controllers/`    | Translate HTTP ↔ service calls; send the response envelope.                  | Touch SQL or run commands; contain business rules. |
| `services/`       | Business logic and orchestration; throw `AppError` for expected failures.    | Know about `req` / `res`.                          |
| `db/repositories` | All SQL, parameterized; map `snake_case` rows ↔ `camelCase` objects.         | Contain business rules.                            |
| `network/`        | Run allowlisted OS tools safely and parse their output.                      | Know about HTTP, the DB, or WebSockets.            |
| `jobs/`           | Queue and run long-lived work (scans) with timeouts and cancellation.        | Talk to HTTP clients directly.                     |
| `events/`         | In-process pub/sub of domain events (`device.discovered`, …).                | Contain logic; it is a pipe.                       |
| `websocket/`      | Connection management; forward bus events to subscribed clients.             | Change state or contain business rules.            |
| `config/`         | Validate environment once at startup; expose a frozen config object.         | Be bypassed — nothing else reads `process.env`.    |

**Naming:** `<resource>.<layer>.js` — `devices.routes.js`, `devices.controller.js`,
`devices.service.js`, `devices.repository.js`, `devices.validators.js`.

### 4.3 Cross-cutting concerns

- **Configuration** — `config/env.schema.js` validates `process.env` with zod. Invalid config
  makes the process exit immediately with a readable list of problems. `.env` files are loaded by
  the launcher (`node --env-file-if-exists=.env`), so production can inject variables any way it likes.
- **Errors** — `AppError(message, { statusCode, code, details })` for expected failures. Anything
  else is treated as a bug: logged with its stack, returned as a generic `500 INTERNAL_ERROR`
  (the real message is shown only when `NODE_ENV=development`). Express 5 forwards rejected
  promises from async handlers automatically, so no `asyncHandler` wrapper is needed.
- **Validation** _(Step 3)_ — a generic `validate({ params, query, body })` middleware applies zod
  schemas and replaces the raw input with parsed values; failures become `400 VALIDATION_ERROR`
  with per-field `details`. Body schemas are `strict` (unknown fields are rejected).
- **Logging** — pino JSON logs in production, pretty single-line logs in development. Each
  request gets one completion log line carrying its request ID. Auth headers and cookies are redacted.
- **Database access** — one `pg` pool (`db/pool.js`). `query()` / `withTransaction()` turn driver
  errors into `AppError`s (connection problems → 503 `DATABASE_UNAVAILABLE`, unique violations →
  409 `CONFLICT`). The server starts even if PostgreSQL is down, and reports it via `/api/health`
  (503). It warns at startup when migrations are pending. Details: [DATABASE.md](DATABASE.md).
- **Graceful shutdown** — on SIGINT/SIGTERM the server stops accepting connections, waits for
  in-flight requests, then closes the database pool (forced exit after 10 s). Later steps add:
  close WebSocket clients, cancel running scans.
- **Process safety** — unhandled rejections and uncaught exceptions are logged as fatal and the
  process exits; a supervisor restarts it _(Step 12)_.

## 5. Network layer and safety model

_Built in Steps 3 (discovery), 6 (diagnostics), and 7 (port checks)._

### 5.1 Structure

```
server/src/network/
├── exec/runCommand.js       The ONLY place child processes are spawned
├── guards/targetGuard.js    Private-range + local-subnet enforcement
├── platform/                OS differences behind one interface (darwin.js, linux.js)
├── interfaces.js            Active interface, IPv4 CIDR, default gateway
├── tools/                   One adapter per binary: build argv → runCommand → raw output
│   ├── arp.js
│   ├── ping.js
│   └── nmap.js
├── parsers/                 Pure functions: raw output → objects (fixture-tested)
│   ├── arp.parser.js
│   ├── ping.parser.js
│   └── nmap.parser.js       (parses nmap XML output, -oX -)
├── discovery/
│   ├── discoveryEngine.js   Runs providers, merges results by MAC (fallback IP)
│   └── providers/           arpCache, pingSweep, nmapHostDiscovery
└── vendors/ouiLookup.js     MAC prefix → manufacturer (bundled dataset, no network calls)
```

### 5.2 Discovery strategy

1. **Locate** — pick the active IPv4 interface (or `SCAN_INTERFACE`), derive its CIDR and gateway.
2. **Stimulate** — ping-sweep the subnet with bounded concurrency and short timeouts, or run
   `nmap -sn` when nmap is installed. Every attempt makes the OS resolve the target via ARP, so
   the ARP cache fills even for hosts that ignore ICMP.
3. **Collect** — read the ARP cache (`arp -an`) → IP ↔ MAC pairs for every host that answered.
4. **Enrich** — MAC vendor (OUI), reverse-DNS hostname.
5. **Reconcile** — upsert devices by `(network, MAC)`, record one observation per device per scan,
   and publish `device.discovered` / `device.updated` / `device.offline` events.

This works **without root**. Raw-socket techniques (ARP scans, SYN scans) are intentionally not used.

### 5.3 Safety rules

These rules are non-negotiable.

1. **Scope** — every target must be an RFC 1918 private IPv4 address (10/8, 172.16/12,
   192.168/16) **and** inside the subnet of an active local interface. Sweeps are capped at 1,024
   addresses. No environment variable or API parameter can disable this.
2. **Execution** — `execFile` / `spawn` with argument arrays and `shell: false`. Only allowlisted
   binaries (`arp`, `ping`, `nmap`) are run, with a timeout, an output-size cap, and kill-on-abort. User
   input never becomes a flag — only validated IPs and ports are inserted into argv.
3. **nmap profile** — allowed: host discovery (`-sn`) and TCP connect scans (`-sT`) over a
   bounded, validated port list, with a rate cap. **Never**: NSE scripts (`--script`, `-sC`), OS
   detection (`-O`), aggressive mode (`-A`), raw/SYN scans, or spoofing/decoy/fragmentation/evasion
   options (`-S`, `-D`, `-f`, `--spoof-mac`, `--data-length`, …).
4. **Privilege** — never run as root or via sudo.
5. **Load** — one scan at a time (job queue concurrency 1); scan-triggering endpoints are rate
   limited; every job has a hard timeout.
6. **Exposure** — the API binds to `127.0.0.1` by default and warns loudly otherwise; it must not be
   exposed on the LAN until authentication exists _(Step 12)_.
7. **Accountability** — every scan is persisted with its type, target, parameters, timestamps, and outcome.

### 5.4 Long-running work: the job runner

_Built in Step 3._

Scans take seconds to minutes, so they never block an HTTP request:

```
POST /api/scans ──▶ scans.service ──▶ jobs.enqueue(scan) ──▶ 202 Accepted { scan: { id, status: "queued" } }
                                          │
                        job runner (concurrency 1, timeout, AbortController)
                                          │
                  network layer ──▶ repositories ──▶ event bus ──▶ wsManager ──▶ browsers
```

Scan states: `queued → running → completed | failed | cancelled`. The runner is in-process,
because this is a single-host app with at most one scan at a time. It sits behind a small interface,
so it could be swapped for a persistent queue if that ever changes.

### 5.5 Platform support

macOS and Linux are supported (tool output differs, which `platform/` absorbs). Windows is out of
scope for the MVP.

## 6. WebSocket architecture

_Built in Step 5._

| Aspect       | Design                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport    | `ws` library, attached to the existing HTTP server at path `/ws` (same port, same origin; Vite proxies it in development).                          |
| Direction    | Server → client events. Client → server messages limited to `subscribe` / `unsubscribe`.                                                            |
| Source       | Services publish domain events on the internal **event bus**; `wsManager` subscribes and fans out. Services never import the WebSocket layer.       |
| Channels     | `devices`, `scans`, `alerts`, `system`. Clients subscribe to what the current view needs.                                                           |
| Liveness     | Protocol-level ping every `WS_HEARTBEAT_INTERVAL_MS`; clients that miss a pong are terminated. Browsers answer pings automatically.                 |
| Reconnect    | Client reconnects with exponential backoff + jitter (1 s → 30 s cap), re-subscribes, then **re-fetches snapshots over REST**.                       |
| Security     | `Origin` checked against the CORS allowlist during the upgrade; `maxPayload` 16 KiB; incoming messages validated with zod; auth cookie _(Step 12)_. |
| Backpressure | If a client's `bufferedAmount` exceeds a threshold, drop non-critical events (progress) or close with code 1013; the client resyncs via REST.       |

**Message envelope** (both directions):

```json
{
  "v": 1,
  "type": "device.discovered",
  "channel": "devices",
  "id": "6f1c1c9e-6a4b-4a70-8a3c-0b3f7d0d8f55",
  "ts": "2026-09-29T12:00:00.000Z",
  "data": {}
}
```

**Event catalog (initial)**

| Type                               | Channel   | Emitted when                                                |
| ---------------------------------- | --------- | ----------------------------------------------------------- |
| `system.hello`                     | —         | Connection established (server version, heartbeat interval) |
| `scan.queued` / `scan.started`     | `scans`   | A scan is accepted / begins                                 |
| `scan.progress`                    | `scans`   | Periodically while running (`phase`, `completed`, `total`)  |
| `scan.completed` / `scan.failed`   | `scans`   | A scan finishes                                             |
| `device.discovered`                | `devices` | A device is seen for the first time                         |
| `device.updated`                   | `devices` | IP, hostname, vendor, or user-edited fields change          |
| `device.online` / `device.offline` | `devices` | Presence changes                                            |
| `alert.created`                    | `alerts`  | An alert rule fires _(Step 10)_                             |
| `error`                            | —         | A client message was rejected                               |

Client → server: `{ "type": "subscribe", "data": { "channels": ["devices", "scans"] } }` and `unsubscribe`.

**Client side:** a singleton `services/socketClient.js` owns the connection; a
`useConnectionStore` exposes its status to the UI; stores register handlers that apply events to
their state; `hooks/useSocketEvent` covers component-level needs.

## 7. Frontend architecture

### 7.1 Layer rules

| Folder        | Responsibility                                                                                      | Rule                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pages/`      | One component per route: compose layout sections, read route params.                                | Thin; no fetch calls.                                                    |
| `layouts/`    | Persistent chrome (sidebar, top bar) around `<Outlet />`.                                           |                                                                          |
| `components/` | Reusable UI. `ui/` = shadcn primitives; `common/` = app-wide; domain folders per feature.           | Presentational where possible; data arrives via props, hooks, or stores. |
| `hooks/`      | Reusable stateful logic (fetch-on-mount, socket subscriptions, media queries).                      |                                                                          |
| `stores/`     | Zustand stores: shared client state and server-derived entity caches.                               | Stores call services, never `fetch` directly.                            |
| `services/`   | All I/O: `apiClient` (envelope unwrapping, timeouts, `ApiError`), resource modules, `socketClient`. | The only place that knows URLs.                                          |
| `config/`     | `env.js`, the only reader of `import.meta.env`.                                                     |                                                                          |
| `types/`      | JSDoc `@typedef`s for API and WebSocket contracts.                                                  | No runtime code.                                                         |
| `utils/`      | Pure functions (formatting, sorting, IP/MAC helpers).                                               | No React, no I/O.                                                        |
| `lib/`        | shadcn's `cn()` and configured third-party adapters.                                                |                                                                          |

**Naming:** components and pages in `PascalCase.jsx`; hooks `useThing.js`; everything else `camelCase.js`.
Imports use the `@/` alias (`@/services/apiClient`).

### 7.2 State strategy

| Kind of state                              | Where it lives                                                    |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Ephemeral UI (dialog open, input text)     | Component `useState`                                              |
| One-off request tied to a component        | A hook (e.g. `useApiHealth`)                                      |
| Shared entities updated by REST **and** WS | Zustand stores, normalized (`byId` map + ordered IDs) _(Step 4+)_ |
| UI preferences (theme, sidebar)            | `useUiStore` with `persist` → localStorage _(Step 4)_             |
| Route state (filters, selected device)     | URL (path params, search params) so views are linkable            |

Planned stores: `useDeviceStore`, `useScanStore`, `useAlertStore`, `useConnectionStore`, `useUiStore`.
Components subscribe with selectors (`useDeviceStore((s) => s.byId[id])`) to limit re-renders.

TanStack Query is deliberately not used. Most data here arrives by server push into shared entity
state, and Zustand covers both push and fetch with one model. Revisit if caching or refetch logic grows.

### 7.3 Other decisions

- **Routing** — React Router data mode (`createBrowserRouter`). A pathless error route keeps the
  layout visible when a page throws. Heavy pages are route-level code-split with `lazy`
  (Topology, which pulls in Cytoscape).
- **Styling** — Tailwind v4 with shadcn/ui CSS-variable tokens. Generated `components/ui/*` files
  are not hand-edited; wrap or compose them instead.
- **Motion** _(Step 4)_ — the `motion` package (formerly Framer Motion, imported from `motion/react`)
  for list enter/exit and layout transitions, wrapped in `<MotionConfig reducedMotion="user">`.
- **Topology** _(Step 8)_ — a `TopologyGraph` component owns a Cytoscape instance imperatively
  (ref + effect) and applies incremental diffs rather than re-creating the graph on each update.

## 8. UI structure

### 8.1 Routes

| Path                 | Page                         | Step  | Purpose                                        |
| -------------------- | ---------------------------- | ----- | ---------------------------------------------- |
| `/`                  | `HomePage` → `DashboardPage` | 1 → 4 | Step 1: API status. Step 4+: network overview. |
| `/devices`           | `DevicesPage`                | 4     | Searchable, filterable device inventory        |
| `/devices/:deviceId` | `DeviceDetailsPage`          | 6     | Identity, history, diagnostics, ports          |
| `/topology`          | `TopologyPage`               | 8     | Interactive network map                        |
| `/scans`             | `ScansPage`                  | 9     | Scan history                                   |
| `/scans/:scanId`     | `ScanDetailsPage`            | 9     | What a scan found / changed                    |
| `/alerts`            | `AlertsPage`                 | 10    | Alert inbox with acknowledge                   |
| `/reports`           | `ReportsPage`                | 11    | Export inventory and scan results              |
| `/settings`          | `SettingsPage`               | later | Scan schedule, retention, preferences          |
| `*`                  | `NotFoundPage`               | 1     |                                                |

### 8.2 Layout and dashboard (target)

```
┌──────────────┬───────────────────────────────────────────────────────────────┐
│ ◎ NetScope   │ Home network · 192.168.1.0/24          ● Live    [ Scan now ] │ TopBar
│              ├───────────────────────────────────────────────────────────────┤
│ ▸ Dashboard  │ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
│   Devices    │ │ Devices    │ │ Online     │ │ New (24 h) │ │ Network      │ │ Stat cards
│   Topology   │ │ 42         │ │ 31         │ │ 2          │ │ health: Good │ │
│   Scans      │ └────────────┘ └────────────┘ └────────────┘ └──────────────┘ │
│   Alerts (2) │ ┌──────────────────────────────────┐ ┌──────────────────────┐ │
│   Reports    │ │ Topology preview                 │ │ Recent alerts        │ │
│              │ │                                  │ │                      │ │
│ ──────────── │ └──────────────────────────────────┘ └──────────────────────┘ │
│   Settings   │ ┌──────────────────────────────────┐ ┌──────────────────────┐ │
│              │ │ Recent activity (live feed)      │ │ Last scan summary    │ │
└──────────────┴─┴──────────────────────────────────┴─┴──────────────────────┴─┘
```

Each widget appears in the step that produces its data:

| Widget                                 | Data source                                                              | Step |
| -------------------------------------- | ------------------------------------------------------------------------ | ---- |
| Network overview (name, CIDR, gateway) | `GET /api/network`                                                       | 3–4  |
| Device count / Online / New devices    | `GET /api/network/overview`, device store                                | 4    |
| Live indicator, Recent activity        | WebSocket events                                                         | 5    |
| Network health                         | Gateway reachability, latency, and packet loss (formula defined in-step) | 5    |
| Topology preview                       | `GET /api/network/topology`                                              | 8    |
| Last scan summary                      | `GET /api/scans?limit=1`                                                 | 9    |
| Recent alerts                          | `GET /api/alerts`, `alert.created` events                                | 10   |

Every data view implements **loading, empty, error, and populated** states, and works at mobile
widths (the sidebar collapses to a sheet).

## 9. Environment variables

Loaded from `server/.env` and `client/.env` in development (templates: `.env.example`). Names and
defaults for later steps are proposals, finalized in their step.

### Server

| Variable                         | Step | Default                 | Secret | Purpose                                                                 |
| -------------------------------- | ---- | ----------------------- | ------ | ----------------------------------------------------------------------- |
| `NODE_ENV`                       | 1    | `development`           |        | `development` \| `test` \| `production`                                 |
| `HOST`                           | 1    | `127.0.0.1`             |        | Bind address. Loopback until auth exists.                               |
| `PORT`                           | 1    | `4000`                  |        | HTTP + WebSocket port                                                   |
| `LOG_LEVEL`                      | 1    | `info`                  |        | pino level                                                              |
| `CORS_ORIGIN`                    | 1    | `http://localhost:5173` |        | Comma-separated browser origin allowlist                                |
| `DATABASE_URL`                   | 2    | — (required)            | ✅     | `postgres://user:pass@host:5432/netscope` (TLS: `?sslmode=verify-full`) |
| `DATABASE_POOL_MAX`              | 2    | `10`                    |        | Max pooled connections                                                  |
| `DATABASE_CONNECTION_TIMEOUT_MS` | 2    | `5000`                  |        | Wait for a pooled connection before failing                             |
| `DATABASE_STATEMENT_TIMEOUT_MS`  | 2    | `15000`                 |        | Server-side limit per SQL statement                                     |
| `TEST_DATABASE_URL`              | 2    | — (tests only)          | ✅     | Database for `npm test`; name must end in `_test`                       |
| `SCAN_INTERFACE`                 | 3    | auto-detect             |        | Interface to monitor (`en0`, `eth0`)                                    |
| `SCAN_TIMEOUT_MS`                | 3    | `120000`                |        | Hard limit per scan job                                                 |
| `PING_TIMEOUT_MS`                | 3    | `1000`                  |        | Per-host ping timeout                                                   |
| `PING_CONCURRENCY`               | 3    | `64`                    |        | Parallel pings during a sweep                                           |
| `WS_PATH`                        | 5    | `/ws`                   |        | WebSocket endpoint                                                      |
| `WS_HEARTBEAT_INTERVAL_MS`       | 5    | `30000`                 |        | Ping interval for dead-connection detection                             |
| `NMAP_PATH`                      | 7    | `nmap` from `PATH`      |        | nmap binary                                                             |
| `PORT_SCAN_PORTS`                | 7    | curated common ports    |        | Allowed port list (validated, hard-capped)                              |
| `SCAN_RATE_LIMIT_PER_HOUR`       | 7    | `30`                    |        | Scan requests per client per hour                                       |
| `SCAN_SCHEDULE_MINUTES`          | 9    | `0` (off)               |        | Periodic discovery interval                                             |
| `DATA_RETENTION_DAYS`            | 9    | `90`                    |        | Purge observations older than this                                      |
| `ALERT_OFFLINE_AFTER_MINUTES`    | 10   | `15`                    |        | Absence before a device-offline alert                                   |
| `SESSION_SECRET`                 | 12   | — (required in prod)    | ✅     | Signs session cookies                                                   |
| `ADMIN_PASSWORD_HASH`            | 12   | — (required in prod)    | ✅     | Login credential (argon2/bcrypt hash, never plaintext)                  |
| `TRUST_PROXY`                    | 12   | `false`                 |        | Set when behind a reverse proxy                                         |
| `SERVE_CLIENT`                   | 12   | `false`                 |        | Serve `client/dist` from Express (single origin)                        |

### Client

| Variable               | Step | Default                 | Purpose                                                                   |
| ---------------------- | ---- | ----------------------- | ------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`    | 1    | `/api`                  | API base. Keep relative so the browser always uses its own origin.        |
| `DEV_API_PROXY_TARGET` | 1    | `http://127.0.0.1:4000` | Dev-server only (read in `vite.config.js`, never shipped to the browser). |
| `VITE_WS_PATH`         | 5    | `/ws`                   | WebSocket path, resolved against the page origin                          |

`VITE_*` variables are compiled into the public bundle — never put secrets in them.

### Docker Compose (root `.env`)

| Variable            | Default | Secret | Purpose                                          |
| ------------------- | ------- | ------ | ------------------------------------------------ |
| `POSTGRES_PASSWORD` | —       | ✅     | Password of the `netscope` role in the container |
| `POSTGRES_PORT`     | `5433`  |        | Host port (loopback only)                        |

## 10. Dependencies

### Installed so far

| Package                                                    | Where        | Why                                                                            |
| ---------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `concurrently`                                             | root (dev)   | Run server and client dev processes from one terminal (`npm run dev`).         |
| `prettier`, `prettier-plugin-tailwindcss`                  | root (dev)   | One formatting standard; deterministic Tailwind class order.                   |
| `express` (v5)                                             | server       | HTTP framework; v5 propagates async errors natively.                           |
| `helmet`                                                   | server       | Secure default HTTP headers.                                                   |
| `cors`                                                     | server       | Origin allowlist for direct browser access.                                    |
| `pino`, `pino-http`                                        | server       | Fast structured logging with per-request correlation.                          |
| `zod` (v4)                                                 | server       | Validation for env now; for request bodies and WS messages later.              |
| `pino-pretty`                                              | server (dev) | Readable logs in development.                                                  |
| `vitest`, `supertest`                                      | server (dev) | Test runner; in-process HTTP assertions against `createApp()`.                 |
| `eslint`, `@eslint/js`, `globals`                          | both (dev)   | Static analysis with flat config.                                              |
| `react`, `react-dom` (v19)                                 | client       | UI library.                                                                    |
| `react-router` (v7)                                        | client       | Routing (data mode).                                                           |
| `vite`, `@vitejs/plugin-react`                             | client (dev) | Dev server with HMR, production bundler, API proxy.                            |
| `tailwindcss`, `@tailwindcss/vite` (v4)                    | client (dev) | Utility-first styling, compiled by the Vite plugin.                            |
| `shadcn`                                                   | client       | Provides `shadcn/tailwind.css` base styles and the component CLI.              |
| `radix-ui`                                                 | client       | Accessible primitives underneath shadcn/ui components.                         |
| `class-variance-authority`                                 | client       | Typed variant styling used by shadcn/ui components.                            |
| `cn`                                                       | client       | Tailwind-aware class merging (shadcn's replacement for clsx + tailwind-merge). |
| `lucide-react`                                             | client       | Icon set.                                                                      |
| `tw-animate-css`                                           | client       | Animation utilities used by shadcn/ui components.                              |
| `@fontsource-variable/geist`                               | client       | Self-hosted font; no third-party font CDN at runtime.                          |
| `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` | client (dev) | Hooks rules; HMR-safe exports.                                                 |
| `@types/react`, `@types/react-dom`                         | client (dev) | Editor IntelliSense in JavaScript files (no TypeScript compile).               |
| `pg` _(Step 2)_                                            | server       | PostgreSQL driver with connection pooling.                                     |
| `node-pg-migrate` _(Step 2)_                               | server       | Versioned plain-SQL migrations with locking and up/down support.               |

### Added in later steps

| Package / tool                    | Step             | Why                                                                             |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `zustand`                         | 4                | Shared client state (entity stores, UI preferences).                            |
| `motion`                          | 4                | Animations and layout transitions.                                              |
| `@testing-library/react`, `jsdom` | 4                | Component tests with Vitest.                                                    |
| `ws`                              | 5                | WebSocket server.                                                               |
| `express-rate-limit`              | 7                | Throttle scan-triggering endpoints.                                             |
| `nmap` (system binary)            | 3 (optional) / 7 | Host discovery and TCP connect scans. `brew install nmap` / `apt install nmap`. |
| `cytoscape`                       | 8                | Graph rendering for the topology view.                                          |

## 11. Decision log

| #   | Decision                                       | Rationale                                                                                                                                                      | Revisit when                                                             |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | npm workspaces monorepo                        | One install/lockfile/CI; Turborepo/Nx unnecessary at this size.                                                                                                | Build times hurt.                                                        |
| 2   | JavaScript + JSDoc typedefs, not TypeScript    | Project rule. JSDoc gives editor types for contracts with no build step.                                                                                       | Shared API/WS contracts grow enough that compile-time checking pays off. |
| 3   | Express 5                                      | Native async error propagation; mature ecosystem.                                                                                                              | —                                                                        |
| 4   | zod for all validation                         | One library for env, HTTP input, and WS messages.                                                                                                              | —                                                                        |
| 5   | REST for commands, WebSocket for push only     | One validated write path; WS stays simple; snapshot + delta handles reconnects.                                                                                | —                                                                        |
| 6   | `ws` over Socket.IO                            | Standard protocol, native browser client, no fallbacks needed on a LAN; reconnect and channels are ~100 lines.                                                 | We need rooms across multiple server instances.                          |
| 7   | `pg` + SQL migrations over an ORM              | Native `inet` / `cidr` / `macaddr` types, explicit SQL, no codegen. Implemented in Step 2 (node-pg-migrate, SQL files).                                        | Query complexity makes a query builder worthwhile.                       |
| 8   | In-process job runner                          | Single host, one scan at a time; Redis/BullMQ would be operational overhead.                                                                                   | Multiple workers or durable queues are needed.                           |
| 9   | Loopback bind by default, auth in Step 12      | A scanning API must not be reachable from the LAN without authentication.                                                                                      | —                                                                        |
| 10  | Server runs on the host, not in Docker Desktop | On macOS/Windows containers live in a NAT'd VM and cannot see the LAN at layer 2. On Linux, `network_mode: host` works. PostgreSQL can run in Docker anywhere. | —                                                                        |
| 11  | No root, TCP-connect techniques only           | Least privilege; the ARP cache supplies MACs without raw sockets.                                                                                              | —                                                                        |
| 12  | Same origin for UI and API                     | No CORS in normal operation; cookies work; the client bundle holds no environment-specific URLs.                                                               | —                                                                        |
| 13  | React Router 7 (not 8)                         | v8 requires Node ≥ 22.22; the project currently targets Node 22.13. API used (data mode) is the same.                                                          | Node is upgraded (Node 24 LTS recommended).                              |
| 14  | shadcn/ui on Radix primitives, Nova preset     | Accessible, battle-tested primitives; components are owned source, not a dependency.                                                                           | —                                                                        |
| 15  | Vitest everywhere                              | One runner and API for server and client.                                                                                                                      | —                                                                        |
