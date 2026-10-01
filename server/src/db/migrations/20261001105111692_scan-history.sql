-- Up Migration

-- Scan history (Step 9). What each scan saw is already recorded: `scans` (one row per run),
-- `device_observations` (devices a discovery found), `device_events` (status and detail changes),
-- and `port_scan_results` (ports a port scan checked). This migration makes that history cheap to
-- list and summarize.

-- ---------------------------------------------------------------------------------------------
-- 1. Discovery outcome on the scan row.
--
-- Since Step 9, a completed discovery writes its counts to `scans.summary` in the transaction
-- that records its results, so the history shows them without re-reading every observation:
--
--   devicesFound     devices the scan found
--   newDevices       found for the first time
--   backOnline       offline before, found again
--   wentOffline      online before, not found (inside the swept range)
--   missingDevices   known on the network before the scan and not found by it (includes
--                    wentOffline, and devices that were already offline)
--   knownDevices     devices known on the network after the scan (devicesFound + missingDevices)
--   ipChanges        devices found at a different address than before
--   unresolvedHosts  addresses that answered without a MAC address (not identifiable)
--
-- Port scans have written their own summary since Step 7 (portsChecked, open, closed, ...).
-- ---------------------------------------------------------------------------------------------

-- Backfill completed discoveries from what they recorded. unresolvedHosts was never stored, so
-- it is null for these scans.
UPDATE scans s
SET summary = jsonb_build_object(
  'devicesFound',
    (SELECT count(*) FROM device_observations o WHERE o.scan_id = s.id),
  'newDevices',
    (SELECT count(*) FROM device_events e WHERE e.scan_id = s.id AND e.type = 'discovered'),
  'backOnline',
    (SELECT count(*) FROM device_events e WHERE e.scan_id = s.id AND e.type = 'online'),
  'wentOffline',
    (SELECT count(*) FROM device_events e WHERE e.scan_id = s.id AND e.type = 'offline'),
  'missingDevices',
    (SELECT count(*) FROM devices d
     WHERE d.network_id = s.network_id
       AND d.first_seen_at < s.started_at
       AND NOT EXISTS (
         SELECT 1 FROM device_observations o WHERE o.scan_id = s.id AND o.device_id = d.id
       )),
  'knownDevices',
    (SELECT count(*) FROM devices d
     WHERE d.network_id = s.network_id AND d.first_seen_at <= s.finished_at),
  'ipChanges',
    (SELECT count(*) FROM device_events e
     WHERE e.scan_id = s.id AND e.type = 'updated' AND e.changes ? 'ipAddress'),
  'unresolvedHosts', NULL
)
WHERE s.type = 'discovery' AND s.status = 'completed' AND s.summary IS NULL;

-- A discovery summary always carries the counts the history shows. (A missing key makes the
-- comparison NULL, which a CHECK would accept: hence IS TRUE.)
ALTER TABLE scans ADD CONSTRAINT scans_discovery_summary_counts CHECK (
  type <> 'discovery'
  OR summary IS NULL
  OR (
    jsonb_typeof(summary -> 'devicesFound') = 'number'
    AND jsonb_typeof(summary -> 'newDevices') = 'number'
    AND jsonb_typeof(summary -> 'missingDevices') = 'number'
  ) IS TRUE
);

COMMENT ON COLUMN scans.summary IS
  'Outcome counts of a completed scan: discoveries (since Step 9) and port scans (since Step 7).';

-- ---------------------------------------------------------------------------------------------
-- 2. Indexes for the scan history.
--
-- Lists are newest first and paginated with a keyset on (created_at, id), so each page is an
-- index range scan whatever the history's size: all scans, scans of one type, and scans of one
-- type on one network (which replaces the network-only index).
-- ---------------------------------------------------------------------------------------------
CREATE INDEX scans_created_idx ON scans (created_at DESC, id DESC);
CREATE INDEX scans_type_created_idx ON scans (type, created_at DESC, id DESC);

DROP INDEX scans_network_created_idx;
CREATE INDEX scans_network_type_created_idx ON scans (network_id, type, created_at DESC, id DESC);

-- Completed discoveries of a network by time: the network's last scan, a device's presence
-- history (which of them saw it), and its "scans since first seen" count.
CREATE INDEX scans_network_discoveries_idx ON scans (network_id, finished_at DESC)
  WHERE type = 'discovery' AND status = 'completed';

-- Down Migration

DROP INDEX scans_network_discoveries_idx;
DROP INDEX scans_network_type_created_idx;
CREATE INDEX scans_network_created_idx ON scans (network_id, created_at DESC);
DROP INDEX scans_type_created_idx;
DROP INDEX scans_created_idx;

COMMENT ON COLUMN scans.summary IS 'Outcome counts of a completed scan (port scans since Step 7).';
ALTER TABLE scans DROP CONSTRAINT scans_discovery_summary_counts;
-- Before Step 9, discoveries did not keep a summary.
UPDATE scans SET summary = NULL WHERE type = 'discovery';
