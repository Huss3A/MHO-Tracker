# MH Outlanders Recruit Tracker - project context

Static, browser-only pull tracker for Monster Hunter Outlanders (Tencent/Garena, Android). Users upload
screenshots of Recruit > Overview > Recruitment History; OCR runs in the browser; data lives in IndexedDB and
optionally the user's own Google Drive (hidden appData file). **No backend, nothing uploaded, nothing stored
server-side. Never contact or replay anything against game servers** (traffic is encrypted TGCP, ruled out).

## Commands
- `npm run dev` - Vite dev server (runs `prepare-assets` first; serves `tests/samples` at `/__samples/`)
- `npm test` - node tests for merge + pity (`scripts/test-merge.mjs`)
- `npm run build` - static site to `docs/` (GitHub Pages: branch main, folder /docs). `docs/` is committed.
- `scripts/gen_names.py <dir with locres.py> <en_Game.locres>` regenerates `src/data/names.json`

## Layout
- `src/lib/layout.js` - finds the tan header bar by colour, maps reference coords (2000x923 frame) to any resolution
- `src/lib/ocr.js` - tesseract worker (self-hosted in `public/tess`), per-cell OCR, `extractScreenshot()`
- `src/lib/imageio.js`, `rarity.js` (name colour -> R/SR/SSR), `names.js` (snap to game names)
- `src/lib/merge.js` - position-aware dedupe (identity = ordered rows within a banner+time group; page numbers prove adjacency)
- `src/lib/pity.js`, `src/data/rules.js` (per-banner rules, `verified` flag), `store.js` (IndexedDB), `drive.js` (GIS + Drive REST)
- `src/data/banners.json` + `src/lib/banners.js` - banner schedule (edit JSON when new banners are announced), period lookup, per-period 120-pull count, countdowns
- `src/main.js` UI (vanilla, template strings); `src/config.js` OAuth client ID (`VITE_GOOGLE_CLIENT_ID`)

## Gotchas
- Browser tests: only ONE tesseract worker per page - a second worker in the same page hangs. The app uses one.
- The Browser pane is often "hidden" and throttled, so OCR looks slow in tests; poll results instead of long sleeps.
- Import `Tesseract from 'tesseract.js'` (default import); named `createWorker` import is undefined under Vite.
- OCR crops: upscale to ~140px high, grayscale + 1/99 percentile stretch, PSM 7; time column whitelist `0123456789/: `.
- Row valid only if time matches `^\d{4}/\d\d/\d\d \d\d:\d\d:\d\d$`; empty rows are skipped silently, unreadable-with-text rows are reported.

## Status / open items
See `NOTES.md` (assumptions, test status, todo).
