# Monster Hunter Outlanders - Recruit Tracker

A static, browser-only wish/pull tracker for **Monster Hunter Outlanders**. Upload screenshots of
*Recruit > Overview > Recruitment History*; the app reads them with OCR **inside your browser**,
keeps the pulls in a local table (IndexedDB), shows per-banner history, pity counters and rates, and
can sync the data as one JSON file to **your own** Google Drive.

**Privacy:** screenshots are decoded and OCR'd locally (tesseract.js, WebAssembly, served from this
site's own files - no CDN). Images are never uploaded or stored anywhere. There is no backend.
The only network traffic is the optional Google sign-in / Drive call you trigger yourself.

## Why screenshots?
The game's network traffic is encrypted (per-session key), so there is no URL/API to read history
from. OCR of the in-game table is the practical route.

## Use
1. Open the app, go to **Import & data**, drop one or more screenshots (one per table page).
2. Check anything flagged *please review* (unknown banner, low-confidence name/rarity, unreadable row);
   fix it in the preview table, then **Add to my table**.
3. **Recruit history** shows per-banner list, pity bars, the SSR chance of your next pull (soft pity marked), rates vs base rates.
   **Import & data** is one page: screenshot import, JSON export/import, Drive sync, pity rules, delete everything.
   **Privacy & about** has the privacy policy, terms, attribution and accessibility statement.

Re-uploading the same screenshot is safe: rows are merged by *position within a (banner, time) group*,
so genuine duplicates (two "Horn" in one 10-pull) are kept while overlapping screenshots are not
double counted. Pages 1 and 2 of one 10-pull are recognised as adjacent (not overlapping) via the
page number.

## Develop / build
```bash
npm install
npm run dev        # http://localhost:5173 (copies OCR assets to public/tess first)
npm test           # merge + pity unit tests
npm run build      # static site -> docs/
```
`public/tess/eng.traineddata` (tessdata, Apache-2.0) is committed so OCR needs no CDN; the worker and
WASM core are copied from `node_modules` by `scripts/copy-tess.mjs`.

## Deploy to GitHub Pages
1. Create a GitHub repo, push this folder (including `docs/`, produced by `npm run build`).
2. Repo **Settings > Pages > Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/docs`.
3. The site appears at `https://<user>.github.io/<repo>/` (the build uses relative paths, any sub-path works).
4. After changes: `npm run build`, commit `docs/`, push.

## Google Drive setup (one-time, you create the OAuth client yourself)
The app uses Google Identity Services with the hidden `drive.appdata` scope: it can only see its own
private file (`mho-tracker-data.json`) - nothing else in your Drive. A Client ID is a public value, not a secret.

1. Go to <https://console.cloud.google.com/> and create a project (e.g. "mho-tracker").
2. **APIs & Services > Library**: enable **Google Drive API**.
3. **APIs & Services > OAuth consent screen** (Google Auth Platform): User type *External*, fill the app name and
   your email. Under **Data access / Scopes** add `.../auth/drive.appdata`. Under **Audience** leave it in *Testing* and add
   your Google account as a **test user** (this avoids Google's verification process for personal use).
4. **Credentials > Create credentials > OAuth client ID**, type **Web application**.
   - **Authorized JavaScript origins**: `https://<user>.github.io` (no path, no trailing slash) and, for local testing, `http://localhost:5173`.
   - No redirect URI is needed (token flow).
5. Copy the Client ID (`1234-abc.apps.googleusercontent.com`) and either
   - paste it in the app under **Import & data > Google Drive sync > OAuth Client ID** (stored in your browser only), or
   - bake it in: set `VITE_GOOGLE_CLIENT_ID` when building (`VITE_GOOGLE_CLIENT_ID=... npm run build`), or edit `src/config.js`.
6. **Import & data > Sync now**. First time Google shows the consent screen ("unverified app" is expected in Testing mode).
   Sync *merges* Drive and local data; the two "overwrite" buttons first read the other side (read-only), show both summaries (pulls, newest pull, Drive `savedAt`) in a confirm dialog and warn in red when you would lose pulls (the overwritten side has more pulls or a newer latest pull). Cancel is the default.

> Status: sign-in and sync were tested by the maintainer against a real Google account (Testing mode, test user). Google's access token (about 1 hour, scope `drive.appdata`) is cached in `localStorage` so a page refresh does not disconnect; it is cleared on Disconnect, on expiry, or when Drive answers 401. Export JSON contains pulls only (not the pity-rule overrides or client ID).

## Banner schedule and 120-pull guarantee
`src/data/banners.json` lists each banner (name, type, start date, end date, server time UTC+3). A banner runs from the daily reset (05:00 server time, `resetHour` in the JSON) on
its start date until the reset after its end date. The **Banners** tab shows live/upcoming banners with countdowns and your progress;
every pull on that banner type made inside the period counts toward the 120-pull guarantee of that banner, regardless of
the pull results. To add a banner, append an entry to the JSON and rebuild (`npm run build`).

## Pity rules
`src/data/rules.js`. Values from the game's own English strings (`Lottery` namespace of `en_Game.locres`):

| Banner | SSR guaranteed | SR guaranteed | Notes |
|---|---|---|---|
| Beginner | 50 | every 10 | max 50 recruits |
| Standard | 90 | every 10 | two SSR Buddies in a row -> next SSR is an Adventurer; free pick after 300 |
| Featured | 90 (carries over) | every 10 | 50% featured, else next SSR is featured; featured guaranteed within 120 per banner period |
| Rotating | 90 | every 10 | game text; 120-pull featured guarantee per banner period |

Festival, Limited-Time, Targeted and Standard Buddy are no longer offered in the menu or the rules list. Existing pulls under those names are kept and still show as a card (generic 90/10, no soft pity); the OCR still recognises the names.

**Soft pity** (Featured, Rotating, Standard): base SSR 0.6%; from the 73rd pull without an SSR every pull adds 4.27 percentage points; the 90th is always an SSR. This is the model used by the gacha.gg summon calculator (not confirmed by game text; the calculator uses 73, not 75). The stat box shows "Next pull: x%" and a Soft pity tag. Beginner stays flat 0.6% up to its 50-pull guarantee.

Base rates: SSR 0.6%, SR 9.4%, R 90%. The 120-pull featured guarantee is tracked per banner period from `src/data/banners.json`.

## Assumptions to verify
- **Rarity from name colour**: gold = SSR, purple = SR, blue = R (from the game's `<Legendary>SSR` / `<Epic>SR` tags;
  only one SSR sample existed). Wrong guesses are fixable in the preview before importing.
- Inside a same-timestamp 10-pull, table order is treated as newest-first when computing pity positions.
- An SSR also resets the SR counter (assumed).
- Times are the game's server time (UTC+3) and are stored as shown.

## Layout / resolution handling
No fixed pixel coordinates: the app finds the tan table header bar by colour, derives scale and offset from it
and places every crop relative to it. Validated on the 4 sample screenshots (2000x923) and on synthetic rescales
(0.75x, 1.4x, side bars). Real screenshots from other phones are still welcome for testing; anything uncertain is
reported in the review step rather than guessed.

## Names
`src/data/names.json` is generated from the game's English localization (`scripts/gen_names.py`); OCR text is snapped
to it. Unknown names are kept as read and flagged.

## Contributing
Contributions are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).

> Drive sync is currently **switched off** in the shipped site (notice at the top of Import & data) until Google approves the app. To use it while developing, add `VITE_DRIVE_ENABLED=true` to `.env.local`.
