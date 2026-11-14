/**
 * iPhone: Apple Health is not read yet, so this is the "not available here"
 * adapter. An Apple Health adapter replaces this one file: it implements
 * HealthAdapter (types.ts) with `store: 'apple-health'`, returns HealthWorkout
 * with HealthKit's workout type numbers, and adds its type table beside
 * exerciseTypes.ts (convert.ts, `sportOf`). No rule changes.
 */
export { unsupportedAdapter as adapter } from './unsupported';
