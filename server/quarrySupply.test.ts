import { expect, it } from 'vitest';
import { createMemoryDb } from './db';
import { GameWorld } from './worldState';
import { createWorldQueries } from './worldQueries';
import { findPath } from '../src/game/navigation';

function fixture() {
  let now=10000, sequence=0;
  const db=createMemoryDb(),queries=createWorldQueries(),rules={...queries,campSiteAllowed:()=>false,migrate:(_m:string,x:number,y:number)=>({mapId:'world' as const,x,y})};
  let game=new GameWorld(db,rules,()=>now);game.connect('fixture','测试角色');Object.assign(game.state.players.fixture,{x:-140,y:-341.5});
  const node=queries.nodesNear(-140,-344).find(n=>n.id.endsWith(':i:mtn_quarry:q_powder'))!;
  const action=(action:string,params={},requestId=`quarry${++sequence}`)=>game.action('fixture',{action,requestId,...params});
  const walk=(x:number,y:number)=>{
    const p=game.state.players.fixture, origin={x:p.x,y:p.y},sections=Math.max(1,Math.ceil(Math.hypot(x-p.x,y-p.y)/24));
    for(let s=1;s<=sections;s++){
      const goal={x:origin.x+(x-origin.x)*s/sections,y:origin.y+(y-origin.y)*s/sections};
      const points=findPath(p,goal,queries.buildingsNear(p.x,p.y));expect(points.length).toBeGreaterThan(0);
      for(const point of points){now+=250;expect(game.move('fixture',{...point,mapId:'world'})).toBe(true);}
    }
  };
  return {db,queries,node,action,walk,get game(){return game;},get p(){return game.state.players.fixture;},time:()=>now,setTime:(n:number)=>{now=n;},restart:()=>{game=new GameWorld(db,rules,()=>now);game.connect('fixture','测试角色');}};
}
it('offers one fresh charge without changing the quarry source identity, remaining supplies or refill interval',()=>{
  const f=fixture();expect(f.node).toMatchObject({id:'world:-5:-11:i:mtn_quarry:q_powder',x:-140,y:-344,respawnSec:300});
  const result=f.action('search',{targetId:f.node.id});expect(result.error).toBeUndefined();
  expect(result.loot!.items.map(i=>[i.itemId,i.count])).toEqual([['c4_explosive',1],['ammo',20],['throw_frag',1],['throw_smoke',1],['throw_flash',1]]);
  for(const i of result.loot!.items)expect(f.action('take_loot',{targetId:f.node.id,itemId:i.itemId,count:i.count}).error).toBeUndefined();
  expect(f.p.resources).toMatchObject({c4:1,ammo:20});expect(f.game.state.nodes[f.node.id]).toMatchObject({stock:0,respawnAt:f.time()+300000});
});
it('preserves an old three-charge remainder until normally depleted and renews only an unobserved due source',()=>{
  const f=fixture();
  const old=f.node.lootTable!.map(i=>({...i,...(i.itemId==='c4_explosive'?{count:3}:{})}));
  f.game.state.nodes[f.node.id]={stock:f.node.stock!,respawnAt:0,items:old};f.game.persist();f.restart();
  expect(f.action('search',{targetId:f.node.id}).loot!.items.find(i=>i.itemId==='c4_explosive')!.count).toBe(3);
  expect(f.action('take_loot',{targetId:f.node.id,itemId:'c4_explosive',count:1},'old-partial').error).toBeUndefined();f.restart();
  expect(f.action('search',{targetId:f.node.id}).loot!.items.find(i=>i.itemId==='c4_explosive')!.count).toBe(2);
  const rest=f.action('search',{targetId:f.node.id}).loot!.items;
  for(const item of rest)expect(f.action('take_loot',{targetId:f.node.id,itemId:item.itemId,count:item.count}).error).toBeUndefined();
  expect(f.p.resources.c4).toBe(3);const deadline=f.time()+300000;expect(f.game.state.nodes[f.node.id]).toMatchObject({stock:0,respawnAt:deadline});
  f.setTime(deadline);f.game.tick();expect(f.action('search',{targetId:f.node.id}).error).toContain('耗尽');
  f.walk(-140,-320);f.walk(-80,-320);f.setTime(f.time()+5000);f.game.tick();expect(f.game.state.nodes[f.node.id]).toMatchObject({stock:f.node.maxStock,respawnAt:0});
  f.walk(-140,-320);f.walk(-140,-341.5);const fresh=f.action('search',{targetId:f.node.id}).loot!.items;
  expect(fresh.find(i=>i.itemId==='c4_explosive')!.count).toBe(1);
  for(const item of fresh)expect(f.action('take_loot',{targetId:f.node.id,itemId:item.itemId,count:item.count},item.itemId==='c4_explosive'?'new-charge':undefined).error).toBeUndefined();
  expect(f.p.resources).toMatchObject({c4:4,ammo:40});const inventory=structuredClone(f.p.inventory);
  expect(f.action('take_loot',{targetId:f.node.id,itemId:'c4_explosive',count:1},'new-charge').error).toBeUndefined();
  expect(f.action('take_loot',{targetId:f.node.id,itemId:'c4_explosive',count:1},'old-partial').error).toBeUndefined();f.restart();
  expect(f.p.resources).toMatchObject({c4:4,ammo:40});expect(f.p.inventory).toEqual(inventory);expect(f.game.state.nodes[f.node.id].stock).toBe(0);
});
