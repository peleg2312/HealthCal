import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_TITLE, documentTitle, hasRouteTitle, NOT_FOUND_TITLE, pageTitle, routeKey } from './routeTitle';

const ROOT = join(__dirname, '..', '..', '..');
const APP = join(ROOT, 'src', 'app');

/** Every screen file in src/app as the address it answers: (tabs)/index.tsx is '/', food/search.tsx '/food/search'. */
function routeFiles(dir = APP): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
    const base = name.replace(/\.(web|native|ios|android)?\.?tsx?$/, '').replace(/\.$/, '');
    if (base.startsWith('_') || base.startsWith('+')) continue;
    const segments = relative(APP, full)
      .split(/[\\/]/)
      .slice(0, -1)
      .filter((s) => !/^\(.*\)$/.test(s));
    if (base !== 'index') segments.push(base);
    out.push(`/${segments.join('/')}`);
  }
  return out;
}

/** The routes check-routes.cjs opens, as written there (path with its query). */
function checkedRoutes(): string[] {
  const src = readFileSync(join(ROOT, 'scripts', 'dev', 'check-routes.cjs'), 'utf8');
  const list = src.match(/const ROUTES = \[([\s\S]*?)\];/);
  if (!list) throw new Error('ROUTES not found in check-routes.cjs');
  return [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function split(route: string): { path: string; params: Record<string, string> } {
  const url = new URL(route, 'http://x');
  return { path: url.pathname, params: Object.fromEntries(url.searchParams) };
}

/** Every title a route can show, with the params that choose between them. */
const VARIANTS: Record<string, Record<string, string>[]> = {
  '/auth': [{}, { mode: 'signin' }, { mode: 'signup' }, { mode: 'forgot' }, { mode: 'google' }],
  '/food/detail': [{}, { entryId: 'e1' }],
  '/food/custom': [{}, { id: 'f1' }],
  '/food/meal-edit': [{}, { id: 'm1' }],
  '/activity/log': [{ activityId: 'running' }, { entryId: 'a1' }],
  '/activity/strength': [{}, { entryId: 's1' }],
};

describe('route titles', () => {
  it('finds the screens and the checked routes', () => {
    expect(routeFiles().length).toBeGreaterThan(40);
    expect(checkedRoutes().length).toBeGreaterThan(40);
  });

  it('gives every screen file in src/app a title of its own', () => {
    const missing = routeFiles().filter((path) => !hasRouteTitle(path));
    expect(missing).toEqual([]);
  });

  it('opens every route check-routes.cjs opens with "<page> · HealthCal", never the bare app name', () => {
    for (const route of checkedRoutes()) {
      const { path, params } = split(route);
      const title = documentTitle(path, params);
      expect(title, route).toMatch(new RegExp(`^\\S.* · ${APP_TITLE}$`));
      expect(title, route).not.toBe(APP_TITLE);
      if (path === '/no-such-page') expect(pageTitle(path, params)).toBe(NOT_FOUND_TITLE);
      else expect(pageTitle(path, params), route).not.toBe(NOT_FOUND_TITLE);
    }
  });

  it('never gives two routes the same title, in any of their states', () => {
    const owner = new Map<string, string>();
    const paths = new Set([...routeFiles(), ...checkedRoutes().map((r) => split(r).path)]);
    for (const path of paths) {
      const states = VARIANTS[path] ?? [{}];
      for (const params of states) {
        const title = documentTitle(path, params);
        const before = owner.get(title);
        if (before && before !== path) throw new Error(`${path} and ${before} share the title "${title}"`);
        owner.set(title, path);
      }
    }
  });

  it('reads the address as the router gives it', () => {
    expect(routeKey('/')).toBe('/');
    expect(routeKey('')).toBe('/');
    expect(routeKey('/water/')).toBe('/water');
    expect(routeKey('/food/search?meal=lunch')).toBe('/food/search');
    expect(documentTitle('/')).toBe('Today · HealthCal');
    expect(documentTitle('/water')).toBe('Water · HealthCal');
    expect(documentTitle('/auth', { mode: 'signup' })).toBe('Create an account · HealthCal');
    expect(documentTitle('/auth', { mode: ['forgot'] })).toBe('Reset password · HealthCal');
    expect(documentTitle('/food/detail', { entryId: 'e1' })).toBe('Edit entry · HealthCal');
  });

  it('is rendered by the root Stack on the web only', () => {
    const layout = readFileSync(join(APP, '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/screenLayout=[\s\S]*Platform\.OS === 'web' \? <RouteTitle \/> : null/);
  });
});
