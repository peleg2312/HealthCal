// Puts the people, friendships, requests and cheers that the signed-in friends states in
// scripts/dev/states/move.cjs expect on a running scripts/dev/mock-backend.cjs. Run it once after
// starting the backend (it is safe to run again):
//
//   API=http://localhost:54321 node scripts/dev/states/move-friends.mjs
import crypto from 'node:crypto';

const API = process.env.API || 'http://localhost:54321';
const PASSWORD = 'correct horse battery';
const hex = () => crypto.randomBytes(16).toString('hex');
const day = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monday = () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return day(Math.round((d - new Date().setHours(12, 0, 0, 0)) / 86400000));
};

async function post(path, body, token) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'mock', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function person(email, name) {
  let s;
  try {
    s = await post('/auth/v1/signup', { email, password: PASSWORD });
  } catch {
    s = await post('/auth/v1/token?grant_type=password', { email, password: PASSWORD });
  }
  const p = { email, token: s.access_token, id: s.user.id, name };
  if (name) {
    const card = await post('/rest/v1/rpc/social_setup', { p_display_name: name, p_avatar: '', p_sharing: { workouts: true, streak: true, minutes: true } }, p.token);
    p.code = card.code;
    p.shareKey = card.share_key;
  }
  return p;
}
const rpc = (p, fn, body) => post(`/rest/v1/rpc/${fn}`, body, p.token);
const publish = (p, summary) => rpc(p, 'social_publish', { p_summary: { week: monday(), ...summary }, p_share_key: p.shareKey });
const befriend = async (a, b) => {
  await rpc(a, 'friend_request', { p_code: b.code });
  await rpc(b, 'friend_request', { p_code: a.code });
};
const w = (name, emoji, minutes, n, distanceKm) => ({ id: hex(), name, emoji, minutes, date: day(n), ...(distanceKm ? { distanceKm } : null) });

// The main account: several friends with long names and recent workouts, requests both ways, cheers.
const me = await person('move.friends@example.com', 'Bartholomew-Christophe');
const maxi = await person('move.maxi@example.com', 'Maximiliana Vandenberghe-Okonkwo');
const jo = await person('move.jo@example.com', 'Jo');
const alex = await person('move.alex@example.com', 'Alexandria Papadopoulou-Fitzgerald');
const sam = await person('move.sam@example.com', 'Sam');
for (const f of [maxi, jo, alex, sam]) await befriend(me, f);
await publish(maxi, {
  minutes: 1240, sessions: 14, streak: 412,
  workouts: [w('Stand-up paddleboarding', '🏄', 185, 0, 14.6), w('Cross-country skiing', '⛷️', 240, -1, 32.4), w('Ballet / modern / jazz', '💃', 90, -2), w('Bodyweight resistance', '🤸', 45, -3), w('Football (touch/flag)', '🏈', 120, -5), w('Open water swimming', '🏊', 75, -6, 3.2)],
});
await publish(jo, { minutes: 35, sessions: 1, streak: 2, workouts: [w('Walking', '🚶', 35, -1, 3.1)] });
await publish(alex, { minutes: 0, sessions: 0, streak: 0 });
await publish(sam, { minutes: 160, sessions: 3, streak: 27, workouts: [w('Running', '🏃', 52, 0, 10.4), w('Strength training', '🏋️', 60, -2), w('Yoga', '🧘', 48, -4)] });
for (const [f, n] of [[maxi, 0], [maxi, -1], [jo, -2], [sam, -3], [alex, -6]]) await rpc(f, 'send_cheer', { p_to: me.id, p_ref: `day:${day(n)}` });
const chris = await person('move.chris@example.com', 'Christopher-Alexander Montgomery');
const li = await person('move.li@example.com', 'Li');
await rpc(chris, 'friend_request', { p_code: me.code });
await rpc(li, 'friend_request', { p_code: me.code });
const willa = await person('move.willa@example.com', 'Wilhelmina Featherstonehaugh-Abernathy');
await rpc(me, 'friend_request', { p_code: willa.code });

// Friends on, nobody yet.
const lone = await person('move.lone@example.com', 'Bartholomew-Christophe');
// Friends on, only requests waiting.
const asked = await person('move.asked@example.com', 'Dana');
await rpc(chris, 'friend_request', { p_code: asked.code });
await rpc(maxi, 'friend_request', { p_code: asked.code });
// Signed in, friends not turned on yet.
await person('move.off@example.com');

console.log(JSON.stringify({ meCode: me.code, maxiCode: maxi.code, chrisCode: chris.code, loneCode: lone.code }));
