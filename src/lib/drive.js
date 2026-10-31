// Google Drive sync via Google Identity Services + Drive REST v3, hidden appDataFolder only
// (scope drive.appdata: the app can see ONLY its own hidden file, nothing else in the user's Drive).
// The OAuth Client ID is public config (not a secret); see README for how to create one.
import { mergePulls } from './merge.js';
import { summarisePulls } from './overwrite.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE = 'mho-tracker-data.json';
// The access token (valid ~1 hour, scope drive.appdata only) is kept in localStorage until it expires, so a page
// refresh does not drop the connection. It is cleared on Disconnect, on expiry, or when Drive answers 401.
const KEY = 'mho-drive-token';
let token = null, tokenExp = 0;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.token && saved.exp > Date.now() + 60000) { token = saved.token; tokenExp = saved.exp; } else localStorage.removeItem(KEY);
} catch { /* storage unavailable: connection just lasts for this page load */ }
function remember() { try { token ? localStorage.setItem(KEY, JSON.stringify({ token, exp: tokenExp })) : localStorage.removeItem(KEY); } catch { /* ignore */ } }

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('Could not load Google Identity Services.'));
    document.head.appendChild(s);
  });
}

export async function connect(clientId) {
  if (!clientId) throw new Error('No Google OAuth Client ID configured (Settings).');
  if (token && Date.now() < tokenExp - 60000) return token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; remember(); resolve(token);
      },
      error_callback: (e) => reject(new Error(e.type || 'Sign-in cancelled')),
    });
    client.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}
export const isConnected = () => !!token && Date.now() < tokenExp;
export async function disconnect() {
  const t = token;
  token = null; tokenExp = 0; remember();
  if (!t) return;
  try { await loadGis(); window.google.accounts.oauth2.revoke(t, () => {}); } catch { /* offline: the token still expires on its own */ }
}

async function api(path, opts = {}) {
  const r = await fetch('https://www.googleapis.com' + path, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (r.status === 401) { token = null; tokenExp = 0; remember(); }
  if (!r.ok) throw new Error(`Drive API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}
async function findFile() {
  const q = encodeURIComponent(`name='${FILE}'`);
  const j = await (await api(`/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`)).json();
  return j.files?.[0] || null;
}
const download = async (id) => (await api(`/drive/v3/files/${id}?alt=media`)).json();

async function upload(id, pulls) {
  const body = JSON.stringify({ app: 'mho-recruit-tracker', version: 1, savedAt: new Date().toISOString(), pulls });
  if (id) return api(`/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
  const b = 'mho' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'] });
  const multi = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
  return api('/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multi });
}

/**
 * Read-only look at the Drive copy (nothing is written): {exists, count, newest, savedAt, modifiedTime}.
 * Call connect() first. Used by the overwrite confirmation dialog.
 */
export async function peek() {
  const f = await findFile();
  if (!f) return { exists: false, count: 0, newest: null, savedAt: null, modifiedTime: null };
  const d = await download(f.id), pulls = d.pulls || [];
  return { exists: true, ...summarisePulls(pulls), savedAt: d.savedAt || null, modifiedTime: f.modifiedTime || null };
}

/** Runs only after the user confirmed (overwrite modes) - see confirmDialog in main.js.
 * mode: 'merge' (default) | 'push' (overwrite Drive with local) | 'pull' (overwrite local with Drive) */
export async function sync(localPulls, mode = 'merge') {
  const f = await findFile();
  const remote = f ? (await download(f.id)).pulls || [] : [];
  let merged;
  if (mode === 'push') merged = localPulls;
  else if (mode === 'pull') merged = remote;
  else merged = mergePulls(remote, localPulls);
  if (mode !== 'pull') await upload(f?.id, merged);
  return { pulls: merged, remoteCount: remote.length, localCount: localPulls.length };
}
