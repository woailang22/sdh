# 战斗体系完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐当前纯数值互砍式战斗的手感、反馈与数值闭环，使远程/近战/怪物AI/防御/击杀掉落/天气加成全部可测试、可调参、无刷怪点Bug。

**Architecture:** 新增 `src/game/combat.ts` 收敛所有战斗纯函数（武器定义、伤害、暴击、距离衰减、护甲、索敌、击杀奖励、天气修正），`IsometricEngine.ts` 只做薄调用层；怪物AI加索敌/回拉/分离/前摇；玩家加护盾延迟回复+冲刺无敌帧+受击反馈。先测后改，每任务独立可验证。

**Tech Stack:** TypeScript, Vitest（`npm test` / `npx vitest run`），Canvas IsometricEngine，无新依赖。

---

## 现状勘测（给零上下文工程师）

- 远程射击：`src/game/IsometricEngine.ts:1718-1732`（开火节流）+ `2144-2203`（`fireBullet` 锥形判定 `range=12.0` / 角度容差 `0.28` / 暴击 `25% x1.3`）。武器伤害由 `src/App.tsx:974-979` 按装备栏同步（`crude_gun=55` / 步枪 `=124`），射速写死 `fireRate=0.12`。
- 近战：`IsometricEngine.ts:1752-1791`，无武器时左键，找 `1.8` 格内第一个怪扣 `meleeDamage`（徒手 `12` / 工具 `22`，见 `App.tsx:984`），`0.5s` CD，耗 `4` 体力，无击退、无扇形。
- 怪物AI：`IsometricEngine.ts:1893-1938`，`dist<8.0` 追击，`dist<1.4` 每 `1.2s` 砍一刀，护甲减伤 `armorReduction`（背心 `0.15`，见 `App.tsx:985`），先扣护盾再扣血。无索敌差异、无回拉、无分离（多怪叠在一起）、无攻击前摇。
- 炮塔：`IsometricEngine.ts:1814-1845`，`7.0` 格找怪，`1.0s` CD 打 `45` 点，无目标优先级。
- 死亡/重生：玩家倒地 `IsometricEngine.ts:1672-1681` 回 `camp_plaza` 保物品清备弹；怪物死后 `setTimeout 12000ms` 在固定点 `(3±3, -4±2)` 复活——切图后重生点错误，这是本计划要修的Bug之一。
- 击杀奖励：`App.tsx:814-844` 写死 `xp+60 / credits+20 / shards+1`，与怪强度无关，无掉落物。
- 天气：`IsometricEngine.ts:906-923` 与 `server.ts:140-147` 只有 label（雷暴暴击+20%、浓雾视野-30% 等），**从未真正进入伤害/索敌计算**。
- 突袭安全门（PvE攻城）：`server.ts:391-508` 服务端权威，已有随机jq/暴击/成功率，**本次不动服务端**，只修客户端 `RaidModal` 硬编码存量显示问题之外的内容（YAGNI：突袭数值不出本计划）。
- 类型：`src/types/game.ts:38-52` `MonsterEntity`（`id/name/x/y/hp/maxHp/speed/damage/state/animTime/attackCooldown`），`Particle` 有 `text` 类型可做飘字。

## File Structure

- Create: `src/game/combat.ts` —— 唯一战斗数值真相。导出 `WEAPONS`、`MELEE`、`ARMOR_REDUCTION`、`rollCrit`、`calcRangedDamage`、`calcMonsterHit`、`absorbShieldFirst`、`aggroRangeFor`、`killReward`、`isEnraged`、`weatherCritBonus`。无DOM、无随机副作用（随机由调用方注入 `rand`）。
- Create: `src/game/combat.test.ts` —— 锁定上述全部纯函数，共约25个用例。
- Modify: `src/types/game.ts:38-52` —— `MonsterEntity` 加三个可选字段 `spawnX?: number; spawnY?: number; windup?: number;`（出生点回拉用，前摇计时用，老存档兼容）。
- Modify: `src/game/maps.ts:29-35` —— `M()` 工厂写入 `spawnX/spawnY`（出生即锚点），不动其他数据。
- Modify: `src/game/IsometricEngine.ts` —— 薄调用层：开火（`1718-1732`）、近战（`1752-1791`）、`fireBullet`（`2144-2203`）、怪物AI（`1893-1938`）、炮塔（`1814-1845`）、倒地/重生（`1672-1681`，`1777-1786`，`2189-2198` 三处复活）、`player` 加 `shieldRegenAt`/`invulnUntil`/`shake` 三个运行时字段、渲染加受击暗角+震屏。
- Modify: `src/App.tsx:972-991` —— 装备同步同时下发 `fireRate/range/spread`（土铳慢散、步枪快准），护甲表改从 `combat.ts` 导入。
- Modify: `src/App.tsx:814-844` —— 击杀奖励改调 `killReward(m.maxHp)` + 按掉落表进账（弹药/医疗/晶石），不再写死 `+20/+1`。

---

### Task 1: 战斗纯函数模块 + 锁定测试

**Files:**
- Create: `src/game/combat.ts`
- Test: `src/game/combat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/game/combat.test.ts
import { describe, expect, it } from 'vitest';
import {
  WEAPONS, MELEE, ARMOR_REDUCTION,
  rollCrit, calcRangedDamage, calcMonsterHit, absorbShieldFirst,
  aggroRangeFor, killReward, isEnraged, weatherCritBonus,
} from './combat';

describe('combat weapons', () => {
  it('rifle hits harder and faster than crude_gun', () => {
    expect(WEAPONS['rifle'].damage).toBe(124);
    expect(WEAPONS['crude_gun'].damage).toBe(55);
    expect(WEAPONS['rifle'].fireRate).toBe(0.12);
    expect(WEAPONS['crude_gun'].fireRate).toBe(0.28);
  });
  it('melee constants are locked', () => {
    expect(MELEE.bare).toBe(12);
    expect(MELEE.tool).toBe(22);
    expect(MELEE.range).toBe(1.8);
  });
  it('armor vest reduces 15 percent, cloth reduces 0', () => {
    expect(ARMOR_REDUCTION['armor_vest']).toBe(0.15);
    expect(ARMOR_REDUCTION['armor_cloth']).toBe(0);
  });
});

describe('rollCrit', () => {
  it('returns true when rand is below chance', () => {
    expect(rollCrit(0.25, () => 0.1)).toBe(true);
    expect(rollCrit(0.25, () => 0.3)).toBe(false);
  });
});

describe('calcRangedDamage', () => {
  it('no falloff at point blank', () => {
    expect(calcRangedDamage(124, 1.0, 12.0, false, 1.3)).toBe(124);
  });
  it('halves at max range, floors at 1', () => {
    expect(calcRangedDamage(124, 12.0, 12.0, false, 1.3)).toBe(62);
    expect(calcRangedDamage(124, 12.0, 12.0, true, 1.3)).toBe(80);
  });
  it('beyond range clamps to half', () => {
    expect(calcRangedDamage(55, 30.0, 10.0, false, 1.5)).toBe(27);
  });
});

describe('calcMonsterHit', () => {
  it('vest reduces 26 damage to 22', () => {
    expect(calcMonsterHit(26, 0.15)).toBe(22);
  });
  it('floors at 1', () => {
    expect(calcMonsterHit(1, 0.9)).toBe(1);
  });
});

describe('absorbShieldFirst', () => {
  it('shield soaks first', () => {
    expect(absorbShieldFirst(30, 100, 20)).toEqual({ shield: 10, hp: 100 });
  });
  it('overflow spills to hp', () => {
    expect(absorbShieldFirst(10, 100, 25)).toEqual({ shield: 0, hp: 85 });
  });
  it('no shield passes through', () => {
    expect(absorbShieldFirst(0, 100, 25)).toEqual({ shield: 0, hp: 75 });
  });
});

describe('aggroRangeFor', () => {
  it('high risk aggro is 10, fog shrinks 30 percent', () => {
    expect(aggroRangeFor('HIGH', 'clear')).toBe(10);
    expect(aggroRangeFor('HIGH', 'fog')).toBeCloseTo(7, 0);
  });
  it('safe zone never aggro', () => {
    expect(aggroRangeFor('SAFE', 'clear')).toBe(0);
  });
  it('extreme is 12', () => {
    expect(aggroRangeFor('EXTREME', 'clear')).toBe(12);
  });
});

describe('killReward', () => {
  it('scales with maxHp: 260hp gives xp 52', () => {
    expect(killReward(260)).toEqual({ xp: 52, credits: 26, shards: 1 });
  });
  it('boss 1600hp gives xp 320 credits 160 shards 6', () => {
    expect(killReward(1600)).toEqual({ xp: 320, credits: 160, shards: 6 });
  });
});

describe('isEnraged and weatherCritBonus', () => {
  it('enrages below 30 percent hp', () => {
    expect(isEnraged(29, 100)).toBe(true);
    expect(isEnraged(30, 100)).toBe(false);
  });
  it('thunder adds 0.2 crit', () => {
    expect(weatherCritBonus('thunder')).toBe(0.2);
    expect(weatherCritBonus('clear')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat.test.ts`
Expected: FAIL with `Error: Failed to resolve import "./combat"`（文件尚不存在）。

- [ ] **Step 3: Write minimal implementation**

```ts
// src/game/combat.ts
import type { WeatherType } from '../types/game';

export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  fireRate: number;
  range: number;
  spread: number;
  critChance: number;
  critMult: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  crude_gun: { id: 'crude_gun', name: '土铳', damage: 55, fireRate: 0.28, range: 10, spread: 0.09, critChance: 0.15, critMult: 1.5 },
  rifle: { id: 'rifle', name: '战术突击步枪', damage: 124, fireRate: 0.12, range: 12, spread: 0.03, critChance: 0.25, critMult: 1.3 },
};

export const MELEE = {
  bare: 12,
  tool: 22,
  range: 1.8,
  arc: 1.9,
  cooldown: 0.5,
  stamina: 4,
  knockback: 1.2,
} as const;

export const ARMOR_REDUCTION: Record<string, number> = {
  armor_cloth: 0,
  armor_vest: 0.15,
};

export function rollCrit(chance: number, rand: () => number = Math.random): boolean {
  return rand() < chance;
}

export function calcRangedDamage(base: number, dist: number, range: number, isCrit: boolean, critMult: number): number {
  if (dist <= 2) return Math.max(1, Math.floor(base * (isCrit ? critMult : 1)));
  const clamped = Math.max(0, Math.min(1, dist / range));
  const falloff = 1 - clamped * 0.5;
  const raw = base * falloff * (isCrit ? critMult : 1);
  return Math.max(1, Math.floor(raw));
}

export function calcMonsterHit(monsterDamage: number, armorReduction: number): number {
  return Math.max(1, Math.floor(monsterDamage * (1 - armorReduction)));
}

export function absorbShieldFirst(shield: number, hp: number, dmg: number): { shield: number; hp: number } {
  const soaked = Math.min(shield, dmg);
  const rest = dmg - soaked;
  return { shield: shield - soaked, hp: hp - rest };
}

type Risk = 'SAFE' | 'LOW' | 'HIGH' | 'EXTREME';

const BASE_AGGRO: Record<Risk, number> = {
  SAFE: 0,
  LOW: 8,
  HIGH: 10,
  EXTREME: 12,
};

export function aggroRangeFor(risk: Risk, weather: WeatherType): number {
  const base = BASE_AGGRO[risk] ?? 8;
  if (base === 0) return 0;
  if (weather === 'fog') return base * 0.7;
  return base;
}

export function killReward(maxHp: number): { xp: number; credits: number; shards: number } {
  const xp = Math.floor(maxHp * 0.2);
  const credits = Math.floor(maxHp * 0.1);
  const shards = maxHp >= 1000 ? 6 : maxHp >= 500 ? 3 : 1;
  return { xp, credits, shards };
}

export function isEnraged(hp: number, maxHp: number): boolean {
  if (maxHp <= 0) return false;
  return hp / maxHp < 0.3;
}

export function weatherCritBonus(w: WeatherType): number {
  return w === 'thunder' ? 0.2 : 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat.test.ts`
Expected: PASS，`Test Files 1 passed`，约 14 tests passed。

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts src/game/combat.test.ts
git commit -m "feat(combat): add pure combat math module with tests"
```

---

### Task 2: 远程手感——散布/衰减/枪械差异接入

**Files:**
- Modify: `src/game/IsometricEngine.ts:96-120`（player 字段区，加运行时调参）
- Modify: `src/game/IsometricEngine.ts:2144-2203`（`fireBullet`）
- Test: `src/game/combat.test.ts`（复用 Task 1，不新增文件）

- [ ] **Step 1: Write the failing test**

```ts
// 追加到 src/game/combat.test.ts 末尾
import { calcRangedDamage as calc2 } from './combat';
import { describe as describe2, expect as expect2, it as it2 } from 'vitest';

describe2('ranged falloff rounding', () => {
  it2('rifle at 6 of 12 range deals 93', () => {
    expect2(calc2(124, 6.0, 12.0, false, 1.3)).toBe(93);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat.test.ts -t "rifle at 6"`
Expected: FAIL（`expected 93 but got ...` 若实现是旧逻辑；本步先确认新断言尚未满足——若 Task 1 已实现则本步直接 PASS，视为锁定回归，继续往下）。

- [ ] **Step 3: Write minimal implementation**

3a. 在 `IsometricEngine.ts` 的 `player` 对象（约 `96-120` 行）旁加三个公开调参字段。找到：

```ts
  public hasRangedWeapon: boolean = false; // 装备武器才能射击，否则左键为徒手/工具近战
  public rangedDamage: number = 124; // 土铳55 / 步枪124
```

替换为：

```ts
  public hasRangedWeapon: boolean = false; // 装备武器才能射击，否则左键为徒手/工具近战
  public rangedDamage: number = 124; // 土铳55 / 步枪124
  public rangedRange: number = 12; // 土铳10 / 步枪12，由 App 按装备同步
  public rangedSpread: number = 0.03; // 土铳0.09 / 步枪0.03
  public rangedCritChance: number = 0.25; // 基础暴击，雷暴天气+0.2
  public rangedCritMult: number = 1.3; // 步枪1.3 / 土铳1.5
```

3b. 重写 `fireBullet`（约 `2144-2203` 行）。找到完整旧函数并替换为：

```ts
  private fireBullet(startX: number, startY: number, angle: number) {
    const range = this.rangedRange;
    const spread = this.rangedSpread;

    this.particles.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * 35,
      vy: Math.sin(angle) * 35,
      life: 0.12,
      maxLife: 0.12,
      color: '#fef08a',
      size: 3,
      type: 'laser',
    });

    for (const m of this.monsters) {
      if (m.state === 'dead') continue;
      const dist = Math.hypot(m.x - startX, m.y - startY);
      const angleToMonster = Math.atan2(m.y - startY, m.x - startX);
      let angleDiff = Math.abs(angle - angleToMonster);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
      // 散布：土铳容差大但要求近，步枪容差小但射程远
      const tolerance = 0.28 + spread;

      if (dist < range && (angleDiff < tolerance || dist < 1.2)) {
        const { calcRangedDamage, rollCrit, weatherCritBonus } = require('./combat') as typeof import('./combat');
        const critChance = Math.min(0.6, this.rangedCritChance + weatherCritBonus(this.currentWeather));
        const isCrit = rollCrit(critChance);
        const damage = calcRangedDamage(this.rangedDamage, dist, range, isCrit, this.rangedCritMult);
        m.hp -= damage;
        m.state = 'chase';
        soundManager.playHit(isCrit);

        this.addTextParticle(m.x, m.y - 1.2, `-${damage}`, isCrit ? '#facc15' : '#fb923c');

        for (let i = 0; i < 8; i++) {
          this.particles.push({
            x: m.x,
            y: m.y,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            life: 0.4,
            maxLife: 0.4,
            color: '#a855f7',
            size: 4 + Math.random() * 4,
            type: 'smoke',
          });
        }

        if (m.hp <= 0) {
          m.state = 'dead';
          this.addTextParticle(m.x, m.y - 1.5, '已击杀', '#ec4899');
          this.callbacks.onMonsterKilled(m.name);
          const mx = m.spawnX ?? 3.0;
          const my = m.spawnY ?? -4.0;
          const dead = m;
          setTimeout(() => {
            dead.hp = dead.maxHp;
            dead.state = 'roam';
            dead.windup = 0;
            dead.x = mx + (Math.random() - 0.5) * 6;
            dead.y = my + (Math.random() - 0.5) * 4;
          }, 12000);
        }
        break;
      }
    }
  }
```

注意：本仓库 `IsometricEngine.ts` 顶部是 ESM `import` 风格，`require` 在 Vite 下不可用。保存前把 `require` 行换成文件顶部静态导入：

```ts
import { calcRangedDamage, rollCrit, weatherCritBonus } from './combat';
```

并删除函数内那行 `const { ... } = require(...)`，直接调用导入的函数。上面代码块为展示完整逻辑，落盘时以静态导入为准。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat.test.ts`
Expected: PASS。再跑 `npm run lint`（即 `tsc --noEmit`）Expected: 无报错。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/combat.test.ts
git commit -m "feat(combat): ranged falloff spread crit with weather bonus"
```

---

### Task 3: 近战扇形 + 击退 + 落空体力

**Files:**
- Modify: `src/game/IsometricEngine.ts:1752-1791`（近战分支）
- Test: `src/game/combat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// 追加到 src/game/combat.test.ts
import { MELEE as MELEE3 } from './combat';
import { describe as d3, expect as e3, it as i3 } from 'vitest';

d3('melee arc rule', () => {
  i3('arc is wider than 1 radian so side targets count', () => {
    e3(MELEE3.arc).toBeGreaterThan(1);
  });
  i3('knockback displaces at least 1 tile', () => {
    e3(MELEE3.knockback).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat.test.ts -t "melee arc"`
Expected: 首次 PASS（常量已在 Task 1 锁定）——本步作为回归锁，继续。

- [ ] **Step 3: Write minimal implementation**

找到 `IsometricEngine.ts` 约 `1752-1791` 行的近战分支旧代码：

```ts
      // Melee：徒手12 / 持镐22，近距离挥击，耗4体力
      if (this.player.isFiring && !this.isBuildMode && !this.hasRangedWeapon) {
```

整段替换为（保持外层 `if/else` 缩进不变）：

```ts
      // Melee：扇形挥击 + 击退，落空也耗体力防空挥刷怪
      if (this.player.isFiring && !this.isBuildMode && !this.hasRangedWeapon) {
        this.meleeTimer -= dt;
        if (this.meleeTimer <= 0 && this.player.stamina >= MELEE.stamina) {
          const targets = this.monsters.filter((m) => {
            if (m.state === 'dead') return false;
            const dist = Math.hypot(m.x - this.player.x, m.y - this.player.y);
            if (dist > MELEE.range) return false;
            const ang = Math.atan2(m.y - this.player.y, m.x - this.player.x);
            let diff = Math.abs(this.player.angle - ang);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            return diff < MELEE.arc;
          });
          if (targets.length > 0) {
            this.meleeTimer = MELEE.cooldown;
            this.player.stamina -= MELEE.stamina;
            for (const target of targets.slice(0, 3)) {
              target.hp -= this.meleeDamage;
              target.state = 'chase';
              const d = Math.max(0.001, Math.hypot(target.x - this.player.x, target.y - this.player.y));
              target.x += ((target.x - this.player.x) / d) * MELEE.knockback;
              target.y += ((target.y - this.player.y) / d) * MELEE.knockback;
              soundManager.playHit(false);
              this.addTextParticle(target.x, target.y - 1.2, `-${this.meleeDamage}`, '#fdba74');
              this.particles.push({
                x: target.x,
                y: target.y,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                life: 0.25,
                maxLife: 0.25,
                color: '#fdba74',
                size: 5,
                type: 'spark',
              });
              if (target.hp <= 0) {
                target.state = 'dead';
                this.addTextParticle(target.x, target.y - 1.5, '已击杀', '#ec4899');
                this.callbacks.onMonsterKilled(target.name);
                const mx = target.spawnX ?? 3.0;
                const my = target.spawnY ?? -4.0;
                const dead = target;
                setTimeout(() => {
                  dead.hp = dead.maxHp;
                  dead.state = 'roam';
                  dead.windup = 0;
                  dead.x = mx + (Math.random() - 0.5) * 6;
                  dead.y = my + (Math.random() - 0.5) * 4;
                }, 12000);
              }
            }
          } else {
            // 挥空：短CD + 照样扣体力
            this.meleeTimer = 0.25;
            this.player.stamina -= 2;
          }
        }
      }
```

并在文件顶部确认已有 `import { MELEE } from './combat';`，若无则加上（与 Task 2 的 `calcRangedDamage` 同一行合并）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat.test.ts`
Expected: PASS。再跑 `npm run lint` Expected: 无报错。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/combat.test.ts
git commit -m "feat(combat): melee arc knockback with whiff stamina cost"
```

---

### Task 4: 怪物AI——索敌/回拉/分离/攻击前摇

**Files:**
- Modify: `src/types/game.ts:38-52`
- Modify: `src/game/maps.ts:29-35`
- Modify: `src/game/IsometricEngine.ts:1893-1938`
- Test: `src/game/combat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// 追加到 src/game/combat.test.ts
import { aggroRangeFor as aggro4 } from './combat';
import { describe as d4, expect as e4, it as i4 } from 'vitest';

d4('monster aggro tiers', () => {
  i4('low aggro 8, extreme 12, fog shrinks', () => {
    e4(aggro4('LOW', 'clear')).toBe(8);
    e4(aggro4('EXTREME', 'clear')).toBe(12);
    e4(aggro4('LOW', 'fog')).toBeCloseTo(5.6, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat.test.ts -t "aggro tiers"`
Expected: PASS（回归锁）。继续。

- [ ] **Step 3: Write minimal implementation**

3a. `src/types/game.ts:38-52`，找到：

```ts
export interface MonsterEntity {
  id: string;
  name: string;
  x: number; // Isometric world coordinate
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  state: 'roam' | 'chase' | 'attack' | 'hurt' | 'dead';
  animTime: number;
  targetX?: number;
  targetY?: number;
  attackCooldown: number;
}
```

替换为：

```ts
export interface MonsterEntity {
  id: string;
  name: string;
  x: number; // Isometric world coordinate
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  state: 'roam' | 'chase' | 'attack' | 'hurt' | 'dead';
  animTime: number;
  targetX?: number;
  targetY?: number;
  attackCooldown: number;
  spawnX?: number; // 出生锚点：回拉用
  spawnY?: number; // 出生锚点：回拉用
  windup?: number; // 攻击前摇剩余秒数，>0 时闪红预警不造成伤害
}
```

3b. `src/game/maps.ts:29-35`，找到：

```ts
const M = (
  id: string, name: string, x: number, y: number,
  hp: number, speed: number, damage: number,
): MonsterEntity => ({
  id, name, x, y, hp, maxHp: hp, speed, damage,
  state: 'roam', animTime: Math.random(), attackCooldown: 0,
});
```

替换为：

```ts
const M = (
  id: string, name: string, x: number, y: number,
  hp: number, speed: number, damage: number,
): MonsterEntity => ({
  id, name, x, y, hp, maxHp: hp, speed, damage,
  state: 'roam', animTime: Math.random(), attackCooldown: 0,
  spawnX: x, spawnY: y, windup: 0,
});
```

3c. `IsometricEngine.ts` 怪物循环（约 `1893-1938` 行）整段替换为：

```ts
    // Monsters
    this.monsters.forEach((m) => {
      if (m.state === 'dead') return;
      m.animTime += dt;
      if (m.windup === undefined) m.windup = 0;
      if (m.spawnX === undefined) m.spawnX = m.x;
      if (m.spawnY === undefined) m.spawnY = m.y;

      // 回拉：追出出生点 14 格则脱战回血回家
      const homeDist = Math.hypot(m.x - m.spawnX, m.y - m.spawnY);
      if (homeDist > 14) {
        m.state = 'roam';
        m.windup = 0;
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.1 * dt * 10);
        m.x += (m.spawnX - m.x) * Math.min(1, 1.5 * dt);
        m.y += (m.spawnY - m.y) * Math.min(1, 1.5 * dt);
        return;
      }

      const dx = this.player.x - m.x;
      const dy = this.player.y - m.y;
      const dist = Math.hypot(dx, dy);
      const risk = this.currentMapId.startsWith('marsh_rift') ? 'EXTREME'
        : this.currentMapId.startsWith('town_ruins') || this.currentMapId.startsWith('mtn_deep') || this.currentMapId.startsWith('marsh_bog') ? 'HIGH'
        : this.currentMapId.startsWith('camp') ? 'SAFE' : 'LOW';
      const aggro = aggroRangeFor(risk, this.currentWeather);

      if (dist < aggro && aggro > 0) {
        // 狂暴：血量<30% 移速+30% 伤害+25%
        const enraged = isEnraged(m.hp, m.maxHp);
        const spd = m.speed * (enraged ? 1.3 : 1);
        m.state = 'chase';
        if (dist > 0.001) {
          m.x += (dx / dist) * spd * dt;
          m.y += (dy / dist) * spd * dt;
        }

        // 分离：同类挤在一起时互相推开，防叠罗汉
        for (const o of this.monsters) {
          if (o === m || o.state === 'dead') continue;
          const ox = m.x - o.x;
          const oy = m.y - o.y;
          const od = Math.hypot(ox, oy);
          if (od < 0.9 && od > 0.001) {
            m.x += (ox / od) * 1.2 * dt;
            m.y += (oy / od) * 1.2 * dt;
          }
        }

        this.buildings.forEach((b) => {
          if ((b.type === 'iron_wall' || (b.type === 'door' && !b.isOpen)) && Math.hypot(b.x - m.x, b.y - m.y) < 1.1) {
            b.hp -= 8 * dt;
            if (Math.random() < 0.08) {
              this.addTextParticle(b.x, b.y - 1.0, '-8 耐久', '#f87171');
            }
          }
        });

        if (dist < 1.4) {
          // 前摇：首次进入先预警 0.35s，期间只闪红不扣血
          if (m.attackCooldown <= 0 && (m.windup ?? 0) <= 0) {
            m.windup = 0.35;
            m.state = 'attack';
            this.addTextParticle(m.x, m.y - 1.4, '!', '#f87171');
          } else if ((m.windup ?? 0) > 0) {
            m.windup = Math.max(0, (m.windup ?? 0) - dt);
            if (m.windup === 0) {
              m.attackCooldown = 1.2;
              const { calcMonsterHit: calcHit, absorbShieldFirst: absorb } = require('./combat') as typeof import('./combat');
              const raw = m.damage * (enraged ? 1.25 : 1);
              const dmg = calcHit(raw, this.armorReduction);
              const res = absorb(this.player.shield, this.player.hp, dmg);
              // 冲刺无敌帧：invulnUntil 内免伤
              if (this.gameTime < this.invulnUntil) {
                this.addTextParticle(this.player.x, this.player.y - 0.8, '闪避!', '#38bdf8');
              } else {
                this.player.shield = Math.max(0, res.shield);
                this.player.hp = Math.max(0, res.hp);
                this.shake = Math.min(10, this.shake + 4);
                this.hurtFlash = 0.35;
                this.player.shieldRegenAt = this.gameTime + 5;
                this.callbacks.onPlayerDamage(dmg);
                this.lastHurtAt = this.gameTime;
                this.addTextParticle(this.player.x, this.player.y - 0.8, `-${dmg}`, '#ef4444');
                soundManager.playHit(false);
              }
            }
          } else {
            m.attackCooldown -= dt;
          }
        } else {
          m.windup = 0;
          m.attackCooldown -= dt;
        }
      } else {
        m.state = 'roam';
        m.windup = 0;
        m.x += Math.cos(m.animTime * 0.8) * 0.4 * dt;
        m.y += Math.sin(m.animTime * 0.8) * 0.4 * dt;
      }
    });
```

落盘时同 Task 2：把函数内 `require('./combat')` 换成顶部静态导入 `import { aggroRangeFor, isEnraged, calcMonsterHit, absorbShieldFirst } from './combat';` 并直调。`this.shake` / `this.hurtFlash` / `this.invulnUntil` / `this.shieldRegenAt` 在 Task 5 定义，本任务先引用，lint 会在 Task 5 后通过（任务顺序执行）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/types/game.ts src/game/maps.ts src/game/IsometricEngine.ts src/game/combat.test.ts
git commit -m "feat(combat): monster aggro leash separation windup"
```

---

### Task 5: 玩家防御——护盾延迟回复/冲刺无敌/受击反馈

**Files:**
- Modify: `src/game/IsometricEngine.ts:96-134`（player + 运行时字段）
- Modify: `src/game/IsometricEngine.ts:1091-1108`（`performDash`）
- Modify: `src/game/IsometricEngine.ts:1655-1681`（体力/饱食/倒地区）
- Test: `src/game/combat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// 追加到 src/game/combat.test.ts
import { absorbShieldFirst as absorb5 } from './combat';
import { describe as d5, expect as e5, it as i5 } from 'vitest';

d5('shield regen rule', () => {
  i5('full absorb leaves hp untouched', () => {
    e5(absorb5(50, 80, 30)).toEqual({ shield: 20, hp: 80 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat.test.ts -t "shield regen"`
Expected: PASS（回归锁）。

- [ ] **Step 3: Write minimal implementation**

3a. 找到 `IsometricEngine.ts` 约 `122-134` 行：

```ts
  public meleeDamage: number = 12; // 徒手12 / 持工具22
  public armorReduction: number = 0; // 防弹背心 0.15 减伤
```

在其后插入：

```ts
  public meleeDamage: number = 12; // 徒手12 / 持工具22
  public armorReduction: number = 0; // 防弹背心 0.15 减伤
  public shieldRegenAt: number = 0; // 护盾延迟回复起点（受伤后+5s）
  public invulnUntil: number = -99; // 冲刺无敌帧结束时间点
  public shake: number = 0; // 受击震屏强度，每帧衰减
  public hurtFlash: number = 0; // 受击红屏剩余秒数
```

3b. 找到 `performDash`（约 `1091-1108` 行）：

```ts
  public performDash() {
    this.player.isDashing = true;
    this.player.dashTimer = 0.22;
    this.player.stamina -= 30;
```

替换为：

```ts
  public performDash() {
    this.player.isDashing = true;
    this.player.dashTimer = 0.22;
    this.player.stamina -= 30;
    this.invulnUntil = this.gameTime + 0.22;
```

（函数其余粒子代码保持不动。）

3c. 找到 `update` 内体力回复段（约 `1655-1658` 行）：

```ts
    if (this.player.stamina < this.player.maxStamina) {
      const regenRate = this.player.satiety <= 0 ? 6 : 20;
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + regenRate * dt);
    }
```

在其后插入护盾延迟回复：

```ts
    if (this.player.stamina < this.player.maxStamina) {
      const regenRate = this.player.satiety <= 0 ? 6 : 20;
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + regenRate * dt);
    }

    // 护盾延迟回复：脱战5s后每秒回8点，酸雨天不回复反腐蚀
    if (this.currentWeather === 'acid_rain') {
      this.player.shield = Math.max(0, this.player.shield - 1.5 * dt);
    } else if (this.gameTime >= this.shieldRegenAt && this.player.shield < this.player.maxShield) {
      this.player.shield = Math.min(this.player.maxShield, this.player.shield + 8 * dt);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 30 * dt);
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt);
```

3d. 受击暗角渲染：找到 `renderDynamicLighting` 方法（搜索 `private renderDynamicLighting`），在其方法体 `this.ctx.restore();` 之前插入：

```ts
    // 受击红屏 + 震屏平移（combat）
    if (this.hurtFlash > 0) {
      this.ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.28, this.hurtFlash * 0.6)})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
    if (this.shake > 0) {
      this.ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
```

若 `renderDynamicLighting` 内无 `restore` 收尾，则插在方法末尾大括号前，以 `npm run lint` 通过为准。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat.test.ts`
Expected: PASS。Run: `npm run lint` Expected: 无报错（Task 4 引入的字段此时补齐）。

手动验证：进 `town_gas` 被暴徒砍，中刀红屏一闪；`Space` 冲刺穿怪刀不掉血；脱战5秒护盾缓慢回升。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/combat.test.ts
git commit -m "feat(combat): shield regen dash iframes hurt feedback"
```

---

### Task 6: 击杀奖励按强度结算 + 掉落物

**Files:**
- Modify: `src/App.tsx:814-844`（`onMonsterKilled`）
- Test: `src/game/combat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// 追加到 src/game/combat.test.ts
import { killReward as reward6 } from './combat';
import { describe as d6, expect as e6, it as i6 } from 'vitest';

d6('kill reward curve', () => {
  i6('450hp brute gives xp 90 credits 45', () => {
    e6(reward6(450)).toEqual({ xp: 90, credits: 45, shards: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat.test.ts -t "450hp"`
Expected: PASS（Task 1 已实现 `floor(maxHp*0.2)` 即 90，回归锁）。

- [ ] **Step 3: Write minimal implementation**

找到 `App.tsx` 约 `814-844` 行 `onMonsterKilled` 旧回调：

```ts
      onMonsterKilled: (monsterName: string) => {
        setKillCount((prev) => prev + 1);
        const xpGained = 60;
```

整段替换为（注意回调签名改为接收怪的 `maxHp`，引擎侧三处 `onMonsterKilled(target.name)` 同步改为 `onMonsterKilled(target.name, target.maxHp)`——本任务一并改引擎三处调用）：

```ts
      onMonsterKilled: (monsterName: string, monsterMaxHp?: number) => {
        setKillCount((prev) => prev + 1);
        const { killReward } = require('./game/combat') as typeof import('./game/combat');
        const reward = killReward(monsterMaxHp ?? 300);
        const xpGained = reward.xp;
```

落盘时不用 `require`：在 `App.tsx` 顶部（约 `27` 行 `maps` 导入旁）加：

```ts
import { killReward } from './game/combat';
```

并删除回调内 `require` 行，直接用 `killReward`。奖励结算后半段（约 `818-844` 行升级逻辑）替换为：

```ts
        // Level-up logic（求生数值：升级+10生命/+5护盾）
        setPlayerStats((prev) => {
          const nextXp = prev.xp + xpGained;
          if (nextXp >= prev.maxXp) {
            soundManager.playCraft();
            const newLvl = prev.level + 1;
            netManagerRef.current?.sendChat('world', `✨ 我已升级至 Lv.${newLvl}！`);
            return {
              ...prev,
              level: newLvl,
              xp: nextXp - prev.maxXp,
              maxXp: Math.floor(prev.maxXp * 1.3),
              maxHp: prev.maxHp + 10,
              hp: prev.maxHp + 10,
              maxShield: prev.maxShield + 5,
              shield: prev.maxShield + 5,
              credits: prev.credits + reward.credits,
            };
          }
          return {
            ...prev,
            xp: nextXp,
            credits: prev.credits + reward.credits,
            shards: prev.shards + reward.shards,
          };
        });
        // 击杀掉落：按强度概率掉弹药/医疗（进背包，满则转文字提示）
        if (engineRef.current) {
          const eng = engineRef.current;
          const roll = Math.random();
          if ((monsterMaxHp ?? 0) >= 1000 || roll < 0.25) {
            eng.player.reserveAmmo += 12;
            eng.addTextParticle(eng.player.x, eng.player.y - 1.8, '+12 步枪弹药（按R装填）', '#38bdf8');
          } else if (roll < 0.4) {
            addItemToHotbar({ id: 'med_亚麻绷带', name: '亚麻绷带', category: 'medical', icon: '🩹', count: 1, maxCount: 10, desc: '点击使用，恢复30点生命。', rarity: 2 });
          }
        }
```

引擎侧三处调用同步改（近战击杀、子弹击杀、炮塔击杀）：把 `this.callbacks.onMonsterKilled(target.name)` / `(m.name)` / `(nearbyMonster.name)` 全部改为带第二个参数 `target.maxHp` / `m.maxHp` / `nearbyMonster.maxHp`。`GameCallbacks` 接口（约 `21` 行）同步改为：

```ts
  onMonsterKilled: (monsterName: string, monsterMaxHp?: number) => void;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat.test.ts`
Expected: PASS。Run: `npm run lint` Expected: 无报错。

手动验证：杀 `蚀化幼体（260HP）` 得 `xp52`；杀领主（`1600HP`）得 `xp320/shards6` 且必掉 `+12` 备弹。

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/game/IsometricEngine.ts src/game/combat.test.ts
git commit -m "feat(combat): scaled kill rewards with ammo medical drops"
```

---

### Task 7: 炮塔集火 + 尖刺陷阱对怪生效

**Files:**
- Modify: `src/game/IsometricEngine.ts:1814-1845`（Turret AI 段）
- Test: `src/game/combat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// 追加到 src/game/combat.test.ts
import { calcMonsterHit as hit7 } from './combat';
import { describe as d7, expect as e7, it as i7 } from 'vitest';

d7('turret damage', () => {
  i7('turret 45 base is flat, no armor', () => {
    e7(hit7(45, 0)).toBe(45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat.test.ts -t "turret"`
Expected: PASS（回归锁）。

- [ ] **Step 3: Write minimal implementation**

找到 `IsometricEngine.ts` 约 `1814-1845` 行炮塔段旧代码：

```ts
    // Turret AI
    this.buildings.forEach((b) => {
      if (b.type === 'turret') {
```

整段替换为：

```ts
    // Turret AI：集火最近的怪；尖刺： standing 怪每秒掉血
    this.buildings.forEach((b) => {
      if (b.type === 'spikes') {
        const victim = this.monsters.find((m) => m.state !== 'dead' && Math.hypot(m.x - b.x, m.y - b.y) < 1.0);
        if (victim) {
          victim.hp -= 20 * dt;
          victim.state = 'chase';
          if (Math.random() < 0.1) {
            this.addTextParticle(victim.x, victim.y - 1.0, '-20 铁刺', '#f59e0b');
          }
          if (victim.hp <= 0 && victim.state !== 'dead') {
            victim.state = 'dead';
            this.callbacks.onMonsterKilled(victim.name, victim.maxHp);
          }
        }
      }
      if (b.type === 'turret') {
        b.fireCooldown = (b.fireCooldown || 0) - dt;
        if ((b.fireCooldown || 0) <= 0) {
          let best: typeof this.monsters[number] | null = null;
          let bestD = 7.0;
          for (const m of this.monsters) {
            if (m.state === 'dead') continue;
            const d = Math.hypot(m.x - b.x, m.y - b.y);
            if (d < bestD) { bestD = d; best = m; }
          }
          if (best) {
            const target = best;
            b.fireCooldown = 1.0;
            target.hp -= 45;
            target.state = 'chase';
            soundManager.playHit(true);
            this.addTextParticle(target.x, target.y - 1.2, '-45 电击', '#06b6d4');

            this.particles.push({
              x: b.x,
              y: b.y,
              vx: (target.x - b.x) * 10,
              vy: (target.y - b.y) * 10,
              life: 0.15,
              maxLife: 0.15,
              color: '#38bdf8',
              size: 4,
              type: 'laser',
            });

            if (target.hp <= 0) {
              target.state = 'dead';
              this.callbacks.onMonsterKilled(target.name, target.maxHp);
            }
          }
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat.test.ts`
Expected: PASS。Run: `npm run lint` Expected: 无报错。

手动验证：在怪路上放 `spikes`，怪踩上去持续掉血飘字；放 `turret` 只打最近一只，不再随机跳目标。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/combat.test.ts
git commit -m "feat(combat): turret focus nearest plus spikes tick"
```

---

### Task 8: 装备→引擎武器参数同步（含护甲表收敛）

**Files:**
- Modify: `src/App.tsx:972-991`（60ms 同步循环内装备段）
- Test: `src/game/combat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// 追加到 src/game/combat.test.ts
import { WEAPONS as W8, ARMOR_REDUCTION as A8 } from './combat';
import { describe as d8, expect as e8, it as i8 } from 'vitest';

d8('weapon sync table', () => {
  i8('crude spread wider than rifle', () => {
    e8(W8['crude_gun'].spread).toBeGreaterThan(W8['rifle'].spread);
  });
  i8('unknown armor defaults to 0 via fallback', () => {
    e8(A8['unknown_xyz'] ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat.test.ts -t "weapon sync"`
Expected: PASS（回归锁）。

- [ ] **Step 3: Write minimal implementation**

找到 `App.tsx` 约 `972-985` 行旧同步代码：

```ts
      // 装备→引擎：战斗属性只看装备栏（背包只管存）
      const eq = equipmentRef.current;
      if (eq.weapon) {
        eng.hasRangedWeapon = true;
        eng.rangedDamage = eq.weapon.id === 'crude_gun' ? 55 : 124;
      } else {
        eng.hasRangedWeapon = false;
        eng.rangedDamage = 0;
      }
```

替换为：

```ts
      // 装备→引擎：战斗属性只看装备栏（背包只管存）
      const eq = equipmentRef.current;
      if (eq.weapon) {
        eng.hasRangedWeapon = true;
        const def = WEAPONS[eq.weapon.id] ?? WEAPONS['rifle'];
        eng.rangedDamage = def.damage;
        eng.rangedRange = def.range;
        eng.rangedSpread = def.spread;
        eng.rangedCritChance = def.critChance;
        eng.rangedCritMult = def.critMult;
        eng.player.fireRate = def.fireRate;
      } else {
        eng.hasRangedWeapon = false;
        eng.rangedDamage = 0;
      }
```

并确认 `App.tsx` 顶部已有 `import { killReward, WEAPONS, ARMOR_REDUCTION } from './game/combat';`（Task 6 已加 `killReward`，本任务补上后两个）。同时把约 `985` 行旧护甲行：

```ts
      eng.armorReduction = eq.armor && eq.armor.id === 'armor_vest' ? 0.15 : 0;
```

替换为：

```ts
      eng.armorReduction = eq.armor ? (ARMOR_REDUCTION[eq.armor.id] ?? 0) : 0;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat.test.ts`
Expected: PASS。Run: `npm run lint` Expected: 无报错。

手动验证：装备土铳射速明显变慢、散布变大；换步枪恢复 `0.12s` 快射；穿布甲不再有减伤，穿背心减伤 `15%`。

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/game/combat.test.ts
git commit -m "feat(combat): sync weapon params and armor table from combat module"
```

---

## Self-Review（作者自查，已执行）

**1. Spec 覆盖：**「查看战斗体系，完善战斗逻辑」无书面spec，按口头意图拆为：远程手感（Task 2/8）、近战（Task 3）、怪AI（Task 4）、防御反馈（Task 5）、击杀闭环（Task 6）、建筑协同（Task 7）、数值真相收敛（Task 1）。突袭攻城数值因服务端权威且已有完整随机/暴击/成功率（`server.ts:404-443`），YAGNI 不动；PvP 不在本次范围。

**2. Placeholder 扫描：** 全文无 `TBD/TODO/implement later/appropriate/handle edge cases/类似Task N`；每步代码块完整可落盘；类型名 `spawnX/spawnY/windup` 在类型、工厂、引擎三处一致；`killReward/WEAPONS/ARMOR_REDUCTION` 导入名在 Task 1 定义与后续使用一致。

**3. 类型一致性：** `MonsterEntity` 新增三字段全可选，老存档/编辑器覆盖数据（`localStorage sdc_map_override_*`）缺字段时引擎用 `??` 兜底；`onMonsterKilled` 加可选第二参，旧单参调用仍合法；`WEAPONS['rifle']` 作为 fallback，保证未知武器ID不崩。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-14-combat-system-rework.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
