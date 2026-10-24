import { groupBuildingsIntoHouses, houseCorners } from './house';
import { CHUNK_SIZE, worldIsRoad, worldThemeAt, type WorldChunk } from './world';

export type WorldSceneryKind = 'understory' | 'outcrop' | 'reeds' | 'tank' | 'rubble' | 'fence' | 'grass' | 'shrub';
export interface WorldScenery { id: string; x: number; y: number; kind: WorldSceneryKind; scale: number; variant?: 0 | 1 }

function noise(x: number, y: number, salt: number) {
  let h = Math.imul(x + 8192, 374761393) ^ Math.imul(y + 8192, 668265263) ^ Math.imul(salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Non-interactive environment only: never adds resources, buildings or collision. */
export function generateWorldScenery(chunk: WorldChunk): WorldScenery[] {
  const [, cxText, cyText] = chunk.key.split(':');
  const cx = Number(cxText), cy = Number(cyText);
  const rooms = groupBuildingsIntoHouses(chunk.buildings).map(g => houseCorners(g.members));
  const scenery: WorldScenery[] = [];
  for (let i = 0; i < 16; i++) {
    const n = noise(cx, cy, i + 1);
    const x = cx * CHUNK_SIZE + 3 + (i % 4) * 8 + n % 3;
    const y = cy * CHUNK_SIZE + 3 + Math.floor(i / 4) * 8 + (n >>> 8) % 3;
    if (Math.hypot(x, y - 1) < 12 || worldIsRoad(x, y, 4)) continue;
    if (rooms.some(b => x >= b.x0 - 2 && x <= b.x1 + 2 && y >= b.y0 - 2 && y <= b.y1 + 4)) continue;
    if (chunk.buildings.some(b => Math.hypot(x - b.x, y - b.y) < 3)) continue;
    if (chunk.interactables.some(e => Math.hypot(x - e.x, y - e.y) < 3)) continue;
    const theme = worldThemeAt(x, y);
    const shore = [[4, 0], [-4, 0], [0, 4], [0, -4]].some(([dx, dy]) => (worldThemeAt(x + dx, y + dy) === 'lake') !== (theme === 'lake'));
    let kind: WorldSceneryKind;
    if (shore) { if (n % 3 !== 0) continue; kind = 'reeds'; }
    else if (theme === 'lake') continue;
    else if (theme === 'forest') kind = n % 4 === 0 ? 'understory' : n % 3 === 0 ? 'shrub' : 'grass';
    else if (theme === 'quarry' || theme === 'rift') { if (n % 3 !== 0) continue; kind = n % 4 === 0 ? 'grass' : 'outcrop'; }
    else if (theme === 'urban' || theme === 'ruins') { if (n % 3 !== 0) continue; kind = n % 4 === 0 ? 'tank' : 'rubble'; }
    else if (theme === 'marsh') { if (n % 3 !== 0) continue; kind = 'reeds'; }
    else {
      if (n % 3 !== 0) continue;
      kind = n % 5 === 0 ? 'rubble' : n % 2 === 0 ? 'fence' : 'understory';
    }
    if (['understory', 'outcrop', 'tank', 'rubble'].includes(kind) && scenery.filter(e => ['understory', 'outcrop', 'tank', 'rubble'].includes(e.kind)).length >= 4) continue;
    scenery.push({ id: `${chunk.key}:scenery:${i}`, x, y, kind, scale: 0.7 + (n % 61) / 100, variant: (n >>> 16 & 1) as 0 | 1 });
  }
  return scenery;
}
