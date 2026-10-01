/** Test data shaped like GET /api/devices responses. */

const HOUR = 60 * 60 * 1000;

export function makeDevice(overrides = {}) {
  return {
    id: overrides.id ?? `device-${overrides.ipAddress ?? '192.168.1.20'}`,
    ipAddress: '192.168.1.20',
    macAddress: 'b8:27:eb:12:34:56',
    macIsRandom: false,
    hostname: null,
    vendor: null,
    deviceType: 'unknown',
    displayName: null,
    isTrusted: false,
    status: 'online',
    isGateway: false,
    firstSeenAt: new Date(Date.now() - 72 * HOUR).toISOString(),
    lastSeenAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

export const NETWORK = {
  id: 'network-1',
  name: null,
  cidr: '192.168.1.0/24',
  interfaceName: 'en0',
  gatewayIpAddress: '192.168.1.1',
  gatewayMacAddress: 'a4:83:e7:00:01:01',
  firstSeenAt: new Date(Date.now() - 96 * HOUR).toISOString(),
  lastSeenAt: new Date().toISOString(),
  lastScan: { id: 'scan-1', finishedAt: new Date(Date.now() - 5 * 60_000).toISOString() },
};

/** Gateway, a Raspberry Pi, an offline phone, and a brand-new unknown device. */
export function makeInventory() {
  return {
    network: NETWORK,
    devices: [
      makeDevice({
        ipAddress: '192.168.1.1',
        macAddress: 'a4:83:e7:00:01:01',
        vendor: 'Apple, Inc.',
        deviceType: 'router',
        isGateway: true,
      }),
      makeDevice({
        ipAddress: '192.168.1.9',
        macAddress: 'da:a1:19:00:00:09',
        macIsRandom: true,
        hostname: 'pixel-8',
        deviceType: 'phone',
        status: 'offline',
      }),
      makeDevice({
        ipAddress: '192.168.1.20',
        hostname: 'raspberrypi.lan',
        vendor: 'Raspberry Pi Foundation',
        deviceType: 'computer',
      }),
      makeDevice({
        ipAddress: '192.168.1.100',
        macAddress: '00:11:32:00:01:00',
        vendor: 'Synology Incorporated',
        firstSeenAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      }),
    ],
  };
}

export const DEVICE_ID = '8f2c1d3e-6b7a-4c9d-8e1f-2a3b4c5d6e7f';

/** Shaped like GET /api/devices/:deviceId: a Raspberry Pi that moved from .20 to .21. */
export function makeDeviceDetails(overrides = {}) {
  const device = makeDevice({
    id: DEVICE_ID,
    ipAddress: '192.168.1.21',
    hostname: 'raspberrypi.lan',
    vendor: 'Raspberry Pi Foundation',
    deviceType: 'computer',
    isSelf: false,
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides.device,
  });
  return {
    device,
    network: NETWORK,
    presence: {
      statusSince: new Date(Date.now() - 2 * HOUR).toISOString(),
      timesSeen: 11,
      scansSinceFirstSeen: 12,
      lastLatencyMs: 4.2,
      averageLatencyMs: 5.1,
      latencySamples: 11,
      ...overrides.presence,
    },
    ipHistory: overrides.ipHistory ?? [
      {
        ipAddress: '192.168.1.21',
        firstSeenAt: new Date(Date.now() - 2 * HOUR).toISOString(),
        lastSeenAt: device.lastSeenAt,
        timesSeen: 3,
      },
      {
        ipAddress: '192.168.1.20',
        firstSeenAt: device.firstSeenAt,
        lastSeenAt: new Date(Date.now() - 3 * HOUR).toISOString(),
        timesSeen: 8,
      },
    ],
    localInterface: overrides.localInterface ?? null,
  };
}

export function makeDeviceEvent(overrides = {}) {
  return {
    id: '1',
    type: 'discovered',
    occurredAt: new Date(Date.now() - 72 * HOUR).toISOString(),
    ipAddress: '192.168.1.20',
    changes: {},
    scanId: 'scan-1',
    ...overrides,
  };
}

export function makeObservation(overrides = {}) {
  return {
    id: '1',
    observedAt: new Date(Date.now() - 60_000).toISOString(),
    ipAddress: '192.168.1.21',
    hostname: 'raspberrypi.lan',
    latencyMs: 4.2,
    scanId: 'scan-1',
    triggeredBy: 'manual',
    ...overrides,
  };
}

/** The timeline of makeDeviceDetails(), newest first. */
export function makeTimeline() {
  return [
    makeDeviceEvent({
      id: '4',
      type: 'updated',
      ipAddress: '192.168.1.21',
      occurredAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      changes: { ipAddress: { from: '192.168.1.20', to: '192.168.1.21' } },
    }),
    makeDeviceEvent({
      id: '3',
      type: 'online',
      ipAddress: '192.168.1.21',
      occurredAt: new Date(Date.now() - 2 * HOUR).toISOString(),
    }),
    makeDeviceEvent({
      id: '2',
      type: 'offline',
      occurredAt: new Date(Date.now() - 3 * HOUR).toISOString(),
    }),
    makeDeviceEvent({ id: '1' }),
  ];
}

const PROFILE_PORTS = [
  21, 22, 23, 25, 53, 80, 81, 88, 110, 111, 135, 139, 143, 389, 443, 445, 465, 515, 548, 554, 587,
  631, 636, 873, 993, 995, 1080, 1433, 1883, 1900, 2049, 3000, 3128, 3306, 3389, 5000, 5001, 5060,
  5357, 5432, 5900, 5985, 5986, 6379, 7000, 8000, 8008, 8009, 8080, 8081, 8123, 8443, 8883, 8888,
  9000, 9100, 9200, 9443, 10000, 27017, 32400, 49152, 62078,
];

export function makePortScan(overrides = {}) {
  return {
    id: 'port-scan-1',
    status: 'completed',
    triggeredBy: 'manual',
    ipAddress: '192.168.1.21',
    startedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    finishedAt: new Date(Date.now() - 2 * 60_000 + 7_000).toISOString(),
    durationMs: 7_000,
    error: null,
    summary: null,
    ...overrides,
  };
}

/** Shaped like GET /api/devices/:deviceId/ports. Default: never scanned. */
export function makeDevicePorts({ scan = null, results = null, profile = {} } = {}) {
  return {
    profile: {
      name: 'common',
      protocol: 'tcp',
      ports: PROFILE_PORTS,
      serviceDetection: 'light',
      timeoutMs: 120_000,
      enabled: true,
      ...profile,
    },
    scan,
    results,
  };
}

/** A completed scan that found SSH (new) and HTTP open, and a port no longer open. */
export function makeScannedPorts() {
  const scan = makePortScan();
  return makeDevicePorts({
    scan,
    results: {
      scanId: scan.id,
      startedAt: scan.startedAt,
      finishedAt: scan.finishedAt,
      summary: {
        portsChecked: 63,
        open: 2,
        closed: 61,
        filtered: 0,
        openPorts: [22, 80],
        newlyOpen: [22],
        noLongerOpen: [8080],
      },
      ports: [
        {
          port: 22,
          protocol: 'tcp',
          state: 'open',
          service: 'ssh',
          product: 'OpenSSH',
          version: '9.2p1',
          firstSeenOpenAt: scan.finishedAt,
          lastSeenOpenAt: scan.finishedAt,
          isNew: true,
        },
        {
          port: 80,
          protocol: 'tcp',
          state: 'open',
          service: 'http',
          product: 'nginx',
          version: '1.27.5',
          firstSeenOpenAt: new Date(Date.now() - 48 * HOUR).toISOString(),
          lastSeenOpenAt: scan.finishedAt,
          isNew: false,
        },
        {
          port: 8080,
          protocol: 'tcp',
          state: 'closed',
          service: 'http-proxy',
          product: null,
          version: null,
          firstSeenOpenAt: new Date(Date.now() - 48 * HOUR).toISOString(),
          lastSeenOpenAt: new Date(Date.now() - 24 * HOUR).toISOString(),
          isNew: false,
        },
      ],
    },
  });
}

export const SCAN_ID = '3cba97d2-04cc-4586-b3e4-7294ef538422';

export function makeDiscoverySummary(overrides = {}) {
  return {
    devicesFound: 3,
    newDevices: 0,
    backOnline: 0,
    wentOffline: 0,
    missingDevices: 1,
    knownDevices: 4,
    ipChanges: 0,
    unresolvedHosts: 0,
    ...overrides,
  };
}

/** Shaped like an entry of GET /api/scans. Default: a completed discovery, 10 minutes ago. */
export function makeScan(overrides = {}) {
  const startedAt = overrides.startedAt ?? new Date(Date.now() - 10 * 60_000).toISOString();
  return {
    id: SCAN_ID,
    type: 'discovery',
    status: 'completed',
    triggeredBy: 'manual',
    target: '192.168.1.0/24',
    network: { id: NETWORK.id, cidr: NETWORK.cidr },
    device: null,
    createdAt: startedAt,
    startedAt,
    finishedAt: new Date(new Date(startedAt).getTime() + 1_400).toISOString(),
    durationMs: 1_400,
    error: null,
    summary: makeDiscoverySummary(),
    ...overrides,
  };
}

/** A completed port scan of the Raspberry Pi that found SSH and HTTP open. */
export function makePortScanEntry(overrides = {}) {
  return makeScan({
    id: 'a0b1c2d3-0000-4000-8000-000000000022',
    type: 'port',
    target: '192.168.1.21',
    device: {
      id: DEVICE_ID,
      ipAddress: '192.168.1.21',
      macAddress: 'b8:27:eb:12:34:56',
      hostname: 'raspberrypi.lan',
      displayName: null,
      vendor: 'Raspberry Pi Foundation',
      deviceType: 'computer',
      isGateway: false,
    },
    durationMs: 7_000,
    summary: {
      portsChecked: 63,
      open: 2,
      closed: 61,
      filtered: 0,
      openPorts: [22, 80],
      newlyOpen: [22],
      noLongerOpen: [],
    },
    ...overrides,
  });
}

/**
 * Shaped like GET /api/scans/:scanId for a discovery: the Pi moved to .21, the phone came back,
 * a new Synology appeared, and a printer went missing.
 */
export function makeScanDetails(overrides = {}) {
  const inventory = makeInventory().devices;
  const [gateway, phone, pi, nas] = inventory;
  const printer = makeDevice({
    id: 'device-192.168.1.25',
    ipAddress: '192.168.1.25',
    hostname: 'printer',
    deviceType: 'printer',
    status: 'offline',
  });
  const found = (device, extra = {}) => ({
    device: { isSelf: false, ...device },
    ipAddress: device.ipAddress,
    hostname: device.hostname,
    latencyMs: 3.2,
    isNew: false,
    backOnline: false,
    changes: {},
    ...extra,
  });
  // Both times from one clock reading, so "last seen 1h 0m before" is exact.
  const startedAt = new Date(Date.now() - 10 * 60_000);
  return {
    scan: {
      ...makeScan({
        startedAt: startedAt.toISOString(),
        summary: makeDiscoverySummary({
          devicesFound: 4,
          newDevices: 1,
          backOnline: 1,
          wentOffline: 1,
          missingDevices: 1,
          knownDevices: 5,
          ipChanges: 1,
        }),
      }),
      network: { id: NETWORK.id, cidr: NETWORK.cidr, interfaceName: 'en0' },
      params: {
        sweepCidr: '192.168.1.0/24',
        interfaceName: 'en0',
        pingTimeoutMs: 1000,
        pingConcurrency: 64,
        nmap: 'auto',
      },
      ...overrides.scan,
    },
    previous: { id: 'b0000000-0000-4000-8000-000000000001', createdAt: NETWORK.firstSeenAt },
    next: null,
    results:
      'results' in overrides
        ? overrides.results
        : {
            found: [
              found(gateway),
              found(phone, { backOnline: true }),
              found(pi, {
                ipAddress: '192.168.1.21',
                changes: { ipAddress: { from: '192.168.1.20', to: '192.168.1.21' } },
              }),
              found(nas, { isNew: true, latencyMs: null }),
            ],
            missing: [
              {
                device: { isSelf: false, ...printer },
                wentOffline: true,
                lastSeenAt: new Date(startedAt.getTime() - 60 * 60_000).toISOString(),
                lastIpAddress: '192.168.1.25',
              },
            ],
          },
    ...overrides.top,
  };
}

/**
 * Shaped like GET /api/devices/:deviceId/history: online for 2 hours, offline for 3 hours before
 * that, first seen 72 hours ago (30-day range).
 */
export function makeDeviceHistory(overrides = {}) {
  const now = Date.now();
  const iso = (hoursAgo) => new Date(now - hoursAgo * HOUR).toISOString();
  return {
    range: { from: iso(30 * 24), to: iso(0), days: 30 },
    firstSeenAt: iso(72),
    status: 'online',
    periods: [
      { status: 'online', from: iso(72), to: iso(5), scanId: 'scan-1' },
      { status: 'offline', from: iso(5), to: iso(2), scanId: 'scan-2' },
      { status: 'online', from: iso(2), to: null, scanId: 'scan-3' },
    ],
    scans: {
      total: 3,
      seen: 2,
      items: [
        {
          id: 'scan-3',
          finishedAt: iso(2),
          triggeredBy: 'manual',
          seen: true,
          ipAddress: '192.168.1.21',
          latencyMs: 4,
        },
        {
          id: 'scan-2',
          finishedAt: iso(5),
          triggeredBy: 'manual',
          seen: false,
          ipAddress: null,
          latencyMs: null,
        },
        {
          id: 'scan-1',
          finishedAt: iso(72),
          triggeredBy: 'manual',
          seen: true,
          ipAddress: '192.168.1.20',
          latencyMs: 5,
        },
      ],
    },
    ...overrides,
  };
}

export const ALERT_ID = 'c0ffee00-0000-4000-8000-000000000001';

/** Shaped like an entry of GET /api/alerts. Default: an unread new-device alert for the Pi. */
export function makeAlert(overrides = {}) {
  const at = new Date(Date.now() - 5 * 60_000).toISOString();
  return {
    id: ALERT_ID,
    type: 'new_device',
    severity: 'warning',
    status: 'unread',
    message: 'New device on the network: raspberrypi.lan at 192.168.1.21 (MAC b8:27:eb:12:34:56).',
    network: { id: NETWORK.id, cidr: NETWORK.cidr },
    device: {
      id: DEVICE_ID,
      ipAddress: '192.168.1.21',
      macAddress: 'b8:27:eb:12:34:56',
      macIsRandom: false,
      hostname: 'raspberrypi.lan',
      displayName: null,
      vendor: 'Raspberry Pi Foundation',
      deviceType: 'computer',
      status: 'online',
      isGateway: false,
    },
    scanId: SCAN_ID,
    context: { ipAddress: '192.168.1.21', macAddress: 'b8:27:eb:12:34:56' },
    occurrences: 1,
    createdAt: at,
    lastOccurredAt: at,
    readAt: null,
    resolvedAt: null,
    updatedAt: at,
    ...overrides,
  };
}

export const ALERT_POLICY = { returnAfterMs: 86_400_000, cooldownMs: 86_400_000 };
