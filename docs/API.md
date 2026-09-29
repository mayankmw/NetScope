# NetScope API

> Status: **Step 2.** Only `GET /api/health` is implemented. Everything else is the plan, and
> each group is finalized in the step that builds it.

## 1. Conventions

| Topic             | Convention                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base path         | `/api`. There is no version prefix: client and server ship together from one repo. If external consumers appear, `/api/v2` is mounted alongside. |
| Format            | JSON only (`Content-Type: application/json`). Request bodies are limited to 100 kB.                                                              |
| Field names       | `camelCase` in JSON; `snake_case` in the database (repositories map between them).                                                               |
| IDs               | UUID strings.                                                                                                                                    |
| Timestamps        | ISO 8601 in UTC, e.g. `2026-09-29T12:00:00.000Z`.                                                                                                |
| Network values    | IPs as strings (`192.168.1.20`); MACs lowercase and colon-separated (`a4:83:e7:12:34:56`); CIDRs as strings.                                     |
| Request IDs       | Every response carries `X-Request-Id`. A caller may send one (≤128 chars of `[A-Za-z0-9._-]`); otherwise a UUID is generated.                    |
| Validation        | Every route with input validates `params`, `query`, and `body` with zod. Unknown body fields are rejected.                                       |
| Long-running work | `POST` returns **202 Accepted** with the created resource (`status: "queued"`). Progress arrives over the WebSocket; final state via `GET`.      |

## 2. Response envelope

Every response has the same three top-level keys: `success`, `data`, and `error`.

**Success:** `error` is always `null`.

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Paginated lists add `"meta": { "page": 1, "pageSize": 50, "total": 42, "totalPages": 1 }`.

**Failure:** `data` is always `null`.

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{ "path": "body.displayName", "message": "Too long" }],
    "requestId": "b3c1e2a4-5d6f-4a7b-8c9d-0e1f2a3b4c5d"
  }
}
```

Clients branch on `error.code`, never on `message`. `details` is optional and structured.
`requestId` matches the `X-Request-Id` header and the server's log line for that request.
Internal details (stack traces, SQL, driver messages, hostnames, credentials) are never returned.

## 3. Status codes

| Status | Use                                                                      |
| ------ | ------------------------------------------------------------------------ |
| 200    | Success with body                                                        |
| 201    | Resource created synchronously                                           |
| 202    | Long-running job accepted (scans)                                        |
| 204    | Success, no body                                                         |
| 400    | Malformed JSON or validation failure                                     |
| 401    | Not authenticated _(Step 12)_                                            |
| 404    | Unknown route or resource                                                |
| 409    | Conflict with current state (e.g. a scan is already running)             |
| 413    | Body too large                                                           |
| 422    | Well-formed but not allowed by policy (e.g. target outside local subnet) |
| 429    | Rate limited                                                             |
| 500    | Unexpected server error (a bug)                                          |
| 503    | A dependency is unavailable (database, nmap missing)                     |

## 4. Error codes

| Code                   | Status | Since | Meaning                                            |
| ---------------------- | ------ | ----- | -------------------------------------------------- |
| `BAD_REQUEST`          | 4xx    | 1     | Generic client error from the HTTP layer           |
| `INVALID_JSON`         | 400    | 1     | Body is not valid JSON                             |
| `VALIDATION_ERROR`     | 400    | 3     | Params, query, or body failed validation           |
| `NOT_FOUND`            | 404    | 1     | Route or resource does not exist                   |
| `CONFLICT`             | 409    | 2     | Request conflicts with existing data               |
| `PAYLOAD_TOO_LARGE`    | 413    | 1     | Body exceeds the limit                             |
| `INTERNAL_ERROR`       | 500    | 1     | Unexpected failure; see server logs by `requestId` |
| `DATABASE_UNAVAILABLE` | 503    | 2     | PostgreSQL unreachable, timed out, or rejecting us |
| `SCAN_IN_PROGRESS`     | 409    | 3     | Only one scan may run at a time                    |
| `TARGET_NOT_ALLOWED`   | 422    | 3     | Target is outside the local private subnet         |
| `TOOL_UNAVAILABLE`     | 503    | 3     | Required system tool (e.g. nmap) not installed     |
| `RATE_LIMITED`         | 429    | 7     | Too many scan requests                             |
| `UNAUTHORIZED`         | 401    | 12    | Authentication required                            |

The client adds its own codes when no envelope is available: `NETWORK_ERROR`, `TIMEOUT`,
`SERVER_UNAVAILABLE` (proxy returned 502/503/504), and `INVALID_RESPONSE`.

## 5. Collections

- **Pagination** — `?page=1&pageSize=50` (max 200) → `meta: { page, pageSize, total, totalPages }`.
- **Filtering** — explicit, validated query params: `?status=online&search=printer`.
- **Sorting** — `?sort=-lastSeenAt` (leading `-` = descending); only allowlisted fields.

## 6. Implemented endpoints

### `GET /api/health`

Verifies that the API is running **and** PostgreSQL answers a round-trip query. Monitors can rely
on the status code alone: `200` when every check is up, `503` otherwise.

**200 OK**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "netscope-server",
    "version": "0.1.0",
    "environment": "development",
    "uptimeSeconds": 42,
    "timestamp": "2026-09-29T12:00:00.000Z",
    "checks": {
      "api": { "status": "up" },
      "database": { "status": "up", "latencyMs": 1.2 }
    }
  },
  "error": null
}
```

**503 Service Unavailable** (the same report, in `error.details`)

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "The database is unavailable.",
    "details": {
      "status": "degraded",
      "checks": { "api": { "status": "up" }, "database": { "status": "down" } }
    },
    "requestId": "59d64560-96b4-41bf-8e3b-7c93ea148672"
  }
}
```

(`details` also carries `service`, `version`, `environment`, `uptimeSeconds`, and `timestamp`;
shortened here.) The reason for the failure is logged on the server, never returned.

## 7. Planned endpoints

### `/api/devices`

| Method & path                                  | Step | Purpose                                                  |
| ---------------------------------------------- | ---- | -------------------------------------------------------- |
| `GET /api/devices`                             | 3–4  | List devices (filter `status`, `search`; sort; paginate) |
| `GET /api/devices/:deviceId`                   | 6    | Device details                                           |
| `PATCH /api/devices/:deviceId`                 | 6    | Edit `displayName`, `notes`, `deviceType`, `isTrusted`   |
| `POST /api/devices/:deviceId/diagnostics/ping` | 6    | On-demand ping (latency, loss)                           |
| `GET /api/devices/:deviceId/ports`             | 7    | Latest port-check results                                |
| `GET /api/devices/:deviceId/history`           | 9    | Presence and IP timeline                                 |

### `/api/scans`

| Method & path                    | Step | Purpose                                                                                      |
| -------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `POST /api/scans`                | 3, 7 | Start a scan → 202. Body: `{ "type": "discovery" }` or `{ "type": "port", "deviceId": "…" }` |
| `GET /api/scans/:scanId`         | 3    | Scan status and summary                                                                      |
| `POST /api/scans/:scanId/cancel` | 3    | Cancel a queued or running scan                                                              |
| `GET /api/scans`                 | 9    | Scan history (paginated)                                                                     |

### `/api/network`

| Method & path               | Step | Purpose                                                  |
| --------------------------- | ---- | -------------------------------------------------------- |
| `GET /api/network`          | 3    | Current network: interface, CIDR, gateway                |
| `GET /api/network/overview` | 4–5  | Dashboard counts (total, online, new) and network health |
| `GET /api/network/topology` | 8    | Nodes and edges for the topology view                    |

### `/api/alerts` _(Step 10)_

| Method & path                      | Purpose                             |
| ---------------------------------- | ----------------------------------- |
| `GET /api/alerts`                  | List alerts (`?acknowledged=false`) |
| `PATCH /api/alerts/:alertId`       | Acknowledge one alert               |
| `POST /api/alerts/acknowledge-all` | Acknowledge all open alerts         |

### `/api/reports` _(Step 11)_

| Method & path                                     | Purpose                                                   |
| ------------------------------------------------- | --------------------------------------------------------- |
| `GET /api/reports/devices?format=csv\|json`       | Device inventory export (streamed, `Content-Disposition`) |
| `GET /api/reports/scans/:scanId?format=csv\|json` | Single scan results export                                |

Report downloads are the one exception to the JSON envelope: a successful response is the file
itself; errors still use the envelope.
