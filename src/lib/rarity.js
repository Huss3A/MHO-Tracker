// Rarity from the name text colour. Reference colours measured on the validation screenshots.
// Gold = SSR and purple = SR is an assumption derived from the game's <Legendary>SSR / <Epic>SR tags.
export const RARITY_REF = { R: [120, 160, 190], SR: [135, 110, 180], SSR: [191, 162, 101] };

/**
 * Colour of the name text in a box: collect saturated, fairly bright pixels and average the most
 * saturated 40% (the glyph cores). Anti-aliasing at lower resolutions dilutes edge pixels, so this
 * stays stable across screenshot scales. Returns null if there is no text.
 */
export function meanTextColour(img, x0, y0, x1, y1) {
  const { data, width, height } = img;
  const px = [];
  for (let y = Math.max(0, y0 | 0); y < Math.min(height, y1 | 0); y++)
    for (let x = Math.max(0, x0 | 0); x < Math.min(width, x1 | 0); x++) {
      const i = (y * width + x) * 4, R = data[i], G = data[i + 1], B = data[i + 2];
      const mx = Math.max(R, G, B), rg = mx - Math.min(R, G, B);
      if (mx > 130 && rg > 40) px.push([rg, R, G, B]);
    }
  if (px.length < 12) return null;
  px.sort((a, b) => b[0] - a[0]);
  const top = px.slice(0, Math.max(12, Math.floor(px.length * 0.4)));
  let r = 0, g = 0, b = 0;
  for (const p of top) { r += p[1]; g += p[2]; b += p[3]; }
  return [r / top.length, g / top.length, b / top.length];
}

export function classifyRarity(c) {
  if (!c) return { rarity: null, dist: Infinity, ok: false };
  const ranked = Object.entries(RARITY_REF)
    .map(([k, v]) => [k, Math.hypot(c[0] - v[0], c[1] - v[1], c[2] - v[2])])
    .sort((a, b) => a[1] - b[1]);
  const [best, second] = ranked;
  return { rarity: best[0], dist: best[1], ok: best[1] < 45 && second[1] - best[1] > 15 };
}
