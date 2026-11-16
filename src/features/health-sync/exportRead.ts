/**
 * Reading the Health app's export file from a picked file, a piece at a time.
 *
 * `findHealthExport` looks at a picked file without reading it: a ZIP's
 * central directory (from the end of the file) for the one entry that is the
 * export (export.xml, or any other .xml whose first bytes are a <HealthData>
 * export, since the folder can be localised), or the first bytes of a bare
 * export.xml. export_cda.xml (clinical records), workout-routes/*.gpx and
 * electrocardiograms/*.csv are never candidates, so they are never read or inflated.
 *
 * `readHealthExport` then streams exactly that entry's bytes through the
 * scanner (src/features/import/zip.ts, appleExport.ts) and the step tally
 * (exportFile.ts), so neither the archive nor the XML is ever held in memory;
 * it reports the share read, can be cancelled between chunks, and waits
 * between chunks so the screen keeps drawing.
 */
import { createHealthScanner, HealthExportError, looksLikeHealthXml, type RawWorkout } from '@/features/import/appleExport';
import { listZip, looksLikeZip, streamEntry, streamRange, ZipCutShort, type ByteSource, type StreamOptions, type ZipEntry } from '@/features/import/zip';
import { addDays } from '@/lib/dates';
import type { ISODate } from '@/types';

import { createStepTally, exportInstant, parseExportDate } from './exportFile';
import { localClock, oldestStepDay, type FileSteps, type StepClock } from './steps';

/** The file is a Health export but ends before its closing </HealthData>: it is refused as damaged or incomplete. */
export class HealthExportIncomplete extends Error {}

/**
 * Where the export is in a picked file. 'cut-zip': a ZIP that ends before its
 * central directory (a download or copy cut short), which no reader can open;
 * `apple` when its first entry says it is a Health export. It is reported
 * without reading the rest of the file.
 */
export type ExportFound = { kind: 'zip'; entry: ZipEntry; entries: number } | { kind: 'xml' } | { kind: 'cut-zip'; apple: boolean };

/** Names only a Health export's archive has (the folder itself can be localised, its files are not). */
const APPLE_ENTRY = /(^|\/)(apple_health_export\/|export(_cda)?\.xml$|workout-routes\/|electrocardiograms\/)/i;

/** The first entry's name, from its local header at the start of the file (30 bytes and the name). */
async function firstEntryName(src: ByteSource): Promise<string> {
  const h = await src.read(0, 30);
  if (h.length < 30) return '';
  const nameLen = h[26] | (h[27] << 8);
  const name = await src.read(30, Math.min(nameLen, 1024));
  let out = '';
  for (const c of name) out += String.fromCharCode(c);
  return out;
}

const base = (path: string) => path.split('/').pop() ?? path;

/** Entries that are never the export and are never opened: clinical records, routes, electrocardiograms, macOS extras. */
export function neverRead(path: string): boolean {
  const b = base(path).toLowerCase();
  return (
    path.endsWith('/') ||
    path.startsWith('__MACOSX/') ||
    b.startsWith('._') ||
    b === 'export_cda.xml' ||
    /(^|\/)workout-routes\//i.test(path) ||
    /(^|\/)electrocardiograms\//i.test(path) ||
    !b.endsWith('.xml')
  );
}

/**
 * Is this picked file a Health export, and where is it? Null when it is not
 * (a Garmin ZIP, a FIT file): those are read as before. A ZIP cut short is
 * 'cut-zip' whatever it holds. Reads only the first four bytes and the end of
 * a ZIP, or the first 8 KB of anything else, plus at most the first 256 KB of
 * output of up to three other .xml entries when no entry is named export.xml.
 */
export async function findHealthExport(src: ByteSource): Promise<ExportFound | null> {
  if (src.size < 4) return null;
  // Four bytes say whether it is a ZIP; its first entry (which may be the clinical file) is not read further.
  if (!looksLikeZip(await src.read(0, 4))) return looksLikeHealthXml(await src.read(0, Math.min(src.size, 8192))) ? { kind: 'xml' } : null;
  let entries: ZipEntry[];
  try {
    entries = await listZip(src);
  } catch (e) {
    // Cut short: any reader would fail on it, so it is never read whole (a Garmin file is read whole) to say so.
    if (e instanceof ZipCutShort) return { kind: 'cut-zip', apple: APPLE_ENTRY.test(await firstEntryName(src).catch(() => '')) };
    return null;
  }
  const candidates = entries.filter((e) => !neverRead(e.name));
  const named = candidates.find((e) => base(e.name).toLowerCase() === 'export.xml');
  if (named) return { kind: 'zip', entry: named, entries: entries.length };
  for (const e of candidates.slice(0, 3)) {
    let peek = new Uint8Array(0);
    try {
      await streamEntry(
        src,
        e,
        (chunk) => {
          if (peek.length >= 262144) return;
          const next = new Uint8Array(Math.min(262144, peek.length + chunk.length));
          next.set(peek, 0);
          next.set(chunk.subarray(0, next.length - peek.length), peek.length);
          peek = next;
        },
        { chunkSize: 65536, enough: () => peek.length >= 8192 },
      );
    } catch {
      continue;
    }
    if (looksLikeHealthXml(peek)) return { kind: 'zip', entry: e, entries: entries.length };
  }
  return null;
}

export interface ExportRead {
  workouts: RawWorkout[];
  /** Steps for the days the file covers inside the 35-day window; null when it has none there. */
  steps: (FileSteps & { fromDay: ISODate }) | null;
  /** When the export was made (its ExportDate), else when it was read. */
  asOf: string;
  counts: { records: number; stepRecords: number; stepSamplesUsed: number };
}

export interface ReadExportOptions extends Pick<StreamOptions, 'onProgress' | 'cancelled' | 'yieldEvery' | 'chunkSize'> {
  /** Now, for the 35-day steps window. */
  now: number;
  /** Which calendar day an instant is in. Default: the phone's own zone. */
  clock?: StepClock;
  /** Bytes per step for a bare export.xml (default 2 MB); `chunkSize` is for the ZIP's compressed bytes. */
  xmlChunkSize?: number;
}

/** Read the export found by `findHealthExport`. Throws StreamCancelled when cancelled, HealthExportError when it is not a Health export, HealthExportIncomplete when it is cut short, ZipError when the archive cannot be read. */
export async function readHealthExport(src: ByteSource, found: ExportFound, options: ReadExportOptions): Promise<ExportRead> {
  if (found.kind === 'cut-zip') throw new ZipCutShort('This archive is cut short.');
  const clock = options.clock ?? localClock;
  const today = clock.dayOf(options.now);
  const fromDay = oldestStepDay(today);
  const tally = createStepTally(clock, fromDay, today);
  const scanner = createHealthScanner({
    // Dates are written in an offset that can be a day off the phone's calendar: one day more is looked at, and the tally keeps only the window.
    stepsFromDay: addDays(fromDay, -1),
    onStep: (r) => tally.addRecord(r, exportInstant),
  });
  const stream: StreamOptions = { onProgress: options.onProgress, cancelled: options.cancelled, yieldEvery: options.yieldEvery, chunkSize: options.chunkSize };
  if (found.kind === 'zip') await streamEntry(src, found.entry, scanner.push, stream);
  // A bare export.xml is not inflated: a step of 2 MB of text is about what 128 KB of the ZIP becomes.
  else await streamRange(src, 0, src.size, false, scanner.push, { ...stream, chunkSize: options.xmlChunkSize ?? 2 * 1024 * 1024 });
  const result = scanner.finish();
  if (!result.isHealthExport) throw new HealthExportError('This file is not an export from the Health app.');
  // Cut short (an interrupted copy or download): its steps would replace whole days with part of them, and a workout could lose its energy.
  if (!result.complete) throw new HealthExportIncomplete('This Health export is cut short.');
  const exported = parseExportDate(result.exportDate);
  const asOfMs = exported && exported.ms <= options.now ? exported.ms : options.now;
  const asOf = new Date(asOfMs).toISOString();
  const asOfDay = clock.dayOf(asOfMs);
  const days = tally.days();
  // Nothing after the export was made can be in it; the tally's window ends today.
  for (const day of Object.keys(days)) if (day > asOfDay) delete days[day];
  const steps = Object.keys(days).length && asOfDay >= fromDay ? { days, asOf, asOfDay, fromDay } : null;
  return { workouts: result.workouts, steps, asOf, counts: { ...result.counts, stepSamplesUsed: tally.samples } };
}
