import { BANNERS, BASE_RATES } from '../data/rules.js';
import { sortDisplay } from './merge.js';

export const rulesFor = (banner, overrides = {}) =>
  ({ ...(BANNERS[banner] || { ssrPity: 90, srPity: 10, verified: false }), ...(overrides[banner] || {}) });

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
    ssrLeft: Math.max(0, rules.ssrPity - sinceSSR), srLeft: Math.max(0, rules.srPity - sinceSR),
    avgSSRPity: ssr.length ? ssr.reduce((a, p) => a + p.pity, 0) / ssr.length : null,
    rate: (r) => (total ? (cnt[r] / total) * 100 : 0),
    base: BASE_RATES,
  };
}
