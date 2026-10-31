// Local table: one record in IndexedDB (falls back to localStorage). Nothing leaves the browser
// unless the user connects Google Drive.
const DB = 'mho-tracker', STORE = 'kv', KEY = 'state';
export const emptyState = () => ({ version: 1, pulls: [], settings: { clientId: '', rules: {} }, updatedAt: 0 });

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function loadState() {
  try {
    const db = await open();
    const v = await new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    return { ...emptyState(), ...(v || {}) };
  } catch {
    try { return { ...emptyState(), ...JSON.parse(localStorage.getItem(DB) || '{}') }; } catch { return emptyState(); }
  }
}
export async function saveState(s) {
  s.updatedAt = Date.now();
  try {
    const db = await open();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(JSON.parse(JSON.stringify(s)), KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch { try { localStorage.setItem(DB, JSON.stringify(s)); } catch { /* storage unavailable */ } }
}

export const exportJson = (s) =>
  JSON.stringify({ app: 'mho-recruit-tracker', version: 1, exportedAt: new Date().toISOString(), pulls: s.pulls }, null, 1);

const TIME_RE = /^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d$/;
const str = (v) => typeof v === 'string';
const int = (v) => (Number.isInteger(v) ? v : null);
/** Validate untrusted pulls (JSON import, Drive file): keep only well-formed rows, copy known fields with the right types. */
export function cleanPulls(list) {
  if (!Array.isArray(list)) throw new Error('Not a tracker file (no "pulls" array).');
  return list
    .filter((p) => p && str(p.banner) && p.banner && str(p.time) && TIME_RE.test(p.time) && str(p.name) && ['SSR', 'SR', 'R'].includes(p.rarity))
    .map((p, i) => ({ banner: p.banner, time: p.time, idx: Number.isInteger(p.idx) ? p.idx : i, type: str(p.type) ? p.type : '', name: p.name, rarity: p.rarity, page: int(p.page), row: int(p.row) }));
}
export function parseImport(text) {
  const j = JSON.parse(text);
  if (!j || !Array.isArray(j.pulls)) throw new Error('Not a tracker export (no "pulls" array).');
  return cleanPulls(j.pulls);
}
