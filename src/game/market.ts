import type { MarketItem } from '../types/game';
import { ITEM_DEFS } from './items';

export interface MarketOffer { id: string; itemId: string; units: number; category: MarketItem['category'] }

// This is the existing public merchant's catalogue, not every defined game item.
export const MARKET_OFFERS: readonly MarketOffer[] = [
  { id: 'scrap', itemId: 'scrap', units: 10, category: '物资' },
  { id: 'ammo_box', itemId: 'ammo', units: 60, category: '装备' },
  { id: 'medkit', itemId: 'medkit', units: 1, category: '裂隙药剂' },
  { id: 'food_ration', itemId: 'food', units: 10, category: '物资' },
  { id: 'rift_shard', itemId: 'shard', units: 1, category: '稀有材料' },
  { id: 'seed_corn', itemId: 'seed_corn', units: 1, category: '物资' },
  { id: 'ore_copper', itemId: 'ore_copper', units: 1, category: '物资' },
  { id: 'att_scope4x', itemId: 'att_scope4x', units: 1, category: '装备' },
  { id: 'key_blue', itemId: 'key_blue', units: 1, category: '稀有材料' },
  { id: 'collect_mandel', itemId: 'collect_mandel', units: 1, category: '稀有材料' },
  { id: 'med_surgery', itemId: 'med_surgery', units: 1, category: '裂隙药剂' },
  { id: 'throw_frag', itemId: 'throw_frag', units: 1, category: '装备' },
  { id: 'wine_starfruit', itemId: 'wine_starfruit', units: 1, category: '稀有材料' },
];

export const marketOffer = (id: string) => MARKET_OFFERS.find(offer => offer.id === id);

export function marketItem(offer: MarketOffer): MarketItem {
  const definition = ITEM_DEFS[offer.itemId];
  return {
    id: offer.id, name: definition.name + (offer.units > 1 ? ` ×${offer.units}` : ''),
    category: offer.category, icon: definition.icon, description: definition.desc,
    buyPrice: definition.buyPrice * offer.units, sellPrice: definition.sellPrice * offer.units,
    // There is no finite merchant stock ledger; do not show invented quantities.
    stock: Infinity,
  };
}
