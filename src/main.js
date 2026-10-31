import './style.css';
import { createOcr, extractScreenshot } from './lib/ocr.js';
import { mergeChunk, mergePulls } from './lib/merge.js';
import { analyse, summarise } from './lib/pity.js';
import { confirmDialog } from './lib/dialog.js';
import { summarisePulls, overwriteRisk } from './lib/overwrite.js';
import { loadState, saveState, exportJson, parseImport } from './lib/store.js';
import * as drive from './lib/drive.js';
import { BANNER_NAMES, LEGACY_NAMES, BANNER_ORDER, BANNERS } from './data/rules.js';
import { CONFIG } from './config.js';
import bannersJson from './data/banners.json';
import { loadSchedule, stateOf, periodStats, fmtCountdown, pullMs, fiftyFifty } from './lib/banners.js';

const SCHEDULE = loadSchedule(bannersJson);
const fmtDate = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let state, tab = 'import', menuOpen = false, filter = 'SSR', period = '', banner = null, results = [], busy = '', log = '', ocr = null, sbusy = '', slog = '', dlog = '', focusMain = false;

const clientId = () => state.settings.clientId || CONFIG.GOOGLE_CLIENT_ID;
const save = () => saveState(state);
const ALWAYS_SHOWN = ['Featured', 'Rotating', 'Standard'];
const presentBanners = () => {
  const seen = [...new Set([...ALWAYS_SHOWN, ...state.pulls.map((p) => p.banner)])];   // Beginner etc. appear once they have pulls
  const rank = (b) => (BANNER_ORDER.includes(b) ? BANNER_ORDER.indexOf(b) : BANNER_ORDER.length);
  return seen.sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
};

async function getOcr() { return (ocr ||= await createOcr()); }

async function processFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(f.name));
  if (!imgs.length || busy) return;   // one OCR worker only: ignore drops while a batch is running
  busy = 'Loading OCR engine (runs in your browser)...'; render();
  try {
    const o = await getOcr();
    for (let i = 0; i < imgs.length; i++) {
      busy = `Reading screenshot ${i + 1}/${imgs.length}: ${imgs[i].name}`; render();
      try { const res = await extractScreenshot(imgs[i], o); res.imageUrl = URL.createObjectURL(imgs[i]); res.pageMissing = res.page == null; results.push(res); }
      catch (e) { results.push({ fileName: imgs[i].name, status: 'failed', warnings: ['Error: ' + e.message], rows: [] }); }
    }
  } catch (e) { log = 'Could not start the OCR engine: ' + e.message; }
  busy = ''; render();
}

const dropResults = (list) => list.forEach((r) => r.imageUrl && URL.revokeObjectURL(r.imageUrl));
const pendingOf = (r) => (r.status === 'failed' ? 0 : r.rows.filter((w) => w.flags.length && !w.ok).length + (r.pageMissing && !r.pageOk ? 1 : 0));
const pendingAll = () => results.reduce((n, r) => n + pendingOf(r), 0);

function commit() {
  if (pendingAll()) return;
  let added = 0, conflicts = 0, skipped = 0;
  const kept = [];
  for (const r of results) {
    if (r.status === 'failed' || !r.rows.length || !r.banner) { skipped++; kept.push(r); continue; }
    const res = mergeChunk(state.pulls, r.banner, r.page, r.rows);
    dropResults([r]);
    state.pulls = res.pulls; added += res.added; conflicts += res.conflicts;
  }
  results = kept;
  log = `Added ${added} new pull(s).` + (conflicts ? ` ${conflicts} group(s) overlapped inconsistently - check the Recruit history page.` : '') + (skipped ? ` ${skipped} screenshot(s) skipped (failed).` : '');
  save(); banner = banner || presentBanners()[0]; tab = added ? 'history' : tab; render();
}

const viewImport = () => `
<div class="card"><h2>Import screenshots</h2>
  <div class="drop" id="drop"><b>Drop screenshots here</b>, paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>, or <button id="pick">choose files</button>
    <input id="file" type="file" accept="image/*" multiple hidden>
    <div class="note mt">Game: Recruit &gt; Overview &gt; Recruitment History. One screenshot per table page; several at once is fine.<br>
    Images are read on this device only - they are never uploaded anywhere.</div>
    <div class="note mt tip"><b>Tip:</b> to move screenshots faster, mirror your phone or tablet screen to your computer and capture it with your computer's screenshot tool (for example <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>), then paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>.</div></div>
  ${busy ? `<p class="log">${esc(busy)}</p>` : ''}${log ? `<p class="log ok">${esc(log)}</p>` : ''}
</div>
${results.map((r, i) => `
<div class="card">
  <div class="row"><b class="grow">${esc(r.fileName)}</b>
    <span class="badge ${r.status === 'failed' ? 'bad' : pendingOf(r) ? 'warn' : 'ok'}">${r.status === 'failed' ? 'failed' : pendingOf(r) ? `${pendingOf(r)} to confirm` : r.status === 'ok' ? 'confident' : 'all confirmed'}</span></div>
  ${r.status !== 'failed' ? `<div class="row mv">
    <label>Banner <select data-b="${i}">${[...new Set([r.banner, ...BANNER_NAMES, ...LEGACY_NAMES])].map((b) => `<option ${b === r.banner ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
    <label>Page <input type="number" min="1" max="999" class="cell pg ${r.pageMissing && !r.pageOk ? 'warn' : ''}" data-p="${i}" value="${r.page ?? ''}" placeholder="?" aria-label="Page number of this screenshot"></label>
    ${r.pageMissing ? `<button type="button" class="chk${r.pageOk ? ' on' : ''}" data-pc="${i}" aria-pressed="${!!r.pageOk}" aria-label="${r.pageOk ? 'Page confirmed' : 'Confirm page number'} (the page counter could not be read)" title="${r.pageOk ? 'Page confirmed' : 'The page counter was not readable: enter the page, then confirm'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>` : ''}
    ${r.imageUrl ? `<button type="button" data-img="${i}" aria-expanded="${!!r.showImg}">${r.showImg ? 'Hide image' : 'Show image'}</button>` : ''}
    <span class="note">${r.layout?.size} &middot; scale ${r.layout?.scale}</span></div>
  ${r.showImg && r.imageUrl ? `<img class="shot" src="${r.imageUrl}" alt="Screenshot ${esc(r.fileName)} to compare with the table below">` : ''}
  <div class="scroll"><table><tr><th>#</th><th>Type</th><th>Name</th><th>Rarity</th><th>Time (UTC+3)</th><th>Check</th></tr>
  ${r.rows.map((w, j) => `<tr><td>${w.row + 1}</td><td>${esc(w.type)}</td>
    <td><input class="cell ${w.flags.includes('name') ? 'warn' : ''}" data-n="${i}:${j}" aria-label="Name of row ${w.row + 1}" value="${esc(w.name)}">${w.suggestion ? `<div class="note">OCR: ${esc(w.nameRaw)} &rarr; ${esc(w.suggestion)}?</div>` : ''}</td>
    <td><select data-r="${i}:${j}" aria-label="Rarity of row ${w.row + 1}">${['SSR', 'SR', 'R'].map((x) => `<option ${x === w.rarity ? 'selected' : ''}>${x}</option>`).join('')}</select>${w.flags.includes('rarity') ? ' <span class="warn">?</span>' : ''}</td>
    <td>${esc(w.time)}</td>
    <td class="ck">${w.flags.length ? `<button type="button" class="chk${w.ok ? ' on' : ''}" data-c="${i}:${j}" aria-pressed="${!!w.ok}" aria-label="${w.ok ? 'Confirmed' : 'Confirm'} row ${w.row + 1} (${esc(w.flags.join(', '))} needs checking)" title="${w.ok ? 'Confirmed' : 'Click to confirm this row is correct'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>` : ''}</td></tr>`).join('')}</table></div>` : ''}
  ${r.warnings.length ? `<ul class="warns warn">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
</div>`).join('')}
${results.some((r) => r.status !== 'failed') ? `<div class="row mb"><button class="primary" id="commit" ${pendingAll() ? 'disabled' : ''}>Add to my table</button><button id="clear-res">Discard</button>${pendingAll() ? `<span class="note warn">Confirm the ${pendingAll()} flagged item(s) (rows or page) with the checkmark first.</span>` : ''}</div>` : ''}
${viewData()}`;

const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></div>`;

const srow = (title, sub, n, cls = '', extra = '', tip = '') => `<div class="sr"><div class="sline"><div><div>${title}</div><div class="note">${sub}</div></div><span class="nval"><b class="n ${cls}">${n}</b>${tip}</span></div>${extra}</div>`;
const rateTip = (a, rl) => `<button type="button" class="rtip${a.soft ? ' hot' : ''}" style="--p:${Math.min(1, a.sinceSSR / rl.ssrPity).toFixed(2)}" data-tip="Next pull: ${a.nextSSR.toFixed(1)}% SSR${a.soft ? ' (soft pity)' : ''}" aria-label="Next pull SSR chance: ${a.nextSSR.toFixed(1)}%${a.soft ? ', soft pity active' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5 20.5 17.5H3.5z"/></svg></button>`;

/** 120-pull featured guarantee row for one banner period (every pull in the period counts) */
function periodRow(b) {
  const now = Date.now(), st = periodStats(state.pulls, b, state.settings.rules), live = stateOf(b, now) === 'live';
  const sub = st.gotFeatured ? `<span class="ok">${esc(b.name)} obtained at pull ${st.featuredAt}</span>`
    : st.guaranteeReached ? `<span class="warn">${st.limit} reached, no ${esc(b.name)} recorded</span>`
    : `${esc(b.name)} guaranteed at ${st.limit}` + (live ? ` &middot; ends in <span data-countdown="${b.endMs}">${fmtCountdown(b.endMs - now)}</span>` : '');
  return srow(`${esc(b.name)} banner`, sub, st.count, st.gotFeatured ? 'ok' : 'SSR', bar(st.count, st.limit));
}

/** the one box: Pulls total, SSR pity, SR pity (+ selector, + 120 per period) */
function statBox(a, rl, per, totalSub) {
  const sel300 = rl.selectorAt ? Math.floor(a.total / rl.selectorAt) : 0;
  return `<div class="statbox">
  ${srow('Pulls total', totalSub, a.total)}
  ${srow('SSR pity', `Guaranteed at ${rl.ssrPity}`, a.sinceSSR, 'SSR', bar(a.sinceSSR, rl.ssrPity), a.hasModel ? rateTip(a, rl) : '')}
  ${srow('SR pity', `Guaranteed at ${rl.srPity}`, a.sinceSR, 'SR', bar(a.sinceSR, rl.srPity))}
  ${rl.selectorAt ? srow('Selector', `Free pick at ${rl.selectorAt} recruits${sel300 ? ` &middot; ${sel300} reached so far` : ''}`, a.total % rl.selectorAt, '', bar(a.total % rl.selectorAt, rl.selectorAt)) : ''}
  ${rl.featuredPity && per ? periodRow(per) : ''}
</div>`;
}

function viewBanners() {
  const now = Date.now();
  const order = { live: 0, upcoming: 1, ended: 2 };
  const list = SCHEDULE.slice().sort((a, b) => order[stateOf(a, now)] - order[stateOf(b, now)] || a.startMs - b.startMs);
  return `<div class="card"><h2>Banner schedule</h2>
  <p class="note">From <code>src/data/banners.json</code> (server time UTC+3, shown in your local time). Counting follows the banner period: every pull on that banner type made while it runs counts toward its 120-pull guarantee.</p></div>
  ${list.map((b) => {
    const s = stateOf(b, now), st = b.type ? periodStats(state.pulls, b, state.settings.rules) : null;
    return `<div class="card"><div class="row"><b class="grow">${esc(b.name)}</b>
      <span class="badge ${s === 'live' ? 'ok' : s === 'upcoming' ? 'warn' : ''}">${s === 'live' ? 'live' : s === 'upcoming' ? 'upcoming' : 'ended'}</span>
      <span class="note">${esc(b.type || 'type not set yet')}</span></div>
    <div class="note">${fmtDate(b.startMs)} &rarr; ${fmtDate(b.endMs)}</div>
    ${s !== 'ended' ? `<div class="big">${s === 'live' ? 'Ends in' : 'Starts in'} <b data-countdown="${s === 'live' ? b.endMs : b.startMs}">${fmtCountdown((s === 'live' ? b.endMs : b.startMs) - now)}</b></div>` : ''}
    ${st && (s !== 'upcoming') ? `<div>Your pulls: <b>${st.count} / ${st.limit}</b> &middot; ${st.gotFeatured ? `<span class="ok">${esc(b.name)} obtained (pull ${st.featuredAt})</span>` : s === 'live' ? `${st.toGuarantee} to guaranteed ${esc(b.name)}` : `${esc(b.name)} not obtained`}</div>${bar(st.count, st.limit)}` : ''}
    </div>`;
  }).join('')}`;
}

const colOf = (v, max) => (v / max < 0.5 ? 'g' : v / max < 0.8 ? 'o' : 'r');
const pct2 = (x) => x.toFixed(2) + '%', av2 = (x) => (x ? x.toFixed(2) : '-');

/** rarity table (+ Featured 50:50 row) for a list from analyse() */
function sumTable(title, view, bannerType) {
  const sm = summarise(view), ff = fiftyFifty(view, SCHEDULE, bannerType);
  const srow = (label, r, extra = '') => `<tr class="${label}"><td>${label}</td><td>${r.count}</td><td>${pct2(r.pct)}</td><td>${av2(r.avg)}</td></tr>${extra}` +
    (r.types.length > 1 ? r.types.map((t) => `<tr class="${label} sub"><td>&#9492; ${esc(t.type)}</td><td>${t.count}</td><td>${pct2(t.pct)}</td><td>${av2(t.avg)}</td></tr>`).join('') : '');
  const win = ff && (ff.wins + ff.losses) ? `<tr class="SSR sub"><td>&#9492; Win 50:50</td><td>${ff.wins}</td><td>${pct2(ff.pct)}</td><td></td></tr>` : '';
  return `<table class="sum"><tr><th>${esc(title)}</th><th>Total</th><th>Percent</th><th>Pity AVG</th></tr>${srow('SSR', sm.SSR, win)}${srow('SR', sm.SR)}${srow('R', sm.R)}</table>`;
}
const chipsOf = (view, ssrPity) => `<div class="chips">${view.filter((p) => p.rarity === 'SSR').reverse().map((p) => `<span class="chip">${esc(p.name)} <b class="pc-${colOf(p.pity, ssrPity)}">${p.pity}</b></span>`).join('') || '<span class="note">No SSR yet.</span>'}</div>`;

/** overview: one card per banner type (like paimon.moe stats); click the title for the full record */
function viewHistory() {
  const bs = presentBanners();
  const hint = state.pulls.length ? '' : `<div class="card">No pulls yet. <button class="primary" data-tab="import">Import screenshots</button></div>`;
  return `${hint}<div class="grid">${bs.map((b) => {
    const a2 = analyse(state.pulls.filter((p) => p.banner === b), b, state.settings.rules), rl = a2.rules;
    return `<div class="card bcard">
      <div class="row"><h2 class="grow bname">${esc(b)}</h2><button data-open="${esc(b)}">Open record &rarr;</button></div>
      ${statBox(a2, rl, SCHEDULE.find((x) => x.type === b && stateOf(x, Date.now()) === 'live'), `${esc(b)} banner`)}
      ${sumTable(b, a2.list, b)}${chipsOf(a2.list, rl.ssrPity)}
    </div>`;
  }).join('')}</div>`;
}

function viewDetail() {
  const bs = presentBanners();
  if (!bs.includes(banner)) banner = bs[0];
  const a = analyse(state.pulls.filter((p) => p.banner === banner), banner, state.settings.rules);
  const rl = a.rules, now = Date.now();
  const periods = SCHEDULE.filter((b) => b.type === banner);
  if (period && !periods.some((x) => x.id === period)) period = '';
  const sel = periods.find((x) => x.id === period);
  const per = sel || periods.find((x) => stateOf(x, now) === 'live');
  const inSel = (p) => !sel || (pullMs(p.time) >= sel.startMs && pullMs(p.time) < sel.endMs);
  const view = a.list.filter(inSel);
  const tag = (p) => { const x = periods.find((b) => pullMs(p.time) >= b.startMs && pullMs(p.time) < b.endMs); return x ? x.name : ''; };
  const rows = view.filter((p) => !filter || p.rarity === filter);
  return `
<div class="card">
  <div class="row"><button data-tab="history">&larr; All banners</button><h2 class="bname" style="margin:0">${esc(banner)}</h2>
    ${periods.length ? `<select id="psel" class="grow" aria-label="Banner period"><option value="">All ${esc(banner)} banners</option>${periods.map((x) => `<option value="${x.id}" ${x.id === period ? 'selected' : ''}>${esc(x.name)} &middot; ${esc(x.start)} to ${esc(x.end)}</option>`).join('')}</select>` : ''}</div>
  <div class="gap"></div>
  ${statBox(a, rl, per, `${esc(banner)} banner${sel ? ` &middot; list shows ${esc(sel.name)}` : ''}`)}
  <div class="note">${rl.verified ? 'Rules from the game\'s own text.' : '<span class="warn">Unverified rules (assumed).</span>'} ${esc(rl.note || '')}${rl.selectorAt ? ' Selector counter = total recruits mod ' + rl.selectorAt + ' (assumed).' : ''}</div>
</div>
<div class="card">
  ${sumTable(banner, view, banner)}
  ${chipsOf(view, rl.ssrPity)}
  <div class="note mt">Base rates: SSR ${a.base.SSR}% &middot; SR ${a.base.SR}% &middot; R ${a.base.R}%.${a.hasModel ? ` Soft pity: from pull ${rl.softPityStart} without an SSR the chance rises by ${rl.softPityStep} points per pull, 100% at pull ${rl.ssrPity} (rate model taken from the gacha.gg calculator, not confirmed by game text).` : ''}</div>
</div>
<div class="card">
  <div class="row mb">${[['SSR', 'SSR'], ['SR', 'SR'], ['R', 'R'], ['', 'All']].map(([k, l]) => `<button data-filter="${k}" class="pill ${k} ${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="scroll"><table class="rec"><tr><th>Name</th><th>Time (UTC+3)</th><th class="r">Pity</th></tr>
  ${rows.map((p) => `<tr><td class="${esc(p.rarity)}">${esc(p.name)}<div class="note">${esc(p.type)}${tag(p) ? ' &middot; ' + esc(tag(p)) : ''}</div></td><td class="mono">${esc(p.time)}</td><td class="r">${p.rarity === 'SSR' ? `<b class="pc-${colOf(p.pity, rl.ssrPity)}">${p.pity}</b>` : p.rarity === 'SR' ? p.srPity : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="note">Nothing here.</td></tr>'}</table></div>
</div>
<button class="danger" id="del-banner">Delete ${esc(banner)} history</button>`;
}

function viewData() {
  const cid = clientId();
  return `
<div class="card"><h2>Backup: export / import JSON</h2>
  <div class="row"><button id="export">Export JSON</button><button id="jsonimport">Import JSON</button><input id="jsonfile" type="file" accept=".json,application/json" aria-label="JSON file to import" hidden></div>
  <p class="note">${state.pulls.length} pulls stored in this browser (IndexedDB). Nothing is stored on any server. Importing merges, it never removes pulls.</p>
  ${dlog ? `<p class="log" role="status">${esc(dlog)}</p>` : ''}</div>
<div class="card"><h2>Google Drive sync</h2>
  <p class="note">Stores one hidden file (<code>mho-tracker-data.json</code>) in this app's private appData folder of your own Google Drive. The app cannot see any other Drive file. Screenshots are never uploaded. The Google sign-in script only loads when you press a button below.</p>
  ${CONFIG.GOOGLE_CLIENT_ID ? '' : `<div class="row"><label class="grow">OAuth Client ID <input type="text" id="cid" class="cell" placeholder="xxxx.apps.googleusercontent.com" value="${esc(cid)}"></label><button id="savecid">Save</button></div>`}
  <div class="row mt"><button class="primary" id="sync" ${cid && !sbusy ? '' : 'disabled'}>Sync now (merge)</button></div>
  <p class="note mt">Merge combines both sides and loses nothing. The two buttons below replace one side completely and ask you to confirm first:</p>
  <div class="row"><button id="push" ${cid && !sbusy ? '' : 'disabled'}>Overwrite Drive with this device</button><button id="pull" ${cid && !sbusy ? '' : 'disabled'}>Overwrite this device with Drive</button></div>
  ${cid ? '' : '<p class="warn note">No Client ID configured yet - see README "Google Drive setup".</p>'}
  <div role="status">${sbusy ? `<p class="log">${esc(sbusy)}</p>` : ''}${slog ? `<p class="log">${esc(slog)}</p>` : ''}</div></div>
<div class="card"><h2>Pity rules</h2><div class="scroll"><table><tr><th>Banner</th><th>SSR pity</th><th>SR pity</th><th>Source</th></tr>
${BANNER_NAMES.map((b) => { const r = { ...BANNERS[b], ...(state.settings.rules[b] || {}) }; return `<tr><td>${b}</td>
<td><input class="cell narrow" aria-label="${b} SSR pity" inputmode="numeric" data-rule="${b}:ssrPity" value="${r.ssrPity}"></td><td><input class="cell narrow" aria-label="${b} SR pity" inputmode="numeric" data-rule="${b}:srPity" value="${r.srPity}"></td>
<td class="${BANNERS[b].verified ? 'ok' : 'warn'}">${BANNERS[b].source}</td></tr>`; }).join('')}</table></div>
  <p class="note mt">Soft pity (rising SSR chance) is modelled for Featured, Rotating and Standard; see Recruit history &rarr; a banner.</p></div>
<div class="card"><h2>Delete everything</h2>
  <p class="note">Removes all ${state.pulls.length} pulls and settings stored in this browser. The Drive copy is untouched until you sync or overwrite.</p>
  <button class="danger" id="wipe">Delete everything</button></div>`;
}

function viewAbout() {
  const y = new Date().getFullYear();
  return `
<div class="card"><h2>About</h2>
  <p>MH Outlanders Recruit Tracker is a free, unofficial fan tool. It reads your own Recruitment History screenshots on your device and shows your pity counters and statistics. It has no server, no accounts and no tracking.</p>
  <p class="note">Source and issue tracker: a public repository link will be added here when the project is published.</p></div>
<div class="card" id="privacy"><h2>Privacy policy</h2>
  <p><b>Short version:</b> we do not collect your data. There is no server that receives it.</p>
  <ul class="plain">
    <li><b>Screenshots</b> are read by an OCR engine running inside your browser and are never uploaded. They are not stored either; only the recognised rows are.</li>
    <li><b>Google Drive session:</b> after you connect Drive, Google's temporary access token (valid about one hour, limited to this app's hidden Drive file) is kept in this browser's localStorage so a page refresh does not disconnect you. It is removed when you press Disconnect Google or when it expires.</li>
    <li><b>Your pulls and settings</b> are stored in this browser (IndexedDB, with localStorage as a fallback). This is strictly functional storage that the app needs to work. The site sets no cookies and has no analytics, advertising or tracking.</li>
    <li><b>Optional Google Drive sync:</b> if you press a Drive button, the Google sign-in script (accounts.google.com) is loaded and you sign in with Google. The app asks only for the <code>drive.appdata</code> permission and saves one file, <code>mho-tracker-data.json</code>, in its own hidden app data folder in <em>your</em> Drive. It cannot see or change any other file. Google processes that traffic under its own privacy policy. Nothing goes to any server of ours. Before you press a Drive button no request is made to Google.</li>
    <li><b>Fonts and OCR files</b> are served by the same site (self-hosted); no third-party font or script is loaded on page load.</li>
    <li><b>Hosting:</b> the static files come from the site's host (GitHub Pages), which may keep ordinary server logs such as your IP address under its own policy. This app cannot see them.</li>
  </ul>
  <h3>Deleting your data</h3>
  <ul class="plain">
    <li>On this device: <button class="link" data-tab="import">Import &amp; data</button> &rarr; <b>Delete everything</b>, or clear this site's data in your browser settings. Use <b>Export JSON</b> first if you want a copy.</li>
    <li>Drive copy: Google Drive &rarr; Settings &rarr; Manage apps &rarr; this app &rarr; <i>Delete hidden app data</i>, and/or remove the app's access at <a href="https://myaccount.google.com/permissions" rel="noopener noreferrer" target="_blank">myaccount.google.com/permissions</a> (the Disconnect button below also revokes the current session token). Since we hold no copy of your data and have no accounts, there is nothing else to erase on our side.</li>
  </ul>
  <button id="disconnect">Disconnect Google</button> <span class="note" role="status">${drive.isConnected() ? 'A Google session is active.' : 'Not connected (or the 1-hour Google session expired).'}</span></div>
<div class="card"><h2>Terms and disclaimer</h2>
  <p>This tool is provided as is, without warranty of any kind. Counters and statistics come from OCR and from rules that are partly assumed (the app marks which); they can be wrong. You are responsible for your own data and backups; export it regularly. The tool is unofficial and is not affiliated with, endorsed by or sponsored by the publishers or developers of Monster Hunter Outlanders. Use it at your own risk and in line with the game's own terms.</p></div>
<div class="card"><h2>Copyright, trademarks and open source</h2>
  <p>&copy; ${y} the maintainers of this project. Monster Hunter, Monster Hunter Outlanders, and all related names, logos and artwork are trademarks or copyrights of their respective owners and are used here only to identify the game. No game assets are included.</p>
  <ul class="plain"><li><a href="https://github.com/naptha/tesseract.js" rel="noopener noreferrer" target="_blank">tesseract.js</a> (Apache-2.0) and the Tesseract OCR engine and trained data (Apache-2.0), run in your browser.</li>
  <li>Didact Gothic font (SIL Open Font License 1.1), self-hosted.</li>
  <li>Built with Vite (MIT).</li></ul></div>
<div class="card"><h2>Accessibility statement</h2>
  <p>We aim to meet WCAG 2.2 level AA. Checked so far: keyboard-only operation of all views and dialogs, visible focus, page landmarks and a skip link, labelled icon buttons, colour contrast in the light and dark themes (computed from the stylesheet colours), reduced-motion support, and no horizontal scrolling at 375 px width.</p>
  <p><b>Known limitations:</b> not tested with a range of screen readers; the screenshot drop area needs a pointer, but the "choose files" button does the same by keyboard; progress bars are visual (the numbers beside them carry the same information); times use the game's server time (UTC+3).</p>
  <p><b>Feedback:</b> please report problems through the project's issue tracker. The public contact method will be added here when the repository is published.</p></div>`;
}

const MENU = [['history', 'Recruit history', '\u{1F4DC}'], ['import', 'Import & data', '\u{1F4E5}'], ['banners', 'Banner schedule', '\u{1F5D3}'], ['about', 'Privacy & about', 'ℹ']];
const pageTitle = () => (tab === 'detail' ? banner : (MENU.find((m) => m[0] === tab) || MENU[0])[1]);
function setMenu(open) {
  menuOpen = open;
  $('#drawer')?.classList.toggle('open', open);
  $('#scrim')?.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
  $('#menu')?.setAttribute('aria-expanded', String(open));
  if (open) $('#drawer .item.on, #drawer .item')?.focus();
  else if ($('#drawer')?.contains(document.activeElement)) $('#menu')?.focus();
}
function render() {
  const fa = document.activeElement, fk = fa && fa !== document.body ? (fa.id ? '#' + fa.id : fa.dataset?.filter != null ? `[data-filter="${fa.dataset.filter}"]` : '') : '';
  const view = tab === 'import' ? viewImport() : tab === 'history' ? viewHistory() : tab === 'detail' ? viewDetail() : tab === 'banners' ? viewBanners() : viewAbout();
  const bs = presentBanners();
  document.title = `${pageTitle()} - MH Outlanders Recruit Tracker`;
  $('#app').innerHTML = `
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  ${tab === 'detail' ? `<button class="icon" data-tab="history" aria-label="Back to all banners"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4M10 6l-6 6 6 6"/></svg></button>` : `<button class="icon" id="menu" aria-label="Open menu" aria-expanded="${menuOpen}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>`}
  <h1 class="ttl grow">${esc(pageTitle())}</h1>
  ${tab === 'detail' ? `<button class="icon" id="menu" aria-label="Open menu" aria-expanded="${menuOpen}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>` : tab !== 'import' ? `<button class="primary" data-tab="import">+ Import</button>` : ''}
</header>
<div class="scrim ${menuOpen ? 'open' : ''}" id="scrim"></div>
<nav class="drawer ${menuOpen ? 'open' : ''}" id="drawer" aria-label="Menu">
  <div class="dhead"><b>MH Outlanders</b><div class="note">Recruit Tracker</div></div>
  ${MENU.map(([k, l, ic]) => `<button class="item ${tab === k ? 'on' : ''}" data-tab="${k}"${tab === k ? ' aria-current="page"' : ''}><span class="ic" aria-hidden="true">${ic}</span>${l}</button>
    ${k === 'history' ? bs.map((b) => `<button class="item sub ${tab === 'detail' && banner === b ? 'on' : ''}" data-open="${esc(b)}"${tab === 'detail' && banner === b ? ' aria-current="page"' : ''}>${esc(b)}</button>`).join('') : ''}`).join('')}
  <div class="note dfoot">Screenshots are read on this device only. Nothing is uploaded.</div>
</nav>
<main class="wrap" id="main" tabindex="-1">${view}</main>
<footer class="foot"><div class="wrap">&copy; ${new Date().getFullYear()} MH Outlanders Recruit Tracker &middot; Unofficial fan tool, not affiliated with or endorsed by the game's publishers. Game names and trademarks belong to their owners. &middot; <button class="link" data-tab="about">Privacy &amp; about</button></div></footer>`;
  wire();
  if (focusMain) { focusMain = false; $('#main')?.focus({ preventScroll: true }); }
  if (fk) $(fk)?.focus();   // keep keyboard focus across re-renders (filter pills, selects)
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const dt = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown');
const sumHtml = (label, sm, extra = '') => `<li><b>${label}:</b> ${sm.count} pull(s), latest pull ${esc(sm.newest || 'none')} (UTC+3)${extra}</li>`;

/** Confirm a destructive step. `rows` = summary list items, `risk` = overwriteRisk() result or null. */
function confirmDestructive({ title, intro, rows, risk, confirmLabel }) {
  const danger = !!(risk && risk.risk);
  return confirmDialog({
    title: esc(title), confirmLabel, danger: true,
    warning: danger ? `Warning: the data about to be overwritten ${risk.reasons.map(esc).join(' and ')} than what replaces it. You would lose information.` : '',
    html: `<p>${intro}</p><ul class="plain">${rows}</ul><p class="note">This cannot be undone. Cancel keeps everything as it is.</p>`,
  });
}

async function runSync(mode) {
  if (sbusy) return;
  const fail = (e) => { slog = 'Sync failed: ' + e.message; sbusy = ''; render(); };
  try {
    sbusy = 'Signing in to Google...'; slog = ''; render();
    await drive.connect(clientId());
    if (mode !== 'merge') {
      sbusy = 'Reading the Drive copy (nothing is changed yet)...'; render();
      const remote = await drive.peek();
      sbusy = ''; render();
      const local = summarisePulls(state.pulls), push = mode === 'push';
      if (!push && !remote.exists) { slog = 'There is no Drive copy yet, so there is nothing to copy to this device.'; render(); return; }
      const risk = push ? overwriteRisk(local, remote.exists ? remote : null) : overwriteRisk(remote, local);
      const driveExtra = remote.exists ? `, last saved ${esc(dt(remote.savedAt || remote.modifiedTime))}` : ' (no file yet)';
      const ok = await confirmDestructive({
        title: push ? 'Overwrite Drive with this device?' : 'Overwrite this device with Drive?',
        intro: push ? 'The Drive copy will be <b>replaced</b> by the data stored on this device.' : 'The data stored on this device will be <b>replaced</b> by the Drive copy.',
        rows: sumHtml('Drive', remote, driveExtra) + sumHtml('This device', local),
        risk, confirmLabel: push ? 'Overwrite Drive' : 'Overwrite this device',
      });
      if (!ok) { slog = 'Cancelled. Nothing was changed.'; render(); return; }
    }
    sbusy = 'Syncing...'; render();
    const res = await drive.sync(state.pulls, mode);
    // merge: fold in anything added locally (e.g. a screenshot import) while the Drive request was running
    if (mode !== 'push') { state.pulls = mode === 'merge' ? mergePulls(state.pulls, res.pulls) : res.pulls; await save(); }
    slog = `Done. Drive had ${res.remoteCount}, this device had ${res.localCount}, now ${res.pulls.length} pulls.`;
  } catch (e) { return fail(e); }
  sbusy = ''; render();
}

function wire() {
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; setMenu(false); log = ''; focusMain = true; render(); window.scrollTo(0, 0); }));
  $('#menu').onclick = () => setMenu(!menuOpen);
  $('#scrim').onclick = () => setMenu(false);
  document.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { banner = b.dataset.open; period = ''; tab = 'detail'; setMenu(false); focusMain = true; render(); window.scrollTo(0, 0); }));
  const psel = $('#psel'); if (psel) psel.onchange = () => { period = psel.value; render(); };
  document.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { filter = b.dataset.filter; render(); }));
  const file = $('#file');
  if (file) {
    $('#pick').onclick = () => file.click();
    file.onchange = () => { processFiles(file.files); file.value = ''; };
    const d = $('#drop');
    d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = (e) => { e.preventDefault(); d.classList.remove('over'); processFiles(e.dataTransfer.files); };
  }
  document.querySelectorAll('[data-b]').forEach((s) => (s.onchange = () => { results[+s.dataset.b].banner = s.value; }));
  document.querySelectorAll('[data-n]').forEach((s) => (s.onchange = () => { const [i, j] = s.dataset.n.split(':'); results[+i].rows[+j].name = s.value.trim(); }));
  document.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { const [i, j] = b.dataset.c.split(':'); const w = results[+i].rows[+j]; w.ok = !w.ok; render(); }));
  document.querySelectorAll('[data-p]').forEach((b) => (b.onchange = () => { const n = parseInt(b.value, 10); results[+b.dataset.p].page = n > 0 ? n : null; }));
  document.querySelectorAll('[data-pc]').forEach((b) => (b.onclick = () => { const r = results[+b.dataset.pc]; r.pageOk = !r.pageOk; render(); }));
  document.querySelectorAll('[data-img]').forEach((b) => (b.onclick = () => { const r = results[+b.dataset.img]; r.showImg = !r.showImg; render(); }));
  document.querySelectorAll('[data-r]').forEach((s) => (s.onchange = () => { const [i, j] = s.dataset.r.split(':'); results[+i].rows[+j].rarity = s.value; }));
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  on('#commit', commit);
  on('#clear-res', () => { dropResults(results); results = []; render(); });
  on('#del-banner', async () => {
    const mine = state.pulls.filter((p) => p.banner === banner), name = banner;
    const ok = await confirmDestructive({ title: `Delete ${name} history?`, intro: `All ${name} pulls will be removed from this device. Pulls of other banners and the Drive copy are not touched until you sync.`, rows: sumHtml(`${name} on this device`, summarisePulls(mine)), risk: null, confirmLabel: `Delete ${name} history` });
    if (ok) { state.pulls = state.pulls.filter((p) => p.banner !== name); save(); tab = 'history'; render(); window.scrollTo(0, 0); }
  });
  on('#export', () => download('mho-recruit-history.json', exportJson(state)));
  on('#jsonimport', () => $('#jsonfile').click());
  const jf = $('#jsonfile');
  if (jf) jf.onchange = async () => {
    const f = jf.files[0]; jf.value = '';   // reset first so the same file can be picked again after an error
    if (!f) return;
    try { const add = parseImport(await f.text()); const n = state.pulls.length; state.pulls = mergePulls(state.pulls, add); await save(); dlog = `Imported. ${state.pulls.length - n} new pull(s).`; }
    catch (e) { dlog = 'Import failed: ' + e.message; }
    render();
  };
  on('#wipe', async () => {
    const ok = await confirmDestructive({ title: 'Delete everything on this device?', intro: 'All pulls and settings stored in this browser will be removed. The Drive copy is untouched until you sync or overwrite.', rows: sumHtml('This device', summarisePulls(state.pulls)), risk: null, confirmLabel: 'Delete everything' });
    if (ok) { state.pulls = []; state.settings = { clientId: '', rules: {} }; save(); dlog = 'Everything on this device was deleted.'; render(); }
  });
  on('#savecid', () => { state.settings.clientId = $('#cid').value.trim(); save(); render(); });
  on('#sync', () => runSync('merge'));
  on('#push', () => runSync('push'));
  on('#pull', () => runSync('pull'));
  on('#disconnect', () => { drive.disconnect(); render(); });
  document.querySelectorAll('[data-rule]').forEach((i) => (i.onchange = () => {
    const [b, k] = i.dataset.rule.split(':'); const v = parseInt(i.value, 10);
    if (v > 0) { (state.settings.rules[b] ||= {})[k] = v; save(); } else render();   // invalid -> restore the stored value
  }));
}

(async () => { state = await loadState(); if (state.pulls.length) tab = 'history'; render(); })();
// Ctrl+V on the Import page: pasted screenshots go straight to OCR
document.addEventListener('paste', (e) => {
  if (tab !== 'import') return;
  const imgs = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
  if (!imgs.length) return;
  e.preventDefault();
  processFiles(imgs.map((f, i) => (f.name ? f : new File([f], `pasted-${Date.now()}-${i}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }))));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) setMenu(false); });
// live countdowns: update text in place so inputs/focus are not disturbed
setInterval(() => document.querySelectorAll('[data-countdown]').forEach((e) => { e.textContent = fmtCountdown(+e.dataset.countdown - Date.now()); }), 1000);
// test hook (used by the in-browser verification, harmless otherwise)
window.__mho = { extract: async (f) => extractScreenshot(f, await getOcr()), get state() { return state; }, mergeChunk, get results() { return results; }, set results(v) { results = v; render(); } };

