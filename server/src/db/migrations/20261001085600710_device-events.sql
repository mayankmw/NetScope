-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- device_events: append-only log of what happened to each device: first discovery, going
-- offline and coming back, and changes to its IP, hostname, vendor, or type.
--
-- Discovery writes these in the same transaction as the change itself, so the log can never
-- disagree with `devices`. They are the same facts that are broadcast as device.* WebSocket
-- events. Read by the device details page (activity timeline).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE device_events (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id    uuid        NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  -- The discovery scan that detected it. SET NULL keeps the history if old scans are purged.
  scan_id      uuid        REFERENCES scans (id) ON DELETE SET NULL,
  type         text        NOT NULL CHECK (type IN ('discovered', 'online', 'offline', 'updated')),
  -- The device's IP address when it happened.
  ip_address   inet        NOT NULL CHECK (family(ip_address) = 4 AND masklen(ip_address) = 32),
  -- 'updated' only: the old and new value of each changed field, e.g.
  --   {"ipAddress": {"from": "192.168.1.20", "to": "192.168.1.21"}}
  changes      jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(changes) = 'object'),
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_events_changes_only_on_update CHECK ((type = 'updated') = (changes <> '{}'))
);

-- A device's timeline, newest first (also the keyset for pagination).
CREATE INDEX device_events_device_occurred_idx ON device_events (device_id, occurred_at DESC, id DESC);
CREATE INDEX device_events_scan_idx ON device_events (scan_id) WHERE scan_id IS NOT NULL;

COMMENT ON TABLE device_events IS 'Append-only log of device changes: discovered, online, offline, updated.';

-- ---------------------------------------------------------------------------------------------
-- Backfill from the history already recorded, so existing devices start with a timeline:
--   discovered        when each device was first seen;
--   online / offline  reconstructed from which completed discoveries saw the device;
--   updated           consecutive observations of a device at different IP addresses.
-- Best effort: hostname, vendor, and type changes before this migration were not recorded.
-- ---------------------------------------------------------------------------------------------
INSERT INTO device_events (device_id, scan_id, type, ip_address, changes, occurred_at)
SELECT device_id, scan_id, type, ip_address, changes, occurred_at
FROM (
  -- First discovery
  SELECT d.id AS device_id,
         first_seen.scan_id,
         'discovered' AS type,
         COALESCE(first_seen.ip_address, d.ip_address) AS ip_address,
         '{}'::jsonb AS changes,
         d.first_seen_at AS occurred_at,
         0 AS rank
  FROM devices d
  LEFT JOIN LATERAL (
    SELECT o.scan_id, o.ip_address
    FROM device_observations o
    WHERE o.device_id = d.id
    ORDER BY o.observed_at, o.id
    LIMIT 1
  ) first_seen ON true

  UNION ALL

  -- Presence changes: a completed discovery that saw the device after one that did not, or
  -- the reverse.
  SELECT presence.device_id,
         presence.scan_id,
         CASE WHEN presence.seen THEN 'online' ELSE 'offline' END,
         COALESCE(presence.observed_ip, last_known.ip_address, d.ip_address),
         '{}'::jsonb,
         presence.finished_at,
         CASE WHEN presence.seen THEN 1 ELSE 3 END
  FROM (
    SELECT d.id AS device_id,
           s.id AS scan_id,
           s.finished_at,
           o.ip_address AS observed_ip,
           o.id IS NOT NULL AS seen,
           lag(o.id IS NOT NULL) OVER (PARTITION BY d.id ORDER BY s.finished_at, s.id) AS was_seen
    FROM devices d
    JOIN scans s ON s.network_id = d.network_id
                AND s.type = 'discovery'
                AND s.status = 'completed'
                AND s.finished_at >= d.first_seen_at
    LEFT JOIN device_observations o ON o.scan_id = s.id AND o.device_id = d.id
  ) presence
  JOIN devices d ON d.id = presence.device_id
  LEFT JOIN LATERAL (
    SELECT o.ip_address
    FROM device_observations o
    WHERE o.device_id = presence.device_id AND o.observed_at <= presence.finished_at
    ORDER BY o.observed_at DESC, o.id DESC
    LIMIT 1
  ) last_known ON true
  WHERE presence.was_seen IS NOT NULL AND presence.seen <> presence.was_seen

  UNION ALL

  -- IP address changes
  SELECT moved.device_id,
         moved.scan_id,
         'updated',
         moved.ip_address,
         jsonb_build_object(
           'ipAddress',
           jsonb_build_object('from', host(moved.previous_ip), 'to', host(moved.ip_address))
         ),
         moved.observed_at,
         2
  FROM (
    SELECT o.device_id, o.scan_id, o.ip_address, o.observed_at,
           lag(o.ip_address) OVER (PARTITION BY o.device_id ORDER BY o.observed_at, o.id) AS previous_ip
    FROM device_observations o
  ) moved
  WHERE moved.previous_ip IS NOT NULL AND moved.previous_ip <> moved.ip_address
) backfill
ORDER BY occurred_at, rank;

-- Down Migration

DROP TABLE device_events;
