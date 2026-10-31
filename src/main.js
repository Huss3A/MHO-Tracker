import './style.css';
import { createOcr, extractScreenshot } from './lib/ocr.js';
import { mergeChunk, mergePulls, sortDisplay } from './lib/merge.js';
import { analyse, summarise } from './lib/pity.js';
import { loadState, saveState, exportJson, parseImport } from './lib/store.js';
import * as drive from './lib/drive.js';
import { BANNER_NAMES, BANNERS } from './data/rules.js';
import { CONFIG } from './config.js';
import bannersJson from './data/banners.json';
import { loadSchedule, stateOf, periodStats, fmtCountdown, pullMs, fiftyFifty } from './lib/banners.js';

const SCHEDULE = loadSchedule(bannersJson);
const fmtDate = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let state, tab = 'import', menuOpen = false, filter = 'SSR', period = '', banner = null, results = [], busy = '', log = '', ocr = null;

const clientId = () => state.settings.clientId || CONFIG.GOOGLE_CLIENT_ID;
const save = () => saveState(state);
const presentBanners = () => BANNER_NAMES.filter((b) => state.pulls.some((p) => p.banner === b))
  .concat([...new Set(state.pulls.map((p) => p.banner))].filter((b) => !BANNER_NAMES.includes(b)));

async function getOcr() { return (ocr ||= await createOcr()); }

async function processFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(f.name));
  if (!imgs.length) return;
  busy = 'Loading OCR engine (runs in your browser)...'; render();
  const o = await getOcr();
  for (let i = 0; i < imgs.length; i++) {
    busy = `Reading screenshot ${i + 1}/${imgs.length}: ${imgs[i].name}`; render();
    try { results.push(await extractScreenshot(imgs[i], o)); }
    catch (e) { results.push({ fileName: imgs[i].name, status: 'failed', warnings: ['Error: ' + e.message], rows: [] }); }
  }
  busy = ''; render();
}

function commit() {
  let added = 0, conflicts = 0, skipped = 0;
  const kept = [];
  for (const r of results) {
    if (r.status === 'failed' || !r.rows.length || !r.banner) { skipped++; kept.push(r); continue; }
    const res = mergeChunk(state.pulls, r.banner, r.page, r.rows);
    state.pulls = res.pulls; added += res.added; conflicts += res.conflicts;
  }
  results = kept;
  log = `Added ${added} new pull(s).` + (conflicts ? ` ${conflicts} group(s) overlapped inconsistently - check the History tab.` : '') + (skipped ? ` ${skipped} screenshot(s) skipped (failed).` : '');
  save(); banner = banner || presentBanners()[0]; tab = added ? 'history' : tab; render();
}

const viewImport = () => `
<div class="card">
  <div class="drop" id="drop"><b>Drop screenshots here</b> or <button id="pick">choose files</button>
    <input id="file" type="file" accept="image/*" multiple hidden>
    <div class="note" style="margin-top:8px">Game: Recruit &gt; Overview &gt; Recruitment History. One screenshot per table page; several at once is fine.<br>
    Images are read on this device only - they are never uploaded anywhere.</div></div>
  ${busy ? `<p class="log">${esc(busy)}</p>` : ''}${log ? `<p class="log ok">${esc(log)}</p>` : ''}
</div>
${results.map((r, i) => `
<div class="card">
  <div class="row"><b class="grow">${esc(r.fileName)}</b>
    <span class="badge ${r.status === 'ok' ? 'ok' : r.status === 'review' ? 'warn' : 'bad'}">${r.status === 'ok' ? 'confident' : r.status === 'review' ? 'please review' : 'failed'}</span></div>
  ${r.status !== 'failed' ? `<div class="row" style="margin:8px 0">
    <label>Banner <select data-b="${i}">${[...new Set([r.banner, ...BANNER_NAMES])].map((b) => `<option ${b === r.banner ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
    <span class="note">page ${r.page ?? '?'} &middot; ${r.layout?.size} &middot; scale ${r.layout?.scale}</span></div>
  <div class="scroll"><table><tr><th>#</th><th>Type</th><th>Name</th><th>Rarity</th><th>Time (UTC+3)</th></tr>
  ${r.rows.map((w, j) => `<tr><td>${w.row + 1}</td><td>${esc(w.type)}</td>
    <td><input class="cell ${w.flags.includes('name') ? 'warn' : ''}" data-n="${i}:${j}" value="${esc(w.name)}">${w.suggestion ? `<div class="note">OCR: ${esc(w.nameRaw)} &rarr; ${esc(w.suggestion)}?</div>` : ''}</td>
    <td><select data-r="${i}:${j}">${['SSR', 'SR', 'R'].map((x) => `<option ${x === w.rarity ? 'selected' : ''}>${x}</option>`).join('')}</select>${w.flags.includes('rarity') ? ' <span class="warn">?</span>' : ''}</td>
    <td>${esc(w.time)}</td></tr>`).join('')}</table></div>` : ''}
  ${r.warnings.length ? `<ul class="warns warn">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
</div>`).join('')}
${results.some((r) => r.status !== 'failed') ? `<div class="row"><button class="primary" id="commit">Add to my table</button><button id="clear-res">Discard</button></div>` : ''}`;

const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></div>`;

const tile = (title, sub, n, cls = '') => `<div class="tile"><div><div>${title}</div><div class="note">${sub}</div></div><b class="n ${cls}">${n}</b></div>`;

/** 120-pull featured guarantee tile for one banner period (every pull in the period counts) */
function periodTile(b) {
  const now = Date.now(), st = periodStats(state.pulls, b, state.settings.rules), live = stateOf(b, now) === 'live';
  const sub = st.gotFeatured ? `<span class="ok">${esc(b.name)} obtained at pull ${st.featuredAt}</span>`
    : st.guaranteeReached ? `<span class="warn">${st.limit} reached, no ${esc(b.name)} recorded</span>`
    : `${esc(b.name)} guaranteed at ${st.limit}` + (live ? ` &middot; ends in <span data-countdown="${b.endMs}">${fmtCountdown(b.endMs - now)}</span>` : '');
  return tile(`${esc(b.name)} banner`, sub, st.count, st.gotFeatured ? 'ok' : 'SSR') + bar(st.count, st.limit);
}

function viewBanners() {
  const now = Date.now();
  const order = { live: 0, upcoming: 1, ended: 2 };
  const list = SCHEDULE.slice().sort((a, b) => order[stateOf(a, now)] - order[stateOf(b, now)] || a.startMs - b.startMs);
  return `<div class="card"><h2>Banner schedule</h2>
  <p class="note">From <code>src/data/banners.json</code> (server time UTC+3, shown in your local time). Counting follows the banner period: every pull on that banner type made while it runs counts toward its ${120}-pull guarantee.</p></div>
  ${list.map((b) => {
    const s = stateOf(b, now), st = b.type ? periodStats(state.pulls, b, state.settings.rules) : null;
    return `<div class="card"><div class="row"><b class="grow">${esc(b.name)}</b>
      <span class="badge ${s === 'live' ? 'ok' : s === 'upcoming' ? 'warn' : ''}">${s === 'live' ? 'live' : s === 'upcoming' ? 'upcoming' : 'ended'}</span>
      <span class="note">${esc(b.type || 'type not set yet')}</span></div>
    <div class="note">${fmtDate(b.startMs)} &rarr; ${fmtDate(b.endMs)}</div>
    ${s !== 'ended' ? `<div style="font-size:1.2em;margin:6px 0">${s === 'live' ? 'Ends in' : 'Starts in'} <b data-countdown="${s === 'live' ? b.endMs : b.startMs}">${fmtCountdown((s === 'live' ? b.endMs : b.startMs) - now)}</b></div>` : ''}
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
  if (!bs.length) return `<div class="card">No pulls yet. <button class="primary" data-tab="import">Import screenshots</button></div>`;
  return `<div class="grid">${bs.map((b) => {
    const a = analyse(state.pulls.filter((p) => p.banner === b), b, state.settings.rules), rl = a.rules;
    return `<div class="card bcard">
      <div class="row"><h2 class="grow bname">${esc(b)}</h2><button data-open="${esc(b)}">Open record &rarr;</button></div>
      ${sumTable(b, a.list, b)}${chipsOf(a.list, rl.ssrPity)}
      <div class="row pills"><span class="pillstat"><b class="SSR">${a.sinceSSR}</b> / ${rl.ssrPity} SSR pity</span><span class="pillstat"><b class="SR">${a.sinceSR}</b> / ${rl.srPity} SR pity</span>
      ${rl.selectorAt ? `<span class="pillstat"><b>${a.total % rl.selectorAt}</b> / ${rl.selectorAt} selector</span>` : ''}<span class="pillstat">${a.total} pulls</span></div>
    </div>`;
  }).join('')}</div>`;
}

function viewDetail() {
  const bs = presentBanners();
  if (!bs.length) return viewHistory();
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
  const col = (v, max) => (v / max < 0.5 ? 'g' : v / max < 0.8 ? 'o' : 'r');
  const rows = view.filter((p) => !filter || p.rarity === filter);
  const sel300 = rl.selectorAt ? Math.floor(a.total / rl.selectorAt) : 0;
  return `
<div class="card">
  <div class="row"><button data-tab="history">&larr; All banners</button><h2 class="bname" style="margin:0">${esc(banner)}</h2>
    ${periods.length ? `<select id="psel" class="grow"><option value="">All ${esc(banner)} banners</option>${periods.map((x) => `<option value="${x.id}" ${x.id === period ? 'selected' : ''}>${esc(x.name)} &middot; ${esc(x.start)} to ${esc(x.end)}</option>`).join('')}</select>` : ''}</div>
  <div style="height:10px"></div>
  ${tile('Lifetime pulls', `${esc(banner)} banner${sel ? ` &middot; list shows ${esc(sel.name)}` : ''}`, a.total)}
  ${tile('SSR pity', `Guaranteed at ${rl.ssrPity}`, a.sinceSSR, 'SSR')}
  ${tile('SR pity', `Guaranteed at ${rl.srPity}`, a.sinceSR, 'SR')}
  ${rl.selectorAt ? tile('Selector', `Free pick at ${rl.selectorAt} recruits${sel300 ? ` &middot; ${sel300} reached so far` : ''}`, a.total % rl.selectorAt) + bar(a.total % rl.selectorAt, rl.selectorAt) : ''}
  ${rl.featuredPity && per ? periodTile(per) : ''}
  <div class="note">${rl.verified ? 'Rules from the game\'s own text.' : '<span class="warn">Unverified rules (assumed).</span>'} ${esc(rl.note || '')}${rl.selectorAt ? ' Selector counter = total recruits mod ' + rl.selectorAt + ' (assumed).' : ''}</div>
</div>
<div class="card">
  ${sumTable(banner, view, banner)}
  ${chipsOf(view, rl.ssrPity)}
  <div class="note" style="margin-top:6px">Base rates: SSR ${a.base.SSR}% &middot; SR ${a.base.SR}% &middot; R ${a.base.R}%.</div>
</div>
<div class="card">
  <div class="row" style="margin-bottom:8px">${[['SSR', 'SSR'], ['SR', 'SR'], ['R', 'R'], ['', 'All']].map(([k, l]) => `<button data-filter="${k}" class="pill ${k} ${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="scroll"><table class="rec"><tr><th>Name</th><th>Time (UTC+3)</th><th class="r">Pity</th></tr>
  ${rows.map((p) => `<tr><td class="${p.rarity}">${esc(p.name)}<div class="note">${esc(p.type)}${tag(p) ? ' &middot; ' + esc(tag(p)) : ''}</div></td><td class="mono">${esc(p.time)}</td><td class="r">${p.rarity === 'SSR' ? `<b class="pc-${col(p.pity, rl.ssrPity)}">${p.pity}</b>` : p.rarity === 'SR' ? p.srPity : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="note">Nothing here.</td></tr>'}</table></div>
</div>
<button id="del-banner">Delete ${esc(banner)} history</button>`;
}

function viewData() {
  const cid = clientId();
  return `
<div class="card"><h2>Local data</h2>
  <div class="row"><button id="export">Export JSON</button><button id="import">Import JSON</button><input id="jsonfile" type="file" accept=".json,application/json" hidden>
  <button id="wipe">Delete everything</button></div>
  <p class="note">${state.pulls.length} pulls stored in this browser (IndexedDB). Nothing is stored on any server.</p></div>
<div class="card"><h2>Google Drive sync</h2>
  <p class="note">Stores one hidden file (<code>mho-tracker-data.json</code>) in this app's private appData folder of your own Google Drive. The app cannot see any other Drive file. Screenshots are never uploaded.</p>
  <div class="row"><label class="grow">OAuth Client ID <input type="text" id="cid" style="width:100%" placeholder="xxxx.apps.googleusercontent.com" value="${esc(cid)}"></label><button id="savecid">Save</button></div>
  <div class="row" style="margin-top:8px"><button class="primary" id="sync" ${cid ? '' : 'disabled'}>Sync now (merge)</button>
    <button id="push" ${cid ? '' : 'disabled'}>Overwrite Drive with this device</button><button id="pull" ${cid ? '' : 'disabled'}>Overwrite this device with Drive</button></div>
  ${cid ? '' : '<p class="warn note">No Client ID configured yet - see README "Google Drive setup".</p>'}
  ${busy ? `<p class="log">${esc(busy)}</p>` : ''}${log ? `<p class="log">${esc(log)}</p>` : ''}</div>
<div class="card"><h2>Pity rules</h2><div class="scroll"><table><tr><th>Banner</th><th>SSR pity</th><th>SR pity</th><th>Source</th></tr>
${BANNER_NAMES.map((b) => { const r = { ...BANNERS[b], ...(state.settings.rules[b] || {}) }; return `<tr><td>${b}</td>
<td><input class="cell" style="width:70px" data-rule="${b}:ssrPity" value="${r.ssrPity}"></td><td><input class="cell" style="width:70px" data-rule="${b}:srPity" value="${r.srPity}"></td>
<td class="${BANNERS[b].verified ? 'ok' : 'warn'}">${BANNERS[b].verified ? 'game text' : 'assumed'}</td></tr>`; }).join('')}</table></div></div>`;
}

const MENU = [['history', 'Recruit history', '\u{1F4DC}'], ['import', 'Import screenshots', '\u{1F4E5}'], ['banners', 'Banner schedule', '\u{1F5D3}'], ['data', 'Data & sync', '☁']];
const pageTitle = () => (tab === 'detail' ? banner : (MENU.find((m) => m[0] === tab) || MENU[0])[1]);
function setMenu(open) {
  menuOpen = open;
  $('#drawer')?.classList.toggle('open', open);
  $('#scrim')?.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
function render() {
  const view = tab === 'import' ? viewImport() : tab === 'history' ? viewHistory() : tab === 'detail' ? viewDetail() : tab === 'banners' ? viewBanners() : viewData();
  const bs = presentBanners();
  $('#app').innerHTML = `
<div class="topbar">
  ${tab === 'detail' ? `<button class="icon" data-tab="history" aria-label="Back to all banners">&larr;</button>` : `<button class="icon" id="menu" aria-label="Open menu">&#9776;</button>`}
  <div class="ttl grow">${esc(pageTitle())}</div>
  ${tab === 'detail' ? `<button class="icon" id="menu" aria-label="Open menu">&#9776;</button>` : tab !== 'import' ? `<button class="primary" data-tab="import">+ Import</button>` : ''}
</div>
<div class="scrim ${menuOpen ? 'open' : ''}" id="scrim"></div>
<aside class="drawer ${menuOpen ? 'open' : ''}" id="drawer" aria-label="Menu">
  <div class="dhead"><b>MH Outlanders</b><div class="note">Recruit Tracker</div></div>
  ${MENU.map(([k, l, ic]) => `<button class="item ${tab === k ? 'on' : ''}" data-tab="${k}"><span class="ic">${ic}</span>${l}</button>
    ${k === 'history' ? bs.map((b) => `<button class="item sub ${tab === 'detail' && banner === b ? 'on' : ''}" data-open="${esc(b)}">${esc(b)}</button>`).join('') : ''}`).join('')}
  <div class="note dfoot">Screenshots are read on this device only. Nothing is uploaded.</div>
</aside>
<div class="wrap">${view}</div>`;
  wire();
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function runSync(mode) {
  try {
    busy = 'Signing in to Google...'; render();
    await drive.connect(clientId());
    busy = 'Syncing...'; render();
    const res = await drive.sync(state.pulls, mode);
    if (mode !== 'push') { state.pulls = res.pulls; await save(); }
    log = `Done. Drive had ${res.remoteCount}, this device had ${res.localCount}, now ${res.pulls.length} pulls.`;
  } catch (e) { log = 'Sync failed: ' + e.message; }
  busy = ''; render();
}

function wire() {
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; setMenu(false); log = ''; render(); window.scrollTo(0, 0); }));
  $('#menu').onclick = () => setMenu(!menuOpen);
  $('#scrim').onclick = () => setMenu(false);
  document.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { banner = b.dataset.open; period = ''; tab = 'detail'; setMenu(false); render(); window.scrollTo(0, 0); }));
  const psel = $('#psel'); if (psel) psel.onchange = () => { period = psel.value; render(); };
  document.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { filter = b.dataset.filter; render(); }));
  const file = $('#file');
  if (file) {
    $('#pick').onclick = () => file.click();
    file.onchange = () => processFiles(file.files);
    const d = $('#drop');
    d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = (e) => { e.preventDefault(); d.classList.remove('over'); processFiles(e.dataTransfer.files); };
  }
  document.querySelectorAll('[data-b]').forEach((s) => (s.onchange = () => { results[+s.dataset.b].banner = s.value; }));
  document.querySelectorAll('[data-n]').forEach((s) => (s.onchange = () => { const [i, j] = s.dataset.n.split(':'); results[+i].rows[+j].name = s.value.trim(); }));
  document.querySelectorAll('[data-r]').forEach((s) => (s.onchange = () => { const [i, j] = s.dataset.r.split(':'); results[+i].rows[+j].rarity = s.value; }));
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  on('#commit', commit);
  on('#clear-res', () => { results = []; render(); });
  on('#del-banner', () => { if (confirm(`Delete all ${banner} history from this device?`)) { state.pulls = state.pulls.filter((p) => p.banner !== banner); save(); render(); } });
  on('#export', () => download('mho-recruit-history.json', exportJson(state)));
  on('#import', () => $('#jsonfile').click());
  const jf = $('#jsonfile');
  if (jf) jf.onchange = async () => {
    try { const add = parseImport(await jf.files[0].text()); const n = state.pulls.length; state.pulls = mergePulls(state.pulls, add); await save(); log = `Imported. ${state.pulls.length - n} new pull(s).`; }
    catch (e) { log = 'Import failed: ' + e.message; }
    render();
  };
  on('#wipe', () => { if (confirm('Delete ALL local data? (Drive copy is untouched until you sync/overwrite.)')) { state.pulls = []; save(); render(); } });
  on('#savecid', () => { state.settings.clientId = $('#cid').value.trim(); save(); render(); });
  on('#sync', () => runSync('merge'));
  on('#push', () => confirm('Replace the Drive copy with this device\'s data?') && runSync('push'));
  on('#pull', () => confirm('Replace this device\'s data with the Drive copy?') && runSync('pull'));
  document.querySelectorAll('[data-rule]').forEach((i) => (i.onchange = () => {
    const [b, k] = i.dataset.rule.split(':'); const v = parseInt(i.value, 10);
    if (v > 0) { (state.settings.rules[b] ||= {})[k] = v; save(); }
  }));
}

(async () => { state = await loadState(); if (state.pulls.length) tab = 'history'; render(); })();
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) setMenu(false); });
// live countdowns: update text in place so inputs/focus are not disturbed
setInterval(() => document.querySelectorAll('[data-countdown]').forEach((e) => { e.textContent = fmtCountdown(+e.dataset.countdown - Date.now()); }), 1000);
// test hook (used by the in-browser verification, harmless otherwise)
window.__mho = { extract: async (f) => extractScreenshot(f, await getOcr()), get state() { return state; }, mergeChunk };
void sortDisplay;
