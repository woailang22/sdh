import { describe, expect, it } from 'vitest';
import { createWorldQueries } from './worldQueries';
import { generateWorldChunk, worldToChunk, type WorldChunk } from '../src/game/world';

function fixture() {
  const generated: string[] = [];
  const queries = createWorldQueries((cx, cy) => {
    generated.push(cx + ':' + cy);
    return generateWorldChunk(cx, cy);
  });
  return { queries, generated };
}

describe('bounded nearby world queries', () => {
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
