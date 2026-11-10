import { describe, expect, it } from 'vitest';
import { POWER_SUPPLY } from '../src/sim/config';
import { GRID_H, GRID_W } from '../src/sim/config';
import { World } from '../src/sim/world';

const priv = (w: World) => w as unknown as {
  findSite(k: string): { x: number; y: number } | null;
  placeBuilding(k: string, x: number, y: number, ww: number, h: number, work: number, done: boolean): { id: number; x: number; y: number; w: number; h: number };
  updatePower(): void;
};

describe('energia das rodas d\'água', () => {
  it('a roda só vale na margem (3+ tiles de água encostados)', () => {
    const w = new World(3);
    w.stock = { wood: 999, stone: 999, food: 0, water: 0 };
    let near: { x: number; y: number } | null = null;
    let far: { x: number; y: number } | null = null;
    for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
      const c = w.canPlace('waterwheel', x, y);
      if (c.ok && !near) near = { x, y };
      if (!c.ok && c.reason === 'space' && !far) far = { x, y };
    }
    expect(near).not.toBeNull();
    expect(w.requestBuild('waterwheel', far!.x, far!.y).ok).toBe(false);
    expect(w.requestBuild('waterwheel', near!.x, near!.y).ok).toBe(true);
  });

  it('a oferta cresce com a era e cai quando falta água; a razão vira bônus de coleta', () => {
    const w = new World(3);
    w.autonomy = false;
    const p = priv(w);
    const s = p.findSite('waterwheel')!;
    const wheel = p.placeBuilding('waterwheel', s.x, s.y, 2, 2, 10, true);
    const q = p.findSite('sawmill')!;
    p.placeBuilding('sawmill', q.x, q.y, 2, 2, 10, true);
    p.updatePower();
    const flow = w.wheelFlow(wheel as never);
    expect(flow).toBeGreaterThan(0);
    const e0 = w.power.supply;
    expect(e0).toBeCloseTo(POWER_SUPPLY[w.era] * flow, 0);
    w.era = 7;
    p.updatePower();
    expect(w.power.supply).toBeGreaterThan(e0);
    expect(w.power.ratio).toBeGreaterThan(0);
    // seca total em volta: sem água a roda não rende
    for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) w.water[w.idx(s.x + i, s.y + j)] = 0;
    p.updatePower();
    expect(w.power.supply).toBe(0);
    expect(w.power.ratio).toBe(0);
  });

  it('a vila constrói a roda d\'água sozinha quando há máquinas sem energia', () => {
    const w = new World(5);
    for (let i = 0; i < 14; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    const p = priv(w);
    const q = p.findSite('sawmill')!;
    p.placeBuilding('sawmill', q.x, q.y, 2, 2, 10, true);
    for (let t = 0; t < 2500; t++) { w.stock.wood = Math.max(w.stock.wood, 300); w.stock.stone = Math.max(w.stock.stone, 150); w.stock.food = 300; w.stock.water = 300; w.step(); }
    expect(w.buildings.some((b) => b.kind === 'waterwheel')).toBe(true);
  });
});
