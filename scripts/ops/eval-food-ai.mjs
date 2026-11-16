#!/usr/bin/env node
/**
 * Measures what the food analysis really costs and how close it gets, by running the function's
 * own code (supabase/functions/analyze-food/analyze.ts) against the Anthropic API with your key.
 * Every run spends real money: the default run below is 40 requests, about one US cent.
 *
 *   ANTHROPIC_API_KEY=... node --experimental-transform-types scripts/ops/eval-food-ai.mjs
 *        [--configs=current,medium,no-thinking,precise] [--trials=2] [--photos=<dir>] [--kind=all|text|photo] [--out=<file.json>]
 *
 *   current      what the app sends by default: the small model, effort low
 *   medium       the small model at its own default effort
 *   no-thinking  the small model, effort low, thinking switched off
 *   precise      the "check again more carefully" pass: the bigger model (and the 1024 px photo)
 *
 *   --photos     a folder with cases.json ({ cases: [{ id, file, filePrecise?, text?, min, max }] })
 *                and the JPEG files it names, already resized as the app would (768 px, 1024 px).
 *
 * Typed meals come from food-ai-cases.json. A case passes when the total calories fall inside its
 * range. Prices are the published per-token rates below; change them when the price list changes.
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AnalyzeError, analyzeFood } from '../../supabase/functions/analyze-food/analyze.ts';

/** US dollars per million tokens (input, output), from the pricing page on 2026-11-16. */
const RATES = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10] };

const here = path.dirname(fileURLToPath(import.meta.url));
const flag = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).slice(name.length + 3);
const configs = flag('configs', 'current').split(',');
const trials = Number(flag('trials', '2'));
const photosDir = flag('photos', '');
const out = flag('out', '');
const kind = flag('kind', 'all');

const textCases = kind === 'photo' ? [] : JSON.parse(fs.readFileSync(path.join(here, 'food-ai-cases.json'), 'utf8')).cases;
const photoCases = photosDir && kind !== 'text' ? JSON.parse(fs.readFileSync(path.join(photosDir, 'cases.json'), 'utf8')).cases : [];

const real = new Anthropic();
/** The same client with one setting changed on the way out, so every config runs the function's real code. */
function clientFor(config) {
  const change = (params) =>
    config === 'medium'
      ? { ...params, output_config: { ...params.output_config, effort: 'medium' } }
      : config === 'no-thinking'
        ? { ...params, thinking: { type: 'disabled' } }
        : params;
  return {
    messages: { create: (params, options) => real.messages.create(change(params), options) },
    beta: { messages: { create: (params, options) => real.beta.messages.create(change(params), options) } },
  };
}

async function runOne(config, c, trial) {
  const precise = config === 'precise';
  const input = { text: c.text, precise };
  if (c.file) {
    input.image = fs.readFileSync(path.join(photosDir, precise && c.filePrecise ? c.filePrecise : c.file)).toString('base64');
    input.mediaType = 'image/jpeg';
  }
  const started = Date.now();
  const row = { config, id: c.id, photo: !!c.file, trial };
  try {
    const r = await analyzeFood(clientFor(config), input);
    Object.assign(row, {
      ok: true,
      model: r.model,
      usage: r.usage,
      kcal: r.items.reduce((s, i) => s + i.kcal, 0),
      dish: r.dish,
      items: r.items.map((i) => ({ name: i.name, grams: i.grams, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, confidence: i.confidence })),
      question: r.hiddenFatQuestion,
      note: r.note,
    });
    row.pass = c.expect ? false : row.kcal >= c.min && row.kcal <= c.max;
  } catch (e) {
    if (!(e instanceof AnalyzeError)) throw e;
    Object.assign(row, { ok: false, error: e.code, message: e.message, usage: e.usage ?? { inputTokens: 0, outputTokens: 0 }, pass: c.expect === e.code });
    row.model = precise ? 'claude-sonnet-5-5' : 'claude-haiku-5-5';
  }
  row.ms = Date.now() - started;
  const [inRate, outRate] = RATES[row.model] ?? RATES['claude-haiku-5-5'];
  row.usd = (row.usage.inputTokens * inRate + row.usage.outputTokens * outRate) / 1e6;
  return row;
}

const rows = [];
for (const config of configs) {
  const jobs = [];
  for (let t = 1; t <= trials; t++) for (const c of [...textCases, ...photoCases]) jobs.push([c, t]);
  // Three at a time: quick, and well inside a new key's request limit.
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < jobs.length) {
        const [c, t] = jobs[next++];
        rows.push(await runOne(config, c, t));
      }
    }),
  );
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const all = [...textCases, ...photoCases];
console.log('config        kind    n   in tok  out tok  $ / 1,000   in range   off the range middle (median)   seconds (median)');
for (const config of configs) {
  for (const photo of [false, true]) {
    const rs = rows.filter((r) => r.config === config && r.photo === photo);
    if (!rs.length) continue;
    const scored = rs.filter((r) => r.ok && all.find((c) => c.id === r.id)?.min !== undefined);
    const off = scored.map((r) => {
      const c = all.find((x) => x.id === r.id);
      const mid = (c.min + c.max) / 2;
      return Math.abs(r.kcal - mid) / mid;
    });
    console.log(
      `${config.padEnd(13)} ${(photo ? 'photo' : 'text').padEnd(6)} ${String(rs.length).padStart(3)}  ${mean(rs.map((r) => r.usage.inputTokens)).toFixed(0).padStart(6)}  ${mean(rs.map((r) => r.usage.outputTokens)).toFixed(0).padStart(7)}  ${('$' + (mean(rs.map((r) => r.usd)) * 1000).toFixed(2)).padStart(9)}   ${`${rs.filter((r) => r.pass).length}/${rs.length}`.padEnd(9)}  ${(median(off) * 100).toFixed(0).padStart(3)}%                             ${(median(rs.map((r) => r.ms)) / 1000).toFixed(1)}`,
    );
  }
}
const misses = rows.filter((r) => !r.pass);
if (misses.length) {
  console.log('\noutside its range:');
  for (const r of misses) {
    const c = all.find((x) => x.id === r.id);
    console.log(`  ${r.config} ${r.id} #${r.trial}: ${r.ok ? `${r.kcal} kcal (${r.items.map((i) => `${i.name} ${i.grams} g ${i.kcal}`).join('; ')})` : `${r.error}: ${r.message}`} | wanted ${c.expect ?? `${c.min}-${c.max}`}`);
  }
}
console.log(`\n${rows.length} requests, $${rows.reduce((s, r) => s + r.usd, 0).toFixed(4)} spent`);
if (out) fs.writeFileSync(out, JSON.stringify({ configs, trials, rows }, null, 1));
