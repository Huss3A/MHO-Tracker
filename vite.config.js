import { defineConfig } from 'vite';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

// Dev only: serve tests/samples at /__samples/ so the OCR pipeline can be verified in a real browser.
const samples = () => ({
  name: 'dev-samples',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__samples', (req, res, next) => {
      const f = join(process.cwd(), 'tests/samples', decodeURIComponent((req.url || '').split('?')[0]));
      if (existsSync(f)) createReadStream(f).pipe(res); else next();
    });
  },
});

// base './' = works from any GitHub Pages sub-path (https://user.github.io/repo/)
export default defineConfig({ base: './', plugins: [samples()], build: { outDir: 'docs', emptyOutDir: true } });
