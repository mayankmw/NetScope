/**
 * Collects alerts that arrive close together (one discovery raises them in a burst) and hands
 * them over as one batch, so a burst becomes one notification instead of one per alert.
 *
 * @param {(alerts: object[]) => void} announce
 * @param {{ windowMs?: number }} [options]
 */
export function createAlertAnnouncer(announce, { windowMs = 600 } = {}) {
  let batch = [];
  let timer = null;

  return {
    /** @param {object} alert */
    add(alert) {
      batch.push(alert);
      timer ??= setTimeout(() => {
        const alerts = batch;
        batch = [];
        timer = null;
        announce(alerts);
      }, windowMs);
    },
    /** Drops anything pending (unmount). */
    cancel() {
      clearTimeout(timer);
      timer = null;
      batch = [];
    },
  };
}
