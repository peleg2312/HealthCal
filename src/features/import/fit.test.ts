import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { decodeFit, fitCrc, readFit } from './fit';
import { ACTIVITY, chain, FILE_ID, FitWriter, fitTime, RECORD, RECORD_NO_TS, SESSION, sessionValues, simpleActivity, T } from './fitEncoder';
import { ImportError } from './types';

const RUN = { start: '2026-11-10T07:30:00Z', sport: 1, subSport: 0, elapsedS: 1900.5, timerS: 1800.25, distanceM: 5012.34, kcal: 412, avgHr: 148, maxHr: 171 };

describe('readFit: headers, endianness, values', () => {
  it('reads a one-session file with a 14-byte header', () => {
    const { workouts, warnings } = readFit(simpleActivity(RUN), 'run.fit');
    expect(warnings).toEqual([]);
    expect(workouts).toHaveLength(1);
    expect(workouts[0]).toMatchObject({
      format: 'fit', fileName: 'run.fit', index: 1, startUtc: '2026-11-10T07:30:00Z', startFromLocalTime: false,
      durationSec: 1800.25, elapsedSec: 1900.5, durationIncludesPauses: false, distanceM: 5012.34, kcal: 412,
      avgHeartRate: 148, maxHeartRate: 171, sport: 'running', subSport: 'generic', device: 'Garmin',
    });
    expect(workouts[0].leg).toBeUndefined();
  });

  it('reads a legacy 12-byte header', () => {
    const w = readFit(simpleActivity(RUN, { headerSize: 12 })).workouts[0];
    expect(w.durationSec).toBe(1800.25);
    expect(w.kcal).toBe(412);
  });

  it('reads big-endian definitions and their data', () => {
    const w = readFit(simpleActivity(RUN, { bigEndian: true })).workouts[0];
    expect(w).toMatchObject({ startUtc: '2026-11-10T07:30:00Z', durationSec: 1800.25, distanceM: 5012.34, kcal: 412, avgHeartRate: 148 });
  });

  it('treats invalid markers as missing, not zero', () => {
    const w = readFit(simpleActivity({ ...RUN, distanceM: null, kcal: null, avgHr: null, maxHr: null, subSport: null })).workouts[0];
    expect(w.distanceM).toBeNull();
    expect(w.kcal).toBeNull();
    expect(w.avgHeartRate).toBeNull();
    expect(w.maxHeartRate).toBeNull();
    expect(w.subSport).toBeNull();
  });

  it('keeps a real zero (indoor ride with distance 0)', () => {
    expect(readFit(simpleActivity({ ...RUN, sport: 2, distanceM: 0 })).workouts[0].distanceM).toBe(0);
  });

  it('falls back to elapsed time when the timer is missing, and says so', () => {
    const r = readFit(simpleActivity({ ...RUN, timerS: null }), 'x.fit');
    expect(r.workouts[0].durationSec).toBe(1900.5);
    expect(r.workouts[0].durationIncludesPauses).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(['fit-no-timer']);
  });

  it('uses the most recent definition when a local type is redefined', () => {
    const w = new FitWriter();
    w.define(0, 0, FILE_ID).data(0, [4, 1, 1, fitTime(RUN.start)]);
    // Local 0 now means session, with a different field layout.
    w.define(0, 18, SESSION).data(0, sessionValues(RUN));
    const r = readFit(w.bytes());
    expect(r.workouts[0].kcal).toBe(412);
  });

  it('skips developer field bytes', () => {
    const w = new FitWriter();
    w.define(0, 0, FILE_ID).data(0, [4, 1, 1, fitTime(RUN.start)]);
    w.define(1, 18, SESSION, { dev: [[0, 3, 0], [1, 2, 0]] }).data(1, sessionValues(RUN));
    w.define(2, 20, RECORD, { dev: [[0, 4, 0]] }).data(2, [fitTime(RUN.start) + 5, 120, 1000]);
    const r = readFit(w.bytes());
    expect(r.warnings).toEqual([]);
    expect(r.workouts[0]).toMatchObject({ kcal: 412, avgHeartRate: 148 });
  });

  it('reads the first element of an array field and ignores a field whose size does not fit its type', () => {
    const fields: [number, number, number][] = [[253, 4, T.uint32], [2, 4, T.uint32], [5, 1, T.enum], [8, 4, T.uint32], [16, 2, T.uint8], [11, 1, T.uint16]];
    const w = new FitWriter();
    w.define(0, 18, fields);
    const start = fitTime(RUN.start);
    w.raw(0x00, ...le32(start + 600), ...le32(start), 1, ...le32(600000), 150, 155, 0x2a);
    const s = readFit(w.bytes()).workouts[0];
    expect(s.avgHeartRate).toBe(150);
    expect(s.kcal).toBeNull();
    expect(s.durationSec).toBe(600);
  });

  it('reads strings (sport profile name) as the title', () => {
    const w = new FitWriter();
    w.define(0, 18, [...SESSION, [110, 16, T.string]]).data(0, [...sessionValues(RUN), 'Morning Run']);
    expect(readFit(w.bytes()).workouts[0].title).toBe('Morning Run');
  });
});

describe('readFit: time', () => {
  it('converts from the FIT epoch (1989-12-31T00:00:00Z)', () => {
    const w = new FitWriter();
    w.define(0, 18, SESSION).data(0, sessionValues({ start: '', elapsedS: 60, sport: 1 }, 0x10000000));
    // 0x10000000 s after the FIT epoch.
    expect(readFit(w.bytes()).workouts[0].startUtc).toBe(new Date((0x10000000 + 631065600) * 1000).toISOString().replace('.000Z', 'Z'));
  });

  describe('device system time', () => {
    const tz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'UTC';
    });
    afterAll(() => {
      process.env.TZ = tz;
    });

    it('rebuilds the start from local_timestamp when the start is below 0x10000000', () => {
      const w = new FitWriter();
      const sysStart = 17_000_000;
      w.define(0, 0, FILE_ID).data(0, [4, 1, 1, null]);
      w.define(1, 18, SESSION).data(1, sessionValues({ start: '', sport: 1, elapsedS: 3600, timerS: 3500, kcal: 700 }, sysStart));
      // Activity ends at system time sysStart + 3610, which was 12:21:03 local wall time.
      const localEnd = fitTime('2012-02-13T12:21:03Z');
      w.define(2, 34, ACTIVITY).data(2, [sysStart + 3610, 3500000, 1, localEnd]);
      const r = readFit(w.bytes(), 'old.fit', { timeZone: 'Europe/Berlin' });
      // Local start 11:20:53 in Berlin (UTC+1 in February) is 10:20:53 UTC.
      expect(r.workouts[0].startUtc).toBe('2012-02-13T10:20:53Z');
      expect(r.workouts[0].startFromLocalTime).toBe(true);
      expect(r.warnings.map((x) => x.code)).toEqual(['fit-system-time']);
      expect(r.warnings[0].message).toBe("This watch's clock was not set when it recorded, so the start time comes from its local time and the time zone you chose. Check the time before importing.");
      // Without a zone the device zone is used (UTC here).
      expect(readFit(w.bytes()).workouts[0].startUtc).toBe('2012-02-13T11:20:53Z');
    });

    it('skips a session with no usable start and explains why', () => {
      const w = new FitWriter();
      w.define(1, 18, SESSION).data(1, sessionValues({ start: '', sport: 1, elapsedS: 600 }, 5000));
      w.define(2, 18, SESSION).data(2, sessionValues({ ...RUN }));
      const r = readFit(w.bytes());
      expect(r.workouts).toHaveLength(1);
      expect(r.warnings.find((x) => x.code === 'fit-no-start')?.message).toBe('1 workout in this file had no usable start time or duration and was skipped.');
    });
  });
});

describe('readFit: compressed timestamps and files without a summary', () => {
  it('decodes compressed-timestamp records, including the 32-second rollover, and builds a session from them', () => {
    const t0 = fitTime('2026-11-10T07:00:00Z'); // t0 & 0x1f is the reference for the first offset
    const w = new FitWriter();
    w.define(0, 0, FILE_ID).data(0, [4, 1, 1, t0]);
    w.define(1, 20, RECORD).data(1, [t0, 100, 0]);
    w.define(2, 20, RECORD_NO_TS);
    // Offsets are the low 5 bits of the new time; a smaller offset than the last means the counter rolled over.
    const base = t0 & 0x1f;
    let t = t0;
    const times: number[] = [];
    for (let k = 0; k < 40; k++) {
      t += 7;
      times.push(t);
      w.compressed(2, t & 0x1f, [120 + (k % 10), (k + 1) * 2000]);
    }
    expect(base).toBeGreaterThanOrEqual(0);
    const decoded = decodeFit(w.bytes());
    const recs = decoded.messages.get(20) ?? [];
    expect(recs.slice(1).map((m) => m.get(253))).toEqual(times);

    const r = readFit(w.bytes(), 'cut.fit');
    expect(r.workouts[0]).toMatchObject({ durationSec: 280, distanceM: 800, kcal: null, startUtc: '2026-11-10T07:00:00Z', durationIncludesPauses: true });
    expect(r.warnings.map((x) => x.code)).toEqual(['fit-no-session']);
  });
});

describe('readFit: multisport', () => {
  it('returns one workout per session, ordered by start, with legs and transitions marked', () => {
    const w = new FitWriter();
    w.define(0, 0, FILE_ID).data(0, [4, 1, 1, fitTime('2026-06-01T07:00:00Z')]);
    w.define(1, 18, SESSION);
    // Written last-leg-first, as summary-first files may be.
    w.data(1, sessionValues({ start: '2026-06-01T08:05:00Z', sport: 1, elapsedS: 1800, kcal: 400 }));
    w.data(1, sessionValues({ start: '2026-06-01T08:00:00Z', sport: 3, elapsedS: 300, kcal: 20 }));
    w.data(1, sessionValues({ start: '2026-06-01T07:00:00Z', sport: 2, elapsedS: 3600, kcal: 800 }));
    const r = readFit(w.bytes());
    expect(r.workouts.map((x) => [x.sport, x.leg, x.transition ?? false])).toEqual([
      ['cycling', { number: 1, of: 3 }, false],
      ['transition', { number: 2, of: 3 }, true],
      ['running', { number: 3, of: 3 }, false],
    ]);
    expect(r.workouts.map((x) => x.index)).toEqual([1, 2, 3]);
  });

  it('reads chained FIT files back to back', () => {
    const bytes = chain(simpleActivity(RUN), simpleActivity({ ...RUN, start: '2026-11-11T07:30:00Z', kcal: 300 }));
    const r = readFit(bytes);
    expect(decodeFit(bytes).files).toBe(2);
    expect(r.workouts.map((x) => x.kcal)).toEqual([412, 300]);
  });
});

describe('readFit: damaged and wrong files', () => {
  it('rejects bytes that are not FIT with a clear error', () => {
    const text = new Uint8Array(Array.from('Activity Type,Date\nRunning,2025-01-01', (c) => c.charCodeAt(0)));
    expect(() => readFit(text, 'a.fit')).toThrow(ImportError);
    try {
      readFit(text, 'a.fit');
    } catch (e) {
      expect((e as ImportError).code).toBe('not-fit');
      expect((e as ImportError).message).toBe('This file is not a FIT file: it does not start with a FIT header.');
      expect((e as ImportError).file).toBe('a.fit');
    }
  });

  it('rejects a FIT course or planned workout', () => {
    const w = new FitWriter();
    w.define(0, 0, FILE_ID).data(0, [6, 1, 1, fitTime(RUN.start)]);
    expect(() => readFit(w.bytes())).toThrow('This FIT file holds a course file, not a recorded workout.');
    const p = new FitWriter();
    p.define(0, 0, FILE_ID).data(0, [5, 1, 1, fitTime(RUN.start)]);
    expect(() => readFit(p.bytes())).toThrow('This FIT file holds a planned workout file, not a recorded workout.');
  });

  it('rejects an activity file with nothing in it', () => {
    const w = new FitWriter();
    w.define(0, 0, FILE_ID).data(0, [4, 1, 1, fitTime(RUN.start)]);
    expect(() => readFit(w.bytes())).toThrow('This FIT file has no workout in it.');
  });

  it('warns about a checksum mismatch but still reads', () => {
    const w = new FitWriter();
    w.define(0, 18, SESSION).data(0, sessionValues(RUN));
    const r = readFit(w.bytes({ corruptCrc: true }));
    expect(r.workouts).toHaveLength(1);
    expect(r.warnings.map((x) => x.code)).toEqual(['fit-crc']);
  });

  it('reads what is there in a file cut short, and says so', () => {
    const w = new FitWriter();
    w.define(0, 18, SESSION).data(0, sessionValues(RUN));
    w.define(1, 20, RECORD);
    for (let k = 0; k < 10; k++) w.data(1, [fitTime(RUN.start) + k, 120, k * 100]);
    const full = w.bytes();
    const cut = full.subarray(0, full.length - 20);
    const r = readFit(cut);
    expect(r.workouts[0].kcal).toBe(412);
    expect(r.warnings.map((x) => x.code)).toEqual(['fit-truncated']);
  });

  it('stops at a data message whose local type was never defined', () => {
    const w = new FitWriter();
    w.define(0, 18, SESSION).data(0, sessionValues(RUN)).raw(0x05, 1, 2, 3);
    const r = readFit(w.bytes());
    expect(r.workouts).toHaveLength(1);
    expect(r.warnings.map((x) => x.code)).toContain('fit-truncated');
  });

  it('computes the FIT CRC', () => {
    // FIT's nibble-table CRC is CRC-16/ARC, whose standard check value for "123456789" is 0xBB3D.
    expect(fitCrc(new Uint8Array(Array.from('123456789', (c) => c.charCodeAt(0))))).toBe(0xbb3d);
    const header = new Uint8Array([0x0e, 0x10, 0x43, 0x08, 0x78, 0x06, 0x09, 0x00, 0x2e, 0x46, 0x49, 0x54]);
    const withCrc = new Uint8Array([...header, fitCrc(header) & 0xff, fitCrc(header) >> 8]);
    // The CRC of data followed by its own CRC is zero.
    expect(fitCrc(withCrc)).toBe(0);
  });
});

function le32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}
