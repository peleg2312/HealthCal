/**
 * The widget's headless path (a tap with the app closed starts the app's JavaScript with no screen)
 * loads only what it needs: the store, `@/lib`, the theme tokens and pure helpers, never the UI kit
 * (its toasts and Reanimated), a screen or an app-level component. Read from the code map
 * (docs/code-map/imports.tsv), which src/codeMap.test.ts keeps current. And the widget library is
 * loaded only where it runs: Android's platform files and the drawing they import.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.join(__dirname, '..', '..', '..');
const graph = new Map<string, string[]>(
  readFileSync(path.join(root, 'docs/code-map/imports.tsv'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [file, ...deps] = line.split('\t');
      return [file, deps.filter(Boolean)];
    }),
);

function closure(start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of graph.get(f) ?? []) queue.push(d);
  }
  return seen;
}

/** The one file under src/ui the widget may load: the cup's pure geometry (no imports of its own). */
const PURE_UI = new Set(['src/ui/vesselLayout.ts']);

describe('the widget headless path', () => {
  it('never loads the UI kit, a screen or an app-level component', () => {
    const files = closure('src/features/widget/register.android.ts');
    expect(files.has('src/features/widget/taskHandler.tsx')).toBe(true);
    expect(files.has('src/store/persistence.ts')).toBe(true);
    const banned = [...files].filter((f) => (f.startsWith('src/ui/') && !PURE_UI.has(f)) || f.startsWith('src/app/') || f.startsWith('src/components/'));
    expect(banned).toEqual([]);
    for (const f of PURE_UI) expect(graph.get(f) ?? []).toEqual([]);
  });

  it('loads the widget library only in Android files and the drawing they import', () => {
    const dir = path.join(root, 'src');
    const users: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') && /from 'react-native-android-widget'/.test(readFileSync(p, 'utf8'))) users.push(path.relative(root, p));
      }
    };
    walk(dir);
    expect(users.sort()).toEqual([
      'src/features/widget/TodayWidget.tsx',
      'src/features/widget/pin.android.ts',
      'src/features/widget/refresh.android.ts',
      'src/features/widget/register.android.ts',
      'src/features/widget/taskHandler.tsx',
    ]);
    // The drawing and the handler are reached only through Android files.
    for (const f of ['src/features/widget/TodayWidget.tsx', 'src/features/widget/taskHandler.tsx']) {
      const importers = [...graph].filter(([, deps]) => deps.includes(f)).map(([file]) => file);
      expect(importers.every((i) => i.endsWith('.android.ts') || i === 'src/features/widget/taskHandler.tsx'), `${f}: ${importers.join(', ')}`).toBe(true);
    }
    const entry = readFileSync(path.join(root, 'index.ts'), 'utf8');
    expect(entry.indexOf("import './src/features/widget/register';")).toBeLessThan(entry.indexOf("import 'expo-router/entry';"));
  });
});
