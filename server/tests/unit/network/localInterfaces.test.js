import { describe, expect, it } from 'vitest';
import { findLocalInterface, listLocalMacAddresses } from '../../../src/network/localInterfaces.js';

const INTERFACES = {
  lo0: [
    {
      address: '127.0.0.1',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: true,
      cidr: '127.0.0.1/8',
    },
  ],
  en0: [
    {
      address: 'fe80::1c:5f',
      family: 'IPv6',
      mac: 'C6:33:EE:E5:75:C3',
      internal: false,
      cidr: 'fe80::1c:5f/64',
    },
    {
      address: '192.168.1.37',
      family: 'IPv4',
      mac: 'C6:33:EE:E5:75:C3',
      internal: false,
      cidr: '192.168.1.37/24',
    },
  ],
  utun3: [
    {
      address: '10.8.0.2',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: false,
      cidr: '10.8.0.2/24',
    },
  ],
};

describe('findLocalInterface', () => {
  it("returns this machine's interface with that MAC and its addresses", () => {
    expect(findLocalInterface('c6:33:ee:e5:75:c3', () => INTERFACES)).toEqual({
      name: 'en0',
      macAddress: 'c6:33:ee:e5:75:c3',
      addresses: [
        { family: 'IPv6', address: 'fe80::1c:5f', cidr: 'fe80::1c:5f/64' },
        { family: 'IPv4', address: '192.168.1.37', cidr: '192.168.1.37/24' },
      ],
    });
  });

  it('returns null for any other device', () => {
    expect(findLocalInterface('b8:27:eb:12:34:56', () => INTERFACES)).toBeNull();
  });

  it('never matches internal interfaces', () => {
    expect(findLocalInterface('00:00:00:00:00:00', () => ({ lo0: INTERFACES.lo0 }))).toBeNull();
  });
});

describe('listLocalMacAddresses', () => {
  it("lists this machine's interface MACs, normalized, without loopback or placeholder MACs", () => {
    expect(listLocalMacAddresses(() => INTERFACES)).toEqual(new Set(['c6:33:ee:e5:75:c3']));
  });
});
