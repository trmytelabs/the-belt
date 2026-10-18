// Development-only tool that converts the depot's Poly Haven props to GLB.
// Run `npm run models:polyhaven`, open the printed address and press CONVERT.
// The page loads each prop's 1k glTF from Poly Haven, converts it in the
// browser and posts the GLB back here, where it is written to
// public/models/props/. preview.html shows the converted props side by side.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../../public/models/props');
const LIMIT = 2 * 1024 * 1024;

export default {
  root: here,
  // The converted props are served for preview.html.
  publicDir: resolve(here, '../../public'),
  logLevel: 'info',
  server: { host: '127.0.0.1', port: 5181 },
  plugins: [{
    name: 'save-prop-model',
    configureServer(server) {
      server.middlewares.use('/__save', (request, response) => {
        const file = new URL(request.url ?? '', 'http://localhost').searchParams.get('file') ?? '';
        if (request.method !== 'POST' || !/^[a-z0-9-]+$/.test(file)) {
          response.statusCode = 400;
          response.end('expected POST /__save?file=<lower-case-name>');
          return;
        }
        const chunks = [];
        let size = 0;
        request.on('data', (chunk) => {
          size += chunk.length;
          if (size <= LIMIT) chunks.push(chunk);
        });
        request.on('end', () => {
          if (size > LIMIT) {
            response.statusCode = 413;
            response.end(`model larger than ${LIMIT} bytes`);
            return;
          }
          mkdirSync(output, { recursive: true });
          writeFileSync(join(output, `${file}.glb`), Buffer.concat(chunks));
          response.end(`saved ${file}.glb (${size} bytes)`);
        });
      });
    },
  }],
};
