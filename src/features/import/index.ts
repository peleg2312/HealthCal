/**
 * Garmin import: reading exported files and turning them into activity entries.
 * See each module for details; everything here is pure (no React, storage or file system).
 */
export { readImportFile, detectFormat, readAs, type ImportBatch, type FileError, type DetectedFormat } from './read';
export { readFit, decodeFit, fitCrc, looksLikeFit } from './fit';
export { readTcx } from './tcx';
export { readGpx, haversineM } from './gpx';
export { readGarminCsv, looksLikeGarminCsv, englishActivityType, parseCsvRows, parseDuration, parseLocaleNumber } from './csv';
export { decodeText } from './text';
export { suggestActivity, activityFromTitle, mapFitSport, mapTcxSport, mapGarminType, sportKey, type SportMatch } from './sports';
export { toActivityEntry, garminExternalId, importedEntryId, impliedMet, nearestIntensity, type ConvertContext, type ImportedEntry } from './convert';
export { checkDuplicates, sameWorkout, type DuplicateCheck, type DedupeCandidate, type ImportStatus } from './dedupe';
export { prepareImport, chooseActivity, setSelected, entriesToSave, candidateKey, type ImportCandidate } from './plan';
export * from './types';
