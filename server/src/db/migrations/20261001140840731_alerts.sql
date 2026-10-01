-- Up Migration

-- Network alerts (Step 10). The initial schema created `alerts` as a placeholder (with a single
-- `acknowledged_at` state); no code has ever written to it. This migration gives it the model
-- Step 10 needs:
--
--   * three states: unread → read → resolved (and back), with when each happened;
--   * deduplication: `dedup_key` names "the same alert" (e.g. new_device:<device id>), at most
--     one alert per key is open (unread or read), and a repeat updates that alert
--     (`occurrences`, `last_occurred_at`) instead of adding another;
--   * the alert types discovery raises: new_device, device_returned, ip_changed.
--
-- Rules, cooldown, and how alerts reach the UI: docs/ALERTS.md.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM alerts) THEN
    RAISE EXCEPTION 'alerts is expected to be empty before Step 10 (nothing wrote to it); '
                    'inspect its rows before migrating';
  END IF;
END
$$;

DROP INDEX alerts_open_idx;
DROP INDEX alerts_device_idx;
ALTER TABLE alerts
  DROP CONSTRAINT alerts_ack_after_create,
  DROP COLUMN acknowledged_at,
  DROP CONSTRAINT alerts_type_check;

ALTER TABLE alerts
  ADD CONSTRAINT alerts_type_check
    CHECK (type IN ('new_device', 'device_returned', 'ip_changed')),
  ADD COLUMN status text NOT NULL DEFAULT 'unread'
    CONSTRAINT alerts_status_check CHECK (status IN ('unread', 'read', 'resolved')),
  -- What makes two alerts "the same", e.g. 'ip_changed:<device id>'.
  ADD COLUMN dedup_key text NOT NULL
    CONSTRAINT alerts_dedup_key_check CHECK (char_length(dedup_key) BETWEEN 1 AND 200),
  -- How many times it happened while the alert was open; created_at is the first time.
  ADD COLUMN occurrences integer NOT NULL DEFAULT 1
    CONSTRAINT alerts_occurrences_check CHECK (occurrences >= 1),
  ADD COLUMN last_occurred_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN read_at timestamptz,
  ADD COLUMN resolved_at timestamptz,
  ADD CONSTRAINT alerts_read_at_unless_unread CHECK ((status = 'unread') = (read_at IS NULL)),
  ADD CONSTRAINT alerts_resolved_at_when_resolved
    CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  ADD CONSTRAINT alerts_occurred_order CHECK (last_occurred_at >= created_at);

COMMENT ON TABLE alerts IS
  'Notable network changes (new device, device back online, IP change); unread / read / resolved.';
COMMENT ON COLUMN alerts.context IS
  'Snapshot of the device when the alert last occurred (address, MAC, vendor, name, previous IP).';

-- Deduplication: at most one open (unread or read) alert per key. Discovery merges a repeat into
-- it with INSERT … ON CONFLICT on this index.
CREATE UNIQUE INDEX alerts_open_dedup_key_idx ON alerts (dedup_key) WHERE status <> 'resolved';
-- Cooldown: the most recently resolved alert of a key.
CREATE INDEX alerts_resolved_dedup_key_idx ON alerts (dedup_key, resolved_at DESC)
  WHERE status = 'resolved';
-- Lists, newest first, with a keyset on (created_at, id): all alerts, by status, by device.
CREATE INDEX alerts_created_idx ON alerts (created_at DESC, id DESC);
CREATE INDEX alerts_status_created_idx ON alerts (status, created_at DESC, id DESC);
CREATE INDEX alerts_device_idx ON alerts (device_id, created_at DESC, id DESC)
  WHERE device_id IS NOT NULL;

-- Down Migration

DROP INDEX alerts_device_idx;
DROP INDEX alerts_status_created_idx;
DROP INDEX alerts_created_idx;
DROP INDEX alerts_resolved_dedup_key_idx;
DROP INDEX alerts_open_dedup_key_idx;

ALTER TABLE alerts DROP CONSTRAINT alerts_type_check, ADD COLUMN acknowledged_at timestamptz;
UPDATE alerts
SET acknowledged_at = COALESCE(resolved_at, read_at),
    type = CASE WHEN type = 'device_returned' THEN 'device_online' ELSE type END;

ALTER TABLE alerts
  DROP CONSTRAINT alerts_occurred_order,
  DROP CONSTRAINT alerts_resolved_at_when_resolved,
  DROP CONSTRAINT alerts_read_at_unless_unread,
  DROP COLUMN resolved_at,
  DROP COLUMN read_at,
  DROP COLUMN last_occurred_at,
  DROP COLUMN occurrences,
  DROP COLUMN dedup_key,
  DROP COLUMN status;

ALTER TABLE alerts
  ADD CONSTRAINT alerts_type_check
    CHECK (type IN ('new_device', 'device_offline', 'device_online', 'ip_changed', 'new_open_port')),
  ADD CONSTRAINT alerts_ack_after_create
    CHECK (acknowledged_at IS NULL OR acknowledged_at >= created_at);

COMMENT ON TABLE alerts IS NULL;
COMMENT ON COLUMN alerts.context IS NULL;

CREATE INDEX alerts_open_idx ON alerts (network_id, created_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX alerts_device_idx ON alerts (device_id, created_at DESC) WHERE device_id IS NOT NULL;
