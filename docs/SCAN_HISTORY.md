# Scan History

> Status: **Step 9.** Pages: `/scans`, `/scans/:scanId`, and the presence history on
> `/devices/:deviceId`. API: `GET /api/scans`, `GET /api/scans/:scanId`,
> `GET /api/devices/:deviceId/history` ([API](API.md)). Schema: [DATABASE.md](DATABASE.md).

Every scan NetScope runs is kept, with what it saw. The scan history shows how the network changes
over time: which devices each discovery found, which appeared for the first time, which went
missing, and when each device was on the network.

## 1. What is recorded

Nothing in Step 9 adds a new kind of record: the history was already written by every scan. This
step makes it cheap to list and summarize, and shows it.

| Record                | Written by                         | Holds                                                                   |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `scans`               | every discovery and port scan      | type, status, target, settings (`params`), timestamps, error, `summary` |
| `device_observations` | discovery, per device it found     | the device's address, DNS name, and ping time in that scan              |
| `device_events`       | discovery, per change it detected  | discovered, online, offline, and changes of address, name, vendor, type |
| `port_scan_results`   | port scan, per open or closed port | the port's state and the service/version identified in that scan        |

All of them are written in one transaction with the change itself, so the history can never
disagree with the device inventory. `scans.summary` (Step 9 for discoveries, Step 7 for port
scans) is a snapshot of the outcome taken at that moment.

## 2. Definitions

A discovery's outcome (`scans.summary`, also in the `POST /api/devices/discover` response and the
`discovery.completed` event):

| Count             | Meaning                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `devicesFound`    | Devices the scan found                                                                                         |
| `newDevices`      | Found for the first time (a MAC never seen on this network)                                                    |
| `backOnline`      | Offline before this scan, found again                                                                          |
| `wentOffline`     | Online before this scan, not found (only devices whose address was in the swept range)                         |
| `missingDevices`  | Known on the network before the scan and not found by it: `wentOffline` plus devices that were already offline |
| `knownDevices`    | Devices known on the network after the scan (`devicesFound + missingDevices`)                                  |
| `ipChanges`       | Devices found at a different address than before                                                               |
| `unresolvedHosts` | Addresses that answered without a MAC address (cannot be identified); `null` for scans recorded before Step 9  |

**Missing is not the same as went offline.** A phone that left the house yesterday is missing from
every scan since, but it went offline only once, in the first scan that did not find it.

**Why a stored snapshot.** The counts could be computed from observations and events at read time.
Storing them when the scan completes is cheaper to list (no aggregation per row), and it keeps what
the scan reported even if devices are later merged or removed. Scans recorded before Step 9 were
back-filled by the migration from their observations and events.

## 3. Pages

### Scans (`/scans`)

- **Network scans** and **Port scans** tabs; status filter **All / Completed / Failed**. Filters
  live in the URL (`?type=port&status=failed`, `&device=<id>` for one device's port scans).
- **Devices per scan** (network scans): the last 30 completed discoveries, oldest left. Above the
  axis, devices found (new ones on top, magenta); below it, known devices that were missing, on the
  same scale. Clicking a column opens that scan.
- The list: when, network, duration, found (of known), new, missing (and how many went offline),
  status; port scans show the device and its open ports. Running scans show their elapsed time;
  failed ones their error. Newest first, 25 per page, "Load older scans".
- Live: a scan starting, finishing, or failing anywhere reloads the first page (one reload per
  burst of events); the fresh page replaces the rows it contains, so a running row becomes
  completed in place.

### Scan details (`/scans/:scanId`)

- Header: what ran, when, how long it took, the target, how it was started; **Older / Newer** step
  through the same network's discoveries (or the same device's port scans).
- Network scan: counts; **What changed** (new devices, back online, went offline, details changed);
  **Devices found**, with the address, name, vendor, and ping time the scan saw; **Missing
  devices**, with where each was last seen and how long before the scan.
- Port scan: counts, the open ports with what the scan identified, and ports open in an earlier
  scan that were not open in this one.
- **How it ran**: the settings recorded with the scan (swept range, interface, ping timeout and
  concurrency, nmap use; for port scans the profile, time limit, and exact nmap command).
- Failed and cancelled scans say why; nothing they saw was recorded. A running scan updates when it
  finishes.

### Device presence history (on `/devices/:deviceId`)

- Range **7 / 30 / 90 days** (kept while moving between devices).
- "Seen by 41 of 52 scans (79%) · went offline 3 times · longest offline 1d 2h".
- A bar across the range: online, offline, and the stretch before the device was first seen.
- One cell per discovery of its network in the range (found / not found); each opens its scan.
- The periods as text, newest first (the accessible equivalent of the bar).
- Each entry of the device's **Discovery history** tab links to its scan, and the **Open ports**
  panel links to all port scans of the device.

## 4. Presence periods

`GET /api/devices/:id/history` builds periods from the device's status events
(`server/src/services/presence.js`, pure and unit-tested):

```
events:   discovered ─────────── offline ────── online ─────────▶ now
periods:  [online            ) [offline     ) [online (ongoing)
```

- The status at the start of the range is the last status event before it; that first period is
  cut at the range start (`scanId: null`).
- A device with no status events at all (data from before device timelines) gets one period with
  its current status from when it was first seen.
- **Status is only known when a scan runs.** A period runs from the scan that observed a change to
  the scan that observed the next one; the page says so. With scans hours apart, a device may have
  come and gone in between without NetScope seeing it.

## 5. Performance

- Lists use keyset pagination on `(created_at, id)` with matching indexes (all scans, by type, by
  network and type): each page is an index range scan, however long the history.
- The list reads `scans.summary`; it never counts observations per row.
- A scan's details are four indexed reads (observations by scan, events by scan, known devices of
  the network, the neighbours in its history), run in parallel.
- A presence history is two indexed reads: the network's completed discoveries in the range (a
  partial index on completed discoveries by `finished_at`) joined to the device's observations,
  with totals from a window function; and the device's status events in the range. At most 100
  scans are listed; the totals count all of them.

## 6. Limitations

- Scans run when someone starts them; there is no schedule yet, so gaps between scans are as long
  as the gaps between clicks.
- No retention: the history grows until data is deleted (roughly devices × scans observation rows;
  small at manual scan rates).
- Missing devices are listed as they are now (name, type); the address shown is where each was last
  seen before the scan.
