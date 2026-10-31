/** Decode a File/Blob entirely in the browser into raw RGBA pixels (never uploaded anywhere). */
export async function loadImage(file) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close?.();
  return { width: canvas.width, height: canvas.height, data, canvas };
}

/** Crop a box, upscale to targetH px tall, grayscale + 1/99 percentile contrast stretch -> canvas. */
export function cropForOcr(img, box, targetH = 140) {
  const sw = Math.max(1, Math.round(box.w)), sh = Math.max(1, Math.round(box.h));
  const k = targetH / sh, tw = Math.max(1, Math.round(sw * k));
  const c = document.createElement('canvas');
  c.width = tw; c.height = targetH;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img.canvas, Math.round(box.x), Math.round(box.y), sw, sh, 0, 0, tw, targetH);
  const id = ctx.getImageData(0, 0, tw, targetH), d = id.data, hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = g; hist[g]++;
  }
  const total = tw * targetH;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
  ctx.putImageData(id, 0, 0);
  return c;
}

/** how many bright pixels does a box contain (is there any text in the row?) */
export function brightCount(img, x0, y0, x1, y1) {
  let n = 0;
  const { data, width, height } = img;
  for (let y = Math.max(0, y0 | 0); y < Math.min(height, y1 | 0); y += 1)
    for (let x = Math.max(0, x0 | 0); x < Math.min(width, x1 | 0); x += 1) {
      const i = (y * width + x) * 4;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 170) n++;
    }
  return n;
}
