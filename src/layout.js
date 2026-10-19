// Keep space for circles, labels, self-loops and the incoming start arrow.
export function graphBounds(states) {
  return { width: Math.max(800, ...states.map(s => s.x + 130)), height: Math.max(520, ...states.map(s => s.y + 130)) };
}

export function layout(states, transitions = [], start = states[0]?.id) {
  if (!states.length) return [];
  const neighbors = new Map(states.map(s => [s.id, new Set()]));
  for (const { from, to } of transitions) {
    if (from !== to && neighbors.has(from) && neighbors.has(to)) {
      neighbors.get(from).add(to); neighbors.get(to).add(from);
    }
  }
  const positions = new Map(), visited = new Set();
  let top = 125;
  for (const root of [start, ...neighbors.keys()]) {
    if (!neighbors.has(root) || visited.has(root)) continue;
    const layers = [[root]], rank = new Map([[root, 0]]), queue = [root];
    visited.add(root);
    for (let i = 0; i < queue.length; i++) {
      for (const id of neighbors.get(queue[i])) if (!visited.has(id)) {
        const level = rank.get(queue[i]) + 1;
        (layers[level] ||= []).push(id); rank.set(id, level); visited.add(id); queue.push(id);
      }
    }
    const edges = [];
    for (const id of queue) for (const other of neighbors.get(id)) {
      if (rank.get(id) < rank.get(other)) edges.push([id, other]);
    }
    const order = () => new Map(layers.flatMap(layer => layer.map((id, i) => [id, i])));
    const crossings = () => {
      const index = order(); let count = 0;
      for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
        const [a, b] = edges[i], [c, d] = edges[j];
        if (rank.get(a) === rank.get(c) && (index.get(a) - index.get(c)) * (index.get(b) - index.get(d)) < 0) count++;
      }
      return count;
    };
    let best = layers.map(layer => [...layer]), bestScore = crossings();
    // ponytail: bounded median sweeps reduce crossings; arbitrary nonplanar graphs cannot guarantee zero.
    for (let pass = 0; pass < 8 && bestScore; pass++) {
      const forward = pass % 2 === 0;
      for (let step = 0; step < layers.length; step++) {
        const level = forward ? step : layers.length - 1 - step, index = order();
        const median = id => {
          const values = [...neighbors.get(id)].filter(n => rank.get(n) === level + (forward ? -1 : 1)).map(n => index.get(n)).sort((a, b) => a - b);
          return values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : index.get(id);
        };
        const medians = new Map(layers[level].map(id => [id, median(id)]));
        layers[level].sort((a, b) => medians.get(a) - medians.get(b));
      }
      const score = crossings();
      if (score < bestScore) { best = layers.map(layer => [...layer]); bestScore = score; }
    }
    const height = Math.max(240, (Math.max(...best.map(layer => layer.length)) - 1) * 180);
    const width = Math.max(540, (best.length - 1) * 180);
    best.forEach((layer, col) => layer.forEach((id, row) => positions.set(id, {
      x: best.length === 1 ? 400 : 130 + col * width / (best.length - 1),
      y: top + height / 2 + (row - (layer.length - 1) / 2) * 180
    })));
    top += height + 240;
  }
  // Pack isolated states instead of stacking one component per row.
  const isolated = states.filter(s => !neighbors.get(s.id).size);
  if (isolated.length > 1) {
    const connected = states.filter(s => neighbors.get(s.id).size);
    const y = connected.length ? Math.max(...connected.map(s => positions.get(s.id).y)) + 240 : 125;
    const cols = Math.ceil(Math.sqrt(isolated.length));
    isolated.forEach((s, i) => positions.set(s.id, { x: 130 + i % cols * 180, y: y + Math.floor(i / cols) * 180 }));
  }
  return states.map(s => ({ ...s, ...positions.get(s.id) }));
}
