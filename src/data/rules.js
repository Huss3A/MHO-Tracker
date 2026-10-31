// Pity / rate rules per banner. Values marked verified:true come straight from the game's own
// English strings (Lottery namespace in en_Game.locres, "SubText" rule texts). Everything else
// is an assumption copied from the closest verified banner - edit here or in Settings.
export const BANNERS = {
  Beginner: { ssrPity: 50, srPity: 10, verified: true, note: 'Max 50 recruits, SSR Adventurer guaranteed within 50, SR within every 10 (game text).' },
  Standard: { ssrPity: 90, srPity: 10, verified: true, note: 'SSR guaranteed within 90, SR within every 10. Also: two SSR Buddies in a row -> next SSR is an Adventurer; free pick after 300 recruits (game text).' },
  Featured: { ssrPity: 90, srPity: 10, featuredPity: 120, verified: true, note: 'SSR within 90 (carries over between Featured banners); 50% featured, else next SSR is featured; featured guaranteed within 120 per banner period (game text). The 120 count is tracked per banner period from src/data/banners.json (every pull in the period counts).' },
  Rotating: { ssrPity: 90, srPity: 10, featuredPity: 120, verified: false, note: 'Game text only says counts are independent of other banners. 90/10 assumed. 120-pull featured guarantee per banner period as described by the user (not in game text).' },
  Festival: { ssrPity: 90, srPity: 10, verified: false, note: 'Assumed 90/10 like Featured.' },
  'Limited-Time': { ssrPity: 90, srPity: 10, verified: false, note: 'Assumed 90/10.' },
  Targeted: { ssrPity: 90, srPity: 10, verified: false, note: 'Assumed 90/10.' },
  'Standard Buddy': { ssrPity: 90, srPity: 10, verified: false, note: 'Buddy banners: SSR within 90, SR within every 10 (game text for Buddy Recruitment); assumed to apply here.' },
};
export const BANNER_NAMES = Object.keys(BANNERS);
export const BASE_RATES = { SSR: 0.6, SR: 9.4, R: 90 };
