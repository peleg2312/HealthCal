/**
 * Apple Health's workout types against the app's activities. The library is not
 * part of this build's tests (it is native), so its enum is copied here: when a
 * newer @kingstinct/react-native-healthkit adds a type, add it to this list and
 * to the table.
 */
import { describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';

import { appleExerciseType, appleHealthSport, APPLE_HEALTH_TYPES, INDOOR, OPEN_WATER } from './appleHealthTypes';

/** WorkoutActivityType in @kingstinct/react-native-healthkit 16.2.0, src/generated/healthkit.generated.ts. */
const WORKOUT_ACTIVITY_TYPE: Record<string, number> = {
  americanFootball: 1, archery: 2, australianFootball: 3, badminton: 4, baseball: 5, basketball: 6, bowling: 7, boxing: 8, climbing: 9, cricket: 10,
  crossTraining: 11, curling: 12, cycling: 13, dance: 14, danceInspiredTraining: 15, elliptical: 16, equestrianSports: 17, fencing: 18, fishing: 19,
  functionalStrengthTraining: 20, golf: 21, gymnastics: 22, handball: 23, hiking: 24, hockey: 25, hunting: 26, lacrosse: 27, martialArts: 28, mindAndBody: 29,
  mixedMetabolicCardioTraining: 30, paddleSports: 31, play: 32, preparationAndRecovery: 33, racquetball: 34, rowing: 35, rugby: 36, running: 37, sailing: 38,
  skatingSports: 39, snowSports: 40, soccer: 41, softball: 42, squash: 43, stairClimbing: 44, surfingSports: 45, swimming: 46, tableTennis: 47, tennis: 48,
  trackAndField: 49, traditionalStrengthTraining: 50, volleyball: 51, walking: 52, waterFitness: 53, waterPolo: 54, waterSports: 55, wrestling: 56, yoga: 57,
  barre: 58, coreTraining: 59, crossCountrySkiing: 60, downhillSkiing: 61, flexibility: 62, highIntensityIntervalTraining: 63, jumpRope: 64, kickboxing: 65,
  pilates: 66, snowboarding: 67, stairs: 68, stepTraining: 69, wheelchairWalkPace: 70, wheelchairRunPace: 71, taiChi: 72, mixedCardio: 73, handCycling: 74,
  discSports: 75, fitnessGaming: 76, cardioDance: 77, socialDance: 78, pickleball: 79, cooldown: 80, swimBikeRun: 82, transition: 83, underwaterDiving: 84,
  rest: 2998, group: 2999, other: 3000,
};

describe('Apple Health workout types', () => {
  it('has a row for every type the library knows, and no row for a type it does not (variants aside)', () => {
    const values = Object.values(WORKOUT_ACTIVITY_TYPE);
    for (const [name, value] of Object.entries(WORKOUT_ACTIVITY_TYPE)) expect(APPLE_HEALTH_TYPES[value], name).toBeDefined();
    for (const key of Object.keys(APPLE_HEALTH_TYPES).map(Number)) {
      const base = key >= OPEN_WATER ? key - OPEN_WATER : key >= INDOOR ? key - INDOOR : key;
      expect(values, String(key)).toContain(base);
    }
  });

  it('names only activities the catalogue has', () => {
    for (const [key, row] of Object.entries(APPLE_HEALTH_TYPES)) {
      if (row.activityId) expect(ACTIVITY_BY_ID[row.activityId], key).toBeDefined();
      for (const id of row.alternatives) expect(ACTIVITY_BY_ID[id], `${key} ${id}`).toBeDefined();
      // A row is a match, a choice, or something that is not exercise.
      expect(row.activityId !== null || row.alternatives.length > 0 || row.ignore || ['Curling', 'Fishing', 'Hunting', 'Sailing', 'Wheelchair walk pace', 'Wheelchair run pace', 'Hand cycling', 'Underwater diving', 'Group workout', 'Other workout'].includes(row.name), key).toBe(true);
    }
  });

  it('maps the common workouts straight to an activity', () => {
    const t = WORKOUT_ACTIVITY_TYPE;
    expect(appleHealthSport(t.running).activityId).toBe('running');
    expect(appleHealthSport(t.walking).activityId).toBe('walking');
    expect(appleHealthSport(t.cycling).activityId).toBe('cycling');
    expect(appleHealthSport(t.swimming).activityId).toBe('swimming');
    expect(appleHealthSport(t.traditionalStrengthTraining).activityId).toBe('strength_training');
    expect(appleHealthSport(t.highIntensityIntervalTraining).activityId).toBe('hiit');
    expect(appleHealthSport(t.yoga).activityId).toBe('yoga');
    expect(appleHealthSport(t.hiking).activityId).toBe('hiking');
  });

  it('reads indoor and open water from the workout\'s metadata', () => {
    const t = WORKOUT_ACTIVITY_TYPE;
    expect(appleHealthSport(appleExerciseType(t.cycling, { HKIndoorWorkout: true })).activityId).toBe('stationary_bike');
    expect(appleHealthSport(appleExerciseType(t.walking, { HKIndoorWorkout: 1 })).activityId).toBe('treadmill_walking');
    expect(appleHealthSport(appleExerciseType(t.rowing, { HKIndoorWorkout: true })).activityId).toBe('rowing_machine');
    expect(appleHealthSport(appleExerciseType(t.swimming, { HKSwimmingLocationType: 2 })).activityId).toBe('open_water_swimming');
    expect(appleHealthSport(appleExerciseType(t.swimming, { HKSwimmingLocationType: 1 })).activityId).toBe('swimming');
    // Indoor yoga is yoga: a variant without a row of its own falls back to the type.
    expect(appleExerciseType(t.yoga, { HKIndoorWorkout: true })).toBe(t.yoga);
    expect(appleExerciseType(t.running, null)).toBe(t.running);
  });

  it('asks where a type could be several activities, and leaves out what is not exercise', () => {
    expect(appleHealthSport(WORKOUT_ACTIVITY_TYPE.paddleSports)).toMatchObject({ activityId: null, alternatives: ['kayaking', 'canoeing', 'paddleboarding'] });
    expect(appleHealthSport(WORKOUT_ACTIVITY_TYPE.other)).toMatchObject({ name: 'Other workout', activityId: null });
    expect(appleHealthSport(WORKOUT_ACTIVITY_TYPE.rest).ignore).toBe(true);
    expect(appleHealthSport(WORKOUT_ACTIVITY_TYPE.transition).ignore).toBe(true);
    // A type newer than the table.
    expect(appleHealthSport(85)).toMatchObject({ name: 'Workout', activityId: null, alternatives: [] });
  });
});
