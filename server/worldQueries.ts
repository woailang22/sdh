import { generateWorldChunk, worldToChunk, type WorldChunk } from '../src/game/world.js';

export function createWorldQueries(generate = generateWorldChunk) {
  const chunkCache = new Map<string, WorldChunk>();
  type Nearby = Pick<WorldChunk, 'interactables' | 'buildings' | 'monsters'>;
  // Keep static definitions for up to 32 active center chunks. Otherwise dispersed
  // players evict each other's 25-chunk neighborhoods on every movement packet.
  // These references retain definitions from at most 800 chunks in addition to the
  // 192 chunk entries below; mutable stock, health and spawns remain in GameWorld.
  const nearbyCache = new Map<string, Nearby>();
  function nearby(x: number, y: number): Nearby {
    const center = worldToChunk(x, y), centerKey = center.x + ':' + center.y;
    const cached = nearbyCache.get(centerKey);
    if (cached) {
      nearbyCache.delete(centerKey); nearbyCache.set(centerKey, cached);
      return cached;
    }
    const result: WorldChunk[] = [];
    for (let cy = center.y - 2; cy <= center.y + 2; cy++) for (let cx = center.x - 2; cx <= center.x + 2; cx++) {
      const key = cx + ':' + cy;
      let chunk = chunkCache.get(key);
      if (!chunk) chunk = generate(cx, cy);
      chunkCache.delete(key); chunkCache.set(key, chunk);
      result.push(chunk);
    }
    while (chunkCache.size > 192) chunkCache.delete(chunkCache.keys().next().value!);
    const definitions = {
      interactables: result.flatMap(c => c.interactables),
      buildings: result.flatMap(c => c.buildings),
      monsters: result.flatMap(c => c.monsters),
    };
    nearbyCache.set(centerKey, definitions);
    while (nearbyCache.size > 32) nearbyCache.delete(nearbyCache.keys().next().value!);
    return definitions;
  }
  return {
    nodesNear: (x: number, y: number) => nearby(x, y).interactables.filter(n => Math.hypot(n.x - x, n.y - y) <= 45),
    buildingsNear: (x: number, y: number) => nearby(x, y).buildings.filter(b => Math.hypot(b.x - x, b.y - y) <= 55),
    monstersNear: (x: number, y: number) => nearby(x, y).monsters.filter(m => Math.hypot(m.x - x, m.y - y) <= 40),
  };
}
