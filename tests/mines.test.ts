import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../src/sim/config';
import { World } from '../src/sim/world';

describe('minas de pedra', () => {
  it('todo mapa tem jazidas longe da vila e fora da água, e a mesma seed dá as mesmas', () => {
    for (const seed of [1, 2, 3, 5, 9]) {
      const w = new World(seed);
      const tiles = w.mineTiles();
      expect(tiles.length).toBeGreaterThan(8);
      const hall = w.townHall();
      for (const t of tiles) {
        const x = t % GRID_W, y = (t - x) / GRID_W;
        expect(w.water[t]).toBeLessThanOrEqual(0.02);
        expect(Math.hypot(x - hall.x - 1, y - hall.y - 1)).toBeGreaterThan(7);
      }
      expect(new World(seed).mineTiles()).toEqual(tiles);
    }
  });

  it('pedreira só em mina; outros prédios não ocupam a jazida', () => {
    const w = new World(3);
    w.autonomy = false;
    w.stock = { wood: 999, stone: 999, food: 0, water: 0 };
    let onMine: { x: number; y: number } | null = null;
    let off: { x: number; y: number } | null = null;
    for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
      const c = w.canPlace('quarry', x, y);
      if (c.ok && !onMine) onMine = { x, y };
      if (!c.ok && c.reason === 'mine' && !off) off = { x, y };
    }
    expect(onMine).not.toBeNull();
    expect(off).not.toBeNull();
    expect(w.requestBuild('quarry', off!.x, off!.y).ok).toBe(false);
    expect(w.requestBuild('quarry', onMine!.x, onMine!.y).ok).toBe(true);
    for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
      if (w.mine[w.idx(x, y)]) expect(w.canPlace('house', x, y).ok).toBe(false);
    }
  });

  it('a vila constrói a pedreira sozinha numa mina; o save guarda as jazidas', () => {
    const w = new World(5);
    for (let i = 0; i < 12; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    w.stock.stone = 5; w.stock.wood = 400; w.stock.food = 300; w.stock.water = 300;
    for (let t = 0; t < 3000; t++) { w.stock.wood = Math.max(w.stock.wood, 300); w.stock.food = 300; w.stock.water = 300; w.step(); }
    const q = w.buildings.find((b) => b.kind === 'quarry');
    expect(q).toBeTruthy();
    expect(w.mine[w.idx(q!.x, q!.y)] + w.mine[w.idx(q!.x + 1, q!.y)] + w.mine[w.idx(q!.x, q!.y + 1)] + w.mine[w.idx(q!.x + 1, q!.y + 1)]).toBeGreaterThanOrEqual(2);
    const r = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(r.mineTiles()).toEqual(w.mineTiles());
  });

  it('save antigo, sem jazidas, ganha as da seed ao carregar', () => {
    const w = new World(3);
    const data = JSON.parse(JSON.stringify(w.serialize()));
    delete data.mine;
    expect(World.fromSave(data).mineTiles()).toEqual(w.mineTiles());
  });
});
