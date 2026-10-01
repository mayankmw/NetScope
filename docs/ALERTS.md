# Network Alerts

> Status: **Step 10.** Page: `/alerts`; unread badge in the sidebar and top bar; alerts panel on
> `/devices/:deviceId`. API: `/api/alerts` ([API](API.md#get-apialerts)). Events: `alert.created`,
> `alert.updated`, `alerts.updated`. Schema: [DATABASE.md](DATABASE.md#alerts-step-10).

NetScope tells you when a device it has never seen joins your network. It also tells you, more
quietly, when a known device comes back after a long absence or changes address. Alerts are raised
by discovery, in the same transaction that records the devices, so a new device can never be
recorded without its alert.

## 1. Four ways a device can be seen

Each discovery compares every device it finds with what NetScope knew before the scan
(`server/src/services/alertRules.js`, pure and unit-tested). The discovery response reports the
result per device as `classification`.

| Classification | Meaning                                  | Alert                                                  |
| -------------- | ---------------------------------------- | ------------------------------------------------------ |
| `new`          | A MAC address never seen on this network | **`new_device`**, warning; once per device             |
| `returned`     | Offline before this scan, found again    | **`device_returned`**, info; only after a long absence |
| `ip_changed`   | Seen before, now at a different address  | **`ip_changed`**, info                                 |
| `known`        | Seen before, nothing changed             | None                                                   |

Identity is the MAC address on this network (as everywhere in NetScope), so a known device that
changes address or comes back is **never** reported as new.

| Rule detail           | Behaviour                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline              | The first scan of a network (it knew no device before) records the starting inventory and raises no alerts: every device would be "new".                   |
| Back online           | Only when the device had been away at least `ALERT_RETURN_AFTER_MS` (default 24 hours). Phones and laptops come and go all day; that is in their timeline. |
| Back at a new address | One `device_returned` alert that mentions the old address. After a short absence, the address change alone is an `ip_changed` alert.                       |
| This computer         | Never alerted about (its MAC belongs to one of the server's interfaces), even when it joins with a new adapter.                                            |
| Severity              | `warning` for a new device (it may be unfamiliar), `info` for the others.                                                                                  |

## 2. Avoiding alert spam

| Mechanism              | How                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One per device         | `new_device` can only happen once per device: a MAC is new only the first time.                                                                                                                                                                                                                                              |
| Merge while open       | Each alert has a `dedup_key` (`<type>:<device id>`). While an alert is open (unread or read), the same change again updates it: `occurrences + 1`, `last_occurred_at`, the latest message and details. Its state does not change, and no new notification is sent. A partial unique index guarantees one open alert per key. |
| Cooldown after resolve | After you resolve an alert, the same key raises nothing for `ALERT_COOLDOWN_MS` (default 24 hours). Then it can be raised again as a new alert.                                                                                                                                                                              |
| Absence threshold      | "Back online" needs a long absence (above).                                                                                                                                                                                                                                                                                  |
| Grouped notifications  | A burst of new alerts (one discovery) becomes one toast ("3 new alerts: 2 new devices · 1 back online"); one alert gets its own toast with a link to the device.                                                                                                                                                             |

All of this is one SQL statement per alert (`alertsRepository.recordAlert`): `INSERT … SELECT …
WHERE NOT EXISTS (resolved within the cooldown) ON CONFLICT (dedup_key) WHERE status <> 'resolved'
DO UPDATE …`, which returns whether the alert was created, merged, or suppressed.

## 3. States

```
unread ──read──▶ read ──resolve──▶ resolved
   ▲              │                    │
   └───unread─────┘◀──────reopen───────┘
```

- `read_at` is set the first time an alert is read (resolving also reads it); "mark unread" clears
  it. `resolved_at` is set on resolve and cleared on reopen. The database checks both.
- Opening the device from an alert marks it read.
- Reopening is refused (`409 CONFLICT`) while a newer open alert exists for the same key.
- **Mark all read** and **Resolve all** change every alert at once.

## 4. Live updates

| Event            | When                                                             | `data`                                              |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `alert.created`  | A discovery raised a new alert                                   | `alert`, `counts`                                   |
| `alert.updated`  | A repeat merged into an open alert, or one alert's state changed | `alert`, `counts`, `reason` (`repeated` / `status`) |
| `alerts.updated` | Mark all read, resolve all                                       | `ids`, `status`, `counts`                           |

Alert events come after the discovery's device events and before `discovery.completed`, and only
after its transaction commits. Each carries the exact counts by state, so every tab's badge is
right without counting. After a reconnection the client reloads the counts and the shown lists.

## 5. UI

- **Navigation:** the bell in the top bar (all widths) and the Alerts item in the sidebar show the
  number of unread alerts; the collapsed sidebar shows a dot.
- **Toasts:** new alerts are announced in every open tab, a new device as a warning.
- **Alerts page (`/alerts`):** filters by state (Open, Unread, Resolved, All) and type, in the URL
  (`?status=&type=&device=`); each alert shows what happened, when, how many times, links to the
  device and to the scan that saw it, and Mark read / Mark unread / Resolve / Reopen. New alerts
  appear on top, highlighted. **How alerts work** explains the rules with the server's settings.
- **Device page:** an **Alerts** panel (only for a device that has raised alerts) with its newest
  five and a link to all of them.

## 6. Settings

| Variable                | Default            | Range              | Meaning                                                         |
| ----------------------- | ------------------ | ------------------ | --------------------------------------------------------------- |
| `ALERT_RETURN_AFTER_MS` | `86400000` (1 day) | 1 minute – 90 days | Minimum absence for a "back online" alert                       |
| `ALERT_COOLDOWN_MS`     | `86400000` (1 day) | 0 – 30 days        | After an alert is resolved, how long the same alert stays quiet |

## 7. Limitations

- Alerts come from discovery, so they are as timely as the scans: there is no schedule yet.
- A device that changes its private (randomized) MAC address, such as a phone in "rotating"
  private-address mode, looks like a new device.
- A different gateway MAC is a different network to NetScope (networks are identified by gateway
  MAC and subnet), so its first scan is a baseline and raises no alerts.
- No alerts for devices going offline, or for newly open ports.
