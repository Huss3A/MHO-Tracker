// Resolution independent layout. Instead of hard-coded pixel coordinates we find the tan header
// bar (Type/Name/Source/Time) of the recruitment table by colour, then express every crop in a
// reference frame (the 2000x923 validation screenshots) relative to that bar and scale it.
const REF = { x0: 688, top: 327, width: 942, height: 40 };   // header bar in the reference frame
export const REF_COLS = { type: [690, 850], name: [860, 1100], source: [1120, 1360], time: [1370, 1630] };
export const REF_ROW_Y0 = 403, REF_ROW_PITCH = 69, REF_ROW_HALF = 28, ROWS_PER_PAGE = 5;
export const REF_BANNER = [1205, 200, 380, 50];

const isBar = (r, g, b) => r > 100 && r < 145 && g > 95 && g < 138 && b > 70 && b < 118 && r - b > 16 && r - b < 42 && r >= g && g > b;

/** returns {s, ox, oy} mapping reference coordinates to image pixels, or null when no table found. */
export function detectLayout(img) {
  const { data, width: W, height: H } = img;
  const cnt = new Int32Array(H), minX = new Int32Array(H).fill(W), maxX = new Int32Array(H).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (isBar(data[i], data[i + 1], data[i + 2])) { cnt[y]++; if (x < minX[y]) minX[y] = x; maxX[y] = x; }
    }
  }
  const M = Math.max(...cnt);
  if (M < W * 0.15) return null;
  // longest vertical run of rows that are "mostly bar"
  let best = null, start = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && cnt[y] >= M * 0.6;
    if (on && start < 0) start = y;
    if (!on && start >= 0) { if (!best || y - start > best.h) best = { y0: start, h: y - start }; start = -1; }
  }
  if (!best || best.h < 8) return null;
  // per row: longest horizontal stretch of bar colour (gaps up to 40px tolerated = header text)
  const GAP = 40 * (W / 2000);
  const seg = (y) => {
    let bs = -1, be = -1, cs = -1, ce = -1;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!isBar(data[i], data[i + 1], data[i + 2])) continue;
      if (cs >= 0 && x - ce <= GAP) ce = x; else { cs = x; ce = x; }
      if (ce - cs > be - bs) { bs = cs; be = ce; }
    }
    return [bs, be];
  };
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const segs = Array.from({ length: best.h }, (_, i) => seg(best.y0 + i));
  const x0 = med(segs.map((s) => s[0])), x1 = med(segs.map((s) => s[1]));
  const sx = (x1 - x0 + 1) / (REF.width - 1);
  const sy = best.h / REF.height;
  const ok = Math.abs(sx - sy) / sx < 0.25;      // header must have the expected aspect ratio
  return { s: sx, ox: x0 - REF.x0 * sx, oy: best.y0 - REF.top * sx, ok, header: { x0, x1, y0: best.y0, h: best.h } };
}

export const toImg = (L, [x, y, w, h]) => ({ x: L.ox + x * L.s, y: L.oy + y * L.s, w: w * L.s, h: h * L.s });
export const rowCenter = (k) => REF_ROW_Y0 + REF_ROW_PITCH * k;
