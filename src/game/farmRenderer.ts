import type { BuildingEntity } from '../types/game';
import { ITEM_DEFS } from './items';

const plants = [[-14, -2], [-3, -8], [0, 3], [10, -2], [4, 7]] as const;
const leafSides = [-1, 1] as const;

/** Production is only a display input; collection remains a server action. */
export function drawFarmPlot(ctx: CanvasRenderingContext2D, b: BuildingEntity, s: { x: number; y: number }, now: number) {
  const broken = b.hp <= 0, job = b.production, ready = !!job && job.readyAt <= now;
  ctx.lineWidth = 2; ctx.strokeStyle = '#342d25';
  ctx.fillStyle = broken ? '#575247' : '#71513b';
  ctx.beginPath(); ctx.moveTo(s.x - 28, s.y - 2); ctx.lineTo(s.x, s.y + 12);
  ctx.lineTo(s.x + 28, s.y - 2); ctx.lineTo(s.x + 28, s.y + 3);
  ctx.lineTo(s.x, s.y + 17); ctx.lineTo(s.x - 28, s.y + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = broken ? '#6c6556' : '#9b7854';
  ctx.beginPath(); ctx.moveTo(s.x, s.y - 16); ctx.lineTo(s.x + 28, s.y - 2);
  ctx.lineTo(s.x, s.y + 12); ctx.lineTo(s.x - 28, s.y - 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = broken ? '#403b33' : '#3e2b21';
  ctx.beginPath(); ctx.moveTo(s.x, s.y - 13); ctx.lineTo(s.x + 23, s.y - 2);
  ctx.lineTo(s.x, s.y + 9); ctx.lineTo(s.x - 23, s.y - 2); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = broken ? '#747065' : '#755035';
  for (let row = 0; row < 3; row++) {
    ctx.beginPath(); ctx.moveTo(s.x - 18 + row * 9, s.y - 3 - row * 5);
    ctx.lineTo(s.x + 2 + row * 9, s.y + 7 - row * 5); ctx.stroke();
  }
  if (job && !broken) {
    const height = ready ? 12 : 5;
    for (const [x, y] of plants) {
      const px = s.x + x, py = s.y + y;
      ctx.strokeStyle = ready ? '#466938' : '#6e9150'; ctx.lineWidth = ready ? 2 : 1.5;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - height); ctx.stroke();
      ctx.fillStyle = ready ? '#7b9c4b' : '#a0b866';
      for (const side of leafSides) {
        ctx.beginPath(); ctx.ellipse(px + side * (ready ? 3 : 2), py - height * .6, ready ? 4.5 : 2.5, ready ? 2.4 : 1.6, side * -.6, 0, Math.PI * 2); ctx.fill();
      }
      if (ready) {
        ctx.fillStyle = job.resultItemId === 'crop_pumpkin' ? '#dc8745' : job.resultItemId === 'crop_corn' || job.resultItemId === 'crop_starfruit' ? '#e5c05a' : '#e7dfbd';
        ctx.beginPath(); ctx.arc(px, py - height, job.resultItemId === 'crop_pumpkin' ? 2.8 : 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

export function farmPlotStatus(b: BuildingEntity, now: number): string {
  const job = b.production;
  if (b.hp <= 0) return '已损坏 · 先修复';
  if (!job) return '待播种 · E/F';
  const name = ITEM_DEFS[job.resultItemId]?.name || '作物';
  return job.readyAt <= now ? `${name} ×${job.resultCount} · 可领取`
    : `${name} · 生长中 · ${Math.max(1, Math.ceil((job.readyAt - now) / 1000))}秒`;
}
