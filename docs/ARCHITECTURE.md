# NetScope Architecture

> Status: **Step 10 — network alerts.** Items marked _(Step N)_ are designed here but built in that step.
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
│   │   ├── app/                   App (MotionConfig), router (lazy pages), navigation config
│   │   ├── components/
│   │   │   ├── ui/                shadcn/ui primitives (generated — do not hand-edit)
│   │   │   ├── common/            GlassPanel, PageHeader, StatCard, EmptyState, ErrorState,
│   │   │   │                      StatusDot, Tag, RelativeTime, SearchInput, SegmentedControl,
│   │   │   │                      FilterMenu, Toaster, PageFallback, DetailList, CopyButton
│   │   │   ├── layout/            Sidebar, SidebarNav, MobileNav, TopBar, Brand, ScanProgressBar
│   │   │   ├── devices/           DeviceTable, DeviceGrid/Card, DeviceToolbar, DiscoverButton,
│   │   │   │                      DeviceStatusBadge, DeviceTypeLabel, DeviceLink, attributes,
│   │   │   │                      skeleton
│   │   │   ├── device-details/    DeviceHeader, DeviceStatus, DeviceIdentityCard,
│   │   │   │                      DeviceNetworkCard, DeviceAlerts, DevicePresenceHistory,
│   │   │   │                      DevicePorts, PortRow, DeviceActivity, DeviceMetadata, skeleton
│   │   │   ├── network/           NetworkPanel
│   │   │   ├── system/            SystemStatusCard, SystemStatusIndicator
│   │   │   ├── topology/          TopologyGraph, Toolbar, NodePanel, Legend, List, Controls;
│   │   │   │                      graphSync, graphStyle, graphLayouts, graphTheme, nodeIcons
│   │   │   ├── scans/             ScanHistoryList, ScanTrendChart, ScanStatusBadge, ScanLink,
│   │   │   │                      ScanDetailsHeader, ScanDiscoveryResults, ScanPortResults,
│   │   │   │                      ScanSettings
│   │   │   └── alerts/            AlertItem, AlertRules, AlertsBell, alertTypes
│   │   ├── config/                env.js — the only reader of import.meta.env
│   │   ├── constants/             deviceTypes.js (labels for device_types codes)
│   │   ├── hooks/                 useDeviceInventory, useDeviceFilters (URL), useDiscoverNetwork,
│   │   │                          useDeviceDetails, useDevicePorts, useOpenDevice, useRealtime,
│   │   │                          useTopology, useCytoscape, useTopologyGraph, useScanHistory,
│   │   │                          useScanDetails, useOpenScan, useAlerts, useDeviceAlerts,
│   │   │                          useSystemHealth, useMediaQuery, useNow, useKeyboardShortcut
│   │   ├── layouts/               AppLayout (sidebar + top bar + animated outlet)
│   │   ├── lib/                   shadcn `cn` helper
│   │   ├── pages/                 DashboardPage, DevicesPage, DeviceDetailsPage, TopologyPage,
│   │   │                          ScansPage, ScanDetailsPage, AlertsPage, NotFoundPage,
│   │   │                          RouteErrorPage
│   │   ├── services/              apiClient, deviceService, scanService, alertService,
│   │   │                          healthService, realtimeClient
│   │   ├── stores/                useDeviceStore, useDeviceDetailsStore, usePortScanStore,
│   │   │                          useScanHistoryStore, useScanDetailsStore, useAlertStore,
│   │   │                          useConnectionStore, useSystemStore, useUiStore (Zustand)
│   │   ├── test/                  Vitest setup (jsdom polyfills) and fixtures
│   │   ├── types/                 JSDoc typedefs for API contracts
│   │   ├── utils/                 deviceFilters (search/filter/sort/URL), deviceActivity (timeline
│   │   │                          text), deviceLinks, format, ids, ip, mac, portScan, topology,
│   │   │                          scans (filters/URL, page merge), presence (bar segments, stats),
│   │   │                          alerts (filters/URL, states), alertAnnouncer (toast batching)
│   │   ├── index.css              Tailwind entry + NetScope theme tokens and utilities
│   │   └── main.jsx
│   ├── .env.example
│   ├── components.json            shadcn/ui configuration
│   ├── eslint.config.js
│   ├── index.html                 <html class="dark">
│   ├── jsconfig.json              `@/` path alias for editors
│   └── vite.config.js             Plugins, alias, dev proxy, vendor chunk, Vitest config
│
├── server/                        Express API + WebSocket + network layer
│   ├── src/
│   │   ├── config/                Env schema (zod) → validated, frozen config
│   │   ├── routes/                URL → middleware chain → controller
│   │   ├── controllers/           HTTP adapters: read validated input, call service, send envelope
│   │   ├── services/              Business logic and orchestration
│   │   ├── validators/            zod schemas for params / query / body
│   │   ├── middleware/            requestId, httpLogger, validate, rateLimit, notFound, errorHandler
│   │   ├── errors/                AppError + stable error codes
│   │   ├── db/                    pool.js, errors.js, migrator.js, migrate.js (CLI), migrations/; repositories/ (3)
│   │   ├── network/               Discovery + diagnostics (see §5, DISCOVERY.md)
│   │   ├── jobs/                  (later) In-process scan job runner (scheduled scans)
│   │   ├── events/                eventBus: in-process publish/subscribe of domain events
│   │   ├── websocket/             wsManager (connections, heartbeat, broadcast), messages
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
├── shared/                        @netscope/shared — contracts used by both sides (event types)
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

_Built in Steps 3 (discovery) and 7 (port scans)._

### 5.1 Structure

```
server/src/network/
├── index.js                 Public surface used by services (and replaced in tests)
├── errors.js                NetworkError + codes (no HTTP knowledge)
├── ip.js · mac.js           Pure IPv4/CIDR and MAC helpers
├── guards.js                Private-range, local-subnet, sweep-size, and port-list enforcement
├── networkDetection.js      Default route → interface → subnet → gateway IP + MAC
├── localInterfaces.js       This machine's own interfaces (recognizes the NetScope host)
├── exec/
│   ├── tools.js             Allowlist: arp, ping, route, nmap → absolute paths
│   └── runCommand.js        The ONLY place child processes are spawned
├── platform/                OS differences behind one interface
│   ├── darwin.js            route / arp / BSD ping
│   └── linux.js             /proc/net/route, /proc/net/arp, iputils ping
├── parsers/                 Pure functions: raw output → objects (fixture-tested)
│   ├── arp.parser.js · route.parser.js · ping.parser.js
│   └── nmap.parser.js       nmap XML (-oX -): host discovery and port scans
├── portscan/
│   ├── portProfile.js       The fixed list of 63 common TCP ports
│   └── nmapPortScan.js      The fixed `nmap -sT` command line; guards; run + parse
└── discovery/
    ├── pingSweep.js         Bounded-concurrency echo sweep
    ├── nmapDiscovery.js     Fixed `nmap -sn` profile (optional)
    ├── hostnames.js         Reverse DNS (c-ares, timeouts, sanitized)
    ├── vendors.js           MAC → manufacturer from the bundled IEEE registry
    ├── classifyDevice.js    Conservative device-type guess
    └── normalizeDevices.js  Merge by IP, identify by MAC, dedupe → common Device shape
```

Orchestration and persistence live in `services/discovery.service.js`,
`services/portScan.service.js`, and `db/repositories/`. Full flows, commands, and failure
handling: [DISCOVERY.md](DISCOVERY.md) and [PORT_SCANNING.md](PORT_SCANNING.md).

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

**Port scans (Step 7)** check one known device at a time: its stored IP, which must be on the
network this machine is on now and still answer for the device's MAC (ARP cache, before and
after the scan). nmap runs a fixed TCP connect scan of 63 common ports with light service
detection; nothing about it can be chosen by a request. Details: [PORT_SCANNING.md](PORT_SCANNING.md).

### 5.3 Safety rules

These rules are non-negotiable.

1. **Scope** — every target must be an RFC 1918 private IPv4 address (10/8, 172.16/12,
   192.168/16) **and** inside the subnet of an active local interface. Sweeps are capped at 1,024
   addresses. No environment variable or API parameter can disable this.
2. **Execution** — `execFile` / `spawn` with argument arrays and `shell: false`. Only allowlisted
   binaries (`arp`, `ping`, `nmap`) are run, with a timeout, an output-size cap, and kill-on-abort. User
   input never becomes a flag — only validated IPs and ports are inserted into argv.
3. **nmap profile** — allowed: host discovery (`-sn`) and TCP connect scans (`-sT --unprivileged`)
   over a fixed port list, with light service detection (`-sV --version-light`) and a rate cap.
   **Never**: requested NSE scripts (`--script`, `-sC`), OS detection (`-O`), aggressive mode
   (`-A`), raw/SYN/UDP scans, or spoofing/decoy/fragmentation/evasion options (`-S`, `-D`, `-f`,
   `--spoof-mac`, `--data-length`, …). The "version" scripts `-sV` loads are inert at light
   intensity ([PORT_SCANNING.md §3](PORT_SCANNING.md#3-nmap-command-strategy)).
4. **Privilege** — never run as root or via sudo.
5. **Load** — one scan at a time, of any type (a partial unique index on `scans`); endpoints that
   start scans are rate limited; every scan has a hard timeout and is cancelled on shutdown.
6. **Exposure** — the API binds to `127.0.0.1` by default and warns loudly otherwise; it must not be
   exposed on the LAN until authentication exists _(Step 12)_.
7. **Accountability** — every scan is persisted with its type, target, parameters, timestamps, and outcome.

### 5.4 Long-running work

Discovery runs within its request, bounded by `SCAN_TIMEOUT_MS`: the tab that starts it gets the
result directly, other tabs follow through events.

Port scans (Step 7) run in the background, because they take up to minutes and the UI must show
"scanning" across reloads and tabs:

```
POST /api/devices/:id/scan ──▶ portScan.service: validate, record scans row (running)
        │                         └──▶ background run (AbortController, hard timeout)
        ▼                                 network layer ──▶ repositories ──▶ event bus ──▶ browsers
202 Accepted { scan }
```

Scan states: `queued → running → completed | failed | cancelled`. Runs are in-process: this is a
single-host app with at most one scan at a time. The database (one active scan, a partial unique
index) is the authority; an in-process slot refuses a concurrent request immediately. On startup,
scans left running by a previous process are marked failed; on shutdown, a running scan is
cancelled and recorded before the database pool closes. Scheduled scans (planned) will reuse this.

### 5.5 Platform support

macOS and Linux are supported (tool output differs, which `platform/` absorbs). Windows is out of
scope for the MVP.

## 6. WebSocket architecture

_Built in Step 5._ Event contract: [API.md — WebSocket](API.md#7-websocket).

```
discovery.service ──publish──▶ eventBus ──▶ wsManager ──broadcast──▶ every connected browser
 (after commit)                 (in-process)   (/ws, same port)          realtimeClient → stores → UI
```

| Aspect            | Design                                                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport         | `ws`, attached to the API's HTTP server at `WS_PATH` (`/ws`): same port, same origin. Vite proxies `/ws` in development.                                                                                                                                                           |
| Direction         | Push only: every domain event goes to every client. State changes go through the REST API; clients may only send `{"type":"ping"}`.                                                                                                                                                |
| Decoupling        | Services publish on `events/eventBus.js` and never import the WebSocket layer; controllers never touch it. A throwing subscriber is logged and isolated.                                                                                                                           |
| Consistency       | Device events and `discovery.completed` are published only after the transaction commits. Each change is derived from the database's before/after values, so it produces one event.                                                                                                |
| Snapshot + delta  | Clients load state over REST, then apply events. After any reconnection they reload the snapshot: events are not replayed, so nothing can be missed permanently.                                                                                                                   |
| Duplicates        | Every event has a unique `id`; the client drops ids it has seen (last 500). Applying an event twice is harmless, and an event older than the data held (`updatedAt`) is ignored.                                                                                                   |
| Liveness          | Every `WS_HEARTBEAT_INTERVAL_MS` the server pings each client and terminates any that did not answer the previous ping; it also sends `system.heartbeat`, which browsers can see. The client treats two missed heartbeats (+10 s) as a dead connection.                            |
| Reconnection      | Exponential backoff with jitter (1 s, 2 s, 4 s … 30 s cap), reset on success; immediate retry when the browser comes back online or the tab becomes visible.                                                                                                                       |
| Security          | Browser `Origin` must be in the CORS allowlist (or same-origin), which blocks cross-site WebSocket hijacking. 16 KiB message limit, zod-validated messages, binary frames refused, 5 invalid messages close the socket (1008), max 100 clients. Authentication arrives in Step 12. |
| Backpressure      | A client with more than 1 MiB unsent is closed with 1013; it reconnects and resyncs over REST.                                                                                                                                                                                     |
| Failure isolation | Socket errors are logged per connection; a client failure never affects others or the process. Graceful shutdown closes all clients with 1001 before the HTTP server and the DB pool.                                                                                              |

**Why the discover endpoint stays synchronous.** The tab that starts a scan gets its result in
the HTTP response; all other tabs follow along through events. Events are purely additive, so if
the socket is down the app still works and catches up on reconnect. Asynchronous (202) runs would
come with a job runner, if scheduled scans are added.

**Client side.** `services/realtimeClient.js` owns the single connection (backoff, watchdog,
dedupe) and knows nothing about React. `hooks/useRealtime.js`, mounted once in `AppLayout`,
routes its status to `useConnectionStore` (top-bar "Live" indicator) and its events to the
stores' `applyEvent` (`useDeviceStore`, `useDeviceDetailsStore`, `usePortScanStore`,
`useScanHistoryStore`, `useScanDetailsStore`, `useAlertStore`). Rows changed
by an event get a brief highlight. Port scans (`portscan.*`) run in the background, so the tab that
started one announces its outcome with a toast. New alerts (`alert.created`) are toasted in every
tab; a burst within 600 ms becomes one toast. On start (and after a reconnection) it loads the
alert counts behind the navigation badge.

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

| Kind of state                        | Where it lives                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Ephemeral UI (menu open, input text) | Component `useState`                                                                                       |
| Device inventory + discovery status  | `useDeviceStore`: normalized `byId` + ordered `ids`, `network`, `discovery`                                |
| The device on the details page       | `useDeviceDetailsStore`: details, timeline and discovery history pages, presence history                   |
| Scan history list                    | `useScanHistoryStore`: one filtered list (filters in the URL), cursor pages                                |
| The scan on the scan details page    | `useScanDetailsStore`: one scan and its results                                                            |
| Alerts                               | `useAlertStore`: counts (badge), the Alerts page list, the shown device's alerts; optimistic state changes |
| Real-time connection status          | `useConnectionStore` (top-bar "Live" indicator, store decisions)                                           |
| Port scans                           | `usePortScanStore`: the scan running anywhere, and each viewed device's ports                              |
| API / database health                | `useSystemStore`: one request shared by the top bar and the dashboard                                      |
| UI preferences (sidebar collapsed)   | `useUiStore` with `persist` → localStorage (fails silently if blocked)                                     |
| Device filters, search, sort         | URL search params (`useDeviceFilters`), so views are linkable and reloadable                               |

Data flow: **component → hook → store action → service → apiClient**. Components never call
services or `fetch`. Stores expose actions (`fetchDevices`, `discoverNetwork`, `checkHealth`);
hooks add page concerns (load-if-stale, toasts, URL sync). Components subscribe with narrow
selectors to limit re-renders.

- `fetchDevices` cancels an older in-flight request. A failed refresh keeps the loaded data and
  surfaces the error inline; only a failed first load shows the full error state.
- `discoverNetwork` runs the scan, remembers IP changes for this session, then reloads the full
  inventory (the discovery response omits devices that went offline).
- Search, filtering, and sorting run client-side in pure functions (`utils/deviceFilters.js`): a
  network holds at most ~1,000 devices, so no server-side pagination is needed.
- `useDeviceDetailsStore` holds one device at a time. `open(id)` loads the details and the first
  page of both histories in parallel; each part has its own loading and error state, so a failed
  history does not hide the device. Real-time events about that device update it at once (newer
  `updatedAt` only) and schedule one background refresh shortly after, which puts new history
  entries on top of the pages already loaded. Leaving the page cancels requests but keeps the
  data, so going back is instant. A malformed id is "not found" without a request.

- `usePortScanStore.active` is the one scan running anywhere (from `portscan.*` events and
  `system.connected`). It disables "Discover network" and other devices' "Scan ports", matching the
  server's one-scan rule. A scan's end reloads that device's ports over REST; without a live
  connection, `useDevicePorts` polls every 3 s while its device is being scanned.

- `useScanHistoryStore` and `useScanDetailsStore` follow the same pattern: a scan starting,
  finishing, or failing (`discovery.*`, `portscan.*`) schedules one reload shortly after; the
  history merges the fresh first page over the loaded pages (fresh copies replace rows, so a
  running scan turns completed in place). The presence history lives in `useDeviceDetailsStore`
  and refreshes with the device; changing its range reloads only it.

- `useAlertStore` takes exact counts from every alert event; `alert.created` adds the alert to
  each loaded list it matches, without a request. Changing an alert's state shows at once and is
  undone if the server refuses it.

TanStack Query is deliberately not used: most data will arrive by server push into shared entity state, and
Zustand covers both push and fetch with one model.

### 7.3 Other decisions

- **Routing** — React Router data mode (`createBrowserRouter`). A pathless error route keeps the
  layout visible when a page throws. Every page is route-level code-split with `lazy`; third-party
  code is a separate `vendor` chunk so it stays cached across app updates.
- **Styling** — Tailwind v4 with shadcn/ui CSS-variable tokens. Generated `components/ui/*` files
  are not hand-edited; wrap or compose them instead.
- **Motion** — the `motion` package (formerly Framer Motion, imported from `motion/react`) for page
  fades, stat-card and card-grid staggers, the segmented-control indicator, and the scan progress
  line. Wrapped in `<MotionConfig reducedMotion="user">`; CSS animations use `motion-safe:`.
- **Responsive** — sidebar at ≥ 1024 px (collapsible to an icon rail), slide-out sheet below. The
  device list renders a sortable table at ≥ 768 px and cards below (`useMediaQuery` renders one,
  not both). A sort control replaces the table headers on narrow screens.
- **Visual language** — dark only (`<html class="dark">`). Deep blue-black background with two
  faint colour fields and a 32 px grid; `glass-panel` surfaces (translucent card, blur, hairline
  border); one primary neon (cyan) for actions, focus, and the active nav item; magenta only for
  "new"; green online, amber warning, red error. Glow is limited to the primary button, the active
  nav marker, and status dots. Geist for text, Geist Mono for IPs and MACs; muted text keeps
  ≥ 4.5:1 contrast.
- **Accessibility** — semantic table with `aria-sort`, radio-group status filter with arrow keys,
  labelled icon buttons, visible focus rings, "/" focuses search, Escape clears it, missing
  values read as "Unknown".
- **Topology** _(Step 8)_ — a logical topology (gateway → devices) built in the browser from the
  device inventory by a pure function, drawn with Cytoscape. One instance per mount
  (`useCytoscape`, lazy-loaded), updated by diff (`useTopologyGraph`): status changes restyle,
  structure changes re-run a computed (preset) layout. A list view presents the same structure
  accessibly. Details: [TOPOLOGY.md](TOPOLOGY.md).
- **Scan history** _(Step 9)_ — read-only views over the records every scan already writes; each
  discovery stores its outcome counts on its scan row, so lists never aggregate. Charts are plain
  elements (no chart library): a column per scan, and a presence bar built from status periods.
  Details: [SCAN_HISTORY.md](SCAN_HISTORY.md).
- **Alerts** _(Step 10)_ — decided on the server by pure rules over each discovery's before/after
  values, recorded in the discovery transaction, deduplicated by the database (one open alert per
  key). The client shows them: unread badge (sidebar and top-bar bell), grouped toasts, the
  Alerts page, and a panel on the device page. Details: [ALERTS.md](ALERTS.md).

## 8. UI structure

### 8.1 Routes

| Path                 | Page                | Step  | Purpose                                                                                     |
| -------------------- | ------------------- | ----- | ------------------------------------------------------------------------------------------- |
| `/`                  | `DashboardPage`     | 4     | Network overview: stats, network, health, newest devices                                    |
| `/devices`           | `DevicesPage`       | 4     | Searchable, filterable, sortable device inventory (`?q=&status=&type=&vendor=&sort=&dir=`)  |
| `/devices/:deviceId` | `DeviceDetailsPage` | 6–9   | Status, identity, network, presence history, open ports (scan), activity, metadata          |
| `/topology`          | `TopologyPage`      | 8     | Logical network graph: gateway → devices; search, layouts, list view, live                  |
| `/scans`             | `ScansPage`         | 9     | Scan history: network / port scans, status filter, trend chart (`?type=&status=&device=`)   |
| `/scans/:scanId`     | `ScanDetailsPage`   | 9     | What a scan found, missed, and changed; ports; settings; older / newer                      |
| `/alerts`            | `AlertsPage`        | 10    | Alerts by state and type (`?status=&type=&device=`): read, resolve, reopen; how alerts work |
| `/reports`           | `ReportsPage`       | 11    | Export inventory and scan results                                                           |
| `/settings`          | `SettingsPage`      | later | Scan schedule, retention, preferences                                                       |
| `*`                  | `NotFoundPage`      | 1     |                                                                                             |

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

| Widget                                 | Data source                                                              | Step  |
| -------------------------------------- | ------------------------------------------------------------------------ | ----- |
| Network overview (name, CIDR, gateway) | `GET /api/network`                                                       | 3–4   |
| Device count / Online / New devices    | `GET /api/network/overview`, device store                                | 4     |
| Live indicator, Recent activity        | WebSocket events                                                         | 5     |
| Network health                         | Gateway reachability, latency, and packet loss (formula defined in-step) | 5     |
| Topology preview                       | Device inventory (`buildTopologyModel`)                                  | later |
| Last scan summary                      | `GET /api/scans?limit=1`                                                 | later |
| Recent alerts                          | `GET /api/alerts`, `alert.created` events                                | later |

Every data view implements **loading, empty, error, and populated** states, and works at mobile
widths (the sidebar collapses to a sheet).

## 9. Environment variables

Loaded from `server/.env` and `client/.env` in development (templates: `.env.example`). Names and
defaults for later steps are proposals, finalized in their step.

### Server

| Variable                         | Step  | Default                 | Secret | Purpose                                                                 |
| -------------------------------- | ----- | ----------------------- | ------ | ----------------------------------------------------------------------- |
| `NODE_ENV`                       | 1     | `development`           |        | `development` \| `test` \| `production`                                 |
| `HOST`                           | 1     | `127.0.0.1`             |        | Bind address. Loopback until auth exists.                               |
| `PORT`                           | 1     | `4000`                  |        | HTTP + WebSocket port                                                   |
| `LOG_LEVEL`                      | 1     | `info`                  |        | pino level                                                              |
| `CORS_ORIGIN`                    | 1     | `http://localhost:5173` |        | Comma-separated browser origin allowlist                                |
| `DATABASE_URL`                   | 2     | — (required)            | ✅     | `postgres://user:pass@host:5432/netscope` (TLS: `?sslmode=verify-full`) |
| `DATABASE_POOL_MAX`              | 2     | `10`                    |        | Max pooled connections                                                  |
| `DATABASE_CONNECTION_TIMEOUT_MS` | 2     | `5000`                  |        | Wait for a pooled connection before failing                             |
| `DATABASE_STATEMENT_TIMEOUT_MS`  | 2     | `15000`                 |        | Server-side limit per SQL statement                                     |
| `TEST_DATABASE_URL`              | 2     | — (tests only)          | ✅     | Database for `npm test`; name must end in `_test`                       |
| `SCAN_INTERFACE`                 | 3     | auto-detect             |        | Interface to monitor (`en0`, `eth0`)                                    |
| `SCAN_TIMEOUT_MS`                | 3     | `60000`                 |        | Hard limit per discovery run                                            |
| `PING_TIMEOUT_MS`                | 3     | `1000`                  |        | Per-host ping timeout                                                   |
| `PING_CONCURRENCY`               | 3     | `64`                    |        | Parallel pings during a sweep                                           |
| `NMAP_DISCOVERY`                 | 3     | `auto`                  |        | `auto`: use nmap host discovery when installed; `off`: never            |
| `NMAP_PATH`                      | 3     | standard locations      |        | Absolute nmap path if installed elsewhere (must end in `/nmap`)         |
| `WS_PATH`                        | 5     | `/ws`                   |        | WebSocket endpoint                                                      |
| `WS_HEARTBEAT_INTERVAL_MS`       | 5     | `30000`                 |        | Ping + `system.heartbeat` interval; unresponsive clients are dropped    |
| `PORT_SCAN_ENABLED`              | 7     | `true`                  |        | `false` refuses every port scan (403); results stay readable            |
| `PORT_SCAN_TIMEOUT_MS`           | 7     | `120000`                |        | Hard limit per port scan (15000–600000)                                 |
| `PORT_SCAN_SERVICE_DETECTION`    | 7     | `light`                 |        | `light`: `-sV --version-light`; `off`: TCP connects only                |
| `SCAN_RATE_LIMIT_MAX`            | 7     | `20`                    |        | Scans a client may start per window (discovery, port scans separately)  |
| `SCAN_RATE_LIMIT_WINDOW_MS`      | 7     | `600000`                |        | Rate-limit window (10 min)                                              |
| `ALERT_RETURN_AFTER_MS`          | 10    | `86400000`              |        | Minimum absence for a "back online" alert (1 min – 90 days)             |
| `ALERT_COOLDOWN_MS`              | 10    | `86400000`              |        | After an alert is resolved, the same alert stays quiet (0 – 30 days)    |
| `SCAN_SCHEDULE_MINUTES`          | later | `0` (off)               |        | Periodic discovery interval                                             |
| `DATA_RETENTION_DAYS`            | later | `90`                    |        | Purge observations older than this                                      |
| `SESSION_SECRET`                 | 12    | — (required in prod)    | ✅     | Signs session cookies                                                   |
| `ADMIN_PASSWORD_HASH`            | 12    | — (required in prod)    | ✅     | Login credential (argon2/bcrypt hash, never plaintext)                  |
| `TRUST_PROXY`                    | 12    | `false`                 |        | Set when behind a reverse proxy                                         |
| `SERVE_CLIENT`                   | 12    | `false`                 |        | Serve `client/dist` from Express (single origin)                        |

### Client

| Variable               | Step | Default                 | Purpose                                                                   |
| ---------------------- | ---- | ----------------------- | ------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`    | 1    | `/api`                  | API base. Keep relative so the browser always uses its own origin.        |
| `DEV_API_PROXY_TARGET` | 1    | `http://127.0.0.1:4000` | Dev-server only (read in `vite.config.js`, never shipped to the browser). |
| `VITE_WS_PATH`         | 5    | `/ws`                   | WebSocket path on the page origin, or a full `ws(s)://` URL               |

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
| `fast-xml-parser` _(Step 3)_                               | server       | Parses nmap's XML output (no native code).                                     |
| `oui-data` _(Step 3)_                                      | server       | Bundled IEEE OUI registry for MAC → vendor lookup, offline.                    |
| `zustand` _(Step 4)_                                       | client       | Shared client state (device inventory, health, UI preferences).                |
| `motion` _(Step 4)_                                        | client       | Page, list, and indicator animations (formerly Framer Motion).                 |
| `sonner` _(Step 4)_                                        | client       | Toast notifications for discovery results and errors.                          |
| `@fontsource-variable/geist-mono` _(Step 4)_               | client       | Self-hosted monospace font for IPs and MACs.                                   |
| `vitest`, `jsdom` (29), `@testing-library/*` _(Step 4)_    | client (dev) | Component and store tests. jsdom 29 is the newest that supports Node 22.13.    |
| `ws` _(Step 5)_                                            | server       | WebSocket server (and the client in server tests).                             |
| `express-rate-limit` _(Step 7)_                            | server       | Rate limits on endpoints that start scans.                                     |
| `cytoscape` _(Step 8)_                                     | client       | Graph rendering for the topology view (own lazy-loaded chunk).                 |
| `lucide` _(Step 8)_                                        | client       | Framework-free icon data, to draw device icons inside graph nodes.             |

### Added in later steps

| Package / tool         | Step             | Why                                                                             |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `nmap` (system binary) | 3 (optional) / 7 | Host discovery and TCP connect scans. `brew install nmap` / `apt install nmap`. |

## 11. Decision log

| #   | Decision                                       | Rationale                                                                                                                                                                     | Revisit when                                                             |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | npm workspaces monorepo                        | One install/lockfile/CI; Turborepo/Nx unnecessary at this size.                                                                                                               | Build times hurt.                                                        |
| 2   | JavaScript + JSDoc typedefs, not TypeScript    | Project rule. JSDoc gives editor types for contracts with no build step.                                                                                                      | Shared API/WS contracts grow enough that compile-time checking pays off. |
| 3   | Express 5                                      | Native async error propagation; mature ecosystem.                                                                                                                             | —                                                                        |
| 4   | zod for all validation                         | One library for env, HTTP input, and WS messages.                                                                                                                             | —                                                                        |
| 5   | REST for commands, WebSocket for push only     | One validated write path; WS stays simple; snapshot + delta handles reconnects.                                                                                               | —                                                                        |
| 6   | `ws` over Socket.IO                            | Standard protocol, native browser client, no fallbacks needed on a LAN; reconnect and channels are ~100 lines.                                                                | We need rooms across multiple server instances.                          |
| 7   | `pg` + SQL migrations over an ORM              | Native `inet` / `cidr` / `macaddr` types, explicit SQL, no codegen. Implemented in Step 2 (node-pg-migrate, SQL files).                                                       | Query complexity makes a query builder worthwhile.                       |
| 8   | In-process job runner                          | Single host, one scan at a time; Redis/BullMQ would be operational overhead.                                                                                                  | Multiple workers or durable queues are needed.                           |
| 9   | Loopback bind by default, auth in Step 12      | A scanning API must not be reachable from the LAN without authentication.                                                                                                     | —                                                                        |
| 10  | Server runs on the host, not in Docker Desktop | On macOS/Windows containers live in a NAT'd VM and cannot see the LAN at layer 2. On Linux, `network_mode: host` works. PostgreSQL can run in Docker anywhere.                | —                                                                        |
| 11  | No root, TCP-connect techniques only           | Least privilege; the ARP cache supplies MACs without raw sockets.                                                                                                             | —                                                                        |
| 12  | Same origin for UI and API                     | No CORS in normal operation; cookies work; the client bundle holds no environment-specific URLs.                                                                              | —                                                                        |
| 13  | React Router 7 (not 8)                         | v8 requires Node ≥ 22.22; the project currently targets Node 22.13. API used (data mode) is the same.                                                                         | Node is upgraded (Node 24 LTS recommended).                              |
| 14  | shadcn/ui on Radix primitives, Nova preset     | Accessible, battle-tested primitives; components are owned source, not a dependency.                                                                                          | —                                                                        |
| 15  | Vitest everywhere                              | One runner and API for server and client.                                                                                                                                     | —                                                                        |
| 16  | Device timeline as a stored event log          | `device_events` is written in the discovery transaction from the same facts as the WebSocket events. Deriving status changes from scans would duplicate offline rules in SQL. | —                                                                        |
| 17  | Cursor pagination for device histories         | Append-only, newest-first lists that grow while being read: a `before` cursor never skips or repeats entries, unlike page numbers, and needs no `COUNT`.                      | —                                                                        |
| 18  | Port scans asynchronous (202), discovery not   | A port scan outlives a comfortable request, and its "scanning" state must survive reloads and show in every tab. Discovery's caller wants the result inline.                  | Scheduled scans may move discovery to the same model.                    |
| 19  | Fixed port profile in code, not configurable   | The list is the safety boundary: auditable in one file, identical everywhere, impossible to widen from the API or a misconfigured `.env`.                                     | Users need site-specific ports (then: an allowlisted, capped variable).  |
| 20  | Verify the target's MAC before and after       | DHCP reuses addresses: scanning a device's last known IP could hit another machine. The ARP cache confirms who answered; mismatched results are discarded.                    | —                                                                        |
| 21  | Topology built client-side, no endpoint        | The inventory already holds everything and is kept live by WebSocket events; a server model would duplicate data and the live-update path.                                    | Real link data (LLDP/SNMP) exists.                                       |
| 22  | Logical edges only (gateway → device)          | Discovery cannot see switches, access points, or Wi-Fi associations; drawing them would be invention. Edges are typed `logical` and drawn dashed.                             | Physical topology data becomes available.                                |
| 23  | Computed layouts, no physics                   | Radial and tree positions are O(n), deterministic, and stable across updates; force-directed layouts are O(n²) and reshuffle on every change.                                 | —                                                                        |
| 24  | Discovery outcome stored on the scan row       | Lists read one snapshot per scan instead of aggregating observations, and keep what the scan reported even if devices change later. Back-filled for older scans.              | Counts need to be recomputed after device merges.                        |
| 25  | Presence periods from status events            | `device_events` already holds every status change with its scan; periods are a pure function of it. Re-deriving status from observations would duplicate the offline rules.   | —                                                                        |
| 26  | Scan history pages use a keyset cursor         | Same reason as #17: the history grows while being read. `(created_at, id)` with a matching index per filter keeps every page a range scan.                                    | —                                                                        |
| 27  | Alerts written in the discovery transaction    | A new device is "new" only once: if its alert were written separately and failed, it could never be raised again. Committing both together makes that impossible.             | —                                                                        |
| 28  | Deduplication by an open-alert unique index    | One statement decides created / merged / suppressed, and the index makes "one open alert per device and change" a database rule rather than a check in code.                  | —                                                                        |
| 29  | First scan of a network is a baseline          | Every device would be "new" on the first scan; alerting on all of them is noise. Alerts start once there is something to compare with.                                        | Users want an inventory review step.                                     |
| 30  | "Back online" only after a long absence        | Phones and laptops come and go all day; that is their timeline, not an alert. A device away for a day or more coming back is worth a notice.                                  | —                                                                        |
