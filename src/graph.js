import { escapeXML as e } from './model.js';
export function edgeGeometry(from, to, reverse = false) {
  if (from.id === to.id) {
    const sign = from.y > 260 ? 1 : -1;
    return { d: `M ${from.x - 21} ${from.y + sign * 28} C ${from.x - 85} ${from.y + sign * 119}, ${from.x + 85} ${from.y + sign * 119}, ${from.x + 21} ${from.y + sign * 28}`, x: from.x, y: from.y + sign * 96 };
  }
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, bend = reverse ? 45 : 0;
  const cx = (from.x + to.x) / 2 - uy * bend, cy = (from.y + to.y) / 2 + ux * bend;
  const a = Math.atan2(cy - from.y, cx - from.x), b = Math.atan2(cy - to.y, cx - to.x);
  const sx = from.x + Math.cos(a) * 36, sy = from.y + Math.sin(a) * 36;
  const ex = to.x + Math.cos(b) * 40, ey = to.y + Math.sin(b) * 40;
  return { d: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`, x: (sx + 2 * cx + ex) / 4 + (Math.abs(dx) < 40 ? 20 : 0), y: (sy + 2 * cy + ey) / 4 - (Math.abs(dx) < 40 ? 0 : 12) };
}
export function graphContent(model, { selected = null, activeStates = [], activeEdges = [], exporting = false, edgeSource = null } = {}) {
  const groups = new Map();
  model.transitions.forEach((t, i) => {
    const key = JSON.stringify([t.from, t.to]);
    if (!groups.has(key)) groups.set(key, { ...t, symbols: [], indices: [] });
    groups.get(key).symbols.push(t.symbol); groups.get(key).indices.push(i);
  });
  const edgeHTML = [...groups.values()].map(t => {
    const from = model.states.find(s => s.id === t.from), to = model.states.find(s => s.id === t.to);
    const g = edgeGeometry(from, to, groups.has(JSON.stringify([t.to, t.from])));
    const selectedEdge = !exporting && t.indices.includes(selected?.edge), active = !exporting && t.indices.some(i => activeEdges.includes(i));
    const color = exporting ? '#202c29' : active || selectedEdge ? '#24715c' : '#596c63';
    const label = t.symbols.join(', ');
    return `<g data-edge="${t.indices[0]}" class="graph-edge" role="button" tabindex="0" aria-label="${e(`${t.from} から ${t.to}、記号 ${label}`)}"><path d="${g.d}" fill="none" stroke="transparent" stroke-width="18"/><path d="${g.d}" fill="none" stroke="${color}" stroke-width="${active || selectedEdge ? 3 : 2}" marker-end="url(#${exporting ? 'export' : 'graph'}-arrow)"/><rect x="${g.x - Math.max(16, label.length * 6)}" y="${g.y - 13}" width="${Math.max(32, label.length * 12)}" height="25" rx="7" fill="${exporting ? '#ffffff' : '#fbfcfa'}"/><text x="${g.x}" y="${g.y + 5}" fill="${color}" text-anchor="middle" font-size="18" font-family="sans-serif">${e(label)}</text></g>`;
  }).join('');
  const nodeHTML = model.states.map(s => {
    const chosen = !exporting && (selected?.state === s.id || edgeSource === s.id), active = !exporting && activeStates.includes(s.id);
    const fill = exporting ? '#fff' : active ? '#d5e9dc' : chosen ? '#e5eee7' : '#fbfcfa';
    const stroke = exporting ? '#202c29' : chosen || active ? '#24715c' : '#596c63';
    return `<g data-state="${e(s.id)}" class="graph-node" tabindex="0" role="button" aria-label="状態 ${e(s.id)}${model.start === s.id ? '、出発状態' : ''}${model.finals.includes(s.id) ? '、終了状態' : ''}">${model.start === s.id ? `<path d="M ${s.x - 86} ${s.y} L ${s.x - 41} ${s.y}" stroke="${stroke}" stroke-width="2" marker-end="url(#${exporting ? 'export' : 'graph'}-arrow)" fill="none"/>` : ''}${chosen ? `<circle cx="${s.x}" cy="${s.y}" r="43" fill="none" stroke="#b4cabc" stroke-dasharray="4 5"/>` : ''}<circle cx="${s.x}" cy="${s.y}" r="35" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${model.finals.includes(s.id) ? `<circle cx="${s.x}" cy="${s.y}" r="28" fill="none" stroke="${stroke}" stroke-width="2"/>` : ''}<text x="${s.x}" y="${s.y + 7}" text-anchor="middle" fill="#223b30" font-family="sans-serif" font-size="${s.id.length > 4 ? Math.max(9, 54 / s.id.length) : 21}" font-weight="500">${e(s.id)}</text></g>`;
  }).join('');
  return `<defs><marker id="${exporting ? 'export' : 'graph'}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="${exporting ? '#202c29' : '#596c63'}" stroke-width="1.6"/></marker></defs>${edgeHTML}${nodeHTML}`;
}
export function exportSVG(model) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040" viewBox="0 0 800 520"><rect width="800" height="520" fill="white"/>${graphContent(model, { exporting: true })}</svg>`;
}
