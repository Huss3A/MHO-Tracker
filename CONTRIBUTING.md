# Contributing

Contributions are welcome: bug reports, banner updates, OCR fixes for other screen sizes, translations, UI polish, docs.
This is an unofficial fan tool for Monster Hunter Outlanders and is not affiliated with the game's publishers.

## Ground rules
- **Browser only.** No backend, no accounts, no analytics. Screenshots are read on the user's device and never uploaded.
- **Never contact, replay or scrape the game's servers.** Pull data comes only from the user's own Recruitment History screenshots.
- **No secrets and no personal data in commits.** Do not commit your own game screenshots (they can show your player UID); `tests/samples/` is gitignored for that reason. If you want to share a screenshot for a bug, crop out the UID and attach it to the issue.
- Be kind and constructive in issues and pull requests.

## Good first contributions
- **New or changed banners:** edit [`src/data/banners.json`](src/data/banners.json) (name, type, start/end dates in server time UTC+3; the daily reset is 05:00). Mention where the dates come from.
- **OCR on a new resolution or device:** open an issue with a (cropped) Recruitment History screenshot and the size. Layout code is in `src/lib/layout.js` and `src/lib/ocr.js`.
- **Rule corrections:** pity, soft pity and guarantee values live in `src/data/rules.js` with a `verified` flag and a source note. Say how you confirmed a change (game text or your own testing).

## Development
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # merge, pity, schedule, rarity and contrast checks
npm run build    # static site into docs/ (GitHub Pages serves main /docs)
```
Optional Google Drive sync needs your own OAuth client ID in `.env.local` (`VITE_GOOGLE_CLIENT_ID=...`, see `.env.example` and the README). Do not commit `.env.local`.

## Pull requests
1. Fork, create a branch, and keep the change focused.
2. Match the surrounding code style (vanilla JS, template-string UI, small helpers).
3. Add or update tests in `scripts/test-merge.mjs` for logic changes, and run `npm test`.
4. Run `npm run build` and include the regenerated `docs/` only if your change affects the shipped site.
5. Check the UI at phone width (375px) and with the keyboard; keep contrast passing in both light and dark themes.
6. Describe what changed and how you tested it. Screenshots of UI changes are appreciated.

## Reporting problems
Open an issue with what you expected, what happened, the browser/device, and (if it is about OCR) a cropped screenshot with the player UID removed.
For security problems, please do not post details publicly; use GitHub's private vulnerability reporting on the repository if it is enabled, or open an issue asking for a private contact.
