import { deviceTypeLabel } from '@/constants/deviceTypes';
import { deviceTitle, isNewDevice, matchesSearch } from './deviceFilters';
import { compareIp } from './ip';

/**
 * The topology model: a pure description of the graph, built from the device inventory.
 * Knows nothing about Cytoscape or React (components/topology turns it into graph elements).
 *
 * WHAT THE EDGES MEAN. NetScope knows which devices are on the local subnet and which of them is
 * the gateway (the default route). It has no data about cables, switches, access points, or
 * Wi-Fi associations. So the graph is a *logical* topology:
 *
 *     Gateway
 *        ↓   "on the gateway's subnet; reaches other networks through it"
 *     each discovered device
 *
 * Every edge has `kind: 'logical'`. Nothing here may claim a physical link.
 */

/**
 * @typedef {'gateway' | 'computer' | 'mobile' | 'iot' | 'network' | 'other'} NodeCategory
 *
 * @typedef {object} TopologyNode
 * @property {string} id device id; `gateway:<networkId>` for a gateway not in the inventory
 * @property {'gateway' | 'device'} kind
 * @property {NodeCategory} category drives the node's shape and grouping
 * @property {string} name display name, never empty
 * @property {string} ipAddress
 * @property {string | null} hostname
 * @property {string | null} vendor
 * @property {string} deviceType device_types code
 * @property {string} typeLabel
 * @property {'online' | 'offline' | 'unknown'} status
 * @property {boolean} isGateway
 * @property {boolean} isSelf the machine NetScope runs on
 * @property {boolean} isNew first seen in the last 24 hours
 * @property {boolean} synthetic not a device record (the gateway was not discovered yet)
 * @property {string | null} lastSeenAt
 * @property {number} order position in the layout (gateway 0, then by category and IP)
 *
 * @typedef {object} TopologyEdge
 * @property {string} id
 * @property {string} source the gateway
 * @property {string} target a device
 * @property {'logical'} kind never physical: see above
 * @property {'subnet-via-gateway'} relation
 *
 * @typedef {object} TopologyModel
 * @property {'logical'} model
 * @property {{ id: string, cidr: string, gatewayIpAddress: string, interfaceName: string } | null} network
 * @property {string | null} rootId the gateway node
 * @property {TopologyNode[]} nodes gateway first, then devices in display order
 * @property {TopologyEdge[]} edges
 * @property {{ devices: number, online: number, offline: number, hidden: number }} counts
 */

/** Device type → category. Unknown codes are "other". */
const CATEGORY_BY_TYPE = {
  computer: 'computer',
  server: 'computer',
  nas: 'computer',
  phone: 'mobile',
  tablet: 'mobile',
  tv: 'iot',
  speaker: 'iot',
  camera: 'iot',
  iot: 'iot',
  game_console: 'iot',
  printer: 'iot',
  router: 'network',
  access_point: 'network',
  switch: 'network',
  other: 'other',
  unknown: 'other',
};

/** Order of categories around the gateway, so similar devices sit together. */
const CATEGORY_ORDER = ['computer', 'mobile', 'iot', 'network', 'other'];

export const CATEGORY_LABELS = Object.freeze({
  gateway: 'Gateway',
  computer: 'Computers and servers',
  mobile: 'Phones and tablets',
  iot: 'Smart home, media, and printers',
  network: 'Network equipment',
  other: 'Other and unknown',
});

/** @param {string} deviceType */
export function categoryOf(deviceType) {
  return CATEGORY_BY_TYPE[deviceType] ?? 'other';
}

function toNode(device, now) {
  return {
    id: device.id,
    kind: device.isGateway ? 'gateway' : 'device',
    category: device.isGateway ? 'gateway' : categoryOf(device.deviceType),
    name: deviceTitle(device),
    ipAddress: device.ipAddress,
    hostname: device.hostname ?? null,
    vendor: device.vendor ?? null,
    deviceType: device.deviceType,
    typeLabel: deviceTypeLabel(device.deviceType),
    status: device.status,
    isGateway: Boolean(device.isGateway),
    isSelf: Boolean(device.isSelf),
    isNew: isNewDevice(device, now),
    synthetic: false,
    lastSeenAt: device.lastSeenAt ?? null,
    order: 0,
  };
}

/** A stand-in for a gateway that is known from the network but missing from the inventory. */
function syntheticGateway(network) {
  return {
    id: `gateway:${network.id}`,
    kind: 'gateway',
    category: 'gateway',
    name: 'Gateway',
    ipAddress: network.gatewayIpAddress,
    hostname: null,
    vendor: null,
    deviceType: 'router',
    typeLabel: deviceTypeLabel('router'),
    status: 'unknown',
    isGateway: true,
    isSelf: false,
    isNew: false,
    synthetic: true,
    lastSeenAt: null,
    order: 0,
  };
}

function compareDevices(a, b) {
  // This computer first, then by category, then by IP.
  if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
  const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  return byCategory || compareIp(a.ipAddress, b.ipAddress);
}

/**
 * Builds the logical topology of one network from its devices.
 *
 * @param {{ network: import('@/types/api').Network | null,
 *           devices: import('@/types/api').Device[],
 *           showOffline?: boolean, now?: number }} input
 * @returns {TopologyModel}
 */
export function buildTopologyModel({ network, devices, showOffline = true, now = Date.now() }) {
  if (!network) {
    return {
      model: 'logical',
      network: null,
      rootId: null,
      nodes: [],
      edges: [],
      counts: { devices: 0, online: 0, offline: 0, hidden: 0 },
    };
  }

  const gatewayDevice = devices.find((device) => device.isGateway);
  const root = gatewayDevice ? toNode(gatewayDevice, now) : syntheticGateway(network);
  const online = devices.filter((device) => device.status === 'online').length;

  const members = devices
    .filter((device) => device.id !== gatewayDevice?.id)
    .filter((device) => showOffline || device.status === 'online')
    .map((device) => toNode(device, now))
    .sort(compareDevices)
    .map((node, index) => ({ ...node, order: index + 1 }));

  return {
    model: 'logical',
    network: {
      id: network.id,
      cidr: network.cidr,
      gatewayIpAddress: network.gatewayIpAddress,
      interfaceName: network.interfaceName,
    },
    rootId: root.id,
    nodes: [root, ...members],
    edges: members.map((node) => ({
      id: `${root.id}->${node.id}`,
      source: root.id,
      target: node.id,
      kind: 'logical',
      relation: 'subnet-via-gateway',
    })),
    counts: {
      devices: devices.length,
      online,
      offline: devices.length - online,
      hidden: devices.length - members.length - (gatewayDevice ? 1 : 0),
    },
  };
}

/**
 * Ids of the nodes matching a search (same rules as the device list: IP, MAC, names, vendor,
 * type). Empty query → null (no search active).
 *
 * @param {TopologyNode[]} nodes
 * @param {Record<string, import('@/types/api').Device>} devicesById
 * @param {string} query
 * @returns {Set<string> | null}
 */
export function searchTopology(nodes, devicesById, query) {
  if (!query.trim()) return null;
  const matches = new Set();
  for (const node of nodes) {
    const device = devicesById[node.id];
    const matched = device
      ? matchesSearch(device, query)
      : node.ipAddress.includes(query.trim()) ||
        node.name.toLowerCase().includes(query.trim().toLowerCase());
    if (matched) matches.add(node.id);
  }
  return matches;
}
