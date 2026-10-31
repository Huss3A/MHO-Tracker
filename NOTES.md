# Notes: status, assumptions, TODO

## Verified (real browser, dev + production build)
- 4 samples (`tests/samples`, expected `extract.json`): 20/20 rows identical. Same after synthetic rescale 0.6x, 0.75x, 0.85x, 1.4x and side bars.
- Low resolution => rarity/page/time sometimes flagged "please review" (by design, not guessed).
- Merge: re-upload idempotent, genuine duplicate rows kept, page1+page2 of a 10-pull adjacent (`npm test` + UI).

## Not tested yet
- Google Drive sync (no OAuth client ID yet) - see README "Google Drive setup".
- Real screenshots from other phones/aspect ratios; page 2+; multi-digit page numbers.
- Banners other than Beginner/Standard/Featured/Rotating; adventurer/buddy names not in the generated list.
- Mobile layout visually (UI only exercised via DOM text, screenshots timed out in the hidden pane).

## Game rules found (en_Game.locres, Lottery SubText2) - source of `src/data/rules.js`
- Standard: SSR within 90, SR every 10; two SSR Buddies in a row -> next SSR is an Adventurer; free pick after 300.
- Featured: SSR within 90 (carries across Featured), 50% featured else next SSR featured, featured within 120 per period.
- Beginner: SSR Adventurer within 50 (max 50 recruits), SR every 10. Buddy banners: SSR 90, SR 10.
- Rates SSR 0.6 / SR 9.4 / R 90. Rotating/Festival/Limited-Time/Targeted/Standard Buddy: **assumed** 90/10.
- Record table: last 6 months or 1000 recruits, times in server time UTC+3.

## Assumptions to confirm with the user
1. Gold name = SSR, purple = SR, blue = R (only one SSR sample).
2. Inside a same-timestamp 10-pull, table order = newest first (affects pity positions).
3. SSR also resets the SR counter.

## UI (paimon.moe-style)
- Hamburger menu: Recruit history / Import / Banner schedule / Data & sync. History is the default once pulls exist.
- History: banner dropdown + banner-period dropdown (e.g. Midori), tiles (lifetime, SSR/SR pity, Standard 300 selector, 120 per period), rarity table with type split, SSR chips, filterable record list.
- Standard 300 selector counter = total recruits mod 300 (ASSUMED; how the game resets it is unknown). Not yet visually checked (pane screenshots time out); only DOM text verified.

- History is now an overview of one card per banner (rarity table, Win 50:50 row for Featured, SSR chips with pity, counters); "Open record" opens the detail view (period dropdown, tiles, filterable list).
- Win 50:50 (Featured only) is derived from banners.json periods; assumes the guarantee carries across Featured banners and ignores SSRs outside scheduled periods (ASSUMED).

- Navigation: sticky top bar (menu button, page title, + Import; back arrow on a banner record) and a slide-in side drawer (history with banner shortcuts, import, banner schedule, data & sync). Closes on item tap, backdrop tap, Esc. Verified by DOM behaviour only (no visual check).

- Banner cards: ONE box (Pulls total, SSR pity, SR pity, +selector on Standard, +120 count on Featured/Rotating) with the rates table + SSR chips directly below it (no dropdown). Record view uses the same box.

## TODO / ideas
- Get real samples (other resolution, page 2) and add them to `tests/samples` + a regression script.
- Banner schedule DONE (`src/data/banners.json`, Banners tab, per-period 120 count). Still open: 50/50 state; confirm Freya's banner type and exact start/end times (daily reset assumed 05:00 UTC+3 per the user; a banner runs from 05:00 on the start date to 05:00 after the end date); confirm Rotating also has the 120 guarantee (user-stated, not in game text).
- Standard banner: "two SSR Buddies in a row" and 300-pull pick indicators.
- Unit test for `layout.js` / OCR in headless browser (needs single-worker harness).
- Optional: PWA/offline, delete single pull, edit pull after import.
