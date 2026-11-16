import { describe, expect, it } from 'vitest';

import { listZip, memorySource, streamEntry, StreamCancelled, ZipError, type ByteSource } from './zip';
import { buildZip, utf8 } from './zipBuilder';

/** A source that records every byte range asked for, to prove what is (not) read. */
function watched(bytes: Uint8Array) {
  const reads: [number, number][] = [];
  const src: ByteSource = {
    size: bytes.length,
    read: async (o, l) => {
      reads.push([o, l]);
      return bytes.subarray(o, Math.min(bytes.length, o + l));
    },
  };
  return { src, reads };
}

const big = utf8('<HealthData>' + '<Record value="1"/>\n'.repeat(20_000) + '</HealthData>');
const decoys = [
  { name: 'apple_health_export/export_cda.xml', data: utf8('<ClinicalDocument>secret</ClinicalDocument>'.repeat(200)) },
  { name: 'apple_health_export/workout-routes/route_2026-11-15_10.30am.gpx', data: utf8('<gpx><trk/></gpx>'.repeat(200)) },
  { name: 'apple_health_export/electrocardiograms/ecg_2026-11-15.csv', data: utf8('Name,Dana\n'.repeat(200)) },
];

async function inflateAll(src: ByteSource, name: string, chunkSize = 4096) {
  const entries = await listZip(src);
  const e = entries.find((x) => x.name === name)!;
  const parts: Uint8Array[] = [];
  await streamEntry(src, e, (c) => parts.push(c.slice()), { chunkSize });
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of parts) out.set(part, (p += part.length) - part.length);
  return out;
}

describe('ZIP reading by random access', () => {
  for (const [label, options] of [
    ['plain', {}],
    ['data descriptors', { dataDescriptor: true }],
    ['zip64', { zip64: true }],
    ['zip64 with data descriptors', { zip64: true, dataDescriptor: true }],
    ['a prefix before the archive', { prefix: 1000 }],
  ] as const) {
    it(`lists entries and streams one, ${label}`, async () => {
      const zip = buildZip([...decoys, { name: 'apple_health_export/export.xml', data: big }], options);
      const { src, reads } = watched(zip);
      const entries = await listZip(src);
      expect(entries.map((e) => e.name)).toEqual([...decoys.map((d) => d.name), 'apple_health_export/export.xml']);
      const target = entries[3];
      expect(target.size).toBe(big.length);
      expect(await inflateAll(src, target.name)).toEqual(big);
      // The decoys' bytes are never read: no read touches the span from a decoy's local header to the next entry's.
      const starts = entries.map((e) => e.localHeaderOffset);
      for (let d = 0; d < 3; d++) {
        const [from, to] = [starts[d], starts[d + 1]];
        for (const [o, l] of reads) expect(o + l <= from || o >= to, `read ${o}+${l} touches ${entries[d].name}`).toBe(true);
      }
    });
  }

  it('reads stored (uncompressed) entries', async () => {
    const zip = buildZip([{ name: 'export.xml', data: big, method: 0 }]);
    expect(await inflateAll(memorySource(zip), 'export.xml')).toEqual(big);
  });

  it('stops when cancelled, and reports progress up to 1', async () => {
    const zip = buildZip([{ name: 'export.xml', data: big }]);
    const src = memorySource(zip);
    const [e] = await listZip(src);
    const shares: number[] = [];
    await streamEntry(src, e, () => {}, { chunkSize: 512, onProgress: (s) => shares.push(s) });
    expect(shares[shares.length - 1]).toBe(1);
    expect(shares.every((s, i) => i === 0 || s >= shares[i - 1])).toBe(true);
    let n = 0;
    await expect(streamEntry(src, e, () => {}, { chunkSize: 16, cancelled: () => ++n > 2 })).rejects.toBeInstanceOf(StreamCancelled);
  });

  it('refuses what is not a ZIP, and a cut-off archive', async () => {
    await expect(listZip(memorySource(utf8('just some text, long enough to look for an end record in it')))).rejects.toBeInstanceOf(ZipError);
    const zip = buildZip([{ name: 'export.xml', data: big }]);
    const cut = zip.subarray(0, Math.floor(zip.length / 2));
    await expect(listZip(memorySource(cut))).rejects.toBeInstanceOf(ZipError);
  });
});
