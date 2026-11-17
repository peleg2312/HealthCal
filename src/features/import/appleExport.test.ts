import { describe, expect, it } from 'vitest';

import { DEVICES, exportXml, heartRecord, newWorkout, oldWorkout, sleepRecord, stepRecord } from '@/features/health-sync/exportFixture';

import { createHealthScanner, looksLikeHealthXml, type ScanResult, type SleepRecord, type StepRecord } from './appleExport';
import { utf8 } from './zipBuilder';

const body =
  heartRecord('2026-11-15 09:00:00 +0100') +
  stepRecord({ source: 'Dana’s iPhone', start: '2026-11-15 09:00:00 +0100', end: '2026-11-15 09:10:00 +0100', value: 812 }) +
  oldWorkout({ type: 'HKWorkoutActivityTypeRunning', start: '2026-11-14 07:00:00 +0100', end: '2026-11-14 07:42:00 +0100', kcal: 455, distance: 7.6 }) +
  newWorkout({
    type: 'HKWorkoutActivityTypeCycling',
    start: '2026-11-15 17:30:00 +0100',
    end: '2026-11-15 18:34:00 +0100',
    source: 'R&amp;D &quot;Bike&quot; &#8217;s',
    kcal: 610,
    distance: 24.8,
    distanceType: 'HKQuantityTypeIdentifierDistanceCycling',
    metadata: { HKIndoorWorkout: '0', HKTimeZone: 'Europe/Berlin' },
  }) +
  stepRecord({ source: 'Dana’s Apple Watch', start: '2026-10-01 09:00:00 +0100', end: '2026-10-01 09:10:00 +0100', value: 99 }) +
  stepRecord({ source: 'Zoë’s Apple Watch 🏃', start: '2026-11-15 09:02:00 +0100', end: '2026-11-15 09:08:00 +0100', value: 700 });

const xml = utf8(exportXml(body));

function scan(chunks: Uint8Array[], from = '2026-11-01'): { result: ScanResult; steps: StepRecord[] } {
  const steps: StepRecord[] = [];
  const s = createHealthScanner({ stepsFromDay: from, onStep: (r) => steps.push(r) });
  for (const c of chunks) s.push(c);
  return { result: s.finish(), steps };
}

describe('Health export scanner', () => {
  const whole = scan([xml]);

  it('keeps workouts, their direct metadata and statistics, and nothing else', () => {
    const { result } = whole;
    expect(result.isHealthExport).toBe(true);
    expect(result.exportDate).toBe('2026-11-16 08:30:00 +0100');
    expect(result.workouts).toHaveLength(2);
    const [old, cur] = result.workouts;
    expect(old.attrs.workoutActivityType).toBe('HKWorkoutActivityTypeRunning');
    expect(old.attrs.totalEnergyBurned).toBe('455');
    expect(old.metadata).toEqual({ HKTimeZone: 'Europe/Berlin' });
    // The route's own MetadataEntry and the activity's are not the workout's.
    expect(cur.metadata).toEqual({ HKIndoorWorkout: '0', HKTimeZone: 'Europe/Berlin' });
    expect(cur.stats.filter((s) => !s.nested).map((s) => s.type)).toEqual([
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierBasalEnergyBurned',
      'HKQuantityTypeIdentifierDistanceCycling',
      'HKQuantityTypeIdentifierHeartRate',
    ]);
    expect(cur.stats.find((s) => s.nested)).toMatchObject({ type: 'HKQuantityTypeIdentifierActiveEnergyBurned', sum: 610, nested: true });
    expect(cur.stats.find((s) => s.type.endsWith('HeartRate'))?.sum).toBeNull();
    // Everything that is not a step count is counted, never kept.
    expect(result.counts).toEqual({ records: 5, stepRecords: 3, sleepRecords: 1 });
    expect(JSON.stringify(result)).not.toMatch(/HeartRateMotionContext|DateOfBirth|1990-04-02|Sleep/);
  });

  it('decodes entities and multi-byte characters in attribute values', () => {
    expect(whole.result.workouts[1].attrs.sourceName).toBe('R&D "Bike" ’s');
    expect(whole.result.workouts[1].attrs.device).toContain('<<HKDevice: 0x283a1c0f0>, name:Apple Watch');
    expect(whole.steps.map((s) => s.sourceName)).toEqual(['Dana’s iPhone', 'Zoë’s Apple Watch 🏃']);
  });

  it('skips step records before the window without decoding them', () => {
    expect(whole.steps.map((s) => s.value)).toEqual(['812', '700']);
    expect(scan([xml], '2026-01-01').steps).toHaveLength(3);
  });

  it('gives the same result whatever the chunk boundaries (every split point, then one byte at a time)', () => {
    const expected = JSON.stringify(whole);
    for (let cut = 1; cut < xml.length; cut++) {
      const got = scan([xml.subarray(0, cut), xml.subarray(cut)]);
      if (JSON.stringify(got) !== expected) throw new Error(`differs when split at byte ${cut}`);
    }
    const bytes: Uint8Array[] = [];
    for (let i = 0; i < xml.length; i++) bytes.push(xml.subarray(i, i + 1));
    expect(JSON.stringify(scan(bytes))).toBe(expected);
    // Three-way splits around a multi-byte character (’ is 3 bytes, 🏃 is 4).
    const at = xml.indexOf(0xf0);
    for (let a = at - 3; a <= at + 4; a++) for (let b = a + 1; b <= at + 5; b++) expect(JSON.stringify(scan([xml.subarray(0, a), xml.subarray(a, b), xml.subarray(b)]))).toBe(expected);
  });

  it('respects a > inside a quoted value in a workout, and comments that hold tags', () => {
    const tricky = utf8(
      exportXml(
        `<!-- <Workout workoutActivityType="HKWorkoutActivityTypeYoga"/> -->\n <Workout workoutActivityType="HKWorkoutActivityTypeWalking" sourceName="a > b" startDate="2026-11-15 10:00:00 +0100" endDate="2026-11-15 10:30:00 +0100">\n  <WorkoutEvent note="x > y"/>\n  <MetadataEntry key="HKIndoorWorkout" value="1"/>\n </Workout>\n`,
      ),
    );
    const r = scan([tricky]).result;
    expect(r.workouts).toHaveLength(1);
    expect(r.workouts[0].attrs.sourceName).toBe('a > b');
    expect(r.workouts[0].metadata).toEqual({ HKIndoorWorkout: '1' });
  });

  it('tells a Health export from other XML', () => {
    expect(looksLikeHealthXml(xml)).toBe(true);
    expect(looksLikeHealthXml(utf8('<?xml version="1.0"?><gpx></gpx>'))).toBe(false);
    expect(scan([utf8('<?xml version="1.0"?><TrainingCenterDatabase/>')]).result.isHealthExport).toBe(false);
  });
});

describe('Health export scanner: sleep', () => {
  const sleepBody =
    heartRecord('2026-11-14 22:00:00 +0100') +
    // Before the window: counted, never decoded.
    sleepRecord({ source: 'Dana’s Apple Watch', start: '2026-10-01 23:00:00 +0100', end: '2026-10-02 06:00:00 +0100', value: 'AsleepCore' }) +
    // The watch writes HKTimeZone as a child: the record ends at its own </Record>.
    sleepRecord({ source: 'Dana’s Apple Watch', start: '2026-11-14 23:10:00 +0100', end: '2026-11-15 01:00:00 +0100', value: 'AsleepCore', timeZone: 'Europe/Berlin' }) +
    heartRecord('2026-11-15 01:00:00 +0100') +
    sleepRecord({ source: 'Dana’s Apple Watch', start: '2026-11-15 01:00:00 +0100', end: '2026-11-15 02:30:00 +0100', value: 'AsleepDeep', timeZone: 'Europe/Berlin' }) +
    sleepRecord({ source: 'Dana’s iPhone', device: DEVICES.phone, start: '2026-11-14 22:45:00 +0100', end: '2026-11-15 07:00:00 +0100', value: 'InBed' }) +
    sleepRecord({ source: 'Sleep &amp; Co', device: '', start: '2026-11-15 13:00:00 +0100', end: '2026-11-15 13:40:00 +0100', value: 'Asleep' }) +
    stepRecord({ source: 'Dana’s iPhone', start: '2026-11-15 09:00:00 +0100', end: '2026-11-15 09:10:00 +0100', value: 812 });
  const sleepXml = utf8(exportXml(sleepBody));

  function scanSleep(chunks: Uint8Array[], from = '2026-11-01') {
    const nights: SleepRecord[] = [];
    const steps: StepRecord[] = [];
    const s = createHealthScanner({ stepsFromDay: from, onStep: (r) => steps.push(r), sleepFromDay: from, onSleep: (r) => nights.push(r) });
    for (const c of chunks) s.push(c);
    return { result: s.finish(), sleep: nights, steps };
  }
  const whole = scanSleep([sleepXml]);

  it('keeps sleep records of the window with their time zone, and nothing else of them', () => {
    // The fixture's own record of the night before the export is the last one.
    expect(whole.sleep.map((r) => r.value.replace('HKCategoryValueSleepAnalysis', ''))).toEqual(['AsleepCore', 'AsleepDeep', 'InBed', 'Asleep', 'AsleepCore']);
    expect(whole.sleep[0]).toEqual({
      sourceName: 'Dana’s Apple Watch',
      device: expect.stringContaining('model:Watch'),
      startDate: '2026-11-14 23:10:00 +0100',
      endDate: '2026-11-15 01:00:00 +0100',
      value: 'HKCategoryValueSleepAnalysisAsleepCore',
      timeZone: 'Europe/Berlin',
    });
    expect(whole.sleep[2].timeZone).toBeNull();
    expect(whole.sleep[3]).toMatchObject({ sourceName: 'Sleep & Co', device: '' });
    expect(whole.result.counts).toEqual({ records: 9, stepRecords: 1, sleepRecords: 6 });
    // A kept record's children never leak into what follows: the step after them is still read.
    expect(whole.steps).toHaveLength(1);
    expect(JSON.stringify(whole.sleep)).not.toMatch(/HeartRate|SyncVersion|2026-10-0/);
  });

  it('skips sleep before its own window, and reads none without onSleep', () => {
    expect(scanSleep([sleepXml], '2026-01-01').sleep).toHaveLength(6);
    expect(scanSleep([sleepXml], '2026-11-16').sleep).toHaveLength(0);
    const plain = createHealthScanner({ stepsFromDay: '2026-11-01', onStep: () => {} });
    plain.push(sleepXml);
    expect(plain.finish().counts.sleepRecords).toBe(6);
  });

  it('gives the same sleep records whatever the chunk boundaries', () => {
    const expected = JSON.stringify(whole);
    for (let cut = 1; cut < sleepXml.length; cut++) {
      const got = scanSleep([sleepXml.subarray(0, cut), sleepXml.subarray(cut)]);
      if (JSON.stringify(got) !== expected) throw new Error(`differs when split at byte ${cut}`);
    }
    const bytes: Uint8Array[] = [];
    for (let i = 0; i < sleepXml.length; i++) bytes.push(sleepXml.subarray(i, i + 1));
    expect(JSON.stringify(scanSleep(bytes))).toBe(expected);
  });

  it('hands on no half-read sleep record from a file cut inside it', () => {
    // Inside the first kept record's metadata: the record is open, its </Record> never comes.
    const at = Buffer.from(sleepXml).indexOf('HKTimeZone') + 4;
    const r = scanSleep([sleepXml.subarray(0, at)]);
    expect(r.sleep).toHaveLength(0);
    expect(r.result.complete).toBe(false);
  });
});
