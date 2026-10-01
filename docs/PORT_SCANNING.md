# Port Scanning

> Status: **Step 7.** Endpoints: `POST /api/devices/:deviceId/scan`, `GET /api/devices/:deviceId/ports`
> ([API](API.md#post-apidevicesdeviceidscan)). Safety model: [Architecture §5](ARCHITECTURE.md#5-network-layer-and-safety-model).

A port scan shows which common TCP services one known device exposes, so you can spot things that
should not be reachable (a database, Telnet, a camera's admin page). It is a defensive inventory
tool. It checks a fixed list of ports on one device that discovery already found on your own
network, with ordinary TCP connections. It makes no login attempts, sends no exploits, does no OS
fingerprinting, and runs no stealth or evasion techniques. Requests cannot change any of that.

## 1. Flow

```
Device details page ── "Scan ports"
  ▼
POST /api/devices/:deviceId/scan          rate limited; params: deviceId (UUID); query and body must be empty
  ▼
portScan.service.startPortScan            (services/portScan.service.js)
  1. enabled?            PORT_SCAN_ENABLED, else 403 PORT_SCAN_DISABLED
  2. one at a time       a scan already running in this process → 409 SCAN_IN_PROGRESS
  3. known device        the id must exist → 404; the target is its stored IP, never request input
  4. nmap installed?     else 503 TOOL_UNAVAILABLE
  5. current network     detect this machine's network; the device must belong to it → 422
  6. local target        RFC 1918 address inside the current subnet → 422 TARGET_NOT_ALLOWED
  7. same device?        ARP cache maps the IP to another MAC → 409 TARGET_CHANGED
  8. record the scan     scans row (type "port", status "running", exact nmap arguments);
                         the database allows one running scan of any type → 409 otherwise
  9. publish             portscan.started
  ▼
202 Accepted { scan }  ── Location: /api/devices/:deviceId/ports
  ⋮  (in the background)
runPortScan
  10. nmap               fixed profile (§3), hard timeout, cancellable
  11. parse              XML → state of each of the 63 ports, with service / product / version
  12. same device?       the ARP check again (the connections refreshed it); a different MAC
                         discards everything → failed, TARGET_CHANGED
  13. save               one transaction: open ports → device_ports (first/last seen open),
                         per-port results → port_scan_results, summary → scans
  14. publish            portscan.completed { summary } or portscan.failed { error }
  ▼
GET /api/devices/:deviceId/ports          latest scan status + ports from the latest completed scan
```

Why asynchronous: a scan takes 5–60 s. Returning `202` at once keeps the request short, lets every
open tab follow the scan through WebSocket events, and lets the UI show "scanning" even after a
reload. If live updates are down, the UI polls `GET …/ports` every 3 s until the scan ends.

## 2. Security considerations

| Concern                     | Control                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scanning arbitrary hosts    | The request names a device id only. The IP comes from the database, must be RFC 1918, inside the subnet this machine is on now, and belong to a device on that network. `assertLocalTarget` re-checks it right before nmap runs.      |
| Scanning the wrong machine  | DHCP may give a device's old IP to another machine. If the ARP cache maps the IP to a different MAC, the scan is refused before it starts, or its results are discarded after it ends.                                                |
| Injecting nmap options      | `-sS`, `--script`, port lists, targets: any field in the body or query is a 400. The command line is built in code (`portScanArgs`) and run with `execFile` (no shell), from an absolute path, with an argument-length cap.           |
| Intrusive probing           | TCP connect only (`-sT --unprivileged`: ordinary connections, no raw packets, even as root). No NSE scripts are requested; `-sC`, `--script`, `-A`, `-O`, UDP, SYN/stealth, and every evasion option are never used. See §3 on `-sV`. |
| Load on devices and the LAN | 63 ports, `-T3` (normal timing), at most 100 probes per second, one retry, one scan at a time across discovery and port scans, and a rate limit on starting scans.                                                                    |
| Runaway scans               | nmap's own `--host-timeout` (`PORT_SCAN_TIMEOUT_MS` − 5 s), then a hard kill at `PORT_SCAN_TIMEOUT_MS`, then a final abort 10 s later. Server shutdown cancels the scan and records it as `cancelled`.                                |
| Abuse through the API       | Starting scans is rate limited per client (`SCAN_RATE_LIMIT_MAX` per `SCAN_RATE_LIMIT_WINDOW_MS`, separate budgets for discovery and port scans). The API binds to `127.0.0.1` until authentication exists (Step 12).                 |
| Turning it off              | `PORT_SCAN_ENABLED=false` refuses every port scan (403) while keeping earlier results readable. `PORT_SCAN_SERVICE_DETECTION=off` keeps scans to TCP connects only.                                                                   |
| Hostile service banners     | Parsed values are stripped of control characters and length-limited before storage. The UI renders them as text.                                                                                                                      |
| Accountability              | Every scan is stored with its target, status, timestamps, error, summary, and the exact nmap arguments (`scans.params.nmapArgs`). Logs carry the scan id, device id, and request id.                                                  |

## 3. nmap command strategy

The only port scan NetScope runs (`server/src/network/portscan/`):

```bash
nmap -sT --unprivileged -Pn -n \
     -p 21-23,25,53,80-81,88,110-111,135,139,143,389,443,445,465,515,548,554,587,631,636,873,993,995,1080,1433,1883,1900,2049,3000,3128,3306,3389,5000-5001,5060,5357,5432,5900,5985-5986,6379,7000,8000,8008-8009,8080-8081,8123,8443,8883,8888,9000,9100,9200,9443,10000,27017,32400,49152,62078 \
     -sV --version-light \
     -T3 --max-retries 1 --max-rate 100 --host-timeout 115s --noninteractive \
     -oX - 192.168.1.20
```

| Option                      | Why                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `-sT --unprivileged`        | TCP connect scan through the OS: the same connections any client makes. Never a SYN ("stealth") scan, even as root.           |
| `-Pn`                       | The device is already known from discovery; skip nmap's own host discovery.                                                   |
| `-n`                        | No DNS lookups.                                                                                                               |
| `-p <63 ports>`             | Remote access, web panels, file sharing, mail, directory, printing, media/IoT, databases, proxies (`portProfile.js`).         |
| `-sV --version-light`       | Service and version detection with only the most likely probes (intensity 2). Omitted when `PORT_SCAN_SERVICE_DETECTION=off`. |
| `-T3 --max-retries 1`       | nmap's normal timing; one retransmission at most.                                                                             |
| `--max-rate 100`            | At most 100 probes per second.                                                                                                |
| `--host-timeout`            | nmap stops itself 5 s before NetScope's hard limit, so a slow device yields a clean "timed out" instead of a killed process.  |
| `--noninteractive`, `-oX -` | No keyboard input; XML on stdout for the parser.                                                                              |

**Service detection and nmap scripts.** `-sV` makes nmap load its "version" script category
automatically; no other scripts can run, because none are requested. With `--version-light`
those scripts are inert. Verified against nmap 7.93's 44 version scripts:

- 41 only run at version intensity 7 or higher; light is 2.
- `ubiquiti-discovery` is UDP only, and NetScope scans TCP only.
- `fingerprint-strings` sends no traffic; it formats responses nmap already received.

So the only traffic is the TCP connections and nmap's light service probes. For example,
against an MQTT broker nmap connects and disconnects without subscribing to anything. Re-check
this when upgrading nmap, or set `PORT_SCAN_SERVICE_DETECTION=off`.

**Port states.** nmap lists interesting ports individually and summarizes the rest
(`<extraports>`); NetScope reads both, so every scanned port has a state:

| State      | Meaning                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `open`     | A service accepted the connection.                                                                    |
| `closed`   | The device answered with a refusal: reachable, nothing listening.                                     |
| `filtered` | No answer (a firewall drops it, or the device is offline). Also used for nmap's `open\|filtered` etc. |

## 4. What is stored

| Table               | What                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `scans`             | One row per port scan: target, status, `params` (profile, settings, `nmapArgs`), `summary`, error.     |
| `device_ports`      | Every port ever found open on a device: first and last time seen open, latest service/product/version. |
| `port_scan_results` | Per scan: each open port, plus the state of ports open before (so "no longer open" is known).          |

Closed and filtered ports that were never open are counted in the summary, not stored one by one.

## 5. API examples

```bash
DEVICE=$(curl -s http://127.0.0.1:4000/api/devices | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["devices"][0]["id"])')

# Start a scan → 202
curl -s -i -X POST http://127.0.0.1:4000/api/devices/$DEVICE/scan
# HTTP/1.1 202 Accepted
# Location: /api/devices/<id>/ports
# RateLimit: "port-scan"; r=19; t=600
# {"success":true,"data":{"scan":{"id":"…","status":"running","ipAddress":"192.168.1.20",…}},"error":null}

# Status and results (repeat until scan.status is no longer "running")
curl -s http://127.0.0.1:4000/api/devices/$DEVICE/ports | python3 -m json.tool

# Refused: options in the body → 400 VALIDATION_ERROR
curl -s -X POST -H 'Content-Type: application/json' -d '{"ports":"1-65535"}' \
  http://127.0.0.1:4000/api/devices/$DEVICE/scan
```

Full request and response shapes: [API.md](API.md#post-apidevicesdeviceidscan).

## 6. Troubleshooting

| Symptom                                      | Cause and fix                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 503 `TOOL_UNAVAILABLE`                       | nmap is not installed: `brew install nmap` (macOS) or `sudo apt install nmap` (Debian/Ubuntu). Elsewhere: set `NMAP_PATH`.            |
| 403 `PORT_SCAN_DISABLED`                     | `PORT_SCAN_ENABLED=false` in `server/.env`. Remove it and restart.                                                                    |
| 409 `SCAN_IN_PROGRESS`                       | A discovery or another port scan is running; only one scan runs at a time. Wait for it (the top bar shows a progress line).           |
| 409 `TARGET_CHANGED`                         | The device's last known IP now belongs to another machine. Run a discovery to update the inventory, then scan again.                  |
| 422 `TARGET_NOT_ALLOWED`: "not connected to" | The device was found on another network (e.g. at the office). NetScope only scans the network this computer is on.                    |
| 429 `RATE_LIMITED`                           | More than `SCAN_RATE_LIMIT_MAX` scans started in the window. Wait `Retry-After` seconds, or raise the limit for your setup.           |
| 503 `SCAN_TIMEOUT`                           | The device answers very slowly. Raise `PORT_SCAN_TIMEOUT_MS` (max 600000), or set `PORT_SCAN_SERVICE_DETECTION=off` for faster scans. |
| Every port "no response" (filtered)          | The device is offline, or its firewall drops connections (common on phones and Windows). Run a discovery to check it is online.       |
| "Version not identified"                     | Light detection did not recognize the service. Expected for uncommon services.                                                        |
| Scan shows "cancelled"                       | The server stopped during the scan. Start it again.                                                                                   |
| A scan stays "running" after a server crash  | It is closed (marked failed) at the next server start.                                                                                |
| Need more detail                             | `LOG_LEVEL=debug` logs the exact nmap command, exit code, and duration.                                                               |
