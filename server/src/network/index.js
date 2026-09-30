/**
 * Public surface of the network layer. Services import only from here, which keeps the layer
 * swappable and lets tests replace it wholesale.
 *
 * Nothing in this layer knows about HTTP, the database, or WebSockets.
 */
export { NetworkError, NetworkErrorCodes } from './errors.js';
export { isToolAvailable } from './exec/tools.js';
export { getPlatform } from './platform/index.js';
export { detectNetwork } from './networkDetection.js';
export { pingSweep } from './discovery/pingSweep.js';
export { nmapHostDiscovery } from './discovery/nmapDiscovery.js';
export { lookupHostnames } from './discovery/hostnames.js';
export { lookupVendor } from './discovery/vendors.js';
export { mergeObservations, toDiscoveredDevice } from './discovery/normalizeDevices.js';
