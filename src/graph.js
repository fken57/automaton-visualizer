import { escapeXML as e } from './model.js';
import { graphBounds } from './layout.js';
export function edgeGeometry(from, to, reverse = false, states = [], label = '', mode = 'standard') {
  const bounds = graphBounds(states.length ? states : [from, to], mode);
  const obstacles = states.filter(s => s.id !== from.id && s.id !== to.id);
  const score = g => {
    let penalty = 0;
    const halfLabel = Math.max(16, label.length * 6);
    if (g.x - halfLabel < 6 || g.x + halfLabel > bounds.width - 6 || g.y - 13 < 6 || g.y + 13 > bounds.height - 6) penalty += 10000;
    for (const p of g.points) {
      if (p.x < 12 || p.y < 12 || p.x > bounds.width - 12 || p.y > bounds.height - 12) penalty += 10000;
      for (const s of obstacles) penalty += Math.max(0, 52 - Math.hypot(s.x - p.x, s.y - p.y)) * 100;
    }
    for (const s of obstacles) {
      const dx = Math.max(0, Math.abs(s.x - g.x) - Math.max(16, label.length * 6));
      const dy = Math.max(0, Math.abs(s.y - g.y) - 13);
      penalty += Math.max(0, 44 - Math.hypot(dx, dy)) * 100;
    }
    return penalty;
  };
  if (from.id === to.id) {
    let best, bestScore = Infinity;
    for (const angle of [-Math.PI / 2, Math.PI / 2, 0, Math.PI, -Math.PI / 4, Math.PI / 4, -3 * Math.PI / 4, 3 * Math.PI / 4]) {
      const point = (u, v) => ({ x: from.x + Math.cos(angle) * u - Math.sin(angle) * v, y: from.y + Math.sin(angle) * u + Math.cos(angle) * v });
      const a = point(28, -21), b = point(119, -85), c = point(119, 85), d = point(28, 21), text = point(103, 0);
      const points = Array.from({ length: 33 }, (_, i) => {
        const t = i / 32, u = 1 - t;
        return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y };
      });
      const g = { d: `M ${a.x} ${a.y} C ${b.x} ${b.y}, ${c.x} ${c.y}, ${d.x} ${d.y}`, x: text.x, y: text.y, points };
      const cost = score(g);
      if (cost < bestScore) { best = g; bestScore = cost; }
      if (!cost) break;
    }
    return best;
  }
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const curve = bend => {
    const cx = (from.x + to.x) / 2 - uy * bend, cy = (from.y + to.y) / 2 + ux * bend;
    const a = Math.atan2(cy - from.y, cx - from.x), b = Math.atan2(cy - to.y, cx - to.x);
    const sx = from.x + Math.cos(a) * 36, sy = from.y + Math.sin(a) * 36;
    const ex = to.x + Math.cos(b) * 40, ey = to.y + Math.sin(b) * 40;
    const points = Array.from({ length: 33 }, (_, i) => {
      const t = i / 32, u = 1 - t;
      return { x: u * u * sx + 2 * u * t * cx + t * t * ex, y: u * u * sy + 2 * u * t * cy + t * t * ey };
    });
    return { d: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`, x: (sx + 2 * cx + ex) / 4 + (Math.abs(dx) < 40 ? 24 : 0), y: (sy + 2 * cy + ey) / 4 - (Math.abs(dx) < 40 ? 0 : 12), points };
  };
  let best = curve(reverse ? 45 : 0), bestScore = score(best);
  if (!bestScore) return best;
  for (const bend of reverse ? [90, 180, 300, 450, 650] : [90, -90, 180, -180, 300, -300, 450, -450, 650, -650]) {
    const candidate = curve(bend), cost = score(candidate);
    if (cost < bestScore) { best = candidate; bestScore = cost; }
    if (!cost) break;
  }
  return best;
}
export function graphContent(model, { selected = null, activeStates = [], activeEdges = [], exporting = false, edgeSource = null, markerId = exporting ? 'export-arrow' : 'graph-arrow' } = {}) {
  const groups = new Map();
  model.transitions.forEach((t, i) => {
    const key = JSON.stringify([t.from, t.to]);
    if (!groups.has(key)) groups.set(key, { ...t, symbols: [], indices: [] });
    groups.get(key).symbols.push(t.symbol); groups.get(key).indices.push(i);
  });
  const edgeHTML = [...groups.values()].map(t => {
    const from = model.states.find(s => s.id === t.from), to = model.states.find(s => s.id === t.to);
    const label = t.symbols.join(', ');
    const g = edgeGeometry(from, to, groups.has(JSON.stringify([t.to, t.from])), model.states, label, model.layoutMode);
    const selectedEdge = !exporting && t.indices.includes(selected?.edge), active = !exporting && t.indices.some(i => activeEdges.includes(i));
    const color = exporting ? '#202c29' : active || selectedEdge ? '#24715c' : '#596c63';
    return `<g data-edge="${t.indices[0]}" class="graph-edge" role="button" tabindex="0" aria-label="${e(`${t.from} から ${t.to}、記号 ${label}`)}"><path d="${g.d}" fill="none" stroke="transparent" stroke-width="18"/><path d="${g.d}" fill="none" stroke="${color}" stroke-width="${active || selectedEdge ? 3 : 2}" marker-end="url(#${markerId})"/><rect x="${g.x - Math.max(16, label.length * 6)}" y="${g.y - 13}" width="${Math.max(32, label.length * 12)}" height="25" rx="7" fill="${exporting ? '#ffffff' : '#fbfcfa'}"/><text x="${g.x}" y="${g.y + 5}" fill="${color}" text-anchor="middle" font-size="18" font-family="sans-serif">${e(label)}</text></g>`;
  }).join('');
  const nodeHTML = model.states.map(s => {
    const chosen = !exporting && (selected?.state === s.id || edgeSource === s.id), active = !exporting && activeStates.includes(s.id);
    const fill = exporting ? '#fff' : active ? '#d5e9dc' : chosen ? '#e5eee7' : '#fbfcfa';
    const stroke = exporting ? '#202c29' : chosen || active ? '#24715c' : '#596c63';
    return `<g data-state="${e(s.id)}" class="graph-node" tabindex="0" role="button" aria-label="状態 ${e(s.id)}${model.start === s.id ? '、出発状態' : ''}${model.finals.includes(s.id) ? '、終了状態' : ''}">${model.start === s.id ? `<path d="M ${s.x - 86} ${s.y} L ${s.x - 41} ${s.y}" stroke="${stroke}" stroke-width="2" marker-end="url(#${markerId})" fill="none"/>` : ''}${chosen ? `<circle cx="${s.x}" cy="${s.y}" r="43" fill="none" stroke="#b4cabc" stroke-dasharray="4 5"/>` : ''}<circle cx="${s.x}" cy="${s.y}" r="35" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${model.finals.includes(s.id) ? `<circle cx="${s.x}" cy="${s.y}" r="28" fill="none" stroke="${stroke}" stroke-width="2"/>` : ''}<text x="${s.x}" y="${s.y + 7}" text-anchor="middle" fill="#223b30" font-family="sans-serif" font-size="${s.id.length > 4 ? Math.max(9, 54 / s.id.length) : 21}" font-weight="500">${e(s.id)}</text></g>`;
  }).join('');
  return `<defs><marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="${exporting ? '#202c29' : '#596c63'}" stroke-width="1.6"/></marker></defs>${edgeHTML}${nodeHTML}`;
}
function imageDimensions(width, height, scale = 2) {
  // Bound both the longest side and total pixels before allocating a PNG canvas.
  scale = Math.min(scale, 16384 / Math.max(width, height), Math.sqrt(26400000 / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
export function exportDimensions(model) {
  const bounds = graphBounds(model.states, model.layoutMode);
  return model.layoutMode === 'free' ? imageDimensions(bounds.width, bounds.height) : { width: 1600, height: 1040 };
}
export function exportSVG(model) {
  const bounds = graphBounds(model.states, model.layoutMode), output = exportDimensions(model);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}" viewBox="0 0 ${bounds.width} ${bounds.height}" style="background:white"><rect width="${bounds.width}" height="${bounds.height}" fill="white"/>${graphContent(model, { exporting: true })}</svg>`;
}
export function exportCollectionSVG(models) {
  if (!models.length || models.length > 50) throw new Error('まとめて出力できるオートマトンは1〜50個です。');
  const columns = models.length > 10 ? 2 : 1;
  const sizes = models.map(model => model.layoutMode === 'free' ? graphBounds(model.states, 'free') : { width: 800, height: 520 });
  const columnWidth = Math.max(800, ...sizes.map(size => size.width));
  const rows = Array.from({ length: Math.ceil(models.length / columns) }, (_, i) => Math.max(...sizes.slice(i * columns, (i + 1) * columns).map(size => size.height)) + 140);
  const offsets = [0]; rows.forEach(height => offsets.push(offsets.at(-1) + height));
  const width = columns * columnWidth, height = offsets.at(-1), scale = columns === 1 ? 2 : 1;
  const output = models.some(model => model.layoutMode === 'free') ? imageDimensions(width, height, scale) : { width: width * scale, height: height * scale };
  const panels = models.map((model, index) => {
    const chars = [...model.title];
    const lines = Array.from({ length: Math.max(1, Math.ceil(chars.length / 28)) }, (_, line) => chars.slice(line * 28, (line + 1) * 28).join(''));
    const row = Math.floor(index / columns), x = (index % columns) * columnWidth, y = offsets[row], size = sizes[index];
    const title = lines.map((line, i) => `<tspan x="40" y="${45 + i * 31}">${e(line)}</tspan>`).join('');
    const bounds = graphBounds(model.states, model.layoutMode);
    return `<g transform="translate(${x},${y})"><text font-family="sans-serif" font-size="24" font-weight="600" fill="#202c29">${title}</text><svg x="${(columnWidth - size.width) / 2}" y="120" width="${size.width}" height="${size.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">${graphContent(model, { exporting: true, markerId: `collection-${index}-arrow` })}</svg>${row < rows.length - 1 ? `<path d="M 30 ${rows[row] - 5} H ${columnWidth - 30}" stroke="#e2e7de"/>` : ''}</g>`;
  }).join('');
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/>${panels}</svg>`, ...output };
}
