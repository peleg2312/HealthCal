// Run: node --experimental-strip-types scripts/check-activities.mjs
import {
  ACTIVITIES,
  ACTIVITY_BY_ID,
  ACTIVITY_CATEGORIES,
  POPULAR_ACTIVITY_IDS,
  MET_SOURCES,
  searchActivities,
} from '../src/data/activities.ts';

// Every distinct MET value appearing in the research table (section 2.2).
const TABLE_METS = new Set([
  1.5, 1.8, 2.0, 2.3, 2.5, 2.7, 2.8, 3.0, 3.3, 3.5, 3.8, 4.0, 4.3, 4.5, 4.8, 5.0, 5.3, 5.5, 5.8,
  6.0, 6.3, 6.5, 6.8, 7.0, 7.3, 7.5, 7.8, 8.0, 8.3, 8.5, 8.8, 9.0, 9.3, 9.5, 9.8, 10.0, 10.3,
  10.5, 10.8, 11.0, 11.3, 11.8, 12.0, 12.3, 12.5, 13.0, 13.3, 13.5, 13.8, 14.0, 14.3, 14.8, 16.0,
  16.3, 16.8, 18.5, 19.8, 23.0,
]);
const INTENSITIES = ['light', 'moderate', 'vigorous'];
const errors = [];
const fail = (m) => errors.push(m);

const ids = ACTIVITIES.map((a) => a.id);
if (new Set(ids).size !== ids.length) fail('duplicate ids');
if (Object.keys(ACTIVITY_BY_ID).length !== ids.length) fail('ACTIVITY_BY_ID size mismatch');

const cats = new Set(ACTIVITY_CATEGORIES.map((c) => c.id));
if (cats.size !== ACTIVITY_CATEGORIES.length) fail('duplicate category entries');

for (const a of ACTIVITIES) {
  if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(a.id)) fail(`${a.id}: id is not snake_case`);
  if (!a.name || !a.emoji) fail(`${a.id}: missing name or emoji`);
  if (!cats.has(a.category)) fail(`${a.id}: unknown category ${a.category}`);
  for (const i of INTENSITIES) {
    const v = a.met[i];
    if (typeof v !== 'number' || v < 1.0 || v > 23) fail(`${a.id}.${i}: MET ${v} outside 1.0-23`);
    if (!TABLE_METS.has(v)) fail(`${a.id}.${i}: MET ${v} is not a value in the research table`);
    const h = a.intensityHint?.[i];
    if (!h) fail(`${a.id}.${i}: missing hint`);
    else if (h.length > 30) fail(`${a.id}.${i}: hint too long (${h.length}): "${h}"`);
  }
  if (!(a.met.light <= a.met.moderate && a.met.moderate <= a.met.vigorous))
    fail(`${a.id}: METs not ordered ${a.met.light}/${a.met.moderate}/${a.met.vigorous}`);
  if (!MET_SOURCES[a.id] || MET_SOURCES[a.id].length < 10) fail(`${a.id}: missing MET_SOURCES entry`);
  // A reused (equal) value must be acknowledged in the provenance string.
  const m = a.met;
  const reused = m.light === m.moderate || m.moderate === m.vigorous;
  const src = MET_SOURCES[a.id] ?? '';
  if (reused && !/single Compendium value|reuse|share|No dedicated row|Substitution/i.test(src))
    fail(`${a.id}: equal MET values but MET_SOURCES does not say so`);
}
for (const k of Object.keys(MET_SOURCES)) if (!ACTIVITY_BY_ID[k]) fail(`MET_SOURCES has unknown id ${k}`);
for (const id of POPULAR_ACTIVITY_IDS) if (!ACTIVITY_BY_ID[id]) fail(`popular id ${id} does not exist`);

// searchActivities behaviour
const all = searchActivities('');
if (all.length !== ACTIVITIES.length) fail('empty search must return all');
for (let i = 1; i < all.length; i++)
  if (all[i - 1].name.localeCompare(all[i].name) > 0) fail('empty search not sorted by name');
const sw = searchActivities('SWIM');
if (!sw.length || !sw[0].name.toLowerCase().startsWith('swim')) fail('search "SWIM": prefix match not first');
if (!searchActivities('mtb').some((a) => a.id === 'mountain_biking')) fail('keyword search failed');
if (searchActivities('zzzz').length !== 0) fail('nonsense query should return nothing');

console.log(`activities: ${ACTIVITIES.length}, categories: ${ACTIVITY_CATEGORIES.length}, popular: ${POPULAR_ACTIVITY_IDS.length}`);
const eq = ACTIVITIES.filter((a) => a.met.light === a.met.moderate || a.met.moderate === a.met.vigorous);
const single = ACTIVITIES.filter((a) => a.met.light === a.met.vigorous);
const subst = Object.entries(MET_SOURCES).filter(([, s]) => /No dedicated row/.test(s)).map(([k]) => k);
console.log(`with reused/equal values: ${eq.length} (all-equal single value: ${single.length}); substituted: ${subst.join(', ')}`);
if (errors.length) {
  console.error(`FAILED (${errors.length}):\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log('OK');
