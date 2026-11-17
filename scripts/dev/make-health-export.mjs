#!/usr/bin/env node
/**
 * Writes a synthetic Health app export ("Export All Health Data") as a real
 * export.zip, streamed to disk so it can be any size, for the import's browser
 * test and its measurement. Nothing in it is real: a made-up person, made-up devices.
 *
 *   node scripts/dev/make-health-export.mjs --out=<file.zip> [--mb=1000] [--workouts=300] [--now=<ISO>]
 *        [--zip64] [--no-descriptors] [--xml]
 *
 *   --mb           size of export.xml, uncompressed, in MB (default 20). Mostly heart-rate Records, as a
 *                  real export with a watch is.
 *   --workouts     how many workouts (default 300): both generations of <Workout> (totals on the element
 *                  before 2022, WorkoutStatistics after), every few a second reading of the same session
 *                  from "Garmin Connect", a few "Other" that the review list asks about, and rests.
 *   --now          the export's date (default: now). Steps cover the 40 days before it, from an iPhone
 *                  and an Apple Watch that count the same walks. Sleep covers the 41 nights before it:
 *                  the watch's stages (core, deep, REM, short spells awake, with HKTimeZone Europe/Berlin
 *                  and its dates written in Berlin's offset, so the night of 25 October crosses the clock
 *                  change), the iPhone's "in bed" block around each night, a 30-minute nap every sixth
 *                  day, and every ninth night the watch was charging (only the iPhone's in bed: no night).
 *   --zip64        write zip64 records for every entry (an archive over 4 GB has them anyway).
 *   --no-descriptors  write sizes in the local headers instead of data descriptors after the data
 *                  (the Health app writes descriptors, so they are the default).
 *   --xml          write a bare export.xml instead of a ZIP.
 *
 * Beside the output it writes <out>.expected.json: the workouts the import should save (by start),
 * the step total per day by the import's rule (per clock hour, the source with more steps over the
 * window, else the other; in UTC: the browser test runs in UTC), the nights the import should save
 * (`nights`: wake day in Berlin, hours asleep with time awake left out, inside the import's 28-day
 * window and finished 15 minutes before the export), the wake days of the charging nights and the
 * naps (`noNight`, `naps`), and the export date.
 *
 * Decoys in the ZIP, which the import must never read: apple_health_export/export_cda.xml (clinical),
 * workout-routes/*.gpx (routes of workouts already in the XML) and electrocardiograms/*.csv.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const out = flags.out;
if (!out) {
  console.error('usage: make-health-export.mjs --out=<file.zip> [--mb=20] [--workouts=300] [--now=ISO] [--zip64] [--no-descriptors] [--xml]');
  process.exit(2);
}
const targetBytes = Number(flags.mb ?? 20) * 1024 * 1024;
const workoutCount = Number(flags.workouts ?? 300);
const now = flags.now ? Date.parse(flags.now) : Date.now();
const forceZip64 = !!flags.zip64;
const descriptors = !flags['no-descriptors'];

// ---------------------------------------------------------------- deterministic randomness
let seed = 20261116;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

// ---------------------------------------------------------------- dates as the Health app writes them (+0100 here)
const OFFSET_MIN = 60;
const pad = (n, w = 2) => String(n).padStart(w, '0');
function stamp(ms) {
  const d = new Date(ms + OFFSET_MIN * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0100`;
}
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Sleep is written the way the watch writes it: in the zone it was slept in, Berlin, whose offset changes on 25 October.
const BERLIN = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
function berlinOffsetMin(ms) {
  const p = Object.fromEntries(BERLIN.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60_000);
}
function stampBerlin(ms) {
  const off = berlinOffsetMin(ms);
  const d = new Date(ms + off * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +${pad(off / 60)}00`;
}
const berlinDay = (ms) => new Date(ms + berlinOffsetMin(ms) * 60_000).toISOString().slice(0, 10);
/** Berlin's midnight that starts `day`, as an instant. */
function berlinMidnight(day) {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d);
  return wall - berlinOffsetMin(wall - 60 * 60_000) * 60_000;
}
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

const WATCH = '&lt;&lt;HKDevice: 0x283a1c0f0&gt;, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch6,1, software:10.1&gt;';
const PHONE = '&lt;&lt;HKDevice: 0x283a1c2d0&gt;, name:iPhone, manufacturer:Apple Inc., model:iPhone, hardware:iPhone15,2, software:17.1&gt;';

// ---------------------------------------------------------------- the XML, piece by piece
function* xmlPieces(expected) {
  yield `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!-- HealthKit Export Version: 14 -->
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord|Audiogram|VisionPrescription)*)>
<!ATTLIST HealthData
  locale CDATA #REQUIRED
>
<!ELEMENT Workout ((MetadataEntry|WorkoutEvent|WorkoutRoute|WorkoutStatistics)*)>
]>
<HealthData locale="en_US">
 <ExportDate value="${stamp(now)}"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-04-02" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexFemale" HKCharacteristicTypeIdentifierBloodType="HKBloodTypeNotSet" HKCharacteristicTypeIdentifierFitzpatrickSkinType="HKFitzpatrickSkinTypeNotSet" HKCharacteristicTypeIdentifierCardioFitnessMedicationsUse="None"/>
`;
  let written = 0;
  // Steps: the 40 days before now, 07:00 to 21:59 local, 10-minute samples inside one clock hour each.
  const perHour = new Map(); // 'day#hourUtc' -> { phone, watch }
  const stepLines = [];
  const startDay = now - 40 * 86_400_000;
  for (let t = Math.floor(startDay / 3_600_000) * 3_600_000; t + 600_000 <= now; t += 600_000) {
    const localHour = new Date(t + OFFSET_MIN * 60_000).getUTCHours();
    if (localHour < 7 || localHour > 21 || rand() < 0.3) continue;
    const phone = Math.round(50 + rand() * 600);
    // The watch counts the same walk, a little differently; sometimes only one of them was there.
    const watch = rand() < 0.15 ? 0 : Math.round(phone * (0.85 + rand() * 0.3));
    const phoneHere = rand() < 0.9;
    const key = `${utcDay(t)}#${new Date(t).getUTCHours()}`;
    const h = perHour.get(key) ?? { phone: 0, watch: 0 };
    if (phoneHere) {
      stepLines.push(` <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Jo’s iPhone" sourceVersion="17.1" device="${PHONE}" unit="count" creationDate="${stamp(t + 600_000)}" startDate="${stamp(t)}" endDate="${stamp(t + 600_000)}" value="${phone}"/>\n`);
      h.phone += phone;
    }
    if (watch) {
      stepLines.push(` <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Jo’s Apple Watch" sourceVersion="10.1" device="${WATCH}" unit="count" creationDate="${stamp(t + 600_000)}" startDate="${stamp(t + 60_000)}" endDate="${stamp(t + 540_000)}" value="${watch}"/>\n`);
      h.watch += watch;
    }
    perHour.set(key, h);
  }
  // The import's rule (createStepTally): the source with more steps over the import's window (today and the
  // 34 days before, UTC here) leads; each hour is its count, or the other's where it has none.
  const windowFrom = utcDay(now - 34 * 86_400_000);
  let phoneTotal = 0;
  let watchTotal = 0;
  for (const [key, h] of perHour) {
    if (key.slice(0, 10) < windowFrom) continue;
    phoneTotal += h.phone;
    watchTotal += h.watch;
  }
  // Ties go by name, as in the app: "Jo’s Apple Watch" sorts before "Jo’s iPhone".
  const watchFirst = watchTotal >= phoneTotal;
  const days = {};
  for (const [key, h] of perHour) {
    const day = key.slice(0, 10);
    const first = watchFirst ? h.watch : h.phone;
    days[day] = (days[day] ?? 0) + (first > 0 ? first : watchFirst ? h.phone : h.watch);
  }
  expected.stepDays = days;

  // Sleep: the 41 nights before now. The import keeps wake days from today − 27 (SLEEP_DAYS, 28; UTC, the browser's calendar) on.
  const sleepLines = [];
  const minute = 60_000;
  const sleepRec = (source, device, start, end, value, zone) =>
    ` <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${source}" sourceVersion="10.1" device="${device}" creationDate="${stampBerlin(end)}" startDate="${stampBerlin(start)}" endDate="${stampBerlin(end)}" value="HKCategoryValueSleepAnalysis${value}"` +
    (zone ? `>\n  <MetadataEntry key="HKTimeZone" value="Europe/Berlin"/>\n </Record>\n` : '/>\n');
  expected.nights = [];
  expected.noNight = [];
  expected.naps = [];
  const sleepFrom = utcDay(now - 27 * 86_400_000);
  for (let k = 41; k >= 0; k--) {
    const wakeDay = berlinDay(now - k * 86_400_000);
    const bed = berlinMidnight(wakeDay) - (95 - Math.floor(rand() * 80)) * minute;
    const charging = k % 9 === 4;
    let t = bed + (8 + Math.floor(rand() * 15)) * minute;
    const wake = t + (380 + Math.floor(rand() * 100)) * minute;
    // A night still going on now is written later, as the watch does.
    if (wake > now) continue;
    let asleep = 0;
    if (!charging) {
      const cycle = ['AsleepCore', 'AsleepDeep', 'AsleepCore', 'AsleepREM'];
      let i = 0;
      while (t < wake) {
        const stage = cycle[i % cycle.length];
        const len = (stage === 'AsleepDeep' ? 10 + rand() * 30 : stage === 'AsleepREM' ? 10 + rand() * 25 : 15 + rand() * 35) * minute;
        const end = Math.min(wake, t + Math.round(len / minute) * minute);
        sleepLines.push(sleepRec('Jo’s Apple Watch', WATCH, t, end, stage, true));
        asleep += end - t;
        t = end;
        i++;
        if (i % 4 === 0 && t < wake - 20 * minute && rand() < 0.5) {
          const awake = (3 + Math.floor(rand() * 9)) * minute;
          sleepLines.push(sleepRec('Jo’s Apple Watch', WATCH, t, t + awake, 'Awake', true));
          t += awake;
        }
      }
    }
    // The iPhone's sleep schedule: time in bed around the night, never sleep.
    sleepLines.push(sleepRec('Jo’s iPhone', PHONE, bed - 10 * minute, wake + 8 * minute, 'InBed', false));
    const inWindow = wakeDay >= sleepFrom && wakeDay <= utcDay(now);
    if (charging) {
      if (inWindow) expected.noNight.push(wakeDay);
    } else if (inWindow && wake <= now - 15 * minute) expected.nights.push({ date: wakeDay, hours: Math.round((asleep / 3_600_000) * 100) / 100, origin: 'com.apple.health.watch' });
    // A nap in the afternoon of every sixth day: not a night.
    const napAt = berlinMidnight(wakeDay) + 14 * 60 * minute;
    if (k % 6 === 2 && napAt + 30 * minute <= now) {
      sleepLines.push(sleepRec('Jo’s Apple Watch', WATCH, napAt, napAt + 30 * minute, 'AsleepCore', true));
      expected.naps.push(wakeDay);
    }
  }

  // Workouts: spread over the last two years, the newest few in the last week.
  const TYPES = [
    ['HKWorkoutActivityTypeRunning', 'running', 'HKQuantityTypeIdentifierDistanceWalkingRunning'],
    ['HKWorkoutActivityTypeWalking', 'walking', 'HKQuantityTypeIdentifierDistanceWalkingRunning'],
    ['HKWorkoutActivityTypeCycling', 'cycling', 'HKQuantityTypeIdentifierDistanceCycling'],
    ['HKWorkoutActivityTypeTraditionalStrengthTraining', 'strength_training', null],
    ['HKWorkoutActivityTypeYoga', 'yoga', null],
    ['HKWorkoutActivityTypeHighIntensityIntervalTraining', 'hiit', null],
    ['HKWorkoutActivityTypeSwimming', 'swimming', 'HKQuantityTypeIdentifierDistanceSwimming'],
    ['HKWorkoutActivityTypeHiking', 'hiking', 'HKQuantityTypeIdentifierDistanceWalkingRunning'],
  ];
  const workoutLines = [];
  expected.saved = [];
  expected.ask = 0;
  const twoYears = 730 * 86_400_000;
  for (let i = 0; i < workoutCount; i++) {
    // Whole minutes, one a day at most, never in the future.
    const dayStart = Math.floor((now - 86_400_000 - (i / workoutCount) * twoYears) / 86_400_000) * 86_400_000;
    const start = dayStart + (6 + Math.floor(rand() * 12)) * 3_600_000 + Math.floor(rand() * 60) * 60_000;
    const minutes = 20 + Math.floor(rand() * 70);
    const end = start + minutes * 60_000;
    const kind = i % 37 === 5 ? 'other' : i % 41 === 7 ? 'rest' : 'known';
    const [type, activity, distType] = kind === 'other' ? ['HKWorkoutActivityTypeOther', null, null] : kind === 'rest' ? ['HKWorkoutActivityTypeTransition', null, null] : TYPES[i % TYPES.length];
    const kcal = Math.round(minutes * (5 + rand() * 7));
    const km = distType ? Math.round(minutes * (activity === 'cycling' ? 0.4 : activity === 'swimming' ? 0.03 : 0.15) * 100) / 100 : null;
    const older = start < Date.parse('2022-09-12T00:00:00Z');
    if (older) {
      const dist = km !== null ? ` totalDistance="${km}" totalDistanceUnit="km"` : '';
      workoutLines.push(` <Workout workoutActivityType="${type}" duration="${minutes}" durationUnit="min"${dist} totalEnergyBurned="${kcal}" totalEnergyBurnedUnit="kcal" sourceName="Jo’s Apple Watch" sourceVersion="8.7" device="${WATCH}" creationDate="${stamp(end)}" startDate="${stamp(start)}" endDate="${stamp(end)}">\n  <MetadataEntry key="HKTimeZone" value="Europe/Berlin"/>\n </Workout>\n`);
    } else {
      const meta = activity === 'swimming' ? '  <MetadataEntry key="HKSwimmingLocationType" value="1"/>\n' : '  <MetadataEntry key="HKIndoorWorkout" value="0"/>\n';
      const dist = km !== null ? `  <WorkoutStatistics type="${distType}" startDate="${stamp(start)}" endDate="${stamp(end)}" sum="${km}" unit="km"/>\n` : '';
      workoutLines.push(
        ` <Workout workoutActivityType="${type}" duration="${minutes}" durationUnit="min" sourceName="Jo’s Apple Watch" sourceVersion="10.1" device="${WATCH}" creationDate="${stamp(end)}" startDate="${stamp(start)}" endDate="${stamp(end)}">\n` +
          meta +
          `  <WorkoutEvent type="HKWorkoutEventTypeSegment" date="${stamp(start)}" duration="${minutes / 2}" durationUnit="min"/>\n` +
          `  <WorkoutActivity uuid="${i}" startDate="${stamp(start)}" endDate="${stamp(end)}" duration="${minutes}" durationUnit="min">\n   <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="${stamp(start)}" endDate="${stamp(end)}" sum="${kcal}" unit="Cal"/>\n  </WorkoutActivity>\n` +
          `  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="${stamp(start)}" endDate="${stamp(end)}" sum="${kcal}" unit="Cal"/>\n` +
          `  <WorkoutStatistics type="HKQuantityTypeIdentifierBasalEnergyBurned" startDate="${stamp(start)}" endDate="${stamp(end)}" sum="${Math.round(minutes * 1.1)}" unit="Cal"/>\n` +
          dist +
          `  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="${stamp(start)}" endDate="${stamp(end)}" average="141" minimum="98" maximum="172" unit="count/min"/>\n` +
          (km !== null ? `  <WorkoutRoute sourceName="Jo’s Apple Watch" sourceVersion="10.1" creationDate="${stamp(end)}" startDate="${stamp(start)}" endDate="${stamp(end)}">\n   <MetadataEntry key="HKMetadataKeySyncVersion" value="2"/>\n   <FileReference path="/workout-routes/route_${i}.gpx"/>\n  </WorkoutRoute>\n` : '') +
          ` </Workout>\n`,
      );
    }
    // Every seventh known workout was also written by Garmin Connect, 20 s later: one session, listed once.
    if (kind === 'known' && i % 7 === 3) {
      workoutLines.push(` <Workout workoutActivityType="${type}" duration="${minutes}" durationUnit="min" totalEnergyBurned="${kcal + 9}" totalEnergyBurnedUnit="kcal" sourceName="Garmin Connect" sourceVersion="5.1" creationDate="${stamp(end)}" startDate="${stamp(start + 20_000)}" endDate="${stamp(end + 10_000)}"/>\n`);
      expected.saved.push({ start: iso(start + 20_000), activity, from: 'Garmin Connect' });
    } else if (kind === 'known') expected.saved.push({ start: iso(start), activity, from: 'Apple Watch' });
    else if (kind === 'other') expected.ask += 1;
  }

  // Heart rate fills the file to its size, with the steps and workouts spread through it.
  const others = [...stepLines, ...sleepLines, ...workoutLines];
  const hrStart = now - 3 * 365 * 86_400_000;
  let n = 0;
  let next = 0;
  while (written < targetBytes || next < others.length) {
    let chunk = '';
    for (let k = 0; k < 2000; k++) {
      const t = hrStart + n * 37_000;
      n++;
      chunk += ` <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Jo’s Apple Watch" sourceVersion="10.1" device="${WATCH}" unit="count/min" creationDate="${stamp(t + 5000)}" startDate="${stamp(t)}" endDate="${stamp(t)}" value="${60 + (n % 70)}">\n  <MetadataEntry key="HKMetadataKeyHeartRateMotionContext" value="0"/>\n </Record>\n`;
    }
    // Interleave the rest evenly by size.
    const share = Math.min(1, (written + chunk.length) / targetBytes);
    while (next < others.length && next / others.length <= share) chunk += others[next++];
    written += chunk.length;
    yield chunk;
    if (written >= targetBytes && next >= others.length) break;
  }
  yield ` <ActivitySummary dateComponents="${utcDay(now)}" activeEnergyBurned="512" activeEnergyBurnedGoal="500" activeEnergyBurnedUnit="Cal"/>\n</HealthData>\n`;
}

// ---------------------------------------------------------------- ZIP writing, streamed
const fd = fs.openSync(out, 'w');
let offset = 0;
const write = (buf) => {
  fs.writeSync(fd, buf);
  offset += buf.length;
};
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const central = [];

async function addEntry(name, pieces) {
  const nameBuf = Buffer.from(name, 'utf8');
  const localAt = offset;
  const zip64 = forceZip64;
  write(Buffer.concat([u32(0x04034b50), u16(zip64 ? 45 : 20), u16((descriptors ? 0x8 : 0) | 0x800), u16(8), u16(0), u16(0x21), u32(0), u32(zip64 ? 0xffffffff : 0), u32(zip64 ? 0xffffffff : 0), u16(nameBuf.length), u16(zip64 ? 20 : 0), nameBuf]));
  if (zip64) write(Buffer.concat([u16(1), u16(16), u64(0), u64(0)]));
  const sizesAt = localAt + 14;
  let crc = 0;
  let size = 0;
  let csize = 0;
  const deflate = zlib.createDeflateRaw({ level: 6 });
  deflate.on('data', (c) => {
    write(c);
    csize += c.length;
  });
  const finished = new Promise((resolve) => deflate.on('end', resolve));
  for (const piece of pieces) {
    const buf = Buffer.from(piece, 'utf8');
    crc = zlib.crc32(buf, crc);
    size += buf.length;
    if (!deflate.write(buf)) await new Promise((r) => deflate.once('drain', r));
  }
  deflate.end();
  await finished;
  const big = zip64 || size > 0xfffffffe || csize > 0xfffffffe;
  if (descriptors) {
    write(Buffer.concat([u32(0x08074b50), u32(crc), ...(big ? [u64(csize), u64(size)] : [u32(csize), u32(size)])]));
  } else {
    // Sizes in the local header, written back once known.
    const fix = Buffer.concat([u32(crc), u32(big ? 0xffffffff : csize), u32(big ? 0xffffffff : size)]);
    fs.writeSync(fd, fix, 0, fix.length, sizesAt);
    if (zip64) fs.writeSync(fd, Buffer.concat([u64(size), u64(csize)]), 0, 16, localAt + 30 + nameBuf.length + 4);
  }
  central.push({ nameBuf, crc, size, csize, localAt, big: big || localAt > 0xfffffffe });
}

const expected = {};
const isXml = !!flags.xml;
if (isXml) {
  for (const piece of xmlPieces(expected)) write(Buffer.from(piece, 'utf8'));
} else {
  // Routes and an electrocardiogram before the export, the clinical file after it: the reader must skip all of them.
  for (let i = 0; i < 40; i++) await addEntry(`apple_health_export/workout-routes/route_${i}.gpx`, [`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Apple Health Export"><trk><name>Route ${i}</name><trkseg>${'<trkpt lon="13.4" lat="52.5"><ele>34</ele><time>2026-11-01T10:00:00Z</time></trkpt>'.repeat(200)}</trkseg></trk></gpx>\n`]);
  await addEntry('apple_health_export/electrocardiograms/ecg_2026-11-01.csv', ['Name,Jo Example\nDate of Birth,1990-04-02\n' + '0.1,0.2,0.3\n'.repeat(5000)]);
  await addEntry('apple_health_export/export.xml', xmlPieces(expected));
  await addEntry('apple_health_export/export_cda.xml', [`<?xml version="1.0"?>\n<ClinicalDocument xmlns="urn:hl7-org:v3">${'<entry><observation>secret</observation></entry>'.repeat(20000)}</ClinicalDocument>\n`]);
  const cdAt = offset;
  for (const c of central) {
    const extra = c.big ? Buffer.concat([u16(1), u16(24), u64(c.size), u64(c.csize), u64(c.localAt)]) : Buffer.alloc(0);
    write(Buffer.concat([u32(0x02014b50), u16(45), u16(45), u16((descriptors ? 0x8 : 0) | 0x800), u16(8), u16(0), u16(0x21), u32(c.crc), u32(c.big ? 0xffffffff : c.csize), u32(c.big ? 0xffffffff : c.size), u16(c.nameBuf.length), u16(extra.length), u16(0), u16(0), u16(0), u32(0), u32(c.big ? 0xffffffff : c.localAt), c.nameBuf, extra]));
  }
  const cdSize = offset - cdAt;
  const z64 = forceZip64 || central.some((c) => c.big) || cdAt > 0xfffffffe;
  if (z64) {
    const recAt = offset;
    write(Buffer.concat([u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0), u64(central.length), u64(central.length), u64(cdSize), u64(cdAt)]));
    write(Buffer.concat([u32(0x07064b50), u32(0), u64(recAt), u32(1)]));
  }
  write(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(z64 ? 0xffff : central.length), u16(z64 ? 0xffff : central.length), u32(z64 ? 0xffffffff : cdSize), u32(z64 ? 0xffffffff : cdAt), u16(0)]));
}
fs.closeSync(fd);
expected.exportDate = iso(now);
fs.writeFileSync(`${out}.expected.json`, JSON.stringify(expected, null, 1));
console.log(`wrote ${out}: ${(offset / 1048576).toFixed(1)} MB${isXml ? '' : ` (export.xml ${(central.find((c) => c.nameBuf.toString().endsWith('/export.xml')).size / 1048576).toFixed(1)} MB uncompressed)`}, ${expected.saved.length} workouts to save, ${expected.ask} to ask about, ${Object.keys(expected.stepDays).length} days of steps, ${expected.nights.length} nights`);
