import { gzipSync, strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { simpleActivity } from './fitEncoder';
import { detectFormat, readImportFile } from './read';
import { decodeText } from './text';

const fit = simpleActivity({ start: '2026-11-10T07:30:00Z', sport: 1, elapsedS: 1800, kcal: 400, distanceM: 5000 });
const csv = strToU8('Activity Type,Date,Title,Distance,Calories,Time\nRunning,2026-11-09 08:00:00,"Run","5.00","350","00:28:00"\n');
const tcx = strToU8(
  '<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Biking"><Id>2026-11-08T07:00:00Z</Id><Lap StartTime="2026-11-08T07:00:00Z"><TotalTimeSeconds>3600</TotalTimeSeconds><DistanceMeters>30000</DistanceMeters><Calories>700</Calories></Lap></Activity></Activities></TrainingCenterDatabase>',
);
const gpx = strToU8(
  '<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><type>walking</type><trkseg><trkpt lat="52" lon="5"><time>2026-11-07T07:00:00Z</time></trkpt><trkpt lat="52.01" lon="5"><time>2026-11-07T07:15:00Z</time></trkpt></trkseg></trk></gpx>',
);
const csvOptions = { distanceUnit: 'km', timeZone: 'UTC' } as const;

describe('detectFormat', () => {
  it('recognises each format from its bytes, whatever the name', () => {
    expect(detectFormat(fit, 'download')).toBe('fit');
    expect(detectFormat(tcx, 'x.txt')).toBe('tcx');
    expect(detectFormat(gpx, 'x.xml')).toBe('gpx');
    expect(detectFormat(csv, 'x.txt')).toBe('csv');
    expect(detectFormat(zipSync({ 'a.fit': fit }), 'export')).toBe('zip');
    expect(detectFormat(gzipSync(fit), 'a.fit.gz')).toBe('gzip');
  });

  it('falls back to the name when the content says nothing, and to null for neither', () => {
    expect(detectFormat(strToU8('hello'), 'run.fit')).toBe('fit');
    expect(detectFormat(strToU8('Name,Amount\n'), 'list.csv')).toBe('csv');
    expect(detectFormat(strToU8('hello'), 'notes.txt')).toBeNull();
    expect(detectFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]), 'photo.png')).toBeNull();
  });
});

describe('readImportFile', () => {
  it('reads every format into one shape', () => {
    for (const [bytes, name, format] of [[fit, 'a.fit', 'fit'], [tcx, 'a.tcx', 'tcx'], [gpx, 'a.gpx', 'gpx'], [csv, 'a.csv', 'csv']] as const) {
      const b = readImportFile(bytes, name, { csv: csvOptions });
      expect(b.errors).toEqual([]);
      expect(b.workouts).toHaveLength(1);
      expect(b.workouts[0].format).toBe(format);
      expect(b.files).toEqual([{ file: name, format }]);
    }
  });

  it('opens ZIPs (nested too), ignores other files and reports bad ones without losing the rest', () => {
    const inner = zipSync({ 'ride.tcx': tcx });
    const zip = zipSync({
      'activity_1.fit': fit,
      'list/Activities.csv': csv,
      'walk.gpx': gpx,
      'nested/UploadedFiles_Part1.zip': inner,
      'broken.fit': strToU8('not really'),
      'summary.json': strToU8('{}'),
      'readme.txt': strToU8('hi'),
      '__MACOSX/._activity_1.fit': strToU8('junk'),
    });
    const b = readImportFile(zip, 'export.zip', { csv: csvOptions });
    expect(b.workouts.map((w) => [w.format, w.fileName]).sort()).toEqual([
      ['csv', 'export.zip/list/Activities.csv'],
      ['fit', 'export.zip/activity_1.fit'],
      ['gpx', 'export.zip/walk.gpx'],
      ['tcx', 'export.zip/nested/UploadedFiles_Part1.zip/ride.tcx'],
    ]);
    expect(b.errors).toEqual([{ file: 'export.zip/broken.fit', code: 'not-fit', message: 'This file is not a FIT file: it does not start with a FIT header.' }]);
    expect(b.warnings.find((w) => w.code === 'zip-skipped-files')?.message).toBe('3 other files in this ZIP are not a workout and were left out.');
  });

  it('asks for CSV options rather than guessing', () => {
    const b = readImportFile(zipSync({ 'Activities.csv': csv, 'a.fit': fit }), 'x.zip');
    expect(b.workouts).toHaveLength(1);
    expect(b.errors).toEqual([{ file: 'x.zip/Activities.csv', code: 'csv-options-needed', message: 'Choose whether the distances in this file are in kilometres or miles.' }]);
  });

  it('opens gzip files (as other services export FIT)', () => {
    const b = readImportFile(gzipSync(fit), 'a.fit.gz');
    expect(b.workouts[0].fileName).toBe('a.fit');
  });

  it('turns every kind of bad file into an error, never an exception or a silent empty result', () => {
    const cases: [Uint8Array, string, string][] = [
      [new Uint8Array(), 'a.fit', 'This file is empty.'],
      [strToU8('hello'), 'notes.txt', 'This file is not one HealthCal can import. Use a FIT, TCX, GPX or activities CSV file exported from Garmin Connect, or a ZIP of them.'],
      [strToU8('<gpx'), 'a.gpx', 'This file is not a readable GPX file (the XML inside is broken).'],
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 'a.zip', 'This ZIP file is damaged and cannot be opened.'],
      [zipSync({ 'a.json': strToU8('{}') }), 'b.zip', 'This ZIP has no FIT, TCX, GPX or CSV files in it.'],
      [new Uint8Array([0x1f, 0x8b, 0x08, 0, 0]), 'c.gz', 'This compressed file is damaged and cannot be opened.'],
      [fit.subarray(0, 11), 'short.fit', 'This file is not a FIT file: it does not start with a FIT header.'],
    ];
    for (const [bytes, name, message] of cases) {
      const b = readImportFile(bytes, name, { csv: csvOptions });
      expect(b.workouts).toEqual([]);
      expect(b.errors.map((e) => e.message)).toEqual([message]);
    }
  });
});

describe('decodeText', () => {
  it('reads UTF-8 with a BOM, UTF-16 and Windows-1252', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0x98, 0x20, 0x48, 0x52]))).toBe('Ø HR');
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xe9, 0x00]))).toBe('Aé');
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x41]))).toBe('A');
    expect(decodeText(new Uint8Array([0x44, 0xfc, 0x72, 0x80]))).toBe('Dür€');
  });
});
