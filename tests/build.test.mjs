import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('公開HTMLとすべてのモジュール参照に同じ更新識別子を付け、古いキャッシュの混在を防ぐ', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const html = readFileSync(`${root}/dist/index.html`, 'utf8');
  const version = html.match(/app\.js\?v=([a-f0-9]{12})/)[1];
  assert.ok(html.includes(`style.css?v=${version}`));
  let imports = 0;
  for (const name of readdirSync(`${root}/dist/src`).filter(name => name.endsWith('.js'))) {
    const source = readFileSync(`${root}/dist/src/${name}`, 'utf8');
    for (const match of source.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {
      assert.ok(match[1].endsWith(`?v=${version}`), `${name}: ${match[1]}`);
      readFileSync(`${root}/dist/src/${match[1].split('?')[0]}`);
      imports++;
    }
  }
  assert.ok(imports > 0);
});
