import { describe, expect, it } from 'vitest';
import { frameRect, iconFor, spriteStyle, angleToSurvivorFrame, frameContent, interactableSprite, buildingSprite, rarityFrameStyle } from './art';

describe('art atlas', () => {
  it('keeps all six alternate environment frames inside their own atlas cell', () => {
    ['understory', 'outcrop', 'reeds', 'tank', 'rubble', 'fence'].forEach((kind, i) =>
      expect(frameRect('world-environment-v2.png', kind)).toEqual({ x: i % 3 * 512, y: Math.floor(i / 3) * 512, width: 512, height: 512 }));
  });
  it('gives each generated environment prop its own complete atlas cell', () => {
    const kinds = ['understory', 'outcrop', 'reeds', 'tank', 'rubble', 'fence'];
    kinds.forEach((kind, i) => expect(frameRect('world-environment-v1.png', kind)).toEqual({ x: (i % 3) * 512, y: Math.floor(i / 3) * 512, width: 512, height: 512 }));
  });
  it('maps rifle to weapons assault-rifle', () => {
    expect(iconFor('rifle')).toEqual({ file: 'icon-weapons.png', frame: 'assault-rifle' });
  });
  it('maps wp_p1911 to pistol and wood to material wood', () => {
    expect(iconFor('wp_p1911')).toEqual({ file: 'icon-weapons.png', frame: 'pistol' });
    expect(iconFor('wood')).toEqual({ file: 'icon-material.png', frame: 'wood' });
  });
  it('returns null for unknown id (UI falls back to emoji)', () => {
    expect(iconFor('no_such_item_xyz')).toBeNull();
  });
  it('frameRect returns measured rect for pine', () => {
    expect(frameRect('nature-trees.png', 'pine')).toEqual({ x: 0, y: 0, width: 505, height: 724 });
  });
  it('spriteStyle scales strip slice to requested size', () => {
    const s = spriteStyle('icon-weapons.png', 'assault-rifle', 28);
    expect(s).not.toBeNull();
    expect(s!.height).toBe(28);
    expect(s!.offsetX).toBe(0);
    // second frame shifts left; frames are portrait strips (w < h)
    const s2 = spriteStyle('icon-weapons.png', 'submachine-gun', 28)!;
    expect(s2.offsetX).toBeLessThan(0);
    expect(s2.width).toBeGreaterThan(0);
    expect(s2.width).toBeLessThan(28);
  });
  it('angle maps to survivor frames', () => {
    expect(angleToSurvivorFrame(0)).toBe('southeast');
    expect(angleToSurvivorFrame(Math.PI / 2)).toBe('southwest');
    expect(angleToSurvivorFrame(Math.PI)).toBe('northwest');
    expect(angleToSurvivorFrame(-Math.PI / 2)).toBe('northeast');
  });
  it('frameContent returns tight bounds with rect fallback', () => {
    expect(frameContent('char-survivor.png', 'southeast')).toEqual({ x: 183, y: 61, width: 261, height: 595 });
    expect(frameContent('icon-weapons.png', 'pistol')).toEqual({ x: 1733, y: 0, width: 439, height: 724 });
    expect(frameContent('nope.png', 'nope')).toBeNull();
  });
  it('frameContent covers dry-grass and crystal reuses anchor', () => {
    expect(frameContent('nature-trees.png', 'dry-grass')).toEqual({ x: 1708, y: 312, width: 393, height: 375 });
    expect(interactableSprite('crystal')).toEqual({ file: 'prop-crystal-cluster.png', frame: 'full', w: 40, h: 56, yOff: 4, alpha: 1 });
  });
  it('rarityFrameStyle maps 1-5 to chrome frames', () => {
    const s = rarityFrameStyle(5, 48)!;
    expect(s.backgroundImage).toContain('/art/ui-chrome.png');
    expect(s.backgroundPosition).toContain('px');
    expect(s.width).toBe(48);
    expect(rarityFrameStyle(1, 48)!.backgroundImage).toContain('/art/ui-chrome.png');
  });
  it('rarityFrameStyle rejects out-of-range', () => {
    expect(rarityFrameStyle(0, 48)).toBeNull();
    expect(rarityFrameStyle(6, 48)).toBeNull();
    expect(rarityFrameStyle(undefined, 48)).toBeNull();
  });
  it('single-image sprites use full frame with tight bounds', () => {
    expect(frameContent('veh-van.png', 'full')).toEqual({ x: 97, y: 218, width: 844, height: 615 });
    expect(frameContent('npc-allen.png', 'full')).toEqual({ x: 300, y: 30, width: 394, height: 957 });
    expect(frameContent('drone.png', 'full')).toEqual({ x: 86, y: 222, width: 852, height: 602 });
  });
  it('interactable table covers van/truck/scrap/pond and cluster crystal', () => {
    expect(interactableSprite('van')).toEqual({ file: 'veh-van.png', frame: 'full', w: 110, h: 80, yOff: 8, alpha: 1 });
    expect(interactableSprite('van2')).toEqual({ file: 'veh-truck.png', frame: 'full', w: 116, h: 77, yOff: 8, alpha: 1 });
    expect(interactableSprite('scrap')).toEqual({ file: 'prop-scrap.png', frame: 'full', w: 72, h: 46, yOff: 4, alpha: 1 });
    expect(interactableSprite('pond')).toEqual({ file: 'prop-pond.png', frame: 'full', w: 84, h: 68, yOff: 6, alpha: 1 });
    expect(interactableSprite('crystal')).toEqual({ file: 'prop-crystal-cluster.png', frame: 'full', w: 40, h: 56, yOff: 4, alpha: 1 });
  });
  it('sprite tables cover interactables and buildings', () => {
    expect(interactableSprite('car')).toEqual({ file: 'prop-wreck.png', frame: 'wrecked-sedan', w: 104, h: 68, yOff: 8, alpha: 1 });
    expect(interactableSprite('campfire')?.alpha).toBe(0.9);
    expect(interactableSprite('truck')).toBeNull();
    expect(buildingSprite('turret')?.frame).toBe('watch-turret');
    expect(buildingSprite('iron_wall')).toBeNull();
  });
});
