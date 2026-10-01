import { beforeEach, describe, expect, it, vi } from 'vitest';

// Replace process spawning and tool lookup: these tests check how results and failures are
// mapped, not the real tools.
const execFile = vi.fn();
vi.mock('node:child_process', () => ({ execFile: (...args) => execFile(...args) }));
vi.mock('../../../src/network/exec/tools.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveTool: vi.fn(async (tool) => `/usr/bin/${tool}`),
}));

const { runCommand } = await import('../../../src/network/exec/runCommand.js');
const { NetworkErrorCodes } = await import('../../../src/network/errors.js');

function respond(error, stdout = '', stderr = '') {
  execFile.mockImplementation((file, args, options, callback) => callback(error, stdout, stderr));
}

beforeEach(() => {
  execFile.mockReset();
});

describe('runCommand', () => {
  it('runs the resolved binary with an argument array, no shell, and a fixed environment', async () => {
    respond(null, 'ok');

    await expect(runCommand('arp', ['-an'], { timeoutMs: 1000 })).resolves.toMatchObject({
      stdout: 'ok',
      exitCode: 0,
    });

    const [file, args, options] = execFile.mock.calls[0];
    expect(file).toBe('/usr/bin/arp');
    expect(args).toEqual(['-an']);
    expect(options).toMatchObject({ timeout: 1000, killSignal: 'SIGKILL' });
    expect(options.shell).toBeUndefined();
    expect(options.env).toEqual({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LC_ALL: 'C', LANG: 'C' });
  });

  it('resolves non-zero exits so the caller can interpret them', async () => {
    respond(Object.assign(new Error('exit 2'), { code: 2 }), 'no reply');

    await expect(
      runCommand('ping', ['-c', '1', '192.168.1.9'], { timeoutMs: 1000 }),
    ).resolves.toMatchObject({
      exitCode: 2,
      stdout: 'no reply',
    });
  });

  it.each([
    [{ killed: true, signal: 'SIGKILL' }, NetworkErrorCodes.COMMAND_TIMEOUT],
    [{ name: 'AbortError', code: 'ABORT_ERR' }, NetworkErrorCodes.COMMAND_ABORTED],
    [{ code: 'ENOENT' }, NetworkErrorCodes.TOOL_UNAVAILABLE],
    [{ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }, NetworkErrorCodes.OUTPUT_TOO_LARGE],
    [{ code: 'EPERM' }, NetworkErrorCodes.COMMAND_FAILED],
  ])('maps %o to %s', async (errorFields, code) => {
    respond(Object.assign(new Error('failed'), errorFields));

    await expect(runCommand('arp', ['-an'], { timeoutMs: 1000 })).rejects.toMatchObject({
      name: 'NetworkError',
      code,
    });
  });

  it.each([
    ['a non-array', '-an'],
    ['a non-string argument', [42]],
    ['a NUL byte', ['-an\0']],
    ['an overlong argument', ['x'.repeat(600)]],
  ])('refuses %s', async (_label, args) => {
    await expect(runCommand('arp', args, { timeoutMs: 1000 })).rejects.toThrow(TypeError);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('does not start a command when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runCommand('arp', ['-an'], { timeoutMs: 1000, signal: controller.signal }),
    ).rejects.toThrow();
    expect(execFile).not.toHaveBeenCalled();
  });
});

describe('resolveTool', () => {
  it('refuses anything outside the allowlist', async () => {
    const { resolveTool } = await vi.importActual('../../../src/network/exec/tools.js');

    await expect(resolveTool('bash')).rejects.toThrow(TypeError);
    await expect(resolveTool('__proto__')).rejects.toThrow(TypeError);
  });
});
