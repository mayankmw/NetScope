import { execFile } from 'node:child_process';
import { logger } from '../../utils/logger.js';
import { NetworkError, NetworkErrorCodes } from '../errors.js';
import { resolveTool } from './tools.js';

/**
 * The ONLY place NetScope starts child processes.
 *
 * - Allowlisted tools only, resolved to absolute paths (./tools.js).
 * - execFile with an argument array: no shell is ever involved, so nothing in an argument can
 *   be interpreted as shell syntax.
 * - Arguments are built by NetScope code from validated values; API input never reaches here.
 * - Hard timeout, output size cap, AbortSignal support, and a minimal fixed environment
 *   (C locale, so parsers see stable output).
 */

const MAX_ARGS = 32;
// Long enough for a port list ("21-23,25,53,…"); still far below anything a shell would need.
const MAX_ARG_LENGTH = 512;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

const SAFE_ENV = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  LC_ALL: 'C',
  LANG: 'C',
});

function assertSafeArgs(args) {
  const valid =
    Array.isArray(args) &&
    args.length <= MAX_ARGS &&
    args.every(
      (arg) => typeof arg === 'string' && arg.length <= MAX_ARG_LENGTH && !arg.includes('\0'),
    );
  if (!valid) throw new TypeError('Invalid command arguments');
}

/**
 * @typedef {object} CommandResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} exitCode Non-zero exits resolve normally: meaning is tool-specific
 *   (e.g. ping exits non-zero when a host does not answer).
 * @property {number} durationMs
 */

/**
 * @param {import('./tools.js').ToolName} tool
 * @param {string[]} args
 * @param {{ timeoutMs: number, signal?: AbortSignal, maxOutputBytes?: number }} options
 * @returns {Promise<CommandResult>}
 */
export async function runCommand(
  tool,
  args,
  { timeoutMs, signal, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES },
) {
  assertSafeArgs(args);
  const binary = await resolveTool(tool);
  signal?.throwIfAborted();

  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: maxOutputBytes,
        signal,
        env: SAFE_ENV,
        encoding: 'utf8',
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const durationMs = Math.round(performance.now() - startedAt);
        const exitCode = error ? (typeof error.code === 'number' ? error.code : null) : 0;
        logger.debug({ component: 'exec', tool, args, exitCode, durationMs }, 'command finished');

        if (!error) return resolve({ stdout, stderr, exitCode: 0, durationMs });
        if (typeof error.code === 'number') {
          return resolve({ stdout, stderr, exitCode: error.code, durationMs });
        }
        reject(toNetworkError(tool, error, timeoutMs));
      },
    );
  });
}

function toNetworkError(tool, error, timeoutMs) {
  const details = { tool };
  if (error.name === 'AbortError') {
    return new NetworkError(NetworkErrorCodes.COMMAND_ABORTED, `"${tool}" was cancelled.`, {
      cause: error,
      details,
    });
  }
  if (error.killed) {
    return new NetworkError(
      NetworkErrorCodes.COMMAND_TIMEOUT,
      `"${tool}" did not finish within ${timeoutMs} ms.`,
      { cause: error, details },
    );
  }
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return new NetworkError(
      NetworkErrorCodes.OUTPUT_TOO_LARGE,
      `"${tool}" produced too much output.`,
      {
        cause: error,
        details,
      },
    );
  }
  if (error.code === 'ENOENT' || error.code === 'EACCES') {
    return new NetworkError(NetworkErrorCodes.TOOL_UNAVAILABLE, `"${tool}" could not be started.`, {
      cause: error,
      details,
    });
  }
  return new NetworkError(NetworkErrorCodes.COMMAND_FAILED, `"${tool}" failed to run.`, {
    cause: error,
    details,
  });
}
