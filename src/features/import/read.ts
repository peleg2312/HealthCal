/**
 * Entry point for reading a picked file: recognises the format from the bytes
 * (and the name when the bytes are not conclusive), opens ZIP and gzip
 * archives, and runs the right reader. Never throws for a bad file: problems
 * come back as `errors` (per file, so one broken file in a ZIP does not lose
 * the rest).
 */
import { gunzipSync, unzipSync } from 'fflate';

import { looksLikeGarminCsv, readGarminCsv } from './csv';
import { looksLikeFit, readFit } from './fit';
import { readGpx } from './gpx';
import { readTcx } from './tcx';
import { decodeText, looksLikeText } from './text';
import { ImportError, plural, warn, type ImportErrorCode, type ImportedWorkout, type ImportFormat, type ImportWarning, type ReadOptions, type ReadResult } from './types';

export type DetectedFormat = ImportFormat | 'zip' | 'gzip';

const EXT: Record<string, DetectedFormat> = { fit: 'fit', tcx: 'tcx', gpx: 'gpx', csv: 'csv', zip: 'zip', gz: 'gzip' };

function extension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

const isZip = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06);
const isGzip = (b: Uint8Array) => b.length >= 3 && b[0] === 0x1f && b[1] === 0x8b && b[2] === 0x08;

/**
 * The file's format, judged from its content first and its name second.
 * When the content is not recognisable but the name says .fit/.tcx/.gpx/.csv,
 * that format is returned so its reader can explain what is wrong.
 * Null when neither the bytes nor the name suggest anything importable.
 */
export function detectFormat(bytes: Uint8Array, name = ''): DetectedFormat | null {
  if (isZip(bytes)) return 'zip';
  if (isGzip(bytes)) return 'gzip';
  if (looksLikeFit(bytes)) return 'fit';
  if (looksLikeText(bytes)) {
    const head = decodeText(bytes.subarray(0, 65536)).replace(/^﻿/, '').trimStart();
    if (head.startsWith('<')) {
      if (/<([A-Za-z_][\w.-]*:)?TrainingCenterDatabase[\s>]/.test(head)) return 'tcx';
      if (/<([A-Za-z_][\w.-]*:)?gpx[\s>]/.test(head)) return 'gpx';
    } else if (looksLikeGarminCsv(head)) return 'csv';
  }
  return EXT[extension(name)] ?? null;
}

export interface FileError {
  file: string;
  code: ImportErrorCode;
  message: string;
}

export interface ImportBatch {
  workouts: ImportedWorkout[];
  warnings: ImportWarning[];
  errors: FileError[];
  /** Every file looked at (inner files of an archive included) and the format it was read as. */
  files: { file: string; format: DetectedFormat | null }[];
}

const MAX_ZIP_DEPTH = 3;
const WANTED_IN_ZIP = /\.(fit|tcx|gpx|csv|zip|gz)$/i;

/** Read a single format with its own reader. Throws ImportError. */
export function readAs(format: ImportFormat, bytes: Uint8Array, name: string, options: ReadOptions = {}): ReadResult {
  switch (format) {
    case 'fit':
      return readFit(bytes, name, { timeZone: options.timeZone });
    case 'tcx':
      return readTcx(decodeText(bytes), name);
    case 'gpx':
      return readGpx(decodeText(bytes), name);
    case 'csv':
      if (!looksLikeText(bytes)) throw new ImportError('not-csv', 'This file is not a CSV text file.', name);
      return readGarminCsv(decodeText(bytes), name, options.csv);
    case 'apple':
      // The Health export is read as a stream from the file itself (health-sync/exportRead.ts), never from bytes in memory.
      throw new ImportError('apple-not-export', 'A Health export is read on its own, from the file.', name);
  }
}

/** Read a picked file (any supported format, or a ZIP of them) into workouts. */
export function readImportFile(bytes: Uint8Array, name: string, options: ReadOptions = {}): ImportBatch {
  const batch: ImportBatch = { workouts: [], warnings: [], errors: [], files: [] };
  readInto(batch, bytes, name, options, 0);
  return batch;
}

function readInto(batch: ImportBatch, bytes: Uint8Array, name: string, options: ReadOptions, depth: number) {
  if (bytes.length === 0) {
    batch.files.push({ file: name, format: null });
    batch.errors.push({ file: name, code: 'empty', message: 'This file is empty.' });
    return;
  }
  const format = detectFormat(bytes, name);
  batch.files.push({ file: name, format });
  try {
    if (format === null) {
      throw new ImportError('unknown-format', 'This file is not one HealthCal can import. Use a FIT, TCX, GPX or activities CSV file exported from Garmin Connect, or a ZIP of them.', name);
    }
    if (format === 'zip') return readZip(batch, bytes, name, options, depth);
    if (format === 'gzip') {
      let inner: Uint8Array;
      try {
        inner = gunzipSync(bytes);
      } catch {
        throw new ImportError('not-zip', 'This compressed file is damaged and cannot be opened.', name);
      }
      return readInto(batch, inner, name.replace(/\.gz$/i, ''), options, depth + 1);
    }
    const result = readAs(format, bytes, name, options);
    batch.workouts.push(...result.workouts);
    batch.warnings.push(...result.warnings);
  } catch (e) {
    if (e instanceof ImportError) batch.errors.push({ file: e.file || name, code: e.code, message: e.message });
    else batch.errors.push({ file: name, code: 'unknown-format', message: 'This file could not be read. It may be damaged.' });
  }
}

function readZip(batch: ImportBatch, bytes: Uint8Array, name: string, options: ReadOptions, depth: number) {
  if (depth >= MAX_ZIP_DEPTH) {
    batch.warnings.push(warn('zip-nested-depth', 'This archive has archives nested too deeply inside it; the innermost ones were not opened.', name));
    return;
  }
  let skipped = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        const base = f.name.split('/').pop() ?? '';
        const wanted = !f.name.endsWith('/') && !f.name.startsWith('__MACOSX/') && !base.startsWith('._') && WANTED_IN_ZIP.test(base);
        if (!wanted && !f.name.endsWith('/')) skipped += 1;
        return wanted;
      },
    });
  } catch {
    throw new ImportError('not-zip', 'This ZIP file is damaged and cannot be opened.', name);
  }
  const names = Object.keys(entries).sort();
  if (names.length === 0) {
    throw new ImportError('zip-empty', 'This ZIP has no FIT, TCX, GPX or CSV files in it.', name);
  }
  for (const inner of names) readInto(batch, entries[inner], `${name}/${inner}`, options, depth + 1);
  if (skipped > 0) {
    batch.warnings.push(warn('zip-skipped-files', `${plural(skipped, 'other file', 'other files')} in this ZIP ${skipped === 1 ? 'is' : 'are'} not a workout and ${skipped === 1 ? 'was' : 'were'} left out.`, name));
  }
}
