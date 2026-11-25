// Puts the people, shown meals, workouts and cheers that the "friends with meals" states in
// scripts/dev/states/move.cjs expect on a running scripts/dev/mock-backend.cjs, with ordinary names
// (the long-name and big-number cases stay in move-friends.mjs). Run it once after starting the
// backend; running it again shows the same meals again (same day and meal, same reference):
//
//   API=http://localhost:54321 node scripts/dev/states/friends-meals.mjs
//
// meals.dana@example.com has three friends (Maya, Sam, Jo), a request from Li, cheers for her day and
// for the breakfast she shows Maya and Sam; Maya shows her lunch today (no calories, one own food) and
// a dinner two days ago, Jo his breakfast with calories (one AI estimate); every friend shares workouts.
// meals.teen@example.com is 16, with one friend: the screens leave every meal control out.
// meals.none@example.com has friends on, one friend (Maya) and nothing in the feed yet.
// Every password is "correct horse battery".
import crypto from 'node:crypto';

const API = process.env.API || 'http://localhost:54321';
const PASSWORD = 'correct horse battery';
const hex = () => crypto.randomBytes(16).toString('hex');
const pad = (n) => String(n).padStart(2, '0');
const day = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monday = () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function post(path, body, token) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'mock', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function person(email, name, birthDate = '1990-05-01') {
  let s;
  try {
    s = await post('/auth/v1/signup', { email, password: PASSWORD });
  } catch {
    s = await post('/auth/v1/token?grant_type=password', { email, password: PASSWORD });
  }
  const p = { email, token: s.access_token, id: s.user.id, name };
  // The server reads the age from the synced profile, as for the coach.
  const at = new Date(Date.now() - 86_400_000).toISOString();
  await post('/rest/v1/rpc/push_profile', { p_profile: { name, birthDate }, p_profile_updated_at: at, p_settings: null, p_settings_updated_at: null }, p.token);
  const card = await post('/rest/v1/rpc/social_setup', { p_display_name: name, p_avatar: '', p_sharing: { workouts: true, streak: true, minutes: true } }, p.token);
  p.code = card.code;
  p.shareKey = card.share_key;
  return p;
}
const rpc = (p, fn, body) => post(`/rest/v1/rpc/${fn}`, body, p.token);
const publish = (p, summary) => rpc(p, 'social_publish', { p_summary: { week: monday(), ...summary }, p_share_key: p.shareKey });
const befriend = async (a, b) => {
  await rpc(a, 'friend_request', { p_code: b.code });
  await rpc(b, 'friend_request', { p_code: a.code });
};
const w = (name, emoji, minutes, n, distanceKm) => ({ id: hex(), name, emoji, minutes, date: day(n), ...(distanceKm ? { distanceKm } : null) });
const food = (name, emoji, portion, source, extra = {}) => ({ name, emoji, portion, source, ...extra });
const show = async (p, n, meal, items, showKcal, viewers) => {
  const res = await rpc(p, 'meal_show', { p_day: day(n), p_meal: meal, p_items: items, p_show_kcal: showKcal, p_viewers: viewers.map((v) => v.id) });
  if (res?.status !== 'ok') throw new Error(`meal_show ${p.name} ${meal}: ${JSON.stringify(res)}`);
  return res.ref;
};

const dana = await person('meals.dana@example.com', 'Dana');
const maya = await person('meals.maya@example.com', 'Maya');
const sam = await person('meals.sam@example.com', 'Sam');
const jo = await person('meals.jo@example.com', 'Jo');
for (const f of [maya, sam, jo]) await befriend(dana, f);
const li = await person('meals.li@example.com', 'Li');
await rpc(li, 'friend_request', { p_code: dana.code });

await publish(maya, { minutes: 145, sessions: 4, streak: 23, workouts: [w('Running', '🏃', 42, 0, 7.2), w('Yoga', '🧘', 30, -2), w('Cycling', '🚴', 55, -3, 18.5)] });
await publish(sam, { minutes: 160, sessions: 3, streak: 27, workouts: [w('Running', '🏃', 52, 0, 10.4)] });
await publish(jo, { minutes: 35, sessions: 1, streak: 2, workouts: [w('Walking', '🚶', 35, -1, 3.1)] });

await show(maya, 0, 'lunch', [
  food('Israeli salad (tomato, cucumber, onion, oil, lemon)', '🥗', '1 large serving · 150 g', 'builtin', { foodId: 'b_israeli_salad', serving: '1 large serving', quantity: 1, grams: 150 }),
  food('Chicken breast, skinless, COOKED (roasted)', '🍗', '1 breast · 172 g', 'builtin', { foodId: 'b_chicken_breast_cooked', serving: '1 breast', quantity: 1, grams: 172 }),
  food('Tahini dressing', '🥣', '2 tbsp · 30 g', 'custom', { serving: '2 tbsp', quantity: 1, grams: 30 }),
], false, [dana]);
await show(maya, -2, 'dinner', [
  food('Shakshuka (eggs poached in tomato-pepper sauce)', '🍳', '1 serving · 200 g', 'builtin', { foodId: 'b_shakshuka', serving: '1 serving', quantity: 1, grams: 200 }),
  food('Pita bread, whole-wheat', '🫓', '1 large (6.5") · 64 g', 'builtin', { foodId: 'b_pita_wholewheat', serving: '1 large (6.5")', quantity: 1, grams: 64 }),
], false, [dana]);
await show(jo, 0, 'breakfast', [
  food('Oatmeal, cooked with water', '🥣', '1 cup cooked · 234 g', 'builtin', { foodId: 'b_oatmeal_cooked', serving: '1 cup cooked', quantity: 1, grams: 234, kcal: 166 }),
  food('Latte', '☕', '1 mug', 'ai', { serving: '1 mug', quantity: 1, grams: 350, kcal: 145, kcalLow: 110, kcalHigh: 180 }),
], true, [dana]);

// Dana shows her breakfast to Maya and Sam; Maya cheers it. Cheers for Dana's day too.
const danaBreakfast = await show(dana, 0, 'breakfast', [food('Greek yogurt, plain, 2%', '🥣', '1 cup · 245 g', 'builtin', { foodId: 'b_greek_yogurt_2', serving: '1 cup', quantity: 1, grams: 245 })], false, [maya, sam]);
await rpc(maya, 'send_cheer', { p_to: dana.id, p_ref: `meal:${danaBreakfast}` });
await rpc(sam, 'send_cheer', { p_to: dana.id, p_ref: `day:${day(0)}` });
await rpc(jo, 'send_cheer', { p_to: dana.id, p_ref: `day:${day(-1)}` });

// Under 18: friends on, one friend; no meal control anywhere.
const teen = await person('meals.teen@example.com', 'Noa', '2010-03-14');
await befriend(teen, sam);
// Friends on, one friend, nothing shown or logged yet.
const none = await person('meals.none@example.com', 'Ari');
const quiet = await person('meals.quiet@example.com', 'Rui');
await befriend(none, quiet);

console.log(JSON.stringify({ dana: dana.code, maya: maya.code, teen: teen.code, none: none.code }));
