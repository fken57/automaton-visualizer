import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, graphBounds } from '../src/layout.js';
import { validateModel, applyTransitions, examples, parseNotation } from '../src/model.js';
import { edgeGeometry, exportSVG, exportCollectionSVG } from '../src/graph.js';

const states = ids => ids.split(' ').map(id => ({ id }));
const edges = text => parseNotation(text, 'triples');
function curves(nodes, transitions) {
  const pairs = [...new Map(transitions.map(t => [JSON.stringify([t.from, t.to]), t])).values()];
  return pairs.map(t => ({ ...t, ...edgeGeometry(nodes.find(s => s.id === t.from), nodes.find(s => s.id === t.to), pairs.some(r => r.from === t.to && r.to === t.from), nodes, t.symbol) }));
}
function intersection(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}
function crossingCount(paths) {
  let count = 0;
  for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
    const a = paths[i], b = paths[j];
    if ([a.from, a.to].some(id => id === b.from || id === b.to)) continue;
    if (a.points.slice(1).some((p, k) => b.points.slice(1).some((q, l) => intersection(a.points[k], p, b.points[l], q)))) count++;
  }
  return count;
}
function clearNodes(nodes, paths) {
  for (const path of paths) for (const s of nodes) if (s.id !== path.from && s.id !== path.to) {
    assert.ok(path.points.every(p => Math.hypot(p.x - s.x, p.y - s.y) >= 43), `${path.from}→${path.to} crosses ${s.id}`);
  }
}

test('入力順に依存せず、出発状態から遷移順に並ぶ（旧配置はX字交差）', () => {
  const input = states('S B F A'), transitions = edges('(S,a,A)(A,a,B)(B,a,F)');
  const nodes = layout(input, transitions, 'S');
  const x = id => nodes.find(s => s.id === id).x;
  assert.ok(x('S') < x('A') && x('A') < x('B') && x('B') < x('F'));
  assert.equal(crossingCount(curves(nodes, transitions)), 0);
  assert.deepEqual(input, states('S B F A'));
});

test('分岐・合流の不要な交差を並べ替えで取り除く', () => {
  const transitions = edges('(S,a,A)(S,b,B)(A,a,C)(A,b,D)(B,a,C)');
  const nodes = layout(states('S A B C D'), transitions, 'S');
  assert.equal(crossingCount(curves(nodes, transitions)), 0);
  clearNodes(nodes, curves(nodes, transitions));
  assert.deepEqual(layout(nodes, transitions, 'S'), nodes);
});

test('3状態の直通辺が中央の状態を貫通しない（手動配置も回避）', () => {
  const nodes = [{ id: 'S', x: 130, y: 245 }, { id: 'A', x: 400, y: 245 }, { id: 'B', x: 670, y: 245 }];
  const transitions = edges('(S,a,A)(A,a,B)(S,b,B)(B,b,S)');
  clearNodes(nodes, curves(nodes, transitions));
  clearNodes(layout(nodes, transitions, 'S'), curves(layout(nodes, transitions, 'S'), transitions));
});

test('縦に並ぶ状態では自己ループを空いた方向へ逃がす', () => {
  const nodes = [{ id: 'A', x: 400, y: 305 }, { id: 'B', x: 400, y: 215 }, { id: 'C', x: 400, y: 395 }];
  const paths = curves(nodes, edges('(A,a,A)'));
  clearNodes(nodes, paths);
  assert.ok(Math.abs(paths[0].x - 400) > 80);
});

test('100状態でも円を重ねず、保存・再読込・単体/まとめSVGで座標を保持', () => {
  const input = Array.from({ length: 100 }, (_, i) => ({ id: `q${i}` }));
  const transitions = input.slice(1).map((s, i) => ({ from: `q${i}`, symbol: 'a', to: s.id }));
  const disconnectedPairs = input.filter((_, i) => i % 2 === 0).map(s => ({ from: s.id, symbol: 'a', to: `q${Number(s.id.slice(1)) + 1}` }));
  for (const rules of [[], transitions, disconnectedPairs, input.slice(1).map(s => ({ from: 'q0', symbol: 'a', to: s.id }))]) {
    const nodes = layout(input, rules, 'q0');
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) assert.ok(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) >= 100);
    const model = validateModel({ title: 'large', states: nodes, alphabet: ['a'], start: 'q0', finals: ['q99'], transitions: rules });
    assert.deepEqual(model.states, nodes);
    assert.deepEqual(validateModel(JSON.parse(JSON.stringify(model))), model);
    const bounds = graphBounds(nodes);
    assert.match(exportSVG(model), new RegExp(`viewBox="0 0 ${bounds.width} ${bounds.height}"`));
    assert.match(exportCollectionSVG([model]).svg, new RegExp(`<svg y="120"[^>]+viewBox="0 0 ${bounds.width} ${bounds.height}"`));
  }
});

test('記法から状態を追加する経路も遷移構造を使い、孤立状態を保持する', () => {
  const base = { ...structuredClone(examples.empty), states: [{ id: 'S', x: 230, y: 245 }, { id: 'isolated', x: 500, y: 245 }] };
  const model = validateModel(applyTransitions(base, edges('(S,a,A)(A,a,B)(B,b,S)')));
  assert.ok(model.states.some(s => s.id === 'isolated'));
  clearNodes(model.states, curves(model.states, model.transitions));
  assert.equal(model.start, 'S');
});
