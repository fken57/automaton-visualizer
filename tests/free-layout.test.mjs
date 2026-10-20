import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, graphBounds } from '../src/layout.js';
import { validateModel, applyTransitions, examples } from '../src/model.js';
import { createLibrary, newEntry, validateLibrary } from '../src/library.js';
import { exportSVG, exportDimensions, exportCollectionSVG } from '../src/graph.js';

function freeModel(branching = false, count = 9) {
  const states = Array.from({ length: count }, (_, i) => ({ id: i ? `q${i}` : 'S' }));
  const transitions = states.slice(1).map((s, i) => ({ from: branching ? 'S' : states[i].id, symbol: 'a', to: s.id }));
  return validateModel({ title: branching ? '縦長の分岐' : '横長の遷移列', layoutMode: 'free', states: layout(states, transitions, 'S', 'free'), transitions, alphabet: ['a'], start: 'S', finals: [states.at(-1).id] });
}

test('自由モードは遷移列を横長、分岐を縦長に配置し、円を重ねず定義を保持', () => {
  for (const branching of [false, true]) {
    const model = freeModel(branching), bounds = graphBounds(model.states, 'free');
    assert.ok(branching ? bounds.height > bounds.width * 2 : bounds.width > bounds.height * 4);
    for (let i = 0; i < model.states.length; i++) for (const b of model.states.slice(i + 1)) {
      assert.ok(Math.hypot(model.states[i].x - b.x, model.states[i].y - b.y) >= 100);
    }
    assert.equal(model.transitions.length, 8); assert.equal(model.start, 'S'); assert.deepEqual(model.finals, ['q8']);
    assert.deepEqual(layout(model.states, model.transitions, model.start, 'free'), model.states);
  }
});

test('配置モードを図ごとに保存し、旧形式は標準へ移行、記法による状態追加でも自由を維持', () => {
  const legacy = structuredClone(examples.dfa); delete legacy.layoutMode;
  assert.equal(validateModel(legacy).layoutMode, 'standard');
  assert.throws(() => validateModel({ ...legacy, layoutMode: 'unknown' }), /配置モード/);
  const library = createLibrary(legacy), free = newEntry(freeModel()); library.items.push(free);
  assert.deepEqual(validateLibrary(JSON.parse(JSON.stringify(library))), library);
  assert.equal(library.items[0].model.layoutMode, 'standard'); assert.equal(library.items[1].model.layoutMode, 'free');
  const next = validateModel(applyTransitions(free.model, [...free.model.transitions, { from: 'q8', symbol: 'a', to: 'q9' }]));
  assert.equal(next.layoutMode, 'free'); assert.deepEqual(next.finals, ['q8']);
  assert.ok(next.states.find(s => s.id === 'q9').x > next.states.find(s => s.id === 'q8').x);
});

test('単体PNGと名前付きまとめPNGで自由な縦横比を維持し、標準の出力寸法は保持', () => {
  const wide = freeModel(), tall = freeModel(true);
  for (const model of [wide, tall]) {
    const bounds = graphBounds(model.states, 'free'), size = exportDimensions(model);
    assert.deepEqual(size, { width: bounds.width * 2, height: bounds.height * 2 });
    assert.match(exportSVG(model), new RegExp(`width="${size.width}" height="${size.height}" viewBox="0 0 ${bounds.width} ${bounds.height}"`));
  }
  assert.deepEqual(exportDimensions(examples.dfa), { width: 1600, height: 1040 });
  const output = exportCollectionSVG([wide, tall, examples.dfa]);
  const wb = graphBounds(wide.states, 'free'), tb = graphBounds(tall.states, 'free');
  assert.equal(output.width, Math.max(800, wb.width, tb.width) * 2);
  assert.equal(output.height, (wb.height + tb.height + 520 + 140 * 3) * 2);
  assert.match(output.svg, /横長の遷移列/); assert.match(output.svg, /縦長の分岐/);
  for (const b of [wb, tb]) assert.match(output.svg, new RegExp(`width="${b.width}" height="${b.height}" viewBox="0 0 ${b.width} ${b.height}"`));
  assert.match(output.svg, new RegExp(`translate\\(0,${wb.height + 140}\\)`));
  assert.match(output.svg, /collection-2-arrow/);
});

test('自由モードの巨大な出力も画像の辺長・総画素数の上限内に収める', () => {
  const huge = validateModel({ ...examples.empty, layoutMode: 'free', states: [{ id: 'S', x: 50000, y: 50000 }] });
  for (const output of [exportDimensions(freeModel(false, 100)), exportDimensions(huge), exportCollectionSVG(Array.from({ length: 50 }, () => huge))]) {
    assert.ok(output.width > 0 && output.height > 0);
    assert.ok(Math.max(output.width, output.height) <= 16384);
    assert.ok(output.width * output.height <= 26400000);
  }
});
