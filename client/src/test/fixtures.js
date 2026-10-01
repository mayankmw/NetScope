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
