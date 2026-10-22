import type { WeatherState, WeatherType } from '../types/game';

export const WEATHER_DURATION = 180;
export const WEATHER_SEQUENCE: WeatherType[] = ['clear', 'acid_rain', 'fog', 'thunder', 'rain'];
export const ACID_SHIELD_DRAIN = 1.5;

const INFO: Record<WeatherType, Omit<WeatherState, 'current' | 'durationLeft'>> = {
  clear: { name: '晴朗破晓', icon: '☀️', desc: '视野清晰，无负面环境侵蚀。', effectLabel: '视野清晰 · 无环境腐蚀' },
  acid_rain: { name: '酸雨风暴', icon: '🧪', desc: '公共野外护盾每秒受损1.5，期间暂停护盾回复；不会直接扣除生命，独立营地免疫。', effectLabel: '护盾每秒腐蚀1.5 · 暂停回复' },
  fog: { name: '暗蚀重雾', icon: '🌫️', desc: '浓雾笼罩荒野，影响画面可见度。', effectLabel: '浓雾遮蔽视野' },
  thunder: { name: '离子雷暴', icon: '⚡', desc: '强对流离子风暴，闪电照亮荒野。', effectLabel: '雷暴闪光 · 留意周围动静' },
  rain: { name: '荒芜骤雨', icon: '🌧️', desc: '雨幕笼罩荒野，影响画面可见度。', effectLabel: '降雨预警' },
};

export function weatherInfo(current: WeatherType, durationLeft: number = WEATHER_DURATION): WeatherState {
  return { current, ...INFO[current], durationLeft: Math.max(0, Math.ceil(durationLeft)) };
}
