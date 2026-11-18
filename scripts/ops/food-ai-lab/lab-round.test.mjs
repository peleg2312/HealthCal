/**
 * The round's closing-time rule of lab.mjs, without the network:
 *   node --test scripts/ops/food-ai-lab/lab-round.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { roundUntil } from './lab.mjs';

const now = Date.parse('2026-11-18T10:00:00Z');
const acct = { email: 'e', password: 'p', userId: 'u' };

test('the first deploy of a round picks the time, at most six hours ahead', () => {
  assert.deepEqual(roundUntil(acct, false, now, 6), { until: '2026-11-18T16:00:00.000Z', first: true });
  assert.ok(roundUntil(acct, false, now, 7).error);
  assert.ok(roundUntil(acct, false, now, 0).error);
  assert.ok(roundUntil(acct, false, now, Number.NaN).error);
});

test('a redeploy keeps the round time and never extends it', () => {
  const opened = { ...acct, until: '2026-11-18T14:00:00.000Z' };
  assert.deepEqual(roundUntil(opened, true, now, 6), { until: '2026-11-18T14:00:00.000Z', first: false });
  assert.ok(roundUntil(opened, true, Date.parse('2026-11-18T14:00:00Z'), 6).error, 'a closed round is not reopened');
});

test('LAB_UNTIL already set without a recorded time, or a removed round, refuses', () => {
  assert.ok(roundUntil(acct, true, now, 6).error);
  assert.ok(roundUntil({ userId: 'u', removedAt: '2026-11-18T09:00:00Z' }, false, now, 6).error);
  assert.ok(roundUntil(null, false, now, 6).error);
});
