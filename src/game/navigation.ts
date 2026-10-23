export interface NavigationBuilding { id?: string; type: string; x: number; y: number; hp?: number; isOpen?: boolean; facing?: 'ew' | 'ns'; doorWidth?: number }
export const MAX_BUILDING_HALF_EXTENT = 2;
export const PLAYER_COLLISION_RADIUS = 0.22;
type Point = { x: number; y: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function buildingBounds(building: NavigationBuilding): Bounds | null {
  if ((building.hp !== undefined && building.hp <= 0) || building.type.endsWith('_floor') || building.type === 'spikes') return null;
  const door = building.type === 'door' || building.type === 'safe_door';
  if (door && building.isOpen) return null;
  const thin = door || building.type.endsWith('_wall');
  const halfLength = door ? Math.max(0.5, Math.min(MAX_BUILDING_HALF_EXTENT, (building.doorWidth ?? 1) / 2)) : 0.5;
  const halfX = thin ? (building.facing === 'ns' ? 0.12 : halfLength) : 0.4;
  const halfY = thin ? (building.facing === 'ns' ? halfLength : 0.12) : 0.4;
  return { minX: building.x - halfX, minY: building.y - halfY, maxX: building.x + halfX, maxY: building.y + halfY };
}

export function isPositionBlocked(x: number, y: number, buildings: readonly NavigationBuilding[], radius = PLAYER_COLLISION_RADIUS): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
  return buildings.some(building => {
    const bounds = buildingBounds(building);
    return bounds !== null && x > bounds.minX - radius && x < bounds.maxX + radius && y > bounds.minY - radius && y < bounds.maxY + radius;
  });
}

function intersects(from: Point, to: Point, bounds: Bounds, radius = 0): boolean {
  let near = 0;
  let far = 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = to[axis] - from[axis];
    const min = (axis === 'x' ? bounds.minX : bounds.minY) - radius;
    const max = (axis === 'x' ? bounds.maxX : bounds.maxY) + radius;
    if (Math.abs(delta) < 1e-9) {
      if (from[axis] <= min || from[axis] >= max) return false;
    } else {
      const a = (min - from[axis]) / delta;
      const b = (max - from[axis]) / delta;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near >= far) return false;
    }
  }
  return true;
}

export function hasLineOfSight(from: Point, to: Point, buildings: readonly NavigationBuilding[], ignoreId?: string): boolean {
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return false;
  const minX = Math.min(from.x, to.x), maxX = Math.max(from.x, to.x), minY = Math.min(from.y, to.y), maxY = Math.max(from.y, to.y);
  return !buildings.some(building => {
    if (ignoreId !== undefined && building.id === ignoreId) return false;
    const bounds = buildingBounds(building);
    if (!bounds || bounds.maxX < minX || bounds.minX > maxX || bounds.maxY < minY || bounds.minY > maxY) return false;
    // An entity may attack from its own center or attack a structure itself.
    if (Math.hypot(from.x - building.x, from.y - building.y) < 1e-6 || Math.hypot(to.x - building.x, to.y - building.y) < 1e-6) return false;
    return intersects(from, to, bounds);
  });
}

/** Local half-cell A*: bounded work, cardinal steps and swept collision prevent corner cutting. */
export function findPath(from: Point, to: Point, buildings: readonly NavigationBuilding[], maxDistance = 48): Point[] {
  if (![from.x, from.y, to.x, to.y, maxDistance].every(Number.isFinite) || maxDistance <= 0) return [];
  const limit = Math.min(maxDistance, 96);
  if (Math.hypot(to.x - from.x, to.y - from.y) > limit) return [];
  const nearby = buildings.filter(b => Math.abs(b.x - from.x) < limit + 1 && Math.abs(b.y - from.y) < limit + 1);
  const bounds = nearby.map(buildingBounds).filter((b): b is Bounds => b !== null);
  const clear = (a: Point, b: Point) => !bounds.some(rect => intersects(a, b, rect, 0.22));
  if (isPositionBlocked(from.x, from.y, nearby)) return [];

  const nearestGrid = (point: Point): Point | undefined => {
    const candidates: Point[] = [];
    for (let x = Math.round(point.x * 2) - 3; x <= Math.round(point.x * 2) + 3; x++) {
      for (let y = Math.round(point.y * 2) - 3; y <= Math.round(point.y * 2) + 3; y++) {
        const candidate = { x: x / 2, y: y / 2 };
        if (!isPositionBlocked(candidate.x, candidate.y, nearby)) candidates.push(candidate);
      }
    }
    candidates.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y) || Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
    return candidates.find(candidate => isPositionBlocked(point.x, point.y, nearby) || clear(point, candidate));
  };
  const start = nearestGrid(from);
  const end = nearestGrid(to);
  if (!start || !end) return [];
  const key = (p: Point) => `${p.x},${p.y}`;
  const goalKey = key(end);
  type Node = { point: Point; cost: number; score: number; parent?: Node };
  const heap: Node[] = [];
  const push = (node: Node) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= node.score) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = node;
  };
  const pop = (): Node => {
    const first = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (heap[child].score >= last.score) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  const heuristic = (p: Point) => Math.abs(p.x - end.x) + Math.abs(p.y - end.y);
  push({ point: start, cost: 0, score: heuristic(start) });
  const costs = new Map([[key(start), 0]]);
  const closed = new Set<string>();
  while (heap.length && closed.size < 12000) {
    const node = pop();
    const nodeKey = key(node.point);
    if (closed.has(nodeKey)) continue;
    if (nodeKey === goalKey) {
      const path: Point[] = [];
      let cursor: Node | undefined = node;
      while (cursor) { path.push(cursor.point); cursor = cursor.parent; }
      path.reverse();
      if (!isPositionBlocked(to.x, to.y, nearby) && clear(end, to) && Math.hypot(end.x - to.x, end.y - to.y) > 1e-6) path.push({ ...to });
      if (path.length > 1 && Math.hypot(path[0].x - from.x, path[0].y - from.y) < 1e-6) path.shift();
      return path;
    }
    closed.add(nodeKey);
    for (const [dx, dy] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
      const next = { x: node.point.x + dx, y: node.point.y + dy };
      const nextKey = key(next);
      const cost = node.cost + 0.5;
      if (closed.has(nextKey) || Math.hypot(next.x - from.x, next.y - from.y) > limit || cost >= (costs.get(nextKey) ?? Infinity)) continue;
      if (!clear(node.point, next)) continue;
      costs.set(nextKey, cost);
      push({ point: next, cost, score: cost + heuristic(next), parent: node });
    }
  }
  return [];
}
