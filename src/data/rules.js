// Pity / rate rules per banner. Values marked verified:true come from the game's own English strings
// (Lottery namespace in en_Game.locres, "SubText" rule texts); see `source`. Edit here or in the Import & data page.
//
// SSR rate model (soft pity), copied from the data behind the gacha.gg Monster Hunter Outlanders
// summon calculator: base 0.6%; from pull `softPityStart` (counted since the last SSR, 1 = first pull)
// every pull adds `softPityStep` percentage points on top of the base; pull `ssrPity` is always an SSR.
// NOTE: the calculator uses 73, not 75. Not confirmed by game text (softPityVerified:false).
const SOFT = { softPityStart: 73, softPityStep: 4.27, softPityVerified: false };

export const BANNERS = {
  Beginner: { ssrPity: 50, srPity: 10, verified: true, source: 'game text', note: 'Max 50 recruits, SSR Adventurer guaranteed within 50, SR within every 10 (game text). Flat 0.6% SSR rate, no soft pity.' },
  Standard: { ssrPity: 90, srPity: 10, selectorAt: 300, verified: true, source: 'game text', ...SOFT, note: 'SSR guaranteed within 90, SR within every 10. Also: two SSR Buddies in a row -> next SSR is an Adventurer; free pick after 300 recruits (game text).' },
  Featured: { ssrPity: 90, srPity: 10, featuredPity: 120, verified: true, source: 'game text', ...SOFT, note: 'SSR within 90 (carries over between Featured banners); 50% featured, else next SSR is featured; featured guaranteed within 120 per banner period (game text). The 120 count is tracked per banner period from src/data/banners.json (every pull in the period counts).' },
  Rotating: { ssrPity: 90, srPity: 10, featuredPity: 120, verified: true, source: 'game text', ...SOFT, note: 'SSR pity 90 / SR 10 confirmed by the maintainer\'s own testing (not in the game text). 120-pull featured guarantee per banner period as described by the user.' },
};
export const BANNER_NAMES = Object.keys(BANNERS);

// Banner names the OCR can still recognise but that are no longer offered in the menu or in the rules list.
// Pulls stored under these names are kept; they show up as a card only when pulls exist, with GENERIC_RULES.
export const LEGACY_NAMES = ['Festival', 'Limited-Time', 'Targeted', 'Standard Buddy'];
export const GENERIC_RULES = { ssrPity: 90, srPity: 10, verified: false, source: 'assumed', note: 'Unsupported banner type: generic 90/10 rules assumed, no soft-pity model.' };

// display order of banner cards / menu entries
export const BANNER_ORDER = ['Featured', 'Rotating', 'Standard', 'Beginner', ...LEGACY_NAMES];
export const BASE_RATES = { SSR: 0.6, SR: 9.4, R: 90 };
