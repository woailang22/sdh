import { describe, expect, it } from 'vitest';
import { createWorldQueries } from './worldQueries';
import { generateWorldChunk, getWorldInteractable, worldToChunk, type WorldChunk } from '../src/game/world';
import { GameWorld } from './worldState';
import { createMemoryDb } from './db';

function fixture() {
  const generated: string[] = [];
  const queries = createWorldQueries((cx, cy) => {
    generated.push(cx + ':' + cy);
    return generateWorldChunk(cx, cy);
  });
  return { queries, generated };
}

describe('bounded nearby world queries', () => {
  it('reuses one chunk for every exact resource lookup and shares nearby warm-up without creating another cache', () => {
    const { queries, generated } = fixture(), nodes = generateWorldChunk(-4, -2).interactables;
    expect(nodes.length).toBeGreaterThan(1);
    for (const node of nodes) expect(queries.nodeAt(node.id)).toEqual(node);
    expect(generated).toEqual(['-4:-2']);
    expect(queries.nodeAt('world:-4:-2:missing')).toBeUndefined(); expect(generated).toHaveLength(1);
    queries.nodesNear(-123, -61); const warmed = generated.length;
    for (const node of queries.nodesNear(-123, -61)) expect(queries.nodeAt(node.id)).toEqual(getWorldInteractable(node.id));
    expect(generated).toHaveLength(warmed);
    expect(queries.nodeAt('not-a-world-node')).toBeUndefined(); expect(generated).toHaveLength(warmed);
  });

  it('keeps resource lookups in the original bounded chunk LRU and retains the recently used chunk', () => {
    const { queries, generated } = fixture(), hot = generateWorldChunk(-4, -2).interactables[0], cold = generateWorldChunk(-3, -2).interactables[0];
    expect(queries.nodeAt(hot.id)).toEqual(hot); expect(queries.nodeAt(cold.id)).toEqual(cold);
    for (let i = 0; i < 190; i++) queries.nodeAt(`world:${i % 32}:${Math.floor(i / 32)}:missing`);
    expect(generated).toHaveLength(192); queries.nodeAt(hot.id);
    queries.nodeAt('world:31:31:missing'); expect(generated).toHaveLength(193);
    expect(queries.nodeAt(hot.id)).toEqual(hot); expect(generated).toHaveLength(193);
    expect(queries.nodeAt(cold.id)).toEqual(cold); expect(generated).toHaveLength(194);
  });

  it('never overwrites real persistent depletion with a cached static definition across restart', () => {
    const db = createMemoryDb(), queries = createWorldQueries(), node = queries.nodeAt('world:-4:-2:node:0')!;
    const rules = { ...queries, campSiteAllowed: () => false, migrate: (_map: string, x: number, y: number) => ({ mapId: 'world' as const, x, y }) };
    const game = new GameWorld(db, rules, () => 10000); game.connect('p', '采集者');
    Object.assign(game.state.players.p, { x: node.x, y: node.y - 2 });
    expect(game.action('p', { action: 'gather', requestId: 'cached-gather', targetId: node.id }).error).toBeUndefined();
    expect(game.state.players.p.resources.wood).toBe(1); expect(queries.nodeAt(node.id)!.stock).toBe(3);
    expect(game.snapshot('p').nodes.find(n => n.id === node.id)!.stock).toBe(2);
    const restored = new GameWorld(db, rules, () => 10500); restored.connect('p', '采集者');
    expect(restored.action('p', { action: 'gather', requestId: 'cached-gather', targetId: node.id }).player.resources.wood).toBe(1);
    expect(restored.state.nodes[node.id].stock).toBe(2); expect(queries.nodeAt(node.id)).toBe(node);
  });

  it('reuses static definitions across sixteen dispersed active regions', () => {
    const { queries, generated } = fixture();
    const sites = [-768, -256, 256, 768].flatMap(x => [-768, -256, 256, 768].map(y => ({ x, y })));
    const expected = sites.map(p => queries.nodesNear(p.x, p.y));
    const coldGenerations = generated.length;
    for (let round = 0; round < 3; round++) for (const [i, p] of sites.entries()) {
      expect(queries.nodesNear(p.x, p.y)).toEqual(expected[i]);
      queries.buildingsNear(p.x, p.y); queries.monstersNear(p.x, p.y);
    }
    expect(generated.length).toBe(coldGenerations);
  });

  it('filters each request at its actual coordinates, including negative chunk boundaries', () => {
    const { queries } = fixture();
    for (const p of [{ x: -60, y: -25 }, { x: -33, y: -1 }, { x: -32, y: 0 }, { x: -31.9, y: 0.1 }, { x: 31.9, y: 32 }, { x: 1023, y: 1023 }]) {
      const center = worldToChunk(p.x, p.y), chunks: WorldChunk[] = [];
      for (let y = center.y - 2; y <= center.y + 2; y++) for (let x = center.x - 2; x <= center.x + 2; x++) chunks.push(generateWorldChunk(x, y));
      expect(queries.nodesNear(p.x, p.y)).toEqual(chunks.flatMap(c => c.interactables).filter(n => Math.hypot(n.x - p.x, n.y - p.y) <= 45));
      expect(queries.buildingsNear(p.x, p.y)).toEqual(chunks.flatMap(c => c.buildings).filter(b => Math.hypot(b.x - p.x, b.y - p.y) <= 55));
      expect(queries.monstersNear(p.x, p.y)).toEqual(chunks.flatMap(c => c.monsters).filter(m => Math.hypot(m.x - p.x, m.y - p.y) <= 40));
    }
  });

  it('evicts least recently used regions after the bounded working set fills', () => {
    const { queries, generated } = fixture();
    const sites = Array.from({ length: 32 }, (_, i) => ({ x: -768 + i % 8 * 192, y: -768 + Math.floor(i / 8) * 192 }));
    for (const p of sites) queries.nodesNear(p.x, p.y);
    queries.nodesNear(sites[0].x, sites[0].y); // Keep the first region hot; the second is now oldest.
    queries.nodesNear(-768, 0);
    const before = generated.length;
    queries.nodesNear(sites[0].x, sites[0].y);
    expect(generated.length).toBe(before);
    queries.nodesNear(sites[1].x, sites[1].y);
    expect(generated.length).toBeGreaterThan(before);
    const after = generated.length;
    queries.nodesNear(sites[1].x, sites[1].y);
    expect(generated.length).toBe(after);
  });
});
