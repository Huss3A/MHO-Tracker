// Node tests for the position-aware merge + pity logic (npm test)
import assert from 'node:assert/strict';
import { mergeChunk, mergePulls } from '../src/lib/merge.js';
import { analyse } from '../src/lib/pity.js';
import { loadSchedule, periodFor, periodStats, fiftyFifty, stateOf, pullMs, fmtCountdown } from '../src/lib/banners.js';

const T = '2026/10/29 05:38:11';
const r = (name, row, rarity = 'R', time = T) => ({ row, type: 'Buddy', name, rarity, time });

// 10-pull with two identical "Horn" on page 1; page 2 shows the other five
const p1 = [r('Sand Velvet', 0, 'SR'), r('Wolfe', 1), r('Horn', 2), r('Horn', 3), r('Aku', 4)];
const p2 = [r('Mac', 0), r('Horn', 1), r('Zira', 2), r('Viper', 3), r('Bladey', 4)];
let s = mergeChunk([], 'Rotating', 1, p1).pulls;
assert.equal(s.length, 5);
s = mergeChunk(s, 'Rotating', 1, p1).pulls;                      // same screenshot again -> no change
assert.equal(s.length, 5, 'identical re-upload must not add rows');
s = mergeChunk(s, 'Rotating', 2, p2).pulls;
assert.equal(s.length, 10, 'page 2 is adjacent, not an overlap');
assert.equal(s.filter((p) => p.name === 'Horn').length, 3, 'three genuine Horns kept');
let again = mergeChunk(s, 'Rotating', 2, p2).pulls;
assert.equal(again.length, 10, 're-upload of page 2 is idempotent');
// page 2 uploaded first, then page 1
let s2 = mergeChunk(mergeChunk([], 'Rotating', 2, p2).pulls, 'Rotating', 1, p1).pulls;
assert.equal(s2.length, 10);
// a screenshot with genuine duplicates in one page is kept
assert.equal(mergeChunk([], 'Rotating', 1, p1).pulls.filter((p) => p.name === 'Horn').length, 2);
// merge of two complete lists (drive/json)
assert.equal(mergePulls(s, s2).length, 10);
assert.equal(mergePulls(s, []).length, 10);
// different banner same time is independent
assert.equal(mergeChunk(s, 'Standard', 1, p1).pulls.length, 15);
// new pulls on top: older group untouched
const newer = [r('Mac', 0, 'R', '2026/10/30 01:00:00')];
assert.equal(mergeChunk(s, 'Rotating', 1, newer).pulls.length, 11);

// pity: 3 pulls oldest->newest R, SR, SSR
const t = (time, rarity) => ({ banner: 'Standard', time, idx: 0, type: 'Buddy', name: 'x', rarity });
const a = analyse([t('2026/01/01 00:00:03', 'SSR'), t('2026/01/01 00:00:02', 'SR'), t('2026/01/01 00:00:01', 'R')], 'Standard');
assert.equal(a.list[0].pity, 3); assert.equal(a.sinceSSR, 0); assert.equal(a.ssrLeft, 90);

// banner schedule: periods, inclusive end date, per-period 120 count
const sch = loadSchedule({ timezone: '+03:00', banners: [
  { name: 'Midori', type: 'Featured', start: '2026-10-29', end: '2026-11-26' },
  { name: 'Freya', type: 'Featured', start: '2026-11-27', end: '2027-01-21' }] });
assert.equal(periodFor(sch, 'Featured', '2026/11/27 04:59:59').name, 'Midori', 'end date is inclusive up to the 05:00 reset');
assert.equal(periodFor(sch, 'Featured', '2026/11/27 05:00:00').name, 'Freya');
assert.equal(periodFor(sch, 'Featured', '2026/10/29 04:59:59'), null, 'before the 05:00 reset of the start date');
assert.equal(periodFor(sch, 'Featured', '2026/10/29 05:00:00').name, 'Midori');
assert.equal(periodFor(sch, 'Rotating', '2026/11/01 00:00:00'), null, 'banner type must match');
assert.equal(stateOf(sch[0], pullMs('2026/11/01 00:00:00')), 'live');
assert.equal(stateOf(sch[1], pullMs('2026/11/01 00:00:00')), 'upcoming');
assert.equal(fmtCountdown(90061000), '1d 01:01:01');
const fp = (i, rarity, name = 'x') => ({ banner: 'Featured', time: `2026/11/01 ${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`, idx: 0, type: 'Adventurer', name, rarity });
const ps = [];
for (let i = 0; i < 50; i++) ps.push(fp(i, 'R'));
ps.push(fp(50, 'SSR', 'Other'));
for (let i = 51; i < 100; i++) ps.push(fp(i, 'R'));
let st = periodStats(ps, sch[0]);
assert.equal(st.count, 100); assert.equal(st.toGuarantee, 20); assert.equal(st.gotFeatured, false); assert.equal(st.ssr, 1);
ps.push(fp(100, 'SSR', 'Midori'));
st = periodStats(ps, sch[0]);
assert.equal(st.featuredAt, 101); assert.equal(st.gotFeatured, true); assert.equal(st.toGuarantee, 0);
assert.equal(periodStats(ps, sch[1]).count, 0, 'pulls of another period are not counted');
// 50:50: SSRs oldest->newest: Other (loss), Midori (guaranteed, not counted), Midori (win), Other (loss)
const ff = [['2026/11/01 00:00:04', 'Other'], ['2026/11/01 00:00:03', 'Midori'], ['2026/11/01 00:00:02', 'Midori'], ['2026/11/01 00:00:01', 'Other']]
  .map(([time, name]) => ({ banner: 'Featured', time, idx: 0, type: 'Adventurer', name, rarity: 'SSR' }));
const w = fiftyFifty(ff, sch, 'Featured');
assert.equal(w.wins, 1); assert.equal(w.losses, 2);
assert.equal(fiftyFifty(ff, sch, 'Standard'), null);
console.log('all merge/pity tests passed');
