import { describe, expect, it } from 'vitest';

import { exportXml, heartRecord, newWorkout, oldWorkout, stepRecord } from '@/features/health-sync/exportFixture';

import { createHealthScanner, looksLikeHealthXml, type ScanResult, type StepRecord } from './appleExport';
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
    expect(result.counts).toEqual({ records: 5, stepRecords: 3 });
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
