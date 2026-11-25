#!/usr/bin/env node
/**
 * Local stand-in for the Supabase backend, for end-to-end tests of the client.
 *
 * It speaks the same HTTP the app's Supabase client speaks (auth, the sync
 * RPCs, table reads and the edge functions) and applies the same rules as
 * supabase/migrations: last write wins on the client edit time, a server
 * clock orders the pull cursor, and every row belongs to exactly one user.
 * The SQL itself is tested separately by scripts/dev/test-sql.sh.
 *
 *   node scripts/dev/mock-backend.cjs [--port=54321] [--static=<dir> --static-port=8090] [--plans=on]
 *
 * Plans are off unless --plans=on or a test turns them on (POST /__billing { plansOn: true }); see
 * "plans and payments (stand-in)" below for the billing function, its pages and test hooks.
 *
 * With --static it also serves an exported web build with single-page fallback.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const PORT = Number(flags.port || 54321);

const state = { users: new Map(), records: [], profiles: new Map(), aiRequests: [], aiUsage: new Map(), coachRequests: [], coachUsage: new Map(), recoveries: [], oauthCodes: [], google: { on: true, signupDisabled: false }, social: new Map(), socialLimits: new Map(), friendships: [], declines: [], cheers: [], clock: Date.now(), meals: new Map(), mealAudience: new Map(), friendPrefs: new Map(), mealStops: new Map(), clockOffsetMs: 0 };
const tick = () => new Date((state.clock += 5)).toISOString();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function issueSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp })}.mock-signature`;
  const now = new Date().toISOString();
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `refresh-${user.id}`,
    user: publicUser(user, now),
  };
}
/** The user as the auth server shows it: how they can sign in (identities) and which way came first (app_metadata.provider). */
function publicUser(user, now = new Date().toISOString()) {
  const identities = user.identities || [{ provider: 'email', created_at: now }];
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: now,
    app_metadata: { provider: identities[0].provider, providers: identities.map((i) => i.provider) },
    user_metadata: {},
    identities: identities.map((i) => ({ identity_id: `${user.id}-${i.provider}`, id: i.provider === 'email' ? user.id : `google-${user.email}`, user_id: user.id, provider: i.provider, identity_data: { email: user.email, sub: user.id }, created_at: i.created_at, last_sign_in_at: now, updated_at: now })),
    created_at: now,
    updated_at: now,
  };
}

// ------------------------------------------------- Google sign-in (stand-in)
// Stands in for Google and Supabase's /authorize together: a "Choose an account" page whose
// choices go back to redirect_to with a one-time code (or with Google's error), and the code is
// exchanged at /auth/v1/token?grant_type=pkce against the challenge this browser sent. A verified
// address that already has an account is linked to it (one user, two identities), as Supabase does.
const GOOGLE_NEW = 'new.google.person@example.test';
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
function withParams(target, params) {
  const u = new URL(target);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
function chooseAccountPage(query) {
  const redirectTo = query.get('redirect_to') || '';
  const pass = new URLSearchParams({ redirect_to: redirectTo, code_challenge: query.get('code_challenge') || '' });
  const link = (testId, label, extra) => `<a data-testid="${testId}" href="/auth/v1/authorize/choose?${new URLSearchParams({ ...Object.fromEntries(pass), ...extra })}">${escapeHtml(label)}</a>`;
  const people = [...state.users.values()].map((u) => link(`google-account-${u.email}`, u.email, { email: u.email }));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Choose an account</title>
<style>body{font:16px system-ui;margin:24px;max-width:420px}a{display:block;padding:14px;margin:8px 0;border:1px solid #747775;border-radius:6px;color:#1F1F1F;text-decoration:none}</style></head>
<body><h1 data-testid="google-choose">Choose an account</h1><p>Stand-in for Google (scripts/dev/mock-backend.cjs).</p>
${people.join('\n')}
${link('google-account-new', `A new Google account (${GOOGLE_NEW})`, { email: GOOGLE_NEW })}
${link('google-unverified', 'An address Google has not confirmed', { email: 'unverified.google@example.test', unverified: '1' })}
${link('google-decline', 'Decline', { decline: '1' })}
${link('google-cancel', 'Cancel', { cancel: '1' })}
</body></html>`;
}
function userFromRequest(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.role === 'authenticated' && [...state.users.values()].some((u) => u.id === payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}

function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(data);
  return true;
}
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      // The raw body, for a webhook's signature (signed over the exact bytes).
      req.rawBody = raw;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

// ---------------------------------------------------------------- friends
// The same rules as supabase/migrations/20261115000000_friends.sql and
// 20261116000000_friends_hardening.sql, in memory.
// src/features/friends/mockBackend.test.ts walks the same cases as supabase/tests/friends.sql.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const cleanSharing = (p) => ({ workouts: p?.workouts !== false, streak: p?.streak !== false, minutes: p?.minutes !== false });
// A real calendar date written as YYYY-MM-DD ('2031-02-30' is not).
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const utcDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
// A workout as friends may know it: an opaque reference, never a record id.
const isWorkoutRef = (v) => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
const isCheerRef = (v) => isWorkoutRef(v) || /^day:\d{4}-\d{2}-\d{2}$/.test(v);
const DECLINE_UNDO_MS = 15 * 60000;
const bounded = (v, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), max) : undefined);
function cleanSummary(p) {
  const out = {};
  if (isDay(p?.week)) out.week = p.week;
  for (const [k, max] of [['minutes', 100000], ['sessions', 1000], ['streak', 100000]]) {
    const v = bounded(p?.[k], max);
    if (v !== undefined) out[k] = v;
  }
  const workouts = (Array.isArray(p?.workouts) ? p.workouts : [])
    // A workout needs a length and a real date; without a name it is "Workout".
    .filter((w) => w && typeof w === 'object' && isWorkoutRef(w.id) && typeof w.minutes === 'number' && Number.isFinite(w.minutes) && isDay(w.date))
    .slice(0, 12)
    .map((w) => {
      const name = typeof w.name === 'string' ? w.name.slice(0, 60).trim() : '';
      const o = { id: w.id, name: name || 'Workout', emoji: typeof w.emoji === 'string' ? w.emoji.slice(0, 16) : '', minutes: bounded(w.minutes, 1440), date: w.date };
      if (typeof w.distanceKm === 'number') o.distanceKm = Math.min(Math.max(w.distanceKm, 0), 1000);
      return o;
    });
  if (workouts.length) out.workouts = workouts;
  return out;
}
function visibleSummary(summary, sharing) {
  const s = { ...(summary || {}) };
  if (!sharing?.workouts) delete s.workouts;
  if (!sharing?.streak) delete s.streak;
  if (!sharing?.minutes) {
    delete s.minutes;
    delete s.sessions;
  }
  return s;
}
const areFriends = (a, b) => state.friendships.some((f) => f.status === 'accepted' && ((f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a)));
const declined = (decliner, asker) => state.declines.some((d) => d.decliner === decliner && d.asker === asker);
// Kept across leaving and rejoining, as the social_limits table is.
const limitsOf = (uid) => {
  if (!state.socialLimits.has(uid)) state.socialLimits.set(uid, { lookup_misses: 0, lookup_window: 0, setups: 0, setups_window: 0 });
  return state.socialLimits.get(uid);
};
// ------------------------------------------------------------- meals shown to friends
// The same rules as supabase/migrations/20261201000000_friends_meals.sql (tested by
// supabase/tests/friends_meals.sql; src/services/friendsMock.test.ts walks the same cases
// here). Meals read the stand-in's own clock, which POST /__clock moves forward, so a test
// can watch a meal leave after 7 days.
const MEAL_DAY_MS = 86400000;
const nowMs = () => Date.now() + state.clockOffsetMs;
const mealDay = (offsetDays) => new Date(nowMs() + offsetDays * MEAL_DAY_MS).toISOString().slice(0, 10);
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_SOURCES = ['builtin', 'usda', 'openfoodfacts', 'custom', 'ai', 'quick', 'typical'];
const DEFAULT_MEAL_SETTINGS = { auto: [], kcal: false, see: true };
const mealKey = (owner, ref) => `${owner}:${ref}`;
const pairKey = (a, b) => `${a}:${b}`;
const mealRefOf = (shareKey, day, meal) => crypto.createHash('sha256').update(`${shareKey}:meal:${day}:${meal}`).digest('hex').slice(0, 32);
// social_clean_text: control characters become a space, cut to max characters, spaces trimmed.
const cleanText = (v, max) => {
  if (typeof v !== 'string') return undefined;
  const t = Array.from(v.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')).slice(0, max).join('').replace(/^ +| +$/g, '');
  return t === '' ? undefined : t;
};
const roundTo = (x, places) => {
  const text = String(Math.abs(x));
  const scaled = text.includes('e') ? Math.round(Math.abs(x) * 10 ** places) : Math.round(Number(`${text}e${places}`));
  const out = text.includes('e') ? scaled / 10 ** places : Number(`${scaled}e-${places}`);
  return x < 0 ? -out : out;
};
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const kcalOf = (v) => Math.min(Math.max(roundTo(v, 0), 0), 20000) || 0;
/** social_clean_meal: at most 15 foods, only the allowed keys, calories only when shown. */
function cleanMeal(items, showKcal) {
  const out = [];
  for (const e of Array.isArray(items) ? items : []) {
    if (out.length >= 15) break;
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    const name = cleanText(e.name, 60);
    if (!name || typeof e.source !== 'string' || !MEAL_SOURCES.includes(e.source)) continue;
    const item = { name, emoji: cleanText(e.emoji, 8) ?? '', portion: cleanText(e.portion, 40) ?? '', source: e.source };
    if (['builtin', 'typical', 'usda'].includes(e.source) && typeof e.foodId === 'string' && /^b_[a-z0-9_]{1,40}$/.test(e.foodId)) item.foodId = e.foodId;
    if (typeof e.barcode === 'string' && /^[0-9]{6,14}$/.test(e.barcode)) item.barcode = e.barcode;
    const serving = cleanText(e.serving, 40);
    if (serving) item.serving = serving;
    if (finite(e.quantity) && e.quantity > 0) item.quantity = Math.min(roundTo(e.quantity, 2), 1000);
    if (finite(e.grams) && e.grams > 0) item.grams = Math.min(roundTo(e.grams, 1), 10000);
    if (showKcal) {
      if (finite(e.kcal)) item.kcal = kcalOf(e.kcal);
      if (finite(e.kcalLow) && finite(e.kcalHigh) && e.kcalLow <= e.kcalHigh) {
        item.kcalLow = kcalOf(e.kcalLow);
        item.kcalHigh = kcalOf(e.kcalHigh);
      }
    }
    out.push(item);
  }
  return out;
}
function cleanMealSettings(p, base) {
  const pick = (k, fallback) => (typeof p?.[k] === 'boolean' ? p[k] : typeof base?.[k] === 'boolean' ? base[k] : fallback);
  const auto = Array.isArray(p?.auto) ? p.auto : Array.isArray(base?.auto) ? base.auto : [];
  return { auto: MEAL_TYPES.filter((m) => auto.includes(m)), kcal: pick('kcal', false), see: pick('see', true) };
}
/** 18 or over on the stand-in's today, by the birth date in the synced profile; anything else is under 18. */
function isAdult(uid) {
  const b = state.profiles.get(uid)?.data?.birthDate;
  const today = mealDay(0);
  if (!isDay(b) || b >= today) return false;
  const [by, bm, bd] = b.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0) >= 18;
}
const sharesMealsWith = (owner, viewer) => state.friendPrefs.get(pairKey(owner, viewer))?.share_meals !== false;
const seesMealsOf = (viewer, owner) => state.friendPrefs.get(pairKey(viewer, owner))?.see_meals !== false;
const liveMeal = (m) => m && Date.parse(m.expires_at) > nowMs();
/** social_visible_meals: the one rule for what a viewer may see. */
function visibleMeals(viewer) {
  const card = state.social.get(viewer);
  if (!card || card.meal_settings?.see === false || !isAdult(viewer)) return [];
  return [...state.meals.values()].filter(
    (m) => liveMeal(m) && m.viewers.has(viewer) && state.social.get(m.owner) && areFriends(viewer, m.owner) && seesMealsOf(viewer, m.owner) && sharesMealsWith(m.owner, viewer) && isAdult(m.owner),
  );
}
function deleteMeal(owner, ref) {
  state.meals.delete(mealKey(owner, ref));
  state.cheers = state.cheers.filter((c) => !(c.to_user === owner && c.ref === `meal:${ref}`));
}
/** social_purge_meals: expired meals leave with their cheers; old stop marks go. */
function purgeMeals() {
  for (const m of [...state.meals.values()]) if (!liveMeal(m)) deleteMeal(m.owner, m.ref);
  for (const [k, at] of state.mealStops) if (nowMs() - at > 10 * MEAL_DAY_MS) state.mealStops.delete(k);
}
/** social_drop_unseen_meals: a meal nobody may see any more stops. */
function dropUnseenMeals(owners) {
  for (const m of [...state.meals.values()]) if (owners.includes(m.owner) && m.viewers.size === 0) deleteMeal(m.owner, m.ref);
}
/** social_count_meal_write: 300 writes and 20 new showings a day; false counts nothing. */
function countMealWrite(uid, isNew) {
  const lim = limitsOf(uid);
  if (!lim.meal_writes_window || nowMs() - lim.meal_writes_window > MEAL_DAY_MS) Object.assign(lim, { meal_writes: 0, meal_writes_window: nowMs() });
  if (!lim.meal_shows_window || nowMs() - lim.meal_shows_window > MEAL_DAY_MS) Object.assign(lim, { meal_shows: 0, meal_shows_window: nowMs() });
  if ((lim.meal_writes || 0) >= 300 || (isNew && (lim.meal_shows || 0) >= 20)) return false;
  lim.meal_writes = (lim.meal_writes || 0) + 1;
  if (isNew) lim.meal_shows = (lim.meal_shows || 0) + 1;
  return true;
}
const liveMealCount = (uid) => [...state.meals.values()].filter((m) => m.owner === uid && liveMeal(m)).length;
function insertMeal(owner, ref, day, meal, items, showKcal) {
  deleteMeal(owner, ref);
  const at = nowMs();
  const row = { owner, ref, day, meal, items, show_kcal: showKcal, shown_at: new Date(at).toISOString(), updated_at: new Date(at).toISOString(), expires_at: new Date(at + 7 * MEAL_DAY_MS).toISOString(), viewers: new Set() };
  state.meals.set(mealKey(owner, ref), row);
  state.mealStops.delete(mealKey(owner, ref));
  return row;
}
// Near the database's 16 KB check on the list as sent.
const mealItemsValid = (items) => Array.isArray(items) && JSON.stringify(items).length <= 16384;
/** Removes everything meals hold between two people (friend_remove). */
function forgetMealsBetween(a, b) {
  for (const m of state.meals.values()) if ((m.owner === a && m.viewers.has(b)) || (m.owner === b && m.viewers.has(a))) m.viewers.delete(m.owner === a ? b : a);
  state.mealAudience.get(a)?.delete(b);
  state.mealAudience.get(b)?.delete(a);
  state.friendPrefs.delete(pairKey(a, b));
  state.friendPrefs.delete(pairKey(b, a));
  dropUnseenMeals([a, b]);
}

/** Turn friends off: card, friendships and cheers go, and every meal shown and meal setting; declines and limits stay. */
function leaveSocial(uid) {
  state.cheers = state.cheers.filter((c) => c.from_user !== uid && c.to_user !== uid);
  state.friendships = state.friendships.filter((f) => f.requester !== uid && f.addressee !== uid);
  state.social.delete(uid);
  for (const m of [...state.meals.values()]) if (m.owner === uid) state.meals.delete(mealKey(m.owner, m.ref));
  const owners = [];
  for (const m of state.meals.values()) if (m.viewers.delete(uid)) owners.push(m.owner);
  state.mealAudience.delete(uid);
  for (const set of state.mealAudience.values()) set.delete(uid);
  for (const k of [...state.friendPrefs.keys()]) if (k.split(':').includes(uid)) state.friendPrefs.delete(k);
  for (const k of [...state.mealStops.keys()]) if (k.startsWith(`${uid}:`)) state.mealStops.delete(k);
  dropUnseenMeals(owners);
}
/** Deleting the account removes everything, declines and limits included. */
function forgetSocial(uid) {
  leaveSocial(uid);
  state.declines = state.declines.filter((d) => d.decliner !== uid && d.asker !== uid);
  state.socialLimits.delete(uid);
}
/** Returns the function's JSON answer, or undefined when the route is not a friends function. */
function friendsRpc(route, me, body) {
  const now = () => new Date().toISOString();
  const card = (p) => ({ user_id: p.user_id, display_name: p.display_name, avatar: p.avatar });
  switch (route) {
    case 'POST /rest/v1/rpc/social_setup': {
      const name = String(body.p_display_name || '').trim().slice(0, 40);
      if (!name) return { __error: { status: 400, body: { code: '22023', message: 'a name is needed' } } };
      let cur = state.social.get(me);
      if (!cur) {
        // Turning friends on is limited per day.
        const lim = limitsOf(me);
        if (Date.now() - lim.setups_window > 86400000) Object.assign(lim, { setups_window: Date.now(), setups: 0 });
        if (lim.setups >= 5) {
          const hours = Math.max(1, Math.ceil((lim.setups_window + 86400000 - Date.now()) / 3600000));
          const message = `Friends were turned on 5 times in the last 24 hours. You can turn them on again in about ${hours === 1 ? 'an hour' : `${hours} hours`}.`;
          return { __error: { status: 400, body: { code: '54000', message } } };
        }
        lim.setups += 1;
        cur = { user_id: me, code: newCode(), share_key: crypto.randomBytes(32).toString('hex'), summary: {}, summary_updated_at: null };
      }
      Object.assign(cur, { display_name: name, avatar: String(body.p_avatar || '').trim().slice(0, 16), sharing: cleanSharing(body.p_sharing) });
      state.social.set(me, cur);
      return { code: cur.code, display_name: cur.display_name, avatar: cur.avatar, sharing: cur.sharing, share_key: cur.share_key };
    }
    case 'POST /rest/v1/rpc/social_publish': {
      const p = body.p_summary;
      if (!p || typeof p !== 'object' || Array.isArray(p)) return { __error: { status: 400, body: { code: '22023', message: 'summary is not valid' } } };
      if (Array.isArray(p.workouts) && p.workouts.some((w) => w && typeof w === 'object' && !isWorkoutRef(w.id))) {
        return { __error: { status: 400, body: { code: '22023', message: 'summary is not valid: workouts need opaque references' } } };
      }
      const cur = state.social.get(me);
      // With p_share_key (the current app): ok, no_card, or stale_key when the key the
      // device built the week with is not the card's (friends turned off and on elsewhere).
      const withKey = Object.prototype.hasOwnProperty.call(body, 'p_share_key');
      if (!cur) return withKey ? 'no_card' : false;
      if (withKey && body.p_share_key !== cur.share_key) return 'stale_key';
      cur.summary = cleanSummary(p);
      cur.summary_updated_at = now();
      return withKey ? 'ok' : true;
    }
    case 'POST /rest/v1/rpc/friend_request': {
      const mine = state.social.get(me);
      if (!mine) return { status: 'setup_needed' };
      const lim = limitsOf(me);
      if (Date.now() - lim.lookup_window > 3600000) Object.assign(lim, { lookup_window: Date.now(), lookup_misses: 0 });
      if (lim.lookup_misses >= 20) return { status: 'too_many' };
      const code = String(body.p_code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const other = [...state.social.values()].find((p) => p.code === code);
      if (!other) {
        lim.lookup_misses += 1;
        return { status: 'not_found' };
      }
      if (other.user_id === me) return { status: 'self' };
      const sent = state.friendships.find((f) => f.requester === me && f.addressee === other.user_id);
      const received = state.friendships.find((f) => f.requester === other.user_id && f.addressee === me);
      if (sent?.status === 'accepted' || received?.status === 'accepted') return { status: 'already_friends', friend: card(other) };
      if (received) {
        Object.assign(received, { status: 'accepted', responded_at: now() });
        state.declines = state.declines.filter((d) => !((d.decliner === me && d.asker === other.user_id) || (d.decliner === other.user_id && d.asker === me)));
        return { status: 'accepted', friend: card(other) };
      }
      // Entering the code of someone the caller once declined lifts that decline.
      state.declines = state.declines.filter((d) => !(d.decliner === me && d.asker === other.user_id));
      if (sent) return { status: 'sent', friend: card(other) };
      const pending = state.friendships.filter((f) => f.requester === me && f.status === 'pending').length;
      const friends = state.friendships.filter((f) => f.status === 'accepted' && (f.requester === me || f.addressee === me)).length;
      if (pending >= 30 || friends >= 200) return { status: 'limit' };
      state.friendships.push({ requester: me, addressee: other.user_id, status: 'pending', created_at: now(), responded_at: null });
      return { status: 'sent', friend: card(other) };
    }
    case 'POST /rest/v1/rpc/friend_respond': {
      const f = state.friendships.find((x) => x.requester === body.p_user && x.addressee === me && x.status === 'pending');
      if (!f || declined(me, body.p_user) || !state.social.get(me) || !state.social.get(body.p_user)) return 'not_found';
      if (body.p_accept) {
        Object.assign(f, { status: 'accepted', responded_at: now() });
        return 'accepted';
      }
      // Silent: the request stays waiting for its sender and is hidden from the caller.
      state.declines.push({ decliner: me, asker: body.p_user, created_at: now() });
      return 'declined';
    }
    case 'POST /rest/v1/rpc/friend_undecline': {
      // Undo of a decline the caller made in the last 15 minutes, while the request still exists.
      const i = state.declines.findIndex((d) => d.decliner === me && d.asker === body.p_user && Date.now() - Date.parse(d.created_at) < DECLINE_UNDO_MS);
      const pending = state.friendships.some((f) => f.requester === body.p_user && f.addressee === me && f.status === 'pending');
      if (i < 0 || !pending) return 'not_found';
      state.declines.splice(i, 1);
      return 'restored';
    }
    case 'POST /rest/v1/rpc/friend_remove': {
      const other = body.p_user;
      state.friendships = state.friendships.filter(
        (f) => !((f.requester === me && f.addressee === other) || (f.requester === other && f.addressee === me && f.status === 'accepted')),
      );
      state.cheers = state.cheers.filter((c) => !((c.from_user === me && c.to_user === other) || (c.from_user === other && c.to_user === me)));
      // From this moment neither sees the other's meals.
      if (other && other !== me) forgetMealsBetween(me, other);
      return null;
    }
    case 'POST /rest/v1/rpc/send_cheer': {
      const ref = String(body.p_ref || '').trim();
      if (!isCheerRef(ref) && !/^meal:[0-9a-f]{32}$/.test(ref)) return 'invalid';
      if (!areFriends(me, body.p_to)) return 'not_friends';
      // A real day of the last two weeks, a workout the friend publishes and shares now, or a meal they show the caller now.
      if (ref.startsWith('day:')) {
        const day = ref.slice(4);
        if (!isDay(day) || day < utcDay(-15) || day > utcDay(1)) return 'invalid';
      } else if (ref.startsWith('meal:')) {
        if (!visibleMeals(me).some((m) => m.owner === body.p_to && m.ref === ref.slice(5))) return 'invalid';
      } else {
        const p = state.social.get(body.p_to);
        if (!(visibleSummary(p?.summary, p?.sharing).workouts ?? []).some((w) => w.id === ref)) return 'invalid';
      }
      if (!state.cheers.some((c) => c.from_user === me && c.to_user === body.p_to && c.ref === ref)) state.cheers.push({ from_user: me, to_user: body.p_to, ref, created_at: now() });
      return 'ok';
    }
    case 'POST /rest/v1/rpc/friends_overview': {
      purgeMeals();
      dropUnseenMeals([me]);
      const mine = state.social.get(me);
      const person = (id) => state.social.get(id);
      const cheeredByMe = (owner, ref) => state.cheers.some((c) => c.from_user === me && c.to_user === owner && c.ref === ref);
      const friendIds = state.friendships.filter((f) => f.status === 'accepted' && (f.requester === me || f.addressee === me)).map((f) => (f.requester === me ? f.addressee : f.requester));
      const mealItems = visibleMeals(me)
        .filter((m) => person(m.owner))
        .map((m) => ({ day: m.day, rank: 0, shown: Date.parse(m.shown_at), seq: 0, name: person(m.owner).display_name.toLowerCase(), ref: m.ref, item: { kind: 'meal', ref: m.ref, user_id: m.owner, display_name: person(m.owner).display_name, avatar: person(m.owner).avatar, day: m.day, meal: m.meal, items: m.items, show_kcal: m.show_kcal, cheered: cheeredByMe(m.owner, `meal:${m.ref}`) } }));
      const workoutItems = friendIds
        .map((id) => person(id))
        .filter(Boolean)
        .flatMap((p) =>
          (visibleSummary(p.summary, p.sharing).workouts || [])
            .map((w, i) => ({ w, i }))
            .filter(({ w }) => isWorkoutRef(w.id) && typeof w.minutes === 'number' && isDay(w.date) && w.date >= mealDay(-7))
            .map(({ w, i }) => {
              const item = { kind: 'workout', ref: w.id, user_id: p.user_id, display_name: p.display_name, avatar: p.avatar, day: w.date, name: w.name || 'Workout', emoji: w.emoji || '', minutes: w.minutes, cheered: cheeredByMe(p.user_id, w.id) };
              if (typeof w.distanceKm === 'number') item.distance_km = w.distanceKm;
              return { day: w.date, rank: 1, shown: -Infinity, seq: i + 1, name: p.display_name.toLowerCase(), ref: w.id, item };
            }),
        );
      const feed = [...mealItems, ...workoutItems]
        .sort((a, b) => b.day.localeCompare(a.day) || a.rank - b.rank || b.shown - a.shown || a.seq - b.seq || a.name.localeCompare(b.name) || a.ref.localeCompare(b.ref))
        .slice(0, 100)
        .map((x) => x.item);
      const myMeals = [...state.meals.values()]
        .filter((m) => m.owner === me && liveMeal(m))
        .sort((a, b) => Date.parse(b.shown_at) - Date.parse(a.shown_at) || a.ref.localeCompare(b.ref))
        .map((m) => ({
          ref: m.ref,
          day: m.day,
          meal: m.meal,
          items: m.items,
          show_kcal: m.show_kcal,
          shown_at: m.shown_at,
          expires_at: m.expires_at,
          viewers: [...m.viewers]
            .filter((v) => areFriends(me, v) && person(v))
            .map((v) => card(person(v)))
            .sort((a, b) => a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase())),
          cheers: state.cheers.filter((c) => c.to_user === me && c.ref === `meal:${m.ref}` && areFriends(me, c.from_user)).length,
        }));
      return {
        // share_key only in the caller's own card.
        me: mine
          ? {
              code: mine.code,
              display_name: mine.display_name,
              avatar: mine.avatar,
              sharing: mine.sharing,
              share_key: mine.share_key,
              meal_settings: cleanMealSettings(mine.meal_settings, {}),
              meals_allowed: isAdult(me),
              audience: [...(state.mealAudience.get(me) || [])].filter((v) => areFriends(me, v) && sharesMealsWith(me, v)).sort(),
            }
          : null,
        feed,
        my_meals: myMeals,
        friends: state.friendships
          .filter((f) => f.status === 'accepted' && (f.requester === me || f.addressee === me))
          .map((f) => ({ f, p: person(f.requester === me ? f.addressee : f.requester) }))
          .filter((x) => x.p)
          .map(({ f, p }) => ({
            ...card(p),
            since: f.responded_at,
            summary: visibleSummary(p.summary, p.sharing),
            summary_updated_at: p.summary_updated_at,
            cheered: state.cheers.filter((c) => c.from_user === me && c.to_user === p.user_id).map((c) => c.ref),
            share_meals: sharesMealsWith(me, p.user_id),
            see_meals: seesMealsOf(me, p.user_id),
          }))
          .sort((a, b) => a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase())),
        incoming: state.friendships
          .filter((f) => f.addressee === me && f.status === 'pending' && !declined(me, f.requester) && person(f.requester))
          .map((f) => ({ ...card(person(f.requester)), created_at: f.created_at })),
        // Pending, whether or not it was declined: the sender cannot tell.
        outgoing: state.friendships.filter((f) => f.requester === me && f.status === 'pending' && person(f.addressee)).map((f) => ({ ...card(person(f.addressee)), created_at: f.created_at })),
        cheers: state.cheers
          .filter((c) => c.to_user === me && areFriends(me, c.from_user) && person(c.from_user))
          .map((c) => ({ from_user: c.from_user, display_name: person(c.from_user).display_name, avatar: person(c.from_user).avatar, ref: c.ref, created_at: c.created_at }))
          .reverse(),
      };
    }
    case 'POST /rest/v1/rpc/social_leave':
      leaveSocial(me);
      return null;
    case 'POST /rest/v1/rpc/meal_show': {
      const mine = state.social.get(me);
      if (!mine) return { status: 'no_card' };
      if (!isAdult(me)) return { status: 'under_18' };
      const day = body.p_day;
      const meal = String(body.p_meal ?? '').trim().toLowerCase();
      if (!isDay(day) || !MEAL_TYPES.includes(meal) || !mealItemsValid(body.p_items)) return { status: 'invalid' };
      if (day < mealDay(-7) || day > mealDay(2)) return { status: 'invalid' };
      const showKcal = body.p_show_kcal === true;
      const items = cleanMeal(body.p_items, showKcal);
      if (!items.length) return { status: 'empty' };
      const viewers = [...new Set((Array.isArray(body.p_viewers) ? body.p_viewers : []).filter((v) => typeof v === 'string' && v && v !== me))];
      if (!viewers.length) return { status: 'no_viewers' };
      if (viewers.length > 200) return { status: 'invalid' };
      if (viewers.some((v) => !areFriends(me, v) || !sharesMealsWith(me, v))) return { status: 'not_friends' };
      purgeMeals();
      const ref = mealRefOf(mine.share_key, day, meal);
      let row = state.meals.get(mealKey(me, ref));
      const fresh = !liveMeal(row);
      if (fresh && liveMealCount(me) >= 40) return { status: 'limit' };
      if (!countMealWrite(me, fresh)) return { status: 'limit' };
      if (fresh) row = insertMeal(me, ref, day, meal, items, showKcal);
      else Object.assign(row, { items, show_kcal: showKcal, updated_at: new Date(nowMs()).toISOString() });
      row.viewers = new Set(viewers);
      state.mealAudience.set(me, new Set(viewers));
      return { status: 'ok', ref, expires_at: row.expires_at };
    }
    case 'POST /rest/v1/rpc/meal_show_auto': {
      const mine = state.social.get(me);
      if (!mine) return { status: 'no_card' };
      if (!isAdult(me)) return { status: 'under_18' };
      const day = body.p_day;
      const meal = String(body.p_meal ?? '').trim().toLowerCase();
      if (!isDay(day) || !MEAL_TYPES.includes(meal) || !mealItemsValid(body.p_items)) return { status: 'invalid' };
      if (day < mealDay(-1) || day > mealDay(1)) return { status: 'invalid' };
      const settings = cleanMealSettings(mine.meal_settings, {});
      if (!settings.auto.includes(meal)) return { status: 'not_auto' };
      purgeMeals();
      const ref = mealRefOf(mine.share_key, day, meal);
      if (state.mealStops.has(mealKey(me, ref))) return { status: 'stopped' };
      if (liveMeal(state.meals.get(mealKey(me, ref)))) return { status: 'exists', ref };
      const items = cleanMeal(body.p_items, settings.kcal);
      if (!items.length) return { status: 'empty' };
      const viewers = [...(state.mealAudience.get(me) || [])].filter((v) => areFriends(me, v) && sharesMealsWith(me, v));
      if (!viewers.length) return { status: 'no_viewers' };
      if (liveMealCount(me) >= 40 || !countMealWrite(me, true)) return { status: 'limit' };
      const row = insertMeal(me, ref, day, meal, items, settings.kcal);
      row.viewers = new Set(viewers);
      return { status: 'ok', ref, expires_at: row.expires_at };
    }
    case 'POST /rest/v1/rpc/meal_update': {
      if (!state.social.get(me)) return 'no_card';
      if (!isAdult(me)) return 'under_18';
      const ref = String(body.p_ref ?? '').trim();
      if (!/^[0-9a-f]{32}$/.test(ref) || !mealItemsValid(body.p_items)) return 'invalid';
      const row = state.meals.get(mealKey(me, ref));
      if (!liveMeal(row)) return 'gone';
      const items = cleanMeal(body.p_items, row.show_kcal);
      if (!items.length) {
        deleteMeal(me, ref);
        return 'stopped';
      }
      if (JSON.stringify(items) === JSON.stringify(row.items)) return 'ok';
      if (!countMealWrite(me, false)) return 'limit';
      Object.assign(row, { items, updated_at: new Date(nowMs()).toISOString() });
      return 'ok';
    }
    case 'POST /rest/v1/rpc/meal_stop': {
      const ref = String(body.p_ref ?? '').trim();
      const row = state.meals.get(mealKey(me, ref));
      if (!/^[0-9a-f]{32}$/.test(ref) || !row) return 'not_found';
      const live = liveMeal(row);
      deleteMeal(me, ref);
      if (!live) return 'not_found';
      state.mealStops.set(mealKey(me, ref), nowMs());
      return 'stopped';
    }
    case 'POST /rest/v1/rpc/meal_stop_all': {
      let n = 0;
      for (const m of [...state.meals.values()]) {
        if (m.owner !== me) continue;
        if (liveMeal(m)) {
          n += 1;
          state.mealStops.set(mealKey(me, m.ref), nowMs());
        }
        deleteMeal(me, m.ref);
      }
      return n;
    }
    case 'POST /rest/v1/rpc/meal_settings_set': {
      const mine = state.social.get(me);
      if (!mine) return null;
      const patch = body.p_settings && typeof body.p_settings === 'object' && !Array.isArray(body.p_settings) ? body.p_settings : {};
      mine.meal_settings = cleanMealSettings(patch, mine.meal_settings || DEFAULT_MEAL_SETTINGS);
      return mine.meal_settings;
    }
    case 'POST /rest/v1/rpc/meal_audience_set': {
      if (!state.social.get(me)) return null;
      const ids = (Array.isArray(body.p_viewers) ? body.p_viewers : []).slice(0, 400).filter((v) => typeof v === 'string' && v !== me && areFriends(me, v) && sharesMealsWith(me, v));
      state.mealAudience.set(me, new Set(ids));
      return [...new Set(ids)].sort();
    }
    case 'POST /rest/v1/rpc/friend_prefs_set': {
      const other = body.p_friend;
      if (!other || other === me || !areFriends(me, other)) return 'not_friends';
      const cur = state.friendPrefs.get(pairKey(me, other)) || { share_meals: true, see_meals: true };
      if (typeof body.p_share_meals === 'boolean') cur.share_meals = body.p_share_meals;
      if (typeof body.p_see_meals === 'boolean') cur.see_meals = body.p_see_meals;
      state.friendPrefs.set(pairKey(me, other), cur);
      if (body.p_share_meals === false) {
        for (const m of state.meals.values()) if (m.owner === me) m.viewers.delete(other);
        state.mealAudience.get(me)?.delete(other);
        dropUnseenMeals([me]);
      }
      return 'ok';
    }
    default:
      return undefined;
  }
}

// ------------------------------------------------------------------ plans and payments (stand-in)
// The billing function (supabase/functions/billing, contract in docs/plans-and-payments.md) with the
// test provider: the same actions, answers and refusals, a "Pay" page and a portal page of its own,
// and webhooks signed with the test provider's fixed secret (testProvider.ts), verified the same way.
// The limits follow plans.ts `limitsFor`. Plans are OFF by default, so every check written before
// plans behaves as it did; a test turns them on with POST /__billing { plansOn: true }.
const BILLING = {
  secret: 'healthcal-test-webhook-secret-not-for-production',
  header: 'healthcal-test-signature',
  offers: [
    { id: 'test-plus-month', plan: 'plus', period: 'month', amount: 399, currency: 'USD', taxIncluded: false },
    { id: 'test-plus-year', plan: 'plus', period: 'year', amount: 2999, currency: 'USD', taxIncluded: false },
  ],
  limits: { plus: { estimates: 40, questions: 30, memoryPairs: 6 }, free: { estimates: 5, questions: 5, memoryPairs: 3 }, today: { estimates: 40, questions: 30, memoryPairs: 3 } },
};
state.billing = {
  // --plans=on starts with plans on (for the evidence states in scripts/dev/states/limits.cjs).
  plansOn: flags.plans === 'on',
  /** The provider answers 502 provider_failed to checkout, portal, refresh and cancel-now. */
  providerFails: false,
  /** Deliver the "Pay" page's webhook this long after the redirect (to show the app's waiting state). */
  webhookDelayMs: 0,
  rows: new Map(),
  events: new Set(),
  sessions: new Map(),
  releases: [],
  webhooks: [],
  /** Accounts whose plan cancel-now ended at the provider (before a delete). */
  cancels: [],
  seq: 0,
};
state.aiReports = [];
const ACTIVE_STATES = ['active', 'trialing', 'in_grace', 'canceling', 'past_due'];
const DAY_MS = 86400000;
/** plans.ts `activeUntil`: grace, else period end (+ 7 days for a failed renewal with no grace). */
function activeUntil(row) {
  const grace = Date.parse(row.graceUntil || '');
  if (Number.isFinite(grace)) return grace;
  const end = Date.parse(row.periodEnd || '');
  return row.state === 'past_due' && Number.isFinite(end) ? end + 7 * DAY_MS : end;
}
const rowIsPlus = (row) => !!row && ACTIVE_STATES.includes(row.state) && activeUntil(row) > Date.now();
const planOfUser = (uid) => (rowIsPlus(state.billing.rows.get(uid)) ? 'plus' : 'free');
/** plans.ts `limitsFor` (no earlier-account grace in the stand-in). */
function limitsOfUser(uid) {
  const plan = planOfUser(uid);
  if (!state.billing.plansOn) return { plansOn: false, plan, ...BILLING.limits.today };
  return { plansOn: true, plan, ...BILLING.limits[plan] };
}
const nextUtcMidnight = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1)).toISOString();
};
/** The fields every limit answer carries (plans.ts `limitFields`), plus `cost`. */
const limitFields = (l, feature, cost = 1) => ({ limit: feature === 'estimates' ? l.estimates : l.questions, plan: l.plansOn ? l.plan : null, plansOn: l.plansOn, resetsAt: nextUtcMidnight(), cost });
function billingStatus(uid) {
  const row = state.billing.rows.get(uid) || null;
  const l = limitsOfUser(uid);
  const late = row && (row.state === 'past_due' || row.state === 'in_grace') && Number.isFinite(activeUntil(row)) ? new Date(activeUntil(row)).toISOString() : null;
  return {
    plansOn: l.plansOn,
    plan: l.plan,
    state: row ? row.state : 'none',
    periodEnd: row ? row.periodEnd : null,
    cancelAtPeriodEnd: row ? !!row.cancelAtPeriodEnd : false,
    source: row ? row.source : null,
    period: row ? row.period : null,
    startedAt: row ? row.startedAt || null : null,
    graceUntil: null,
    paymentGraceUntil: late,
    limits: { estimates: l.estimates, questions: l.questions, memoryPairs: l.memoryPairs },
    // The configured numbers of both plans, sent with plans off too, so the app's two cards hard-code nothing.
    planLimits: { free: { ...BILLING.limits.free }, plus: { ...BILLING.limits.plus } },
    offers: l.plansOn ? BILLING.offers.map((o) => ({ ...o })) : [],
    canCheckout: l.plansOn && l.plan === 'free',
    canManage: !!row && !!row.customerId,
  };
}
const BILLING_MESSAGES = {
  unauthorized: 'Sign in to see your plan.',
  plans_off: 'Plans are not on.',
  already_subscribed: 'You already have Plus.',
  offer_unknown: 'That offer is not available.',
  return_url_invalid: 'That return address is not allowed.',
  provider_failed: 'The payment company could not be reached. Nothing changed. Try again in a moment.',
  nothing_to_manage: 'There is no subscription to manage.',
  unknown_action: 'Unknown action.',
  bad_signature: 'The signature could not be verified.',
};
const billingRefusal = (res, status, error, extra) => send(res, status, { error, message: BILLING_MESSAGES[error] || error, ...extra });
const returnUrlOk = (u) => typeof u === 'string' && u.length <= 512 && !/[\s\\]/.test(u) && /^(https:\/\/|healthcal:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/.test(u) && !/^[a-z]+:\/\/[^/]*@/i.test(u);
const signWebhook = (raw, at = Date.now()) => {
  const t = Math.floor(at / 1000);
  return `t=${t},v1=${crypto.createHmac('sha256', BILLING.secret).update(`${t}.${raw}`).digest('hex')}`;
};
function verifyWebhook(raw, header) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=').map((x) => x.trim())));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > 300 || !/^[0-9a-f]{64}$/.test(parts.v1 || '')) return false;
  const want = crypto.createHmac('sha256', BILLING.secret).update(`${t}.${raw}`).digest();
  return crypto.timingSafeEqual(want, Buffer.from(parts.v1, 'hex'));
}
/** Sends a signed event to this stand-in's own webhook route, over HTTP, as the provider would. */
async function deliverEvent(event) {
  const raw = JSON.stringify(event);
  const r = await fetch(`http://127.0.0.1:${PORT}/functions/v1/billing/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', [BILLING.header]: signWebhook(raw) }, body: raw });
  return r.status;
}
const providerState = (uid, patch) => {
  const cur = state.billing.rows.get(uid) || {};
  return { source: 'test', customerId: cur.customerId || `cus_${uid}`, subscriptionId: cur.subscriptionId || null, productId: cur.productId || null, period: cur.period || null, state: cur.state || 'active', periodEnd: cur.periodEnd || null, graceUntil: null, cancelAtPeriodEnd: false, environment: 'sandbox', startedAt: cur.startedAt || null, ...patch, updatedAt: new Date().toISOString() };
};
const userById = (uid) => [...state.users.values()].find((u) => u.id === uid);
const page = (title, bodyHtml) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font:16px system-ui;margin:24px;max-width:420px}a{display:block;padding:14px;margin:8px 0;border:1px solid #747775;border-radius:6px;color:#1F1F1F;text-decoration:none}</style></head><body>${bodyHtml}</body></html>`;
const html = (res, status, text) => {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(text);
  return true;
};

/** The test hooks and the provider's own pages. Answers true when it handled the request. */
async function billingPages(route, url, body, res) {
  // Test hook: plans on or off, the provider failing, a slow webhook, a fresh day of AI use. Answers the switches.
  if (route === 'POST /__billing') {
    for (const k of ['plansOn', 'providerFails']) if (typeof body[k] === 'boolean') state.billing[k] = body[k];
    if (typeof body.webhookDelayMs === 'number') state.billing.webhookDelayMs = Math.max(0, Math.min(20000, body.webhookDelayMs));
    if (body.resetUsage === true) {
      state.aiUsage.clear();
      state.coachUsage.clear();
    }
    return send(res, 200, { plansOn: state.billing.plansOn, providerFails: state.billing.providerFails, webhookDelayMs: state.billing.webhookDelayMs });
  }
  // Test hook: the provider sends a signed event for an account (by email): { email, state, periodEnd?, cancelAtPeriodEnd? }.
  if (route === 'POST /__billing/event') {
    const user = state.users.get(String(body.email || '').toLowerCase());
    if (!user) return send(res, 404, { error: 'no such account' });
    const patch = {};
    for (const k of ['state', 'periodEnd', 'graceUntil', 'cancelAtPeriodEnd', 'period']) if (body[k] !== undefined) patch[k] = body[k];
    const status = await deliverEvent({ id: `evt_hook_${++state.billing.seq}`, type: 'subscription.updated', userId: user.id, state: providerState(user.id, patch) });
    send(res, 200, { delivered: status });
    return true;
  }
  if (route === 'GET /__checkout') {
    const s = state.billing.sessions.get(url.searchParams.get('session'));
    if (!s) return html(res, 404, page('Checkout', '<p>This checkout has ended.</p>'));
    const offer = BILLING.offers.find((o) => o.id === s.offerId);
    const q = (extra) => new URLSearchParams({ session: s.id, ...extra });
    html(
      res,
      200,
      page(
        'Checkout',
        `<h1 data-testid="checkout-title">Pay for HealthCal Plus</h1><p>Stand-in payment page (scripts/dev/mock-backend.cjs).</p>
<p data-testid="checkout-amount">${(offer.amount / 100).toFixed(2)} ${offer.currency} a ${offer.period}</p>
<a data-testid="checkout-pay" href="/__checkout/done?${q({ pay: '1' })}">Pay</a>
<a data-testid="checkout-cancel" href="/__checkout/done?${q({})}">Cancel</a>`,
      ),
    );
    return true;
  }
  if (route === 'GET /__checkout/done') {
    const s = state.billing.sessions.get(url.searchParams.get('session'));
    if (!s) return html(res, 404, page('Checkout', '<p>This checkout has ended.</p>'));
    state.billing.sessions.delete(s.id);
    if (url.searchParams.get('pay')) {
      const offer = BILLING.offers.find((o) => o.id === s.offerId);
      const now = new Date();
      const end = new Date(now);
      if (offer.period === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);
      else end.setUTCMonth(end.getUTCMonth() + 1);
      const event = {
        id: `evt_${s.id}`,
        type: 'checkout.paid',
        userId: s.uid,
        state: { source: 'test', state: 'active', period: offer.period, periodEnd: end.toISOString(), cancelAtPeriodEnd: false, environment: 'sandbox', updatedAt: now.toISOString(), customerId: `cus_${s.uid}`, subscriptionId: `sub_${s.id}`, productId: offer.id, graceUntil: null, startedAt: now.toISOString() },
      };
      if (state.billing.webhookDelayMs > 0) setTimeout(() => void deliverEvent(event), state.billing.webhookDelayMs);
      else await deliverEvent(event);
    }
    // A closed or cancelled checkout comes back as the browser's Back would: the plan page, with no checkout=done.
    const back = url.searchParams.get('pay') ? s.returnUrl : s.returnUrl.replace(/[?&]checkout=done\b/, '');
    res.writeHead(302, { Location: back }).end();
    return true;
  }
  if (route === 'GET /__portal') {
    const uid = url.searchParams.get('user');
    const row = state.billing.rows.get(uid);
    const back = url.searchParams.get('return') || '';
    const q = (extra) => new URLSearchParams({ user: uid || '', return: back, ...extra });
    html(
      res,
      200,
      page(
        'Your subscription',
        `<h1 data-testid="portal-title">Your subscription</h1><p>Stand-in customer portal (scripts/dev/mock-backend.cjs).</p>
<p data-testid="portal-state">${escapeHtml(row ? `${row.state}, ${row.period}, until ${row.periodEnd}` : 'none')}</p>
<a data-testid="portal-cancel" href="/__portal/act?${q({ act: 'cancel' })}">Cancel at period end</a>
<a data-testid="portal-back" href="/__portal/act?${q({})}">Back to HealthCal</a>`,
      ),
    );
    return true;
  }
  if (route === 'GET /__portal/act') {
    const uid = url.searchParams.get('user');
    if (url.searchParams.get('act') === 'cancel' && state.billing.rows.get(uid)) {
      await deliverEvent({ id: `evt_portal_${++state.billing.seq}`, type: 'subscription.canceled', userId: uid, state: providerState(uid, { state: 'canceling', cancelAtPeriodEnd: true }) });
    }
    res.writeHead(302, { Location: url.searchParams.get('return') || '/' }).end();
    return true;
  }
  return false;
}

/** POST /functions/v1/billing and its webhook. Answers true when it handled the request. */
async function billingFunction(route, req, url, body, rawBody, uid, res) {
  if (route === 'POST /functions/v1/billing/webhook') {
    if (!req.headers[BILLING.header]) return billingRefusal(res, 401, 'bad_signature');
    if (!verifyWebhook(rawBody, req.headers[BILLING.header])) return billingRefusal(res, 401, 'bad_signature');
    const ev = body;
    state.billing.webhooks.push({ id: ev.id, type: ev.type, userId: ev.userId, state: ev.state && ev.state.state });
    if (!ev.userId || !userById(ev.userId)) return send(res, 200, { received: true, ignored: 'unknown_person' });
    if (state.billing.events.has(ev.id)) return send(res, 200, { received: true, duplicate: true });
    state.billing.events.add(ev.id);
    if (ev.state && typeof ev.state === 'object') {
      const prev = state.billing.rows.get(ev.userId);
      state.billing.rows.set(ev.userId, { ...ev.state, startedAt: ev.state.startedAt || (prev && prev.startedAt) || null });
    }
    send(res, 200, { received: true });
    return true;
  }
  if (route !== 'POST /functions/v1/billing') return false;
  if (!uid) return billingRefusal(res, 401, 'unauthorized');
  const action = body.action || 'status';
  const fails = () => billingRefusal(res, 502, 'provider_failed');
  switch (action) {
    case 'status':
      return send(res, 200, billingStatus(uid));
    case 'refresh':
      if (state.billing.providerFails) return fails();
      return send(res, 200, billingStatus(uid));
    case 'checkout': {
      if (!state.billing.plansOn) return billingRefusal(res, 409, 'plans_off');
      if (planOfUser(uid) === 'plus') return billingRefusal(res, 409, 'already_subscribed');
      if (!BILLING.offers.some((o) => o.id === body.offerId)) return billingRefusal(res, 400, 'offer_unknown');
      if (!returnUrlOk(body.returnUrl)) return billingRefusal(res, 400, 'return_url_invalid');
      if (state.billing.providerFails) return fails();
      const id = `s${++state.billing.seq}`;
      state.billing.sessions.set(id, { id, uid, offerId: body.offerId, returnUrl: body.returnUrl });
      return send(res, 200, { url: `http://localhost:${PORT}/__checkout?session=${id}` });
    }
    case 'portal': {
      if (!returnUrlOk(body.returnUrl)) return billingRefusal(res, 400, 'return_url_invalid');
      const row = state.billing.rows.get(uid);
      if (!row || !row.customerId) return billingRefusal(res, 404, 'nothing_to_manage');
      if (state.billing.providerFails) return fails();
      return send(res, 200, { url: `http://localhost:${PORT}/__portal?${new URLSearchParams({ user: uid, return: body.returnUrl })}` });
    }
    case 'cancel-now': {
      const row = state.billing.rows.get(uid);
      const open = row && row.state !== 'expired' && row.state !== 'revoked';
      if (!open) return send(res, 200, { cancelled: true, released: true, ended: false, customerRemoved: null });
      if (state.billing.providerFails) {
        if (body.force !== true) return fails();
        // R4: released on our side, with a tombstone, so the account can go; the app says to cancel at the payment company.
        state.billing.rows.set(uid, { ...row, state: 'revoked', cancelAtPeriodEnd: false });
        state.billing.releases.push({ kind: 'released', customerId: row.customerId, subscriptionId: row.subscriptionId, userId: uid });
        return send(res, 200, { cancelled: false, released: true, ended: false, customerRemoved: null });
      }
      state.billing.rows.set(uid, { ...row, state: 'expired', cancelAtPeriodEnd: false, updatedAt: new Date().toISOString() });
      state.billing.cancels.push(userById(uid)?.email || uid);
      return send(res, 200, { cancelled: true, released: true, ended: true, customerRemoved: true });
    }
    default:
      return billingRefusal(res, 400, 'unknown_action');
  }
}

/** The ai_reports table through PostgREST: insert only (no select), the caller's own rows, 20 a day. */
function aiReportsTable(route, url, req, body, uid, res) {
  if (url.pathname !== '/rest/v1/ai_reports') return false;
  if (route !== 'POST /rest/v1/ai_reports' || url.searchParams.has('select') || /return=representation/.test(String(req.headers.prefer || ''))) {
    send(res, 401, { code: '42501', message: 'permission denied for table ai_reports' });
    return true;
  }
  const rows = Array.isArray(body) ? body : [body];
  for (const r of rows) {
    const userId = r.user_id === undefined ? uid : r.user_id;
    if (userId !== uid) return send(res, 403, { code: '42501', message: 'new row violates row-level security policy for table "ai_reports"' });
    const okText = (v, max) => typeof v === 'string' && v.length >= 1 && v.length <= max;
    if (!['coach_answer', 'food_estimate'].includes(r.kind) || !['unsafe', 'wrong', 'offensive', 'off_topic', 'other'].includes(r.reason) || !okText(r.answer, 2000) || (r.question !== undefined && r.question !== null && !okText(r.question, 500))) {
      return send(res, 400, { code: '23514', message: 'new row for relation "ai_reports" violates check constraint' });
    }
    const day = state.aiReports.filter((x) => x.user_id === uid && Date.now() - Date.parse(x.created_at) < DAY_MS).length;
    if (day >= 20) return send(res, 400, { code: 'P0001', message: 'report_limit', details: null, hint: null });
    state.aiReports.push({ id: crypto.randomUUID(), user_id: uid, kind: r.kind, reason: r.reason, answer: r.answer, ...(r.question ? { question: r.question } : {}), created_at: new Date().toISOString() });
  }
  res.writeHead(201).end();
  return true;
}

const api = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
  res.setHeader('Access-Control-Expose-Headers', 'content-range');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = `${req.method} ${url.pathname}`;
  const body = req.method === 'GET' ? {} : await readBody(req);

  // ------------------------------------------------------------- test hooks
  if (route === 'GET /__state') {
    return send(res, 200, {
      // identities: how each person can sign in ('email', 'google'); one user with both is a linked account.
      users: [...state.users.values()].map((u) => ({ id: u.id, email: u.email, identities: (u.identities || [{ provider: 'email' }]).map((i) => i.provider) })),
      // Google codes handed out and not yet exchanged.
      oauthCodes: state.oauthCodes.map((c) => ({ email: c.email, code: c.code, redirectTo: c.redirectTo })),
      records: state.records,
      profiles: Object.fromEntries(state.profiles),
      aiRequests: state.aiRequests,
      // Every request the coach-chat route received, refused ones included, with its body as sent.
      coachRequests: state.coachRequests,
      // What the reset email would carry: lets a test follow the link without a mailbox.
      recoveries: state.recoveries.map((r) => ({ email: r.email, code: r.code, redirectTo: r.redirectTo })),
      social: Object.fromEntries(state.social),
      friendships: state.friendships,
      declines: state.declines,
      cheers: state.cheers,
      // Meals shown to friends (viewers as lists), the remembered audiences, the per-friend switches and the stand-in's clock.
      sharedMeals: [...state.meals.values()].map((m) => ({ ...m, viewers: [...m.viewers] })),
      mealAudience: Object.fromEntries([...state.mealAudience].map(([k, v]) => [k, [...v]])),
      friendPrefs: Object.fromEntries(state.friendPrefs),
      clockOffsetMs: state.clockOffsetMs,
      // Plans: the switches, each account's entitlement row (by email), the webhooks received, and the AI reports.
      billing: {
        plansOn: state.billing.plansOn,
        providerFails: state.billing.providerFails,
        rows: Object.fromEntries([...state.billing.rows].map(([id, row]) => [userById(id)?.email || id, row])),
        webhooks: state.billing.webhooks,
        releases: state.billing.releases,
        cancels: state.billing.cancels,
      },
      aiReports: state.aiReports,
    });
  }
  if (await billingPages(route, url, body, res)) return;

  // ------------------------------------------------------------------- auth
  if (route === 'POST /auth/v1/signup') {
    const email = String(body.email || '').toLowerCase();
    if (state.users.has(email)) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
    if (String(body.password || '').length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
    const user = { id: crypto.randomUUID(), email, password: body.password, identities: [{ provider: 'email', created_at: new Date().toISOString() }] };
    state.users.set(email, user);
    return send(res, 200, issueSession(user));
  }
  if (route === 'POST /auth/v1/token') {
    if (url.searchParams.get('grant_type') === 'pkce') {
      const challenge = crypto.createHash('sha256').update(String(body.code_verifier || '')).digest('base64url');
      // A Google code: one use, only with the secret of the browser or phone that started the sign-in.
      const oauth = state.oauthCodes.find((c) => c.code === body.auth_code);
      if (oauth) {
        state.oauthCodes = state.oauthCodes.filter((c) => c !== oauth);
        if (oauth.challenge !== challenge) return send(res, 400, { code: 400, error_code: 'bad_code_verifier', msg: 'code challenge does not match previously saved code verifier' });
        const now = new Date().toISOString();
        let user = state.users.get(oauth.email);
        if (!user) {
          user = { id: crypto.randomUUID(), email: oauth.email, password: null, identities: [{ provider: 'google', created_at: now }] };
          state.users.set(oauth.email, user);
        } else if (!(user.identities || []).some((i) => i.provider === 'google')) {
          user.identities = [...(user.identities || [{ provider: 'email', created_at: now }]), { provider: 'google', created_at: now }];
        }
        return send(res, 200, issueSession(user));
      }
      // The emailed code only works with the secret kept by the browser that asked for it.
      const rec = state.recoveries.find((r) => r.code === body.auth_code);
      if (!rec || rec.challenge !== challenge) return send(res, 400, { code: 400, error_code: 'bad_code_verifier', msg: 'code challenge does not match previously saved code verifier' });
      state.recoveries = state.recoveries.filter((r) => r !== rec);
      const user = state.users.get(rec.email);
      return user ? send(res, 200, issueSession(user)) : send(res, 400, { code: 400, error_code: 'user_not_found', msg: 'User not found' });
    }
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const user = [...state.users.values()].find((u) => `refresh-${u.id}` === body.refresh_token);
      return user ? send(res, 200, issueSession(user)) : send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }
    const user = state.users.get(String(body.email || '').toLowerCase());
    if (!user || user.password !== body.password) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return send(res, 200, issueSession(user));
  }
  if (route === 'GET /auth/v1/user') {
    const uid = userFromRequest(req);
    const user = [...state.users.values()].find((u) => u.id === uid);
    return user ? send(res, 200, issueSession(user).user) : send(res, 401, { code: 401, msg: 'invalid JWT' });
  }
  // Public settings, as GET /auth/v1/settings answers on Supabase: the app shows "Continue with Google" only when google is true.
  if (route === 'GET /auth/v1/settings') {
    return send(res, 200, { external: { email: true, phone: false, google: state.google.on, apple: false }, disable_signup: state.google.signupDisabled, mailer_autoconfirm: true, phone_autoconfirm: false });
  }
  if (route === 'GET /auth/v1/authorize') {
    if (url.searchParams.get('provider') !== 'google' || !state.google.on) return send(res, 400, { code: 400, error_code: 'validation_failed', msg: 'Unsupported provider: provider is not enabled' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(chooseAccountPage(url.searchParams));
  }
  if (route === 'GET /auth/v1/authorize/choose') {
    const q = url.searchParams;
    const target = q.get('redirect_to');
    if (!target) return send(res, 400, { code: 400, msg: 'redirect_to is missing' });
    const back = (params) => res.writeHead(302, { Location: withParams(target, params) }).end();
    // Closing the page: the person comes back with nothing, as with the Back button.
    if (q.get('cancel')) return back({});
    if (q.get('decline')) return back({ error: 'access_denied', error_code: 'access_denied', error_description: 'The user denied the request' });
    if (q.get('unverified')) return back({ error: 'access_denied', error_code: 'provider_email_needs_verification', error_description: 'Unverified email with google. A confirmation email has been sent to your google email' });
    const email = String(q.get('email') || '').toLowerCase();
    if (!state.users.has(email) && state.google.signupDisabled) return back({ error: 'access_denied', error_code: 'signup_disabled', error_description: 'Signups not allowed for this instance' });
    const code = crypto.randomUUID();
    state.oauthCodes.push({ code, email, challenge: q.get('code_challenge') || null, redirectTo: target });
    return back({ code });
  }
  // Test hook: move the stand-in's meal clock forward ({ advanceMs }) or back to now ({ reset: true }),
  // so a test can watch a shown meal leave after 7 days. Only meals read this clock.
  if (route === 'POST /__clock') {
    if (body.reset) state.clockOffsetMs = 0;
    if (typeof body.advanceMs === 'number' && Number.isFinite(body.advanceMs)) state.clockOffsetMs += body.advanceMs;
    return send(res, 200, { offsetMs: state.clockOffsetMs, now: new Date(nowMs()).toISOString() });
  }
  // Test hook: Google on or off, and new accounts paused.
  if (route === 'POST /__google') {
    if (typeof body.on === 'boolean') state.google.on = body.on;
    if (typeof body.signupDisabled === 'boolean') state.google.signupDisabled = body.signupDisabled;
    return send(res, 200, state.google);
  }
  if (route === 'POST /auth/v1/logout') return res.writeHead(204).end();
  if (route === 'POST /auth/v1/recover') {
    const email = String(body.email || '').toLowerCase();
    if (state.users.has(email)) {
      state.recoveries.push({ email, code: crypto.randomUUID(), challenge: body.code_challenge || null, redirectTo: url.searchParams.get('redirect_to') });
    }
    // Like the real service: the answer does not reveal whether the address has an account.
    return send(res, 200, {});
  }
  if (route === 'PUT /auth/v1/user') {
    const uid = userFromRequest(req);
    const user = [...state.users.values()].find((u) => u.id === uid);
    if (!user) return send(res, 401, { code: 401, msg: 'invalid JWT' });
    if (typeof body.password === 'string') {
      if (body.password.length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      user.password = body.password;
    }
    return send(res, 200, issueSession(user).user);
  }

  // -------------------------------------------------------- database (RLS)
  const uid = userFromRequest(req);
  if (url.pathname.startsWith('/rest/v1/')) {
    if (!uid) return send(res, 401, { message: 'JWT missing or invalid', code: 'PGRST301' });
    if (aiReportsTable(route, url, req, body, uid, res)) return;

    if (route === 'POST /rest/v1/rpc/push_records') {
      // The database's check constraint: an unknown collection fails the whole batch.
      const KNOWN = ['foodEntries', 'customFoods', 'savedMeals', 'activities', 'water', 'weights', 'sleep', 'fasting', 'favorites', 'days', 'routines'];
      if ((body.p_records || []).some((r) => !KNOWN.includes(r.collection))) {
        return send(res, 400, { code: '23514', message: 'new row for relation "records" violates check constraint "records_collection_check"' });
      }
      let affected = 0;
      for (const r of body.p_records || []) {
        const existing = state.records.find((x) => x.user_id === uid && x.collection === r.collection && x.id === r.id);
        if (existing && Date.parse(existing.updated_at) > Date.parse(r.updated_at)) continue; // an older edit loses
        const row = { user_id: uid, collection: r.collection, id: r.id, date: r.date ?? null, data: r.data, deleted: !!r.deleted, updated_at: r.updated_at, server_updated_at: tick() };
        if (existing) Object.assign(existing, row);
        else state.records.push(row);
        affected += 1;
      }
      return send(res, 200, affected);
    }
    if (route === 'POST /rest/v1/rpc/push_profile') {
      const cur = state.profiles.get(uid) || { data: null, profile_updated_at: null, settings: null, settings_updated_at: null };
      const newer = (prev, next) => !prev || Date.parse(prev) <= Date.parse(next);
      if (body.p_profile && newer(cur.profile_updated_at, body.p_profile_updated_at)) {
        cur.data = body.p_profile;
        cur.profile_updated_at = body.p_profile_updated_at;
      }
      if (body.p_settings && newer(cur.settings_updated_at, body.p_settings_updated_at)) {
        cur.settings = body.p_settings;
        cur.settings_updated_at = body.p_settings_updated_at;
      }
      state.profiles.set(uid, cur);
      return res.writeHead(204).end();
    }
    const social = friendsRpc(route, uid, body);
    if (social !== undefined) return social && social.__error ? send(res, social.__error.status, social.__error.body) : send(res, 200, social);
    if (route === 'POST /rest/v1/rpc/delete_my_account') {
      // As the migration: refused while the person holds a plan row that is not expired or revoked (ruling R5).
      const row = state.billing.rows.get(uid);
      if (row && row.state !== 'expired' && row.state !== 'revoked') return send(res, 400, { code: 'P0001', message: 'plan_active', details: null, hint: null });
      state.billing.rows.delete(uid);
      state.aiReports = state.aiReports.filter((r) => r.user_id !== uid);
      state.records = state.records.filter((r) => r.user_id !== uid);
      state.profiles.delete(uid);
      forgetSocial(uid);
      for (const [email, u] of state.users) if (u.id === uid) state.users.delete(email);
      return res.writeHead(204).end();
    }
    if (route === 'GET /rest/v1/records') {
      const after = (url.searchParams.get('server_updated_at') || '').replace(/^gt\./, '');
      const limit = Number(url.searchParams.get('limit') || 1000);
      // id=in.(a,b,c): the client asking for the server's copy of specific records.
      const idList = (url.searchParams.get('id') || '').match(/^in\.\((.*)\)$/);
      const wanted = idList ? new Set(idList[1].split(',').map((x) => x.replace(/^"|"$/g, ''))) : null;
      const idEq = (url.searchParams.get('id') || '').match(/^eq\.(.*)$/);
      if (idEq && !wanted) {
        const one = state.records.filter((r) => r.user_id === uid && r.id === idEq[1]).map(({ collection, id, data, deleted, updated_at, server_updated_at }) => ({ collection, id, data, deleted, updated_at, server_updated_at }));
        // supabase-js asks for a single object with this Accept header (.single()).
        if (String(req.headers.accept || '').includes('vnd.pgrst.object')) return one.length === 1 ? send(res, 200, one[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
        return send(res, 200, one);
      }
      // Row-level security: only the caller's rows, whatever the query asks for.
      const rows = state.records
        .filter((r) => r.user_id === uid && (!wanted || wanted.has(r.id)) && (!after || Date.parse(r.server_updated_at) > Date.parse(after)))
        .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
        .slice(0, limit)
        .map(({ collection, id, data, deleted, updated_at, server_updated_at }) => ({ collection, id, data, deleted, updated_at, server_updated_at }));
      return send(res, 200, rows);
    }
    if (route === 'GET /rest/v1/profiles') {
      const p = state.profiles.get(uid);
      return send(res, 200, p ? [{ data: p.data, settings: p.settings }] : []);
    }
    return send(res, 404, { message: `mock backend has no handler for ${route}` });
  }

  // -------------------------------------------------------- edge functions
  if (await billingFunction(route, req, url, body, req.rawBody || '', uid, res)) return;
  if (route === 'POST /functions/v1/analyze-food') {
    if (!uid) return send(res, 401, { error: 'unauthorized', message: 'Sign in to use AI estimates.' });
    // As on the real function: a careful analysis uses five units of the daily allowance, and the
    // allowance is the plan's (plans.ts `limitsFor`: 40 for everyone while plans are off, else 5 free and 40 Plus).
    const cost = body.precise === true ? 5 : 1;
    const used = (state.aiUsage.get(uid) || 0) + cost;
    const lim = limitsOfUser(uid);
    const LIMIT = lim.estimates;
    state.aiRequests.push({ user: uid, hasImage: typeof body.image === 'string' && body.image.length > 0, imageChars: (body.image || '').length, mediaType: body.mediaType ?? null, text: body.text ?? null, precise: body.precise === true });
    if (/shared limit/i.test(body.text || '')) return send(res, 429, { error: 'daily_limit', message: 'AI estimates have reached their shared limit for today. Search or scan instead, and try again tomorrow.', remaining: 0, shared: true, ...limitFields(lim, 'estimates', cost) });
    if (/daily limit/i.test(body.text || '') || used > LIMIT) {
      const message = lim.plansOn ? "You have used today's AI estimates. They reset at midnight UTC." : `You have used today's ${LIMIT} AI estimates. They reset at midnight UTC.`;
      return send(res, 429, { error: 'daily_limit', message, remaining: 0, ...limitFields(lim, 'estimates', cost) });
    }
    if (!body.image && !body.text) return send(res, 400, { error: 'bad_request', message: 'Send a photo, a description, or both.' });
    state.aiUsage.set(uid, used);
    return send(res, 200, {
      dish: 'Eggs on toast',
      items: [
        { name: 'Scrambled eggs', grams: 120, kcal: 180, protein: 12.5, carbs: 1.6, fat: 13.5, fiber: 0, confidence: 0.8 },
        { name: 'Sourdough toast', grams: 60, kcal: 160, protein: 5.4, carbs: 30.5, fat: 1.2, fiber: 1.6, confidence: 0.7 },
      ],
      hiddenFatQuestion: 'Were the eggs cooked in butter or oil?',
      note: null,
      model: body.precise ? 'claude-sonnet-5-5' : 'claude-haiku-5-5',
      usage: { inputTokens: body.image ? 1100 : 310, outputTokens: 180 },
      remaining: LIMIT - used,
    });
  }
  if (route === 'POST /functions/v1/coach-chat') {
    /*
     * The AI coach (supabase/functions/coach-chat), with fixed answers and no model. The same checks,
     * codes and limits as coach.ts, except the 32 KB cap, which is checked only from content-length.
     * Triggers, for the app's tests:
     *   - the account's email starts with "unconfirmed" (sign up as unconfirmed-...@...): 403 unconfirmed;
     *   - the profile pushed for the account has a birthDate under 18 or not a valid date: 403 under_18
     *     (no profile, or a profile with no data, is allowed, as on the real function);
     *   - the question past the plan's daily number (30 while plans are off, 5 free, 30 Plus), or a message containing
     *     "daily limit": 429 daily_limit, with the plan fields (limit, plan, plansOn, resetsAt);
     *   - "shared limit": 429 shared_limit;   "busy now": 503 busy;   "too slow": 504 timeout;
     *   - "server error": 502 upstream;   "please decline": 422 declined;
     *   - "cut short": 200 with truncated: true;   "refer me": 200 with refer: true;
     *   - "wait N seconds" (N up to 20): the ordinary answer, N seconds later;
     *   - anything else: 200 with a fixed answer naming what was received (Hebrew when the question starts with a Hebrew letter).
     * Every request is kept in state.coachRequests (GET /__state), with its body exactly as received.
     */
    const lim = limitsOfUser(uid);
    const COACH_LIMIT = lim.questions;
    const user = [...state.users.values()].find((u) => u.id === uid);
    const entry = { user: uid, at: new Date().toISOString(), apikey: !!req.headers.apikey, body, status: 0, error: null };
    state.coachRequests.push(entry);
    const reply = (status, out) => {
      entry.status = status;
      entry.error = out.error ?? null;
      return send(res, status, out);
    };
    const MSG = {
      unauthorized: 'Sign in to use the AI coach.',
      unconfirmed: 'Confirm your email address to use the AI coach.',
      under_18: 'The AI coach is for people aged 18 and over. The two buttons above the field still work.',
      body_too_large: 'That message is too long to send.',
      bad_body: 'Send the question as JSON.',
      consent_outdated: 'What the coach sees has changed. Read it and agree again to keep chatting.',
      message_empty: 'Type a question first.',
      message_too_long: 'A question can be up to 500 characters.',
      history_invalid: 'The earlier messages could not be read.',
      history_too_long: 'At most 12 earlier messages can be sent.',
      history_order: 'Earlier messages must be whole question and answer pairs, question first.',
      history_turn_too_long: 'Each earlier message can be up to 1200 characters.',
      note_invalid: 'The summary of your week holds characters that cannot be sent.',
      note_too_long: 'The summary of your week can be up to 900 characters.',
      daily_limit: `${COACH_LIMIT} questions today. They reset at midnight UTC.`,
      shared_limit: 'The AI coach has reached its shared limit for today. It is back after midnight UTC.',
      busy: 'The AI coach is busy right now. Try again in a moment.',
      timeout: 'The AI coach took too long to answer. Try again.',
      upstream: 'The AI coach could not answer right now. Try again.',
      declined: 'The coach cannot help with that question. Try asking it another way.',
    };
    const refuse = (status, error, extra) => reply(status, { error, message: MSG[error], ...extra });
    if (!uid || !user) return refuse(401, 'unauthorized');
    if (/^unconfirmed/i.test(user.email)) return refuse(403, 'unconfirmed');
    if (Number(req.headers['content-length'] || 0) > 32 * 1024) return refuse(413, 'body_too_large');
    if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse(400, 'bad_body');
    if (!Number.isInteger(body.consentVersion) || body.consentVersion < 1) return refuse(403, 'consent_outdated');
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return refuse(400, 'message_empty');
    if (body.message.length > 500) return refuse(400, 'message_too_long');
    const history = body.history === undefined ? [] : body.history;
    if (!Array.isArray(history)) return refuse(400, 'history_invalid');
    if (history.length > 12) return refuse(400, 'history_too_long');
    if (history.some((t) => !t || (t.role !== 'user' && t.role !== 'assistant') || typeof t.text !== 'string' || !t.text.trim())) return refuse(400, 'history_invalid');
    if (history.some((t) => t.text.length > 1200)) return refuse(400, 'history_turn_too_long');
    if (history.length % 2 || history.some((t, i) => t.role !== (i % 2 ? 'assistant' : 'user'))) return refuse(400, 'history_order');
    const note = body.note === undefined || body.note === null || body.note === '' ? '' : body.note;
    if (note !== '' && (typeof note !== 'string' || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\p{Co}\p{Cn}]/u.test(note.replace(/\n/g, '')))) return refuse(400, 'note_invalid');
    if (note.length > 900) return refuse(400, 'note_too_long');
    const profile = state.profiles.get(uid);
    if (profile && profile.data) {
      const born = profile.data.birthDate;
      const today = utcDay(0);
      let adult = isDay(born) && born < today;
      if (adult) {
        const [by, bm, bd] = born.split('-').map(Number);
        const [ty, tm, td] = today.split('-').map(Number);
        adult = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0) >= 18;
      }
      if (!adult) return refuse(403, 'under_18');
    }
    const used = state.coachUsage.get(uid) || 0;
    if (used >= COACH_LIMIT || /daily limit/i.test(message)) return refuse(429, 'daily_limit', { remaining: 0, ...limitFields(lim, 'questions') });
    if (/shared limit/i.test(message)) return refuse(429, 'shared_limit', { remaining: 0, ...limitFields(lim, 'questions') });
    const left = COACH_LIMIT - used;
    // As on the real function: a busy model, a timeout or a server error gives the unit back.
    if (/busy now/i.test(message)) return refuse(503, 'busy', { remaining: left });
    if (/too slow/i.test(message)) return refuse(504, 'timeout', { remaining: left });
    if (/server error/i.test(message)) return refuse(502, 'upstream', { remaining: left });
    state.coachUsage.set(uid, used + 1);
    const remaining = COACH_LIMIT - used - 1;
    if (/please decline/i.test(message)) return refuse(422, 'declined', { remaining });
    if (/cut short/i.test(message)) {
      return reply(200, { text: 'This is the stand-in coach. A long answer was cut at its last full sentence. An easy day after two hard ones lets the work settle.', remaining, truncated: true });
    }
    if (/refer me/i.test(message)) {
      return reply(200, { text: 'This is the stand-in coach. This is worth talking about with a doctor, and you deserve support.', remaining, refer: true });
    }
    // "wait 3 seconds" (up to 20): the answer comes that much later, for the app's waiting row and the unread mark.
    const pause = /wait (\d+) seconds?/i.exec(message);
    if (pause) await new Promise((done) => setTimeout(done, Math.min(20, Number(pause[1])) * 1000));
    const text = /^[א-ת]/.test(message)
      ? `זו תשובה של מאמן לדוגמה. התקבלו ${history.length} הודעות קודמות, ו${note ? 'סיכום השבוע שלך' : 'בלי סיכום של השבוע'}. אפשר לנסות יום קל השבוע.`
      : `This is the stand-in coach. It received your question "${message}", ${history.length} earlier messages, and ${note ? `a summary of your week (${note.length} characters)` : 'no summary of your week'}. Try one easy day this week.`;
    return reply(200, { text, remaining });
  }
  if (route === 'GET /functions/v1/food-search') {
    if (!req.headers.apikey) return send(res, 401, { message: 'No API key found in request' });
    const q = (url.searchParams.get('q') || '').trim();
    // One query with a fixed answer, so the drink sheet's online section is proved without the network.
    if (q.toLowerCase() === FIXED_SEARCH_QUERY) return send(res, 200, { hits: FIXED_SEARCH_HITS });
    try {
      const upstream = await fetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${Number(url.searchParams.get('limit')) || 24}&fields=code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity,categories_tags`);
      const data = await upstream.json();
      return send(res, 200, { hits: data.hits || [] });
    } catch {
      return send(res, 502, { error: 'upstream', message: 'The product database is not answering right now.' });
    }
  }

  send(res, 404, { message: `mock backend has no handler for ${route}` });
});

/**
 * The food-search function's fixed answer for one test query, "iced coffee": seven real products from
 * Open Food Facts' public search (saved 2026-11-19 and 2026-11-23, values untouched, trimmed to the fields
 * the app reads), in the order the service sent them. What the Water screen's drink sheet must make of
 * them (src/features/drinks/pick.ts, `onlineDrinks` after `rankOnline`, tested in pick.test.ts, which
 * lists them as Prew, Jimmy, Nippys, International Delight, Coca-Cola Zero):
 * - Prew "Iced coffee", pack 180 ml: listed, "Prew · 180 ml · 55 kcal per 250 ml · Community";
 * - Nippys "Iced coffee milk", pack 500 ml: listed with its brand and pack;
 * - Jimmy "Iced Coffee", no volume at all: listed, brand only;
 * - Old Orchard "Iced Coffee", 178 kcal per 100 ml: left out (above 150);
 * - International Delight "Mocha iced coffee", a 1.8 L bottle: listed, no pack (poured from);
 * - Cafe Diario "Instant Coffee" (instant coffees): left out, not a drink as logged;
 * - Coca-Cola Zero, a 1.5 L bottle: listed last (its name does not match), no pack.
 */
const FIXED_SEARCH_QUERY = 'iced coffee';
const FIXED_SEARCH_HITS = [
  { code: '8850389301012', product_name: 'Iced coffee', product_name_en: 'Iced coffee', brands: ['Prew', '\u0e40\u0e1e\u0e23\u0e35\u0e22\u0e27'], quantity: '180 ml', categories_tags: ['en:beverages', 'en:artificially-sweetened-beverages', 'en:non-alcoholic-beverages', 'en:coffee-drinks', 'en:iced-coffees'], nutriments: { 'energy-kcal_100g': 22.2, proteins_100g: 0.556, carbohydrates_100g: 2.7800000000000002, fat_100g: 0.8330000000000001, fiber_100g: 0.556, sugars_100g: 0, 'saturated-fat_100g': 0.556, sodium_100g: 0.0677 } },
  { code: '9311336030069', product_name: 'Iced coffee milk', product_name_en: 'Iced coffee milk', brands: ['Nippys'], quantity: '500 ml', categories_tags: ['en:beverages-and-beverages-preparations', 'en:beverages', 'en:dairies', 'en:dairy-drinks', 'en:flavoured-milks', 'en:unsweetened-beverages', 'en:coffee-drinks', 'en:iced-coffees'], nutriments: { 'energy-kcal_100g': 63.6, proteins_100g: 3.2, carbohydrates_100g: 8.4, fat_100g: 1.9, sugars_100g: 8, 'saturated-fat_100g': 1.3, sodium_100g: 0.038 } },
  { code: '4000349860088', product_name: 'Iced Coffee', product_name_en: 'Iced Coffee', brands: ['Jimmy'], categories_tags: ['en:beverages', 'en:coffee-drinks', 'en:iced-coffees'], nutriments: { 'energy-kcal_100g': 39, proteins_100g: 2.2, carbohydrates_100g: 4.9, fat_100g: 1.1, sugars_100g: 4.9, 'saturated-fat_100g': 0.7, sodium_100g: 0.068 } },
  { code: '0075355112586', product_name: 'Iced Coffee', product_name_en: 'Iced Coffee', brands: ['Old Orchard Brands Llc.'], categories_tags: ['en:beverages', 'en:coffee-drinks', 'en:iced-coffees'], nutriments: { 'energy-kcal_100g': 178, proteins_100g: 0, carbohydrates_100g: 40, fat_100g: 1.67, fiber_100g: 0, sugars_100g: 33.33, 'saturated-fat_100g': 1.67, sodium_100g: 0.011 } },
  { code: '0041271004953', product_name: 'Mocha iced coffee', product_name_en: 'Mocha iced coffee', brands: ['International Delight', 'Dean Foods Company'], quantity: '1.8l', categories_tags: ['en:beverages', 'en:coffee-drinks', 'en:iced-coffees', 'en:sweetened-beverages'], nutriments: { 'energy-kcal_100g': 45.83, proteins_100g: 1.25, carbohydrates_100g: 7.92, fat_100g: 0.83, fiber_100g: 0, sugars_100g: 7.08, 'saturated-fat_100g': 0.42, sodium_100g: 0.044719999999999996 } },
  { code: '0810688010389', product_name: 'Instant Coffee', product_name_en: 'Instant Coffee', brands: ['Cafe Diario', 'Maximus Coffee Group'], quantity: '3.5 oz', categories_tags: ['en:plant-based-foods-and-beverages', 'en:beverages', 'en:plant-based-foods', 'en:plant-based-beverages', 'en:coffees', 'en:freeze-dried-foods', 'en:instant-beverages', 'en:freeze-dried-plant-based-foods', 'en:instant-coffees', 'en:freeze-dried-instant-coffees'], nutriments: { 'energy-kcal_100g': 0.588, proteins_100g: 0.176, carbohydrates_100g: 0, fat_100g: 0, fiber_100g: 0, sugars_100g: 0, 'saturated-fat_100g': 0, sodium_100g: 0.00294 } },
  { code: '5449000298157', product_name: 'Coca-Cola Zero', product_name_en: 'Coca-Cola Zero', brands: ['Coca-Cola'], quantity: '1.5 L', categories_tags: ['en:beverages-and-beverages-preparations', 'en:beverages', 'en:carbonated-drinks', 'en:artificially-sweetened-beverages', 'en:sodas', 'en:diet-beverages', 'en:colas', 'en:diet-sodas', 'en:diet-cola-soft-drink'], nutriments: { 'energy-kcal_100g': 0.2, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0, sugars_100g: 0, 'saturated-fat_100g': 0, sodium_100g: 0.01 } },
];

api.listen(PORT, () => console.log(`mock backend on http://localhost:${PORT}`));

// Optional static host for an exported web build, with single-page fallback.
if (flags.static) {
  const root = path.resolve(flags.static);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
  http
    .createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = path.join(root, pathname);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(Number(flags['static-port'] || 8090), () => console.log(`static build on http://localhost:${flags['static-port'] || 8090}`));
}
