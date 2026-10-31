import './style.css';
import { createOcr, extractScreenshot } from './lib/ocr.js';
import { mergeChunk, mergePulls, sortDisplay } from './lib/merge.js';
import { analyse } from './lib/pity.js';
import { loadState, saveState, exportJson, parseImport } from './lib/store.js';
import * as drive from './lib/drive.js';
import { BANNER_NAMES, BANNERS } from './data/rules.js';
import { CONFIG } from './config.js';
import bannersJson from './data/banners.json';
import { loadSchedule, stateOf, periodStats, fmtCountdown } from './lib/banners.js';

const SCHEDULE = loadSchedule(bannersJson);
const fmtDate = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let state, tab = 'import', banner = null, results = [], busy = '', log = '', ocr = null;

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

/** 120-pull featured guarantee for the live banner of the selected type (all pulls in the period count) */
function periodCard() {
  const now = Date.now();
  const b = SCHEDULE.find((x) => x.type === banner && stateOf(x, now) === 'live');
  if (!b) return '';
  const st = periodStats(state.pulls, b, state.settings.rules);
  return `<h2>${esc(b.name)} banner: ${st.count} / ${st.limit}</h2>${bar(st.count, st.limit)}
  <div class="note">${st.gotFeatured ? `<span class="ok">${esc(b.name)} obtained at pull ${st.featuredAt} of this banner.</span>`
    : st.guaranteeReached ? `<span class="warn">${st.limit} pulls reached but no ${esc(b.name)} recorded - maybe obtained outside the table or an OCR name error.</span>`
    : `${esc(b.name)} guaranteed in ${st.toGuarantee} more pull(s) (every pull on this banner counts, whatever its result). Ends in <b data-countdown="${b.endMs}">${fmtCountdown(b.endMs - now)}</b>.`}</div>`;
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

function viewHistory() {
  const bs = presentBanners();
  if (!bs.length) return '<div class="card">No pulls yet - import a screenshot first.</div>';
  if (!bs.includes(banner)) banner = bs[0];
  const a = analyse(state.pulls.filter((p) => p.banner === banner), banner, state.settings.rules);
  const rl = a.rules;
  return `
<nav>${bs.map((b) => `<button data-banner="${esc(b)}" class="${b === banner ? 'on' : ''}">${esc(b)} (${state.pulls.filter((p) => p.banner === b).length})</button>`).join('')}</nav>
<div class="card">
  <div class="stats">
    <div class="stat"><b>${a.total}</b><span>total recruits</span></div>
    <div class="stat"><b class="SSR">${a.cnt.SSR}</b><span>SSR &middot; ${a.rate('SSR').toFixed(2)}% (base ${a.base.SSR}%)</span></div>
    <div class="stat"><b class="SR">${a.cnt.SR}</b><span>SR &middot; ${a.rate('SR').toFixed(2)}% (base ${a.base.SR}%)</span></div>
    <div class="stat"><b class="R">${a.cnt.R}</b><span>R &middot; ${a.rate('R').toFixed(2)}% (base ${a.base.R}%)</span></div>
    <div class="stat"><b>${a.avgSSRPity ? a.avgSSRPity.toFixed(1) : '-'}</b><span>avg pulls per SSR</span></div>
  </div>
  <h2 style="margin-top:14px">SSR pity: ${a.sinceSSR} / ${rl.ssrPity}</h2>${bar(a.sinceSSR, rl.ssrPity)}
  <h2>SR pity: ${a.sinceSR} / ${rl.srPity}</h2>${bar(a.sinceSR, rl.srPity)}
  ${periodCard()}
  <div class="note">${rl.verified ? 'Rule from the game\'s own text.' : '<span class="warn">Unverified rule (assumed).</span>'} ${esc(rl.note || '')}</div>
</div>
<div class="card scroll"><table><tr><th>#</th><th>Name</th><th>Type</th><th>Time (UTC+3)</th></tr>
${a.list.map((p) => `<tr><td>${p.n}</td><td class="${p.rarity}">${esc(p.name)}${p.pity ? `<span class="pity">${p.pity}</span>` : ''}</td><td>${esc(p.type)}</td><td>${esc(p.time)}</td></tr>`).join('')}</table></div>
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

function render() {
  const view = tab === 'import' ? viewImport() : tab === 'history' ? viewHistory() : tab === 'banners' ? viewBanners() : viewData();
  $('#app').innerHTML = `<div class="wrap"><h1>Monster Hunter Outlanders - Recruit Tracker</h1>
<div class="sub">Reads your Recruitment History screenshots in the browser and keeps the data on your device (and optionally your own Google Drive).</div>
<nav>${[['import', 'Import'], ['history', 'History & pity'], ['banners', 'Banners'], ['data', 'Data & sync']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>${view}</div>`;
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
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; log = ''; render(); }));
  document.querySelectorAll('[data-banner]').forEach((b) => (b.onclick = () => { banner = b.dataset.banner; render(); }));
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

(async () => { state = await loadState(); render(); })();
// live countdowns: update text in place so inputs/focus are not disturbed
setInterval(() => document.querySelectorAll('[data-countdown]').forEach((e) => { e.textContent = fmtCountdown(+e.dataset.countdown - Date.now()); }), 1000);
// test hook (used by the in-browser verification, harmless otherwise)
window.__mho = { extract: async (f) => extractScreenshot(f, await getOcr()), get state() { return state; }, mergeChunk };
void sortDisplay;
