// Development-only tool that converts the crew's Rocketbox avatars to GLB.
// Run `npm run models:rocketbox`, open the printed address and press CONVERT.
// The page loads each avatar's FBX and colour textures from the pinned
// Rocketbox commit, converts it in the browser and posts the GLB back here,
// where it is written to public/models/characters/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LIMIT = 8 * 1024 * 1024;
// Models go to characters/, the shared animation clips to animations/.
const OUTPUTS = {
  '/__save': resolve(here, '../../public/models/characters'),
  '/__save-clips': resolve(here, '../../public/models/animations'),
};

export default {
  root: here,
  logLevel: 'info',
  server: { host: '127.0.0.1', port: 5180 },
  plugins: [{
    name: 'save-character-model',
    configureServer(server) {
      for (const [route, output] of Object.entries(OUTPUTS)) server.middlewares.use(route, (request, response) => {
        const file = new URL(request.url ?? '', 'http://localhost').searchParams.get('file') ?? '';
        if (request.method !== 'POST' || !/^[a-z0-9-]+$/.test(file)) {
          response.statusCode = 400;
          response.end(`expected POST ${route}?file=<lower-case-name>`);
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
