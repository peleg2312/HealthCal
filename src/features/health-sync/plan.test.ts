/**
 * What a sync does with the workouts a health store returns: the awkward cases.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { garminExternalId, importedEntryId } from '@/features/import/convert';
import { prepareImport } from '@/features/import/plan';
import { readImportFile } from '@/features/import/read';
import { grossKcal, netKcal } from '@/lib/exercise';

import { syncedFrom } from './origins';
import { choiceKey, planSync, workoutKey } from './plan';
import { CTX, handLogged, SAMSUNG, stored, STRAVA, TYPE, workout } from './testing';

const resting = (minutes: number) => (CTX.baselineKcalPerDay / 1440) * minutes;
const plan = (workouts: Parameters<typeof planSync>[0]['workouts'], existing: Parameters<typeof planSync>[0]['existing'] = [], more: Partial<Parameters<typeof planSync>[0]> = {}) =>
  planSync({ workouts, existing, ctx: CTX, ...more });

describe('planSync', () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  describe('one workout, one record', () => {
    it('saves a new Garmin Connect run by itself, as a health entry that says where it came from', () => {
      const p = plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 45, activeKcal: 480, totalKcal: 552, distanceM: 8200, title: 'Morning Run' })]);
      expect(p.review).toEqual([]);
      expect(p.add).toHaveLength(1);
      const { entry, from } = p.add[0];
      expect(from).toBe('Garmin Connect');
      expect(entry).toMatchObject({
        source: 'health',
        activityId: 'running',
        date: '2026-11-12',
        durationMin: 45,
        distanceKm: 8.2,
        startedAt: '2026-11-12T06:00:00Z',
        measured: true,
        notes: 'Morning Run',
      });
      expect(syncedFrom(entry)).toBe('Garmin Connect');
    });

    it('uses the record id the file import derives for the same start, so a file and Health Connect write one record', () => {
      const p = plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 45, totalKcal: 552 })]);
      const csv = new TextEncoder().encode('Activity Type,Date,Title,Distance,Calories,Time,Elapsed Time\nRunning,2026-11-12 07:00:00,"Morning Run","8.20","552","00:45:00","00:45:00"\n');
      const fromFile = prepareImport(readImportFile(csv, 'Activities.csv', { csv: { distanceUnit: 'km' } }).workouts, [], CTX)[0].entry;
      expect(fromFile?.startedAt).toBe('2026-11-12T06:00:00Z');
      expect(p.add[0].entry.id).toBe(fromFile?.id);
      expect(p.add[0].entry.id).toBe(importedEntryId(garminExternalId({ startUtc: '2026-11-12T06:00:00Z' })));
      // Garmin Connect's workouts carry the identity the file import writes.
      expect(p.add[0].entry.externalId).toBe(fromFile?.externalId);
    });

    it('adds nothing when the workout was imported from a Garmin file before', () => {
      const csv = new TextEncoder().encode('Activity Type,Date,Title,Distance,Calories,Time,Elapsed Time\nRunning,2026-11-12 07:00:00,"Morning Run","8.20","552","00:43:10","00:45:00"\n');
      const file = prepareImport(readImportFile(csv, 'Activities.csv', { csv: { distanceUnit: 'km' } }).workouts, [], CTX)[0].entry!;
      const p = plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 45, activeKcal: 480, totalKcal: 552, distanceM: 8200 })], [stored(file)]);
      expect(p.add).toEqual([]);
      expect(p.update).toEqual([]);
      expect(p.review).toEqual([]);
    });

    it('lets the file import recognise a workout that was synced first', () => {
      const synced = plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 45, totalKcal: 552 })]).add[0].entry;
      const csv = new TextEncoder().encode('Activity Type,Date,Title,Distance,Calories,Time,Elapsed Time\nRunning,2026-11-12 07:00:00,"Morning Run","8.20","552","00:45:00","00:45:00"\n');
      const rows = prepareImport(readImportFile(csv, 'Activities.csv', { csv: { distanceUnit: 'km' } }).workouts, [stored(synced)], CTX);
      expect(rows[0].status).not.toBe('new');
      expect(rows[0].match?.id).toBe(synced.id);
    });

    it('is the same record whichever phone reads it', () => {
      const a = plan([workout({ start: '2026-11-12T06:00:00.400Z', minutes: 45, id: 'phone-a' })]).add[0].entry;
      const b = plan([workout({ start: '2026-11-12T06:00:00.400Z', minutes: 45, id: 'phone-b' })]).add[0].entry;
      expect(a.id).toBe(b.id);
    });

    it('keeps another app in the entry so the row can say where it came from', () => {
      const e = plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 30, origin: STRAVA, exerciseType: TYPE.cycling })]).add[0].entry;
      expect(e.externalId).toBe('health:com.strava:2026-11-12T06:00:00Z');
      expect(syncedFrom(e)).toBe('Strava');
      expect(e.activityId).toBe('cycling');
      // Still the id derived from the start instant.
      expect(e.id).toBe(importedEntryId(garminExternalId({ startUtc: '2026-11-12T06:00:00Z' })));
      // Read again: the diary has it.
      expect(plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 30, origin: STRAVA, exerciseType: TYPE.cycling })], [stored(e)]).add).toEqual([]);
    });
  });

  describe('calories', () => {
    const run = (over: Partial<Parameters<typeof workout>[0]>) => plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 45, ...over })]).add[0].entry;

    it('active and total: net is the active figure, gross the total', () => {
      expect(run({ activeKcal: 480, totalKcal: 552 })).toMatchObject({ kcalNet: 480, kcalGross: 552, measured: true });
    });

    it('only total: gross is the total, net is that minus the resting share, as for a Garmin file', () => {
      const e = run({ totalKcal: 552 });
      expect(e.kcalGross).toBe(552);
      expect(e.kcalNet).toBeCloseTo(552 - resting(45), 6);
      expect(e.measured).toBe(true);
    });

    it('only active: net is the active figure, gross adds the resting share', () => {
      const e = run({ activeKcal: 480 });
      expect(e.kcalNet).toBe(480);
      expect(e.kcalGross).toBeCloseTo(480 + resting(45), 6);
      expect(e.measured).toBe(true);
    });

    it('neither: the app estimate, not marked as measured', () => {
      const e = run({});
      const met = ACTIVITY_BY_ID.running.met.moderate;
      expect(e.measured).toBeUndefined();
      expect(e.intensity).toBe('moderate');
      expect(e.kcalGross).toBeCloseTo(grossKcal(met, CTX.weightKg, 45), 6);
      expect(e.kcalNet).toBeCloseTo(netKcal(met, CTX.weightKg, 45, CTX.baselineKcalPerDay), 6);
    });

    it('never counts more than the workout itself: net is never above gross', () => {
      for (const over of [{ activeKcal: 480, totalKcal: 552 }, { totalKcal: 552 }, { activeKcal: 480 }, {}, { activeKcal: 600, totalKcal: 500 }]) {
        const e = run(over);
        expect(e.kcalNet).toBeLessThanOrEqual(e.kcalGross);
        expect(e.kcalNet).toBeGreaterThanOrEqual(0);
      }
    });

    it('does not take a resting-level total for a measurement', () => {
      // 45 minutes at rest for 78.8 kg is about 62 kcal: Health Connect's own estimate when nothing was recorded.
      const e = run({ totalKcal: 62 });
      expect(e.measured).toBeUndefined();
    });
  });

  describe('the day a workout belongs to', () => {
    it('a workout that crosses midnight belongs to the day it started', () => {
      const e = plan([workout({ start: '2026-11-12T22:40:00Z', minutes: 50, zoneOffsetSec: 3600 })]).add[0].entry;
      expect(e.date).toBe('2026-11-12');
      expect(e.durationMin).toBe(50);
    });

    it('uses the zone the record states, not the phone\'s: an evening run in New York stays on that day', () => {
      const e = plan([workout({ start: '2026-11-11T00:30:00Z', minutes: 45, zoneOffsetSec: -5 * 3600 })]).add[0].entry;
      expect(e.date).toBe('2026-11-10');
    });

    it('falls back to the phone\'s zone when the record states none', () => {
      const e = plan([workout({ start: '2026-11-11T00:30:00Z', minutes: 45 })]).add[0].entry;
      expect(e.date).toBe('2026-11-11');
    });
  });

  describe('two apps, one workout', () => {
    const watch = () => workout({ start: '2026-11-12T06:00:00Z', minutes: 45, activeKcal: 480, totalKcal: 552 });
    const phone = (over = {}) => workout({ start: '2026-11-12T06:03:00Z', minutes: 40, origin: SAMSUNG, ...over });

    it('saves one workout and prefers the one with measured calories', () => {
      const p = plan([phone(), watch()]);
      expect(p.add).toHaveLength(1);
      expect(p.add[0].from).toBe('Garmin Connect');
      expect(p.leftOut.otherApp).toBe(1);
      expect(p.review).toEqual([]);
    });

    it('prefers Garmin Connect when both have calories', () => {
      const p = plan([phone({ activeKcal: 300, totalKcal: 360 }), watch()]);
      expect(p.add.map((a) => a.from)).toEqual(['Garmin Connect']);
    });

    it('keeps the other app when only it has calories', () => {
      const p = plan([phone({ activeKcal: 300 }), workout({ start: '2026-11-12T06:00:00Z', minutes: 45 })]);
      expect(p.add.map((a) => a.from)).toEqual(['Samsung Health']);
    });

    it('lists both apps as found', () => {
      expect(plan([phone(), watch()]).origins.map((o) => o.name).sort()).toEqual(['Garmin Connect', 'Samsung Health']);
    });

    it('leaves workouts at different times alone', () => {
      const p = plan([watch(), workout({ start: '2026-11-12T17:00:00Z', minutes: 30, origin: SAMSUNG, exerciseType: TYPE.walking })]);
      expect(p.add).toHaveLength(2);
    });

    it('when the phone\'s reading was saved first, the watch\'s reading takes its place', () => {
      const first = plan([phone()]);
      const saved = stored({ ...first.add[0].entry, notes: 'felt good' });
      const p = plan([phone(), watch()], [saved]);
      expect(p.add).toEqual([]);
      expect(p.review).toEqual([]);
      expect(p.replace).toHaveLength(1);
      expect(p.replace[0].remove.id).toBe(saved.id);
      expect(p.replace[0].entry).toMatchObject({ kcalNet: 480, measured: true, notes: 'felt good' });
      expect(p.replace[0].entry.id).not.toBe(saved.id);
    });

    it('asks instead when the person changed the stored one', () => {
      const first = plan([phone()]);
      const edited = stored({ ...first.add[0].entry, durationMin: 25 });
      const p = plan([phone(), watch()], [edited]);
      expect(p.replace).toEqual([]);
      expect(p.review).toHaveLength(1);
      expect(p.review[0]).toMatchObject({ kind: 'duplicate', matchId: edited.id, matchByHand: false });
    });

    it('does not swap two equal readings back and forth', () => {
      const first = plan([phone({ activeKcal: 300 })]);
      const saved = stored(first.add[0].entry);
      // Strava recorded it too, with calories, and longer: the diary's reading stays.
      const p = plan([phone({ activeKcal: 300 }), workout({ start: '2026-11-12T06:00:00Z', minutes: 50, origin: STRAVA, activeKcal: 310 })], [saved]);
      expect(p.add).toEqual([]);
      expect(p.replace).toEqual([]);
      expect(p.review).toEqual([]);
    });
  });

  describe('against the diary', () => {
    const run = () => workout({ start: '2026-11-14T06:00:00Z', minutes: 46, activeKcal: 430, totalKcal: 500 });

    it('does not add a workout that may be the session logged by hand: it waits with the reason', () => {
      const hand = handLogged('running', 45, '2026-11-14', '2026-11-14T11:38:00');
      const p = plan([run()], [hand]);
      expect(p.add).toEqual([]);
      expect(p.review).toHaveLength(1);
      expect(p.review[0]).toMatchObject({ kind: 'duplicate', matchId: hand.id, matchByHand: true, from: 'Garmin Connect' });
      expect(p.review[0].reason).toBe('You logged a 45 min running session by hand on this day. If it is the same workout, replace it with this one or skip this one.');
      expect(p.review[0].entry).toMatchObject({ kcalNet: 430, source: 'health' });
    });

    it('adds it when the hand-logged session is clearly something else', () => {
      const hand = handLogged('yoga', 45, '2026-11-14', '2026-11-14T11:38:00');
      expect(plan([run()], [hand]).add).toHaveLength(1);
    });

    it('never brings back a workout the person deleted', () => {
      const saved = stored(plan([run()]).add[0].entry, { deleted: true });
      const p = plan([run()], [saved]);
      expect(p.add).toEqual([]);
      expect(p.update).toEqual([]);
      expect(p.review).toEqual([]);
    });

    it('nor once the deletion marker itself is gone, because this phone remembers saving it', () => {
      const entry = plan([run()]).add[0].entry;
      const p = plan([run()], [], { handled: { [entry.id]: { how: 'saved', at: entry.startedAt } } });
      expect(p.add).toEqual([]);
      expect(p.review).toEqual([]);
    });

    it('nor a workout the person skipped', () => {
      const hand = handLogged('running', 45, '2026-11-14', '2026-11-14T11:38:00');
      const id = plan([run()], [hand]).review[0].id;
      const p = plan([run()], [hand], { handled: { [id]: { how: 'skipped', at: '2026-11-14T06:00:00Z' } } });
      expect(p.review).toEqual([]);
      expect(p.add).toEqual([]);
    });

    it('a better reading later (now with calories) updates the stored workout in place', () => {
      const bare = workout({ start: '2026-11-14T06:00:00Z', minutes: 46, id: 'same' });
      const first = plan([bare]).add[0].entry;
      expect(first.measured).toBeUndefined();
      const saved = stored({ ...first, notes: 'with Sam' });
      const p = plan([{ ...bare, activeKcal: 430, totalKcal: 500, distanceM: 8000 }], [saved]);
      expect(p.add).toEqual([]);
      expect(p.update).toHaveLength(1);
      expect(p.update[0].before).toBe(saved);
      expect(p.update[0].entry).toMatchObject({ id: saved.id, date: saved.date, source: 'health', externalId: saved.externalId, kcalNet: 430, kcalGross: 500, measured: true, distanceKm: 8, notes: 'with Sam' });
    });

    it('leaves it alone when the person changed its length since', () => {
      const bare = workout({ start: '2026-11-14T06:00:00Z', minutes: 46, id: 'same' });
      const saved = stored({ ...plan([bare]).add[0].entry, durationMin: 30 });
      const p = plan([{ ...bare, activeKcal: 430 }], [saved]);
      expect(p.update).toEqual([]);
      expect(p.add).toEqual([]);
    });

    it('keeps the activity the person gave a stored workout when the better reading arrives', () => {
      const bare = workout({ start: '2026-11-14T06:00:00Z', minutes: 46, id: 'same' });
      const trail = ACTIVITY_BY_ID.trail_running;
      const saved = stored({ ...plan([bare]).add[0].entry, activityId: trail.id, name: trail.name, category: trail.category });
      const p = plan([{ ...bare, activeKcal: 430 }], [saved]);
      expect(p.update[0].entry).toMatchObject({ activityId: 'trail_running', kcalNet: 430 });
    });

    it('a workout imported from a Garmin file without calories gets them, and stays a Garmin import', () => {
      const gpxLike = stored({ ...plan([workout({ start: '2026-11-14T06:00:00Z', minutes: 46 })]).add[0].entry, source: 'garmin' });
      const p = plan([run()], [gpxLike]);
      expect(p.update).toHaveLength(1);
      expect(p.update[0].entry).toMatchObject({ source: 'garmin', kcalNet: 430, measured: true });
    });

    it('a stored reading with calories is not touched again', () => {
      const saved = stored(plan([run()]).add[0].entry);
      const p = plan([run()], [saved]);
      expect(p.update).toEqual([]);
    });
  });

  describe('which activity it is', () => {
    it('asks about a type that could be several activities, offering the likely ones', () => {
      const p = plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 60, exerciseType: TYPE.paddling, activeKcal: 300 })]);
      expect(p.add).toEqual([]);
      expect(p.review[0]).toMatchObject({ kind: 'activity', entry: null, sportName: 'Paddling', alternatives: ['kayaking', 'canoeing', 'paddleboarding'] });
      expect(p.review[0].reason).toBe('Garmin Connect recorded this as “paddling”, which could be several activities here. Choose what it was.');
    });

    it('asks about an exercise type newer than the table, and offers the activity its name spells', () => {
      const p = plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 60, exerciseType: 999, title: 'Bouldering' })]);
      expect(p.review[0]).toMatchObject({ kind: 'activity', sportName: 'Workout', alternatives: ['bouldering'] });
    });

    it('saves it once the person chose, with the device calories kept', () => {
      const w = workout({ start: '2026-11-12T06:00:00Z', minutes: 60, exerciseType: TYPE.paddling, activeKcal: 300 });
      const p = plan([w], [], { picks: { [workoutKey(w)]: 'kayaking' } });
      expect(p.review).toEqual([]);
      expect(p.add[0].entry).toMatchObject({ activityId: 'kayaking', kcalNet: 300, measured: true });
    });

    it('remembers a choice for the same kind of workout, but not for a nameless "other workout"', () => {
      const paddle = workout({ start: '2026-11-13T06:00:00Z', minutes: 60, exerciseType: TYPE.paddling });
      expect(plan([paddle], [], { choices: { [choiceKey(paddle)!]: 'kayaking' } }).add[0].entry.activityId).toBe('kayaking');
      const named = workout({ start: '2026-11-13T08:00:00Z', minutes: 60, exerciseType: TYPE.other, title: 'Climbing gym' });
      expect(choiceKey(named)).toBe('health-connect:0:climbing_gym');
      expect(plan([named], [], { choices: { [choiceKey(named)!]: 'bouldering' } }).add[0].entry.activityId).toBe('bouldering');
      expect(choiceKey(workout({ start: '2026-11-13T10:00:00Z', minutes: 60, exerciseType: TYPE.other }))).toBeNull();
    });

    it('maps a type the Garmin file table has no word for', () => {
      expect(plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 60, exerciseType: TYPE.handball })]).add[0].entry.activityId).toBe('handball');
    });

    it('leaves out what is not exercise', () => {
      const p = plan([workout({ start: '2026-11-12T06:00:00Z', minutes: 10, exerciseType: TYPE.breathing })]);
      expect(p.add).toEqual([]);
      expect(p.review).toEqual([]);
      expect(p.leftOut.notExercise).toBe(1);
      expect(p.origins).toEqual([]);
    });
  });

  describe('odd input', () => {
    it('leaves out sessions whose times cannot be used', () => {
      const good = workout({ start: '2026-11-12T06:00:00Z', minutes: 30 });
      const p = plan([
        good,
        { ...good, id: 'zero', endTime: good.startTime },
        { ...good, id: 'backwards', endTime: '2026-11-12T05:00:00.000Z' },
        { ...good, id: 'garbage', startTime: 'yesterday' },
        { ...good, id: 'two-days', endTime: '2026-11-14T06:00:00.000Z' },
      ]);
      expect(p.add).toHaveLength(1);
      expect(p.leftOut.unusable).toBe(4);
    });

    it('saves the same session once when it is returned twice', () => {
      const w = workout({ start: '2026-11-12T06:00:00Z', minutes: 30 });
      expect(plan([w, { ...w }]).add).toHaveLength(1);
    });

    it('handles 500 workouts, each saved once, in well under a second or two', () => {
      const many = Array.from({ length: 500 }, (_, i) =>
        workout({ start: new Date(Date.UTC(2026, 9, 16, 5, 0, 0) + i * 80 * 60_000).toISOString(), minutes: 30 + (i % 40), activeKcal: 200 + i, exerciseType: i % 3 === 0 ? TYPE.handball : i % 3 === 1 ? TYPE.running : TYPE.cycling }),
      );
      const t0 = Date.now();
      const p = plan(many);
      const ms = Date.now() - t0;
      expect(p.add).toHaveLength(500);
      expect(new Set(p.add.map((a) => a.entry.id)).size).toBe(500);
      expect(p.review).toEqual([]);
      // Read again against a full diary: nothing to do.
      const again = plan(many, p.add.map((a) => stored(a.entry)));
      expect(again.add).toEqual([]);
      expect(again.update).toEqual([]);
      expect(ms).toBeLessThan(4000);
    });
  });
});
