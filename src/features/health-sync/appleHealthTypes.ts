/**
 * Which HealthCal activity an Apple Health workout is: the iPhone's twin of
 * exerciseTypes.ts (Health Connect), in the same spirit as the file import's
 * table for Garmin's sports. A clear match names the activity, a real choice
 * lists the likely ones and the sync screen asks, and nothing is guessed silently.
 *
 * The numbers are HKWorkoutActivityType's raw values as
 * @kingstinct/react-native-healthkit 16.2.0 lists them (WorkoutActivityType in
 * src/generated/healthkit.generated.ts; Apple's own enum has the same values).
 * appleHealthTypes.test.ts holds a copy of that list and fails when a value has
 * no row here.
 *
 * HealthKit says "indoor" and "open water" in a workout's metadata, not in its
 * type, so `appleExerciseType` folds those into the number (an indoor walk is a
 * treadmill walk, an open-water swim is not a pool swim): the variants are the
 * type plus INDOOR or OPEN_WATER, and only the ones that change the activity have rows.
 */
import { ACTIVITY_BY_ID } from '@/data/activities';

import type { HealthSport } from './exerciseTypes';

/** HKMetadataKeyIndoorWorkout set to true. */
export const INDOOR = 100_000;
/** HKMetadataKeySwimmingLocationType 2 (open water). */
export const OPEN_WATER = 200_000;

/** The raw values used by the rules below (HKWorkoutActivityType). */
export const HK_TYPE = { cycling: 13, rowing: 35, running: 37, swimming: 46, walking: 52, other: 3000 } as const;

const is = (name: string, activityId: string): HealthSport => ({ name, activityId, alternatives: [] });
const ask = (name: string, ...alternatives: string[]): HealthSport => ({ name, activityId: null, alternatives });
const skip = (name: string): HealthSport => ({ ...ask(name), ignore: true });

export const APPLE_HEALTH_TYPES: Record<number, HealthSport> = {
  1: is('American football', 'football'),
  2: is('Archery', 'archery'),
  3: ask('Australian football', 'rugby', 'soccer'),
  4: is('Badminton', 'badminton'),
  5: is('Baseball', 'baseball_softball'),
  6: is('Basketball', 'basketball'),
  7: is('Bowling', 'bowling'),
  8: is('Boxing', 'boxing'),
  9: ask('Climbing', 'rock_climbing', 'bouldering'),
  10: is('Cricket', 'cricket'),
  11: ask('Cross training', 'crossfit', 'circuit_training', 'hiit'),
  12: ask('Curling'),
  13: is('Cycling', 'cycling'),
  [INDOOR + 13]: is('Indoor cycling', 'stationary_bike'),
  14: is('Dance', 'dancing'),
  15: ask('Dance training', 'dancing', 'zumba', 'aerobics'),
  16: is('Elliptical', 'elliptical'),
  17: is('Equestrian sports', 'horseback_riding'),
  18: is('Fencing', 'fencing'),
  19: ask('Fishing'),
  20: is('Functional strength training', 'strength_training'),
  21: is('Golf', 'golf'),
  22: ask('Gymnastics', 'calisthenics'),
  23: is('Handball', 'handball'),
  24: is('Hiking', 'hiking'),
  25: ask('Hockey', 'ice_hockey', 'field_hockey'),
  26: ask('Hunting'),
  27: is('Lacrosse', 'lacrosse'),
  28: is('Martial arts', 'martial_arts'),
  29: ask('Mind and body', 'yoga', 'tai_chi', 'pilates', 'stretching'),
  30: ask('Mixed cardio', 'circuit_training', 'hiit', 'aerobics'),
  31: ask('Paddling', 'kayaking', 'canoeing', 'paddleboarding'),
  32: ask('Play', 'playing_with_kids'),
  33: ask('Preparation and recovery', 'stretching'),
  34: is('Racquetball', 'racquetball'),
  35: ask('Rowing', 'rowing_outdoor', 'rowing_machine'),
  [INDOOR + 35]: is('Indoor rowing', 'rowing_machine'),
  36: is('Rugby', 'rugby'),
  37: is('Running', 'running'),
  [INDOOR + 37]: is('Indoor running', 'running'),
  38: ask('Sailing'),
  39: ask('Skating', 'ice_skating', 'inline_skating', 'roller_skating', 'skateboarding'),
  40: ask('Snow sports', 'downhill_skiing', 'cross_country_skiing', 'snowboarding'),
  41: is('Soccer', 'soccer'),
  42: is('Softball', 'baseball_softball'),
  43: is('Squash', 'squash'),
  44: is('Stair climbing', 'stair_climbing'),
  45: is('Surfing', 'surfing'),
  46: is('Pool swimming', 'swimming'),
  [OPEN_WATER + 46]: is('Open water swimming', 'open_water_swimming'),
  47: is('Table tennis', 'table_tennis'),
  48: is('Tennis', 'tennis'),
  49: ask('Track and field', 'running'),
  50: is('Strength training', 'strength_training'),
  51: is('Volleyball', 'volleyball'),
  52: is('Walking', 'walking'),
  [INDOOR + 52]: is('Indoor walking', 'treadmill_walking'),
  53: is('Water fitness', 'water_aerobics'),
  54: is('Water polo', 'water_polo'),
  55: ask('Water sports', 'kayaking', 'paddleboarding', 'surfing'),
  56: is('Wrestling', 'wrestling'),
  57: is('Yoga', 'yoga'),
  58: ask('Barre', 'pilates', 'ballet'),
  59: is('Core training', 'bodyweight_training'),
  60: is('Cross-country skiing', 'cross_country_skiing'),
  61: is('Downhill skiing', 'downhill_skiing'),
  62: is('Flexibility', 'stretching'),
  63: is('High-intensity interval training', 'hiit'),
  64: is('Jump rope', 'jump_rope'),
  65: is('Kickboxing', 'kickboxing'),
  66: is('Pilates', 'pilates'),
  67: is('Snowboarding', 'snowboarding'),
  68: is('Stairs', 'stair_climbing'),
  69: is('Step training', 'step_aerobics'),
  70: ask('Wheelchair walk pace'),
  71: ask('Wheelchair run pace'),
  72: is('Tai chi', 'tai_chi'),
  73: ask('Mixed cardio', 'circuit_training', 'aerobics', 'hiit'),
  74: ask('Hand cycling'),
  75: ask('Disc sports', 'ultimate_frisbee', 'frisbee', 'disc_golf'),
  76: ask('Fitness gaming', 'aerobics'),
  77: ask('Cardio dance', 'zumba', 'dancing'),
  78: is('Social dance', 'dancing'),
  79: is('Pickleball', 'pickleball'),
  80: ask('Cooldown', 'stretching', 'walking'),
  82: ask('Swim, bike and run', 'running', 'cycling', 'swimming'),
  // The pause between the legs of a triathlon, and rest: not exercise.
  83: skip('Transition'),
  84: ask('Underwater diving'),
  2998: skip('Rest'),
  2999: ask('Group workout'),
  3000: ask('Other workout'),
};

/** A type this table does not know (a newer iOS): the screen asks. */
const UNKNOWN: HealthSport = ask('Workout');

/** The type number a workout is looked up by: its activity type, with the indoor or open-water variant when one has a row. */
export function appleExerciseType(activityType: number, metadata: Record<string, unknown> | null | undefined): number {
  const indoor = metadata?.HKIndoorWorkout === true || metadata?.HKIndoorWorkout === 1;
  const location = metadata?.HKSwimmingLocationType;
  if (location === 2 && APPLE_HEALTH_TYPES[OPEN_WATER + activityType]) return OPEN_WATER + activityType;
  if (indoor && APPLE_HEALTH_TYPES[INDOOR + activityType]) return INDOOR + activityType;
  return activityType;
}

/** The app activity for an Apple Health type number. Ids the catalogue does not have are dropped, so the table cannot name a missing activity. */
export function appleHealthSport(type: number): HealthSport {
  const row = APPLE_HEALTH_TYPES[type] ?? UNKNOWN;
  const known = (id: string) => id in ACTIVITY_BY_ID;
  return {
    ...row,
    activityId: row.activityId && known(row.activityId) ? row.activityId : null,
    alternatives: row.alternatives.filter(known),
  };
}
