// Node tests for the position-aware merge + pity logic (npm test)
import assert from 'node:assert/strict';
import { mergeChunk, mergePulls } from '../src/lib/merge.js';
import { analyse } from '../src/lib/pity.js';

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
console.log('all merge/pity tests passed');
