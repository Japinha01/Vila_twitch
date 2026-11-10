import { describe, expect, it } from 'vitest';
import { AUTONOMY_EVERY } from '../src/sim/config';
import { World } from '../src/sim/world';

const run = (w: World, ticks: number): void => { for (let i = 0; i < ticks; i++) w.step(); };

describe('ferramentas', () => {
  it('fabrica machados e picaretas gastando madeira e pedra, até um por aldeão', () => {
    const w = new World(5);
    w.autonomy = true;
    w.npcsOn = false;
    for (let i = 0; i < 3; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    w.stock.wood = 400; w.stock.stone = 200; w.stock.food = 400; w.stock.water = 400;
    run(w, AUTONOMY_EVERY * 40);
    expect(w.axes).toBeLessThanOrEqual(w.villagers.length); // filhos de casais também contam
    expect(w.picks).toBeLessThanOrEqual(w.villagers.length);
    expect(w.axes + w.picks).toBeGreaterThan(0);
    expect(w.drainEvents().some((e) => e.includes('fabricaram'))).toBe(true);
  });

  it('não fabrica sem sobra de estoque', () => {
    const w = new World(5);
    w.addVillager('a', 'A', '#fff');
    w.stock.wood = 10; w.stock.stone = 3;
    run(w, AUTONOMY_EVERY * 5);
    expect(w.axes + w.picks).toBe(0);
  });

  it('o save guarda as ferramentas', () => {
    const w = new World(5);
    w.axes = 2; w.picks = 1;
    const r = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect([r.axes, r.picks]).toEqual([2, 1]);
  });
});
