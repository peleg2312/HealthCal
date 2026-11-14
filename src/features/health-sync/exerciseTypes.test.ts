/**
 * The exercise type table against the library it describes and the catalogue it points at.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { suggestActivity } from '@/features/import/sports';

import { HEALTH_CONNECT_TYPES, healthConnectSport } from './exerciseTypes';

/** ExerciseType as react-native-health-connect lists it, read from its source (the package itself cannot load outside Android). */
function libraryTypes(): Record<string, number> {
  const file = path.resolve(__dirname, '../../../node_modules/react-native-health-connect/src/constants.ts');
  const text = readFileSync(file, 'utf8');
  const block = /export const ExerciseType = \{([\s\S]*?)\} as const;/.exec(text);
  if (!block) throw new Error('ExerciseType not found in the library source');
  return Object.fromEntries([...block[1].matchAll(/([A-Z_0-9]+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
}

describe('Health Connect exercise types', () => {
  const lib = libraryTypes();

  it('has a row for every type the library lists, and no others', () => {
    expect(Object.keys(lib).length).toBeGreaterThan(70);
    expect(Object.keys(HEALTH_CONNECT_TYPES).map(Number).sort((a, b) => a - b)).toEqual(Object.values(lib).sort((a, b) => a - b));
  });

  it('spot checks: the numbers mean what the table says', () => {
    expect(healthConnectSport(lib.RUNNING)).toMatchObject({ name: 'Running', activityId: 'running' });
    expect(healthConnectSport(lib.RUNNING_TREADMILL).activityId).toBe('running');
    expect(healthConnectSport(lib.BIKING).activityId).toBe('cycling');
    expect(healthConnectSport(lib.BIKING_STATIONARY).activityId).toBe('stationary_bike');
    expect(healthConnectSport(lib.SWIMMING_POOL).activityId).toBe('swimming');
    expect(healthConnectSport(lib.SWIMMING_OPEN_WATER).activityId).toBe('open_water_swimming');
    expect(healthConnectSport(lib.WALKING).activityId).toBe('walking');
    expect(healthConnectSport(lib.HIKING).activityId).toBe('hiking');
    expect(healthConnectSport(lib.STRENGTH_TRAINING).activityId).toBe('strength_training');
    expect(healthConnectSport(lib.YOGA).activityId).toBe('yoga');
    expect(healthConnectSport(lib.ROWING_MACHINE).activityId).toBe('rowing_machine');
    expect(healthConnectSport(lib.HIGH_INTENSITY_INTERVAL_TRAINING).activityId).toBe('hiit');
    expect(healthConnectSport(lib.OTHER_WORKOUT).activityId).toBeNull();
    expect(healthConnectSport(lib.GUIDED_BREATHING).ignore).toBe(true);
  });

  it('only names activities the catalogue has', () => {
    for (const [type, row] of Object.entries(HEALTH_CONNECT_TYPES)) {
      if (row.activityId) expect(ACTIVITY_BY_ID[row.activityId], `type ${type}`).toBeDefined();
      for (const id of row.alternatives) expect(ACTIVITY_BY_ID[id], `type ${type} alternative ${id}`).toBeDefined();
      expect(row.name.length, `type ${type}`).toBeGreaterThan(2);
    }
  });

  it('asks about a type it does not know', () => {
    expect(healthConnectSport(4711)).toEqual({ name: 'Workout', activityId: null, alternatives: [] });
  });

  it('is not second-guessed by the file pipeline: from the type name alone it suggests the same activity or none', () => {
    for (const [type, row] of Object.entries(HEALTH_CONNECT_TYPES)) {
      const guess = suggestActivity({ format: 'tcx', sport: row.name, subSport: null, distanceM: null, durationSec: 1800, title: null }).activityId;
      if (guess !== null) expect(guess, `type ${type} (${row.name})`).toBe(row.activityId);
    }
  });
});
