import { config } from '../config/index.js';
import * as devicesRepository from '../db/repositories/devices.repository.js';
import * as networksRepository from '../db/repositories/networks.repository.js';
import * as scansRepository from '../db/repositories/scans.repository.js';
import { db, withTransaction } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';
import * as network from '../network/index.js';
import { logger } from '../utils/logger.js';
import { toDeviceDto } from './dto.js';

const { NetworkError, NetworkErrorCodes } = network;

const NMAP_MAX_TIMEOUT_MS = 30_000;
const DNS_TIMEOUT_MS = 1_000;
const DNS_CONCURRENCY = 16;

/** The discovery currently running in this process, if any. */
let activeDiscovery = null;

class DiscoveryCancelled extends Error {}

/** Maps network-layer failures to API errors. The messages are written to be client-safe. */
function toAppError(error) {
  if (!(error instanceof NetworkError)) return null;
  const map = {
    [NetworkErrorCodes.PLATFORM_NOT_SUPPORTED]: [501, ErrorCodes.PLATFORM_NOT_SUPPORTED],
    [NetworkErrorCodes.TOOL_UNAVAILABLE]: [503, ErrorCodes.TOOL_UNAVAILABLE],
    [NetworkErrorCodes.NO_DEFAULT_GATEWAY]: [503, ErrorCodes.NETWORK_UNAVAILABLE],
    [NetworkErrorCodes.NO_USABLE_INTERFACE]: [503, ErrorCodes.NETWORK_UNAVAILABLE],
    [NetworkErrorCodes.GATEWAY_UNRESOLVED]: [503, ErrorCodes.NETWORK_UNAVAILABLE],
    [NetworkErrorCodes.TARGET_NOT_ALLOWED]: [422, ErrorCodes.TARGET_NOT_ALLOWED],
  };
  const [statusCode, code] = map[error.code] ?? [503, ErrorCodes.DISCOVERY_FAILED];
  return new AppError(error.message, { statusCode, code, cause: error });
}

function scanInProgress() {
  return new AppError('A scan is already running. Try again when it finishes.', {
    statusCode: 409,
    code: ErrorCodes.SCAN_IN_PROGRESS,
  });
}

/**
 * Runs one probe and reports how it went, without letting an optional probe's failure end
 * the discovery. Cancellation always propagates.
 */
async function runSource(name, log, signal, probe) {
  const startedAt = performance.now();
  try {
    const value = await probe();
    const report = { status: 'ok', durationMs: Math.round(performance.now() - startedAt) };
    return { value, report };
  } catch (error) {
    if (signal.aborted) throw error;
    const status = error.code === NetworkErrorCodes.TOOL_UNAVAILABLE ? 'unavailable' : 'failed';
    const report = {
      status,
      durationMs: Math.round(performance.now() - startedAt),
      error: error.message,
    };
    log.warn({ source: name, status, err: error }, `Discovery source "${name}" ${status}`);
    return { value: null, report };
  }
}

/** The stored device plus what this particular scan observed. */
function toDeviceResponse(row, device) {
  return {
    ...toDeviceDto(row),
    latencyMs: device.latencyMs,
    isGateway: device.isGateway,
    isSelf: device.isSelf,
    isNew: row.is_new,
    previousIpAddress:
      row.is_new || row.previous_ip_address === row.ip_address ? null : row.previous_ip_address,
    sources: device.sources,
  };
}

/**
 * Discovers the devices currently visible on the local network and records them.
 *
 * Flow: detect network → record scan → ping sweep → nmap (optional) → ARP cache → merge by MAC
 *       → vendor + hostname + type → persist (one transaction) → response.
 *
 * Takes no caller-supplied targets: the range is always the local subnet, from the OS.
 *
 * @param {{ triggeredBy?: 'manual' | 'schedule', requestId?: string }} [options]
 */
export async function discoverDevices({ triggeredBy = 'manual', requestId } = {}) {
  if (activeDiscovery) throw scanInProgress();

  const controller = new AbortController();
  activeDiscovery = { controller };
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(config.scan.timeoutMs)]);
  const startedAt = performance.now();
  const deadline = Date.now() + config.scan.timeoutMs;
  let log = logger.child({ component: 'discovery', requestId });
  let scan = null;

  try {
    const platform = network.getPlatform();
    const detected = await network.detectNetwork({
      platform,
      interfaceName: config.scan.interfaceName ?? undefined,
      signal,
    });
    log.info(
      {
        interfaceName: detected.interfaceName,
        localIp: detected.localIp,
        cidr: detected.cidr,
        sweepCidr: detected.sweepCidr,
        gatewayIp: detected.gatewayIp,
      },
      'Discovery: network detected',
    );
    if (detected.sweepClamped) {
      log.warn(
        { cidr: detected.cidr, sweepCidr: detected.sweepCidr },
        'Subnet too large; sweeping the local /24 only',
      );
    }

    const networkRow = await networksRepository.upsertNetwork(db, detected);
    const params = {
      sweepCidr: detected.sweepCidr,
      interfaceName: detected.interfaceName,
      pingTimeoutMs: config.scan.pingTimeoutMs,
      pingConcurrency: config.scan.pingConcurrency,
      nmap: config.scan.nmap.mode,
    };
    try {
      scan = await scansRepository.createRunningDiscoveryScan(db, {
        networkId: networkRow.id,
        target: detected.sweepCidr,
        triggeredBy,
        params,
      });
    } catch (error) {
      if (error.cause?.constraint === scansRepository.SINGLE_ACTIVE_SCAN_CONSTRAINT) {
        throw scanInProgress();
      }
      throw error;
    }
    activeDiscovery.scanId = scan.id;
    log = log.child({ scanId: scan.id });
    log.info({ triggeredBy }, 'Discovery: scan started');

    // 1. Ping sweep: finds responsive hosts and fills the ARP cache.
    const ping = await runSource('ping', log, signal, () =>
      network.pingSweep({
        platform,
        cidr: detected.sweepCidr,
        subnet: detected.cidr,
        exclude: [detected.localIp],
        timeoutMs: config.scan.pingTimeoutMs,
        concurrency: config.scan.pingConcurrency,
        signal,
      }),
    );
    if (ping.value) {
      Object.assign(ping.report, {
        probed: ping.value.probed,
        responded: ping.value.responders.length,
      });
    }
    log.info({ source: 'ping', ...ping.report }, 'Discovery: source finished');

    // 2. nmap host discovery: optional augmentation (TCP probes find some hosts that drop ICMP).
    let nmap = { value: null, report: { status: 'skipped', reason: 'NMAP_DISCOVERY=off' } };
    if (config.scan.nmap.mode === 'auto') {
      if (await network.isToolAvailable('nmap')) {
        const timeoutMs = Math.max(
          1_000,
          Math.min(NMAP_MAX_TIMEOUT_MS, deadline - Date.now() - 5_000),
        );
        nmap = await runSource('nmap', log, signal, () =>
          network.nmapHostDiscovery({ cidr: detected.sweepCidr, timeoutMs, signal }),
        );
        if (nmap.value) nmap.report.responded = nmap.value.length;
      } else {
        nmap = { value: null, report: { status: 'unavailable', reason: 'nmap is not installed' } };
      }
    }
    log.info({ source: 'nmap', ...nmap.report }, 'Discovery: source finished');

    // 3. ARP cache: the source of MAC addresses. Without it nothing can be identified.
    const arpStartedAt = performance.now();
    const arpEntries = await platform.readArpTable({ signal });
    const arp = {
      status: 'ok',
      durationMs: Math.round(performance.now() - arpStartedAt),
      entries: arpEntries.length,
    };
    log.info({ source: 'arp', ...arp }, 'Discovery: source finished');

    // 4. Merge into one record per MAC, then enrich.
    const merged = network.mergeObservations({
      network: detected,
      arpEntries,
      pingResponders: ping.value?.responders ?? [],
      nmapHosts: nmap.value ?? [],
    });
    if (merged.duplicateMacs.length > 0) {
      log.warn(
        { duplicateMacs: merged.duplicateMacs },
        'One MAC answered on several IPs; kept one device each',
      );
    }

    const dnsStartedAt = performance.now();
    const hostnames = await network.lookupHostnames(
      merged.hosts.map((host) => host.ipAddress),
      { timeoutMs: DNS_TIMEOUT_MS, concurrency: DNS_CONCURRENCY, signal },
    );
    const dns = {
      status: 'ok',
      durationMs: Math.round(performance.now() - dnsStartedAt),
      resolved: hostnames.size,
    };

    const devices = merged.hosts.map((host) =>
      network.toDiscoveredDevice(host, {
        hostname: hostnames.get(host.ipAddress) ?? null,
        vendor: network.lookupVendor(host.macAddress),
      }),
    );

    // 5. Persist everything atomically: devices, observations, offline marks, scan completion.
    signal.throwIfAborted();
    const persisted = await withTransaction(async (client) => {
      const saved = [];
      for (const device of devices) {
        const row = await devicesRepository.upsertDiscoveredDevice(client, networkRow.id, device);
        await devicesRepository.insertObservation(client, {
          scanId: scan.id,
          deviceId: row.id,
          ipAddress: device.ipAddress,
          hostname: device.hostname,
          latencyMs: device.latencyMs,
        });
        saved.push(toDeviceResponse(row, device));
      }
      const wentOffline = await devicesRepository.markUnseenDevicesOffline(client, {
        networkId: networkRow.id,
        sweptRange: detected.sweepCidr,
        seenDeviceIds: saved.map((device) => device.id),
      });
      const completed = await scansRepository.completeScan(client, scan.id);
      return { saved, wentOffline, completed };
    });

    const { saved, wentOffline, completed } = persisted;
    for (const device of saved) {
      if (device.isNew) {
        log.info(
          { ipAddress: device.ipAddress, macAddress: device.macAddress, vendor: device.vendor },
          'New device',
        );
      } else if (device.previousIpAddress) {
        log.info(
          { macAddress: device.macAddress, from: device.previousIpAddress, to: device.ipAddress },
          'Device changed IP address',
        );
      }
    }

    const summary = {
      devicesFound: saved.length,
      newDevices: saved.filter((device) => device.isNew).length,
      ipChanges: saved.filter((device) => device.previousIpAddress).length,
      wentOffline: wentOffline.length,
      unresolvedHosts: merged.unresolvedHosts.length,
    };
    const durationMs = Math.round(performance.now() - startedAt);
    log.info({ durationMs, ...summary }, 'Discovery: completed');

    return {
      scan: {
        id: scan.id,
        status: completed.status,
        triggeredBy,
        startedAt: completed.started_at,
        finishedAt: completed.finished_at,
        durationMs,
      },
      network: {
        id: networkRow.id,
        cidr: networkRow.cidr,
        sweptRange: detected.sweepCidr,
        interfaceName: detected.interfaceName,
        localIpAddress: detected.localIp,
        gatewayIpAddress: detected.gatewayIp,
        gatewayMacAddress: detected.gatewayMac,
      },
      summary,
      sources: { ping: ping.report, nmap: nmap.report, arp, dns },
      devices: saved,
      unresolvedHosts: merged.unresolvedHosts,
    };
  } catch (error) {
    throw await handleFailure({ error, signal, controller, scan, log });
  } finally {
    activeDiscovery = null;
  }
}

/** Records the failure on the scan (if one was created) and returns the error to throw. */
async function handleFailure({ error, signal, controller, scan, log }) {
  let appError;
  const cancelled =
    controller.signal.aborted && controller.signal.reason instanceof DiscoveryCancelled;

  if (cancelled) {
    appError = new AppError('The scan was cancelled because the server is shutting down.', {
      statusCode: 503,
      code: ErrorCodes.SCAN_CANCELLED,
      cause: error,
    });
  } else if (signal.aborted) {
    appError = new AppError(`The scan did not finish within ${config.scan.timeoutMs} ms.`, {
      statusCode: 503,
      code: ErrorCodes.SCAN_TIMEOUT,
      cause: error,
    });
  } else {
    appError = error instanceof AppError ? error : toAppError(error);
  }

  if (scan) {
    try {
      if (cancelled) {
        await scansRepository.cancelScan(db, scan.id);
      } else {
        const code = appError?.code ?? ErrorCodes.INTERNAL_ERROR;
        const message = appError?.message ?? 'Unexpected error during discovery.';
        await scansRepository.failScan(db, scan.id, { code, message });
      }
    } catch (recordError) {
      log.error({ err: recordError }, 'Could not record the scan failure');
    }
  }

  const level = appError && appError.statusCode < 500 ? 'warn' : 'error';
  log[level](
    { err: error, code: appError?.code ?? ErrorCodes.INTERNAL_ERROR },
    'Discovery: failed',
  );
  return appError ?? error;
}

/** Cancels the running discovery, if any (graceful shutdown). */
export function cancelActiveDiscovery() {
  activeDiscovery?.controller.abort(new DiscoveryCancelled('Server shutting down'));
}

/** Closes scans a previous process left running (see scansRepository.failInterruptedScans). */
export async function recoverInterruptedScans() {
  return scansRepository.failInterruptedScans(db);
}
