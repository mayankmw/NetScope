-- Up Migration

-- NetScope initial schema. Design notes and the device identity model: docs/DATABASE.md.
--
-- Pattern used throughout:
--   * current-state tables  (networks, devices, device_ports)  — what is true now; mutable
--   * per-scan result tables (device_observations, port_scan_results) — what each scan saw; append-only
-- Closed sets that code depends on use CHECK constraints; open, user-facing categories use a
-- lookup table (device_types).

-- ---------------------------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every UPDATE.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- networks: a monitored LAN. The same laptop can join several networks, so every device and
-- scan belongs to one. Identified by gateway MAC + subnet (two homes can both be 192.168.1.0/24).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE networks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        CHECK (char_length(name) BETWEEN 1 AND 100),
  cidr            cidr        NOT NULL CHECK (family(cidr) = 4),
  gateway_ip      inet        NOT NULL CHECK (masklen(gateway_ip) = 32),
  gateway_mac     macaddr     NOT NULL,
  interface_name  text        NOT NULL CHECK (char_length(interface_name) BETWEEN 1 AND 64),
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT networks_gateway_mac_cidr_key UNIQUE (gateway_mac, cidr),
  CONSTRAINT networks_gateway_in_cidr CHECK (gateway_ip << cidr),
  CONSTRAINT networks_seen_order CHECK (last_seen_at >= first_seen_at)
);

COMMENT ON TABLE networks IS 'A monitored LAN, identified by (gateway_mac, cidr).';

-- ---------------------------------------------------------------------------------------------
-- device_types: extensible lookup of device categories (adding one is an INSERT, not a migration).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE device_types (
  code        text     PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  label       text     NOT NULL CHECK (char_length(label) BETWEEN 1 AND 50),
  sort_order  smallint NOT NULL DEFAULT 0
);

INSERT INTO device_types (code, label, sort_order) VALUES
  ('unknown',      'Unknown',               0),
  ('router',       'Router / gateway',      10),
  ('access_point', 'Access point',          20),
  ('switch',       'Network switch',        30),
  ('computer',     'Computer',              40),
  ('phone',        'Phone',                 50),
  ('tablet',       'Tablet',                60),
  ('tv',           'TV / streaming device', 70),
  ('speaker',      'Smart speaker',         80),
  ('printer',      'Printer',               90),
  ('camera',       'Camera',                100),
  ('iot',          'Smart home / IoT',      110),
  ('game_console', 'Game console',          120),
  ('nas',          'Network storage',       130),
  ('server',       'Server',                140),
  ('other',        'Other',                 1000);

-- ---------------------------------------------------------------------------------------------
-- devices: current state of every device ever seen on a network.
-- Identity: (network_id, mac_address). The uuid `id` is the permanent reference used by the API
-- and foreign keys. Everything else is an attribute that may change.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE devices (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id     uuid        NOT NULL REFERENCES networks (id) ON DELETE CASCADE,

  -- Stable identifier
  mac_address    macaddr     NOT NULL,
  -- Locally administered bit set => randomized/private MAC (phones, some laptops).
  -- Derived from the MAC, so it can never disagree with it.
  mac_is_random  boolean     NOT NULL
                             GENERATED ALWAYS AS ((get_byte(macaddr_send(mac_address), 0) & 2) = 2) STORED,

  -- Observed attributes: latest values (history is in device_observations)
  ip_address     inet        NOT NULL CHECK (family(ip_address) = 4 AND masklen(ip_address) = 32),
  hostname       text        CHECK (char_length(hostname) BETWEEN 1 AND 253),
  vendor         text        CHECK (char_length(vendor) BETWEEN 1 AND 200),
  status         text        NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),

  -- Classification and user-managed attributes
  device_type    text        NOT NULL DEFAULT 'unknown'
                             REFERENCES device_types (code) ON UPDATE CASCADE,
  display_name   text        CHECK (char_length(display_name) BETWEEN 1 AND 100),
  notes          text        CHECK (char_length(notes) <= 2000),
  is_trusted     boolean     NOT NULL DEFAULT false,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT devices_network_mac_key UNIQUE (network_id, mac_address),
  CONSTRAINT devices_seen_order CHECK (last_seen_at >= first_seen_at)
);

CREATE INDEX devices_network_status_idx     ON devices (network_id, status);
CREATE INDEX devices_network_first_seen_idx ON devices (network_id, first_seen_at DESC);
CREATE INDEX devices_network_ip_idx         ON devices (network_id, ip_address);

COMMENT ON TABLE devices IS 'Current state of each device. Identity: (network_id, mac_address).';
COMMENT ON COLUMN devices.mac_is_random IS 'True when the MAC is locally administered (randomized/private).';

-- ---------------------------------------------------------------------------------------------
-- scans: one row per scan run (discovery of a subnet, or a port check of one device).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE scans (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: a scan can fail before the network is identified.
  network_id        uuid        REFERENCES networks (id) ON DELETE CASCADE,
  type              text        NOT NULL CHECK (type IN ('discovery', 'port')),
  status            text        NOT NULL DEFAULT 'queued'
                                CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  triggered_by      text        NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual', 'schedule')),
  -- Subnet for discovery (192.168.1.0/24), single host for port scans (192.168.1.20/32).
  target            inet        NOT NULL CHECK (family(target) = 4),
  target_device_id  uuid        REFERENCES devices (id) ON DELETE CASCADE,
  -- Exact parameters used (ports, timeouts), kept for auditability.
  params            jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(params) = 'object'),
  error_code        text        CHECK (char_length(error_code) BETWEEN 1 AND 64),
  error_message     text        CHECK (char_length(error_message) <= 1000),
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scans_port_scan_has_device CHECK ((type = 'port') = (target_device_id IS NOT NULL)),
  CONSTRAINT scans_port_target_is_host  CHECK (type <> 'port' OR masklen(target) = 32),
  CONSTRAINT scans_started_when_running CHECK (status NOT IN ('running', 'completed') OR started_at IS NOT NULL),
  CONSTRAINT scans_finished_when_done   CHECK ((status IN ('completed', 'failed', 'cancelled')) = (finished_at IS NOT NULL)),
  CONSTRAINT scans_time_order           CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at),
  CONSTRAINT scans_error_only_on_failure CHECK (status = 'failed' OR error_code IS NULL)
);

-- Safety rule "one scan at a time", enforced by the database: at most one queued/running row.
CREATE UNIQUE INDEX scans_single_active_idx ON scans ((true)) WHERE status IN ('queued', 'running');
CREATE INDEX scans_network_created_idx ON scans (network_id, created_at DESC);
CREATE INDEX scans_target_device_created_idx ON scans (target_device_id, created_at DESC)
  WHERE target_device_id IS NOT NULL;

COMMENT ON TABLE scans IS 'One row per scan run. At most one scan may be queued or running.';

-- ---------------------------------------------------------------------------------------------
-- device_observations: discovery scan results — one row per device seen in a discovery scan.
-- The raw material for presence history, IP history, and uptime.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE device_observations (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scan_id      uuid        NOT NULL REFERENCES scans (id) ON DELETE CASCADE,
  device_id    uuid        NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  ip_address   inet        NOT NULL CHECK (family(ip_address) = 4 AND masklen(ip_address) = 32),
  hostname     text        CHECK (char_length(hostname) BETWEEN 1 AND 253),
  latency_ms   real        CHECK (latency_ms >= 0),
  observed_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_observations_scan_device_key UNIQUE (scan_id, device_id)
);

CREATE INDEX device_observations_device_observed_idx ON device_observations (device_id, observed_at DESC);

COMMENT ON TABLE device_observations IS 'Discovery scan results: a device seen by a scan, with its IP at that time.';

-- ---------------------------------------------------------------------------------------------
-- device_ports: every TCP port ever found open on a device (current-state table for ports).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE device_ports (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id      uuid        NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  -- TCP only: the safety model allows TCP connect checks, nothing else.
  protocol       text        NOT NULL DEFAULT 'tcp' CHECK (protocol IN ('tcp')),
  port           integer     NOT NULL CHECK (port BETWEEN 1 AND 65535),
  service_name   text        CHECK (char_length(service_name) BETWEEN 1 AND 100),
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_ports_device_protocol_port_key UNIQUE (device_id, protocol, port),
  CONSTRAINT device_ports_seen_order CHECK (last_seen_at >= first_seen_at)
);

COMMENT ON TABLE device_ports IS 'Ports ever found open on a device; first/last time seen open.';

-- ---------------------------------------------------------------------------------------------
-- port_scan_results: port scan results — the state of a known port in one port scan.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE port_scan_results (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scan_id         uuid        NOT NULL REFERENCES scans (id) ON DELETE CASCADE,
  device_port_id  uuid        NOT NULL REFERENCES device_ports (id) ON DELETE CASCADE,
  state           text        NOT NULL CHECK (state IN ('open', 'closed', 'filtered')),
  observed_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT port_scan_results_scan_port_key UNIQUE (scan_id, device_port_id)
);

CREATE INDEX port_scan_results_port_observed_idx ON port_scan_results (device_port_id, observed_at DESC);

COMMENT ON TABLE port_scan_results IS 'Port scan results: state of a known device port in one scan.';

-- ---------------------------------------------------------------------------------------------
-- alerts: notable changes (new device, device offline, new open port, ...).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE alerts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id       uuid        NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
  -- SET NULL keeps the alert history if a device or scan is deleted; context keeps a snapshot.
  device_id        uuid        REFERENCES devices (id) ON DELETE SET NULL,
  scan_id          uuid        REFERENCES scans (id) ON DELETE SET NULL,
  type             text        NOT NULL
                               CHECK (type IN ('new_device', 'device_offline', 'device_online', 'ip_changed', 'new_open_port')),
  severity         text        NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  message          text        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  context          jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(context) = 'object'),
  acknowledged_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alerts_ack_after_create CHECK (acknowledged_at IS NULL OR acknowledged_at >= created_at)
);

CREATE INDEX alerts_network_created_idx ON alerts (network_id, created_at DESC);
CREATE INDEX alerts_open_idx   ON alerts (network_id, created_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX alerts_device_idx ON alerts (device_id, created_at DESC) WHERE device_id IS NOT NULL;
CREATE INDEX alerts_scan_idx   ON alerts (scan_id) WHERE scan_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- updated_at triggers for every mutable table
-- ---------------------------------------------------------------------------------------------
CREATE TRIGGER networks_set_updated_at     BEFORE UPDATE ON networks     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER devices_set_updated_at      BEFORE UPDATE ON devices      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER scans_set_updated_at        BEFORE UPDATE ON scans        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER device_ports_set_updated_at BEFORE UPDATE ON device_ports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER alerts_set_updated_at       BEFORE UPDATE ON alerts       FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE alerts;
DROP TABLE port_scan_results;
DROP TABLE device_ports;
DROP TABLE device_observations;
DROP TABLE scans;
DROP TABLE devices;
DROP TABLE device_types;
DROP TABLE networks;
DROP FUNCTION set_updated_at();
