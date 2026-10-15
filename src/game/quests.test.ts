import { describe, expect, it } from 'vitest';
import { ACT1_QUESTS, ACT2_QUESTS, ACT3_QUESTS, ALL_QUESTS, questDoneCount, nextQuestId } from './quests';

describe('quests three acts', () => {
  it('act sizes are 8/6/4 and total 18 with unique ids', () => {
    expect(ACT1_QUESTS).toHaveLength(8);
    expect(ACT2_QUESTS).toHaveLength(6);
    expect(ACT3_QUESTS).toHaveLength(4);
    expect(ALL_QUESTS).toHaveLength(18);
    const ids = ALL_QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(18);
  });
  it('act1 keeps legacy 8 ids for App compat', () => {
    expect(ACT1_QUESTS.map((q) => q.id)).toEqual(['move', 'wood', 'stone', 'scrap', 'workbench', 'pickaxe', 'eat', 'kill']);
  });
  it('act2 is territory arc, act3 is boss arc', () => {
    expect(ACT2_QUESTS.map((q) => q.id)).toEqual(['claim', 'safedoor', 'rifle', 'raid_npc', 'elite', 'turret']);
    expect(ACT3_QUESTS.map((q) => q.id)).toEqual(['boss1', 'darkcore', 'level10', 'fortress']);
  });
  it('questDoneCount and nextQuestId work', () => {
    expect(questDoneCount(new Set(['move', 'wood']))).toBe(2);
    expect(nextQuestId(new Set(['move']))).toBe('wood');
    expect(nextQuestId(new Set(ALL_QUESTS.map((q) => q.id)))).toBeNull();
  });
});
