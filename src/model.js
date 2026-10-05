export const EPSILON = 'ε';
const tokenPattern = /^[\p{L}\p{N}_#.$ε-]+$/u;
export const validToken = value => typeof value === 'string' && tokenPattern.test(value) && value.length <= 32;
export const escapeXML = value => String(value).replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch]);
export function tokens(text) { return text.replace(/[{}]/g, '').split(/[,、\s]+/u).filter(Boolean); }
export function uniqueTransitions(transitions) {
  return [...new Map(transitions.map(t => [JSON.stringify([t.from, t.symbol, t.to]), t])).values()];
}
export function parseNotation(text, kind) {
  const result = [];
  const input = text.trim();
  if (!input) return result;
  if (kind === 'triples') {
    const re = /\(\s*([^,()\s]+)\s*,\s*([^,()\s]+)\s*,\s*([^,()\s]+)\s*\)/gu;
    let end = 0;
    for (const match of input.matchAll(re)) {
      if (!/^[\s;]*$/u.test(input.slice(end, match.index))) throw new Error('3つ組は (S,a,A) の形式で入力してください。');
      result.push({ from: match[1], symbol: match[2], to: match[3] });
      end = match.index + match[0].length;
    }
    if (!result.length || !/^[\s;]*$/u.test(input.slice(end))) throw new Error('3つ組は (S,a,A) の形式で入力してください。');
  } else {
    for (const [i, line] of input.split(/[\n;]/u).entries()) {
      if (!line.trim()) continue;
      const match = line.trim().match(/^(\S+)\s+(?:--\s*([^\s]+?)\s*-->|─\s*([^\s]+?)\s*→|-\s*([^\s]+?)\s*->)\s+(\S+)$/u);
      if (!match) throw new Error(`${i + 1}行目: S -a-> A の形式で入力してください。`);
      result.push({ from: match[1], symbol: match[2] || match[3] || match[4], to: match[5] });
    }
  }
  for (const t of result) {
    if (![t.from, t.symbol, t.to].every(validToken)) throw new Error('状態・記号は32文字以内の文字、数字、_ # . $ - で入力してください。');
  }
  return uniqueTransitions(result);
}
export function formatNotation(model, kind) {
  return model.transitions.map(t => kind === 'triples' ? `(${t.from},${t.symbol},${t.to})` : `${t.from} ─${t.symbol}→ ${t.to}`).join('\n');
}
export function layout(states, style = 'circle') {
  const n = states.length;
  return states.map((s, i) => {
    if (n === 1) return { ...s, x: 400, y: 245 };
    if (n <= 4 && style === 'circle') {
      const places = n === 2 ? [[235, 245], [565, 245]] : n === 3 ? [[175, 245], [400, 245], [625, 245]] : [[230, 155], [560, 155], [230, 355], [560, 355]];
      return { ...s, x: places[i][0], y: places[i][1] };
    }
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    return { ...s, x: 130 + (i % cols) * (540 / Math.max(1, cols - 1)), y: 125 + Math.floor(i / cols) * (270 / Math.max(1, rows - 1)) };
  });
}
export function applyTransitions(model, transitions) {
  const names = [...new Set(transitions.flatMap(t => [t.from, t.to]))];
  const added = names.filter(name => !model.states.some(s => s.id === name));
  const states = added.length ? layout([...model.states, ...added.map(id => ({ id }))]) : model.states;
  return { ...model, states, alphabet: [...new Set([...model.alphabet, ...transitions.map(t => t.symbol).filter(x => x !== EPSILON)])], transitions: uniqueTransitions(transitions) };
}
export function validateModel(model) {
  if (!model || !Array.isArray(model.states) || !Array.isArray(model.alphabet) || !Array.isArray(model.finals) || !Array.isArray(model.transitions)) throw new Error('オートマトンのJSON形式が正しくありません。');
  if (!model.states.length || model.states.length > 100 || model.transitions.length > 2000) throw new Error('状態数は1〜100、遷移数は2000以下にしてください。');
  const ids = model.states.map(s => s.id);
  if (!ids.every(validToken) || new Set(ids).size !== ids.length) throw new Error('状態名が不正、または重複しています。');
  if (!ids.includes(model.start) || !model.finals.every(id => ids.includes(id))) throw new Error('出発・終了状態は状態集合に含めてください。');
  if (!model.alphabet.every(validToken) || model.alphabet.includes(EPSILON)) throw new Error('終端記号が不正です。εは入力記号集合には含めません。');
  if (!model.transitions.every(t => ids.includes(t.from) && ids.includes(t.to) && (model.alphabet.includes(t.symbol) || t.symbol === EPSILON))) throw new Error('遷移の状態または記号が定義されていません。');
  return {
    title: typeof model.title === 'string' ? model.title.slice(0, 80) : '無題のオートマトン',
    states: model.states.map((s, i) => ({ id: s.id, x: Number.isFinite(s.x) ? Math.max(95, Math.min(705, s.x)) : layout(model.states)[i].x, y: Number.isFinite(s.y) ? Math.max(115, Math.min(400, s.y)) : layout(model.states)[i].y })),
    alphabet: [...new Set(model.alphabet)], start: model.start, finals: [...new Set(model.finals)], transitions: uniqueTransitions(model.transitions)
  };
}
export function automatonType(model) {
  const keys = new Set();
  for (const t of model.transitions) {
    const key = JSON.stringify([t.from, t.symbol]);
    if (t.symbol === EPSILON || keys.has(key)) return 'NFA';
    keys.add(key);
  }
  return 'DFA';
}
export function epsilonClosure(model, ids) {
  const result = new Set(ids);
  const queue = [...result];
  for (let i = 0; i < queue.length; i++) {
    for (const t of model.transitions) if (t.from === queue[i] && t.symbol === EPSILON && !result.has(t.to)) { result.add(t.to); queue.push(t.to); }
  }
  return [...result];
}
export function simulate(model, input) {
  const word = input.trim();
  const symbols = /\s/u.test(word) ? word.split(/\s+/u) : [...word];
  if (model.alphabet.some(s => [...s].length > 1) && word && !/\s/u.test(word)) {
    if (model.alphabet.includes(word)) symbols.splice(0, symbols.length, word);
    else throw new Error('複数文字の終端記号はスペースで区切ってください。');
  }
  const unknown = symbols.find(s => !model.alphabet.includes(s));
  if (unknown) throw new Error(`「${unknown}」は終端記号に含まれていません。`);
  let current = epsilonClosure(model, [model.start]);
  const steps = [{ states: current, symbol: null, edges: [] }];
  for (const symbol of symbols) {
    const edges = model.transitions.map((t, i) => current.includes(t.from) && t.symbol === symbol ? i : -1).filter(i => i >= 0);
    current = epsilonClosure(model, [...new Set(edges.map(i => model.transitions[i].to))]);
    steps.push({ states: current, symbol, edges });
  }
  return { steps, symbols, accepted: current.some(s => model.finals.includes(s)) };
}
export const examples = {
  nfa: { title: 'aa⁺ または ab⁺ を受理する NFA', states: layout(['S', 'A', 'B', '#'].map(id => ({ id }))), alphabet: ['a', 'b'], start: 'S', finals: ['#'], transitions: parseNotation('(S,a,A)(S,a,B)(A,a,A)(A,a,#)(B,b,B)(B,b,#)', 'triples') },
  dfa: { title: 'a(ba)* を受理する DFA', states: layout(['S', 'A'].map(id => ({ id }))), alphabet: ['a', 'b'], start: 'S', finals: ['A'], transitions: parseNotation('(S,a,A)(A,b,S)', 'triples') },
  binary: { title: '1 が偶数個の二進文字列', states: layout(['q0', 'q1'].map(id => ({ id }))), alphabet: ['0', '1'], start: 'q0', finals: ['q0'], transitions: parseNotation('(q0,0,q0)(q0,1,q1)(q1,0,q1)(q1,1,q0)', 'triples') },
  empty: { title: '新しいオートマトン', states: [{ id: 'S', x: 230, y: 245 }], alphabet: ['a', 'b'], start: 'S', finals: [], transitions: [] }
};
