import React from 'react';
import { rarityFrameStyle } from '../game/art';

interface RarityFrameProps {
  rarity?: number;
  size?: number;
  className?: string;
  children?: React.ReactNode;
}

/** 稀有度框：ui-chrome 精灵做背景，图缺失时透明（现有边框兜底）。 */
export const RarityFrame: React.FC<RarityFrameProps> = ({ rarity, size = 44, className, children }) => {
  const st = rarityFrameStyle(rarity, size);
  return (
    <div
      className={className}
      style={{ width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {st && (
        <div
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', backgroundRepeat: 'no-repeat',
            backgroundImage: st.backgroundImage, backgroundSize: st.backgroundSize, backgroundPosition: st.backgroundPosition,
          }}
        />
      )}
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
};
