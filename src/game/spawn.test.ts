import { describe, expect, it } from 'vitest';
import { SPAWN_POINTS, BASE_PLOTS, spawnForIndex, basePlotForIndex } from './spawn';

describe('spawn dispersal', () => {
  it('has 8 spawn points, all in camp_plaza, pairwise 2+ apart', () => {
    expect(SPAWN_POINTS).toHaveLength(8);
    for (const s of SPAWN_POINTS) expect(s.mapId).toBe('camp_plaza');
    for (let i = 0; i < SPAWN_POINTS.length; i++) {
      for (let j = i + 1; j < SPAWN_POINTS.length; j++) {
        const d = Math.hypot(SPAWN_POINTS[i].x - SPAWN_POINTS[j].x, SPAWN_POINTS[i].y - SPAWN_POINTS[j].y);
        expect(d).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('spawnForIndex wraps around', () => {
    expect(spawnForIndex(0)).toEqual(SPAWN_POINTS[0]);
    expect(spawnForIndex(8)).toEqual(SPAWN_POINTS[0]);
    expect(spawnForIndex(9)).toEqual(SPAWN_POINTS[1]);
  });
  it('has 8 base plots spread across 4 wild maps, each plot 8+ apart within same map', () => {
    expect(BASE_PLOTS).toHaveLength(8);
    const byMap = new Map<string, typeof BASE_PLOTS>();
    for (const p of BASE_PLOTS) {
      const arr = byMap.get(p.mapId) ?? [];
      arr.push(p);
      byMap.set(p.mapId, arr);
    }
    expect(byMap.size).toBeGreaterThanOrEqual(4);
    for (const [, arr] of byMap) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const d = Math.hypot(arr[i].x - arr[j].x, arr[i].y - arr[j].y);
          expect(d).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });
  it('basePlotForIndex wraps and keeps mapId', () => {
    const a = basePlotForIndex(0);
    const b = basePlotForIndex(8);
    expect(a).toEqual(b);
    expect(a.mapId).toBe(BASE_PLOTS[0].mapId);
  });
});
