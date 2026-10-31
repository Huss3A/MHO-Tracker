import NAMES from '../data/names.json';
import { BANNER_NAMES } from '../data/rules.js';

export function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const clean = (s) => (s || '').replace(/[^\p{L}\p{N} '\-:.]/gu, ' ').replace(/\s+/g, ' ').trim();

function nearest(raw, list) {
  const r = clean(raw).toLowerCase();
  let best = null, second = Infinity;
  for (const cand of list) {
    const d = lev(r, cand.toLowerCase());
    if (!best || d < best.dist) { second = best ? best.dist : Infinity; best = { value: cand, dist: d }; }
    else if (d < second) second = d;
  }
  return best ? { ...best, ambiguous: second === best.dist } : null;
}

/** Snap an OCR'd name to the game's name list. ok=false means "kept raw, please check". */
export function snapName(raw, type) {
  const r = clean(raw);
  const list = NAMES[type] || [...NAMES.Adventurer, ...NAMES.Buddy];
  const hit = nearest(r, list);
  if (!hit || !r) return { name: r, dist: 99, ok: false };
  const tol = Math.max(1, Math.floor(r.length * 0.3));
  if (hit.dist <= tol && !hit.ambiguous) return { name: hit.value, dist: hit.dist, ok: hit.dist === 0 || r.length > 3 };
  return { name: r, dist: hit.dist, ok: false, suggestion: hit.value };
}

export function snapType(raw) {
  const hit = nearest(raw, ['Adventurer', 'Buddy']);
  return hit && hit.dist <= 3 ? { type: hit.value, ok: true } : { type: clean(raw), ok: false };
}

export function snapBanner(raw) {
  const hit = nearest(raw, BANNER_NAMES);
  return hit && hit.dist <= 2 && !hit.ambiguous ? { banner: hit.value, ok: true } : { banner: clean(raw), ok: false };
}
export { NAMES };
