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
 *   node scripts/dev/mock-backend.cjs [--port=54321] [--static=<dir> --static-port=8090]
 *
 * With --static it also serves an exported web build with single-page fallback.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const PORT = Number(flags.port || 54321);

const state = { users: new Map(), records: [], profiles: new Map(), aiRequests: [], aiUsage: new Map(), coachRequests: [], coachUsage: new Map(), recoveries: [], social: new Map(), socialLimits: new Map(), friendships: [], declines: [], cheers: [], clock: Date.now() };
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
    user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, email_confirmed_at: now, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: now, updated_at: now },
  };
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
}
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
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
/** Turn friends off: card, friendships and cheers go; declines and limits stay. */
function leaveSocial(uid) {
  state.cheers = state.cheers.filter((c) => c.from_user !== uid && c.to_user !== uid);
  state.friendships = state.friendships.filter((f) => f.requester !== uid && f.addressee !== uid);
  state.social.delete(uid);
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
      return null;
    }
    case 'POST /rest/v1/rpc/send_cheer': {
      const ref = String(body.p_ref || '').trim();
      if (!isCheerRef(ref)) return 'invalid';
      if (!areFriends(me, body.p_to)) return 'not_friends';
      // A real day of the last two weeks, or a workout the friend publishes and shares now.
      if (ref.startsWith('day:')) {
        const day = ref.slice(4);
        if (!isDay(day) || day < utcDay(-15) || day > utcDay(1)) return 'invalid';
      } else {
        const p = state.social.get(body.p_to);
        if (!(visibleSummary(p?.summary, p?.sharing).workouts ?? []).some((w) => w.id === ref)) return 'invalid';
      }
      if (!state.cheers.some((c) => c.from_user === me && c.to_user === body.p_to && c.ref === ref)) state.cheers.push({ from_user: me, to_user: body.p_to, ref, created_at: now() });
      return 'ok';
    }
    case 'POST /rest/v1/rpc/friends_overview': {
      const mine = state.social.get(me);
      const person = (id) => state.social.get(id);
      return {
        // share_key only in the caller's own card.
        me: mine ? { code: mine.code, display_name: mine.display_name, avatar: mine.avatar, sharing: mine.sharing, share_key: mine.share_key } : null,
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
    default:
      return undefined;
  }
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
      users: [...state.users.values()].map((u) => ({ id: u.id, email: u.email })),
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
    });
  }

  // ------------------------------------------------------------------- auth
  if (route === 'POST /auth/v1/signup') {
    const email = String(body.email || '').toLowerCase();
    if (state.users.has(email)) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
    if (String(body.password || '').length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
    const user = { id: crypto.randomUUID(), email, password: body.password };
    state.users.set(email, user);
    return send(res, 200, issueSession(user));
  }
  if (route === 'POST /auth/v1/token') {
    if (url.searchParams.get('grant_type') === 'pkce') {
      // The emailed code only works with the secret kept by the browser that asked for it.
      const rec = state.recoveries.find((r) => r.code === body.auth_code);
      const challenge = crypto.createHash('sha256').update(String(body.code_verifier || '')).digest('base64url');
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
  if (route === 'POST /functions/v1/analyze-food') {
    if (!uid) return send(res, 401, { error: 'unauthorized', message: 'Sign in to analyse food.' });
    // As on the real function: a careful analysis uses five units of the daily allowance.
    const used = (state.aiUsage.get(uid) || 0) + (body.precise === true ? 5 : 1);
    const LIMIT = 40;
    state.aiRequests.push({ user: uid, hasImage: typeof body.image === 'string' && body.image.length > 0, imageChars: (body.image || '').length, mediaType: body.mediaType ?? null, text: body.text ?? null, precise: body.precise === true });
    if (/daily limit/i.test(body.text || '')) return send(res, 429, { error: 'daily_limit', message: `You have used today's ${LIMIT} AI analyses. They reset at midnight UTC.`, remaining: 0 });
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
     *   - the 31st question of a run for one account, or a message containing "daily limit": 429 daily_limit;
     *   - "shared limit": 429 shared_limit;   "busy now": 503 busy;   "too slow": 504 timeout;
     *   - "server error": 502 upstream;   "please decline": 422 declined;
     *   - "cut short": 200 with truncated: true;   "refer me": 200 with refer: true;
     *   - anything else: 200 with a fixed answer naming what was received (Hebrew when the question starts with a Hebrew letter).
     * Every request is kept in state.coachRequests (GET /__state), with its body exactly as received.
     */
    const COACH_LIMIT = 30;
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
      history_too_long: 'At most 6 earlier messages can be sent.',
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
    if (history.length > 6) return refuse(400, 'history_too_long');
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
    if (used >= COACH_LIMIT || /daily limit/i.test(message)) return refuse(429, 'daily_limit', { remaining: 0 });
    if (/shared limit/i.test(message)) return refuse(429, 'shared_limit', { remaining: 0 });
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
