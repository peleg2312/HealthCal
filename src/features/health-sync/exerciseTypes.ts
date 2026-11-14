/**
 * Which HealthCal activity a Health Connect exercise type is, in the same
 * spirit as the file import's table for Garmin's sports (features/import/
 * sports.ts): a clear match names the activity, a real choice lists the likely
 * ones and the sync screen asks, and nothing is guessed silently.
 *
 * The numbers are ExerciseSessionRecord's EXERCISE_TYPE_* constants as
 * react-native-health-connect 4.1.3 lists them (src/constants.ts);
 * exerciseTypes.test.ts reads that file and fails when the two drift apart.
 * Which numbers Garmin Connect actually writes for each sport is not known
 * until a phone build (docs/health-sync.md).
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import type { SportMatch } from '@/features/import/sports';

export interface HealthSport extends SportMatch {
  /** The type in plain words, as shown on the sync screen ('Treadmill running'). */
  name: string;
  /** True for something that is not exercise (guided breathing): it is left out entirely. */
  ignore?: boolean;
}

const is = (name: string, activityId: string): HealthSport => ({ name, activityId, alternatives: [] });
const ask = (name: string, ...alternatives: string[]): HealthSport => ({ name, activityId: null, alternatives });

export const HEALTH_CONNECT_TYPES: Record<number, HealthSport> = {
  0: ask('Other workout'),
  1: is('Back extension', 'strength_training'),
  2: is('Badminton', 'badminton'),
  3: is('Barbell shoulder press', 'strength_training'),
  4: is('Baseball', 'baseball_softball'),
  5: is('Basketball', 'basketball'),
  6: is('Bench press', 'strength_training'),
  7: is('Bench sit-up', 'calisthenics'),
  8: is('Cycling', 'cycling'),
  9: is('Stationary cycling', 'stationary_bike'),
  10: ask('Boot camp', 'circuit_training', 'hiit'),
  11: is('Boxing', 'boxing'),
  12: is('Burpee', 'calisthenics'),
  13: is('Calisthenics', 'calisthenics'),
  14: is('Cricket', 'cricket'),
  15: is('Crunch', 'calisthenics'),
  16: is('Dancing', 'dancing'),
  17: is('Deadlift', 'strength_training'),
  18: is('Dumbbell curl', 'strength_training'),
  19: is('Dumbbell curl', 'strength_training'),
  20: is('Dumbbell front raise', 'strength_training'),
  21: is('Dumbbell lateral raise', 'strength_training'),
  22: is('Dumbbell triceps extension', 'strength_training'),
  23: is('Dumbbell triceps extension', 'strength_training'),
  24: is('Dumbbell triceps extension', 'strength_training'),
  25: is('Elliptical', 'elliptical'),
  26: ask('Exercise class', 'aerobics', 'circuit_training', 'hiit'),
  27: is('Fencing', 'fencing'),
  28: is('American football', 'football'),
  29: ask('Australian football', 'rugby', 'soccer'),
  30: is('Forward twist', 'calisthenics'),
  31: ask('Frisbee', 'ultimate_frisbee', 'frisbee', 'disc_golf'),
  32: is('Golf', 'golf'),
  // Not exercise, and the app has no activity for it.
  33: { ...ask('Guided breathing'), ignore: true },
  34: ask('Gymnastics', 'calisthenics'),
  35: is('Handball', 'handball'),
  36: is('High-intensity interval training', 'hiit'),
  37: is('Hiking', 'hiking'),
  38: is('Ice hockey', 'ice_hockey'),
  39: is('Ice skating', 'ice_skating'),
  40: is('Jumping jack', 'calisthenics'),
  41: is('Jump rope', 'jump_rope'),
  42: is('Lat pull-down', 'strength_training'),
  43: is('Lunge', 'strength_training'),
  44: is('Martial arts', 'martial_arts'),
  46: ask('Paddling', 'kayaking', 'canoeing', 'paddleboarding'),
  47: ask('Paragliding'),
  48: is('Pilates', 'pilates'),
  49: is('Plank', 'calisthenics'),
  50: is('Racquetball', 'racquetball'),
  51: is('Rock climbing', 'rock_climbing'),
  52: ask('Roller hockey', 'inline_skating', 'ice_hockey'),
  53: is('Rowing', 'rowing_outdoor'),
  54: is('Rowing machine', 'rowing_machine'),
  55: is('Rugby', 'rugby'),
  56: is('Running', 'running'),
  57: is('Treadmill running', 'running'),
  58: ask('Sailing'),
  59: ask('Scuba diving'),
  60: ask('Skating', 'inline_skating', 'ice_skating', 'roller_skating'),
  // Health Connect has one type for downhill and cross-country.
  61: ask('Skiing', 'downhill_skiing', 'cross_country_skiing'),
  62: is('Snowboarding', 'snowboarding'),
  63: ask('Snowshoeing', 'hiking'),
  64: is('Soccer', 'soccer'),
  65: is('Softball', 'baseball_softball'),
  66: is('Squash', 'squash'),
  67: is('Squat', 'strength_training'),
  68: is('Stair climbing', 'stair_climbing'),
  69: is('Stair machine', 'stair_machine'),
  70: is('Strength training', 'strength_training'),
  71: is('Stretching', 'stretching'),
  72: is('Surfing', 'surfing'),
  73: is('Open water swimming', 'open_water_swimming'),
  74: is('Pool swimming', 'swimming'),
  75: is('Table tennis', 'table_tennis'),
  76: is('Tennis', 'tennis'),
  77: is('Upper twist', 'calisthenics'),
  78: is('Volleyball', 'volleyball'),
  79: is('Walking', 'walking'),
  80: is('Water polo', 'water_polo'),
  81: is('Weightlifting', 'strength_training'),
  82: ask('Wheelchair'),
  83: is('Yoga', 'yoga'),
};

/** A type this table does not know (a newer Health Connect): the screen asks. */
const UNKNOWN: HealthSport = ask('Workout');

/** The app activity for a Health Connect exercise type. Ids the catalogue does not have are dropped, so the table cannot name a missing activity. */
export function healthConnectSport(type: number): HealthSport {
  const row = HEALTH_CONNECT_TYPES[type] ?? UNKNOWN;
  const known = (id: string) => id in ACTIVITY_BY_ID;
  return {
    ...row,
    activityId: row.activityId && known(row.activityId) ? row.activityId : null,
    alternatives: row.alternatives.filter(known),
  };
}
