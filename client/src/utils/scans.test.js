import { describe, expect, it } from 'vitest';
import { DEVICE_ID, makePortScanEntry, makeScan } from '@/test/fixtures';
import {
  mergeFirstPage,
  parseScanFilters,
  scanDetailsPath,
  scanFiltersKey,
  scanTitle,
  toScanQuery,
  toScanSearchParams,
  trendScans,
} from './scans';

const scan = (id, extra = {}) => makeScan({ id, ...extra });

describe('scan filters', () => {
  it('reads filters from the URL, falling back to network scans of any status', () => {
    expect(parseScanFilters(new URLSearchParams())).toEqual({
      type: 'discovery',
      status: 'all',
      deviceId: null,
    });
    expect(
      parseScanFilters(new URLSearchParams(`type=port&status=failed&device=${DEVICE_ID}`)),
    ).toEqual({ type: 'port', status: 'failed', deviceId: DEVICE_ID });
    expect(parseScanFilters(new URLSearchParams('type=arp&status=done&device=42'))).toEqual({
      type: 'discovery',
      status: 'all',
      deviceId: null,
    });
    // A device only narrows port scans.
    expect(parseScanFilters(new URLSearchParams(`device=${DEVICE_ID}`)).deviceId).toBeNull();
  });

  it('writes only what differs from the defaults', () => {
    expect(
      toScanSearchParams({ type: 'discovery', status: 'all', deviceId: null }).toString(),
    ).toBe('');
    expect(
      toScanSearchParams({ type: 'port', status: 'completed', deviceId: DEVICE_ID }).toString(),
    ).toBe(`type=port&status=completed&device=${DEVICE_ID}`);
    expect(scanFiltersKey({ type: 'discovery', status: 'all', deviceId: null })).toBe('all');
  });

  it('turns filters into an API query', () => {
    expect(toScanQuery({ type: 'discovery', status: 'all', deviceId: null })).toEqual({
      type: 'discovery',
      status: undefined,
      deviceId: undefined,
    });
    expect(toScanQuery({ type: 'port', status: 'failed', deviceId: DEVICE_ID })).toEqual({
      type: 'port',
      status: 'failed',
      deviceId: DEVICE_ID,
    });
  });
});

describe('mergeFirstPage', () => {
  it('puts new scans on top and replaces the ones that changed', () => {
    const current = {
      items: [scan('b', { status: 'running', summary: null }), scan('a')],
      nextCursor: 'a',
    };
    const page = { items: [scan('c'), scan('b')], nextCursor: 'b' };

    const merged = mergeFirstPage(current, page);

    expect(merged.items.map((item) => [item.id, item.status])).toEqual([
      ['c', 'completed'],
      ['b', 'completed'],
      ['a', 'completed'],
    ]);
    expect(merged.nextCursor).toBe('a');
  });

  it('starts over when the fresh page does not reach the loaded scans', () => {
    const merged = mergeFirstPage(
      { items: [scan('a')], nextCursor: null },
      { items: [scan('c'), scan('b')], nextCursor: 'b' },
    );
    expect(merged).toEqual({ items: [scan('c'), scan('b')], nextCursor: 'b' });
  });
});

describe('scanTitle', () => {
  it('names the scan, and the device a port scan checked', () => {
    expect(scanTitle(makeScan())).toBe('Network scan');
    expect(scanTitle(makePortScanEntry())).toBe('Port scan of raspberrypi.lan');
  });
});

describe('trendScans', () => {
  it('keeps completed discoveries with counts, oldest first', () => {
    const scans = [
      scan('d'),
      scan('c', { status: 'failed', summary: null }),
      makePortScanEntry({ id: 'p' }),
      scan('b'),
      scan('a'),
    ];
    expect(trendScans(scans).map((item) => item.id)).toEqual(['a', 'b', 'd']);
    expect(trendScans(scans, 2).map((item) => item.id)).toEqual(['b', 'd']);
  });

  it('builds the details path', () => {
    expect(scanDetailsPath('abc')).toBe('/scans/abc');
  });
});
