import { describe, expect, it } from 'vitest';
import { COLLECT_DEFS, COLLECT_SETS, collectTierOf, setProgress, setBonusCredits } from './collection';

describe('collection codex', () => {
  it('tiers cover all collectibles: memorial/fine/heirloom/mythic', () => {
    expect(collectTierOf('collect_circuit')).toBe('memorial');
    expect(collectTierOf('collect_watch')).toBe('fine');
    expect(collectTierOf('collect_dogtag')).toBe('fine');
    expect(collectTierOf('collect_mandel')).toBe('heirloom');
    expect(collectTierOf('fish_legend')).toBe('mythic');
    expect(COLLECT_DEFS['collect_mandel'].sellPrice).toBe(1500);
    expect(COLLECT_DEFS['fish_legend'].sellPrice).toBe(2000);
  });
  it('set progress counts owned/total and bonus only when complete', () => {
    const owned = new Set(['collect_watch', 'collect_circuit']);
    const p = setProgress('decent', owned);
    expect(p.owned).toBe(2);
    expect(p.total).toBe(2);
    expect(setBonusCredits('decent', owned)).toBe(500);
    const empty = new Set<string>([]);
    expect(setBonusCredits('decent', empty)).toBe(0);
    expect(setBonusCredits('mandel', new Set(['collect_mandel', 'key_red', 'fish_legend']))).toBe(3000);
    expect(setBonusCredits('mandel', new Set(['collect_mandel']))).toBe(0);
  });
  it('every collectible has a drop source (no shop-only mythic)', () => {
    for (const [id, d] of Object.entries(COLLECT_DEFS)) {
      expect(d.source.length).toBeGreaterThan(3);
    }
    expect(COLLECT_DEFS['collect_mandel'].source).toContain('红房');
  });
});
describe('pioneer set is completable', () => {
  it('needs unique members only', async () => {
    const { COLLECT_SETS, setBonusCredits } = await import('./collection');
    const members = COLLECT_SETS['pioneer'].members;
    expect(new Set(members).size).toBe(members.length);
    expect(setBonusCredits('pioneer', new Set(['collect_dogtag', 'key_blue']))).toBe(1200);
    expect(setBonusCredits('pioneer', new Set(['collect_dogtag']))).toBe(0);
  });
});
