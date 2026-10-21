import { describe, expect, it } from 'vitest';
import { buildCompoundWalls } from './compound';
import { buildingBounds, findPath, hasLineOfSight, isPositionBlocked } from './navigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorldMapModal } from '../components/WorldMapModal';
import { MapZoneSwitcher } from '../components/MapZoneSwitcher';
import { RadarMinimap } from '../components/RadarMinimap';

const wall = { id: 'wall', type: 'stone_wall', x: 0, y: 0, hp: 100, facing: 'ew' as const };

describe('shared collision and navigation', () => {
  it('uses thin facing-aware walls so the neighboring walls leave a one-cell entrance', () => {
    expect(buildingBounds(wall)).toEqual({ minX: -0.5, maxX: 0.5, minY: -0.12, maxY: 0.12 });
    expect(isPositionBlocked(0, 0, [{ ...wall, x: -1 }, { ...wall, x: 1 }])).toBe(false);
    expect(isPositionBlocked(0.6, 0, [wall])).toBe(true);
    expect(isPositionBlocked(0, 0.6, [wall])).toBe(false);
    expect(isPositionBlocked(0, 0.6, [{ ...wall, facing: 'ns' }])).toBe(true);
  });

  it('blocks closed doors and facilities while open doors, dead structures and floors are passable', () => {
    expect(isPositionBlocked(0, 0, [{ ...wall, type: 'door' }])).toBe(true);
    expect(isPositionBlocked(0, 0, [{ ...wall, type: 'safe_door', isOpen: true }])).toBe(false);
    expect(isPositionBlocked(0, 0, [{ ...wall, hp: 0 }])).toBe(false);
    expect(isPositionBlocked(0, 0, [{ ...wall, type: 'wood_floor' }])).toBe(false);
    expect(isPositionBlocked(0, 0, [{ ...wall, type: 'storage_box' }])).toBe(true);
  });

  it('stops sight through walls and closed doors but permits a source or target at its own center', () => {
    expect(hasLineOfSight({ x: 0, y: -2 }, { x: 0, y: 2 }, [wall])).toBe(false);
    expect(hasLineOfSight({ x: 0, y: -2 }, { x: 0, y: 2 }, [{ ...wall, type: 'door', isOpen: true }])).toBe(true);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 0, y: 2 }, [wall], wall.id)).toBe(true);
    expect(hasLineOfSight({ x: 0, y: -2 }, { x: 0, y: 0 }, [wall])).toBe(true);
  });

  it('routes around a closed yard to its open entrance without crossing any wall', () => {
    const buildings = buildCompoundWalls({ idPrefix: 'yard', cx: 0, cy: 0, w: 6, h: 6, wallType: 'stone_wall', wallName: '墙', ownerName: 'test', doorSide: 'S', doorType: 'door', doorName: '门' });
    const from = { x: 0, y: -5 };
    const to = { x: 0, y: 0 };
    const path = findPath(from, to, buildings);
    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)).toEqual(to);
    expect(path.some(point => point.y > 3)).toBe(true);
    let previous = from;
    for (const point of path) {
      const count = Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 0.05);
      for (let i = 1; i <= count; i++) {
        expect(isPositionBlocked(previous.x + (point.x - previous.x) * i / count, previous.y + (point.y - previous.y) * i / count, buildings)).toBe(false);
      }
      previous = point;
    }
    expect(findPath(from, to, buildings.map(b => ({ ...b, isOpen: false })), 12)).toEqual([]);
  });

  it('uses a reachable nearby point for an occupied destination and bounds unreachable requests', () => {
    const path = findPath({ x: -3, y: 0 }, { x: 0, y: 0 }, [{ ...wall, type: 'storage_box' }]);
    expect(path.length).toBeGreaterThan(0);
    expect(isPositionBlocked(path.at(-1)!.x, path.at(-1)!.y, [{ ...wall, type: 'storage_box' }])).toBe(false);
    expect(Math.hypot(path.at(-1)!.x, path.at(-1)!.y)).toBeLessThanOrEqual(1.5);
    expect(findPath({ x: 0, y: 0 }, { x: 10000, y: 10000 }, [], 12)).toEqual([]);
    expect(findPath({ x: NaN, y: 0 }, { x: 1, y: 1 }, [])).toEqual([]);
  });
});

describe('world navigation interface', () => {
  it('renders one continuous world overview with landmarks and route controls', () => {
    const html = renderToStaticMarkup(React.createElement(WorldMapModal, { isOpen: true, onClose() {}, currentMapId: 'world', playerPos: { x: 448, y: 32 } }));
    expect(html).toContain('连续世界总览');
    expect(html).toContain('标记路线');
    expect(html).toContain('废墟');
    expect(html).toContain('缩小地图');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('直接折跃');
  });

  it('shows local camp coordinates separately from the public world', () => {
    const html = renderToStaticMarkup(React.createElement(WorldMapModal, { isOpen: true, onClose() {}, currentMapId: 'home_player', playerPos: { x: 12, y: -8 } }));
    expect(html).toContain('独立营地平面图');
    expect(html).toContain('营地出口');
    expect(html).not.toContain('aria-label="世界玩家位置"');
  });

  it('shows the current world area and map action without region teleport choices', () => {
    const html = renderToStaticMarkup(React.createElement(MapZoneSwitcher, { currentMap: 'world', onSelectMap() {}, onOpenWorldMap() {} }));
    expect(html).toContain('连续世界');
    expect(html).toContain('打开地图');
    expect(html).not.toContain('废弃省道');
  });

  it('labels radar with the player world area and a fixed nearby range', () => {
    const html = renderToStaticMarkup(React.createElement(RadarMinimap, { playerPos: { x: 760, y: 176, angle: 0 }, monsters: [], teammates: [], interactables: [] }));
    expect(html).toContain('32 格');
    expect(html).toContain('世界坐标');
  });
});
