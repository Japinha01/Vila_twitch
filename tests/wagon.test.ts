import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { GRID_W } from '../src/sim/config';

describe('rota da caravana', () => {
  it('nunca passa por dentro de prédios nem por água funda', () => {
    for (const seed of [1, 7, 12, 99]) {
      const w = new World(seed);
      w.npcsOn = false;
      for (let i = 0; i < 10; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
      for (let t = 0; t < 3000; t++) w.step();
      const route = w.wagonRoute();
      if (!route) continue;
      expect(route.length).toBeGreaterThan(5);
      for (const p of route) {
        const x = Math.floor(p.x), y = Math.floor(p.y);
        for (const b of w.buildings) {
          if (b.kind === 'bridge') continue;
          expect(x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h, `seed ${seed}: tile ${x},${y} dentro de ${b.kind}`).toBe(false);
        }
        expect(w.water[y * GRID_W + x] < 0.5 || w.bridge[y * GRID_W + x] === 1).toBe(true);
      }
    }
  });
});
