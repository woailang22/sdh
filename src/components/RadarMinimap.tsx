import React, { useEffect, useRef } from 'react';
import { MonsterEntity } from '../types/game';
import { soundManager } from '../audio/soundManager';
import { Map } from 'lucide-react';

interface RadarMinimapProps {
  playerPos: { x: number; y: number; angle: number };
  monsters: MonsterEntity[];
  teammates: { x: number; y: number; name: string }[];
  interactables: { x: number; y: number; name: string }[];
  buildings?: { x: number; y: number; type: string }[];
  waypoints?: { x: number; y: number; name: string; targetMap: string; icon?: string }[];
  onOpenWorldMap?: () => void;
}

export const RadarMinimap: React.FC<RadarMinimapProps> = ({
  playerPos,
  monsters,
  teammates,
  interactables,
  buildings = [],
  waypoints = [],
  onOpenWorldMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sweepAngleRef = useRef<number>(0);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderRadar = () => {
      sweepAngleRef.current = (sweepAngleRef.current + 0.04) % (Math.PI * 2);

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = w / 2 - 4;

      ctx.clearRect(0, 0, w, h);

      // Radar dark circular background
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8, 22, 34, 0.88)';
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Range rings
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
      ctx.lineWidth = 1;
      [0.35, 0.7, 1.0].forEach((ratio) => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // Rotating 360° Sweep Line
      const sweepGrad = ctx.createConicGradient(sweepAngleRef.current, cx, cy);
      sweepGrad.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
      sweepGrad.addColorStop(0.2, 'rgba(6, 182, 212, 0.0)');
      sweepGrad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      const scale = 6.5;

      // 0. Draw Inter-Map Waypoint Portals (Cyan rings with pulsating central dot)
      waypoints.forEach((wp) => {
        const dx = (wp.x - playerPos.x) * scale;
        const dy = (wp.y - playerPos.y) * scale;
        const dist = Math.hypot(dx, dy);
        const drawX = dist < radius - 8 ? cx + dx : cx + (dx / dist) * (radius - 8);
        const drawY = dist < radius - 8 ? cy + dy : cy + (dy / dist) * (radius - 8);

        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(drawX, drawY, 5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(drawX, drawY, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // 1. Draw Buildings (Cyan squares)
      buildings.forEach((b) => {
        const dx = (b.x - playerPos.x) * scale;
        const dy = (b.y - playerPos.y) * scale;
        if (Math.hypot(dx, dy) < radius - 6) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(cx + dx - 2, cy + dy - 2, 4, 4);
        }
      });

      // 2. Draw Interactables (Amber diamonds)
      interactables.forEach((item) => {
        const dx = (item.x - playerPos.x) * scale;
        const dy = (item.y - playerPos.y) * scale;
        if (Math.hypot(dx, dy) < radius - 6) {
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(cx + dx, cy + dy - 3);
          ctx.lineTo(cx + dx + 3, cy + dy);
          ctx.lineTo(cx + dx, cy + dy + 3);
          ctx.lineTo(cx + dx - 3, cy + dy);
          ctx.closePath();
          ctx.fill();
        }
      });

      // 3. Draw Teammates (Green circles)
      teammates.forEach((tm) => {
        const dx = (tm.x - playerPos.x) * scale;
        const dy = (tm.y - playerPos.y) * scale;
        if (Math.hypot(dx, dy) < radius - 6) {
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 4. Draw Monsters (Red/Purple dots)
      monsters.forEach((m) => {
        if (m.state === 'dead') return;
        const dx = (m.x - playerPos.x) * scale;
        const dy = (m.y - playerPos.y) * scale;
        if (Math.hypot(dx, dy) < radius - 6) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 5. Center Player Arrow (Cyan)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(playerPos.angle);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -4);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.restore();

      animId = requestAnimationFrame(renderRadar);
    };

    animId = requestAnimationFrame(renderRadar);
    return () => cancelAnimationFrame(animId);
  }, [playerPos, monsters, teammates, interactables, buildings]);

  return (
    <div className="relative flex flex-col items-center">
      <div
        onClick={() => {
          if (onOpenWorldMap) {
            soundManager.playClick();
            onOpenWorldMap();
          }
        }}
        title="点击查看全境战略大地图 [M]"
        className="relative p-1 rounded-full bg-slate-900/90 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.35)] cursor-pointer group hover:border-cyan-400 transition-all"
      >
        <canvas ref={canvasRef} width={130} height={130} className="rounded-full" />
        <div className="absolute top-1 left-2 text-[9px] font-mono text-cyan-400 font-bold uppercase tracking-wider group-hover:text-cyan-200">
          RADAR 360°
        </div>
        <div className="absolute bottom-1 right-2 p-1 rounded-full bg-slate-950/80 border border-cyan-500/40 text-cyan-300 group-hover:scale-110 transition-transform">
          <Map className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
};
