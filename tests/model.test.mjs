import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotation, formatNotation, validateModel, applyTransitions, simulate, automatonType, examples, epsilonClosure } from '../src/model.js';
import { exportSVG, edgeGeometry } from '../src/graph.js';

test('講義の3つ組→矢印→3つ組の往復で遷移を保存', () => {
  const original = structuredClone(examples.nfa);
  const triples = parseNotation(formatNotation(original, 'triples'), 'triples');
  const arrows = parseNotation(formatNotation({ ...original, transitions: triples }, 'arrows'), 'arrows');
  assert.deepEqual(arrows, original.transitions);
  assert.deepEqual(parseNotation('(S,a,A)(S,a,B); (A,a,#)', 'triples'), original.transitions.filter((_, i) => [0, 1, 3].includes(i)));
  const hyphens = { transitions: [{ from: 'q-0', symbol: '-a-', to: 'q-1' }] };
  assert.deepEqual(parseNotation(formatNotation(hyphens, 'arrows'), 'arrows'), hyphens.transitions);
});
test('矢印のASCII・Unicode表現を受け付ける', () => {
  const expected = [{ from: 'S', symbol: 'a', to: 'A' }];
  for (const text of ['S -a-> A', 'S ─a→ A', 'S --a--> A']) assert.deepEqual(parseNotation(text, 'arrows'), expected);
});
test('不正な記法を部分的に読み込まない', () => {
  for (const text of ['garbage(S,a,A)', '(S,a,A)garbage', '(S,a,)', '(S,a,A)\n(B,b)', '(S,a,A),']) assert.throws(() => parseNotation(text, 'triples'));
  assert.throws(() => parseNotation('S -a-> A\nS something B', 'arrows'));
  assert.throws(() => parseNotation('(<script>,a,A)', 'triples'));
});
test('重複遷移を排除し空入力を許容する', () => {
  assert.equal(parseNotation('(S,a,A)(S,a,A)', 'triples').length, 1);
  assert.deepEqual(parseNotation('', 'triples'), []);
});
test('記法の反映で孤立状態・出発・終了状態を保持し状態と記号を追加', () => {
  const source = structuredClone(examples.nfa);
  const next = validateModel(applyTransitions(source, parseNotation('(S,c,C)', 'triples')));
  assert.equal(next.start, 'S'); assert.deepEqual(next.finals, ['#']);
  assert.deepEqual(next.states.map(s => s.id), ['S', 'A', 'B', '#', 'C']);
  assert.deepEqual(next.alphabet, ['a', 'b', 'c']); assert.equal(next.transitions.length, 1);
  assert.deepEqual(source, examples.nfa);
});
test('NFAの分岐と受理言語を正しく追跡する', () => {
  for (const word of ['aa', 'aaa', 'aaaa', 'ab', 'abb', 'abbbb']) assert.equal(simulate(examples.nfa, word).accepted, true, word);
  for (const word of ['', 'a', 'b', 'ba', 'aab', 'aba', 'abab']) assert.equal(simulate(examples.nfa, word).accepted, false, word);
  assert.deepEqual(simulate(examples.nfa, 'a').steps[1].states.sort(), ['A', 'B']);
});
test('DFAの部分遷移関数と空語を処理する', () => {
  for (const word of ['a', 'aba', 'ababa']) assert.equal(simulate(examples.dfa, word).accepted, true);
  for (const word of ['', 'ab', 'aa', 'b']) assert.equal(simulate(examples.dfa, word).accepted, false);
  assert.equal(simulate(examples.binary, '').accepted, true);
  assert.equal(simulate(examples.binary, '101').accepted, true);
  assert.equal(simulate(examples.binary, '111').accepted, false);
});
test('ε閉包は循環しても終了し、入力の前後で到達状態を計算', () => {
  const model = validateModel(applyTransitions({ ...structuredClone(examples.nfa), finals: ['#'] }, parseNotation('(S,ε,A)(A,ε,S)(A,a,B)(B,ε,#)', 'triples')));
  assert.deepEqual(epsilonClosure(model, ['S']).sort(), ['A', 'S']);
  assert.equal(simulate(model, 'a').accepted, true);
  assert.equal(simulate(model, '').accepted, false);
  assert.equal(automatonType(model), 'NFA');
});
test('未定義の入力記号を拒否する', () => assert.throws(() => simulate(examples.nfa, 'c'), /終端記号/));
test('複数文字記号は区切り付きで入力できる', () => {
  const model = validateModel(applyTransitions(structuredClone(examples.dfa), parseNotation('(S,hello,A)(A,world,S)', 'triples')));
  assert.equal(simulate(model, 'hello').accepted, true);
  assert.equal(simulate(model, 'hello world hello').accepted, true);
  assert.throws(() => simulate(model, 'helloworld'), /スペース/);
});
test('DFAとNFAを遷移規則から判別する', () => {
  assert.equal(automatonType(examples.dfa), 'DFA'); assert.equal(automatonType(examples.nfa), 'NFA');
  assert.equal(automatonType(examples.binary), 'DFA');
});
test('JSON往復で位置を含めた定義を保持する', () => {
  assert.deepEqual(validateModel(JSON.parse(JSON.stringify(examples.nfa))), examples.nfa);
  assert.throws(() => validateModel({ ...examples.nfa, start: 'unknown' }));
  assert.throws(() => validateModel({ ...examples.nfa, finals: ['unknown'] }));
  assert.throws(() => validateModel({ ...examples.nfa, alphabet: ['ε'] }));
  assert.throws(() => validateModel({ ...examples.nfa, states: [] }));
  assert.throws(() => validateModel({ ...examples.nfa, states: [{ id: 'S' }, { id: 'S' }] }));
});
test('自己遷移・逆向き遷移・ドラッグ後の接続を描画する', () => {
  const a = { id: 'A', x: 200, y: 200 }, b = { id: 'B', x: 500, y: 200 };
  assert.match(edgeGeometry(a, a).d, /C/);
  assert.notEqual(edgeGeometry(a, b, true).y, edgeGeometry(b, a, true).y);
  assert.notEqual(edgeGeometry(a, b).d, edgeGeometry({ ...a, x: 150 }, b).d);
});
test('出力SVGに出発矢印、終了二重丸、ラベルを含む', () => {
  const svg = exportSVG(examples.nfa);
  assert.match(svg, /width="1600" height="1040"/);
  assert.match(svg, /fill="white"/);
  assert.equal((svg.match(/r="35"/g) || []).length, 4);
  assert.equal((svg.match(/r="28"/g) || []).length, 1);
  assert.match(svg, /data-state="#"/);
  assert.doesNotMatch(svg, /stroke-dasharray/);
});
