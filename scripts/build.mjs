import { mkdir, readFile, writeFile, readdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}/dist`, { recursive: true });
await cp(`${root}/src`, `${root}/dist/src`, { recursive: true });
const files = (await readdir(`${root}/src`)).sort();
const sources = await Promise.all(files.map(async name => [name, await readFile(`${root}/src/${name}`, 'utf8')]));
const html = await readFile(`${root}/index.html`, 'utf8');
const version = createHash('sha256').update(JSON.stringify([html, sources])).digest('hex').slice(0, 12);
await writeFile(`${root}/dist/index.html`, html.replace(/(\.\/src\/(?:app\.js|style\.css))(?=")/g, `$1?v=${version}`));
for (const [name, source] of sources) if (name.endsWith('.js')) {
  await writeFile(`${root}/dist/src/${name}`, source.replace(/(from\s+['"])(\.\/[^'"]+\.js)(['"])/g, `$1$2?v=${version}$3`));
}
console.log('Static site built in dist/');
