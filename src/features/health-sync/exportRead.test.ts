import { describe, expect, it } from 'vitest';

import { memorySource, StreamCancelled, type ByteSource } from '@/features/import/zip';
import { buildZip, utf8 } from '@/features/import/zipBuilder';

import { DEVICES, exportXml, newWorkout, oldWorkout, sleepRecord, stepRecord } from './exportFixture';
import { findHealthExport, neverRead, readHealthExport } from './exportRead';
import { fileStepsNote, mergeFileSteps, shownSteps, zoneClock, type FileSteps } from './steps';

const clock = zoneClock('Europe/Amsterdam');
const now = Date.parse('2026-11-16T09:00:00Z');

const xml = utf8(
  exportXml(
    oldWorkout({ type: 'HKWorkoutActivityTypeRunning', start: '2026-11-14 07:00:00 +0100', end: '2026-11-14 07:42:00 +0100', kcal: 455, distance: 7.6 }) +
      newWorkout({ type: 'HKWorkoutActivityTypeCycling', start: '2026-11-15 17:30:00 +0100', end: '2026-11-15 18:34:00 +0100', kcal: 610, distance: 24.8 }) +
      stepRecord({ source: 'Dana’s iPhone', start: '2026-11-15 09:00:00 +0100', end: '2026-11-15 09:30:00 +0100', value: 3000 }) +
      stepRecord({ source: 'Dana’s Apple Watch', start: '2026-11-15 09:00:00 +0100', end: '2026-11-15 09:30:00 +0100', value: 3200 }) +
      stepRecord({ source: 'Dana’s iPhone', start: '2026-11-16 08:00:00 +0100', end: '2026-11-16 08:20:00 +0100', value: 900 }) +
      // Before the 35-day window.
      stepRecord({ source: 'Dana’s iPhone', start: '2026-09-01 09:00:00 +0100', end: '2026-09-01 09:30:00 +0100', value: 5000 }),
  ),
);

/** Counts the bytes read, and throws when a decoy's range is touched. */
function guarded(zip: Uint8Array, forbidden: [number, number][]) {
  let read = 0;
  const src: ByteSource = {
    size: zip.length,
    read: async (o, l) => {
      for (const [a, b] of forbidden) if (o < b && o + l > a) throw new Error(`read a decoy at ${o}`);
      read += l;
      return zip.subarray(o, Math.min(zip.length, o + l));
    },
  };
  return { src, read: () => read };
}

const decoys = [
  { name: 'apple_health_export/export_cda.xml', data: utf8('<?xml version="1.0"?><ClinicalDocument><HealthData/></ClinicalDocument>'.repeat(50)) },
  { name: 'apple_health_export/workout-routes/route_2026-11-15_5.30pm.gpx', data: utf8('<gpx><trk><name>Route</name></trk></gpx>'.repeat(50)) },
  { name: 'apple_health_export/electrocardiograms/ecg_2026-11-15.csv', data: utf8('Name,Dana\nDate of Birth,1990-04-02\n'.repeat(50)) },
];

describe('reading a Health export from a picked file', () => {
  for (const [label, options, folder] of [
    ['as the Health app writes it (data descriptors)', { dataDescriptor: true }, 'apple_health_export'],
    ['in zip64 form', { zip64: true, dataDescriptor: true }, 'apple_health_export'],
    ['with a localised folder name', {}, 'Exportación de Salud'],
  ] as const) {
    it(`finds export.xml and reads only it, ${label}`, async () => {
      const zip = buildZip([decoys[0], { name: `${folder}/export.xml`, data: xml }, decoys[1], decoys[2]], options);
      // Decoy ranges: worked out from the archive itself.
      const { listZip } = await import('@/features/import/zip');
      const entries = await listZip(memorySource(zip));
      // A decoy's compressed data (after its 30-byte local header and name; the builders write no local extra for these).
      const forbidden: [number, number][] = [0, 2, 3].map((i) => {
        const from = entries[i].localHeaderOffset + 30 + utf8(entries[i].name).length + ('zip64' in options ? 20 : 0);
        return [from, from + entries[i].compressedSize];
      });
      const { src } = guarded(zip, forbidden);
      const found = await findHealthExport(src);
      expect(found).toMatchObject({ kind: 'zip', entry: { name: `${folder}/export.xml` } });
      const shares: number[] = [];
      const read = await readHealthExport(src, found!, { now, clock, chunkSize: 97, onProgress: (s) => shares.push(s) });
      expect(read.workouts).toHaveLength(2);
      expect(read.asOf).toBe('2026-11-16T07:30:00.000Z');
      // The phone has more steps in the window (3,900 to the watch's 3,200), so it leads: 15 Nov is its 3,000, the watch's walk is not added.
      expect(read.steps).toEqual({ days: { '2026-11-15': 3000, '2026-11-16': 900 }, asOf: '2026-11-16T07:30:00.000Z', asOfDay: '2026-11-16', fromDay: '2026-10-13' });
      expect(shares[shares.length - 1]).toBe(1);
      // The fixture's one night (core sleep from 23:00 to 06:30, from the watch by its name's kind).
      expect(read.nights).toEqual([expect.objectContaining({ date: '2026-11-15', hours: 7.5, store: 'file', origin: 'com.apple.health.watch' })]);
      // No route became a workout, nothing clinical was looked at.
      expect(JSON.stringify(read)).not.toMatch(/Route|Clinical|1990/);
    });
  }

  it('finds the export by its content when it is not called export.xml', async () => {
    const zip = buildZip([decoys[0], { name: 'Health/Export.XML.xml', data: xml }]);
    expect(await findHealthExport(memorySource(zip))).toMatchObject({ kind: 'zip', entry: { name: 'Health/Export.XML.xml' } });
  });

  it('reads a bare export.xml straight from the file', async () => {
    const src = memorySource(xml);
    const found = await findHealthExport(src);
    expect(found).toEqual({ kind: 'xml' });
    const read = await readHealthExport(src, found!, { now, clock, xmlChunkSize: 1000 });
    expect(read.workouts).toHaveLength(2);
  });

  it('leaves Garmin files and Garmin ZIPs to the file import', async () => {
    expect(await findHealthExport(memorySource(utf8('<?xml version="1.0"?><TrainingCenterDatabase/>')))).toBeNull();
    expect(await findHealthExport(memorySource(buildZip([{ name: 'run.fit', data: new Uint8Array([14, 16, 1, 2]) }])))).toBeNull();
    expect(await findHealthExport(memorySource(buildZip([decoys[0], decoys[1]])))).toBeNull();
  });

  it('never opens the clinical file, the routes or the electrocardiograms', () => {
    expect(neverRead('apple_health_export/export_cda.xml')).toBe(true);
    expect(neverRead('apple_health_export/workout-routes/route.gpx')).toBe(true);
    expect(neverRead('apple_health_export/workout-routes/x.xml')).toBe(true);
    expect(neverRead('apple_health_export/electrocardiograms/ecg.csv')).toBe(true);
    expect(neverRead('apple_health_export/export.xml')).toBe(false);
  });

  it('reads the nights of the window only, with no name kept', async () => {
    const night = (prev: string, day: string) =>
      sleepRecord({ source: 'Dana’s Apple Watch', start: `${prev} 23:30:00 +0100`, end: `${day} 03:00:00 +0100`, value: 'AsleepDeep', timeZone: 'Europe/Amsterdam' }) +
      sleepRecord({ source: 'Dana’s Apple Watch', start: `${day} 03:00:00 +0100`, end: `${day} 06:30:00 +0100`, value: 'AsleepREM', timeZone: 'Europe/Amsterdam' }) +
      sleepRecord({ source: 'Dana’s iPhone', device: DEVICES.phone, start: `${prev} 23:00:00 +0100`, end: `${day} 07:00:00 +0100`, value: 'InBed' });
    // 20 Oct is the window's first wake day (28 days to 16 Nov); 16 Oct is before it, 16 Nov is still going on when the export is made (08:30 +0100).
    const body = night('2026-10-15', '2026-10-16') + night('2026-10-19', '2026-10-20') + night('2026-11-11', '2026-11-12') + sleepRecord({ source: 'Dana’s Apple Watch', start: '2026-11-16 01:00:00 +0100', end: '2026-11-16 08:25:00 +0100', value: 'AsleepCore' });
    const src = memorySource(utf8(exportXml(body)));
    const read = await readHealthExport(src, (await findHealthExport(src))!, { now, clock, xmlChunkSize: 333 });
    expect(read.nights.map((n) => [n.date, n.hours, n.origin])).toEqual([
      ['2026-10-20', 7, 'com.apple.health.watch'],
      ['2026-11-12', 7, 'com.apple.health.watch'],
      ['2026-11-15', 7.5, 'com.apple.health.watch'],
    ]);
    expect(read.counts).toMatchObject({ sleepRecords: 11 });
    expect(JSON.stringify(read.nights)).not.toMatch(/Dana|HKDevice/);
  });

  it('can be cancelled between chunks', async () => {
    const zip = buildZip([{ name: 'apple_health_export/export.xml', data: xml }]);
    const src = memorySource(zip);
    const found = await findHealthExport(src);
    let n = 0;
    await expect(readHealthExport(src, found!, { now, clock, chunkSize: 50, cancelled: () => ++n > 2 })).rejects.toBeInstanceOf(StreamCancelled);
  });
});

describe('steps from a file, kept on the phone', () => {
  const first: FileSteps & { fromDay: string } = { days: { '2026-11-10': 5000, '2026-11-11': 6000, '2026-11-12': 300 }, asOf: '2026-11-12T08:00:00Z', asOfDay: '2026-11-12', fromDay: '2026-10-09' };

  it('a later import replaces the days it covers and keeps older ones', () => {
    const kept = mergeFileSteps(null, first, '2026-11-12');
    const later = mergeFileSteps(kept, { days: { '2026-11-12': 9000, '2026-11-14': 7000 }, asOf: '2026-11-14T20:00:00Z', asOfDay: '2026-11-14', fromDay: '2026-11-11' }, '2026-11-14');
    // 11 Nov was covered by the later file and has no steps in it: gone. 10 Nov is older than it: kept.
    expect(later).toEqual({ days: { '2026-11-10': 5000, '2026-11-12': 9000, '2026-11-14': 7000 }, asOf: '2026-11-14T20:00:00Z', asOfDay: '2026-11-14' });
  });

  it('a synced day wins over the file’s; the file’s cut-off last day is left out once it is over', () => {
    const file: FileSteps = { days: { '2026-11-10': 5000, '2026-11-11': 6000, '2026-11-12': 300 }, asOf: '2026-11-12T08:00:00Z', asOfDay: '2026-11-12' };
    expect(shownSteps({ '2026-11-11': 6400, '2026-11-13': 8000 }, file, '2026-11-13')).toEqual({ days: { '2026-11-10': 5000, '2026-11-11': 6400, '2026-11-13': 8000 }, fromFile: ['2026-11-10'], asOf: '2026-11-12T08:00:00Z' });
    // Today is the export's day: it is shown, as of the export.
    expect(shownSteps(null, file, '2026-11-12').days['2026-11-12']).toBe(300);
    expect(shownSteps(null, null, '2026-11-12')).toEqual({ days: {}, fromFile: [], asOf: null });
    expect(fileStepsNote('2026-11-16')).toBe('From your Health export, Nov 16');
  });
});
