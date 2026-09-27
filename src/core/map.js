// Map generation: a grid of rows the player climbs, connected by paths that
// never cross. Room types are assigned with a few pacing rules afterwards.

export const MAP_ROWS = 11; // rows 0..10, the boss sits above row 10
export const MAP_COLS = 7;
export const TREASURE_ROW = 5;
export const REST_ROW = MAP_ROWS - 1;
const PATHS = 6;

const WEIGHTS = { combat: 50, event: 22, rest: 12, elite: 9, shop: 7 };
const NO_CHAIN = ['rest', 'shop', 'elite']; // never twice in a row along a path

export const nodeId = (row, col) => `${row}-${col}`;

export function generateMap(rng, act) {
  const nodes = {};
  const get = (r, c) => {
    const id = nodeId(r, c);
    if (!nodes[id]) nodes[id] = { id, row: r, col: c, type: null, next: [], prev: [] };
    return nodes[id];
  };
  const hasEdge = (r, c, c2) => !!nodes[nodeId(r, c)]?.next.includes(nodeId(r + 1, c2));

  let firstStart = -1;
  for (let p = 0; p < PATHS; p++) {
    let c = rng.int(0, MAP_COLS - 1);
    if (p === 1) while (c === firstStart) c = rng.int(0, MAP_COLS - 1);
    if (p === 0) firstStart = c;
    get(0, c);
    for (let r = 0; r < MAP_ROWS - 1; r++) {
      const options = [c - 1, c, c + 1].filter((x) => {
        if (x < 0 || x >= MAP_COLS) return false;
        // A diagonal step may not cross the mirrored diagonal of another path.
        if (x === c + 1 && hasEdge(r, c + 1, c)) return false;
        if (x === c - 1 && hasEdge(r, c - 1, c)) return false;
        return true;
      });
      const nx = rng.pick(options);
      const a = get(r, c);
      const b = get(r + 1, nx);
      if (!a.next.includes(b.id)) a.next.push(b.id);
      if (!b.prev.includes(a.id)) b.prev.push(a.id);
      c = nx;
    }
  }

  assignTypes(nodes, rng);

  const boss = { id: 'boss', row: MAP_ROWS, col: 3, type: 'boss', next: [], prev: [] };
  for (const n of Object.values(nodes)) {
    if (n.row === MAP_ROWS - 1) {
      n.next.push('boss');
      boss.prev.push(n.id);
    }
    // Small layout jitter so the map looks hand-drawn rather than gridded.
    n.jx = (rng.next() - 0.5) * 0.45;
    n.jy = (rng.next() - 0.5) * 0.35;
  }
  nodes.boss = boss;
  return { act, nodes, boss: 'boss' };
}

function assignTypes(nodes, rng) {
  const list = Object.values(nodes).sort((a, b) => a.row - b.row || a.col - b.col);
  for (const n of list) {
    if (n.row === 0) n.type = 'combat';
    else if (n.row === TREASURE_ROW) n.type = 'treasure';
    else if (n.row === REST_ROW) n.type = 'rest';
  }
  for (const n of list) {
    if (n.type) continue;
    const parents = n.prev.map((id) => nodes[id]);
    const siblings = parents.flatMap((p) => p.next.map((id) => nodes[id])).filter((s) => s !== n);
    const allowed = Object.entries(WEIGHTS).filter(([type]) => {
      if (type === 'rest' && (n.row < 3 || n.row === REST_ROW - 1)) return false;
      if (type === 'elite' && n.row < 4) return false;
      if (NO_CHAIN.includes(type) && parents.some((p) => p.type === type)) return false;
      if (NO_CHAIN.includes(type) && siblings.some((s) => s.type === type)) return false;
      return true;
    });
    n.type = rng.weighted(allowed) || 'combat';
  }
  // Guarantee at least one shop per act.
  if (!list.some((n) => n.type === 'shop')) {
    const candidates = list.filter((n) => n.row >= 2 && n.row <= 8 && (n.type === 'combat' || n.type === 'event')
      && !n.prev.some((id) => nodes[id].type === 'shop') && !n.next.some((id) => nodes[id]?.type === 'shop'));
    const pick = rng.pick(candidates);
    if (pick) pick.type = 'shop';
  }
}
