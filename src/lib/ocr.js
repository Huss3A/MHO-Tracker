import Tesseract from 'tesseract.js';
import { loadImage, cropForOcr, brightCount } from './imageio.js';
import { detectLayout, toImg, rowCenter, REF_COLS, REF_ROW_HALF, REF_BANNER, ROWS_PER_PAGE } from './layout.js';
import { meanTextColour, classifyRarity } from './rarity.js';
import { snapName, snapType, snapBanner } from './names.js';

const TIME_RE = /^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d$/;
const abs = (p) => new URL(import.meta.env.BASE_URL + p, location.href).href;

export async function createOcr() {
  // everything (worker, wasm core, English model) is served from our own static files
  const w = await Tesseract.createWorker('eng', 1, {
    workerPath: abs('tess/worker.min.js'), corePath: abs('tess/core'), langPath: abs('tess'),
    gzip: false, cacheMethod: 'none', workerBlobURL: false,
  });
  return {
    async read(canvas, { psm = '7', whitelist = '' } = {}) {
      await w.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist });
      return (await w.recognize(canvas)).data.text.trim();
    },
    terminate: () => w.terminate(),
  };
}

/** time cell: retry at several crop scales; repair only the unambiguous 14-digit form */
async function readTime(img, L, ocr, y0) {
  const ref = [REF_COLS.time[0], y0, REF_COLS.time[1] - REF_COLS.time[0], 2 * REF_ROW_HALF];
  let last = '';
  for (const h of [140, 110, 180, 90]) {
    last = await ocr.read(cropForOcr(img, toImg(L, ref), h), { whitelist: '0123456789/: ' });
    if (TIME_RE.test(last)) return last;
    const d = last.replace(/\D/g, '');
    if (d.length === 14) {
      const fixed = `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)} ${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12)}`;
      if (TIME_RE.test(fixed) && +d.slice(4, 6) >= 1 && +d.slice(4, 6) <= 12 && +d.slice(6, 8) <= 31 && +d.slice(8, 10) < 24) return fixed;
    }
  }
  return last;
}

/**
 * Extract one screenshot of Recruit > Recruitment History.
 * Returns { fileName, status: 'ok'|'review'|'failed', warnings[], banner, page, rows[] }.
 * Anything we are not sure about is reported in warnings instead of being guessed.
 */
export async function extractScreenshot(file, ocr, hooks = {}) {
  const out = { fileName: file.name, status: 'ok', warnings: [], banner: null, bannerRaw: '', page: null, rows: [] };
  let img;
  try { img = await loadImage(file); } catch { out.status = 'failed'; out.warnings.push('Could not decode image.'); return out; }
  out.thumb = hooks.thumb ? hooks.thumb(img) : undefined;
  const L = detectLayout(img);
  if (!L) { out.status = 'failed'; out.warnings.push('Could not find the recruitment table (header bar). Is this the Recruitment History screen?'); return out; }
  if (!L.ok) out.warnings.push('Table header proportions look unusual (cropped or zoomed screenshot?) - verify the rows.');
  out.layout = { scale: +L.s.toFixed(3), size: `${img.width}x${img.height}` };

  const cell = (ref, o) => ocr.read(cropForOcr(img, toImg(L, ref)), o);

  out.bannerRaw = await cell(REF_BANNER);
  const sb = snapBanner(out.bannerRaw);
  out.banner = sb.banner;
  if (!sb.ok) out.warnings.push(`Banner "${out.bannerRaw}" not recognised - pick it manually.`);

  // page number: tiny single glyph, so vote over several crops/modes; null if no two reads agree
  const votes = {};
  for (const box of [[1130, 740, 60, 55], [1120, 745, 80, 45]])
    for (const psm of ['7', '10']) {
      const t = (await ocr.read(cropForOcr(img, toImg(L, box), 100), { psm, whitelist: '0123456789' })).replace(/\D/g, '');
      if (t && +t > 0 && +t < 500) votes[t] = (votes[t] || 0) + 1;
    }
  const top = Object.entries(votes).sort((x, y) => y[1] - x[1])[0];
  if (top && top[1] >= 2) out.page = +top[0];
  if (out.page == null) out.warnings.push('Page number not readable - rows placed by timestamp only.');

  for (let k = 0; k < ROWS_PER_PAGE; k++) {
    const cy = rowCenter(k), y0 = cy - REF_ROW_HALF;
    const time = await readTime(img, L, ocr, y0);
    const nameBox = toImg(L, [REF_COLS.name[0], y0, REF_COLS.name[1] - REF_COLS.name[0], 2 * REF_ROW_HALF]);
    const hasText = brightCount(img, nameBox.x, nameBox.y, nameBox.x + nameBox.w, nameBox.y + nameBox.h) > 40 * L.s * L.s;
    if (!TIME_RE.test(time)) {
      if (hasText) out.warnings.push(`Row ${k + 1}: time "${time}" unreadable - row skipped.`), out.status = 'review';
      continue;                                   // empty row (last page / single pull)
    }
    const typeRaw = await cell([REF_COLS.type[0], y0, REF_COLS.type[1] - REF_COLS.type[0], 2 * REF_ROW_HALF]);
    const nameRaw = await cell([REF_COLS.name[0], y0, REF_COLS.name[1] - REF_COLS.name[0], 2 * REF_ROW_HALF]);
    const sourceRaw = await cell([REF_COLS.source[0], y0, REF_COLS.source[1] - REF_COLS.source[0], 2 * REF_ROW_HALF]);
    const ty = snapType(typeRaw);
    const nm = snapName(nameRaw, ty.ok ? ty.type : undefined);
    const colBox = toImg(L, [REF_COLS.name[0], cy - 20, REF_COLS.name[1] - REF_COLS.name[0], 40]);
    const colour = meanTextColour(img, colBox.x, colBox.y, colBox.x + colBox.w, colBox.y + colBox.h);
    const rar = classifyRarity(colour);
    const flags = [];
    if (!ty.ok) flags.push('type');
    if (!nm.ok) flags.push('name');
    if (!rar.ok) flags.push('rarity');
    out.rows.push({ row: k, type: ty.type, name: nm.name, nameRaw, source: snapBanner(sourceRaw).banner, rarity: rar.rarity || 'R', colour: colour && colour.map(Math.round), rdist: Math.round(rar.dist), time, flags, suggestion: nm.suggestion });
    if (flags.length) { out.status = 'review'; out.warnings.push(`Row ${k + 1} (${nm.name || nameRaw}): check ${flags.join(', ')}.`); }
    hooks.progress?.();
  }
  if (!out.rows.length) { out.status = 'failed'; out.warnings.push('No readable rows found.'); }
  if (!sb.ok && out.status === 'ok') out.status = 'review';
  return out;
}
