#!/usr/bin/env node
/**
 * Times the local food search (src/services/foodSearch.ts) over the bundled foods, twice: with V8's
 * JIT, and with the interpreter only (--no-opt --no-sparkplug --no-maglev), the closest stand-in on a
 * desktop for Hermes, which has no JIT. Prints the median per query (25 runs after 5 warm-ups), the
 * first call (index build) and the budgets of the specification (4.9):
 *   interpreter only: median <= 6 ms for every Latin query, <= 10 ms for any query, first call <= 30 ms
 *   JIT:              median <= 3 ms for any query
 * The interpreter's first call is one measurement per process and noisy, so it is measured in five fresh
 * processes (`--mode=first`), all five are printed, and their median is held to the budget.
 * Exits 1 when a budget is missed.
 *
 *   node scripts/dev/search-timing.mjs            both modes, side by side
 *   node scripts/dev/search-timing.mjs --mode=jit (or --mode=interp) one mode, as JSON
 *   node scripts/dev/search-timing.mjs --mode=first  the first call only, as JSON (run with the interpreter flags)
 *
 * The app's TypeScript is loaded with Node's type stripping and a small loader that resolves the `@/`
 * alias and extensionless imports, stands in for react-native, and replaces the online part
 * (openFoodFacts) with a stub, so nothing is fetched.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');
const INTERP = ['--no-opt', '--no-sparkplug', '--no-maglev'];

/** The queries: the specification's 20 timing queries (4.9), a few everyday English ones and the fix round's passes. */
const QUERIES = [
  'חומוס', 'קוטג 5', 'שניצל', 'והחומוס', 'פלאפאל', 'שקשוקע', 'חמוס', 'xyzzy', 'קקקקקק', 'avacado',
  'chicken breast', 'chiken', 'brocolli', 'עגבניות', 'ב', 'tahina', 'chicken', '2 ביצים', 'טוסט גבינה צהובה', 'חומוס בטחינה',
  'apple', 'rice', 'greek yogurt', 'chi', 'salad', 'pepsi', 'a',
  // The parts pass (strict and relaxed find nothing; each word searched by itself), the relaxed pass with an
  // amount, a glued prefix inside a name, and a long Hebrew query (six words, the most the parts pass reads).
  'שניצל בפיתה', 'סביח בפיתה', 'קפה עם חלב סויה', '150 גר עוף', 'חציל טחינה', 'פלאפל חומוס טחינה סלט חריף מלפפון',
  // The second fix round: a percentage the strict pass finds, one the relaxed pass leaves unmatched (only foods
  // whose name states a percentage), one that empties the relaxed pass, and one the parts pass never searches alone.
  'גבינה בולגרית 5%', "קוטג' 7%", 'פיתה 5%', 'פיתה חומוס 5%',
];
const HE = /[\u05d0-\u05ea]/;
const BUDGET = { interpLatin: 6, interpAny: 10, interpFirst: 30, jitAny: 3 };
/** Fresh interpreter processes that measure the first call. */
const FIRST_RUNS = 5;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const HOOKS = `
import { existsSync, statSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const SRC = ${JSON.stringify(SRC)};
const STUBS = ${JSON.stringify(path.join(ROOT, 'test/stubs'))};
const OFF_STUB = 'data:text/javascript,' + encodeURIComponent('export async function searchProductsWithStatus() { return { foods: [], failed: false, unavailable: false }; }');
function file(base) {
  for (const c of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
export async function resolve(spec, ctx, next) {
  if (spec === 'react-native') return { url: pathToFileURL(path.join(STUBS, 'react-native.ts')).href, shortCircuit: true };
  let base = null;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:')) base = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
  if (base) {
    if (base.replace(/\\.ts$/, '') === path.join(SRC, 'services/openFoodFacts')) return { url: OFF_STUB, shortCircuit: true };
    const f = file(base);
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  return next(spec, ctx);
}
`;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function child(mode) {
  register(`data:text/javascript,${encodeURIComponent(HOOKS)}`, import.meta.url);
  const { searchLocal } = await import(pathToFileURL(path.join(SRC, 'services/foodSearch.ts')).href);
  const { BUILTIN_FOODS } = await import(pathToFileURL(path.join(SRC, 'data/foods.ts')).href);
  const t0 = performance.now();
  searchLocal(QUERIES[0]);
  const first = performance.now() - t0;
  if (mode === 'first') {
    process.stdout.write(JSON.stringify({ mode, foods: BUILTIN_FOODS.length, first }));
    return;
  }
  const rows = [];
  for (const q of QUERIES) {
    const ts = [];
    for (let i = 0; i < 30; i++) {
      const a = performance.now();
      searchLocal(q);
      ts.push(performance.now() - a);
    }
    rows.push({ q, ms: median(ts.slice(5)) });
  }
  process.stdout.write(JSON.stringify({ mode, foods: BUILTIN_FOODS.length, first, rows }));
}

function run(mode) {
  const flags = ['--experimental-strip-types', '--no-warnings', ...(mode === 'jit' ? [] : INTERP)];
  const r = spawnSync(process.execPath, [...flags, fileURLToPath(import.meta.url), `--mode=${mode}`], { encoding: 'utf8', cwd: ROOT });
  if (r.status !== 0) {
    process.stderr.write(r.stderr);
    throw new Error(`the ${mode} run failed`);
  }
  return JSON.parse(r.stdout);
}

async function main() {
  const mode = arg('mode');
  if (mode) return child(mode);
  if (!existsSync(path.join(SRC, 'services/foodSearch.ts'))) throw new Error('run from the repository');
  const jit = run('jit');
  const interp = run('interp');
  const firsts = Array.from({ length: FIRST_RUNS }, () => run('first').first);
  const firstMedian = median(firsts);
  const misses = [];
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`Local food search, ${jit.foods} bundled foods, median of 25 runs after 5 warm-ups (ms)`);
  console.log(`${pad('query', 22)}${pad('interpreter', 13)}JIT`);
  interp.rows.forEach((r, i) => {
    const j = jit.rows[i];
    const latin = !HE.test(r.q);
    if (r.ms > BUDGET.interpAny || (latin && r.ms > BUDGET.interpLatin)) misses.push(`interpreter ${r.q} ${r.ms.toFixed(2)} ms`);
    if (j.ms > BUDGET.jitAny) misses.push(`JIT ${r.q} ${j.ms.toFixed(2)} ms`);
    console.log(`${pad(r.q, 22)}${pad(r.ms.toFixed(2), 13)}${j.ms.toFixed(2)}`);
  });
  console.log(`${pad('first call', 22)}${pad(firstMedian.toFixed(1), 13)}${jit.first.toFixed(1)}`);
  console.log(`  interpreter first call in ${FIRST_RUNS} fresh processes: ${firsts.map((x) => x.toFixed(1)).join(', ')} ms (median ${firstMedian.toFixed(1)})`);
  if (firstMedian > BUDGET.interpFirst) misses.push(`interpreter first call, median of ${FIRST_RUNS} processes, ${firstMedian.toFixed(1)} ms`);
  const slowest = (rows, f) => rows.filter(f).reduce((a, b) => (b.ms > a.ms ? b : a), { ms: 0, q: '-' });
  const sl = slowest(interp.rows, (r) => !HE.test(r.q));
  const sa = slowest(interp.rows, () => true);
  const sj = slowest(jit.rows, () => true);
  console.log(
    `Budgets: interpreter Latin <= ${BUDGET.interpLatin} (slowest ${sl.ms.toFixed(2)}, ${sl.q}), any <= ${BUDGET.interpAny} (slowest ${sa.ms.toFixed(2)}, ${sa.q}), first call (median of ${FIRST_RUNS} processes) <= ${BUDGET.interpFirst}; JIT any <= ${BUDGET.jitAny} (slowest ${sj.ms.toFixed(2)}, ${sj.q})`,
  );
  if (misses.length) {
    console.log(`MISSED: ${misses.join('; ')}`);
    process.exitCode = 1;
  } else console.log('All budgets met.');
}

await main();
