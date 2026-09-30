# Device Discovery

> Status: **Step 3.** Endpoint: `POST /api/devices/discover` ([API](API.md#post-apidevicesdiscover)).
> Safety model: [Architecture §5](ARCHITECTURE.md#5-network-layer-and-safety-model).

Discovery finds the devices currently visible on the local network, identifies each one by its
MAC address, and records what it saw. It only ever probes the private subnet this machine is
attached to, runs without root, and takes no targets from the API.

## 1. Flow

```
POST /api/devices/discover
  │  validate: the body must be empty; no targets, no options
  ▼
devices.controller ──▶ discovery.service                          (services/discovery.service.js)
                         │
  1. detect network      │  default route → interface → subnet → gateway IP → gateway MAC
                         │  (networkDetection.js; SCAN_INTERFACE overrides the interface)
  2. guard               │  RFC 1918 only · subnet ≤ /22 (larger ones narrowed to the local /24)
  3. record scan         │  networks upsert · scans row "running" (DB allows one active scan → 409)
  4. probe               ├─▶ ping sweep     one echo per host, 64 in parallel      (pingSweep.js)
                         ├─▶ nmap -sn       optional, when installed               (nmapDiscovery.js)
                         └─▶ ARP cache      IP ↔ MAC for every host that answered  (platform/*)
  5. parse               │  arp / route / ping / nmap XML → plain objects          (parsers/*)
  6. normalize           │  merge by IP, identify by MAC, dedupe, add this machine (normalizeDevices.js)
  7. enrich              │  vendor (bundled IEEE OUI) · hostname (reverse DNS) · type guess
  8. persist             │  one transaction: upsert devices by (network, MAC) · observations ·
                         │  mark unseen devices offline · complete scan           (repositories/*)
  9. respond             ▼  normalized devices + per-source report
```

Why the ping sweep matters even for hosts that ignore ping: before sending any packet to a LAN
address, the OS must resolve its MAC via ARP, and hosts answer ARP even when their firewall drops
ICMP. After the sweep, the ARP cache holds nearly every live host.

## 2. Commands executed

All commands run through `network/exec/runCommand.js`: `execFile` with an argument array (never a
shell), absolute binary paths from a fixed allowlist, a timeout, an output cap, a minimal
environment (`LC_ALL=C`), and cancellation. Only validated IPs and CIDRs are inserted.

| Purpose         | macOS                                                            | Linux                         |
| --------------- | ---------------------------------------------------------------- | ----------------------------- |
| Default route   | `/sbin/route -n get [-ifscope IF] default`                       | read `/proc/net/route`        |
| ARP cache       | `/usr/sbin/arp -an`                                              | read `/proc/net/arp`          |
| Ping            | `ping -n -q -c 1 -W <ms> -t <s> <ip>`                            | `ping -n -q -c 1 -W <s> <ip>` |
| nmap (optional) | `nmap -sn -n -T4 --max-retries 1 --host-timeout 5s -oX - <cidr>` | same                          |

On Linux the kernel tables are read directly, so neither `net-tools` (`arp`) nor `iproute2` is
required. nmap never receives scripts, OS detection, raw-packet, spoofing, or evasion options.

## 3. Device identity and updates

- Identity is `(network, MAC)`. A known MAC at a new IP updates the same device and is reported as
  `previousIpAddress` (DHCP renewal). IP history lives in `device_observations`.
- `first_seen_at` is set once. `last_seen_at` moves to the scan time. `status` becomes `online`.
- Devices in the swept range that were online but not seen this time become `offline`.
- Hostname and vendor keep their previous values when a scan cannot resolve them.
- The type guess only fills `unknown`: a type set by the user is never replaced. Display name,
  notes, and the trusted flag are never touched by scans.
- One MAC answering on several IPs (multi-homed host, proxy ARP) is stored once, at the IP that
  answered a probe; the duplicates are logged.
- Hosts that answered but whose MAC could not be resolved are returned as `unresolvedHosts` and
  not stored: they cannot be identified reliably.

## 4. Failure handling

| Situation                                 | Result                                                              |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `ping` missing or failing                 | Continues; `sources.ping.status` is `unavailable` / `failed`        |
| nmap not installed, off, failing, or slow | Continues; `sources.nmap.status` explains why                       |
| ARP cache unreadable                      | 503 `TOOL_UNAVAILABLE`; scan recorded as failed                     |
| No default gateway / VPN owns the route   | 503 `NETWORK_UNAVAILABLE` with a hint (`SCAN_INTERFACE`)            |
| Subnet not private (RFC 1918)             | 422 `TARGET_NOT_ALLOWED`                                            |
| Another scan running                      | 409 `SCAN_IN_PROGRESS`                                              |
| Longer than `SCAN_TIMEOUT_MS`             | 503 `SCAN_TIMEOUT`; child processes killed; scan recorded as failed |
| Server shutting down mid-scan             | 503 `SCAN_CANCELLED`; scan recorded as cancelled                    |
| Server crashed mid-scan                   | On next start the scan is marked failed (`INTERRUPTED`)             |
| Windows or another OS                     | 501 `PLATFORM_NOT_SUPPORTED`                                        |

## 5. Logs

Every discovery logs structured events with `component: "discovery"`, the `requestId`, and the
`scanId`: `network detected`, `scan started`, `source finished` (per source: status, duration,
counts), `New device`, `Device changed IP address`, `completed` (duration and summary), or
`failed` (error code and cause). Each executed command is logged at `debug` level with its
arguments, exit code, and duration.

## 6. Platform support

| Platform               | Status                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS                  | Supported. Uses the system `route`, `arp`, `ping`. nmap optional (`brew install nmap`).                                                                                                                            |
| Linux                  | Supported. Reads `/proc`; needs `ping` (`iputils-ping`). nmap optional (`apt install nmap`).                                                                                                                       |
| Windows                | Not supported: returns 501. `arp -a`, `route print`, and `ping` differ in output and flags, and would need a separate adapter in `network/platform/`. WSL2 runs behind NAT and would only see its virtual network. |
| Docker (macOS/Windows) | Not useful for the server: containers see Docker's virtual network, not your LAN.                                                                                                                                  |
| Docker (Linux)         | Works with `network_mode: host`.                                                                                                                                                                                   |

## 7. Known limitations

- **Stale ARP entries.** A device that left in the last few minutes can still be in the OS ARP
  cache and be reported online once more (`sources: ["arp"]` only). It turns offline on a later scan.
- **Randomized MACs.** Phones and laptops use private per-network MACs: no vendor, and a new MAC
  (after a reset or in "rotating" mode) looks like a new device.
- **Hostnames** come from reverse DNS (PTR records). Many home routers provide them; phone
  hotspots usually do not. mDNS/Bonjour names are not queried yet.
- **Device type** is a conservative guess from hostname and vendor; most devices stay `unknown`
  until the user sets a type (Step 6).
- **Unprivileged nmap** probes TCP 80/443 and cannot read MACs; the ARP cache supplies them.
- **Large subnets** are narrowed to the /24 around this machine (sweeps are capped at 1,022 hosts).
- **Duration**: a /24 takes about 5–10 s; the request waits for completion (it becomes
  asynchronous with progress events when WebSockets arrive in Step 5).

## 8. Troubleshooting

| Symptom                                                      | Cause and fix                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 503 `NETWORK_UNAVAILABLE`: "No default gateway"              | Not connected to a network. Connect and retry.                                                             |
| 503 `NETWORK_UNAVAILABLE`: "a VPN may own the default route" | Full-tunnel VPN. Disconnect it, or set `SCAN_INTERFACE=en0` (macOS) / `eth0`, `wlan0` (Linux) and restart. |
| 503 `NETWORK_UNAVAILABLE`: "gateway did not answer"          | Gateway blocks ping and is not in the ARP cache yet. Open any website, then retry.                         |
| 422 `TARGET_NOT_ALLOWED`                                     | The network is not RFC 1918 private (e.g. carrier-grade NAT 100.64.0.0/10). NetScope will not scan it.     |
| 409 `SCAN_IN_PROGRESS`                                       | Wait for the running scan. If none is running, restart the server (it closes interrupted scans).           |
| 503 `SCAN_TIMEOUT`                                           | Slow network or large subnet. Raise `SCAN_TIMEOUT_MS`, or lower `PING_TIMEOUT_MS`.                         |
| Only this machine and the router are found                   | Normal on phone hotspots and guest Wi-Fi with client isolation: devices cannot see each other.             |
| `sources.nmap.status: "unavailable"`                         | nmap is not installed; it is optional. `brew install nmap` / `sudo apt install nmap`.                      |
| `sources.ping.status: "unavailable"` (Linux)                 | Install `iputils-ping`.                                                                                    |
| Every host shows `hostname: null`                            | The router does not publish PTR records. Expected.                                                         |
| 501 `PLATFORM_NOT_SUPPORTED`                                 | Running on Windows. Use macOS or Linux.                                                                    |
| Need more detail                                             | Set `LOG_LEVEL=debug` to log every command with its arguments, exit code, and duration.                    |
