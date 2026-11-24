/**
 * Train's one way to bring workouts in from elsewhere ("Bring in workouts", a row with a chevron
 * under Log activity and Workout) and the choices its sheet offers: automatic sync, a file import
 * (Garmin's files or the Health app's export) and, where sync cannot read steps, the steps from the
 * Health export. The words only; `BringIn.tsx` places them. Pure.
 */
import type { HealthStore } from '@/features/health-sync/types';
import { syncReach } from '@/features/health-sync/reach';

export interface BringInState {
  /** Workout sync is switched on, on this phone. */
  enabled: boolean;
  /** Workouts waiting in "Needs a look". */
  waiting: number;
  /** The last sync did not finish. */
  attention: boolean;
  /** The health store this build reads, or null (the browser, an iPad without Apple Health). */
  store: HealthStore | null;
  /** Steps are offered from the Health export: not on Android, sync off and no steps on this phone yet. */
  offerSteps: boolean;
}

export const BRING_IN_TITLE = 'Bring in workouts';

export type BringInChoice = 'sync' | 'import' | 'steps';

export interface ChoiceWords {
  title: string;
  line: string;
  /** Something waits for the person: the row wears the amber key. */
  flag: boolean;
}

const storeName = (store: HealthStore) => (store === 'apple-health' ? 'Apple Health' : 'Health Connect');

/** Something waits only while sync is on; the row and the sheet say the same thing then. */
function waitingLine(s: BringInState): string | null {
  if (!s.enabled) return null;
  if (s.waiting > 0) return `${s.waiting} ${s.waiting === 1 ? 'workout needs' : 'workouts need'} a look`;
  if (s.attention) return 'The last sync did not finish';
  return null;
}

/** The line under "Bring in workouts" on Train, and whether the row wears the amber key. */
export function bringInLine(s: BringInState): { line: string; flag: boolean } {
  const waiting = waitingLine(s);
  if (waiting) return { line: waiting, flag: true };
  if (s.enabled) return { line: 'Workout sync is on', flag: false };
  return { line: s.store ? 'Sync automatically or import a file' : 'Garmin files or the Health app’s export', flag: false };
}

/** The sheet's choices in order: sync first where this build can sync, last where it cannot. */
export function bringInChoices(s: BringInState): BringInChoice[] {
  const files: BringInChoice[] = s.offerSteps ? ['import', 'steps'] : ['import'];
  return s.store ? ['sync', ...files] : [...files, 'sync'];
}

/** One choice's words: a row's title and its line (a screen reader reads the two together). */
export function choiceWords(choice: BringInChoice, s: BringInState): ChoiceWords {
  if (choice === 'import') {
    return { title: 'Import workouts', line: 'Garmin files or the Health app’s export', flag: false };
  }
  if (choice === 'steps') {
    return { title: 'Add steps from your Health export', line: 'Shown on Train, never added to your budget', flag: false };
  }
  const waiting = waitingLine(s);
  if (!s.enabled) {
    const title = s.store ? 'Sync automatically' : 'Automatic sync';
    const line = s.store ? `Workouts from ${storeName(s.store)}, by themselves` : syncReach('web', false).profile;
    return { title, line, flag: false };
  }
  if (waiting) return { title: 'Workout sync', line: waiting, flag: true };
  return { title: 'Workout sync', line: s.store ? `On, from ${storeName(s.store)}` : 'On', flag: false };
}
