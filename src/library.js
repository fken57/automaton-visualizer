import { validateModel } from './model.js';

export const LIBRARY_SCHEMA = 'automaton-studio-library';
export const MAX_AUTOMATA = 50;
export function newEntry(model) { return { id: crypto.randomUUID(), model: validateModel(model) }; }
export function validateLibrary(input) {
  if (!input || input.schema !== LIBRARY_SCHEMA || input.version !== 1 || !Array.isArray(input.items) || !input.items.length || input.items.length > MAX_AUTOMATA) throw new Error('一覧のJSON形式が不正です。オートマトンは1〜50個保存できます。');
  const ids = new Set();
  const items = input.items.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('一覧の識別子が不正、または重複しています。');
    ids.add(item.id); return { id: item.id, model: validateModel(item.model) };
  });
  if (!ids.has(input.activeId)) throw new Error('一覧の選択中オートマトンが見つかりません。');
  return { schema: LIBRARY_SCHEMA, version: 1, activeId: input.activeId, items };
}
export function createLibrary(model) {
  const entry = newEntry(model);
  return { schema: LIBRARY_SCHEMA, version: 1, activeId: entry.id, items: [entry] };
}
export function updateEntry(library, id, model) {
  if (!library.items.some(item => item.id === id)) throw new Error('保存先のオートマトンが見つかりません。');
  const checked = validateModel(model);
  return { ...library, items: library.items.map(item => item.id === id ? { ...item, model: checked } : item) };
}
