import { EventTypes } from '@netscope/shared/events';
import { config } from '../config/index.js';
import * as alertsRepository from '../db/repositories/alerts.repository.js';
import { db } from '../db/pool.js';
import { AppError } from '../errors/AppError.js';
import { ErrorCodes } from '../errors/errorCodes.js';
import { eventBus } from '../events/eventBus.js';
import { toAlertDto } from './dto.js';

/** API status filter → stored states. "open" is everything not resolved. */
const STATUS_FILTERS = {
  open: ['unread', 'read'],
  unread: ['unread'],
  read: ['read'],
  resolved: ['resolved'],
};

function alertNotFound(alertId) {
  return new AppError('Alert not found.', {
    statusCode: 404,
    code: ErrorCodes.NOT_FOUND,
    details: { alertId },
  });
}

/** The rules' settings, so clients can explain them. */
export function getAlertPolicy() {
  return { returnAfterMs: config.alerts.returnAfterMs, cooldownMs: config.alerts.cooldownMs };
}

/**
 * Records the alerts a discovery raised, inside its transaction (`client`), so a device and its
 * alert are committed together: a new device can never lose its alert. Returns what to announce
 * once the transaction commits (publishRecordedAlerts).
 *
 * @param {import('../db/repositories/networks.repository.js').Executor} client
 * @param {import('./alertRules.js').AlertCandidate[]} candidates
 */
export async function recordAlerts(client, candidates) {
  const created = [];
  const merged = [];
  let suppressed = 0;
  for (const candidate of candidates) {
    const { id, outcome } = await alertsRepository.recordAlert(client, candidate, {
      cooldownMs: config.alerts.cooldownMs,
    });
    if (outcome === 'created') created.push(id);
    else if (outcome === 'merged') merged.push(id);
    else suppressed += 1;
  }

  if (created.length + merged.length === 0) {
    return { created: [], updated: [], suppressed, counts: null };
  }
  const [rows, counts] = await Promise.all([
    alertsRepository.findAlertsByIds(client, [...created, ...merged]),
    alertsRepository.countAlertsByStatus(client),
  ]);
  const byId = new Map(rows.map((row) => [row.id, toAlertDto(row)]));
  return {
    created: created.map((id) => byId.get(id)),
    updated: merged.map((id) => byId.get(id)),
    suppressed,
    counts,
  };
}

/**
 * Announces alerts recorded by recordAlerts. A repeat merged into an open alert is an update,
 * not a new notification.
 * @param {Awaited<ReturnType<typeof recordAlerts>>} recorded
 */
export function publishRecordedAlerts({ created, updated, counts }) {
  for (const alert of created) eventBus.publish(EventTypes.ALERT_CREATED, { alert, counts });
  for (const alert of updated) {
    eventBus.publish(EventTypes.ALERT_UPDATED, { alert, counts, reason: 'repeated' });
  }
}

/** Counts by state, and the rules' settings. */
export async function getAlertSummary() {
  return { counts: await alertsRepository.countAlertsByStatus(db), policy: getAlertPolicy() };
}

/**
 * One page of alerts, newest first.
 * @param {{ status?: 'open' | 'unread' | 'read' | 'resolved', type?: string, deviceId?: string,
 *           before?: string, limit: number }} filters
 */
export async function listAlerts({ status, type, deviceId, before, limit }) {
  const rows = await alertsRepository.listAlerts(db, {
    statuses: status ? STATUS_FILTERS[status] : null,
    type,
    deviceId,
    before,
    limit: limit + 1,
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map(toAlertDto),
    nextCursor: rows.length > limit ? page.at(-1).id : null,
  };
}

/** @param {string} alertId */
export async function getAlert(alertId) {
  const row = await alertsRepository.findAlertById(db, alertId);
  if (!row) throw alertNotFound(alertId);
  return toAlertDto(row);
}

/**
 * Marks one alert unread, read, or resolved (reopening a resolved alert is allowed).
 * @param {string} alertId
 * @param {{ status: 'unread' | 'read' | 'resolved' }} change
 */
export async function updateAlertStatus(alertId, { status }) {
  if (!(await alertsRepository.alertExists(db, alertId))) throw alertNotFound(alertId);

  let changed;
  try {
    changed = await alertsRepository.setAlertStatus(db, { ids: [alertId], status });
  } catch (error) {
    // Reopening while a newer alert for the same device and change is open.
    if (error.code === ErrorCodes.CONFLICT) {
      throw new AppError(
        'A newer open alert exists for the same device and change. Resolve it first.',
        { statusCode: 409, code: ErrorCodes.CONFLICT, details: { alertId }, cause: error },
      );
    }
    throw error;
  }

  const [row, counts] = await Promise.all([
    alertsRepository.findAlertById(db, alertId),
    alertsRepository.countAlertsByStatus(db),
  ]);
  const alert = toAlertDto(row);
  if (changed.length > 0) {
    eventBus.publish(EventTypes.ALERT_UPDATED, { alert, counts, reason: 'status' });
  }
  return alert;
}

async function changeAll({ from, status }) {
  const ids = await alertsRepository.setAlertStatus(db, { from, status });
  const counts = await alertsRepository.countAlertsByStatus(db);
  if (ids.length > 0) eventBus.publish(EventTypes.ALERTS_UPDATED, { ids, status, counts });
  return { updated: ids.length, counts };
}

/** Marks every unread alert as read. */
export function markAllRead() {
  return changeAll({ from: ['unread'], status: 'read' });
}

/** Resolves every open (unread or read) alert. */
export function resolveAll() {
  return changeAll({ from: ['unread', 'read'], status: 'resolved' });
}
