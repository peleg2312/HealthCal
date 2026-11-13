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

const state = { users: new Map(), records: [], profiles: new Map(), aiRequests: [], aiUsage: new Map(), recoveries: [], clock: Date.now() };
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

const api = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
      // What the reset email would carry: lets a test follow the link without a mailbox.
      recoveries: state.recoveries.map((r) => ({ email: r.email, code: r.code, redirectTo: r.redirectTo })),
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
    if (route === 'POST /rest/v1/rpc/delete_my_account') {
      state.records = state.records.filter((r) => r.user_id !== uid);
      state.profiles.delete(uid);
      for (const [email, u] of state.users) if (u.id === uid) state.users.delete(email);
      return res.writeHead(204).end();
    }
    if (route === 'GET /rest/v1/records') {
      const after = (url.searchParams.get('server_updated_at') || '').replace(/^gt\./, '');
      const limit = Number(url.searchParams.get('limit') || 1000);
      // Row-level security: only the caller's rows, whatever the query asks for.
      const rows = state.records
        .filter((r) => r.user_id === uid && (!after || Date.parse(r.server_updated_at) > Date.parse(after)))
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
  if (route === 'GET /functions/v1/food-search') {
    if (!req.headers.apikey) return send(res, 401, { message: 'No API key found in request' });
    const q = (url.searchParams.get('q') || '').trim();
    try {
      const upstream = await fetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${Number(url.searchParams.get('limit')) || 24}&fields=code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity`);
      const data = await upstream.json();
      return send(res, 200, { hits: data.hits || [] });
    } catch {
      return send(res, 502, { error: 'upstream', message: 'The product database is not answering right now.' });
    }
  }

  send(res, 404, { message: `mock backend has no handler for ${route}` });
});

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
