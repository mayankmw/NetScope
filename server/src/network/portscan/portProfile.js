/**
 * The one port scan NetScope runs: TCP ports of services commonly found on home and small-office
 * networks, so an administrator can see what each device exposes. Fixed in code and documented
 * (docs/PORT_SCANNING.md); clients cannot choose ports, protocols, or options.
 */
export const COMMON_TCP_PORTS = Object.freeze([
  // Remote access and administration
  22, 23, 3389, 5900, 5985, 5986, 10000,
  // Web and web admin panels
  80, 81, 443, 3000, 8000, 8008, 8080, 8081, 8123, 8443, 8888, 9000, 9443,
  // File sharing and backup
  21, 139, 445, 548, 873, 2049,
  // Mail
  25, 110, 143, 465, 587, 993, 995,
  // Name, directory, and Windows services
  53, 88, 111, 135, 389, 636,
  // Printing
  515, 631, 9100,
  // Media, smart home, and IoT
  554, 1883, 1900, 5000, 5001, 5060, 5357, 7000, 8009, 8883, 32400, 49152, 62078,
  // Databases and caches (often exposed by accident)
  1433, 3306, 5432, 6379, 9200, 27017,
  // Proxies
  1080, 3128,
]);

/** @typedef {'light' | 'off'} ServiceDetection */

export const PORT_SCAN_PROFILE = Object.freeze({
  name: 'common',
  protocol: 'tcp',
  ports: Object.freeze([...COMMON_TCP_PORTS].sort((a, b) => a - b)),
});
