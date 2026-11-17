import { beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = vi.hoisted(() => [] as { message: string; onPress?: () => void }[]);
vi.mock('@/ui', () => ({
  toast: (message: string, options?: { onPress?: () => void }) => toasts.push({ message, onPress: options?.onPress }),
  haptic: { success: () => {}, tap: () => {}, press: () => {}, select: () => {}, warn: () => {} },
}));
// The file picker loads Expo's native modules; nothing here picks a file.
vi.mock('./pickFiles', () => ({ readAll: async () => new Uint8Array(0) }));

import type { ExportRead } from '@/features/health-sync/exportRead';
import type { SleepNight } from '@/features/health-sync/sleep';
import { useHealthSync } from '@/features/health-sync/store';
import { live } from '@/store/selectors';
import { useStore } from '@/store';

import { commitImport, extrasPart, savedOnly, sleepNoteOf, sleepPlanOf, undoImport, useImportSession } from './session';

const night = (date: string, hours: number): SleepNight => ({
  date,
  store: 'file',
  origin: 'com.apple.health.watch',
  kind: 'watch',
  startedAt: `${date}T00:00:00.000Z`,
  endedAt: `${date}T07:00:00.000Z`,
  asleepMin: hours * 60,
  hours,
  stages: { light: 220, deep: 80, rem: 110, awake: 12 },
  zoneOffsetSec: 3600,
});

const read = (nights: SleepNight[]): ExportRead => ({
  workouts: [],
  steps: null,
  nights,
  asOf: '2026-11-16T07:30:00.000Z',
  counts: { records: 0, stepRecords: 0, stepSamplesUsed: 0, sleepRecords: nights.length, sleepSamplesUsed: nights.length },
});

const nights = () => live(useStore.getState().sleep).sort((a, b) => a.date.localeCompare(b.date));

beforeEach(() => {
  toasts.length = 0;
  useStore.setState({ sleep: {} });
  useHealthSync.setState({ handled: {} });
  useImportSession.setState({ rows: [], exports: {}, result: null, phase: 'review' });
});

describe('nights from a Health export in the import', () => {
  it('says how many nights go in, what stays, and that only sleep counts', () => {
    useStore.getState().upsert('sleep', { date: '2026-11-14', hours: 6, quality: 3 });
    const plan = sleepPlanOf({ 'export.zip': read([night('2026-11-14', 7), night('2026-11-15', 7.5)]) }, Object.values(useStore.getState().sleep), {});
    expect(sleepNoteOf(plan)).toBe('Sleep for 1 night goes to your sleep log with the import. 1 night already there stays as it is. Time awake and time in bed are not counted as sleep.');
    expect(sleepNoteOf(sleepPlanOf({ 'export.zip': read([night('2026-11-14', 7)]) }, Object.values(useStore.getState().sleep), {}))).toBe('The 1 night in this file is already in your sleep log.');
    expect(sleepPlanOf({ 'export.zip': read([]) }, [], {})).toBeNull();
    // A deleted day is only said to be left out, never also "already in your sleep log".
    useStore.getState().remove('sleep', Object.values(useStore.getState().sleep)[0].id);
    expect(sleepNoteOf(sleepPlanOf({ 'export.zip': read([night('2026-11-14', 7)]) }, Object.values(useStore.getState().sleep), {}))).toBe('1 night you deleted is left out.');
    expect(extrasPart(30, 28)).toBe('steps for 30 days and sleep for 28 nights');
    expect(extrasPart(0, 1)).toBe('sleep for 1 night');
    expect(savedOnly(false, true)).toBe('Sleep saved');
    expect(savedOnly(true, true)).toBe('Steps and sleep saved');
  });

  it('saves the nights with the import, leaves a hand-entered night alone, and Undo takes them out again', () => {
    useStore.getState().upsert('sleep', { date: '2026-11-14', hours: 6, quality: 3 });
    useImportSession.setState({ exports: { 'export.zip': read([night('2026-11-13', 7.25), night('2026-11-14', 7), night('2026-11-15', 7.5)]) } });
    commitImport();
    expect(nights().map((n) => [n.date, n.hours, n.source ?? 'hand', n.store ?? '-'])).toEqual([
      ['2026-11-13', 7.25, 'health', 'file'],
      ['2026-11-14', 6, 'hand', '-'],
      ['2026-11-15', 7.5, 'health', 'file'],
    ]);
    const result = useImportSession.getState().result!;
    expect(result.sleep?.nights).toBe(2);
    expect(toasts.at(-1)?.message).toBe('Sleep saved');
    undoImport(result);
    expect(nights().map((n) => n.date)).toEqual(['2026-11-14']);
    expect(useImportSession.getState().result?.undone).toBe(true);
    // A night taken out by Undo is a deleted night: the same file brings it back no more.
    expect(sleepPlanOf({ 'export.zip': read([night('2026-11-13', 7.25)]) }, Object.values(useStore.getState().sleep), {})).toMatchObject({ add: [], deleted: 1 });
  });

  it('corrects an earlier file’s night keeping its rating, and Undo puts the earlier one back', () => {
    useImportSession.setState({ exports: { 'old.zip': read([night('2026-11-15', 6)]) } });
    commitImport();
    const saved = nights()[0];
    useStore.getState().upsert('sleep', { ...saved, quality: 4 });
    useImportSession.setState({ exports: { 'new.zip': read([night('2026-11-15', 7.5)]) }, result: null });
    commitImport();
    expect(nights().map((n) => [n.hours, n.quality])).toEqual([[7.5, 4]]);
    undoImport(useImportSession.getState().result!);
    expect(nights().map((n) => [n.hours, n.quality, n.source])).toEqual([[6, 4, 'health']]);
  });
});
