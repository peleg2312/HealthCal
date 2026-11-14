import { describe, expect, it } from 'vitest';

import { englishActivityType, parseCsvRows, parseDuration, parseLocaleNumber, readGarminCsv } from './csv';
import { ImportError } from './types';

const HEADER = 'Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Avg Run Cadence,Avg Run Cadence,Moving Time,Elapsed Time';
const KM_UTC = { distanceUnit: 'km', timeZone: 'UTC' } as const;

describe('readGarminCsv', () => {
  it('maps columns by name and reads quoted numbers, thousands separators and "--"', () => {
    const text = [
      HEADER,
      'Running,2025-12-27 14:12:58,false,"Eindhoven Running","10.33","658","01:01:26","133","143","164","--","01:01:24","01:01:26"',
      'Yoga,2025-10-10 20:35:25,false,"Yoga","--","39","00:19:36","69","98","--","--","--","00:19:36"',
      'Multisport,2025-06-22 07:34:37,false,"Hoorn Multisport","114.92","3,236","05:44:51","--","160","--","--","--","--:--:--"',
    ].join('\n');
    const { workouts, warnings } = readGarminCsv(text, 'Activities.csv', KM_UTC);
    expect(warnings).toEqual([]);
    expect(workouts.map((w) => [w.sport, w.startUtc, w.durationSec, w.distanceM, w.kcal, w.avgHeartRate, w.title, w.elapsedSec])).toEqual([
      ['Running', '2025-12-27T14:12:58Z', 3686, 10330, 658, 133, 'Eindhoven Running', 3686],
      ['Yoga', '2025-10-10T20:35:25Z', 1176, null, 39, 69, 'Yoga', 1176],
      ['Multisport', '2025-06-22T07:34:37Z', 20691, 114920, 3236, null, 'Hoorn Multisport', null],
    ]);
    expect(workouts[0]).toMatchObject({ format: 'csv', index: 1, startFromLocalTime: true, durationIncludesPauses: false, maxHeartRate: 143 });
  });

  it('accepts "Total Time" and columns in any order', () => {
    const text = 'Title,Total Time,Calories,Activity Type,Elapsed Time,Date,Distance\n"CrossFit","00:29:29","447",Cardio,"00:38:21",2025-12-22 18:41:49,"0.00"';
    const w = readGarminCsv(text, 'a.csv', KM_UTC).workouts[0];
    expect(w).toMatchObject({ sport: 'Cardio', durationSec: 1769, elapsedSec: 2301, kcal: 447, distanceM: 0, title: 'CrossFit' });
  });

  it('reads tenths of a second and keeps swims in metres', () => {
    const text = `${HEADER}\nPool Swim,2025-06-20 11:19:58,false,"Pool Swim","1,500","313","00:39:07.5","110","128","--","--","00:32:10","00:39:40"`;
    const w = readGarminCsv(text, 'a.csv', KM_UTC).workouts[0];
    expect(w.durationSec).toBe(2347.5);
    expect(w.distanceM).toBe(1500);
  });

  it('converts miles, and swims in yards for a mile account', () => {
    const text = `${HEADER}\nRunning,2025-01-01 08:00:00,false,"Run","3.10","300","00:30:00","--","--","--","--","--","--"\nPool Swim,2025-01-02 08:00:00,false,"Swim","1,000","200","00:25:00","--","--","--","--","--","--"`;
    const ws = readGarminCsv(text, 'a.csv', { distanceUnit: 'mi', timeZone: 'UTC' }).workouts;
    expect(ws[0].distanceM).toBeCloseTo(4988.97, 2);
    expect(ws[1].distanceM).toBe(914.4);
    expect(readGarminCsv(text, 'a.csv', { distanceUnit: 'mi', timeZone: 'UTC', swimUnit: 'm' }).workouts[1].distanceM).toBe(1000);
  });

  it('reads whole-number rowing and track distances as metres', () => {
    const text = `Activity Type,Date,Title,Distance,Calories,Time\nIndoor Rowing,2025-01-21 16:50:29,Row,"5,000",383,01:00:09.0\nIndoor Rowing,2025-01-22 16:50:29,Row,"5.20",383,01:00:09.0\nRunning,2025-01-21 18:00:00,Run,"5.00",383,01:00:09.0`;
    const ws = readGarminCsv(text, 'a.csv', KM_UTC).workouts;
    expect(ws.map((w) => w.distanceM)).toEqual([5000, 5200, 5000]);
  });

  it('reads German headers, activity types and decimal commas', () => {
    const text = [
      'Aktivitätstyp,Datum,Favorit,Titel,Distanz,Kalorien,Zeit,Ø Herzfrequenz,Verstrichene Zeit',
      'Laufen,2025-11-07 12:28:57,,Abendlauf,"3,83",1.057,"00:08:51,6",142,"00:09:00"',
      'Schwimmbadschwimmen,2025-11-08 07:00:00,,Bahnen,"1.500",300,"00:30:00",,',
    ].join('\n');
    const ws = readGarminCsv(text, 'de.csv', KM_UTC).workouts;
    expect(ws[0]).toMatchObject({ sport: 'Laufen', distanceM: 3830, kcal: 1057, durationSec: 531.6, avgHeartRate: 142, elapsedSec: 540, title: 'Abendlauf' });
    expect(ws[1].distanceM).toBe(1500);
    expect(englishActivityType('Laufen')).toBe('Running');
  });

  it('reads semicolon files with re-saved dates', () => {
    const text = 'Activity Type;Date;Title;Distance;Calories;Time\nRunning;27.12.2025 14:12:58;Run;3,83;100;00:08:51,6\nRunning;13/11/2025 09:00;Run;3,83;100;00:08:51,6';
    const ws = readGarminCsv(text, 'a.csv', KM_UTC).workouts;
    expect(ws.map((w) => w.startUtc)).toEqual(['2025-12-27T14:12:58Z', '2025-11-13T09:00:00Z']);
    expect(ws[0].distanceM).toBe(3830);
  });

  it('works out month/day order from the file, and warns when it cannot', () => {
    const us = 'Activity Type,Date,Time\nRunning,12/27/2025 2:12:58 PM,00:30:00\nRunning,01/02/2025 9:00:00 AM,00:30:00';
    expect(readGarminCsv(us, 'a.csv', KM_UTC).workouts.map((w) => w.startUtc)).toEqual(['2025-12-27T14:12:58Z', '2025-01-02T09:00:00Z']);
    const unclear = 'Activity Type,Date,Time\nRunning,01/02/2025 09:00,00:30:00';
    const r = readGarminCsv(unclear, 'a.csv', KM_UTC);
    expect(r.workouts[0].startUtc).toBe('2025-02-01T09:00:00Z');
    expect(r.warnings.map((w) => w.message)).toEqual(['Dates like 07/11/2025 were read as day/month/year. If they are month/day/year, change the date order and read the file again.']);
    expect(readGarminCsv(unclear, 'a.csv', { ...KM_UTC, dateOrder: 'mdy' }).workouts[0].startUtc).toBe('2025-01-02T09:00:00Z');
  });

  it('reads dates as wall time in the zone it is given', () => {
    const text = 'Activity Type,Date,Time\nRunning,2025-07-01 08:00:00,00:30:00\nRunning,2025-01-01 08:00:00,00:30:00';
    const ws = readGarminCsv(text, 'a.csv', { distanceUnit: 'km', timeZone: 'Europe/Amsterdam' }).workouts;
    expect(ws.map((w) => w.startUtc)).toEqual(['2025-07-01T06:00:00Z', '2025-01-01T07:00:00Z']);
    const ny = readGarminCsv(text, 'a.csv', { distanceUnit: 'km', timeZone: 'America/New_York' }).workouts;
    expect(ny.map((w) => w.startUtc)).toEqual(['2025-07-01T12:00:00Z', '2025-01-01T13:00:00Z']);
    expect(() => readGarminCsv(text, 'a.csv', { distanceUnit: 'km', timeZone: 'Mars/Olympus' })).toThrow('"Mars/Olympus" is not a time zone this device knows. Choose another one.');
  });

  it('tolerates unescaped quotes in a title', () => {
    const text = `${HEADER}\nRunning,2025-12-27 14:12:58,false,"The "fun" run","10.33","658","01:01:26","133","143","--","--","--","--"`;
    const w = readGarminCsv(text, 'a.csv', KM_UTC).workouts[0];
    expect(w.title).toBe('The "fun" run');
    expect(w.kcal).toBe(658);
  });

  it('skips rows it cannot use and says how many, in plain words', () => {
    const text = [
      HEADER,
      'Running,2025-12-27 14:12:58,false,"ok","1","1","00:10:00","--","--","--","--","--","--"',
      'Running,2025-12-28 14:12:58,false,"no time","1","1","--:--:--","--","--","--","--","--","--"',
      'Running,2025-12-29 14:12:58,false,"no time","1","1","--","--","--","--","--","--","--"',
      'Running,,false,"no date","1","1","00:10:00","--","--","--","--","--","--"',
      'Running,2025-12-30 14:12:58,false,"too many",a,b,c,d,e,f,g,h,i,j,k,l,m,n,o',
      'Strength Training,2025-12-31 14:12:58,false,"elapsed only","0","1","--","--","--","--","--","--","00:20:00"',
    ].join('\r\n');
    const r = readGarminCsv(text, 'a.csv', KM_UTC);
    expect(r.workouts.map((w) => w.title)).toEqual(['ok', 'elapsed only']);
    expect(r.workouts[1]).toMatchObject({ durationSec: 1200, durationIncludesPauses: true });
    expect(r.warnings.map((w) => w.message)).toEqual([
      '2 rows had no duration and were skipped.',
      '1 row had no readable date and was skipped.',
      '1 row could not be read and was skipped. Quote marks in an activity title can cause this: remove them in Garmin Connect and export again.',
      '1 row had no moving time, so the elapsed time (pauses included) was used.',
    ]);
  });

  it('needs the distance unit from the caller', () => {
    const text = `${HEADER}\nRunning,2025-12-27 14:12:58,false,"x","1","1","00:10:00","--","--","--","--","--","--"`;
    expect(() => readGarminCsv(text, 'a.csv', undefined)).toThrow('Choose whether the distances in this file are in kilometres or miles.');
    try {
      readGarminCsv(text, 'a.csv', undefined);
    } catch (e) {
      expect((e as ImportError).code).toBe('csv-options-needed');
    }
  });

  it('rejects CSVs that are not a Garmin activities list, and empty ones', () => {
    expect(() => readGarminCsv('Name,Amount\nCoffee,3', 'b.csv', KM_UTC)).toThrow('This CSV is not a Garmin Connect activities list: it has no activity type, date and time columns.');
    expect(() => readGarminCsv(HEADER, 'b.csv', KM_UTC)).toThrow('This activities list is empty.');
    expect(() => readGarminCsv(`${HEADER}\nRunning,x,false,"x","1","1","--","--","--","--","--","--","--"`, 'b.csv', KM_UTC)).toThrow(
      'No row in this file had a date and a duration, so there is nothing to import.',
    );
  });

  it('strips a byte order mark and an Excel sep= line', () => {
    const text = '﻿sep=;\nActivity Type;Date;Time\nRunning;2025-01-01 10:00:00;00:10:00';
    expect(readGarminCsv(text, 'a.csv', KM_UTC).workouts).toHaveLength(1);
  });
});

describe('csv helpers', () => {
  it('parses durations', () => {
    expect(parseDuration('01:01:26')).toBe(3686);
    expect(parseDuration('00:08:51.6')).toBeCloseTo(531.6, 6);
    expect(parseDuration('00:08:51,6')).toBeCloseTo(531.6, 6);
    expect(parseDuration('45:12')).toBe(2712);
    expect(parseDuration('25:00:00')).toBe(90000);
    expect(parseDuration('--:--:--')).toBeNull();
    expect(parseDuration('--')).toBeNull();
    expect(parseDuration('1:75:00')).toBeNull();
    expect(parseDuration('soon')).toBeNull();
  });

  it('parses numbers with either decimal mark', () => {
    expect(parseLocaleNumber('3,236', '.')).toBe(3236);
    expect(parseLocaleNumber('10.33', '.')).toBe(10.33);
    expect(parseLocaleNumber('1.057', ',')).toBe(1057);
    expect(parseLocaleNumber('3,83', ',')).toBe(3.83);
    expect(parseLocaleNumber('1 234,5', ',')).toBe(1234.5);
    expect(parseLocaleNumber('--', '.')).toBeNull();
    expect(parseLocaleNumber('abc', '.')).toBeNull();
  });

  it('splits rows with quotes, escaped quotes and CRLF', () => {
    expect(parseCsvRows('a,"b,c","d ""e"""\r\n1,2,3\r\n', ',')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });
});
