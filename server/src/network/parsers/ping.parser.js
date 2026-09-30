/**
 * Interprets the result of a single-packet `ping -c 1 -q`.
 * Both platforms exit 0 only when a reply arrived. The summary line carries the round-trip time:
 *   macOS: round-trip min/avg/max/stddev = 1.234/1.234/1.234/0.000 ms
 *          (stddev is sometimes "nan" for a single packet)
 *   Linux: rtt min/avg/max/mdev = 0.045/0.045/0.045/0.000 ms
 * Only the average is read.
 *
 * @param {{ exitCode: number, stdout: string }} result
 * @returns {{ alive: boolean, latencyMs: number | null }}
 */
export function parsePingResult({ exitCode, stdout }) {
  if (exitCode !== 0) return { alive: false, latencyMs: null };
  const match = /(?:round-trip|rtt) min\/avg\/max\/\w+ = [\d.]+\/([\d.]+)\//.exec(stdout);
  const latencyMs = match ? Math.round(Number(match[1]) * 100) / 100 : null;
  return { alive: true, latencyMs: Number.isFinite(latencyMs) ? latencyMs : null };
}
