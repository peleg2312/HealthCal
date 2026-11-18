#!/usr/bin/env node
/**
 * Measures what the food analysis really costs and how close it gets, by running the function's
 * own code (supabase/functions/analyze-food/analyze.ts) against the model. Every run spends real
 * money, so every request is priced from the response's own usage (cache writes and reads
 * included) and added to a ledger before the next one is sent; the script refuses to send once the
 * ledger reaches its limit.
 *
 *   With a key:
 *     ANTHROPIC_API_KEY=... node --experimental-transform-types scripts/ops/eval-food-ai.mjs [options]
 *   Through the temporary measuring route (no key on this machine; scripts/ops/food-ai-lab/README.md):
 *     NODE_USE_ENV_PROXY=1 node --experimental-transform-types scripts/ops/eval-food-ai.mjs --via=lab --account=<file> [options]
 *
 * Options
 *   --configs=current,precise   what to run (below); a config may carry changes: precise/model=claude-opus-5-5/effort=low
 *   --trials=2                  runs of every case per config
 *   --photos=<dir>              a folder with cases.json ({ cases: [{ id, file, filePrecise?, text?, min?, max?, truth?, tags?, use? }] })
 *                               and the JPEG files it names, already resized as the app would; --photo-cases=<file> reads another cases file
 *   --typed=<file>[,<file>]     typed meals (default scripts/ops/food-ai-cases.json); { cases: [{ id, text, min?, max?, truth?, ... }] }
 *   --kind=all|text|photo       --only=<case id>,...   --show-misfits (print first answers that broke the plain-lines form)
 *   --out=<file.json>           also write every row of this run as one JSON file (the old output)
 *   --rows=<file.jsonl>         every row is appended as it finishes; a rerun skips the (config, case, trial) already there,
 *                               so a stopped run resumes and a paid row is never bought twice
 *   --ledger=<file.json>        the money ledger ({ limitUsd, totalUsd, entries }); --limit=<usd> sets its limit when it is created
 *   --expect=<usd>              expected cost of one request; required to send. The run stops if its first ten requests cost
 *                               more than twice that. --run=<label> names the run in the ledger. --concurrency=3
 *   --report=<rows.jsonl>,...   send nothing: print the tables from rows already measured (with --configs to pick, else all)
 *   --compare=<A>,<B>           paired by case: B minus A, with a bootstrap 95% interval over cases (A or B may be config#trial)
 *   --breakdown                 the error by size, number of items, oil, and portion against energy density
 *
 * Configs
 *   current      what the app sends by default: the small model, effort low
 *   json         the same, answered as schema-checked JSON instead of the plain lines (the fallback form)
 *   medium       the small model at effort medium
 *   no-thinking  the small model, effort low, thinking switched off
 *   precise      the "check again more carefully" pass: the bigger model (and the 1024 px photo)
 *   weight       a photo with its weighed total, as the app sends it from "Weighed it? Total grams": the quick pass with
 *                photoText(note, grams) (src/features/ai/weight.ts) as the photo's text, grams from the case's truth.grams;
 *                off=<percent> sends it that much off (weight/off=15, weight/off=-15: a person's own scale, or the bowl in it)
 *   Changes after a slash: model=<id>, effort=<level>, thinking=off|omit (omit drops the field, for models that refuse
 *   disabled thinking), max=<max_tokens>, v=<features> (passed to the analyze code as options.variant; for --analyze copies),
 *   off=<percent> (weight only).
 *
 * Scoring. A case with `truth` ({ kcal, protein?, carbs?, fat?, grams? }) is scored against it; a case with only min/max
 * passes when the total falls inside. Headline figures are on meals of 150 kcal or more (a 30 kcal miss on a 50 kcal side
 * is not what a person feels), next to the absolute error in kcal on every case and the signed bias.
 * Prices (RATES), the most one request can cost and what is booked when an answer is lost are in eval-food-ai-money.mjs.
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --analyze=<file.ts> runs a changed copy of the analyze code (a prompt or parser variant) instead of the function's own.
// The copy must import the same @anthropic-ai/sdk (a node_modules link beside it), so the error classes are the same.
const analyzeArg = (process.argv.find((a) => a.startsWith('--analyze=')) ?? '').slice('--analyze='.length);
const { AnalyzeError, analyzeFood, parseAnswer } = await import(
  analyzeArg ? new URL(`file://${path.resolve(analyzeArg)}`).href : '../../supabase/functions/analyze-food/analyze.ts'
);

import { ceilingOf, costOf, mayReserve, maybeBilled } from './eval-food-ai-money.mjs';
// The app's own words for a weighed total, so the 'weight' config sends exactly what the app sends.
const { photoText } = await import('../../src/features/ai/weight.ts');

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const flag = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).slice(name.length + 3);
const has = (name) => process.argv.includes(`--${name}`);
const configsFlag = flag('configs', '');
const trials = Number(flag('trials', '2'));
const photosDir = flag('photos', '');
const out = flag('out', '');
const kind = flag('kind', 'all');
const showMisfits = has('show-misfits');
const only = flag('only', '');
const via = flag('via', 'key');
const rowsFile = flag('rows', '');
const ledgerFile = flag('ledger', '');
const expect = Number(flag('expect', '0'));
const runLabel = flag('run', new Date().toISOString());
const concurrency = Math.max(1, Number(flag('concurrency', '3')));
const reportFiles = flag('report', '');
const compare = flag('compare', '');

// ---------- cases ----------

const pick = (c) => c.use !== false && (!only || only.split(',').includes(c.id));
const typedFiles = flag('typed', path.join(here, 'food-ai-cases.json')).split(',').filter(Boolean);
const textCases =
  kind === 'photo'
    ? []
    : typedFiles.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).cases.map((c) => ({ ...c, set: path.basename(f, '.json') }))).filter(pick);
const photoCasesFile = flag('photo-cases', photosDir ? path.join(photosDir, 'cases.json') : '');
const photoCases = photoCasesFile && kind !== 'text' ? JSON.parse(fs.readFileSync(photoCasesFile, 'utf8')).cases.map((c) => ({ ...c, set: 'photo' })).filter(pick) : [];

// ---------- configs ----------

/** "precise/model=x/effort=low" -> { label, base, changes }. */
function parseConfig(label) {
  const [base, ...rest] = label.split('/');
  const changes = Object.fromEntries(rest.map((kv) => kv.split('=')));
  if (!['current', 'json', 'medium', 'no-thinking', 'precise', 'weight'].includes(base)) throw new Error(`Unknown config ${base}`);
  for (const k of Object.keys(changes)) if (!['model', 'effort', 'thinking', 'max', 'v', 'off'].includes(k)) throw new Error(`Unknown change ${k} in ${label}`);
  if (changes.off !== undefined && (base !== 'weight' || !Number.isFinite(Number(changes.off)))) throw new Error(`off=<percent> goes with weight only, in ${label}`);
  return { label, base, changes };
}

function changeParams(config, params) {
  let p = { ...params };
  if (config.base === 'medium') p.output_config = { ...p.output_config, effort: 'medium' };
  if (config.base === 'no-thinking') p.thinking = { type: 'disabled' };
  const ch = config.changes;
  if (ch.model) p.model = ch.model;
  if (ch.effort) p.output_config = { ...p.output_config, effort: ch.effort };
  if (ch.thinking === 'off') p.thinking = { type: 'disabled' };
  if (ch.thinking === 'omit') delete p.thinking;
  if (ch.max) p.max_tokens = Number(ch.max);
  return p;
}

// ---------- money ----------

const ledger = {
  data: null,
  load() {
    if (!ledgerFile) return;
    this.data = fs.existsSync(ledgerFile)
      ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8'))
      : { limitUsd: Number(flag('limit', '2.5')), totalUsd: 0, entries: [] };
  },
  save() {
    if (!ledgerFile) return;
    const tmp = `${ledgerFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, ledgerFile);
  },
  add(entry) {
    if (!this.data) return;
    this.data.entries.push(entry);
    this.data.totalUsd = Math.round((this.data.totalUsd + entry.usd) * 1e6) / 1e6;
    this.save();
  },
};

class BudgetStop extends Error {}
let stopReason = '';
let inFlightUsd = 0;
const runSpend = { n: 0, usd: 0 };

/**
 * Called before every request (and every retry): the ledger, plus the most the requests already on
 * their way can cost, plus the most this one can cost (ceilingOf: its input and max_tokens at its
 * model's rates), must stay under the limit. --expect only judges the first ten requests.
 */
function mayCall(ceilingUsd) {
  if (stopReason) throw new BudgetStop(stopReason);
  if (!ledger.data) return;
  if (!mayReserve(ledger.data.totalUsd, inFlightUsd, ceilingUsd, ledger.data.limitUsd)) {
    stopReason = `the ledger is at $${ledger.data.totalUsd.toFixed(4)} of its $${ledger.data.limitUsd} limit (with $${(inFlightUsd + ceilingUsd).toFixed(4)} reserved for requests on their way)`;
    throw new BudgetStop(stopReason);
  }
}

function recordSpend(entry) {
  ledger.add(entry);
  runSpend.n += 1;
  runSpend.usd += entry.usd;
  if (runSpend.n === 10 && expect > 0 && runSpend.usd > 2 * 10 * expect) {
    stopReason = `the first ten requests cost $${runSpend.usd.toFixed(4)}, more than twice the $${(10 * expect).toFixed(4)} expected`;
  }
}

// ---------- the two ways to reach the model ----------

/** The temporary route: posts the request exactly as analyze.ts builds it and gets the model's own response back. */
async function labTransport() {
  const require = createRequire(path.join(ROOT, 'package.json'));
  const { createClient } = require('@supabase/supabase-js');
  const env = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8')).build.production.env;
  const url = flag('lab-url', `${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/analyze-food-lab`);
  const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const account = JSON.parse(fs.readFileSync(flag('account', ''), 'utf8'));
  const auth = createClient(env.EXPO_PUBLIC_SUPABASE_URL, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  let token = '';
  const signIn = async () => {
    const r = await auth.auth.signInWithPassword({ email: account.email, password: account.password });
    if (r.error) throw new Error(`lab sign-in failed: ${r.error.message}`);
    token = r.data.session.access_token;
  };
  await signIn();
  return async (params, options = {}) => {
    for (let attempt = 0, signedAgain = false; ; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(options.timeout ?? 90_000),
        });
      } catch (e) {
        if (e?.name === 'TimeoutError') throw Object.assign(new Anthropic.APIConnectionTimeoutError(), { labTimeout: true });
        // The request may have left before the connection broke: book it, it costs at most its ceiling.
        options.bookLost?.(`lab connection lost: ${String(e?.message ?? e).slice(0, 60)}`);
        throw new Anthropic.APIConnectionError({ message: String(e?.message ?? e) });
      }
      const body = await res.json().catch(() => null);
      const upstreamMs = Number(res.headers.get('x-lab-upstream-ms') ?? '0');
      if (res.ok) return { response: body, upstreamMs };
      if (body?.lab === 'refused') {
        if (res.status === 403 && !signedAgain) {
          signedAgain = true;
          await signIn();
          attempt--;
          continue;
        }
        throw new Error(`The lab route refused the request (${res.status}: ${body.reason}). Nothing was sent to the model.`);
      }
      if (res.status === 401 && !upstreamMs && !signedAgain) {
        signedAgain = true;
        await signIn();
        attempt--;
        continue;
      }
      // A server error may have come after the model ran (the route lost the answer, or the platform cut the
      // function off): book this attempt at its ceiling, as a timeout is booked, before trying again.
      if (maybeBilled(res.status, body)) options.bookLost?.(`lab ${res.status}${upstreamMs ? ` after ${upstreamMs} ms upstream` : ''}`);
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < (options.maxRetries ?? 2)) {
        await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get('retry-after') ?? 2)));
        mayCall(ceilingOf(params));
        continue;
      }
      throw Anthropic.APIError.generate(res.status, body, body?.error?.message ?? `HTTP ${res.status}`, res.headers);
    }
  };
}

async function keyTransport() {
  const real = new Anthropic();
  return async (params, { bookLost: _b, ...options } = {}) => {
    const started = Date.now();
    const response = params.betas ? await real.beta.messages.create(params, options) : await real.messages.create(params, options);
    return { response, upstreamMs: Date.now() - started };
  };
}

const transport = reportFiles ? null : via === 'lab' ? await labTransport() : await keyTransport();

/** One analysis's client: the config's change on the way out, every request priced and put in the ledger. */
function clientFor(config, sink) {
  const send = async (params, options) => {
    const changed = changeParams(config, params);
    const ceiling = ceilingOf(changed);
    mayCall(ceiling);
    inFlightUsd += ceiling;
    // A try that may have been billed but gave no usage back is booked at its ceiling (marked estimated).
    const bookLost = (why) => {
      recordSpend({ at: new Date().toISOString(), run: runLabel, config: config.label, id: sink.id, model: changed.model, estimated: true, why, usd: ceiling });
      sink.usd += ceiling;
    };
    let got;
    try {
      // analyze.ts passes its own timeout and retry count: keep them, so the run waits as the app would.
      got = await transport(changed, { ...options, bookLost });
    } catch (e) {
      // A request that timed out on this side may still have been answered and billed: count it at its ceiling.
      if (e?.labTimeout || e instanceof Anthropic.APIConnectionTimeoutError) bookLost('timed out on this side');
      throw e;
    } finally {
      inFlightUsd -= ceiling;
    }
    const { response, upstreamMs } = got;
    const usd = costOf(changed.model, response);
    const u = response.usage ?? {};
    const usage = {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
    };
    recordSpend({ at: new Date().toISOString(), run: runLabel, config: config.label, id: sink.id, model: response.model, usage, usd });
    sink.requests.push({ model: response.model, usage, usd, upstreamMs, stop: response.stop_reason });
    sink.usd += usd;
    sink.upstreamMs += upstreamMs;
    if (showMisfits && !changed.output_config?.format) {
      const text = (response.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (!parseAnswer(text)) console.log(`--- an answer that did not keep the form (${config.label}):\n${text}\n---`);
    }
    return response;
  };
  return { messages: { create: send }, beta: { messages: { create: send } } };
}

async function runOne(config, c, trial) {
  const precise = config.base === 'precise';
  const input = { text: c.text, precise };
  if (c.file) {
    input.image = fs.readFileSync(path.join(photosDir, precise && c.filePrecise ? c.filePrecise : c.file)).toString('base64');
    input.mediaType = 'image/jpeg';
    if (config.base === 'weight') {
      const grams = c.truth?.grams ? c.truth.grams * (1 + Number(config.changes.off ?? 0) / 100) : null;
      // A case's own text is the note beside the weight; a case without a weighed total sends the note alone.
      input.text = photoText(c.text ?? '', grams === null ? null : Math.round(grams));
    }
  }
  const sink = { id: c.id, requests: [], usd: 0, upstreamMs: 0 };
  const started = Date.now();
  const row = { config: config.label, id: c.id, set: c.set, photo: !!c.file, trial, truth: c.truth ?? null, min: c.min ?? null, max: c.max ?? null, tags: c.tags ?? (c.group ? { group: c.group, amount: c.amount, truthSource: c.truthSource } : null) };
  try {
    const r = await analyzeFood(clientFor(config, sink), input, { ...(config.base === 'json' ? { format: 'json' } : null), ...(config.changes.v ? { variant: config.changes.v } : null) });
    Object.assign(row, {
      ok: true,
      model: r.model,
      kcal: r.items.reduce((s, i) => s + i.kcal, 0),
      dish: r.dish,
      // Variants may add per-item fields (a reference row, a grams range): kept as they come.
      items: r.items.map((i) => ({ ...i, fiber: undefined })),
      ...(r.extra ? { extra: r.extra } : null),
      question: r.hiddenFatQuestion,
      note: r.note,
    });
    row.pass = c.expect ? false : c.min !== undefined ? row.kcal >= c.min && row.kcal <= c.max : null;
  } catch (e) {
    if (!(e instanceof AnalyzeError)) throw e;
    Object.assign(row, { ok: false, error: e.code, message: e.message, pass: c.expect === e.code });
  }
  row.ms = Date.now() - started;
  row.upstreamMs = sink.upstreamMs;
  row.requests = sink.requests;
  row.usd = sink.usd;
  return row;
}

// ---------- statistics ----------

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function quantile(xs, q) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}
const median = (xs) => quantile(xs, 0.5);
const pct = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '-');
const fix = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '-');

/**
 * The range shown in the app: each item kcal x (1 +/- s), s = (0.15 + (1 - confidence) x 0.3) x widen, at most 0.9, with
 * widen 1.5 for an answer read from a photo (PHOTO_SPREAD, src/features/ai/estimate.ts; every item of an analysis row is
 * one the model read) and 1 for a typed one.
 */
const PHOTO_SPREAD = 1.5;
function shownRange(items, photo = false) {
  let lo = 0;
  let hi = 0;
  for (const i of items) {
    const s = Math.min(0.9, (0.15 + (1 - Math.min(1, Math.max(0, i.confidence ?? 0.5))) * 0.3) * (photo ? PHOTO_SPREAD : 1));
    lo += i.kcal * (1 - s);
    hi += i.kcal * (1 + s);
  }
  return [lo, hi];
}

/** A range from the model's own grams range (variants with lo/hi per item): each item's kcal scaled by lo/grams and hi/grams. */
function gramsRange(items) {
  if (!items.length || !items.every((i) => i.lo > 0 && i.hi > 0 && i.grams > 0)) return null;
  return [items.reduce((a, i) => a + (i.kcal * Math.min(i.lo, i.grams)) / i.grams, 0), items.reduce((a, i) => a + (i.kcal * Math.max(i.hi, i.grams)) / i.grams, 0)];
}

/** Interval score at alpha 0.2 relative to truth: width plus 10 x the distance outside (lower is better; one number for coverage and width). */
const intervalScore = ([lo, hi], t) => (hi - lo + (2 / 0.2) * (Math.max(0, lo - t) + Math.max(0, t - hi))) / t;

function scored(rows) {
  return rows.filter((r) => r.ok && r.truth?.kcal > 0).map((r) => {
    const t = r.truth;
    const rel = (r.kcal - t.kcal) / t.kcal;
    const protein = r.items.reduce((s, i) => s + i.protein, 0);
    const fat = r.items.reduce((s, i) => s + i.fat, 0);
    const grams = r.items.reduce((s, i) => s + i.grams, 0);
    const [lo, hi] = shownRange(r.items, !!r.photo);
    const gr = gramsRange(r.items);
    return {
      shownIs: intervalScore([lo, hi], t.kcal),
      shownWidth: (hi - lo) / r.kcal,
      gramsCovered: gr ? t.kcal >= gr[0] && t.kcal <= gr[1] : null,
      gramsIs: gr ? intervalScore(gr, t.kcal) : null,
      gramsWidth: gr ? (gr[1] - gr[0]) / r.kcal : null,
      r,
      rel,
      abs: Math.abs(rel),
      kcalErr: r.kcal - t.kcal,
      big: t.kcal >= 150,
      proteinRel: t.protein >= 5 ? (protein - t.protein) / t.protein : null,
      fatErr: t.fat != null ? fat - t.fat : null,
      gramsLog: t.grams > 0 && grams > 0 ? Math.log(grams / t.grams) : null,
      densityLog: t.grams > 0 && grams > 0 ? Math.log(r.kcal / grams / (t.kcal / t.grams)) : null,
      covered: t.kcal >= lo && t.kcal <= hi,
    };
  });
}

/** Headline figures leave out cases whose truth an audit doubts (tags.audit other than ok or minor); --breakdown still shows them. */
const trusted = (r) => !r.tags?.audit || r.tags.audit === 'ok' || r.tags.audit === 'minor';

function summary(rows) {
  const s = scored(rows.filter(trusted));
  const big = s.filter((x) => x.big);
  const prot = s.map((x) => x.proteinRel).filter((x) => x !== null);
  const reqs = rows.flatMap((r) => r.requests ?? []);
  return {
    n: rows.length,
    ok: rows.filter((r) => r.ok).length,
    scored: s.length,
    big: big.length,
    medAbs: median(big.map((x) => x.abs)),
    p90Abs: quantile(big.map((x) => x.abs), 0.9),
    within20: big.length ? big.filter((x) => x.abs <= 0.2).length / big.length : NaN,
    bias: median(big.map((x) => x.rel)),
    meanSignedKcal: mean(s.map((x) => x.kcalErr)),
    maeKcal: mean(s.map((x) => Math.abs(x.kcalErr))),
    weighted: s.reduce((a, x) => a + Math.abs(x.kcalErr), 0) / s.reduce((a, x) => a + x.r.truth.kcal, 0),
    proteinAbs: median(prot.map(Math.abs)),
    proteinBias: median(prot),
    coverage: s.length ? s.filter((x) => x.covered).length / s.length : NaN,
    shownIs: median(s.map((x) => x.shownIs)),
    shownWidth: median(s.map((x) => x.shownWidth)),
    gramsCoverage: s.some((x) => x.gramsCovered !== null) ? s.filter((x) => x.gramsCovered).length / s.filter((x) => x.gramsCovered !== null).length : NaN,
    gramsIs: median(s.map((x) => x.gramsIs).filter((x) => x !== null)),
    gramsWidth: median(s.map((x) => x.gramsWidth).filter((x) => x !== null)),
    inRange: rows.filter((r) => r.pass !== null && r.pass !== undefined),
    medS: median(rows.map((r) => r.ms)) / 1000,
    p90S: quantile(rows.map((r) => r.ms), 0.9) / 1000,
    medUpS: median(rows.filter((r) => r.upstreamMs).map((r) => r.upstreamMs)) / 1000,
    usdReq: reqs.length ? reqs.reduce((a, q) => a + q.usd, 0) / reqs.length : NaN,
    usdAnalysis: mean(rows.map((r) => r.usd ?? 0)),
    usd: rows.reduce((a, r) => a + (r.usd ?? 0), 0),
    requests: reqs.length,
  };
}

function printSummary(rows, configs) {
  console.log('\nconfig                              set                n  ok  >=150  med|err|  p90|err|  <=20%   bias   MAE kcal  wtd|err|  prot|err| prot bias  range has truth  in range   s med  s p90  model s   $/req     $/analysis');
  const sets = [...new Set(rows.map((r) => r.set))];
  for (const config of configs) {
    for (const set of sets) {
      const rs = rows.filter((r) => r.config === config && r.set === set);
      if (!rs.length) continue;
      const m = summary(rs);
      const pass = m.inRange.length ? `${m.inRange.filter((r) => r.pass).length}/${m.inRange.length}` : '-';
      console.log(
        `${config.padEnd(35)} ${set.padEnd(16)} ${String(m.n).padStart(3)} ${String(m.ok).padStart(3)} ${String(m.big).padStart(5)}  ${pct(m.medAbs).padStart(8)}  ${pct(m.p90Abs).padStart(8)}  ${pct(m.within20).padStart(5)}  ${pct(m.bias).padStart(5)}  ${fix(m.maeKcal).padStart(8)}  ${pct(m.weighted).padStart(8)}  ${pct(m.proteinAbs).padStart(8)}  ${pct(m.proteinBias).padStart(8)}  ${pct(m.coverage).padStart(15)}  ${pass.padStart(8)}  ${fix(m.medS, 1).padStart(6)} ${fix(m.p90S, 1).padStart(6)} ${fix(m.medUpS, 1).padStart(8)}  $${fix(m.usdReq * 1000, 3)}/k  $${fix(m.usdAnalysis * 1000, 3)}/k`,
      );
    }
  }
  console.log('\nranges (every scored case): config / set / shown range: holds truth, median width, median interval score (alpha 0.2) / model grams range: the same');
  for (const config of configs) for (const set of sets) {
    const rs = rows.filter((r) => r.config === config && r.set === set);
    if (!rs.length) continue;
    const m = summary(rs);
    console.log(`  ${config.padEnd(35)} ${set.padEnd(16)} shown ${pct(m.coverage)} w ${pct(m.shownWidth)} IS ${fix(m.shownIs, 2)}   grams ${pct(m.gramsCoverage)} w ${pct(m.gramsWidth)} IS ${fix(m.gramsIs, 2)}`);
  }
  console.log('err = (estimate - truth) / truth on meals of 150 kcal or more; bias = its median; MAE kcal and wtd|err| (sum |err| / sum truth) on every case with truth;');
  const doubted = rows.filter((r) => !trusted(r)).length;
  if (doubted) console.log(`${doubted} rows of cases whose truth an audit doubts are left out of these figures (--breakdown shows them).`);
  console.log('prot on truth protein >= 5 g; "range has truth" = share whose truth lies inside the range the app shows; s = wall seconds per analysis; model s = time inside the model call.');
}

/** A seeded generator, so the same rows always give the same interval. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function selectRows(rows, spec) {
  const [config, trial] = spec.split('#');
  return rows.filter((r) => r.config === config && (!trial || r.trial === Number(trial)));
}

/** Per case: the mean over its trials, so a case run twice counts once. */
function perCase(rows, value) {
  const by = new Map();
  for (const x of scored(rows)) {
    const v = value(x);
    if (v === null || !Number.isFinite(v)) continue;
    const k = `${x.r.set}:${x.r.id}`;
    by.set(k, [...(by.get(k) ?? []), v]);
  }
  return new Map([...by].map(([k, vs]) => [k, mean(vs)]));
}

function pairedCompare(rows, specA, specB) {
  const A = selectRows(rows, specA).filter(trusted);
  const B = selectRows(rows, specB).filter(trusted);
  const metrics = [
    ['|err| on meals >= 150 kcal (clipped at 100%)', (x) => (x.big ? Math.min(1, x.abs) : null), pct],
    ['|err| in kcal, every case', (x) => Math.abs(x.kcalErr), (v) => `${fix(v)} kcal`],
    ['signed err on meals >= 150 kcal', (x) => (x.big ? x.rel : null), pct],
    ['|protein err| (truth >= 5 g)', (x) => (x.proteinRel === null ? null : Math.min(1, Math.abs(x.proteinRel))), pct],
  ];
  for (const set of [...new Set([...A, ...B].map((r) => r.set))]) {
    let header = false;
    for (const [name, value, show] of metrics) {
      const a = perCase(A.filter((r) => r.set === set), value);
      const b = perCase(B.filter((r) => r.set === set), value);
      const keys = [...a.keys()].filter((k) => b.has(k));
      if (keys.length < 5) continue;
      if (!header) console.log(`\n${specB} minus ${specA}, ${set} (paired by case, mean over trials, bootstrap 95% interval over cases, 4000 resamples):`);
      header = true;
      const d = keys.map((k) => b.get(k) - a.get(k));
      const rand = rng(20261118);
      const boots = [];
      for (let i = 0; i < 4000; i++) {
        let s = 0;
        for (let j = 0; j < d.length; j++) s += d[Math.floor(rand() * d.length)];
        boots.push(s / d.length);
      }
      const lo = quantile(boots, 0.025);
      const hi = quantile(boots, 0.975);
      const verdict = lo <= 0 && hi >= 0 ? 'inside the noise' : hi < 0 ? `${specB} lower` : `${specB} higher`;
      console.log(`  ${name.padEnd(46)} n=${String(keys.length).padStart(3)}  A ${show(mean(keys.map((k) => a.get(k))))}  B ${show(mean(keys.map((k) => b.get(k))))}  diff ${show(mean(d))} [${show(lo)}, ${show(hi)}]  ${verdict}`);
    }
  }
}

function breakdown(rows, configs) {
  for (const config of configs) for (const set of [...new Set(rows.map((r) => r.set))]) {
    const s = scored(rows.filter((r) => r.config === config && r.set === set));
    if (!s.length) continue;
    console.log(`\nWhere the error is: ${config}, ${set} (${s.length} scored analyses)`);
    const group = (name, keyOf) => {
      const by = new Map();
      for (const x of s) {
        const k = keyOf(x);
        if (k === undefined || k === null) continue;
        by.set(k, [...(by.get(k) ?? []), x]);
      }
      if (!by.size) return;
      console.log(`  by ${name}:`);
      for (const [k, xs] of [...by].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
        console.log(
          `    ${String(k).padEnd(26)} n=${String(xs.length).padStart(3)}  med|err| ${pct(median(xs.map((x) => x.abs))).padStart(5)}  bias ${pct(median(xs.map((x) => x.rel))).padStart(5)}  MAE ${fix(mean(xs.map((x) => Math.abs(x.kcalErr)))).padStart(4)} kcal  mean signed ${fix(mean(xs.map((x) => x.kcalErr))).padStart(5)} kcal`,
        );
      }
    };
    group('size', (x) => x.r.tags?.size ?? (x.r.truth.kcal < 150 ? 'under 150 kcal' : x.r.truth.kcal < 400 ? '150-400 kcal' : x.r.truth.kcal < 700 ? '400-700 kcal' : '700+ kcal'));
    group('mix', (x) => x.r.tags?.mix);
    group('oil', (x) => (x.r.tags?.oil === undefined ? undefined : x.r.tags.oil ? 'oil, butter or dressing' : 'none recorded'));
    group('group', (x) => x.r.tags?.group);
    group('amount', (x) => x.r.tags?.amount);
    group('truth source', (x) => x.r.tags?.truthSource);
    group('audit', (x) => x.r.tags?.audit);
    const both = s.filter((x) => x.gramsLog !== null);
    if (both.length) {
      // log(kcal ratio) = log(grams ratio) + log(density ratio): which of the two carries the miss.
      const portion = both.filter((x) => Math.abs(x.gramsLog) >= Math.abs(x.densityLog)).length;
      console.log(
        `  portion against energy density (n=${both.length}): median |log grams ratio| ${fix(median(both.map((x) => Math.abs(x.gramsLog))), 3)}, median |log kcal-per-gram ratio| ${fix(median(both.map((x) => Math.abs(x.densityLog))), 3)}; the portion is the larger part of the miss in ${portion} of ${both.length}.`,
      );
      console.log(`  median grams ratio ${fix(Math.exp(median(both.map((x) => x.gramsLog))), 2)}, median density ratio ${fix(Math.exp(median(both.map((x) => x.densityLog))), 2)} (estimate / truth).`);
    }
    const fat = s.filter((x) => x.fatErr !== null);
    if (fat.length) console.log(`  fat: median signed error ${fix(median(fat.map((x) => x.fatErr)), 1)} g, mean ${fix(mean(fat.map((x) => x.fatErr)), 1)} g (= ${fix(mean(fat.map((x) => x.fatErr)) * 9)} kcal).`);
    const items = s.filter((x) => x.r.items);
    console.log(`  items per answer: median ${fix(median(items.map((x) => x.r.items.length)))}; answers listing oil, butter or dressing as its own item: ${items.filter((x) => x.r.items.some((i) => /\b(oil|butter|dressing|mayo|mayonnaise|vinaigrette)\b/i.test(i.name))).length}.`);
    const worst = [...s].sort((a, b) => Math.abs(b.kcalErr) - Math.abs(a.kcalErr)).slice(0, Number(flag('worst', '8')));
    console.log('  largest misses in kcal:');
    for (const x of worst) {
      console.log(`    ${x.r.id} #${x.r.trial}: ${x.r.kcal} for ${Math.round(x.r.truth.kcal)} kcal (${x.kcalErr > 0 ? '+' : ''}${Math.round(x.kcalErr)}), ${Math.round(x.r.items.reduce((a, i) => a + i.grams, 0))} g for ${Math.round(x.r.truth.grams ?? 0)} g | ${x.r.items.map((i) => `${i.name} ${i.grams} g ${i.kcal}`).join('; ')}`);
    }
  }
}

// ---------- run or report ----------

const readRows = (file) =>
  fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];

if (reportFiles) {
  const rows = reportFiles.split(',').flatMap(readRows);
  const configs = configsFlag ? configsFlag.split(',') : [...new Set(rows.map((r) => r.config))];
  printSummary(rows, configs);
  if (compare) pairedCompare(rows, ...compare.split(','));
  if (has('breakdown')) breakdown(rows, configs);
  console.log(`\n${rows.length} rows, $${rows.reduce((s, r) => s + (r.usd ?? 0), 0).toFixed(4)} spent on them`);
  process.exit(0);
}

ledger.load();
if (ledger.data) console.log(`ledger ${ledgerFile}: $${ledger.data.totalUsd.toFixed(4)} spent of the $${ledger.data.limitUsd} limit`);
if (via === 'lab' && !ledger.data) throw new Error('Through the lab route, give --ledger=<file>: every request is paid by the owner.');
if (ledger.data && !(expect > 0)) throw new Error('Give --expect=<usd per request>, worked out before the run.');

const configs = (configsFlag || 'current').split(',').map(parseConfig);
const done = new Set(rowsFile ? readRows(rowsFile).map((r) => `${r.config}|${r.set}:${r.id}|${r.trial}`) : []);
const rows = [];
for (const config of configs) {
  const jobs = [];
  for (let t = 1; t <= trials; t++) for (const c of [...textCases, ...photoCases]) if (!done.has(`${config.label}|${c.set}:${c.id}|${t}`)) jobs.push([c, t]);
  console.log(`${config.label}: ${jobs.length} analyses to run${done.size ? ' (the rest are already in the rows file)' : ''}`);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < jobs.length && !stopReason) {
        const [c, t] = jobs[next++];
        try {
          const row = await runOne(config, c, t);
          rows.push(row);
          if (rowsFile) fs.appendFileSync(rowsFile, JSON.stringify(row) + '\n');
        } catch (e) {
          if (e instanceof BudgetStop) return;
          stopReason ||= e.message;
          throw e;
        }
        if (ledger.data && (rows.length % 10 === 0 || next >= jobs.length)) console.log(`  ${rows.length} done, ledger $${ledger.data.totalUsd.toFixed(4)}`);
      }
    }),
  );
  if (stopReason) break;
}

const all = rowsFile ? readRows(rowsFile) : rows;
printSummary(all, configs.map((c) => c.label));
if (compare) pairedCompare(all, ...compare.split(','));
if (has('breakdown')) breakdown(all, configs.map((c) => c.label));
const misses = rows.filter((r) => r.pass === false);
if (misses.length && !rowsFile) {
  console.log('\noutside its range:');
  for (const r of misses) console.log(`  ${r.config} ${r.id} #${r.trial}: ${r.ok ? `${r.kcal} kcal (${r.items.map((i) => `${i.name} ${i.grams} g ${i.kcal}`).join('; ')})` : `${r.error}: ${r.message}`} | wanted ${r.min}-${r.max}`);
}
console.log(`\nthis run: ${runSpend.n} requests, $${runSpend.usd.toFixed(4)}${ledger.data ? `; ledger $${ledger.data.totalUsd.toFixed(4)} of $${ledger.data.limitUsd}` : ''}`);
if (stopReason) {
  console.log(`STOPPED: ${stopReason}`);
  process.exitCode = 1;
}
if (out) fs.writeFileSync(out, JSON.stringify({ configs: configs.map((c) => c.label), trials, rows }, null, 1));
