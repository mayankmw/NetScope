import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the OS-facing edges are scripted: network detection, the ARP cache, whether nmap is
// installed, and nmap's output. Argument building, guards, parsing, the service, SQL, and
// events are real.
const scenario = vi.hoisted(() => ({ current: null }));

vi.mock('../../src/network/exec/runCommand.js', () => ({
  runCommand: vi.fn(async (tool, args, options) => scenario.current.nmap(args, options)),
}));

vi.mock('../../src/network/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  const platform = {
    name: 'test',
    readArpTable: vi.fn(async () => scenario.current.arp()),
    getDefaultRoute: vi.fn(),
    pingArgs: vi.fn(),
  };
  return {
    ...actual,
    getPlatform: vi.fn(() => platform),
    detectNetwork: vi.fn(async () => scenario.current.detectNetwork()),
    isToolAvailable: vi.fn(async () => scenario.current.nmapInstalled),
  };
});

const { createApp } = await import('../../src/app.js');
const { closePool, query } = await import('../../src/db/pool.js');
const { eventBus } = await import('../../src/events/eventBus.js');
const { runCommand } = await import('../../src/network/exec/runCommand.js');
const { NetworkError, NetworkErrorCodes } = await import('../../src/network/errors.js');
const { formatPortList } = await import('../../src/network/portscan/nmapPortScan.js');
const { PORT_SCAN_PROFILE } = await import('../../src/network/portscan/portProfile.js');
const { cancelActivePortScan, getActivePortScan } =
  await import('../../src/services/portScan.service.js');
const { insertDevice, insertNetwork, resetDatabase } = await import('../helpers/db.js');

const app = createApp();
const GATEWAY_MAC = 'a4:83:e7:00:01:01';
const PI_MAC = 'b8:27:eb:12:34:56';
const PI_IP = '192.168.50.20';
const NETWORK = {
  interfaceName: 'en0',
  localIp: '192.168.50.37',
  localMac: 'da:a1:19:00:00:37',
  cidr: '192.168.50.0/24',
  sweepCidr: '192.168.50.0/24',
  sweepClamped: false,
  gatewayIp: '192.168.50.1',
  gatewayMac: GATEWAY_MAC,
};

const HTTP = { port: 80, name: 'http', product: 'nginx', version: '1.27.5' };
const SSH = { port: 22, name: 'ssh', product: 'OpenSSH', version: '9.2p1' };

/** nmap -oX output in the shape nmap 7.9x prints: open ports listed, the rest summarized. */
function nmapXml(open = [], { timedOut = false } = {}) {
  const others = PORT_SCAN_PROFILE.ports.filter((port) => !open.some((o) => o.port === port));
  const ports = open
    .map(
      ({ port, name, product, version }) =>
        `<port protocol="tcp" portid="${port}"><state state="open" reason="syn-ack"/>` +
        `<service name="${name}" product="${product}" version="${version}" method="probed"/></port>`,
    )
    .join('');
  return (
    `<?xml version="1.0"?><nmaprun><host${timedOut ? ' timedout="true"' : ''}>` +
    `<status state="up" reason="user-set"/><address addr="${PI_IP}" addrtype="ipv4"/><ports>` +
    `<extraports state="closed" count="${others.length}"><extrareasons reason="conn-refused" ` +
    `count="${others.length}" proto="tcp" ports="${formatPortList(others)}"/></extraports>` +
    `${ports}</ports></host></nmaprun>`
  );
}

const nmapOutput = (open, options) => ({ stdout: nmapXml(open, options), stderr: '', exitCode: 0 });

function makeScenario(overrides = {}) {
  return {
    detectNetwork: () => NETWORK,
    arp: () => [{ ipAddress: PI_IP, macAddress: PI_MAC, interfaceName: 'en0' }],
    nmapInstalled: true,
    nmap: () => nmapOutput([HTTP]),
    ...overrides,
  };
}

/** A promise for the next completed or failed port scan. */
function nextOutcome() {
  return new Promise((resolve) => {
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === 'portscan.completed' || event.type === 'portscan.failed') {
        unsubscribe();
        resolve(event);
      }
    });
  });
}

const startScan = (deviceId) => request(app).post(`/api/devices/${deviceId}/scan`);

/** Starts a scan of `deviceId` and waits for its outcome event. */
async function scan(deviceId) {
  const outcome = nextOutcome();
  const res = await startScan(deviceId).expect(202);
  return { res, outcome: await outcome };
}

/** nmap that only finishes when the test says so. */
function pendingNmap() {
  let finish;
  const nmap = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  return { nmap, finish: (output) => finish(output) };
}

let events = [];
const unsubscribe = eventBus.subscribe((event) => events.push(event));
let pi;

beforeEach(async () => {
  await resetDatabase();
  scenario.current = makeScenario();
  vi.mocked(runCommand).mockClear();
  const network = await insertNetwork({
    cidr: NETWORK.cidr,
    gatewayIp: NETWORK.gatewayIp,
    gatewayMac: GATEWAY_MAC,
  });
  pi = await insertDevice(network.id, { macAddress: PI_MAC, ipAddress: PI_IP });
  events = [];
});

// A test that fails mid-scan must not leave the scan slot taken for the next one.
afterEach(() => cancelActivePortScan());

afterAll(async () => {
  unsubscribe();
  await closePool();
});

const scanCount = async () =>
  (await query("SELECT count(*)::int AS count FROM scans WHERE type = 'port'")).rows[0].count;

describe('POST /api/devices/:deviceId/scan', () => {
  it('starts a scan, runs it in the background, and stores what it found', async () => {
    const { res, outcome } = await scan(pi.id);

    expect(res.headers.location).toBe(`/api/devices/${pi.id}/ports`);
    expect(res.headers['ratelimit-policy']).toMatch(/^"port-scan"; q=10000;/);
    expect(res.body.data.scan).toEqual({
      id: expect.any(String),
      status: 'running',
      triggeredBy: 'manual',
      ipAddress: PI_IP,
      startedAt: expect.any(String),
      finishedAt: null,
      durationMs: null,
      error: null,
      summary: null,
    });

    expect(events.map((event) => event.type)).toEqual(['portscan.started', 'portscan.completed']);
    expect(events[0].data).toMatchObject({ scanId: res.body.data.scan.id, deviceId: pi.id });
    expect(outcome.data).toMatchObject({
      scanId: res.body.data.scan.id,
      deviceId: pi.id,
      summary: {
        portsChecked: 63,
        open: 1,
        closed: 62,
        filtered: 0,
        openPorts: [80],
        newlyOpen: [80],
        noLongerOpen: [],
      },
    });

    // nmap ran once, against the device's stored address, with the fixed connect scan.
    expect(runCommand).toHaveBeenCalledTimes(1);
    const [tool, args] = vi.mocked(runCommand).mock.calls[0];
    expect(tool).toBe('nmap');
    expect(args.slice(0, 3)).toEqual(['-sT', '--unprivileged', '-Pn']);
    expect(args.at(-1)).toBe(PI_IP);

    // The exact command is kept with the scan for auditing.
    const { rows } = await query("SELECT params FROM scans WHERE type = 'port'");
    expect(rows[0].params).toMatchObject({ profile: 'common', nmapArgs: args });
  });

  it('refuses a second scan while one is running, including a discovery', async () => {
    const { nmap, finish } = pendingNmap();
    scenario.current = makeScenario({ nmap });
    const outcome = nextOutcome();
    await startScan(pi.id).expect(202);

    const again = await startScan(pi.id).expect(409);
    expect(again.body.error.code).toBe('SCAN_IN_PROGRESS');
    const discovery = await request(app).post('/api/devices/discover').expect(409);
    expect(discovery.body.error.code).toBe('SCAN_IN_PROGRESS');
    expect(getActivePortScan()).toMatchObject({ deviceId: pi.id });

    finish(nmapOutput([HTTP]));
    await outcome;
    expect(getActivePortScan()).toBeNull();

    // Once it is over, the next scan may start.
    scenario.current = makeScenario();
    expect((await scan(pi.id)).outcome.type).toBe('portscan.completed');
  });

  it.each([
    ['a port list', { ports: '1-65535' }, 'body'],
    ['nmap options', { args: ['-sS', '-O'] }, 'body'],
    ['a target', { target: '8.8.8.8' }, 'body'],
  ])('cannot be steered: rejects %s in the body', async (_label, body, path) => {
    const res = await startScan(pi.id).send(body).expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path })],
    });
    expect(await scanCount()).toBe(0);
  });

  it('rejects query parameters and malformed ids', async () => {
    await request(app).post(`/api/devices/${pi.id}/scan?target=8.8.8.8`).expect(400);
    const res = await startScan('8.8.8.8').expect(400);
    expect(res.body.error.details[0].path).toBe('params.deviceId');
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown device', async () => {
    const res = await startScan('6f1c1c9e-6a4b-4a70-8a3c-0b3f7d0d8f55').expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('only scans devices on the network this computer is on', async () => {
    const office = await insertNetwork({
      cidr: '10.0.0.0/24',
      gatewayIp: '10.0.0.1',
      gatewayMac: 'a4:83:e7:00:00:02',
    });
    const printer = await insertDevice(office.id, {
      macAddress: '00:11:32:00:01:00',
      ipAddress: '10.0.0.40',
    });

    const res = await startScan(printer.id).expect(422);

    expect(res.body.error).toMatchObject({
      code: 'TARGET_NOT_ALLOWED',
      details: { deviceNetworkId: office.id },
    });
    expect(runCommand).not.toHaveBeenCalled();
    expect(await scanCount()).toBe(0);
  });

  it('refuses to scan an address that now belongs to another device', async () => {
    scenario.current = makeScenario({
      arp: () => [{ ipAddress: PI_IP, macAddress: 'de:ad:be:ef:00:01', interfaceName: 'en0' }],
    });

    const res = await startScan(pi.id).expect(409);

    expect(res.body.error).toMatchObject({
      code: 'TARGET_CHANGED',
      details: { expectedMacAddress: PI_MAC, currentMacAddress: 'de:ad:be:ef:00:01' },
    });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('discards the results when another device answered at that address', async () => {
    let reads = 0;
    scenario.current = makeScenario({
      arp: () => {
        reads += 1;
        const macAddress = reads === 1 ? PI_MAC : 'de:ad:be:ef:00:01';
        return [{ ipAddress: PI_IP, macAddress, interfaceName: 'en0' }];
      },
    });

    const { outcome } = await scan(pi.id);

    expect(outcome.type).toBe('portscan.failed');
    expect(outcome.data.error.code).toBe('TARGET_CHANGED');
    const { rows } = await query('SELECT count(*)::int AS count FROM device_ports');
    expect(rows[0].count).toBe(0);
  });

  it('explains that nmap is needed', async () => {
    scenario.current = makeScenario({ nmapInstalled: false });

    const res = await startScan(pi.id).expect(503);

    expect(res.body.error).toMatchObject({ code: 'TOOL_UNAVAILABLE' });
    expect(res.body.error.message).toMatch(/install/i);
    expect(await scanCount()).toBe(0);
  });

  it('records a failed scan', async () => {
    scenario.current = makeScenario({ nmap: () => ({ stdout: '', stderr: 'x', exitCode: 1 }) });

    const { outcome } = await scan(pi.id);

    expect(outcome.data.error).toEqual({
      code: 'PORT_SCAN_FAILED',
      message: 'nmap exited with an error.',
    });
    const { rows } = await query("SELECT status, error_code FROM scans WHERE type = 'port'");
    expect(rows).toEqual([{ status: 'failed', error_code: 'PORT_SCAN_FAILED' }]);
  });

  it('fails with SCAN_TIMEOUT when nmap gives up on the host', async () => {
    scenario.current = makeScenario({ nmap: () => nmapOutput([HTTP], { timedOut: true }) });

    const { outcome } = await scan(pi.id);

    expect(outcome.data.error.code).toBe('SCAN_TIMEOUT');
  });

  it('is cancelled cleanly when the server shuts down', async () => {
    scenario.current = makeScenario({
      nmap: (args, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new NetworkError(NetworkErrorCodes.COMMAND_ABORTED, '"nmap" was cancelled.')),
          );
        }),
    });
    const outcome = nextOutcome();
    await startScan(pi.id).expect(202);

    await cancelActivePortScan();

    expect((await outcome).data.error.code).toBe('SCAN_CANCELLED');
    const { rows } = await query("SELECT status FROM scans WHERE type = 'port'");
    expect(rows[0].status).toBe('cancelled');
  });
});

describe('GET /api/devices/:deviceId/ports', () => {
  const getPorts = (deviceId = pi.id) => request(app).get(`/api/devices/${deviceId}/ports`);

  it('describes the scan profile and has no results before the first scan', async () => {
    const res = await getPorts().expect(200);

    expect(res.body.data).toEqual({
      profile: {
        name: 'common',
        protocol: 'tcp',
        ports: PORT_SCAN_PROFILE.ports,
        serviceDetection: 'light',
        timeoutMs: 120_000,
        enabled: true,
      },
      scan: null,
      results: null,
    });
  });

  it('returns the open ports of the latest scan with their services', async () => {
    await scan(pi.id);

    const res = await getPorts().expect(200);
    const { scan: latest, results } = res.body.data;

    expect(latest).toMatchObject({ status: 'completed', durationMs: expect.any(Number) });
    expect(results).toMatchObject({ scanId: latest.id, summary: { open: 1, portsChecked: 63 } });
    expect(results.ports).toEqual([
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        service: 'http',
        product: 'nginx',
        version: '1.27.5',
        firstSeenOpenAt: expect.any(String),
        lastSeenOpenAt: expect.any(String),
        isNew: true,
      },
    ]);
  });

  it('tracks ports across scans: newly open, and no longer open', async () => {
    await scan(pi.id);
    scenario.current = makeScenario({ nmap: () => nmapOutput([SSH]) });

    const { outcome } = await scan(pi.id);

    expect(outcome.data.summary).toMatchObject({
      openPorts: [22],
      newlyOpen: [22],
      noLongerOpen: [80],
    });
    const res = await getPorts().expect(200);
    expect(
      res.body.data.results.ports.map((port) => [port.port, port.state, port.service, port.isNew]),
    ).toEqual([
      [22, 'open', 'ssh', true],
      [80, 'closed', 'http', false],
    ]);
  });

  it('shows a failed latest scan next to the last successful results', async () => {
    await scan(pi.id);
    scenario.current = makeScenario({ nmap: () => ({ stdout: '', stderr: '', exitCode: 2 }) });
    await scan(pi.id);

    const res = await getPorts().expect(200);

    expect(res.body.data.scan).toMatchObject({
      status: 'failed',
      error: { code: 'PORT_SCAN_FAILED', message: 'nmap exited with an error.' },
    });
    expect(res.body.data.results.ports.map((port) => port.port)).toEqual([80]);
  });

  it('shows a running scan', async () => {
    const { nmap, finish } = pendingNmap();
    scenario.current = makeScenario({ nmap });
    const outcome = nextOutcome();
    await startScan(pi.id).expect(202);

    const res = await getPorts().expect(200);
    expect(res.body.data.scan.status).toBe('running');

    finish(nmapOutput([]));
    await outcome;
  });

  it('returns 404 for an unknown device and 400 for any query parameter', async () => {
    await getPorts('6f1c1c9e-6a4b-4a70-8a3c-0b3f7d0d8f55').expect(404);
    await request(app).get(`/api/devices/${pi.id}/ports?state=open`).expect(400);
  });
});
