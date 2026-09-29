# NetScope

**Local network intelligence and monitoring, for defensive diagnostics only.**

NetScope discovers the devices on your local network, tracks them over time, shows how they
connect, and alerts you when something new appears. It is in the spirit of Fing and GlassWire, and
is built to be safe by default.

> **Status:** Step 1 of 12 — architecture and project foundation. See the [roadmap](docs/ROADMAP.md).

## Scope and safety

NetScope is a **defensive** tool for networks you own or administer.

- It only targets **private addresses on the subnet this machine is attached to**. There is no way
  to point it at the internet.
- It runs **without root**, uses only non-intrusive techniques (ping, ARP cache, TCP connect
  checks on a bounded port list), and never runs exploit, evasion, or script-based probes.
- The API binds to `127.0.0.1` by default. It must not be exposed to the LAN until authentication lands (Step 12).

Details: [Architecture §5 — Network layer and safety model](docs/ARCHITECTURE.md#5-network-layer-and-safety-model).

## Features (planned)

- Device discovery with MAC vendor identification
- Live device list and dashboard (WebSocket updates)
- Device details and on-demand diagnostics (ping)
- Safe port checks on a single device
- Interactive network topology
- Scan history and device presence timeline
- New-device and change alerts
- CSV / JSON report export

## Tech stack

| Layer    | Technologies                                                                               |
| -------- | ------------------------------------------------------------------------------------------ |
| Frontend | React 19, Vite 8, Tailwind CSS 4, shadcn/ui, React Router 7, Zustand, Motion, Cytoscape.js |
| Backend  | Node.js 22, Express 5, zod, pino, WebSockets (`ws`)                                        |
| Data     | PostgreSQL 16+                                                                             |
| Network  | `arp`, `ping`, `nmap` (run safely via `execFile`, never a shell)                           |
| Tooling  | npm workspaces, ESLint, Prettier, Vitest, Supertest                                        |

## Architecture

```
Browser (React SPA) ──REST /api──▶ Express API ──▶ services ──▶ PostgreSQL
        ▲                              │
        └──────── WebSocket /ws ◀── event bus ◀── scan jobs ──▶ arp / ping / nmap
```

Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API contract: [docs/API.md](docs/API.md) ·
Data model: [docs/DATABASE.md](docs/DATABASE.md)

## Getting started

### Prerequisites

| Requirement    | Version                | Needed from                                                                 |
| -------------- | ---------------------- | --------------------------------------------------------------------------- |
| Node.js        | ≥ 22.13 (see `.nvmrc`) | Step 1                                                                      |
| npm            | ≥ 10                   | Step 1                                                                      |
| macOS or Linux | —                      | Step 1                                                                      |
| PostgreSQL     | ≥ 16                   | Step 2                                                                      |
| nmap           | ≥ 7.9                  | Step 7 (optional in Step 3) — `brew install nmap` / `sudo apt install nmap` |

### Install and run

```bash
git clone https://github.com/mayankmw/NetScope.git
cd NetScope
npm install

cp server/.env.example server/.env
cp client/.env.example client/.env

npm run dev
```

- UI: <http://localhost:5173>
- API: <http://127.0.0.1:4000/api/health>

The UI calls the API through the Vite dev proxy (`/api` → `DEV_API_PROXY_TARGET`), so the browser
only ever talks to its own origin.

## Scripts

Run from the repository root.

| Command              | What it does                                                  |
| -------------------- | ------------------------------------------------------------- |
| `npm run dev`        | Start API (watch mode) and UI (HMR) together                  |
| `npm run dev:server` | API only                                                      |
| `npm run dev:client` | UI only                                                       |
| `npm run build`      | Production build of the UI → `client/dist`                    |
| `npm start`          | Start the API without watch mode                              |
| `npm test`           | Run all test suites                                           |
| `npm run lint`       | ESLint across workspaces                                      |
| `npm run format`     | Format everything with Prettier                               |
| `npm run check`      | Format check + lint + tests + build (run before every commit) |

## Configuration

All configuration comes from environment variables. The server validates them at startup and
refuses to start with a clear message if any are invalid. See `server/.env.example`,
`client/.env.example`, and the full list (including future steps) in
[Architecture §9](docs/ARCHITECTURE.md#9-environment-variables).

## Project structure

```
netscope/
├── client/     React SPA — pages, components, layouts, hooks, services, stores, types, utils
├── server/     Express API — routes, controllers, services, middleware, config, errors
├── docs/       Architecture, API, database, roadmap
└── package.json  npm workspaces + root scripts
```

Annotated tree: [Architecture §3](docs/ARCHITECTURE.md#3-repository-layout).

## Roadmap

1. ✅ Architecture and development setup
2. PostgreSQL setup
3. Device discovery
4. Device list UI
5. Live WebSocket updates
6. Device details
7. Safe port scanning
8. Network topology visualization
9. Historical scans
10. New-device alerts
11. Report export
12. Deployment

What "done" means for each step: [docs/ROADMAP.md](docs/ROADMAP.md).

## Git workflow

All work happens on the `development` branch.

- Commit when a step's testing checklist passes and `npm run check` is green.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <summary>`,
  e.g. `feat(server): add GET /api/health`. Types: `feat`, `fix`, `docs`, `refactor`, `test`,
  `chore`. Scopes: `client`, `server`, `db`, `network`, `ws`, `docs`, `repo`, `deps`.
- Never commit `.env` files, credentials, or captured output from real networks (sanitize test
  fixtures: no real MACs or hostnames).

## License

[MIT](LICENSE)
