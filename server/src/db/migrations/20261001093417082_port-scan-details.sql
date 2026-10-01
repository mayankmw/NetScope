-- Up Migration

-- Port scans (Step 7) report, per open port, the service nmap identified and, when its light
-- version detection can tell, the product and version (e.g. "OpenSSH" "9.2p1").

-- Per scan: what that scan saw on each reported port.
ALTER TABLE port_scan_results
  ADD COLUMN service_name    text CHECK (char_length(service_name) BETWEEN 1 AND 100),
  ADD COLUMN service_product text CHECK (char_length(service_product) BETWEEN 1 AND 200),
  ADD COLUMN service_version text CHECK (char_length(service_version) BETWEEN 1 AND 200);

-- Current state: the latest known product and version of each port ever found open.
ALTER TABLE device_ports
  ADD COLUMN service_product text CHECK (char_length(service_product) BETWEEN 1 AND 200),
  ADD COLUMN service_version text CHECK (char_length(service_version) BETWEEN 1 AND 200);

-- Counts a finished scan reports (e.g. ports checked / open / closed / filtered), so a scan's
-- outcome can be shown without re-reading its results. Set when a port scan completes.
ALTER TABLE scans
  ADD COLUMN summary jsonb CHECK (summary IS NULL OR jsonb_typeof(summary) = 'object');

COMMENT ON COLUMN scans.summary IS 'Outcome counts of a completed scan (port scans since Step 7).';

-- Down Migration

ALTER TABLE scans DROP COLUMN summary;
ALTER TABLE device_ports DROP COLUMN service_product, DROP COLUMN service_version;
ALTER TABLE port_scan_results
  DROP COLUMN service_name, DROP COLUMN service_product, DROP COLUMN service_version;
