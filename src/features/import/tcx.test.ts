import { describe, expect, it } from 'vitest';

import { readTcx } from './tcx';

const lap = (start: string, secs: number, metres: number, kcal: number, hr?: number, max?: number) => `
      <Lap StartTime="${start}">
        <TotalTimeSeconds>${secs}</TotalTimeSeconds>
        <DistanceMeters>${metres}</DistanceMeters>
        <Calories>${kcal}</Calories>
        ${hr ? `<AverageHeartRateBpm><Value>${hr}</Value></AverageHeartRateBpm>` : ''}
        ${max ? `<MaximumHeartRateBpm><Value>${max}</Value></MaximumHeartRateBpm>` : ''}
        <Track><Trackpoint><Time>${start}</Time><HeartRateBpm><Value>99</Value></HeartRateBpm></Trackpoint></Track>
      </Lap>`;

const tcx = (body: string, sport = 'Running', rootAttrs = 'xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"') => `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase ${rootAttrs} xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities>
    <Activity Sport="${sport}">
      <Id>2024-09-19T11:05:15.000Z</Id>
      ${body}
      <Notes>Lunch run &amp; coffee</Notes>
      <Creator><Name>Forerunner 265S</Name></Creator>
    </Activity>
  </Activities>
  <Author><Name>Connect Api</Name></Author>
</TrainingCenterDatabase>`;

describe('readTcx', () => {
  it('sums laps for timer duration, distance and calories and weights heart rate by lap time', () => {
    const text = tcx(lap('2024-09-19T11:05:15.000Z', 600, 1600.5, 100, 140, 150) + lap('2024-09-19T11:15:20.000Z', 300.25, 800, 55.4, 160, 175));
    const { workouts, warnings } = readTcx(text, 'run.tcx');
    expect(warnings).toEqual([]);
    expect(workouts).toHaveLength(1);
    expect(workouts[0]).toMatchObject({
      format: 'tcx', fileName: 'run.tcx', startUtc: '2024-09-19T11:05:15Z', durationSec: 900.25, distanceM: 2400.5, kcal: 155,
      // (140 x 600 + 160 x 300.25) / 900.25 = 146.67
      avgHeartRate: 147, maxHeartRate: 175, sport: 'Running', title: 'Lunch run & coffee', device: 'Forerunner 265S', durationIncludesPauses: false,
    });
  });

  it('falls back to the trackpoint mean when laps carry no heart rate', () => {
    const w = readTcx(tcx(lap('2024-09-19T11:05:15.000Z', 600, 1600, 100))).workouts[0];
    expect(w.avgHeartRate).toBe(99);
  });

  it('matches the namespace URI whatever prefix the file uses', () => {
    const prefixed = tcx(lap('2024-09-19T11:05:15.000Z', 60, 100, 5), 'Biking', 'xmlns:tc="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"')
      .replace(/<(\/?)(?!\?|tc:|ns3:)([A-Za-z])/g, '<$1tc:$2');
    const w = readTcx(prefixed).workouts[0];
    expect(w).toMatchObject({ sport: 'Biking', durationSec: 60, kcal: 5 });
  });

  it('keeps Other as the sport (TCX cannot say walking or swimming)', () => {
    expect(readTcx(tcx(lap('2024-09-19T11:05:15.000Z', 60, 100, 5), 'Other')).workouts[0].sport).toBe('Other');
  });

  it('marks the legs of a multisport session', () => {
    const act = (start: string, sport: string) => `<Activity Sport="${sport}"><Id>${start}</Id>${lap(start, 600, 1000, 50)}</Activity>`;
    const text = `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><MultiSportSession><Id>2024-01-01T08:00:00Z</Id>
      <FirstSport>${act('2024-01-01T08:00:00Z', 'Biking')}</FirstSport><NextSport>${act('2024-01-01T08:20:00Z', 'Running')}</NextSport></MultiSportSession></Activities></TrainingCenterDatabase>`;
    const r = readTcx(text);
    expect(r.workouts.map((w) => [w.sport, w.leg])).toEqual([['Biking', { number: 1, of: 2 }], ['Running', { number: 2, of: 2 }]]);
  });

  it('gives clear errors for files that are not TCX workouts', () => {
    expect(() => readTcx('<gpx></gpx>', 'x.tcx')).toThrow('This file is not a TCX file.');
    expect(() => readTcx('<TrainingCenterDatabase><Activities>', 'x.tcx')).toThrow('This file is not a readable TCX file (the XML inside is broken).');
    expect(() => readTcx('not xml at all', 'x.tcx')).toThrow('This file is not a readable TCX file (the XML inside is broken).');
    expect(() => readTcx('<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v1"/>')).toThrow(/old TCX version 1/);
    expect(() => readTcx('<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Courses/></TrainingCenterDatabase>')).toThrow(
      'This TCX file has no activities in it (it may be a course or a workout plan).',
    );
    expect(() => readTcx(tcx(''))).toThrow('This TCX file has no laps with a time, so there is nothing to import.');
  });
});
