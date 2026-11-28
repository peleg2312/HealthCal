// Puts "doing things together" on a running scripts/dev/mock-backend.cjs for the friends-together states in
// scripts/dev/states/move.cjs. Run it after friends-meals.mjs (it signs in to the accounts that made):
//
//   API=http://localhost:54321 node scripts/dev/states/friends-together.mjs
//
// Dana is in a minutes circle with Maya and Sam (goal 600), logs together with Maya (Maya missed one day four days
// ago), is asked by Jo to log together (Jo's page, the first in her row), has a note from Maya and one from Sam, and
// sees Maya's saved meal "Chicken and rice bowl". Maya's own Friends shows the pair's week on Dana's page; Sam's shows
// Dana's page with "Log together" offered and today's note already sent. Rui starts a days-logged circle and invites Ari, so
// Ari's Friends shows an invitation. Noa (16) has a friend and no circle: her start step offers minutes only.
// On a stand-in started with --no-together (or POST /__together { on: false }) every call here is refused: run it
// only against one with circles on. Every password is "correct horse battery".

const API = process.env.API || 'http://localhost:54321';
const PASSWORD = 'correct horse battery';
const pad = (n) => String(n).padStart(2, '0');
const day = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function post(path, body, token) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'mock', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function signIn(email) {
  const s = await post('/auth/v1/token?grant_type=password', { email, password: PASSWORD });
  return { email, token: s.access_token, id: s.user.id };
}
const rpc = (p, fn, body) => post(`/rest/v1/rpc/${fn}`, body, p.token);
const ok = (what, res, want = 'ok') => {
  const status = res && typeof res === 'object' ? res.status : res;
  if (status !== want) throw new Error(`${what}: ${JSON.stringify(res)}`);
  return res;
};

const dana = await signIn('meals.dana@example.com');
const maya = await signIn('meals.maya@example.com');
const sam = await signIn('meals.sam@example.com');
const jo = await signIn('meals.jo@example.com');
const ari = await signIn('meals.none@example.com');
const rui = await signIn('meals.quiet@example.com');

// The circle: Dana asks Maya and Sam; both join and send their minutes this week (and last).
const circle = ok('together_start', await rpc(dana, 'together_start', { p_kind: 'minutes', p_target: 600, p_invite: [maya.id, sam.id] }));
ok('maya joins', await rpc(maya, 'together_respond', { p_goal: circle.id, p_accept: true }), 'joined');
ok('sam joins', await rpc(sam, 'together_respond', { p_goal: circle.id, p_accept: true }), 'joined');

// Logging together: Maya asks Dana and Dana accepts. Each sends the days they logged (Maya all of the last 14 but
// four days ago, Dana every one of them), and Maya her minutes for the circle too.
ok('buddy ask', await rpc(maya, 'buddy_invite', { p_user: dana.id }), 'sent');
ok('buddy accept', await rpc(dana, 'buddy_respond', { p_user: maya.id, p_accept: true }), 'together');
const days14 = Array.from({ length: 14 }, (_, i) => day(-i));
ok('maya signals', await rpc(maya, 'social_signals_publish', { p_signals: { today: day(0), minutes: 145, last_minutes: 120, logged: days14.filter((d) => d !== day(-4)) } }));
ok('sam minutes', await rpc(sam, 'social_signals_publish', { p_signals: { today: day(0), minutes: 160, last_minutes: 150 } }));
ok('dana signals', await rpc(dana, 'social_signals_publish', { p_signals: { today: day(0), minutes: 60, last_minutes: 90, logged: days14 } }));
// Jo asks Dana too: an invitation on Jo's page (the first in Dana's row).
ok('jo asks', await rpc(jo, 'buddy_invite', { p_user: dana.id }), 'sent');

// Notes for Dana.
ok('maya note', await rpc(maya, 'send_note', { p_to: dana.id, p_kind: 'walk_later' }));
ok('sam note', await rpc(sam, 'send_note', { p_to: dana.id, p_kind: 'nice_week' }));

// Maya shows Dana a saved meal (no calories).
const saved = await rpc(maya, 'meal_show_saved', {
  p_saved_id: 'seed-chicken-rice-bowl',
  p_name: 'Chicken and rice bowl',
  p_items: [
    { name: 'Chicken breast, skinless, COOKED (roasted)', emoji: '🍗', portion: '1 breast · 172 g', source: 'builtin', foodId: 'b_chicken_breast_cooked', serving: '1 breast', quantity: 1, grams: 172 },
    { name: 'White rice, long-grain, COOKED', emoji: '🍚', portion: '1 cup cooked · 158 g', source: 'builtin', foodId: 'b_rice_white_cooked', serving: '1 cup cooked', quantity: 1, grams: 158 },
    { name: 'Tahini dressing', emoji: '🥣', portion: '2 tbsp · 30 g', source: 'custom', serving: '2 tbsp', quantity: 1, grams: 30 },
  ],
  p_servings: null,
  p_show_kcal: false,
  p_viewers: [dana.id],
});
ok('saved meal', saved);

// Rui starts a days-logged circle and asks Ari.
ok('rui circle', await rpc(rui, 'together_start', { p_kind: 'days', p_target: 10, p_invite: [ari.id] }));

console.log(JSON.stringify({ circle: circle.id, saved: saved.ref }));
