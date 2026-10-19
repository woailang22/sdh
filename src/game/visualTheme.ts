// 唯一真相色板：所有 Canvas 直绘与小地图/世界地图都从这里取色。
export type GroundTheme =
  | 'camp' | 'plaza' | 'field' | 'urban' | 'ruins'
  | 'forest' | 'quarry' | 'lake' | 'marsh' | 'rift';

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function hexToRgb(hex: string): [number, number, number] {
  const m = HEX_RE.exec(hex);
  if (!m) throw new Error(`bad hex color: ${hex}`);
  const v = m[1];
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

// camp 主色微差对（dusty 橄榄，向 map-camp.jpg 预览看齐；ΔL 约 4%，测试锁死这两个值）
const CAMP_A = '#6e6e50';
const CAMP_B = '#727254';

// 全主题 dusty 化（实测自 public/art/map-*.jpg：灰调雾霾废土，去饱和）
const BASE_PAIRS: Record<GroundTheme, [string, string]> = {
  camp: [CAMP_A, CAMP_B],
  plaza: ['#6f6e68', '#73726c'],
  field: ['#6b6247', '#6f664b'],
  urban: ['#54534e', '#585751'],
  ruins: ['#5b5145', '#5f5548'],
  forest: ['#57503f', '#5b5343'],
  quarry: ['#8a8d90', '#8e9194'],
  lake: ['#46545e', '#4a5862'],
  marsh: ['#5c5a41', '#605e45'],
  rift: ['#4c423a', '#50463e'],
};

const HAZE: Record<GroundTheme, string> = {
  camp: 'rgba(196,180,142,0.07)',
  plaza: 'rgba(170,168,160,0.08)',
  field: 'rgba(192,182,142,0.06)',
  urban: 'rgba(165,162,155,0.08)',
  ruins: 'rgba(172,162,142,0.09)',
  forest: 'rgba(150,160,165,0.12)',
  quarry: 'rgba(172,177,182,0.10)',
  lake: 'rgba(150,165,175,0.12)',
  marsh: 'rgba(162,166,150,0.12)',
  rift: 'rgba(122,92,152,0.10)',
};

/** 每主题尘雾罩染（预览图式雾霾情绪，森林/湖灰蓝雾、裂隙紫灰、营地暖尘）。 */
export function themeHaze(theme: GroundTheme): string {
  return HAZE[theme] ?? HAZE.camp;
}

const ACCENTS: Record<GroundTheme, string> = {
  camp: '#34d399', plaza: '#94a3b8', field: '#4ade80',
  urban: '#f59e0b', ruins: '#a16207', forest: '#16a34a',
  quarry: '#94a3b8', lake: '#38bdf8', marsh: '#2dd4bf', rift: '#c026d3',
};

export function themeAccent(theme: GroundTheme): string {
  return ACCENTS[theme];
}

export function hash2(x: number, y: number): number {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  h = h - Math.floor(h);
  return h;
}

export function groundBaseColor(theme: GroundTheme, wx: number, wy: number): string {
  const pair = BASE_PAIRS[theme] ?? BASE_PAIRS.camp;
  const isEven = (wx + wy) % 2 === 0;
  // camp 锁死测试期望，其他主题走同一微差逻辑
  return isEven ? pair[0] : pair[1];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function healthBarColor(ratio: number): string {
  if (ratio > 0.55) return '#22c55e';
  if (ratio > 0.28) return '#f59e0b';
  return '#ef4444';
}

export function radarDotColor(kind: 'building' | 'interactable' | 'teammate' | 'monster' | 'waypoint'): string {
  switch (kind) {
    case 'building': return '#38bdf8';
    case 'interactable': return '#f59e0b';
    case 'teammate': return '#10b981';
    case 'monster': return '#ef4444';
    case 'waypoint': return '#06b6d4';
  }
}

export function outlineFor(fillHex: string): string {
  // 深色填充用浅紫白描边，浅色填充用深棕描边，保证 3:1 以上对比
  const darkFills = new Set(['#180728', '#170624', '#292524', '#44403c', '#3a2013', '#422817']);
  if (darkFills.has(fillHex.toLowerCase())) return '#e9d5ff';
  // 默认按亮度判断：以 #808080 为界
  try {
    const [r, g, b] = hexToRgb(fillHex);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum < 0.45 ? '#e9d5ff' : '#1c1917';
  } catch {
    return '#1c1917';
  }
}

export function shadowRadius(size: 'small' | 'medium' | 'large'): number {
  if (size === 'small') return 18;
  if (size === 'large') return 32;
  return 24;
}

export function drawSoftShadow(
  ctx: CanvasRenderingContext2D, sx: number, sy: number, radius: number
): void {
  const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, radius);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
  g.addColorStop(0.7, 'rgba(0, 0, 0, 0.18)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, radius, radius * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function pineColors(): { base: string; mid: string; highlight: string; trunk: string } {
  return { base: '#0d381e', mid: '#15803d', highlight: '#4ade80', trunk: '#3a2013' };
}

export function oakColors(): { leaf: string; leafLight: string; trunk: string } {
  return { leaf: '#15803d', leafLight: '#86efac', trunk: '#422817' };
}
export function weatherTint(w: 'clear' | 'rain' | 'thunder' | 'fog' | 'rift_storm'): string {
  if (w === 'clear') return 'rgba(254, 240, 138, 0.06)';
  if (w === 'rain') return 'rgba(15, 23, 42, 0.14)';
  if (w === 'thunder') return 'rgba(30, 27, 75, 0.18)';
  if (w === 'fog') return 'rgba(148, 163, 184, 0.16)';
  return 'rgba(88, 28, 135, 0.16)';
}
