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
