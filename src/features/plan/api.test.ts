import { describe, expect, it } from 'vitest';

import { postBilling } from './api';

const conn = { functionsUrl: 'https://x.supabase.co/functions/v1/', accessToken: 'tok', anonKey: 'anon' };

function fetchReturning(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response(body === undefined ? 'not json' : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe('postBilling', () => {
  it('posts the action with the token and the anon key', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const a = await postBilling(fetchReturning(200, { plansOn: true }, seen), { action: 'checkout', offerId: 'test-plus-year', returnUrl: 'healthcal://settings/plan?checkout=done' }, conn);
    expect(a.ok).toBe(true);
    expect(seen.url).toBe('https://x.supabase.co/functions/v1/billing');
    const h = seen.init!.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer tok');
    expect(h.apikey).toBe('anon');
    expect(JSON.parse(String(seen.init!.body))).toEqual({ action: 'checkout', offerId: 'test-plus-year', returnUrl: 'healthcal://settings/plan?checkout=done' });
  });

  it('turns every refusal into its code', async () => {
    expect(await postBilling(fetchReturning(409, { error: 'already_subscribed', message: 'x' }), { action: 'checkout' }, conn)).toEqual({ ok: false, status: 409, code: 'already_subscribed' });
    expect(await postBilling(fetchReturning(409, { error: 'cancel_elsewhere', source: 'app_store' }), { action: 'portal' }, conn)).toEqual({ ok: false, status: 409, code: 'cancel_elsewhere', source: 'app_store' });
    expect(await postBilling(fetchReturning(429, undefined), { action: 'checkout' }, conn)).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(await postBilling(fetchReturning(500, undefined), { action: 'status' }, conn)).toMatchObject({ ok: false, code: 'bad_answer' });
    expect(await postBilling(fetchReturning(200, undefined), { action: 'status' }, conn)).toMatchObject({ ok: false, code: 'bad_answer' });
  });

  it('says offline when the request never arrives', async () => {
    const failing = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await postBilling(failing, { action: 'status' }, conn)).toEqual({ ok: false, status: 0, code: 'offline' });
  });
});
