import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W, FLOOD_DEPTH } from '../src/sim/config';
import { World, type PlaceableKind } from '../src/sim/world';

const rich = (w: World): void => { w.stock = { wood: 999, stone: 999, food: 80, water: 80 }; };
function spot(w: World, kind: PlaceableKind): { x: number; y: number } {
  const h = w.townHall();
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (!w.canPlace(kind, x, y).ok) continue;
    const d = (x - h.x) ** 2 + (y - h.y) ** 2;
    if (!best || d < best.d) best = { x, y, d };
  }
  return best!;
}
function built(w: World, kind: PlaceableKind) {
  const s = spot(w, kind);
  const r = w.requestBuild(kind, s.x, s.y);
  if (!r.ok) throw new Error('obra');
  r.building.done = true;
  r.building.progress = r.building.workNeeded;
  return r.building;
}
const flood = (w: World, b: { x: number; y: number; w: number; h: number }, depth: number): void => {
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) w.water[w.idx(b.x + i, b.y + j)] = depth;
};

describe('alagamento', () => {
  it('casa alagada não conta para a população e volta ao secar, com avisos', () => {
    const w = new World(2);
    rich(w);
    const house = built(w, 'house');
    expect(w.popCap).toBe(14);
    w.drainEvents();
    flood(w, house, 3);
    for (let i = 0; i < 4; i++) w.step();
    expect(house.flooded).toBe(true);
    expect(w.popCap).toBe(10);
    expect(w.drainEvents().join('|')).toContain('alagou');
    flood(w, house, 0);
    for (let i = 0; i < 4; i++) w.step();
    expect(house.flooded).toBe(false);
    expect(w.popCap).toBe(14);
    expect(w.drainEvents().join('|')).toContain('voltou a funcionar');
  });

  it('armazém alagado não aumenta o estoque; fazenda alagada não é usada', () => {
    const w = new World(2);
    rich(w);
    const wh = built(w, 'warehouse');
    const farm = built(w, 'farm');
    expect(w.storageCap).toBe(200);
    flood(w, wh, 2);
    flood(w, farm, 2);
    for (let i = 0; i < 4; i++) w.step();
    expect(w.storageCap).toBe(100);
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'food');
    for (let i = 0; i < 100; i++) w.step();
    expect(w.villagers[0].targetId).not.toBe(farm.id);
  });

  it('água rasa não alaga', () => {
    const w = new World(2);
    rich(w);
    const house = built(w, 'house');
    flood(w, house, FLOOD_DEPTH / 3);
    for (let i = 0; i < 4; i++) w.step();
    expect(house.flooded).toBe(false);
  });
});

describe('demolir', () => {
  it('prédio pronto devolve metade do custo e libera o terreno', () => {
    const w = new World(4);
    rich(w);
    const house = built(w, 'house');
    const { x, y } = house;
    w.stock.wood = 50;
    expect(w.demolish(house.id)).toBe(true);
    expect(w.stock.wood).toBe(50 + Math.floor(25 * 0.5));
    expect(w.buildings.includes(house)).toBe(false);
    expect(w.canPlace('house', x, y).ok).toBe(true);
  });

  it('não demole a prefeitura nem obra em andamento (essa se cancela)', () => {
    const w = new World(4);
    rich(w);
    expect(w.demolish(w.townHall().id)).toBe(false);
    const s = spot(w, 'house');
    const r = w.requestBuild('house', s.x, s.y);
    if (!r.ok) throw new Error('obra');
    expect(w.demolish(r.building.id)).toBe(false);
    expect(w.cancelBuild(r.building.id)).toBe(true);
  });

  it('demolir represa baixa o terreno de volta', () => {
    const w = new World(4);
    rich(w);
    let at: { x: number; y: number } | null = null;
    for (let y = 14; y < GRID_H - 4 && !at; y++) for (let x = 0; x < GRID_W && !at; x++) if (w.canPlace('dam', x, y).ok) at = { x, y };
    const h0 = w.height[w.idx(at!.x, at!.y)];
    const r = w.requestBuild('dam', at!.x, at!.y);
    if (!r.ok) throw new Error('represa');
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'build');
    for (let i = 0; i < 1500 && !r.building.done; i++) w.step();
    expect(r.building.done).toBe(true);
    expect(w.height[w.idx(at!.x, at!.y)]).toBe(h0 + 2);
    expect(w.demolish(r.building.id)).toBe(true);
    expect(w.height[w.idx(at!.x, at!.y)]).toBe(h0);
    expect(w.dam[w.idx(at!.x, at!.y)]).toBe(0);
  });
});

describe('drenagem autônoma', () => {
  it('prédio alagado por um tempo faz os aldeões cavarem um canal para escoar a água', () => {
    const w = new World(2);
    rich(w);
    w.addVillager('u1', 'Ana', '#fff');
    const house = built(w, 'house');
    w.drainEvents();
    const before = Array.from(w.height);
    let dug = false;
    for (let t = 0; t < 3000 && !dug; t++) {
      // enchente persistente ao redor da casa
      for (let y = house.y - 2; y < house.y + house.h + 2; y++) for (let x = house.x - 2; x < house.x + house.w + 2; x++) {
        if (x > 0 && y > 0 && x < GRID_W - 1 && y < GRID_H - 1) w.water[w.idx(x, y)] = Math.max(w.water[w.idx(x, y)], 1);
      }
      w.step();
      dug = w.drainEvents().some((e) => e.includes('cavaram um canal para levar a água embora'));
    }
    expect(dug).toBe(true);
    expect(Array.from(w.height).some((h, i) => h < before[i])).toBe(true);
    expect(w.serialize().drains).toBe(1);
  });
});
