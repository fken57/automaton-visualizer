import { mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}/dist`, { recursive: true });
await copyFile(`${root}/index.html`, `${root}/dist/index.html`);
await cp(`${root}/src`, `${root}/dist/src`, { recursive: true });
console.log('Static site built in dist/');
