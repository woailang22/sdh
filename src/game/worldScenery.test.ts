import { describe, expect, it } from 'vitest';
import { generateWorldChunk, worldIsRoad, worldThemeAt } from './world';
import { groupBuildingsIntoHouses, houseCorners } from './house';
import { generateWorldScenery } from './worldScenery';

describe('world environment placement', () => {
  it('recreates bounded scenery across the world without changing gameplay resources', () => {
    for (const [cx, cy] of [[-2, 0], [0, -2], [2, 1], [18, 1], [-20, -10], [-31, 30]]) {
      const chunk = generateWorldChunk(cx, cy), before = structuredClone(chunk);
      const scenery = generateWorldScenery(chunk);
      expect(scenery).toEqual(generateWorldScenery(chunk));
      expect(scenery.length).toBeLessThanOrEqual(16);
      expect(scenery.filter(e => ['understory', 'outcrop', 'tank', 'rubble'].includes(e.kind)).length).toBeLessThanOrEqual(4);
      expect(chunk).toEqual(before);
      for (const item of scenery) {
        expect(item.x).toBeGreaterThanOrEqual(cx * 32);
        expect(item.x).toBeLessThan((cx + 1) * 32);
        expect(item.y).toBeGreaterThanOrEqual(cy * 32);
        expect(item.y).toBeLessThan((cy + 1) * 32);
        expect(worldIsRoad(item.x, item.y, 4)).toBe(false);
        expect(chunk.interactables.every(e => Math.hypot(item.x - e.x, item.y - e.y) >= 3)).toBe(true);
        for (const group of groupBuildingsIntoHouses(chunk.buildings)) {
          const b = houseCorners(group.members);
          expect(item.x >= b.x0 - 2 && item.x <= b.x1 + 2 && item.y >= b.y0 - 2 && item.y <= b.y1 + 4).toBe(false);
        }
      }
    }
  });

  it('gives woodland, rock and shore different scenery without putting tanks on water', () => {
    const found = new Set<string>();
    for (let cx = -4; cx <= 4; cx++) for (let cy = -3; cy <= 3; cy++) {
      for (const item of generateWorldScenery(generateWorldChunk(cx, cy))) {
        found.add(item.kind);
        if (item.kind === 'understory') expect(['forest', 'field', 'camp', 'plaza']).toContain(worldThemeAt(item.x, item.y));
        if (worldThemeAt(item.x, item.y) === 'lake') expect(item.kind).toBe('reeds');
      }
    }
    for (const kind of ['understory', 'outcrop', 'reeds', 'rubble', 'fence']) expect(found.has(kind), kind).toBe(true);
  });
});
