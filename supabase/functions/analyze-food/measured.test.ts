/**
 * The shipped photo setup, replayed from the answers stored in the 18 November 2026 measuring round
 * (testdata/measured-rows.json; README, "How close it gets"). Nothing is sent: each stored answer is
 * fed back through analyzeFood by a fake client, so the figures below are what this code makes of
 * exactly those answers, and the requests checked are the ones the function sends today.
 *
 * Two setups:
 *  - today:  GUIDE_PHOTO on claude-haiku-5-5, effort low, one schema-checked request a photo
 *            (five readings a photo: runs R9 and C1, two each, and F1, the code as built).
 *  - weight: the same request with the photo's text `About N g of food in total.`, the true weight
 *            rounded to 10 g (run R5, one reading a photo). Measured on a form that also asked for a
 *            gram range per item; its answers are replayed through today's form here.
 *
 * Scoring as in the round's analysis: meals of 150 kcal or more, each photo's mean absolute error
 * (capped at 100%) averaged over photos; bias is the signed error over every reading.
 */
import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { photoText } from '@/features/ai/weight';

import { analyzeFood, costOf, FAST_MODEL, systemFor, type AnalyzeInput } from './analyze';

interface Row {
  setup: 'today' | 'weight';
  run: string;
  id: string;
  trial: number;
  ms: number;
  usd: number;
  outputTokens: number;
  kcal?: number;
  answer?: unknown;
  error?: string;
}
interface Data {
  cases: Record<string, { kcal: number; grams: number; weightText: string }>;
  rows: Row[];
}

const data = JSON.parse(fs.readFileSync(new URL('./testdata/measured-rows.json', import.meta.url), 'utf8')) as Data;
const IMAGE = 'QUJD';

/** One stored answer through the function's own code; returns the request it sent and the total it made. */
async function replay(input: AnalyzeInput, answer: unknown): Promise<{ request: Record<string, unknown>; kcal: number; requests: number }> {
  const sent: Record<string, unknown>[] = [];
  const create = async (body: Record<string, unknown>) => {
    sent.push(body);
    return { model: FAST_MODEL, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }], usage: { input_tokens: 1, output_tokens: 1 } };
  };
  const out = await analyzeFood({ messages: { create }, beta: { messages: { create } } } as never, input);
  return { request: sent[0], kcal: out.items.reduce((s, i) => s + i.kcal, 0), requests: sent.length };
}

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
};
const pct = (n: number) => Math.round(n * 1000) / 10;

interface Reading {
  id: string;
  kcal: number | null;
}

/** The analysis's figures for one setup's readings. */
function score(readings: Reading[]) {
  const truth = (id: string) => data.cases[id];
  const err = (r: Reading) => ((r.kcal as number) - truth(r.id).kcal) / truth(r.id).kcal;
  const ok = readings.filter((r) => r.kcal !== null);
  const big = ok.filter((r) => truth(r.id).kcal >= 150);
  const perPhoto = (lost: boolean) => {
    const out: Record<string, number> = {};
    for (const id of Object.keys(data.cases)) {
      if (truth(id).kcal < 150) continue;
      const v = readings.filter((r) => r.id === id && (lost || r.kcal !== null)).map((r) => (r.kcal === null ? 1 : Math.min(1, Math.abs(err(r)))));
      if (v.length) out[id] = mean(v);
    }
    return out;
  };
  const over500 = ok.filter((r) => truth(r.id).grams > 500);
  return {
    photos: perPhoto(false),
    photosLostAsMiss: perPhoto(true),
    meanAbs: pct(mean(Object.values(perPhoto(false)))),
    biasMean: pct(mean(big.map(err))),
    biasMedian: pct(median(big.map(err))),
    over500Photos: new Set(over500.map((r) => r.id)).size,
    over500Mean: pct(mean(over500.map(err))),
    over500Median: pct(median(over500.map(err))),
  };
}

const paired = (a: Record<string, number>, b: Record<string, number>) => {
  const ids = Object.keys(a).filter((id) => id in b);
  return Math.round(mean(ids.map((id) => (b[id] - a[id]) * 100)) * 10) / 10;
};

async function readingsOf(setup: Row['setup']): Promise<Reading[]> {
  const out: Reading[] = [];
  for (const row of data.rows.filter((r) => r.setup === setup)) {
    if (!row.answer) {
      out.push({ id: row.id, kcal: null });
      continue;
    }
    const text = setup === 'weight' ? data.cases[row.id].weightText : undefined;
    const r = await replay({ image: IMAGE, mediaType: 'image/jpeg', text, precise: false }, row.answer);
    // The function makes of the stored answer exactly the total the round recorded.
    expect(r.kcal).toBe(row.kcal);
    expect(r.requests).toBe(1);
    out.push({ id: row.id, kcal: r.kcal });
  }
  return out;
}

describe('the measured photo setups, replayed', () => {
  it('holds 60 photos: five readings each today, one with the weight (one cut off at the token cap)', () => {
    expect(Object.keys(data.cases)).toHaveLength(60);
    expect(data.rows.filter((r) => r.setup === 'today')).toHaveLength(300);
    const weight = data.rows.filter((r) => r.setup === 'weight');
    expect(weight).toHaveLength(60);
    expect(weight.filter((r) => !r.answer).map((r) => [r.error, r.outputTokens])).toEqual([['truncated', 2000]]);
  });

  it("the app's weight sentence is the measured text for every photo", () => {
    for (const c of Object.values(data.cases)) expect(photoText('', c.grams)).toBe(c.weightText);
  });

  it('a photo with the weight is the same single request as without it, with the measured words as its text', async () => {
    const plain = await replay({ image: IMAGE, mediaType: 'image/jpeg', precise: false }, { dish: 'x', items: [{ n: 'rice', g: 100, k: 130, p: 2.7, c: 28, f: 0.3, b: 0, q: 0.8 }], hidden_fat_question: null, note: null });
    const weighed = await replay({ image: IMAGE, mediaType: 'image/jpeg', text: photoText('', 418), precise: false }, { dish: 'x', items: [{ n: 'rice', g: 100, k: 130, p: 2.7, c: 28, f: 0.3, b: 0, q: 0.8 }], hidden_fat_question: null, note: null });
    const text = (req: Record<string, unknown>) => ((req.messages as { content: { type: string; text?: string }[] }[])[0].content.find((b) => b.type === 'text') as { text: string }).text;
    expect(text(plain.request)).toBe('Estimate this meal.');
    expect(text(weighed.request)).toBe('Details from the user: About 420 g of food in total.');
    const rest = (req: Record<string, unknown>) => ({ ...req, messages: undefined });
    expect(rest(weighed.request)).toEqual(rest(plain.request));
    expect(weighed.request).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 2000, system: systemFor({ image: IMAGE }, 'json'), output_config: { effort: 'low' } });
    expect('thinking' in weighed.request).toBe(false);
    // The same one quick request, so the same one unit of the daily allowance.
    expect(costOf({ precise: false })).toBe(1);
  });

  it("reproduces the analysis's figures for today's quick pass and for the weight", async () => {
    const today = score(await readingsOf('today'));
    const weight = score(await readingsOf('weight'));

    // Today: 31.6% mean error on the 51 photos of 150 kcal or more; reads high on average, not over 500 g.
    expect(Object.keys(today.photos)).toHaveLength(51);
    expect(today.meanAbs).toBe(31.6);
    expect([today.biasMean, today.biasMedian]).toEqual([20.7, 7.9]);
    expect([today.over500Photos, today.over500Mean, today.over500Median]).toEqual([9, 1.8, -5.4]);

    // With the true weight: 24.1% on the 50 answered photos, reading high rather than low.
    expect(Object.keys(weight.photos)).toHaveLength(50);
    expect(weight.meanAbs).toBe(24.1);
    expect([weight.biasMean, weight.biasMedian]).toEqual([7.8, -5.1]);
    expect([weight.over500Photos, weight.over500Mean, weight.over500Median]).toEqual([8, 19.4, 13.6]);

    // Paired by photo: -7.9 points; -6.0 when the answer cut off at the token cap counts as a full miss.
    expect(paired(today.photos, weight.photos)).toBe(-7.9);
    expect(paired(today.photosLostAsMiss, weight.photosLostAsMiss)).toBe(-6);
  });

  it('costs what the round paid: about $0.00037 a photo today and $0.00050 with the weight', () => {
    const usd = (setup: Row['setup']) => mean(data.rows.filter((r) => r.setup === setup).map((r) => r.usd));
    expect(usd('today')).toBeCloseTo(0.00037, 5);
    expect(usd('weight')).toBeCloseTo(0.0005, 5);
    const ms = (setup: Row['setup']) => median(data.rows.filter((r) => r.setup === setup).map((r) => r.ms));
    expect(ms('today')).toBeLessThan(4500);
    expect(ms('weight')).toBeLessThan(4500);
  });
});
