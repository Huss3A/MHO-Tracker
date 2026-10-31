// Copies tesseract.js worker/core + the English model into public/tess so OCR runs fully
// from our own static files (no CDN requests, nothing leaves the browser).
import { cpSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
const out = 'public/tess';
mkdirSync(out + '/core', { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', out + '/worker.min.js');
for (const f of readdirSync('node_modules/tesseract.js-core'))
  if (/-lstm\.wasm\.js$|^tesseract-core-lstm\.wasm\.js$/.test(f)) cpSync('node_modules/tesseract.js-core/' + f, out + '/core/' + f);
if (!existsSync(out + '/eng.traineddata')) {
  console.error('Missing public/tess/eng.traineddata (commit it to the repo, see README).');
  process.exit(1);
}
console.log('tess assets ready');
