#!/usr/bin/env node
// Checks the Garmin import readers (src/features/import) against real sample
// files and their independently decoded values.
// For FIT files it also checks the recording's UTC offset, from the activity
// message's local_timestamp, which decides the day a workout is filed under.
//
//   node scripts/dev/check-garmin-samples.mjs <samples-folder>
//
// The folder holds the sample files and expected.json (FIT values agreed by
// fitdecode, Garmin's FIT JavaScript SDK and a hand-written reader; TCX by
// python-tcxparser; GPX by gpxpy; CSV by Python's csv module). Every file is
// run through readImportFile and sport, start, timer duration, distance,
// calories and heart rate are compared. Each difference is printed; the exit
// code is 1 when there is any.
//
// The TypeScript sources are bundled with rolldown (already installed with
// vitest) into a temporary folder, so this runs on plain Node.
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = process.argv[2];
if (!folder || !existsSync(path.join(folder, 'expected.json'))) {
  console.error('Usage: node scripts/dev/check-garmin-samples.mjs <folder with the samples and expected.json>');
  process.exit(2);
}

async function loadImporter() {
  const { build } = await import(pathToFileURL(path.join(root, 'node_modules/rolldown/dist/index.mjs')).href);
  const out = mkdtempSync(path.join(tmpdir(), 'garmin-check-'));
  const file = path.join(out, 'import.mjs');
  await build({
    input: path.join(root, 'src/features/import/index.ts'),
    resolve: { alias: { '@': path.join(root, 'src') } },
    output: { file, format: 'esm' },
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(file).href);
  rmSync(out, { recursive: true, force: true });
  return mod;
}

const { readImportFile, suggestActivity } = await loadImporter();
const expected = JSON.parse(readFileSync(path.join(folder, 'expected.json'), 'utf8')).files;

let differences = 0;
let checks = 0;
const lines = [];
const say = (s) => lines.push(s);

function compare(label, got, want, tolerance = 0) {
  checks += 1;
  const bothNull = (got === null || got === undefined) && (want === null || want === undefined);
  const ok = bothNull || (typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) <= tolerance : got === want);
  if (!ok) {
    differences += 1;
    say(`    DIFF ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
  return ok;
}

const iso = (s) => (s ? s.replace(/\.000Z$/, 'Z') : s);
const fmt = (w) =>
  `${w.sport}${w.subSport ? '/' + w.subSport : ''} ${w.startUtc}${w.startFromLocalTime ? ' (from local time)' : ''} ${w.durationSec}s ${w.distanceM ?? '-'}m ${w.kcal ?? '-'}kcal hr ${w.avgHeartRate ?? '-'} -> ${suggestActivity(w).activityId ?? 'ask'}`;

// CSV dates are wall time with no zone; reading them as UTC makes startUtc equal the written time.
const csvOptions = { distanceUnit: 'km', timeZone: 'UTC' };

for (const [name, exp] of Object.entries(expected)) {
  const full = path.join(folder, name);
  if (!existsSync(full)) {
    say(`${name}: MISSING FILE`);
    differences += 1;
    continue;
  }
  const bytes = new Uint8Array(readFileSync(full));
  const before = differences;
  const batch = readImportFile(bytes, name, { csv: csvOptions, timeZone: 'UTC' });
  const ws = batch.workouts;
  say(`${name} [${exp.format}] -> ${ws.length} workout(s)`);
  for (const e of batch.errors) say(`    error ${e.code}: ${e.message}`);
  for (const w of batch.warnings) say(`    warning ${w.code}: ${w.message}`);

  if (exp.format === 'fit') {
    compare('session count', ws.length, exp.num_sessions);
    exp.sessions.forEach((s, i) => {
      const w = ws[i];
      if (!w) return;
      say(`    ${i + 1}. ${fmt(w)}`);
      compare(`#${i + 1} sport`, w.sport, s.sport);
      compare(`#${i + 1} sub sport`, w.subSport, s.sub_sport);
      if (s.start_utc === null) {
        // System-time start: no true UTC exists. The reader must say it came from local time.
        compare(`#${i + 1} start flagged as local time`, w.startFromLocalTime, true);
        say(`       (expected start is unknown: raw system time ${s.start_system_time_raw}; reader used local wall time ${w.startUtc.replace('Z', '')})`);
      } else compare(`#${i + 1} start`, w.startUtc, iso(s.start_utc));
      compare(`#${i + 1} timer duration`, w.durationSec, s.duration_s, 0.001);
      compare(`#${i + 1} elapsed`, w.elapsedSec, s.elapsed_s, 0.001);
      compare(`#${i + 1} distance`, w.distanceM, s.distance_m, 0.01);
      compare(`#${i + 1} calories`, w.kcal, s.calories);
      compare(`#${i + 1} avg heart rate`, w.avgHeartRate, s.avg_hr);
      compare(`#${i + 1} max heart rate`, w.maxHeartRate, s.max_hr);
      // The recording's UTC offset (local_timestamp minus timestamp) decides the entry's day.
      // A clock that was never set takes the zone the person chose (here UTC), not one from the file.
      if ('utc_offset_min' in exp && !w.startFromLocalTime) compare(`#${i + 1} recording UTC offset (min)`, w.utcOffsetMin ?? null, exp.utc_offset_min);
    });
  } else if (exp.format === 'tcx') {
    compare('workout count', ws.length, 1);
    const w = ws[0];
    if (w) {
      say(`    ${fmt(w)}`);
      compare('sport', w.sport, exp.sport_attr);
      compare('start', w.startUtc, iso(exp.start_utc));
      compare('timer duration', w.durationSec, exp.duration_s, 0.001);
      compare('distance', w.distanceM, exp.distance_m, 0.01);
      compare('calories', w.kcal, exp.calories);
      const hr = exp.avg_hr_lap_time_weighted ?? exp.avg_hr_trackpoint_mean;
      compare('avg heart rate (lap time-weighted, rounded)', w.avgHeartRate, hr === null ? null : Math.round(hr));
      compare('device', w.device, exp.creator);
    }
  } else if (exp.format === 'gpx') {
    compare('workout count', ws.length, 1);
    const w = ws[0];
    if (w) {
      say(`    ${fmt(w)}`);
      compare('type', w.sport, exp.type);
      compare('start', w.startUtc, iso(exp.start_utc));
      compare('duration (first to last point)', w.durationSec, exp.elapsed_s_first_to_last_point, 0.5);
      // gpxpy and this reader use different Earth models: allow 0.5%.
      const tol = exp.distance_m_gpxpy_2d * 0.005;
      if (compare('distance (2D, within 0.5% of gpxpy)', w.distanceM, exp.distance_m_gpxpy_2d, tol)) {
        say(`       distance ${w.distanceM} m vs gpxpy 2D ${exp.distance_m_gpxpy_2d} m (${(((w.distanceM - exp.distance_m_gpxpy_2d) / exp.distance_m_gpxpy_2d) * 100).toFixed(2)}%)`);
      }
      compare('calories', w.kcal, null);
      compare('avg heart rate (point mean, rounded)', w.avgHeartRate, Math.round(exp.avg_hr_trackpoint_mean));
    }
  } else if (exp.format === 'garmin-connect-activities-csv') {
    compare('row count', ws.length, exp.rows);
    const rows = exp.first_row_of_each_type ?? [];
    if (exp.first_row) {
      const r = exp.first_row;
      const dur = (s) => s.split(':').reduce((a, b) => a * 60 + Number(b), 0);
      rows.push({
        activity_type: r['Activity Type'], date_local: r.Date, title: r.Title, distance_m: Number(r.Distance) * 1000,
        calories: Number(r.Calories), duration_s: dur(r['Total Time']), elapsed_s: dur(r['Elapsed Time']), avg_hr: Number(r['Avg HR']),
      });
    }
    for (const r of rows) {
      const start = r.date_local.replace(' ', 'T') + 'Z';
      const w = ws.find((x) => x.startUtc === start && x.sport === r.activity_type);
      if (!compare(`row ${r.activity_type} ${r.date_local} found`, !!w, true)) continue;
      say(`    ${fmt(w)}`);
      compare(`${r.activity_type} title`, w.title, r.title);
      compare(`${r.activity_type} distance`, w.distanceM, r.distance_m, 0.01);
      compare(`${r.activity_type} calories`, w.kcal, r.calories);
      compare(`${r.activity_type} timer duration`, w.durationSec, r.duration_s, 0.001);
      compare(`${r.activity_type} elapsed`, w.elapsedSec, r.elapsed_s, 0.001);
      compare(`${r.activity_type} avg heart rate`, w.avgHeartRate, r.avg_hr);
    }
    if (name === 'Activities.csv') {
      // Every row's duration must not exceed its elapsed time (Time is timer time).
      const over = ws.filter((w) => w.elapsedSec !== null && w.durationSec > w.elapsedSec + 0.5);
      compare('rows with duration above elapsed', over.length, 0);
      const unmatched = [...new Set(ws.filter((w) => !suggestActivity(w).activityId).map((w) => w.sport))];
      say(`    types left for the person to choose: ${unmatched.join(', ') || 'none'}`);
    }
  } else if (name === 'Activities-de-synthetic.csv') {
    // Hand-made fixture with no decoded values: check what the fixture itself states.
    // Every row is "3,83" km, 1.057 kcal, "00:08:51,6", dated 2025-11-07 12:28:57 (one 2024).
    compare('row count', ws.length, 9);
    for (const w of ws) {
      say(`    ${fmt(w)}`);
      compare(`${w.sport} distance (3,83 km)`, w.distanceM, 3830, 0.01);
      compare(`${w.sport} calories (1.057)`, w.kcal, 1057);
      compare(`${w.sport} duration (00:08:51,6)`, w.durationSec, 531.6, 0.001);
    }
    const ids = ws.map((w) => `${w.sport}->${suggestActivity(w).activityId ?? 'ask'}`);
    say(`    mapping: ${ids.join(', ')}`);
  } else {
    say('    (no expected values for this format)');
  }
  say(`    ${differences === before ? 'OK' : `${differences - before} difference(s)`}`);
}

console.log(lines.join('\n'));
console.log(`\n${checks} checks, ${differences} difference(s).`);
process.exit(differences ? 1 : 0);
