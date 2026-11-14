/**
 * The database only accepts the collections named in its check constraint. A
 * collection added to the app but not to the SQL would be refused on upload,
 * so the two lists (and the SQL test's own copy) are compared here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BACKUP_COLLECTIONS } from '@/features/settings/exportFormat';

import { COLLECTIONS, DEFAULT_WATER_PRESETS, emptyDirty, initialState, useStore } from './index';

const root = join(__dirname, '..', '..');
const quoted = (text: string) => [...text.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);

describe('synced collections', () => {
  it('are all accepted by the newest database constraint', () => {
    const dir = join(root, 'supabase', 'migrations');
    const constraints = readdirSync(dir)
      .sort()
      .flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/collection in \(([^)]*)\)/g)].map((m) => quoted(m[1])));
    expect(constraints.length).toBeGreaterThan(0);
    expect([...constraints[constraints.length - 1]].sort()).toEqual([...COLLECTIONS].sort());
  });

  it('are all probed by the database test', () => {
    const sql = readFileSync(join(root, 'supabase', 'tests', 'policies_and_sync.sql'), 'utf8');
    const probe = sql.match(/foreach c in array array\[([^\]]*)\]/);
    expect(probe).not.toBeNull();
    expect(quoted(probe![1]).sort()).toEqual([...COLLECTIONS].sort());
  });

  it('are all accepted by the local stand-in backend', () => {
    const mock = readFileSync(join(root, 'scripts', 'dev', 'mock-backend.cjs'), 'utf8');
    const known = mock.match(/const KNOWN = \[([^\]]*)\]/);
    expect(known).not.toBeNull();
    expect(quoted(known![1]).sort()).toEqual([...COLLECTIONS].sort());
  });

  it('are all part of a backup, the dirty map and the initial state', () => {
    expect([...BACKUP_COLLECTIONS].sort()).toEqual([...COLLECTIONS].sort());
    expect(Object.keys(emptyDirty()).sort()).toEqual([...COLLECTIONS].sort());
    const state = initialState() as unknown as Record<string, unknown>;
    for (const c of COLLECTIONS) expect(state[c]).toEqual({});
  });
});

describe('glass sizes follow the unit system until the user sets their own', () => {
  it('switches untouched sizes to round values of the new units and back', () => {
    useStore.getState().resetAll();
    useStore.getState().setProfile({ units: 'metric' });
    expect(useStore.getState().settings.waterPresets).toEqual(DEFAULT_WATER_PRESETS.metric);
    useStore.getState().setProfile({ units: 'imperial' });
    expect(useStore.getState().settings.waterPresets).toEqual(DEFAULT_WATER_PRESETS.imperial);
    expect(useStore.getState().settingsDirty).toBe(true);
    useStore.getState().setProfile({ units: 'metric' });
    expect(useStore.getState().settings.waterPresets).toEqual(DEFAULT_WATER_PRESETS.metric);
  });
  it('leaves sizes the user chose alone', () => {
    useStore.getState().resetAll();
    useStore.getState().setProfile({ units: 'metric' });
    useStore.getState().setSettings({ waterPresets: [200, 400] });
    useStore.getState().setProfile({ units: 'imperial' });
    expect(useStore.getState().settings.waterPresets).toEqual([200, 400]);
  });
});
