import { BANNERS, BASE_RATES, GENERIC_RULES } from '../data/rules.js';
import { sortDisplay } from './merge.js';

export const rulesFor = (banner, overrides = {}) =>
  ({ ...(BANNERS[banner] || GENERIC_RULES), ...(overrides[banner] || {}) });

/**
 * Chance (percent, 0-100) that the pull with 1-based number `n` since the last SSR is an SSR.
 * Base rate, plus `softPityStep` points per pull from `softPityStart` on (that pull included),
 * and 100 at the hard pity. Banners without softPityStart (Beginner, unsupported) stay flat.
 */
export function ssrRate(n, rules) {
  if (n >= rules.ssrPity) return 100;
  const base = rules.baseSSR ?? BASE_RATES.SSR;
  if (!rules.softPityStart || n < rules.softPityStart) return base;
  return Math.min(100, base + (n - rules.softPityStart + 1) * rules.softPityStep);
}
export const inSoftPity = (n, rules) => !!rules.softPityStart && n >= rules.softPityStart && n < rules.ssrPity;

/**
 * Walk the pulls of one banner oldest -> newest. Display order is newest-first, so chronological
 * order is its reverse (ASSUMPTION: rows inside one 10-pull appear newest-first too).
 */
export function analyse(pulls, banner, overrides) {
  const rules = rulesFor(banner, overrides);
  const chrono = sortDisplay(pulls).reverse();
  let sinceSSR = 0, sinceSR = 0;
  const list = chrono.map((p, i) => {
    sinceSSR++; sinceSR++;
    const rec = { ...p, n: i + 1, pity: p.rarity === 'SSR' ? sinceSSR : null, srPity: p.rarity === 'SR' ? sinceSR : null };
    if (p.rarity === 'SSR') sinceSSR = 0;
    if (p.rarity === 'SR' || p.rarity === 'SSR') sinceSR = 0;   // assumption: SSR also satisfies the SR guarantee
    return rec;
  });
  const cnt = { SSR: 0, SR: 0, R: 0 };
  chrono.forEach((p) => cnt[p.rarity]++);
  const total = chrono.length;
  const ssr = list.filter((p) => p.rarity === 'SSR');
  return {
    rules, total, cnt, list: list.reverse(),
    sinceSSR, sinceSR,
    nextSSR: ssrRate(sinceSSR + 1, rules), soft: inSoftPity(sinceSSR + 1, rules), hasModel: !!rules.softPityStart,
    ssrLeft: Math.max(0, rules.ssrPity - sinceSSR), srLeft: Math.max(0, rules.srPity - sinceSR),
    avgSSRPity: ssr.length ? ssr.reduce((a, p) => a + p.pity, 0) / ssr.length : null,
    rate: (r) => (total ? (cnt[r] / total) * 100 : 0),
    base: BASE_RATES,
  };
}

/** Rarity table for a (possibly filtered) list from analyse(): count, share, average pity, split by type. */
export function summarise(list) {
  const total = list.length, out = { total };
  for (const r of ['SSR', 'SR', 'R']) {
    const items = list.filter((p) => p.rarity === r), key = r === 'SSR' ? 'pity' : r === 'SR' ? 'srPity' : null;
    const avg = (xs) => (key && xs.length ? xs.reduce((a, p) => a + p[key], 0) / xs.length : null);
    const types = {};
    items.forEach((p) => (types[p.type] ||= []).push(p));
    out[r] = {
      count: items.length, pct: total ? (items.length / total) * 100 : 0, avg: avg(items),
      types: Object.entries(types).map(([type, xs]) => ({ type, count: xs.length, pct: total ? (xs.length / total) * 100 : 0, avg: avg(xs) })),
    };
  }
  return out;
}
