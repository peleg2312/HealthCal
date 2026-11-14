/**
 * Reader for the Garmin Connect Activities list "Export CSV".
 *
 * Garmin publishes no specification. What this follows (research-garmin.md, section 2):
 * columns change with the activities exported, so they are matched by header
 * name (English, German, French, Spanish, Italian, Dutch, Portuguese); the
 * duration column is "Time" or "Total Time" and is timer time; numbers are
 * quoted with thousands separators; "--" means missing; durations are
 * h:mm:ss with optional tenths; pool and open water swims are in metres
 * (yards in a yard pool) while other distances follow the account's unit;
 * dates are local wall time with no zone. The file says neither its unit nor
 * its zone, so both come from the caller.
 */
import { normalizeText } from './text';
import { isDeviceZone, isoSeconds, validWallTime, wallTimeToEpoch, zoneOffsetMinutes, type WallTime } from './time';
import { ImportError, plural, warn, type CsvOptions, type ImportedWorkout, type ImportWarning, type ReadResult } from './types';

// ------------------------------------------------------------ parsing

/**
 * Split CSV text into rows of fields. RFC 4180 quoting, plus tolerance for the
 * unescaped quotes Garmin writes inside titles: a quote inside a quoted field
 * that is not followed by the delimiter, a line break or another quote is kept
 * as a literal character.
 */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  const n = text.length;
  let quoted = false;
  let atFieldStart = true;
  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        if (next === undefined || next === delimiter || next === '\n' || next === '\r') {
          quoted = false;
          i += 1;
          continue;
        }
        field += '"';
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
      i += 1;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      atFieldStart = true;
      i += 1;
      continue;
    }
    if (c === '\n' || c === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += c;
    atFieldStart = false;
    i += 1;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/** Count delimiter candidates outside quotes in the header line. */
function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const c of headerLine) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c in counts) counts[c] += 1;
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ',';
}

// ------------------------------------------------------------ columns

type Column = 'type' | 'date' | 'title' | 'distance' | 'calories' | 'time' | 'moving' | 'elapsed' | 'avgHr' | 'maxHr';

const norm = (s: string) => normalizeText(s, 'NFC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');

/** Header names per column. English first; translations from real and fixture exports (activeyear project). */
const HEADERS: Record<Column, string[]> = {
  type: ['activity type', 'aktivitätstyp', "type d'activité", 'type d’activité', 'tipo de actividad', 'tipo di attività', 'activiteittype', 'tipo de atividade'],
  date: ['date', 'datum', 'fecha', 'data'],
  title: ['title', 'titel', 'titre', 'título', 'titolo'],
  distance: ['distance', 'distanz', 'distancia', 'distanza', 'afstand', 'distância'],
  calories: ['calories', 'kalorien', 'calorías', 'calorie', 'calorieën', 'calorias'],
  time: ['time', 'total time', 'zeit', 'gesamtzeit', 'durée', 'tiempo', 'tempo', 'tijd'],
  moving: ['moving time', 'zeit in bewegung', 'tiempo en movimiento', 'tempo in movimento', 'tijd bewogen', 'tempo em movimento'],
  elapsed: ['elapsed time', 'verstrichene zeit', 'tiempo transcurrido', 'tempo trascorso', 'verstreken tijd', 'duração'],
  avgHr: ['avg hr', 'ø herzfrequenz', 'frecuencia cardiaca media', 'fc media', 'gem. hs', 'fc média'],
  maxHr: ['max hr', 'maximale herzfrequenz', 'fc máxima', 'fc max', 'max. hs'],
};

/** Header languages whose exports write decimal commas (seen in German and Italian fixtures). */
const COMMA_DECIMAL_TYPE_HEADERS = new Set(['aktivitätstyp', 'tipo di attività']);

function mapColumns(header: string[]): Partial<Record<Column, number>> {
  const out: Partial<Record<Column, number>> = {};
  const names = header.map(norm);
  for (const col of Object.keys(HEADERS) as Column[]) {
    for (const alias of HEADERS[col]) {
      const idx = names.indexOf(alias); // first occurrence: some headers repeat
      if (idx !== -1) {
        out[col] = idx;
        break;
      }
    }
  }
  return out;
}

// ------------------------------------------------------- activity types

/**
 * Translated activity type names (as the CSV writes them) to Garmin's English
 * names. Used to recognise swims, whose distance is in metres, and by the sport mapping.
 */
export const CSV_TYPE_TRANSLATIONS: Record<string, string> = {
  // German
  laufen: 'Running', laufbandtraining: 'Treadmill Running', trailrunning: 'Trail Running', radfahren: 'Cycling', rennradfahren: 'Road Cycling',
  mountainbiken: 'Mountain Biking', 'virtuelles radfahren': 'Virtual Cycling', krafttraining: 'Strength Training', schwimmbadschwimmen: 'Pool Swim',
  freiwasserschwimmen: 'Open Water Swimming', gehen: 'Walking', wandern: 'Hiking',
  // Spanish
  carrera: 'Running', 'entrenamiento en cinta': 'Treadmill Running', ciclismo: 'Cycling', 'ciclismo en sala': 'Indoor Cycling', 'ciclismo en carretera': 'Road Cycling',
  'ciclismo de montaña': 'Mountain Biking', 'esquí de fondo': 'Cross Country Skiing', 'natación en piscina': 'Pool Swim', 'natación en aguas abiertas': 'Open Water Swimming',
  caminar: 'Walking', senderismo: 'Hiking', 'entrenamiento de fuerza': 'Strength Training',
  // French
  'course à pied': 'Running', 'course à pied sur tapis roulant': 'Treadmill Running', trail: 'Trail Running', cyclisme: 'Cycling', "vélo d'intérieur": 'Indoor Cycling',
  'vélo de route': 'Road Cycling', vtt: 'Mountain Biking', 'ski de fond': 'Cross Country Skiing', 'marche à pied': 'Walking', randonnée: 'Hiking',
  musculation: 'Strength Training', 'nat. piscine': 'Pool Swim', 'natation en eau libre': 'Open Water Swimming',
  // Italian
  corsa: 'Running', camminata: 'Walking', 'nuoto in piscina': 'Pool Swim', escursionismo: 'Hiking', 'allenamento di forza': 'Strength Training',
  'corsa su tapis roulant': 'Treadmill Running', 'ciclismo su strada': 'Road Cycling', 'ciclismo indoor': 'Indoor Cycling', 'mountain bike': 'Mountain Biking', 'sci di fondo': 'Cross Country Skiing',
  // Dutch
  hardlopen: 'Running', 'hardlopen op een loopband': 'Treadmill Running', fietsen: 'Cycling', indoorcycling: 'Indoor Cycling', wegwielrennen: 'Road Cycling',
  langlaufen: 'Cross Country Skiing', 'virtueel fietsen': 'Virtual Cycling', krachttraining: 'Strength Training', wandelen: 'Walking', zwembad: 'Pool Swim',
  'zwemmen in open water': 'Open Water Swimming', peddelsurfen: 'Stand Up Paddleboarding',
  // Portuguese
  corrida: 'Running', 'corrida em esteira': 'Treadmill Running', 'ciclismo em local fechado': 'Indoor Cycling', 'ciclismo de estrada': 'Road Cycling',
  'corrida em trilha': 'Trail Running', caminhada: 'Walking', 'natação em piscina': 'Pool Swim', cardiovascular: 'Cardio', ioga: 'Yoga',
};

/** Garmin's English activity type for a CSV type in any supported language (unchanged when unknown). */
export function englishActivityType(type: string): string {
  return CSV_TYPE_TRANSLATIONS[norm(type)] ?? type.trim();
}

const SWIM_TYPES = new Set(['pool swim', 'open water swimming', 'swimming', 'lap swimming']);
/** Distances Garmin writes in metres when the value is a whole number (activeyear's observation). */
const METRE_IF_WHOLE = new Set(['track running', 'indoor track', 'rowing', 'indoor rowing', 'stand up paddleboarding', 'sup', 'kayaking']);

// ------------------------------------------------------------ values

const isMissing = (s: string) => {
  const t = s.trim();
  return t === '' || /^[-–—]+$/.test(t) || /^--(:--)*$/.test(t) || t.toLowerCase() === 'n/a';
};

export function parseLocaleNumber(raw: string, decimal: '.' | ','): number | null {
  if (isMissing(raw)) return null;
  let s = raw.trim().replace(/[\s  ']/g, '');
  s = decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** "01:01:26", "00:08:51.6", "00:08:51,6", "45:12" (m:ss) to seconds; null for "--:--:--" or junk. */
export function parseDuration(raw: string): number | null {
  if (isMissing(raw)) return null;
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/.exec(raw.trim());
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if ((m[1] && min >= 60) || sec >= 60) return null;
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  return h * 3600 + min * 60 + sec + frac;
}

type DateOrder = 'dmy' | 'mdy';

interface ParsedDate {
  wall: WallTime;
  /** Slashed dates whose day and month could be either way round. */
  ambiguous: boolean;
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/;
const DOT_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/;

function parseDate(raw: string, order: DateOrder): ParsedDate | null {
  const s = raw.trim();
  let m = ISO_DATE.exec(s);
  let wall: WallTime | null = null;
  let ambiguous = false;
  if (m) wall = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: m[6] ? +m[6] : 0 };
  else if ((m = DOT_DATE.exec(s))) wall = { year: +m[3], month: +m[2], day: +m[1], hour: +m[4], minute: +m[5], second: m[6] ? +m[6] : 0 };
  else if ((m = SLASH_DATE.exec(s))) {
    const a = +m[1];
    const b = +m[2];
    let hour = +m[4];
    if (m[7]) {
      const pm = m[7].toLowerCase() === 'pm';
      if (hour === 12) hour = pm ? 12 : 0;
      else if (pm) hour += 12;
    }
    ambiguous = a <= 12 && b <= 12 && a !== b;
    const [day, month] = order === 'dmy' ? [a, b] : [b, a];
    wall = { year: +m[3], month, day, hour, minute: +m[5], second: m[6] ? +m[6] : 0 };
  }
  if (!wall || !validWallTime(wall)) return null;
  return { wall, ambiguous };
}

/** Day/month order for slashed dates, from any row where only one reading is possible. */
function detectDateOrder(cells: string[]): DateOrder | null {
  let dmy = false;
  let mdy = false;
  for (const c of cells) {
    const m = SLASH_DATE.exec(c.trim());
    if (!m) continue;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  if (dmy !== mdy) return dmy ? 'dmy' : 'mdy';
  return null;
}

function detectDecimal(rows: string[][], cols: Partial<Record<Column, number>>, header: string[]): '.' | ',' {
  for (const key of ['time', 'elapsed', 'moving'] as Column[]) {
    const idx = cols[key];
    if (idx === undefined) continue;
    for (const r of rows) {
      const m = /:\d{2}([.,])\d+$/.exec((r[idx] ?? '').trim());
      if (m) return m[1] as '.' | ',';
    }
  }
  for (const key of ['distance', 'calories'] as Column[]) {
    const idx = cols[key];
    if (idx === undefined) continue;
    for (const r of rows) {
      // One or two digits after the mark can only be decimals (thousands groups have three).
      const m = /^\d+([.,])\d{1,2}$/.exec((r[idx] ?? '').trim());
      if (m) return m[1] as '.' | ',';
    }
  }
  const typeHeader = cols.type === undefined ? '' : norm(header[cols.type]);
  return COMMA_DECIMAL_TYPE_HEADERS.has(typeHeader) ? ',' : '.';
}

// ------------------------------------------------------------- reader

const MILE_M = 1609.344;
const YARD_M = 0.9144;

/** True when the text starts like a Garmin Activities CSV in any supported language. */
export function looksLikeGarminCsv(text: string): boolean {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim() && !/^sep=/i.test(l.trim())) ?? '';
  const header = parseCsvRows(firstLine, detectDelimiter(firstLine))[0] ?? [];
  const cols = mapColumns(header);
  return cols.type !== undefined && cols.date !== undefined && (cols.time !== undefined || cols.elapsed !== undefined);
}

export function readGarminCsv(text: string, fileName: string, options: CsvOptions | undefined): ReadResult {
  if (!options || (options.distanceUnit !== 'km' && options.distanceUnit !== 'mi')) {
    throw new ImportError('csv-options-needed', 'Choose whether the distances in this file are in kilometres or miles.', fileName);
  }
  let body = text.replace(/^﻿/, '');
  let delimiter: string | null = null;
  const sep = /^sep=(.)\r?\n/i.exec(body);
  if (sep) {
    delimiter = sep[1];
    body = body.slice(sep[0].length);
  }
  const firstLine = body.split(/\r?\n/).find((l) => l.trim()) ?? '';
  delimiter ??= detectDelimiter(firstLine);
  const all = parseCsvRows(body, delimiter);
  const header = all[0] ?? [];
  const cols = mapColumns(header);
  if (cols.type === undefined || cols.date === undefined || (cols.time === undefined && cols.elapsed === undefined)) {
    throw new ImportError('not-csv', 'This CSV is not a Garmin Connect activities list: it has no activity type, date and time columns.', fileName);
  }
  const rows = all.slice(1);
  const decimal = options.decimalSeparator ?? detectDecimal(rows, cols, header);
  const detectedOrder = detectDateOrder(rows.map((r) => r[cols.date as number] ?? ''));
  const order: DateOrder = options.dateOrder ?? detectedOrder ?? 'dmy';
  const swimUnit = options.swimUnit ?? (options.distanceUnit === 'mi' ? 'yd' : 'm');

  const warnings: ImportWarning[] = [];
  const workouts: ImportedWorkout[] = [];
  let badRows = 0;
  let noDate = 0;
  let noDuration = 0;
  let usedElapsed = 0;
  let ambiguousDates = 0;
  const cell = (r: string[], c: Column) => (cols[c] === undefined ? '' : (r[cols[c] as number] ?? '').trim());

  rows.forEach((r, i) => {
    // A row with more fields than the header was split by stray quotes or delimiters.
    if (r.length > header.length + 1 || !cell(r, 'type')) {
      badRows += 1;
      return;
    }
    const date = parseDate(cell(r, 'date'), order);
    if (!date) {
      noDate += 1;
      return;
    }
    if (date.ambiguous) ambiguousDates += 1;
    let duration = parseDuration(cell(r, 'time'));
    let includesPauses = false;
    if (duration === null || duration <= 0) {
      const elapsed = parseDuration(cell(r, 'elapsed'));
      if (elapsed !== null && elapsed > 0) {
        duration = elapsed;
        includesPauses = true;
        usedElapsed += 1;
      }
    }
    if (duration === null || duration <= 0) {
      noDuration += 1;
      return;
    }
    const type = cell(r, 'type');
    const english = norm(englishActivityType(type));
    const rawDistance = cell(r, 'distance');
    const distanceValue = parseLocaleNumber(rawDistance, decimal);
    let distanceM: number | null = null;
    if (distanceValue !== null) {
      const whole = Number.isInteger(distanceValue) && !new RegExp(`\\${decimal}\\d{1,2}$`).test(rawDistance.trim());
      if (SWIM_TYPES.has(english)) distanceM = distanceValue * (swimUnit === 'yd' ? YARD_M : 1);
      else if (METRE_IF_WHOLE.has(english) && whole && distanceValue >= 100) distanceM = distanceValue;
      else distanceM = distanceValue * (options.distanceUnit === 'mi' ? MILE_M : 1000);
      distanceM = Math.round(distanceM * 100) / 100;
    }
    const kcal = parseLocaleNumber(cell(r, 'calories'), decimal);
    const avgHr = parseLocaleNumber(cell(r, 'avgHr'), decimal);
    const maxHr = parseLocaleNumber(cell(r, 'maxHr'), decimal);
    const elapsed = parseDuration(cell(r, 'elapsed'));
    const title = cell(r, 'title');
    const startMs = wallTimeToEpoch(date.wall, options.timeZone, fileName);
    const w: ImportedWorkout = {
      format: 'csv',
      fileName,
      index: i + 1,
      startUtc: isoSeconds(startMs),
      startFromLocalTime: true,
      durationSec: Math.round(duration * 1000) / 1000,
      elapsedSec: elapsed,
      durationIncludesPauses: includesPauses,
      distanceM,
      kcal: kcal === null ? null : Math.round(kcal),
      avgHeartRate: avgHr === null || avgHr <= 0 ? null : Math.round(avgHr),
      maxHeartRate: maxHr === null || maxHr <= 0 ? null : Math.round(maxHr),
      sport: type,
      subSport: null,
      title: title && !isMissing(title) ? title : null,
      device: null,
    };
    // A zone the person chose: the rows are that zone's wall time, so the day is the one written in the file.
    if (!isDeviceZone(options.timeZone)) w.utcOffsetMin = zoneOffsetMinutes(startMs, options.timeZone as string, fileName);
    workouts.push(w);
  });

  if (noDuration) warnings.push(warn('csv-skipped-no-duration', `${plural(noDuration, 'row', 'rows')} had no duration and ${noDuration === 1 ? 'was' : 'were'} skipped.`, fileName));
  if (noDate) warnings.push(warn('csv-skipped-no-date', `${plural(noDate, 'row', 'rows')} had no readable date and ${noDate === 1 ? 'was' : 'were'} skipped.`, fileName));
  if (badRows) {
    warnings.push(warn('csv-skipped-bad-row', `${plural(badRows, 'row', 'rows')} could not be read and ${badRows === 1 ? 'was' : 'were'} skipped. Quote marks in an activity title can cause this: remove them in Garmin Connect and export again.`, fileName));
  }
  if (usedElapsed) warnings.push(warn('csv-elapsed-time', `${plural(usedElapsed, 'row', 'rows')} had no moving time, so the elapsed time (pauses included) was used.`, fileName));
  if (ambiguousDates && !options.dateOrder && !detectedOrder) {
    warnings.push(warn('csv-date-order', 'Dates like 07/11/2025 were read as day/month/year. If they are month/day/year, change the date order and read the file again.', fileName));
  }
  if (workouts.length === 0) {
    throw new ImportError('csv-no-workouts', rows.length ? 'No row in this file had a date and a duration, so there is nothing to import.' : 'This activities list is empty.', fileName);
  }
  return { workouts, warnings };
}
