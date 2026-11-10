import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../src/sim/config';
import { World } from '../src/sim/world';

const run = (w: World, n: number): void => { for (let i = 0; i < n; i++) w.step(); };
function site(w: World): { x: number; y: number } {
  const h = w.townHall();
  for (let r = 4; r < 20; r++) for (let y = 1; y < GRID_H - 3; y++) for (let x = 1; x < GRID_W - 3; x++) {
    if (Math.hypot(x - h.x, y - h.y) < r && w.canPlace('house', x, y).ok) return { x, y };
  }
  throw new Error('sem lugar');
}

describe('aldeões sem trabalho', () => {
  it('com estoque cheio, quem estaria parado larga a carga e ajuda nas obras', () => {
    const w = new World(5);
    w.npcsOn = false;
    for (let i = 0; i < 12; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    const cap = w.storageCap;
    w.stock = { wood: cap, stone: cap, food: cap, water: cap };
    const v = w.villagers[0];
    v.job = 'wood'; v.carry = 5; v.carryRes = 'water'; v.state = 'idle'; v.wait = 0;
    const s = site(w);
    const r = w.requestBuild('house', s.x, s.y);
    expect(r.ok).toBe(true);
    for (let t = 0; t < 40; t++) { run(w, 10); w.stock = { wood: cap, stone: cap, food: cap, water: cap }; } // mantém tudo cheio
    expect(v.carryRes === 'water' && v.carry > 0).toBe(false);
    expect(w.villagers.filter((x) => x.job === 'build').length).toBeGreaterThan(0);
  });

  it('a profissão automática ignora recurso com estoque cheio', () => {
    const w = new World(5);
    w.npcsOn = false;
    w.addVillager('a', 'A', '#fff');
    const cap = w.storageCap;
    w.stock = { wood: cap, stone: cap, food: cap, water: 0 };
    run(w, 250);
    expect(w.findVillager('a')!.job).toBe('water');
  });
});
