/**
 * Export and import of the user's data.
 *
 * Native: the file is written to the cache directory with expo-file-system and
 * handed to the share sheet (save to Files, mail, AirDrop, ...).
 * Web: the browser downloads it.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  activitiesCsv,
  backupJson,
  exportFileName,
  foodCsv,
  mergeCollections,
  parseBackup,
  waterCsv,
  weightCsv,
  type BackupSource,
} from '@/features/settings/exportFormat';
import { toISODate } from '@/lib/dates';
import { COLLECTIONS, ONE_PER_DATE, collapseDateDuplicates, favoriteRecordId, nextStamp, useStore, withSettingsDefaults, type Store } from '@/store';
import { live } from '@/store/selectors';
import type { Collection, Food, Profile } from '@/types';

export type ExportKind = 'backup' | 'food' | 'activities' | 'weight' | 'water';

export type ExportResult = { ok: true; fileName: string; rows?: number } | { ok: false; message: string };

function source(s: Store): BackupSource {
  const collections = {} as BackupSource['collections'];
  for (const c of COLLECTIONS) collections[c] = s[c];
  return {
    profile: s.profile,
    settings: s.settings,
    collections,
    favoriteFoodIds: s.favoriteFoodIds,
    recentFoods: s.recentFoods,
    recentActivityIds: s.recentActivityIds,
  };
}

/** Build the file contents for one export. Pure apart from reading the store. */
export function buildExport(kind: ExportKind, s: Store = useStore.getState(), now: Date = new Date()) {
  const date = toISODate(now);
  switch (kind) {
    case 'backup':
      return { name: exportFileName('backup', date, 'json'), mime: 'application/json', uti: 'public.json', content: backupJson(source(s), now), rows: undefined };
    case 'food':
      return { name: exportFileName('food', date, 'csv'), mime: 'text/csv', uti: 'public.comma-separated-values-text', content: foodCsv(live(s.foodEntries)), rows: live(s.foodEntries).length };
    case 'activities':
      return { name: exportFileName('activities', date, 'csv'), mime: 'text/csv', uti: 'public.comma-separated-values-text', content: activitiesCsv(live(s.activities)), rows: live(s.activities).length };
    case 'weight':
      return { name: exportFileName('weight', date, 'csv'), mime: 'text/csv', uti: 'public.comma-separated-values-text', content: weightCsv(live(s.weights)), rows: live(s.weights).length };
    case 'water':
      return { name: exportFileName('water', date, 'csv'), mime: 'text/csv', uti: 'public.comma-separated-values-text', content: waterCsv(live(s.water)), rows: live(s.water).length };
  }
}

function downloadOnWeb(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Write a file and share it (native) or download it (web). */
export async function exportData(kind: ExportKind): Promise<ExportResult> {
  try {
    const file = buildExport(kind);
    // A byte order mark lets Excel open UTF-8 CSV files with accents and emoji intact.
    const content = file.mime === 'text/csv' ? `﻿${file.content}` : file.content;
    if (Platform.OS === 'web') {
      downloadOnWeb(file.name, content, file.mime);
      return { ok: true, fileName: file.name, rows: file.rows };
    }
    const out = new File(Paths.cache, file.name);
    if (out.exists) out.delete();
    out.create();
    // write() is async in SDK 58: wait for it, so the share sheet never gets a partial file and a failed write is reported.
    await out.write(content);
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, message: 'Sharing is not available on this device.' };
    }
    await Sharing.shareAsync(out.uri, { mimeType: file.mime, UTI: file.uti, dialogTitle: `Export ${file.name}` });
    return { ok: true, fileName: file.name, rows: file.rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'The export could not be created.' };
  }
}

export type ImportResult =
  | {
      ok: true;
      added: number;
      updated: number;
      unchanged: number;
      /** The profile, goals and settings from the backup are now in use. */
      profileRestored: boolean;
      /** The backup has a profile that was not applied because this device already has a newer one. */
      profileSkipped: boolean;
      /** Records left out because they were malformed. */
      skipped: number;
    }
  | { ok: false; message: string; canceled?: boolean };

/** Text of the most recent backup read, kept so the profile can be applied after the user confirms. */
let lastBackupText: string | null = null;

/**
 * Merge a parsed backup text into the store: by id, newer record wins.
 * The profile is only replaced when the backup's is newer, unless
 * `forceProfile` is set (the user chose to restore it, or the device is new).
 */
export function importBackupText(text: string, options: { forceProfile?: boolean } = {}): ImportResult {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  lastBackupText = text;
  const b = parsed.backup;
  const s = useStore.getState();
  const local = {} as Parameters<typeof mergeCollections>[0];
  for (const c of COLLECTIONS) local[c] = s[c];
  const merged = mergeCollections(local, b.collections);

  const hasProfile = !!b.profile;
  const profileRestored = hasProfile && (!!options.forceProfile || !s.profile || b.profile!.updatedAt > s.profile.updatedAt);
  const backupSettings = b.settings;
  const settingsRestored = !!backupSettings && (!!options.forceProfile || backupSettings.updatedAt > s.settings.updatedAt);

  useStore.setState((cur) => {
    const next = { ...(merged.collections as Partial<Store>) } as Record<string, Record<string, { id: string; updatedAt: string; deleted?: boolean }>>;
    const dirty = { ...cur.dirty };
    for (const c of COLLECTIONS as Collection[]) {
      if (merged.changed[c].length === 0) continue;
      dirty[c] = { ...cur.dirty[c] };
      for (const id of merged.changed[c]) dirty[c][id] = true;
    }
    // A backup from another device can bring a second weigh-in or sleep entry for a day that already has one.
    for (const c of ONE_PER_DATE) {
      if (!next[c]) continue;
      const collapsed = collapseDateDuplicates(next[c], dirty[c]);
      next[c] = collapsed.map;
      dirty[c] = collapsed.dirty;
    }
    const recent: Food[] = [...cur.recentFoods];
    for (const f of b.recentFoods) if (f && typeof f.id === 'string' && !recent.some((r) => r.id === f.id)) recent.push(f);
    // Backups made before favourites were records list them by id only: rebuild the records.
    const favorites = { ...((next.favorites ?? cur.favorites) as Store['favorites']) };
    const known = new Map<string, Food>(recent.map((f) => [f.id, f]));
    for (const f of Object.values((next.customFoods ?? cur.customFoods) as Store['customFoods'])) if (!f.deleted) known.set(f.id, f);
    for (const foodId of b.favoriteFoodIds) {
      const id = favoriteRecordId(foodId);
      const food = known.get(foodId);
      if (favorites[id] || !food) continue;
      favorites[id] = { id, food, updatedAt: nextStamp(), deleted: false };
      dirty.favorites = { ...dirty.favorites, [id]: true };
    }
    const favoriteFoodIds = Object.values(favorites)
      .filter((f) => !f.deleted)
      .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
      .map((f) => f.food.id);
    return {
      ...(next as Partial<Store>),
      favorites,
      favoriteFoodIds,
      dirty,
      recentFoods: recent.slice(0, 60),
      recentActivityIds: [...new Set([...cur.recentActivityIds, ...b.recentActivityIds])].slice(0, 12),
      // Stamped now, so the restored profile also wins on the account's other devices.
      ...(profileRestored && b.profile ? { profile: { ...b.profile, updatedAt: nextStamp(cur.profile?.updatedAt) }, profileDirty: true } : {}),
      ...(settingsRestored && backupSettings ? { settings: { ...withSettingsDefaults(backupSettings), updatedAt: nextStamp(cur.settings.updatedAt) }, settingsDirty: true } : {}),
    };
  });
  return {
    ok: true,
    added: merged.added,
    updated: merged.updated,
    unchanged: merged.unchanged,
    profileRestored,
    // Only worth asking when the backup's profile actually differs from the one in use.
    profileSkipped: hasProfile && !profileRestored && !sameProfile(b.profile, s.profile),
    skipped: parsed.skipped,
  };
}

function sameProfile(a: Profile | null, b: Profile | null): boolean {
  if (!a || !b) return a === b;
  const { updatedAt: _a, ...x } = a;
  const { updatedAt: _b, ...y } = b;
  void _a;
  void _b;
  return JSON.stringify(x, Object.keys(x).sort()) === JSON.stringify(y, Object.keys(y).sort());
}

/** Apply the profile, goals and settings from the backup that was just imported (after the user confirms). */
export function applyLastBackupProfile(): ImportResult {
  if (!lastBackupText) return { ok: false, message: 'Choose the backup file again.' };
  return importBackupText(lastBackupText, { forceProfile: true });
}

/** Let the user pick a JSON backup and merge it. */
export async function pickAndImportBackup(options: { forceProfile?: boolean } = {}): Promise<ImportResult> {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) return { ok: false, message: 'No file chosen.', canceled: true };
    const asset = res.assets[0];
    const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
    return importBackupText(text, options);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'The file could not be read.' };
  }
}
