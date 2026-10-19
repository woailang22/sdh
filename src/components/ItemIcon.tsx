import React, { useState } from 'react';
import { iconFor, spriteStyle } from '../game/art';

interface ItemIconProps {
  id: string;
  emoji: string;
  size?: number;
}

/** 道具图标：有美术用 strip 精灵裁剪，加载失败/无覆盖回退 emoji。 */
export const ItemIcon: React.FC<ItemIconProps> = ({ id, emoji, size = 28 }) => {
  const [failed, setFailed] = useState(false);
  const f = failed ? null : iconFor(id);
  const s = f ? spriteStyle(f.file, f.frame, size) : null;
  if (!f || !s) {
    return <span className="text-xl leading-none">{emoji}</span>;
  }
  return (
    <div
      style={{ width: size, height: size, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: s.width, height: size, overflow: 'hidden', position: 'relative', flex: 'none' }}>
        <img
          src={s.src}
          draggable={false}
          onError={() => setFailed(true)}
          style={{ position: 'absolute', left: s.offsetX, top: 0, width: s.imgW, height: size, maxWidth: 'none' }}
          alt=""
        />
      </div>
    </div>
  );
};
