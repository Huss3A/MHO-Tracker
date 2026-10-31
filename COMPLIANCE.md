# Compliance review

Scope: static, browser-only fan tool (GitHub Pages, no backend, no accounts, no cookies, no analytics/ads/payments).
Not legal advice. Nothing here was invented: no company, address, email, phone, tax ID or DPA exists, so none is shown.

## 1. Privacy and data collection
| Item | Status |
|---|---|
| Privacy policy | **Done.** In-app "Privacy & about" page (drawer item + footer link). States what is stored where, the optional Drive file `mho-tracker-data.json` (scope `drive.appdata`, hidden app folder in the user's own Drive), that nothing goes to any server of ours, and how to delete (Delete everything, JSON export, Disconnect Google, myaccount.google.com/permissions, delete hidden app data in Drive). |
| Cookie consent platform (CMP) | **Not required.** No cookies are set (`document.cookie` empty; grep finds no cookie/analytics/ad code). IndexedDB (localStorage as fallback) holds the user's pulls and settings, plus (only after the user connects Drive) Google's short-lived (~1 hour) access token in localStorage, and is strictly functional, which needs no consent under ePrivacy Art. 5(3). Google Identity Services loads only after the user presses a Drive button and is user-initiated. A CMP would become necessary if analytics, ads, embeds or any non-essential storage were added. |
| CPRA/CCPA "Do Not Sell or Share" | **Not applicable.** No personal information is collected, sold or shared by the site. |
| GDPR right to be forgotten protocol | **Not applicable as a protocol** (we hold no data and have no accounts). Users erase their own data via the in-app button, browser site-data clearing and Drive hidden app data removal; documented in the privacy page. |
| DPAs with vendors | **Not applicable.** No processors on our side. GitHub Pages (static hosting) and Google (user-initiated Drive sync) act under their own terms; the user's Drive data is between the user and Google. |

## 2. Legal / ownership
| Item | Status |
|---|---|
| Imprint / Impressum (DACH) | **Not applicable / not fabricated.** Non-commercial hobby tool with no operator identity to publish; a real imprint would need the maintainer's real name and address, which only the owner can supply. Product decision for the owner if the site is promoted in DACH. |
| Terms and conditions | **Done** (short disclaimer in Privacy & about): as-is, unofficial, no affiliation, user responsible for own data. No governing law or legal entity is invented. |
| Copyright / trademark footer, dynamic year, open-source attribution | **Done.** Footer on every page (dynamic year, unofficial notice, link to the page); attribution for tesseract.js/Tesseract (Apache-2.0), Didact Gothic (OFL 1.1), Vite (MIT). Game names/trademarks belong to their owners. |
| UGC / DMCA | **Not applicable.** No user-generated content is hosted or shared with others; screenshots never leave the device. |

## 3. Accessibility (WCAG 2.2 AA)
Applicable and implemented: skip link, landmarks (header/nav/main/footer), `lang="en"`, per-view document title, focus moved to main on navigation, visible focus ring, labelled icon buttons (SVGs `aria-hidden`), accessible confirm dialog (role `alertdialog`, labelled, focus moved in and trapped, Esc cancels, Cancel default, background `inert`), `prefers-reduced-motion`, tap targets >= 40px for buttons (inline text links excepted), no horizontal overflow at 375px (DOM-checked on all 5 views).
Colour contrast: `node scripts/check-contrast.mjs` computes ratios from the CSS variables in both themes (70 pairs: text 4.5:1, focus ring 3:1, includes rarity, pity, pill, warning/danger and link colours). Failures found and fixed: light-theme R, SSR, warn/orange on the stat box. Part of `npm test`.
Accessible media alternatives: **not applicable**, the app contains no audio/video/images (the decorative favicon only).
Accessibility statement: **Done** (Privacy & about). Known limitations: no screen-reader matrix testing, visual-only progress bars (numbers next to them), drag-and-drop needs a pointer (button alternative exists). Reporting channel: the repository has no public remote yet, so the page says the contact method will be added when it is published (**owner decision**).

## 4. Security
| Item | Status |
|---|---|
| HTTPS / TLS 1.2+ | **Provided by the host.** GitHub Pages serves HTTPS with TLS 1.2+; enable "Enforce HTTPS" in repo Pages settings. |
| Content-Security-Policy | **Done** (`<meta http-equiv>` in `index.html`): `default-src 'self'`; scripts self + `wasm-unsafe-eval` (tesseract wasm) + `https://accounts.google.com/gsi/`; `connect-src` self + `https://www.googleapis.com` + `https://accounts.google.com/gsi/`; frames only `https://accounts.google.com/gsi/`; workers self + blob:; images self/data:/blob:; `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`. `style-src` keeps `'unsafe-inline'` because the UI uses inline `style` attributes for bar widths (low risk, no inline scripts). Verified: OCR of `tests/samples/1.webp` still works under the policy with no violations or console errors. A meta CSP cannot set `frame-ancestors`; GitHub Pages cannot send headers. |
| Referrer policy | **Done** (`no-referrer`). |
| Third-party loading | GIS script is injected only on the first Drive button press (verified: no `accounts.google.com` script in the DOM on load). |
| PCI-DSS | **Not applicable.** No payments or card data. |
| Vulnerability / patch management | Dependencies: tesseract.js and Vite only. `npm audit` on 2026-10-31: **0 vulnerabilities**. Re-run `npm audit` and update before each release. |
| Not verified | The real Google sign-in and Drive calls (overwrite confirm flow, CSP with the live GIS popup) were not exercised against live Google; test once with a real client ID. |

## 5. Consumer protection (e-commerce)
Refund policy, true pricing, Omnibus price history, auto-renewal disclaimers: **not applicable.** The tool is free and sells nothing; there are no prices, subscriptions or payments.

## Open decisions for the owner
- Public repo URL / contact method for accessibility and privacy questions (currently a stated placeholder-free sentence).
- Whether to name a copyright holder; the footer says "the maintainers of this project".
- Imprint if the site is operated commercially or promoted in DACH.
