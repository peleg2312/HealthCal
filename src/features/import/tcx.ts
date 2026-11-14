/**
 * TCX (Garmin Training Center Database v2) reader. TCX has no activity
 * totals: duration, distance and calories are sums over the laps, and lap
 * TotalTimeSeconds is timer time. Sport is only Running, Biking or Other.
 */
import { isoSeconds, parseIsoInstant } from './time';
import { ImportError, plural, warn, type ImportedWorkout, type ImportWarning, type ReadResult } from './types';
import { children, descendants, numberOf, parseXml, path, textOf, XmlSyntaxError, type XmlElement } from './xml';

export const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
const TCX_V1_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v1';

export function readTcx(text: string, fileName = 'file.tcx'): ReadResult {
  let root: XmlElement;
  try {
    root = parseXml(text);
  } catch (e) {
    if (e instanceof XmlSyntaxError) throw new ImportError('not-tcx', 'This file is not a readable TCX file (the XML inside is broken).', fileName);
    throw e;
  }
  if (root.name !== 'TrainingCenterDatabase') {
    throw new ImportError('not-tcx', 'This file is not a TCX file.', fileName);
  }
  if (root.ns === TCX_V1_NS) {
    throw new ImportError('not-tcx', 'This is an old TCX version 1 file. Export the activity again from Garmin Connect as TCX or as the original FIT file.', fileName);
  }
  // Exporters always declare v2; accept a missing namespace too (hand-edited files) but nothing else.
  const ns = root.ns === TCX_NS ? TCX_NS : root.ns === '' ? '' : null;
  if (ns === null) throw new ImportError('not-tcx', 'This file is not a TCX file.', fileName);

  const activitiesEl = children(root, 'Activities', ns)[0];
  const activities = activitiesEl ? descendants(activitiesEl, 'Activity', ns) : [];
  const warnings: ImportWarning[] = [];
  const workouts: ImportedWorkout[] = [];
  let noLaps = 0;

  activities.forEach((act, i) => {
    const laps = children(act, 'Lap', ns);
    let duration = 0;
    let distance = 0;
    let hasDistance = false;
    let kcal = 0;
    let hasKcal = false;
    let hrWeighted = 0;
    let hrSeconds = 0;
    let maxHr: number | null = null;
    let firstLapStart = Number.NaN;
    for (const lap of laps) {
      const t = numberOf(path(lap, ['TotalTimeSeconds'], ns)) ?? 0;
      duration += t;
      const d = numberOf(path(lap, ['DistanceMeters'], ns));
      if (d !== null) {
        distance += d;
        hasDistance = true;
      }
      const c = numberOf(path(lap, ['Calories'], ns));
      if (c !== null) {
        kcal += c;
        hasKcal = true;
      }
      const hr = numberOf(path(lap, ['AverageHeartRateBpm', 'Value'], ns));
      if (hr !== null && hr > 0 && t > 0) {
        hrWeighted += hr * t;
        hrSeconds += t;
      }
      const mx = numberOf(path(lap, ['MaximumHeartRateBpm', 'Value'], ns));
      if (mx !== null && mx > 0) maxHr = Math.max(maxHr ?? 0, mx);
      const ls = parseIsoInstant(lap.attrs.StartTime);
      if (Number.isFinite(ls) && !(ls >= firstLapStart)) firstLapStart = ls;
    }

    // Activity Id is the start time in UTC; fall back to the first lap's start.
    let startMs = parseIsoInstant(textOf(path(act, ['Id'], ns)));
    if (!Number.isFinite(startMs)) startMs = firstLapStart;
    if (laps.length === 0 || !(duration > 0) || !Number.isFinite(startMs)) {
      noLaps += 1;
      return;
    }

    // Average heart rate: time-weighted lap averages, else the mean of trackpoints.
    let avgHr: number | null = hrSeconds > 0 ? Math.round(hrWeighted / hrSeconds) : null;
    if (avgHr === null) {
      let sum = 0;
      let count = 0;
      for (const tp of descendants(act, 'Trackpoint', ns)) {
        const v = numberOf(path(tp, ['HeartRateBpm', 'Value'], ns));
        if (v !== null && v > 0) {
          sum += v;
          count += 1;
          maxHr = Math.max(maxHr ?? 0, v);
        }
      }
      if (count > 0) avgHr = Math.round(sum / count);
    }

    const sport = act.attrs.Sport?.trim() || 'Other';
    workouts.push({
      format: 'tcx',
      fileName,
      index: i + 1,
      startUtc: isoSeconds(startMs),
      startFromLocalTime: false,
      durationSec: Math.round(duration * 1000) / 1000,
      elapsedSec: null,
      durationIncludesPauses: false,
      distanceM: hasDistance ? Math.round(distance * 100) / 100 : null,
      kcal: hasKcal ? Math.round(kcal) : null,
      avgHeartRate: avgHr,
      maxHeartRate: maxHr,
      sport,
      subSport: null,
      title: textOf(path(act, ['Notes'], ns)),
      device: textOf(path(act, ['Creator', 'Name'], ns)),
    });
  });

  // Multisport sessions hold several activities, one per leg.
  if (workouts.length > 1 && activitiesEl && children(activitiesEl, 'MultiSportSession', ns).length > 0) {
    workouts.forEach((w, i) => (w.leg = { number: i + 1, of: workouts.length }));
  }
  if (noLaps > 0 && workouts.length > 0) {
    warnings.push(warn('tcx-no-laps', `${plural(noLaps, 'activity', 'activities')} in this file had no laps with a time and ${noLaps === 1 ? 'was' : 'were'} skipped.`, fileName));
  }
  if (workouts.length === 0) {
    throw new ImportError('tcx-no-workouts', activities.length ? 'This TCX file has no laps with a time, so there is nothing to import.' : 'This TCX file has no activities in it (it may be a course or a workout plan).', fileName);
  }
  return { workouts, warnings };
}
