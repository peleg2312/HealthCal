/**
 * Faults found in review of the Health export import (each test states the right behaviour and fails until it holds).
 */
import { describe, expect, it } from 'vitest';

import { createHealthScanner } from '@/features/import/appleExport';
import { memorySource, type ByteSource } from '@/features/import/zip';
import { buildZip, utf8 } from '@/features/import/zipBuilder';

import { exportXml, newWorkout, stepRecord } from './exportFixture';
import { findHealthExport, HealthExportIncomplete, readHealthExport } from './exportRead';
import { mergeFileSteps, shownSteps, zoneClock } from './steps';

/** A source that counts the bytes read from it. */
function counted(bytes: Uint8Array): ByteSource & { readBytes: number } {
  const src = memorySource(bytes);
  const out = {
    size: src.size,
    readBytes: 0,
    read: async (offset: number, length: number) => {
      const b = await src.read(offset, length);
      out.readBytes += b.length;
      return b;
    },
  };
  return out;
}

describe('review: steps from export files', () => {
  it('an older export imported after a newer one does not replace a full day with its own cut-off day', () => {
    // The newer export (Nov 16, 08:30) has Nov 10 as a full day.
    const newer = mergeFileSteps(null, { days: { '2026-11-10': 9000, '2026-11-15': 8000 }, asOf: '2026-11-16T07:30:00.000Z', asOfDay: '2026-11-16', fromDay: '2026-10-13' }, '2026-11-16');
    // An older export made on Nov 10 at 09:00 holds only that morning of Nov 10.
    const after = mergeFileSteps(newer, { days: { '2026-11-09': 7000, '2026-11-10': 1200 }, asOf: '2026-11-10T08:00:00.000Z', asOfDay: '2026-11-10', fromDay: '2026-10-13' }, '2026-11-16');
    expect(shownSteps(null, after, '2026-11-16').days['2026-11-10']).toBe(9000);
  });

  it('a cut-off export.xml (no closing </HealthData>) is refused, not read as complete', async () => {
    let body = '';
    for (let d = 1; d <= 15; d++) {
      const dd = String(d).padStart(2, '0');
      body += stepRecord({ source: 'iPhone', start: `2026-11-${dd} 09:00:00 +0100`, end: `2026-11-${dd} 09:30:00 +0100`, value: 1000 + d });
    }
    const full = utf8(exportXml(body));
    const cut = memorySource(full.subarray(0, Math.floor(full.length * 0.6)));
    const found = await findHealthExport(cut);
    await expect(readHealthExport(cut, found!, { now: Date.parse('2026-11-16T09:00:00Z'), clock: zoneClock('Europe/Amsterdam') })).rejects.toBeInstanceOf(HealthExportIncomplete);
    // The whole file is read as before.
    const whole = memorySource(full);
    await expect(readHealthExport(whole, (await findHealthExport(whole))!, { now: Date.parse('2026-11-16T09:00:00Z'), clock: zoneClock('Europe/Amsterdam') })).resolves.toMatchObject({ steps: { asOfDay: '2026-11-16' } });
  });

  it('a workout cut before its statistics is never handed on as finished', () => {
    const xml = utf8(exportXml(newWorkout({ type: 'HKWorkoutActivityTypeRunning', start: '2026-11-15 10:00:00 +0100', end: '2026-11-15 10:30:00 +0100', kcal: 610 })));
    const at = new TextDecoder().decode(xml).indexOf('<WorkoutActivity');
    const scanner = createHealthScanner();
    scanner.push(xml.subarray(0, at));
    const r = scanner.finish();
    expect(r.complete).toBe(false);
    expect(r.workouts).toEqual([]);
    const whole = createHealthScanner();
    whole.push(xml);
    expect(whole.finish()).toMatchObject({ complete: true, workouts: [{ stats: expect.arrayContaining([expect.objectContaining({ sum: 610 })]) }] });
  });

  it('an older export never puts its cut-off day in, and only fills days the newer one has no steps for', () => {
    const newer = mergeFileSteps(null, { days: { '2026-11-12': 9000, '2026-11-15': 8000, '2026-11-16': 900 }, asOf: '2026-11-16T07:30:00.000Z', asOfDay: '2026-11-16', fromDay: '2026-10-13' }, '2026-11-16');
    const after = mergeFileSteps(newer, { days: { '2026-10-20': 6000, '2026-11-12': 4000, '2026-11-13': 3000 }, asOf: '2026-11-13T08:00:00.000Z', asOfDay: '2026-11-13', fromDay: '2026-10-11' }, '2026-11-16');
    // 20 Oct is new and whole: in. 12 Nov: the newer file's. 13 Nov was the older file's cut-off morning: out.
    expect(after).toEqual({ days: { '2026-10-20': 6000, '2026-11-12': 9000, '2026-11-15': 8000, '2026-11-16': 900 }, asOf: '2026-11-16T07:30:00.000Z', asOfDay: '2026-11-16' });
  });

  it('a newer export drops the kept file’s cut-off day even where it does not cover it', () => {
    const kept = { days: { '2026-10-20': 7000, '2026-10-22': 400 }, asOf: '2026-10-22T07:00:00.000Z', asOfDay: '2026-10-22' };
    // The newer file starts later (nothing older in it, as a phone reset would leave).
    const after = mergeFileSteps(kept, { days: { '2026-11-15': 8000 }, asOf: '2026-11-16T07:30:00.000Z', asOfDay: '2026-11-16', fromDay: '2026-11-01' }, '2026-11-16');
    // 20 Oct was a whole day of the kept file: it stays. 22 Oct was its cut-off morning, no longer named as the file's last day: it goes.
    expect(after.days).toEqual({ '2026-10-20': 7000, '2026-11-15': 8000 });
  });
});

describe('review: a ZIP cut short', () => {
  const xml = utf8(exportXml(stepRecord({ source: 'iPhone', start: '2026-11-15 09:00:00 +0100', end: '2026-11-15 09:30:00 +0100', value: 1000 })));
  const big = new Uint8Array(400_000).map((_, i) => (i * 7919) % 251);

  it('is found from its first entry and its end, without reading the rest', async () => {
    const zip = buildZip([{ name: 'apple_health_export/export.xml', data: xml }, { name: 'apple_health_export/workout-routes/route.gpx', data: big, method: 0 }], { dataDescriptor: true });
    const src = counted(zip.subarray(0, Math.floor(zip.length / 2)));
    expect(await findHealthExport(src)).toEqual({ kind: 'cut-zip', apple: true });
    // The end (a tail and the 64 KB a comment could take) and the first header: far less than the file.
    expect(src.readBytes).toBeLessThan(70_000);
    expect(src.size).toBeGreaterThan(190_000);
    await expect(readHealthExport(src, { kind: 'cut-zip', apple: true }, { now: Date.parse('2026-11-16T09:00:00Z') })).rejects.toThrow();
  });

  it('a Garmin ZIP cut short is cut-zip too, not a Health export', async () => {
    const zip = buildZip([{ name: 'activity_123.fit', data: big, method: 0 }], { dataDescriptor: true });
    expect(await findHealthExport(memorySource(zip.subarray(0, 300_000)))).toEqual({ kind: 'cut-zip', apple: false });
    // A whole Garmin ZIP is still not an export: it is read as before.
    expect(await findHealthExport(memorySource(zip))).toBeNull();
  });
});
