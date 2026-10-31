// Computes WCAG contrast ratios from the real CSS variables in src/style.css (dark = default, light = prefers-color-scheme:light).
// Usage: node scripts/check-contrast.mjs   (exit 1 when a pair fails)
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const vars = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)].map((m) => [m[1], m[2]]));
const dark = vars(css.match(/:root\{([^}]*)\}/)[1]);
const light = { ...dark, ...vars(css.match(/prefers-color-scheme:light\)\{:root\{([^}]*)\}/)[1]) };
const lum = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// [foreground, background, min ratio, label]; literals start with #. 3 = large/bold UI text or non-text UI
const pairs = [
  ['fg', 'bg', 4.5, 'body text'], ['fg', 'panel', 4.5, 'text on card'], ['fg', 'panel2', 4.5, 'text on stat box/inputs'],
  ['mut', 'bg', 4.5, 'muted note on page'], ['mut', 'panel', 4.5, 'muted note on card'], ['mut', 'panel2', 4.5, 'muted note on stat box / th'],
  ['R', 'panel', 4.5, 'R rarity'], ['SR', 'panel', 4.5, 'SR rarity'], ['SSR', 'panel', 4.5, 'SSR rarity'],
  ['R', 'panel2', 4.5, 'R on stat box'], ['SR', 'panel2', 4.5, 'SR on stat box'], ['SSR', 'panel2', 4.5, 'SSR on stat box'],
  ['ok', 'panel', 4.5, 'ok text'], ['warn', 'panel', 4.5, 'warn text'], ['bad', 'panel', 4.5, 'bad/danger button text'], ['ok', 'panel2', 4.5, 'ok on stat box'], ['warn', 'panel2', 4.5, 'warn/soft pity on stat box'],
  ['pc-g', 'panel', 4.5, 'pity colour green'], ['pc-o', 'panel', 4.5, 'pity colour orange'], ['pc-r', 'panel', 4.5, 'pity colour red'],
  ['pc-g', 'panel2', 4.5, 'pity green on stat box'], ['pc-o', 'panel2', 4.5, 'pity orange on stat box'], ['pc-r', 'panel2', 4.5, 'pity red on stat box'],
  ['on-accent', 'accent', 4.5, 'primary button / active menu item'], ['on-pill', 'SSR', 4.5, 'SSR pill (on)'], ['on-pill', 'SR', 4.5, 'SR pill (on)'], ['on-pill', 'R', 4.5, 'R pill (on)'],
  ['link', 'panel', 4.5, 'link / link-button on card'], ['link', 'bg', 4.5, 'link on page'], 
  ['bad-fg', 'bad-bg', 4.5, 'dialog warning'], ['#ffffff', 'bad-solid', 4.5, 'danger confirm button'], ['bad', 'bad-bg', 4.5, 'bad on warning bg'],
  ['accent', 'bg', 3, 'focus ring on page'], ['accent', 'panel', 3, 'focus ring on card'], ['line', 'bg', 1, '(info) border'],
];
let fail = 0;
for (const [name, v] of [['dark', dark], ['light', light]]) {
  for (const [f, b, min, label] of pairs) {
    const fc = f.startsWith('#') ? f : v[f], bc = b.startsWith('#') ? b : v[b];
    if (!fc || !bc) { console.log(`${name} MISSING ${f}/${b}`); fail++; continue; }
    const r = ratio(fc, bc), ok = r >= min;
    if (!ok) fail++;
    if (!ok || process.argv.includes('-v')) console.log(`${name.padEnd(5)} ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)} (>=${min}) ${label}  ${fc} on ${bc}`);
  }
}
console.log(fail ? `${fail} failing pair(s)` : 'all contrast pairs pass');
process.exit(fail ? 1 : 0);
