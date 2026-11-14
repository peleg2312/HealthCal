/**
 * GPX 1.1 / 1.0 reader. A GPX track has no calories, laps, distance or timer
 * time: duration is the span from the first to the last timed point (pauses
 * included) and distance is summed from the coordinates (great-circle, 2D).
 * Heart rate comes from Garmin's TrackPointExtension (any prefix).
 */
import { isoSeconds, parseIsoInstant } from './time';
import { ImportError, plural, warn, type ImportedWorkout, type ImportWarning, type ReadResult } from './types';
import { child, children, descendants, parseXml, textOf, XmlSyntaxError, type XmlElement } from './xml';

const GPX_NS = new Set(['http://www.topografix.com/GPX/1/1', 'http://www.topografix.com/GPX/1/0', '']);

/** Mean Earth radius (IUGG), metres. */
const EARTH_RADIUS_M = 6371008.8;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function readGpx(text: string, fileName = 'file.gpx'): ReadResult {
  let root: XmlElement;
  try {
    root = parseXml(text);
  } catch (e) {
    if (e instanceof XmlSyntaxError) throw new ImportError('not-gpx', 'This file is not a readable GPX file (the XML inside is broken).', fileName);
    throw e;
  }
  if (root.name !== 'gpx' || !GPX_NS.has(root.ns)) throw new ImportError('not-gpx', 'This file is not a GPX file.', fileName);
  const ns = root.ns;
  const tracks = children(root, 'trk', ns);
  const warnings: ImportWarning[] = [];
  const workouts: ImportedWorkout[] = [];
  let untimed = 0;
  const metaName = textOf(child(child(root, 'metadata', ns), 'name', ns));

  tracks.forEach((trk, i) => {
    let first = Number.NaN;
    let last = Number.NaN;
    let distance = 0;
    let points = 0;
    let hrSum = 0;
    let hrCount = 0;
    let hrMax: number | null = null;
    for (const seg of children(trk, 'trkseg', ns)) {
      let prev: { lat: number; lon: number } | null = null;
      for (const pt of children(seg, 'trkpt', ns)) {
        const lat = Number(pt.attrs.lat);
        const lon = Number(pt.attrs.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          // Distance is not carried across a segment break (the recording was stopped there).
          if (prev) distance += haversineM(prev.lat, prev.lon, lat, lon);
          prev = { lat, lon };
          points += 1;
        }
        const t = parseIsoInstant(textOf(child(pt, 'time', ns)));
        if (Number.isFinite(t)) {
          if (!(t >= first)) first = t;
          if (!(t <= last)) last = t;
        }
        const ext = child(pt, 'extensions', ns);
        if (ext) {
          const hrEl = descendants(ext, 'hr')[0] ?? descendants(ext, 'heartrate')[0];
          const hr = hrEl ? Number(textOf(hrEl)) : Number.NaN;
          if (Number.isFinite(hr) && hr > 0) {
            hrSum += hr;
            hrCount += 1;
            hrMax = Math.max(hrMax ?? 0, hr);
          }
        }
      }
    }
    if (!Number.isFinite(first) || !(last > first)) {
      untimed += 1;
      return;
    }
    const type = textOf(child(trk, 'type', ns));
    workouts.push({
      format: 'gpx',
      fileName,
      index: i + 1,
      startUtc: isoSeconds(first),
      startFromLocalTime: false,
      durationSec: Math.round(last - first) / 1000,
      elapsedSec: Math.round(last - first) / 1000,
      durationIncludesPauses: true,
      distanceM: points > 1 ? Math.round(distance * 10) / 10 : null,
      kcal: null,
      avgHeartRate: hrCount ? Math.round(hrSum / hrCount) : null,
      maxHeartRate: hrMax,
      sport: type ?? '',
      subSport: null,
      title: textOf(child(trk, 'name', ns)) ?? metaName,
      device: root.attrs.creator?.trim() || null,
    });
  });

  if (workouts.length === 0) {
    throw new ImportError(
      'gpx-no-workouts',
      tracks.length ? 'This GPX file has no times on its points, so the workout length is unknown.' : 'This GPX file has no recorded track (it may be a route or a set of waypoints).',
      fileName,
    );
  }
  warnings.push(warn('gpx-no-timer', 'GPX files carry no calories and no moving time: the duration includes any pauses, distance is measured from the map points, and calories will be estimated.', fileName));
  if (untimed > 0) {
    warnings.push(warn('gpx-no-time', `${plural(untimed, 'track', 'tracks')} in this file had no times and ${untimed === 1 ? 'was' : 'were'} skipped.`, fileName));
  }
  return { workouts, warnings };
}
