/**
 * Words for a night read from a health store (src/features/health-sync writes
 * them into the 'sleep' collection). Where it came from is the app or the kind
 * of Apple device, never a device's or a person's name; a night from the Health
 * app's export file says so whatever wrote it.
 */
import { originName } from '@/features/health-sync/origins';
import type { SleepEntry, SleepStages } from '@/types';

import { formatHours } from './helpers';

/** 'Garmin Connect', 'Apple Watch', 'your Health export'; null for a night entered by hand. */
export function sleepFrom(entry: Pick<SleepEntry, 'source' | 'store' | 'origin'>): string | null {
  if (entry.source !== 'health') return null;
  if (entry.store === 'file') return 'your Health export';
  return entry.origin ? originName(entry.origin) : 'your health app';
}

/** "From Garmin Connect", or null for a night entered by hand. */
export function sleepFromLine(entry: Pick<SleepEntry, 'source' | 'store' | 'origin'>): string | null {
  const from = sleepFrom(entry);
  return from ? `From ${from}` : null;
}

/** Minutes as the app writes a duration: "45 min", "1 h", "1 h 20 min". */
const minutes = (m: number) => formatHours(Math.max(0, m) / 60);

const NBSP = '\u00A0';

/**
 * "Light 3 h 40 min · Deep 1 h 5 min · REM 1 h 50 min · Awake 25 min", or null when
 * the night has no stages. Awake is shown for what it is and is not part of the
 * night's hours. `Text` keeps each number with its unit but not a stage's name with
 * its time, so the name is joined to it here with a no-break space, and so is the
 * space before each "·": the line breaks only after a separator, never between
 * "REM" and "1 h 35 min" and never with a line starting "· Awake".
 */
export function stagesLine(stages: SleepStages | null | undefined): string | null {
  if (!stages) return null;
  const stage = (name: string, m: number) => `${name}${NBSP}${minutes(m)}`;
  const parts = [stage('Light', stages.light), stage('Deep', stages.deep), stage('REM', stages.rem)];
  if (stages.awake > 0) parts.push(stage('Awake', stages.awake));
  return parts.join(`${NBSP}· `);
}
