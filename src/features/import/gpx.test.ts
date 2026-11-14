import { describe, expect, it } from 'vitest';

import { haversineM, readGpx } from './gpx';

const pt = (lat: number, lon: number, time: string | null, hr?: number) =>
  `<trkpt lat="${lat}" lon="${lon}">${time ? `<time>${time}</time>` : ''}${hr ? `<extensions><ns3:TrackPointExtension><ns3:hr>${hr}</ns3:hr></ns3:TrackPointExtension></extensions>` : ''}</trkpt>`;

const gpx = (segments: string[], type: string | null = 'running') => `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Garmin Connect" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><time>2024-09-19T11:05:15.000Z</time></metadata>
  <trk><name>Avinger Running</name>${type ? `<type>${type}</type>` : ''}${segments.map((s) => `<trkseg>${s}</trkseg>`).join('')}</trk>
</gpx>`;

describe('readGpx', () => {
  it('measures distance from coordinates and duration from the first to the last point', () => {
    // 0.01 degrees of latitude per step on the mean-radius sphere is 1111.95 m.
    const seg = [pt(52.0, 5.0, '2024-09-19T11:05:15Z', 130), pt(52.01, 5.0, '2024-09-19T11:10:15Z', 140), pt(52.02, 5.0, '2024-09-19T11:15:15.000Z', 150)].join('');
    const { workouts, warnings } = readGpx(gpx([seg]), 'run.gpx');
    expect(workouts[0]).toMatchObject({
      format: 'gpx', startUtc: '2024-09-19T11:05:15Z', durationSec: 600, elapsedSec: 600, durationIncludesPauses: true, kcal: null,
      avgHeartRate: 140, maxHeartRate: 150, sport: 'running', title: 'Avinger Running', device: 'Garmin Connect',
    });
    expect(workouts[0].distanceM).toBeCloseTo(2223.9, 0);
    expect(warnings.map((w) => w.code)).toEqual(['gpx-no-timer']);
    expect(warnings[0].message).toBe('GPX files carry no calories and no moving time: the duration includes any pauses, distance is measured from the map points, and calories will be estimated.');
  });

  it('does not count distance across a break between segments', () => {
    const a = [pt(52.0, 5.0, '2024-01-01T10:00:00Z'), pt(52.01, 5.0, '2024-01-01T10:05:00Z')].join('');
    const b = [pt(53.0, 5.0, '2024-01-01T10:10:00Z'), pt(53.01, 5.0, '2024-01-01T10:15:00Z')].join('');
    const w = readGpx(gpx([a, b])).workouts[0];
    expect(w.distanceM).toBeCloseTo(2223.9, 0);
    expect(w.durationSec).toBe(900);
  });

  it('keeps an empty sport when the track has no type (older Garmin exports)', () => {
    const seg = [pt(52, 5, '2024-01-01T10:00:00Z'), pt(52.001, 5, '2024-01-01T10:01:00Z')].join('');
    expect(readGpx(gpx([seg], null)).workouts[0].sport).toBe('');
  });

  it('haversine is symmetric and zero for the same point', () => {
    expect(haversineM(10, 20, 10, 20)).toBe(0);
    expect(haversineM(0, 0, 0, 1)).toBeCloseTo(haversineM(0, 1, 0, 0), 9);
    expect(haversineM(0, 0, 0, 1)).toBeCloseTo(111195.08, 1);
  });

  it('gives clear errors for routes, untimed tracks and other files', () => {
    expect(() => readGpx(gpx([[pt(52, 5, null), pt(52.1, 5, null)].join('')]))).toThrow('This GPX file has no times on its points, so the workout length is unknown.');
    expect(() => readGpx('<gpx xmlns="http://www.topografix.com/GPX/1/1"><rte><rtept lat="1" lon="2"/></rte></gpx>')).toThrow(
      'This GPX file has no recorded track (it may be a route or a set of waypoints).',
    );
    expect(() => readGpx('<kml></kml>')).toThrow('This file is not a GPX file.');
    expect(() => readGpx('<gpx><trk>')).toThrow('This file is not a readable GPX file (the XML inside is broken).');
  });
});
