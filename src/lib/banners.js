// Banner schedule helpers. Pure functions (the schedule is passed in) so they can be unit-tested in node.
// Game times are server time (UTC+3 by default) and are compared as absolute instants.
import { rulesFor } from './pity.js';
import { sortDisplay } from './merge.js';

const DAY = 86400000;
export const FEATURED_GUARANTEE = 120;

/** "2026/10/29 05:38:11" (game table, server time) -> epoch ms */
export function pullMs(time, tz = '+03:00') {
  const m = /^(\d{4})\/(\d\d)\/(\d\d) (\d\d:\d\d:\d\d)$/.exec(time || '');
  return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}${tz}`) : NaN;
}

/** schedule JSON -> [{...banner, startMs, endMs}] sorted by start. endMs is exclusive (end of the end date). */
export function loadSchedule(json) {
  const tz = json.timezone || '+03:00', hh = String(json.resetHour ?? 5).padStart(2, '0');
  return json.banners.map((b) => ({
    ...b,
    startMs: Date.parse(`${b.start}T${hh}:00:00${tz}`),
    endMs: Date.parse(`${b.end}T${hh}:00:00${tz}`) + DAY,
  })).sort((a, b) => a.startMs - b.startMs);
}

export const stateOf = (b, now) => (now < b.startMs ? 'upcoming' : now < b.endMs ? 'live' : 'ended');

/** which scheduled banner did a pull (banner type + time) fall into? */
export function periodFor(schedule, bannerType, time) {
  const t = pullMs(time);
  return schedule.find((b) => b.type === bannerType && t >= b.startMs && t < b.endMs) || null;
}

/**
 * Per-period counting: every pull on that banner type inside the period counts toward the 120 guarantee,
 * regardless of pity elsewhere. Featured = an SSR with the banner's name.
 */
export function periodStats(pulls, b, overrides) {
  const limit = rulesFor(b.type, overrides).featuredPity || FEATURED_GUARANTEE;
  const inP = sortDisplay(pulls.filter((p) => p.banner === b.type && p.time && pullMs(p.time) >= b.startMs && pullMs(p.time) < b.endMs)).reverse();
  let featuredAt = null;
  inP.forEach((p, i) => { if (featuredAt == null && p.rarity === 'SSR' && p.name === b.name) featuredAt = i + 1; });
  const ssr = inP.filter((p) => p.rarity === 'SSR').length;
  return {
    banner: b, count: inP.length, limit, ssr, featuredAt,
    gotFeatured: featuredAt != null,
    toGuarantee: featuredAt != null ? 0 : Math.max(0, limit - inP.length),
    guaranteeReached: featuredAt == null && inP.length >= limit,   // should not happen unless the character came from elsewhere
  };
}

/** "2d 03:04:05" style countdown */
export function fmtCountdown(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400);
  const p = (n) => String(n).padStart(2, '0');
  return `${d}d ${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/**
 * Featured 50:50 record. Rule (game text): 50% the SSR is the featured one, otherwise the NEXT SSR is guaranteed featured.
 * Win = featured SSR that was not itself guaranteed. Only SSRs inside a scheduled period can be judged;
 * the guarantee is assumed to carry across Featured banners. `listNewestFirst` comes from analyse().
 */
export function fiftyFifty(listNewestFirst, schedule, bannerType) {
  if (bannerType !== 'Featured') return null;
  let wins = 0, losses = 0, guaranteed = false;
  for (const p of listNewestFirst.slice().reverse()) {
    if (p.rarity !== 'SSR') continue;
    const per = periodFor(schedule, bannerType, p.time);
    if (!per) continue;
    const featured = p.name === per.name;
    if (guaranteed) guaranteed = false;
    else if (featured) wins++;
    else { losses++; guaranteed = true; }
  }
  return { wins, losses, pct: wins + losses ? (wins / (wins + losses)) * 100 : null };
}
