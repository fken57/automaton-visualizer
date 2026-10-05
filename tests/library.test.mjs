import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary, validateLibrary, updateEntry, newEntry, MAX_AUTOMATA } from '../src/library.js';
import { examples } from '../src/model.js';
import { exportCollectionSVG } from '../src/graph.js';

test('単体データを名前・位置・遷移を保持して一覧に移行', () => {
  const library = createLibrary(examples.nfa);
  assert.equal(library.items.length, 1);
  assert.equal(library.activeId, library.items[0].id);
  assert.deepEqual(library.items[0].model, examples.nfa);
  assert.deepEqual(validateLibrary(JSON.parse(JSON.stringify(library))), library);
});
test('同じ名前でも識別子が異なり、図の変更が別の保存データに波及しない', () => {
  const library = createLibrary(examples.nfa), second = newEntry(examples.nfa);
  library.items.push(second);
  assert.notEqual(library.items[0].id, second.id);
  const changed = structuredClone(examples.nfa); changed.title = '新しいラベル'; changed.states[0].x = 300;
  const updated = updateEntry(library, second.id, changed);
  assert.equal(updated.items[1].model.title, '新しいラベル');
  assert.equal(updated.items[1].model.states[0].x, 300);
  assert.deepEqual(updated.items[0].model, examples.nfa);
  assert.deepEqual(library.items[1].model, examples.nfa);
  assert.throws(() => updateEntry(library, 'missing', changed));
});
test('一覧のJSONを検証し、重複識別子・不正な図・選択先を拒否', () => {
  const library = createLibrary(examples.nfa);
  assert.throws(() => validateLibrary({ ...library, items: [] }));
  assert.throws(() => validateLibrary({ ...library, activeId: 'unknown' }));
  assert.throws(() => validateLibrary({ ...library, items: [library.items[0], library.items[0]] }));
  assert.throws(() => validateLibrary({ ...library, items: [{ ...library.items[0], model: { ...examples.nfa, start: 'unknown' } }] }));
  assert.throws(() => validateLibrary({ ...library, items: Array.from({ length: MAX_AUTOMATA + 1 }, () => newEntry(examples.nfa)) }));
});
test('まとめ出力は名前を図の上に置き、図ごとに出発矢印と二重丸を保持', () => {
  const output = exportCollectionSVG([examples.nfa, examples.dfa]);
  assert.equal(output.width, 1600); assert.equal(output.height, 2640);
  assert.match(output.svg, /aa⁺ または ab⁺ を受理する NFA/);
  assert.match(output.svg, /a\(ba\)\* を受理する DFA/);
  assert.equal((output.svg.match(/r="28"/g) || []).length, 2);
  assert.equal((output.svg.match(/r="35"/g) || []).length, 6);
  assert.match(output.svg, /collection-0-arrow/); assert.match(output.svg, /collection-1-arrow/);
  assert.match(output.svg, /translate\(0,660\)/);
  assert.ok(output.svg.indexOf('aa⁺') < output.svg.indexOf('data-state="S"'));
});
test('長いラベルを折り返し、ラベル内のマークアップをエスケープ', () => {
  const output = exportCollectionSVG([{ ...examples.nfa, title: '<script>&"' }, { ...examples.dfa, title: '長'.repeat(80) }]);
  assert.match(output.svg, /&lt;script&gt;&amp;&quot;/);
  assert.doesNotMatch(output.svg, /<script>/);
  assert.equal((output.svg.match(/<tspan/g) || []).length, 4);
});
test('件数が多い画像は2列で収まり、最大保存数でもキャンバス上限内', () => {
  const output = exportCollectionSVG(Array.from({ length: 50 }, () => examples.dfa));
  assert.equal(output.width, 1600); assert.equal(output.height, 16500);
  assert.match(output.svg, /translate\(800,0\)/);
  assert.throws(() => exportCollectionSVG([]));
  assert.throws(() => exportCollectionSVG(Array.from({ length: 51 }, () => examples.dfa)));
});
