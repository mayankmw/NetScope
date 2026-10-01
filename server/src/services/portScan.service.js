import { EventTypes } from '@netscope/shared/events';
import { config } from '../config/index.js';
import * as devicesRepository from '../db/repositories/devices.repository.js';
import * as networksRepository from '../db/repositories/networks.repository.js';
import * as portsRepository from '../db/repositories/ports.repository.js';
import * as scansRepository from '../db/repositories/scans.repository.js';
import { db, withTransaction } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';
import { eventBus } from '../events/eventBus.js';
import * as network from '../network/index.js';
import { logger } from '../utils/logger.js';
import { toPortDto, toPortScanDto } from './dto.js';
import { networkErrorToAppError } from './networkErrors.js';

const { NetworkErrorCodes, PORT_SCAN_PROFILE } = network;

// Headroom on top of nmap's own limit for the ARP check and saving the results.
const RUN_GRACE_MS = 10_000;

/**
 * The port scan running in this process, if any. Set synchronously when a request starts
 * validating, so a second request is refused at once; the database's single-active-scan index
 * is the authority across scan types (a discovery and a port scan never run together).
 */
let activePortScan = null;

class PortScanCancelled extends Error {}

function scanInProgress() {
  return new AppError('A scan is already running. Try again when it finishes.', {
    statusCode: 409,
    code: ErrorCodes.SCAN_IN_PROGRESS,
  });
}

/** What every port scan checks, for clients. Nothing here can be chosen by a request. */
export function getPortScanProfile() {
  return {
    name: PORT_SCAN_PROFILE.name,
    protocol: PORT_SCAN_PROFILE.protocol,
    ports: PORT_SCAN_PROFILE.ports,
    serviceDetection: config.portScan.serviceDetection,
    timeoutMs: config.portScan.timeoutMs,
    enabled: config.portScan.enabled,
  };
}

/**
 * Refuses to scan an address that the ARP cache now maps to a different MAC: DHCP may have given
 * the device's last known IP to another machine. No entry (not resolved yet, or this computer's
 * own address) is not proof of a change.
 */
async function assertAddressBelongsToDevice({ platform, device, interfaceName, signal }) {
  const entries = await platform.readArpTable({ signal });
  const entry = entries.find(
    (candidate) =>
      candidate.ipAddress === device.ip_address && candidate.interfaceName === interfaceName,
  );
  if (entry && entry.macAddress !== device.mac_address) {
    throw new AppError(
      `${device.ip_address} now belongs to another device. Run a discovery to update the ` +
        'inventory, then scan again.',
      {
        statusCode: 409,
        code: ErrorCodes.TARGET_CHANGED,
        details: {
          ipAddress: device.ip_address,
          expectedMacAddress: device.mac_address,
          currentMacAddress: entry.macAddress,
        },
      },
    );
  }
}

/**
 * Validates and starts a port scan of one known device, and returns as soon as it is running.
 * The scan finishes in the background: portscan.completed / portscan.failed events announce the
 * outcome, and GET /api/devices/:id/ports returns it.
 *
 * The target is never taken from the request: it is the device's address from the database, and
 * it must be on the network this computer is on right now, inside its private subnet, and still
 * answer for the device's MAC address.
 *
 * @param {string} deviceId
 * @param {{ triggeredBy?: 'manual' | 'schedule', requestId?: string }} [options]
 */
export async function startPortScan(deviceId, { triggeredBy = 'manual', requestId } = {}) {
  if (!config.portScan.enabled) {
    throw new AppError('Port scanning is turned off on this server (PORT_SCAN_ENABLED=false).', {
      statusCode: 403,
      code: ErrorCodes.PORT_SCAN_DISABLED,
    });
  }
  if (activePortScan) throw scanInProgress();

  const slot = { controller: new AbortController(), scanId: null, done: Promise.resolve() };
  activePortScan = slot;
  let log = logger.child({ component: 'portscan', requestId, deviceId });

  try {
    const device = await devicesRepository.findDeviceById(db, deviceId);
    if (!device) {
      throw new AppError('Device not found.', {
        statusCode: 404,
        code: ErrorCodes.NOT_FOUND,
        details: { deviceId },
      });
    }
    if (!(await network.isToolAvailable('nmap'))) {
      throw new AppError(
        'Port scanning needs nmap, which is not installed on the NetScope server. Install it ' +
          '(macOS: brew install nmap; Debian/Ubuntu: sudo apt install nmap) or set NMAP_PATH.',
        { statusCode: 503, code: ErrorCodes.TOOL_UNAVAILABLE, details: { tool: 'nmap' } },
      );
    }

    // The device must be on the network this computer is attached to now.
    const platform = network.getPlatform();
    const { signal } = slot.controller;
    const detected = await network.detectNetwork({
      platform,
      interfaceName: config.scan.interfaceName ?? undefined,
      signal,
    });
    const current = await networksRepository.findNetworkByIdentity(db, detected);
    if (current?.id !== device.network_id) {
      throw new AppError(
        'This device belongs to a network this computer is not connected to. NetScope only ' +
          'scans devices on the network it is on.',
        {
          statusCode: 422,
          code: ErrorCodes.TARGET_NOT_ALLOWED,
          details: { deviceNetworkId: device.network_id, currentNetworkId: current?.id ?? null },
        },
      );
    }
    network.assertLocalTarget(device.ip_address, detected.cidr);
    await assertAddressBelongsToDevice({
      platform,
      device,
      interfaceName: detected.interfaceName,
      signal,
    });

    const settings = {
      ipAddress: device.ip_address,
      ports: PORT_SCAN_PROFILE.ports,
      serviceDetection: config.portScan.serviceDetection,
      timeoutMs: config.portScan.timeoutMs,
    };
    let scan;
    try {
      scan = await scansRepository.createRunningPortScan(db, {
        networkId: device.network_id,
        deviceId,
        target: device.ip_address,
        triggeredBy,
        params: {
          profile: PORT_SCAN_PROFILE.name,
          serviceDetection: settings.serviceDetection,
          timeoutMs: settings.timeoutMs,
          // The exact command line, for auditing.
          nmapArgs: network.portScanArgs(settings),
        },
      });
    } catch (error) {
      if (error.cause?.constraint === scansRepository.SINGLE_ACTIVE_SCAN_CONSTRAINT) {
        throw scanInProgress();
      }
      throw error;
    }

    Object.assign(slot, {
      scanId: scan.id,
      deviceId,
      networkId: device.network_id,
      startedAt: scan.started_at,
    });
    log = log.child({ scanId: scan.id });
    log.info(
      { ipAddress: device.ip_address, ports: settings.ports.length, triggeredBy },
      'Port scan: started',
    );
    eventBus.publish(EventTypes.PORT_SCAN_STARTED, {
      scanId: scan.id,
      deviceId,
      networkId: device.network_id,
      ipAddress: device.ip_address,
      startedAt: scan.started_at,
      triggeredBy,
    });

    slot.done = runPortScan({ slot, scan, device, detected, platform, settings, log });
    return toPortScanDto(scan);
  } catch (error) {
    if (activePortScan === slot && !slot.scanId) activePortScan = null;
    if (error instanceof AppError) throw error;
    throw networkErrorToAppError(error, ErrorCodes.PORT_SCAN_FAILED) ?? error;
  }
}

/** Runs nmap, checks the target, and saves the results. Never rejects. */
async function runPortScan({ slot, scan, device, detected, platform, settings, log }) {
  const startedAt = performance.now();
  const timeout = AbortSignal.timeout(settings.timeoutMs + RUN_GRACE_MS);
  const signal = AbortSignal.any([slot.controller.signal, timeout]);
  let outcome;

  try {
    const result = await network.nmapPortScan({ ...settings, subnet: detected.cidr, signal });
    if (result.timedOut) throw timeoutError(settings.timeoutMs);
    // The connections refreshed the ARP cache: confirm the right device answered.
    await assertAddressBelongsToDevice({
      platform,
      device,
      interfaceName: detected.interfaceName,
      signal,
    });

    const { completed, summary } = await withTransaction((client) =>
      saveResults(client, { scan, device, result }),
    );
    const durationMs = Math.round(performance.now() - startedAt);
    log.info({ durationMs, ...summary }, 'Port scan: completed');
    outcome = {
      type: EventTypes.PORT_SCAN_COMPLETED,
      data: { finishedAt: completed.finished_at, durationMs, summary },
    };
  } catch (error) {
    const failure = await recordFailure({ error, slot, scan, timeout, settings, log });
    outcome = { type: EventTypes.PORT_SCAN_FAILED, data: { error: failure } };
  } finally {
    // Free the slot before announcing the outcome, so a client reacting to it can start another.
    if (activePortScan === slot) activePortScan = null;
  }

  eventBus.publish(outcome.type, {
    scanId: scan.id,
    deviceId: device.id,
    networkId: device.network_id,
    ...outcome.data,
  });
}

/**
 * Records one scan: every open port (created the first time it is seen open), and the current
 * state of ports seen open before. Returns the completed scan and its summary.
 */
async function saveResults(client, { scan, device, result }) {
  const { lastCompleted } = await scansRepository.findDevicePortScans(client, device.id);
  const known = new Map(
    (await portsRepository.listDevicePorts(client, device.id)).map((row) => [row.port, row]),
  );
  const results = [];
  const newlyOpen = [];

  for (const port of result.ports.filter((entry) => entry.state === 'open')) {
    const row = await portsRepository.upsertOpenPort(client, { deviceId: device.id, ...port });
    if (row.inserted) newlyOpen.push(port.port);
    known.delete(port.port);
    results.push({
      devicePortId: row.id,
      state: 'open',
      service: port.service,
      product: port.product,
      version: port.version,
    });
  }

  // Ports open before but not now. "No longer open" means open in the previous scan.
  const noLongerOpen = [];
  for (const row of known.values()) {
    const scanned = result.ports.find((entry) => entry.port === row.port);
    if (!scanned?.state) continue; // not checked by this scan
    results.push({
      devicePortId: row.id,
      state: scanned.state,
      service: null,
      product: null,
      version: null,
    });
    if (lastCompleted && new Date(row.last_seen_at) >= new Date(lastCompleted.finished_at)) {
      noLongerOpen.push(row.port);
    }
  }
  await portsRepository.insertPortResults(client, { scanId: scan.id, results });

  const summary = {
    portsChecked: result.ports.length,
    ...result.counts,
    openPorts: result.ports.filter((entry) => entry.state === 'open').map((entry) => entry.port),
    newlyOpen,
    noLongerOpen,
  };
  const completed = await scansRepository.completeScan(client, scan.id, { summary });
  return { completed, summary };
}

function timeoutError(timeoutMs) {
  return new AppError(`The scan did not finish within ${Math.round(timeoutMs / 1000)} s.`, {
    statusCode: 503,
    code: ErrorCodes.SCAN_TIMEOUT,
  });
}

/** Records the failure on the scan row and returns the client-safe `{ code, message }`. */
async function recordFailure({ error, slot, scan, timeout, settings, log }) {
  const cancelled =
    slot.controller.signal.aborted && slot.controller.signal.reason instanceof PortScanCancelled;
  let appError;
  if (cancelled) {
    appError = new AppError('The scan was cancelled because the server is shutting down.', {
      statusCode: 503,
      code: ErrorCodes.SCAN_CANCELLED,
    });
  } else if (timeout.aborted || error?.code === NetworkErrorCodes.COMMAND_TIMEOUT) {
    appError = timeoutError(settings.timeoutMs);
  } else if (error instanceof AppError) {
    appError = error;
  } else {
    appError =
      networkErrorToAppError(error, ErrorCodes.PORT_SCAN_FAILED) ??
      new AppError('Unexpected error during the port scan.', {
        code: ErrorCodes.INTERNAL_ERROR,
      });
  }
  const failure = { code: appError.code, message: appError.message };

  try {
    if (cancelled) await scansRepository.cancelScan(db, scan.id);
    else await scansRepository.failScan(db, scan.id, failure);
  } catch (recordError) {
    log.error({ err: recordError }, 'Could not record the port scan failure');
  }
  const level = appError.statusCode >= 500 && !cancelled ? 'error' : 'warn';
  log[level]({ err: error, code: failure.code }, 'Port scan: failed');
  return failure;
}

/**
 * A device's ports as of its latest completed scan, plus the status of its most recent scan
 * (which may be running, or may have failed after an earlier success).
 *
 * @param {string} deviceId
 */
export async function getDevicePorts(deviceId) {
  if (!(await devicesRepository.deviceExists(db, deviceId))) {
    throw new AppError('Device not found.', {
      statusCode: 404,
      code: ErrorCodes.NOT_FOUND,
      details: { deviceId },
    });
  }
  const { latest, lastCompleted } = await scansRepository.findDevicePortScans(db, deviceId);
  const rows = lastCompleted ? await portsRepository.listPortResults(db, lastCompleted.id) : [];

  return {
    profile: getPortScanProfile(),
    scan: latest ? toPortScanDto(latest) : null,
    results: lastCompleted
      ? {
          scanId: lastCompleted.id,
          startedAt: lastCompleted.started_at,
          finishedAt: lastCompleted.finished_at,
          summary: lastCompleted.summary,
          ports: rows.map((row) => toPortDto(row, lastCompleted)),
        }
      : null,
  };
}

/**
 * The port scan running right now, if it has been announced (`portscan.started`).
 * @returns {{ scanId: string, deviceId: string, networkId: string, startedAt: Date } | null}
 */
export function getActivePortScan() {
  if (!activePortScan?.scanId) return null;
  const { scanId, deviceId, networkId, startedAt } = activePortScan;
  return { scanId, deviceId, networkId, startedAt };
}

/**
 * Cancels the running port scan, if any (graceful shutdown). Resolves once its outcome has been
 * recorded.
 */
export function cancelActivePortScan() {
  if (!activePortScan) return Promise.resolve();
  activePortScan.controller.abort(new PortScanCancelled('Server shutting down'));
  return activePortScan.done;
}
