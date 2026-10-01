import { describe, expect, it } from 'vitest';
import { makeDevice, makeInventory, NETWORK } from '@/test/fixtures';
import { buildTopologyModel, categoryOf, searchTopology } from './topology';

const build = (overrides = {}) => {
  const { network, devices } = makeInventory();
  return buildTopologyModel({ network, devices, ...overrides });
};

describe('buildTopologyModel', () => {
  it('is empty before the first discovery', () => {
    expect(buildTopologyModel({ network: null, devices: [] })).toMatchObject({
      model: 'logical',
      rootId: null,
      nodes: [],
      edges: [],
    });
  });

  it('puts the gateway at the root, with one logical edge to every other device', () => {
    const model = build();

    expect(model.model).toBe('logical');
    expect(model.nodes[0]).toMatchObject({
      kind: 'gateway',
      isGateway: true,
      ipAddress: '192.168.1.1',
    });
    expect(model.rootId).toBe(model.nodes[0].id);
    expect(model.edges).toHaveLength(model.nodes.length - 1);
    for (const edge of model.edges) {
      expect(edge).toMatchObject({
        source: model.rootId,
        kind: 'logical',
        relation: 'subnet-via-gateway',
      });
    }
    expect(new Set(model.edges.map((edge) => edge.target))).toEqual(
      new Set(model.nodes.slice(1).map((node) => node.id)),
    );
  });

  it('never claims a physical link', () => {
    expect(build().edges.every((edge) => edge.kind === 'logical')).toBe(true);
  });

  it('describes each node: IP, hostname, type, status, and flags', () => {
    const pi = build().nodes.find((node) => node.ipAddress === '192.168.1.20');

    expect(pi).toMatchObject({
      kind: 'device',
      category: 'computer',
      name: 'raspberrypi.lan',
      hostname: 'raspberrypi.lan',
      deviceType: 'computer',
      typeLabel: 'Computer',
      status: 'online',
      isSelf: false,
      synthetic: false,
    });
  });

  it('orders devices: this computer first, then by category, then by IP', () => {
    const { network } = makeInventory();
    const devices = [
      makeDevice({ ipAddress: '192.168.1.1', isGateway: true, deviceType: 'router' }),
      makeDevice({ ipAddress: '192.168.1.50', deviceType: 'iot' }),
      makeDevice({ ipAddress: '192.168.1.40', deviceType: 'phone' }),
      makeDevice({ ipAddress: '192.168.1.30', deviceType: 'computer' }),
      makeDevice({ ipAddress: '192.168.1.9', deviceType: 'computer' }),
      makeDevice({ ipAddress: '192.168.1.99', deviceType: 'computer', isSelf: true }),
    ];

    const model = buildTopologyModel({ network, devices });

    expect(model.nodes.map((node) => [node.ipAddress, node.order])).toEqual([
      ['192.168.1.1', 0],
      ['192.168.1.99', 1],
      ['192.168.1.9', 2],
      ['192.168.1.30', 3],
      ['192.168.1.40', 4],
      ['192.168.1.50', 5],
    ]);
  });

  it('stands in for a gateway that is not in the inventory', () => {
    const { network, devices } = makeInventory();
    const model = buildTopologyModel({
      network,
      devices: devices.filter((device) => !device.isGateway),
    });

    expect(model.nodes[0]).toMatchObject({
      id: `gateway:${NETWORK.id}`,
      ipAddress: NETWORK.gatewayIpAddress,
      synthetic: true,
      status: 'unknown',
    });
    expect(model.edges).toHaveLength(3);
  });

  it('can leave offline devices out, and counts them', () => {
    const model = build({ showOffline: false });

    expect(model.nodes.some((node) => node.status === 'offline')).toBe(false);
    expect(model.counts).toEqual({ devices: 4, online: 3, offline: 1, hidden: 1 });
  });
});

describe('categoryOf', () => {
  it('groups device types, with anything unknown as "other"', () => {
    expect(categoryOf('nas')).toBe('computer');
    expect(categoryOf('tablet')).toBe('mobile');
    expect(categoryOf('camera')).toBe('iot');
    expect(categoryOf('access_point')).toBe('network');
    expect(categoryOf('quantum_toaster')).toBe('other');
  });
});

describe('searchTopology', () => {
  it('finds nodes by the same fields as the device list', () => {
    const { network, devices } = makeInventory();
    const byId = Object.fromEntries(devices.map((device) => [device.id, device]));
    const { nodes } = buildTopologyModel({ network, devices });

    expect(searchTopology(nodes, byId, '')).toBeNull();
    expect([...searchTopology(nodes, byId, 'raspberry')]).toEqual(['device-192.168.1.20']);
    expect(searchTopology(nodes, byId, 'B8-27-EB').size).toBe(1);
    expect(searchTopology(nodes, byId, 'nothing-like-this').size).toBe(0);
  });
});
