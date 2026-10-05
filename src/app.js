import { EPSILON, tokens, validToken, validateModel, examples, layout, applyTransitions, parseNotation, formatNotation, automatonType, simulate, escapeXML as e } from './model.js';
import { graphContent, exportSVG, exportCollectionSVG } from './graph.js';
import { LIBRARY_SCHEMA, MAX_AUTOMATA, createLibrary, newEntry, validateLibrary, updateEntry } from './library.js';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const storageKey = 'automaton-studio-v1';
const libraryKey = 'automaton-studio-library-v1';
let model = clone(examples.nfa);
let storageOK = true;
try { const saved = localStorage.getItem(storageKey); if (saved) model = validateModel(JSON.parse(saved)); } catch { storageOK = false; }
let library = createLibrary(model);
try { const saved = localStorage.getItem(libraryKey); if (saved) library = validateLibrary(JSON.parse(saved)); } catch { storageOK = false; }
model = clone(library.items.find(item => item.id === library.activeId).model);
const histories = new Map();
let recentlyDeleted = null;
let past = [], future = [], selected = null, tool = 'move', edgeSource = null, edgeTarget = null;
let notationKind = 'triples', drafts = {}, simulation = null, stepIndex = 0, drag = null;
let toastTimer;
function toast(message, error = false) {
  $('toast').textContent = message; $('toast').className = `toast visible${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').className = 'toast', 4500);
}
function safely(action) { try { action(); } catch (error) { toast(error.message, true); } }
function persist() {
  library = updateEntry(library, library.activeId, model);
  try { localStorage.setItem(libraryKey, JSON.stringify(library)); storageOK = true; } catch { storageOK = false; }
  $('saved').innerHTML = storageOK ? '<i></i>ブラウザに自動保存' : '<i class="warning"></i>自動保存不可 · JSONで保存';
}
function commit(next) {
  const checked = validateModel(next);
  if (JSON.stringify(checked) === JSON.stringify(model)) return;
  past.push(clone(model)); if (past.length > 80) past.shift(); future = []; model = checked;
  simulation = null; edgeSource = null; persist(); render();
}
function travel(direction) {
  const source = direction === 'undo' ? past : future, target = direction === 'undo' ? future : past;
  if (!source.length) return;
  target.push(clone(model)); model = source.pop(); selected = null; edgeSource = null; simulation = null; persist(); render();
}
function optionList(values, chosen) { return values.map(id => `<option value="${e(id)}"${id === chosen ? ' selected' : ''}>${e(id)}</option>`).join(''); }
function renderLibrary() {
  const list = $('automaton-list');
  const ids = library.items.map(item => item.id);
  if (JSON.stringify([...list.children].map(b => b.dataset.automaton)) !== JSON.stringify(ids)) {
    list.innerHTML = ids.map(id => `<button class="automaton-tab" data-automaton="${id}" role="tab"></button>`).join('');
  }
  for (const button of list.children) {
    const item = library.items.find(item => item.id === button.dataset.automaton), active = item.id === library.activeId;
    const title = active ? model.title : item.model.title;
    button.textContent = title; button.title = title; button.classList.toggle('active', active); button.setAttribute('aria-selected', active);
  }
  $('library-count').textContent = `${library.items.length} 個`;
  $('delete-automaton').disabled = library.items.length === 1;
  $('restore-automaton').hidden = !recentlyDeleted;
  $('add-automaton').disabled = $('duplicate-automaton').disabled = library.items.length >= MAX_AUTOMATA;
}
function switchAutomaton(id) {
  if (id === library.activeId) return;
  const entry = library.items.find(item => item.id === id); if (!entry) return;
  persist(); histories.set(library.activeId, { past, future, drafts });
  library.activeId = id; model = clone(entry.model);
  const history = histories.get(id) || { past: [], future: [], drafts: {} };
  past = history.past; future = history.future; drafts = history.drafts;
  selected = null; simulation = null; edgeSource = null; drag = null;
  persist(); render(); setTool('move');
}
function addAutomaton(source) {
  if (library.items.length >= MAX_AUTOMATA) throw new Error('保存できるオートマトンは50個までです。');
  persist(); const entry = newEntry(source); library.items.push(entry); switchAutomaton(entry.id);
}
function render() {
  if (selected?.state && !model.states.some(s => s.id === selected.state)) selected = null;
  if (selected?.edge >= model.transitions.length) selected = null;
  const ids = model.states.map(s => s.id);
  $('project-title').value = model.title;
  $('states-input').value = ids.join(', ');
  $('alphabet-input').value = model.alphabet.join(', ');
  $('start-input').innerHTML = optionList(ids, model.start);
  $('final-input').innerHTML = ids.map(id => `<button class="state-chip${model.finals.includes(id) ? ' chosen' : ''}" data-final="${e(id)}" aria-pressed="${model.finals.includes(id)}"><span>${model.finals.includes(id) ? '◎' : '○'}</span> ${e(id)}</button>`).join('');
  $('transition-count').textContent = `${model.transitions.length} rules`;
  $('transition-list').innerHTML = model.transitions.length ? model.transitions.map((t, i) => `<div class="transition-row" data-row="${i}"><select data-part="from" aria-label="遷移${i + 1}の遷移元">${optionList(ids, t.from)}</select><input data-part="symbol" aria-label="遷移${i + 1}の入力記号" maxlength="32" value="${e(t.symbol)}" list="symbol-options"/><select data-part="to" aria-label="遷移${i + 1}の遷移先">${optionList(ids, t.to)}</select><button class="remove-rule" data-remove="${i}" aria-label="遷移${i + 1}を削除">×</button></div>`).join('') : '<p class="empty-rules">遷移を追加して設計をはじめよう。</p>';
  $('symbol-options').innerHTML = [...model.alphabet, EPSILON].map(s => `<option value="${e(s)}"></option>`).join('');
  $('type-badge').textContent = automatonType(model);
  $('undo').disabled = !past.length; $('redo').disabled = !future.length;
  $('graph-stats').textContent = `${ids.length} states / ${model.transitions.length} transitions`;
  $('formal-definition').innerHTML = `<div><span>K</span><code>{ ${ids.map(e).join(', ')} }</code></div><div><span>T</span><code>{ ${model.alphabet.map(e).join(', ')} }</code></div><div><span>q₀</span><code>${e(model.start)}</code></div><div><span>F</span><code>{ ${model.finals.map(e).join(', ')} }</code></div>`;
  renderLibrary(); renderGraph(); renderSelection(); renderNotation(); renderSimulation();
}
function renderGraph() {
  const active = simulation?.steps[stepIndex];
  $('graph').innerHTML = graphContent(model, { selected, activeStates: active?.states, activeEdges: active?.edges, edgeSource });
}
function renderSelection() {
  const panel = $('selection-panel');
  if (selected?.state) {
    const id = selected.state;
    panel.innerHTML = `<div class="selection-top"><span>状態 <strong>${e(id)}</strong></span><button class="text-button danger" id="delete-selected">削除</button></div><div class="selection-fields"><label>状態名<input id="rename-state" value="${e(id)}" maxlength="32" /></label><label class="checkbox-label"><input type="checkbox" id="selected-start"${model.start === id ? ' checked' : ''}/>出発状態</label><label class="checkbox-label"><input type="checkbox" id="selected-final"${model.finals.includes(id) ? ' checked' : ''}/>終了状態</label></div>`;
    $('rename-state').addEventListener('blur', event => safely(() => {
      const name = event.target.value.trim();
      if (!validToken(name)) throw new Error('状態名は32文字以内の文字・数字・_ # . $ - で入力してください。');
      if (name !== id && model.states.some(s => s.id === name)) throw new Error('この状態名はすでに使われています。');
      const next = clone(model);
      next.states = next.states.map(s => s.id === id ? { ...s, id: name } : s);
      next.start = next.start === id ? name : next.start; next.finals = next.finals.map(s => s === id ? name : s);
      next.transitions = next.transitions.map(t => ({ from: t.from === id ? name : t.from, symbol: t.symbol, to: t.to === id ? name : t.to }));
      selected = { state: name }; commit(next);
    }));
    $('rename-state').addEventListener('keydown', event => { if (event.key === 'Enter') event.target.blur(); });
    $('selected-start').addEventListener('change', event => { if (event.target.checked) commit({ ...model, start: id }); else { event.target.checked = true; toast('別の状態を出発状態として指定してください。'); } });
    $('selected-final').addEventListener('change', () => toggleFinal(id));
    $('delete-selected').addEventListener('click', () => safely(deleteSelected));
  } else if (selected?.edge !== undefined) {
    const t = model.transitions[selected.edge];
    panel.innerHTML = `<div class="selection-top"><span>遷移 <strong>${e(t.from)} -${e(t.symbol)}→ ${e(t.to)}</strong></span><button class="text-button danger" id="delete-selected">削除</button></div><span class="muted">左の遷移規則から編集できます。同じ経路の遷移は図でまとめて表示します。</span>`;
    $('delete-selected').addEventListener('click', () => safely(deleteSelected));
  } else panel.innerHTML = '<span class="muted">状態や矢印を選択して編集できます。</span>';
}
function renderNotation() {
  document.querySelectorAll('[data-notation]').forEach(b => { const active = b.dataset.notation === notationKind; b.classList.toggle('active', active); b.setAttribute('aria-selected', active); });
  const pending = Object.hasOwn(drafts, notationKind);
  $('notation-input').value = pending ? drafts[notationKind] : formatNotation(model, notationKind);
  $('notation-description').textContent = notationKind === 'triples' ? '（遷移元, 入力記号, 遷移先）' : '遷移元 ─入力記号→ 遷移先';
  $('notation-status').textContent = pending ? '未反映の編集があります' : '図と同期しています';
  $('notation-status').classList.toggle('pending', pending);
  $('notation-error').textContent = '';
}
function toggleFinal(id) { commit({ ...model, finals: model.finals.includes(id) ? model.finals.filter(s => s !== id) : [...model.finals, id] }); }
function deleteSelected() {
  if (selected?.state) {
    if (model.states.length === 1) throw new Error('状態は少なくとも1つ必要です。');
    const id = selected.state, states = model.states.filter(s => s.id !== id);
    const next = { ...model, states, start: model.start === id ? states[0].id : model.start, finals: model.finals.filter(s => s !== id), transitions: model.transitions.filter(t => t.from !== id && t.to !== id) };
    selected = null; commit(next);
  } else if (selected?.edge !== undefined) { const index = selected.edge; selected = null; commit({ ...model, transitions: model.transitions.filter((_, i) => i !== index) }); }
}
function setTool(next) {
  tool = next; edgeSource = null;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  $('graph').classList.toggle('adding', tool !== 'move');
  $('tool-hint').textContent = tool === 'edge' ? '遷移元 → 遷移先の順にクリック · 同じ状態で自己遷移' : tool === 'state' ? '空白をクリックして状態を追加' : '状態をドラッグして移動 · 空白をダブルクリックして追加';
  renderGraph();
}
function addState(point) {
  let n = 0; while (model.states.some(s => s.id === `q${n}`)) n++;
  const id = `q${n}`; selected = { state: id };
  commit({ ...model, states: [...model.states, { id, x: Math.max(95, Math.min(705, point.x)), y: Math.max(115, Math.min(400, point.y)) }] });
}
function graphPoint(event) { const p = new DOMPoint(event.clientX, event.clientY).matrixTransform($('graph').getScreenCTM().inverse()); return { x: p.x, y: p.y }; }
function openEdge(from, to) {
  edgeSource = from; edgeTarget = to; $('edge-title').textContent = `${from} → ${to}`;
  $('edge-symbol').value = model.alphabet[0] || 'a'; $('edge-dialog').showModal(); $('edge-symbol').focus(); $('edge-symbol').select();
}
function renderSimulation() {
  const output = $('simulation-output');
  if (!simulation) { output.innerHTML = '<span class="muted">語を入力して、状態の変化と受理結果を確認できます。</span><small>空欄は空語 ε。複数文字の記号はスペースで区切ります。</small>'; return; }
  const done = stepIndex === simulation.steps.length - 1;
  output.innerHTML = `<div class="simulation-result"><span class="result-badge ${done ? simulation.accepted ? 'accepted' : 'rejected' : ''}">${done ? simulation.accepted ? '✓ 受理' : '× 不受理' : '遷移を確認中'}</span><span class="muted">${stepIndex} / ${simulation.symbols.length} 記号を消費</span><button class="text-button" id="reset-simulation">リセット</button></div><div class="step-list">${simulation.steps.map((s, i) => `<button class="step${i === stepIndex ? ' current' : ''}" data-step="${i}" aria-label="ステップ${i}: ${e(s.states.join(', ') || '到達状態なし')}"><small>${i === 0 ? 'START' : e(s.symbol)}</small><code>{${s.states.map(e).join(', ') || '∅'}}</code></button>${i < simulation.steps.length - 1 ? '<span class="step-arrow">→</span>' : ''}`).join('')}</div>`;
  $('reset-simulation').addEventListener('click', () => { simulation = null; renderSimulation(); renderGraph(); });
}
function download(blob, extension, label = model.title) {
  const name = label.replace(/[<>:"/\\|?*\x00-\x1f]/gu, '_') || 'automaton';
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = `${name}.${extension}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function savePNG(batch = false) {
  const button = batch ? $('export-all-png') : $('export-png'); button.disabled = true;
  try {
    persist();
    const output = batch ? exportCollectionSVG(library.items.map(item => item.model)) : { svg: exportSVG(model), width: 1600, height: 1040 };
    await document.fonts.ready;
    const url = URL.createObjectURL(new Blob([output.svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('図の画像変換に失敗しました。')); img.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = output.width; canvas.height = output.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG保存に失敗しました。');
      $('png-preview').src = canvas.toDataURL('image/png'); $('preview-png').hidden = false;
      $('png-dimensions').textContent = `PNG PREVIEW · ${output.width} × ${output.height}`;
      download(blob, 'png', batch ? 'オートマトン一覧' : model.title); toast(`${batch ? `${library.items.length}個をまとめた` : ''}PNGを保存しました · ${output.width} × ${output.height} px`);
    } finally { URL.revokeObjectURL(url); }
  } catch (error) { toast(error.message, true); } finally { button.disabled = false; }
}

$('project-title').addEventListener('blur', event => commit({ ...model, title: event.target.value.trim() || '無題のオートマトン' }));
$('states-input').addEventListener('blur', event => {
  try {
    const names = tokens(event.target.value);
    if (!names.length || names.length > 100 || !names.every(validToken) || new Set(names).size !== names.length) throw new Error('重複しない状態名を1〜100個入力してください（各32文字以内）。');
    const added = names.some(id => !model.states.some(s => s.id === id));
    let states = names.map(id => model.states.find(s => s.id === id) || { id }); if (added) states = layout(states);
    commit({ ...model, states, start: names.includes(model.start) ? model.start : names[0], finals: model.finals.filter(id => names.includes(id)), transitions: model.transitions.filter(t => names.includes(t.from) && names.includes(t.to)) });
  } catch (error) { toast(error.message, true); event.target.value = model.states.map(s => s.id).join(', '); }
});
$('alphabet-input').addEventListener('blur', event => {
  try {
    const alphabet = tokens(event.target.value);
    if (!alphabet.every(validToken) || alphabet.includes(EPSILON)) throw new Error('終端記号を正しく入力してください。ε は遷移規則で指定します。');
    commit({ ...model, alphabet, transitions: model.transitions.filter(t => alphabet.includes(t.symbol) || t.symbol === EPSILON) });
  } catch (error) { toast(error.message, true); event.target.value = model.alphabet.join(', '); }
});
$('start-input').addEventListener('change', event => commit({ ...model, start: event.target.value }));
$('final-input').addEventListener('click', event => { const b = event.target.closest('[data-final]'); if (b) toggleFinal(b.dataset.final); });
function editTransition(event) {
  const row = event.target.closest('[data-row]'); if (!row) return;
  const next = clone(model), t = next.transitions[Number(row.dataset.row)], value = event.target.value.trim();
  if (!validToken(value)) { toast('有効な状態名・入力記号を指定してください。', true); render(); return; }
  t[event.target.dataset.part] = value;
  if (t.symbol !== EPSILON && !next.alphabet.includes(t.symbol)) next.alphabet.push(t.symbol);
  safely(() => commit(next));
}
$('transition-list').addEventListener('change', event => { if (event.target.tagName === 'SELECT') editTransition(event); });
$('transition-list').addEventListener('focusout', event => { if (event.target.tagName === 'INPUT') editTransition(event); });
$('transition-list').addEventListener('click', event => { const b = event.target.closest('[data-remove]'); if (b) { selected = null; commit({ ...model, transitions: model.transitions.filter((_, i) => i !== Number(b.dataset.remove)) }); } });
$('add-transition').addEventListener('click', () => openEdge(selected?.state || model.start, model.states.find(s => s.id !== (selected?.state || model.start))?.id || model.start));
$('edge-form').addEventListener('submit', event => {
  event.preventDefault();
  safely(() => {
    const symbol = $('edge-symbol').value.trim(); if (!validToken(symbol)) throw new Error('入力記号を正しく指定してください。');
    const next = applyTransitions(model, [...model.transitions, { from: edgeSource, symbol, to: edgeTarget }]);
    $('edge-dialog').close(); selected = null; commit(next); edgeSource = null; renderGraph();
  });
});
function cancelEdge() { $('edge-dialog').close(); edgeSource = null; renderGraph(); }
$('cancel-edge').addEventListener('click', cancelEdge);
$('edge-dialog').addEventListener('cancel', () => { edgeSource = null; renderGraph(); });
$('undo').addEventListener('click', () => travel('undo')); $('redo').addEventListener('click', () => travel('redo'));
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('auto-layout').addEventListener('click', () => commit({ ...model, states: layout(model.states) }));
$('graph').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const node = event.target.closest('[data-state]'), edge = event.target.closest('[data-edge]');
  if (node) {
    const id = node.dataset.state;
    if (tool === 'edge') {
      if (!edgeSource) { edgeSource = id; selected = { state: id }; renderGraph(); renderSelection(); }
      else openEdge(edgeSource, id);
    } else {
      selected = { state: id }; renderSelection();
      const state = model.states.find(s => s.id === id), p = graphPoint(event);
      drag = { id, before: clone(model), pointerId: event.pointerId, offsetX: state.x - p.x, offsetY: state.y - p.y };
      $('graph').setPointerCapture(event.pointerId); renderGraph();
    }
  } else if (edge) { selected = { edge: Number(edge.dataset.edge) }; renderGraph(); renderSelection(); }
  else if (tool === 'state') safely(() => addState(graphPoint(event)));
  else { selected = null; edgeSource = null; renderGraph(); renderSelection(); }
});
$('graph').addEventListener('pointermove', event => {
  if (!drag) return;
  const p = graphPoint(event), state = model.states.find(s => s.id === drag.id);
  state.x = Math.max(95, Math.min(705, p.x + drag.offsetX)); state.y = Math.max(115, Math.min(400, p.y + drag.offsetY)); renderGraph();
});
function finishDrag(event) {
  if (!drag) return;
  if ($('graph').hasPointerCapture(drag.pointerId)) $('graph').releasePointerCapture(drag.pointerId);
  if (event.type === 'pointercancel') { model = drag.before; drag = null; renderGraph(); return; }
  const next = clone(model), before = drag.before; drag = null; model = before; commit(next); renderGraph();
}
$('graph').addEventListener('pointerup', finishDrag); $('graph').addEventListener('pointercancel', finishDrag);
$('graph').addEventListener('dblclick', event => { if (tool === 'move' && !event.target.closest('[data-state],[data-edge]')) safely(() => addState(graphPoint(event))); });
$('graph').addEventListener('keydown', event => {
  const node = event.target.closest('[data-state]'), edge = event.target.closest('[data-edge]');
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (node) { const id = node.dataset.state; if (tool === 'edge' && edgeSource) openEdge(edgeSource, id); else { selected = { state: id }; if (tool === 'edge') edgeSource = id; renderSelection(); } } else if (edge) { selected = { edge: Number(edge.dataset.edge) }; renderSelection(); } }
  if (node && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const next = clone(model), state = next.states.find(s => s.id === node.dataset.state); state.x += event.key === 'ArrowRight' ? 10 : event.key === 'ArrowLeft' ? -10 : 0; state.y += event.key === 'ArrowDown' ? 10 : event.key === 'ArrowUp' ? -10 : 0; selected = { state: state.id }; commit(next); [...$('graph').querySelectorAll('[data-state]')].find(n => n.dataset.state === state.id)?.focus(); }
});
document.querySelectorAll('[data-notation]').forEach(b => b.addEventListener('click', () => { notationKind = b.dataset.notation; renderNotation(); }));
$('notation-input').addEventListener('input', event => {
  drafts[notationKind] = event.target.value; $('notation-status').textContent = '未反映の編集があります'; $('notation-status').classList.add('pending'); $('notation-error').textContent = '';
});
$('apply-notation').addEventListener('click', () => {
  try {
    const transitions = parseNotation($('notation-input').value, notationKind);
    const next = validateModel(applyTransitions(model, transitions));
    delete drafts[notationKind]; selected = null; commit(next); renderNotation(); toast('図と定義に反映しました。');
  } catch (error) { $('notation-error').textContent = error.message; }
});
$('copy-notation').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('notation-input').value); toast('記法をコピーしました。'); }
  catch { $('notation-input').focus(); $('notation-input').select(); toast('テキストを選択しました。Ctrl / ⌘ + C でコピーできます。'); }
});
$('simulation-form').addEventListener('submit', event => { event.preventDefault(); safely(() => { simulation = simulate(model, $('word-input').value); stepIndex = simulation.steps.length - 1; selected = null; renderSimulation(); renderGraph(); renderSelection(); }); });
$('simulation-output').addEventListener('click', event => { const b = event.target.closest('[data-step]'); if (b) { stepIndex = Number(b.dataset.step); renderSimulation(); renderGraph(); } });
$('word-input').addEventListener('input', () => { if (simulation) { simulation = null; renderSimulation(); renderGraph(); } });
$('load-example').addEventListener('click', () => $('confirm-dialog').showModal());
$('cancel-example').addEventListener('click', () => $('confirm-dialog').close());
$('confirm-example').addEventListener('click', () => { drafts = {}; selected = null; $('confirm-dialog').close(); commit(clone(examples[$('example-select').value])); render(); toast('サンプルを読み込みました。'); });
$('export-png').addEventListener('click', () => savePNG());
$('export-all-png').addEventListener('click', () => savePNG(true));
$('automaton-list').addEventListener('click', event => { const button = event.target.closest('[data-automaton]'); if (button) switchAutomaton(button.dataset.automaton); });
$('add-automaton').addEventListener('click', () => safely(() => addAutomaton({ ...clone(examples.empty), title: `オートマトン ${library.items.length + 1}` })));
$('duplicate-automaton').addEventListener('click', () => safely(() => addAutomaton({ ...clone(model), title: `${model.title}（コピー）`.slice(0, 80) })));
$('delete-automaton').addEventListener('click', () => { $('delete-automaton-title').textContent = `「${model.title}」を一覧から削除しますか？`; $('delete-automaton-dialog').showModal(); });
$('cancel-delete-automaton').addEventListener('click', () => $('delete-automaton-dialog').close());
$('confirm-delete-automaton').addEventListener('click', () => {
  if (library.items.length <= 1) return;
  persist(); const id = library.activeId, index = library.items.findIndex(item => item.id === id);
  recentlyDeleted = { entry: clone(library.items[index]), index };
  switchAutomaton(library.items[index === 0 ? 1 : index - 1].id);
  library.items = library.items.filter(item => item.id !== id); histories.delete(id); persist(); renderLibrary();
  $('delete-automaton-dialog').close(); toast('一覧から削除しました。「削除を戻す」で復元できます。');
});
$('restore-automaton').addEventListener('click', () => safely(() => {
  if (!recentlyDeleted) return;
  if (library.items.length >= MAX_AUTOMATA) throw new Error('保存数が上限です。50個未満にしてください。');
  const { entry, index } = recentlyDeleted; recentlyDeleted = null;
  library.items.splice(index, 0, entry); switchAutomaton(entry.id); renderLibrary();
}));
$('preview-png').addEventListener('click', () => $('png-dialog').showModal());
$('close-png').addEventListener('click', () => $('png-dialog').close());
$('export-json').addEventListener('click', () => { persist(); download(new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' }), 'json', 'オートマトン一覧'); toast(`${library.items.length}個のオートマトンをJSONで保存しました。`); });
$('import-json').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('JSONは10MB以下にしてください。');
    const input = JSON.parse(await file.text());
    if (input.schema === LIBRARY_SCHEMA) {
      const imported = validateLibrary(input);
      if (library.items.length + imported.items.length > MAX_AUTOMATA) throw new Error('読み込み後の保存数が50個を超えます。');
      persist(); const entries = imported.items.map(item => newEntry(item.model));
      const activeIndex = imported.items.findIndex(item => item.id === imported.activeId);
      library.items.push(...entries); switchAutomaton(entries[activeIndex].id);
    } else addAutomaton(validateModel(input));
    toast('JSONのオートマトンを一覧に追加しました。');
  } catch (error) { toast(`読み込み失敗: ${error.message}`, true); } finally { event.target.value = ''; }
});
$('help-button').addEventListener('click', () => $('help-dialog').showModal()); $('close-help').addEventListener('click', () => $('help-dialog').close());
document.addEventListener('keydown', event => {
  if (event.target.closest('input,textarea,select,[contenteditable]') || document.querySelector('dialog[open]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); travel(event.shiftKey ? 'redo' : 'undo'); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); travel('redo'); }
  if (event.key === 'Delete' || event.key === 'Backspace') { if (selected) { event.preventDefault(); safely(deleteSelected); } }
  if (event.key === 'Escape') { selected = null; edgeSource = null; setTool('move'); renderSelection(); }
  if (event.key === '?') $('help-dialog').showModal();
});
render(); persist();
