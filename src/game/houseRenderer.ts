import type { BuildingEntity } from '../types/game';
import { houseCorners, houseEntrance, houseWallRuns, HOUSE_WALL_H, type HouseWallRun } from './house';

type Point = { x: number; y: number };
type Project = (x: number, y: number) => Point;

export function waterHousePlatformBounds(members: BuildingEntity[], door: BuildingEntity) {
  const b = houseCorners(members);
  const approach = door.y === b.y1 && Math.abs(door.x) <= 32;
  return { x0: Math.min(b.x0 - 0.8, approach ? -0.8 : Infinity), x1: Math.max(b.x1 + 0.8, approach ? 0.8 : -Infinity), y0: b.y0 - 0.8, y1: b.y1 + 0.8 };
}

/** Draw below actors: existing wetland rooms stand on a deck, with a short road approach. */
export function drawWaterHousePlatform(ctx: CanvasRenderingContext2D, members: BuildingEntity[], door: BuildingEntity, project: Project) {
  const { x0, x1, y0, y1 } = houseCorners(members);
  ctx.save(); ctx.lineWidth = 1.5;
  const deck = (left: number, top: number, right: number, bottom: number) => {
    const corners = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => project(x, y));
    ctx.fillStyle = '#766b50'; ctx.strokeStyle = '#b3a17c';
    ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#504d3d'; ctx.lineWidth = 1;
    for (let x = left + 1; x < right; x += 1) {
      const a = project(x, top), b = project(x, bottom);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  };
  if (door.y === y1 && Math.abs(door.x) <= 32) deck(Math.min(0, door.x) - 0.8, door.y - 0.8, Math.max(0, door.x) + 0.8, door.y + 0.8);
  ctx.fillStyle = '#4e4939';
  for (const x of [x0 - 0.6, x1 + 0.6]) {
    const p = project(x, y1 + 0.6); ctx.fillRect(p.x - 4, p.y, 8, 18);
  }
  deck(x0 - 0.8, y0 - 0.8, x1 + 0.8, y1 + 0.8);
  ctx.restore();
}

/** Four actual wall sides, split into back/front layers around actors and loot. */
export function drawHouseLayer(ctx: CanvasRenderingContext2D, members: BuildingEntity[], door: BuildingEntity | null, player: Point, project: Project, layer: 'back' | 'front') {
  const { x0, x1, y0, y1 } = houseCorners(members);
  const publicHouse = !!door && door.type === 'door' && door.id.startsWith('world:');
  const wood = members.some(b => b.type === 'wood_wall');
  const clinic = door?.name.includes('诊所');
  const workshop = door?.name.includes('工棚');
  const warehouse = door?.name.includes('仓库');
  const variant = [...(door?.id ?? '')].reduce((value, char) => value + char.charCodeAt(0), 0) % 3;
  const inside = player.x > x0 - 0.8 && player.x < x1 + 0.8 && player.y > y0 - 0.8 && player.y < y1 + 0.8;
  const wallHeight = publicHouse ? 84 : HOUSE_WALL_H;
  const trim = clinic ? '#d4d7c6' : workshop || warehouse ? '#939e9b' : wood ? '#c4a47a' : '#a3aba9';
  const runs = houseWallRuns(members);
  const up = (point: Point, height: number): Point => ({ x: point.x, y: point.y - height });
  const polygon = (points: Point[], fill: string, stroke = '#263330') => {
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.25;
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  const line = (a: Point, b: Point, color: string, width = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  const wallFace = (run: HouseWallRun) => {
    const a = project(run.start.x, run.start.y), b = project(run.end.x, run.end.y);
    const light = run.side === 'S' || run.side === 'W';
    const color = clinic ? light ? '#c6c8ae' : '#929d86'
      : workshop ? light ? '#88918a' : '#5b6c68'
      : warehouse ? light ? '#76868a' : '#4e6268'
      : wood ? light ? ['#a28b64', '#9e795c', '#8f9474'][variant] : ['#716348', '#705441', '#646b52'][variant]
      : light ? '#8c9692' : '#596c6d';
    polygon([a, b, up(b, wallHeight), up(a, wallHeight)], color);
    line(up(a, wallHeight), up(b, wallHeight), trim, 4);
    line(a, b, '#39463e', 4);
    for (let height = 14; height < wallHeight - 8; height += wood ? 14 : 22) line(up(a, height), up(b, height), wood ? 'rgba(45,32,22,0.4)' : 'rgba(40,58,58,0.25)');
    line(a, up(a, wallHeight), trim, 3);
    line(b, up(b, wallHeight), trim, 3);
    const length = Math.hypot(run.end.x - run.start.x, run.end.y - run.start.y);
    if (!publicHouse || length < 2.4) return;
    const pointAt = (fraction: number) => project(run.start.x + (run.end.x - run.start.x) * fraction, run.start.y + (run.end.y - run.start.y) * fraction);
    const inset = Math.min(0.24, 0.65 / length);
    const wa = pointAt(0.5 - inset), wb = pointAt(0.5 + inset);
    polygon([up(wa, 30), up(wb, 30), up(wb, 57), up(wa, 57)], '#263e43', trim);
    line(up(pointAt(0.5), 30), up(pointAt(0.5), 57), trim, 2);
    line(up(wa, 44), up(wb, 44), trim, 2);
  };
  ctx.save();
  if (layer === 'back') {
    const corners = [project(x0, y1), project(x1, y1), project(x1, y0), project(x0, y0)];
    polygon(corners, publicHouse ? '#6b6554' : 'rgba(173,163,140,0.18)');
    if (publicHouse) for (let x = x0 + 1; x < x1; x++) line(project(x, y0), project(x, y1), 'rgba(34,37,33,0.25)');
    runs.filter(r => r.side === 'N' || r.side === 'W').forEach(wallFace);
  } else {
    ctx.globalAlpha = inside ? 0.18 : 1;
    runs.filter(r => r.side === 'S' || r.side === 'E').forEach(wallFace);
    ctx.globalAlpha = 1;
  }

  if (door) {
    const opening = houseEntrance(members, door);
    const frontDoor = opening.side === 'S' || opening.side === 'E';
    if ((layer === 'front') === frontDoor) {
      const a = project(opening.start.x, opening.start.y), b = project(opening.end.x, opening.end.y);
      const openingHeight = publicHouse ? 74 : wallHeight * 0.86;
      ctx.globalAlpha = inside && frontDoor ? 0.35 : 1;
      polygon([up(a, wallHeight), up(b, wallHeight), up(b, openingHeight), up(a, openingHeight)], trim);
      line(a, up(a, openingHeight), trim, 5); line(b, up(b, openingHeight), trim, 5);
      if (door.hp > 0) {
        const outward = opening.side === 'S' ? { x: 0, y: 1 } : opening.side === 'N' ? { x: 0, y: -1 } : opening.side === 'E' ? { x: 1, y: 0 } : { x: -1, y: 0 };
        const leafEnd = door.isOpen ? project(opening.start.x + outward.x * 1.8, opening.start.y + outward.y * 1.8) : b;
        polygon([a, leafEnd, up(leafEnd, openingHeight - 2), up(a, openingHeight - 2)], clinic ? '#486f62' : '#536566', trim);
        line(up(a, openingHeight * 0.6), up(leafEnd, openingHeight * 0.6), '#83928a', 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  if (layer === 'front' && publicHouse) {
    const roofVisible = !inside && members.every(b => !b.type.endsWith('_wall') || b.hp > 0);
    if (roofVisible) {
      const eave = wallHeight + 5;
      const southWest = up(project(x0 - 0.25, y1 + 0.25), eave), southEast = up(project(x1 + 0.25, y1 + 0.25), eave);
      const northEast = up(project(x1 + 0.25, y0 - 0.25), eave), northWest = up(project(x0 - 0.25, y0 - 0.25), eave);
      if (warehouse) {
        polygon([northWest, northEast, southEast, southWest], '#637679');
        for (let x = x0 + 1; x < x1; x += 1.4) line(up(project(x, y0), eave), up(project(x, y1), eave), '#435c60');
        for (const x of [x0 + 2, x1 - 2]) {
          const vent = up(project(x, (y0 + y1) / 2), eave + 8);
          polygon([{ x: vent.x - 16, y: vent.y }, { x: vent.x, y: vent.y - 9 }, { x: vent.x + 16, y: vent.y }, { x: vent.x, y: vent.y + 9 }], '#acb7ab');
        }
        line(northWest, northEast, '#aebdb4', 4); line(northEast, southEast, '#aebdb4', 4);
      } else if (workshop) {
        const highWest = up(northWest, 20), highEast = up(northEast, 20);
        polygon([southWest, northWest, highWest], '#5d6158');
        polygon([southEast, northEast, highEast], '#59655b');
        polygon([highWest, highEast, southEast, southWest], '#986e52');
        for (let x = x0 + 0.5; x < x1; x += 0.65) line(up(project(x, y0 - 0.25), eave + 20), up(project(x, y1 + 0.25), eave), 'rgba(48,43,33,0.5)');
      } else {
        const ridgeA = up(project(x0 - 0.25, (y0 + y1) / 2), eave + 24), ridgeB = up(project(x1 + 0.25, (y0 + y1) / 2), eave + 24);
        polygon([southWest, northWest, ridgeA], '#6e6f58');
        polygon([southEast, northEast, ridgeB], '#5a665c');
        polygon([northWest, northEast, ridgeB, ridgeA], clinic ? '#4e6b60' : ['#785143', '#526b63', '#696753'][variant]);
        polygon([ridgeA, ridgeB, southEast, southWest], clinic ? '#76917d' : ['#a0745c', '#809184', '#909077'][variant]);
        for (let x = x0 + 0.5; x < x1; x += 0.65) line(up(project(x, (y0 + y1) / 2), eave + 24), up(project(x, y1 + 0.25), eave), 'rgba(28,49,44,0.32)');
        line(ridgeA, ridgeB, '#a3a98a', 3);
      }
    }

    // The doorway cue uses the same endpoints as collision, not a door painted
    // at a guessed midpoint of the building's screen rectangle.
    const opening = houseEntrance(members, door!);
    const outward = opening.side === 'S' ? { x: 0, y: 1 } : opening.side === 'N' ? { x: 0, y: -1 } : opening.side === 'E' ? { x: 1, y: 0 } : { x: -1, y: 0 };
    const outside = (p: Point, amount: number) => project(p.x + outward.x * amount, p.y + outward.y * amount);
    polygon([outside(opening.start, 0.1), outside(opening.end, 0.1), outside(opening.end, 1.1), outside(opening.start, 1.1)], '#9c8962', '#c9b783');
    const tip = outside(door!, 1.35), tail = outside(door!, 2.5);
    line(tail, tip, '#b5dac5', 3);
    const dx = tip.x - tail.x, dy = tip.y - tail.y, length = Math.hypot(dx, dy) || 1;
    line(tip, { x: tip.x - dx / length * 10 + dy / length * 6, y: tip.y - dy / length * 10 - dx / length * 6 }, '#b5dac5', 3);
    line(tip, { x: tip.x - dx / length * 10 - dy / length * 6, y: tip.y - dy / length * 10 + dx / length * 6 }, '#b5dac5', 3);
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    const caption = door!.hp <= 0 || door!.isOpen ? '入口 · 可通行' : '入口 · E 开门';
    ctx.fillStyle = '#172d27'; ctx.fillRect(tail.x - 55, tail.y + 5, 110, 22);
    ctx.fillStyle = '#dcecd9'; ctx.fillText(caption, tail.x, tail.y + 20);
    const label = up(project((x0 + x1) / 2, (y0 + y1) / 2), roofVisible ? wallHeight + 42 : wallHeight + 12);
    if (clinic) {
      const sign = up(project(door!.x, door!.y), wallHeight + 6);
      ctx.fillStyle = '#365b4b'; ctx.fillRect(sign.x - 14, sign.y - 24, 28, 24);
      ctx.fillStyle = '#e1e5cb'; ctx.fillRect(sign.x - 3, sign.y - 21, 6, 18); ctx.fillRect(sign.x - 9, sign.y - 15, 18, 6);
    }
    const name = door!.name.replace(/入口$/, '');
    const labelWidth = Math.max(94, name.length * 13 + 16);
    ctx.fillStyle = '#22332f'; ctx.fillRect(label.x - labelWidth / 2, label.y - 16, labelWidth, 24);
    ctx.fillStyle = '#ece4cc'; ctx.fillText(name, label.x, label.y);
  }
  ctx.restore();
}
