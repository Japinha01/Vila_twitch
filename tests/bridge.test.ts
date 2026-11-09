import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';

/** Acha um tile de rio com margem seca dos dois lados na mesma linha. */
function crossing(w: World): { y: number; x0: number; x1: number } {
  for (let y = 5; y < 30; y++) {
    for (let x = 2; x < 46; x++) {
      if (!w.channel[w.idx(x, y)] || w.channel[w.idx(x - 1, y)]) continue;
      let x1 = x;
      while (w.channel[w.idx(x1 + 1, y)]) x1++;
      if (x1 - x < 6) return { y, x0: x, x1 };
    }
  }
  throw new Error('sem rio');
}

describe('pontes', () => {
  it('a ponte pronta liga as margens sem degrau, com tabuleiro na altura da margem', () => {
    const w = new World(5);
    for (let i = 0; i < 8; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    for (const v of w.villagers) w.setJob(v.userId, 'build');
    w.stock.wood = 200;
    const { y, x0, x1 } = crossing(w);
    for (let x = x0; x <= x1; x++) expect(w.requestBuild('bridge', x, y).ok).toBe(true);
    for (let t = 0; t < 4000 && w.buildings.some((b) => b.kind === 'bridge' && !b.done); t++) w.step();
    const bridges = w.buildings.filter((b) => b.kind === 'bridge');
    expect(bridges.every((b) => b.done)).toBe(true);
    for (let x = x0; x <= x1; x++) {
      const t = w.idx(x, y);
      expect(w.bridge[t]).toBe(1);
      expect(w.deck[t]).toBeGreaterThanOrEqual(w.height[t]);
    }
    // o tabuleiro fica na altura da margem
    const bank = Math.max(w.height[w.idx(x0 - 1, y)], w.height[w.idx(x1 + 1, y)]);
    expect(w.deck[w.idx(x0, y)]).toBe(bank);
    // andar sobre a ponte usa a altura do tabuleiro, não a do leito
    expect(w.groundZ(x0 + 0.5, y + 0.5)).toBeGreaterThanOrEqual(bank - 1);
  });

  it('ponte não fecha o caminho nem alaga, e demolir remove a travessia', () => {
    const w = new World(5);
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'build');
    w.stock.wood = 100;
    const { y, x0 } = crossing(w);
    const r = w.requestBuild('bridge', x0, y);
    expect(r.ok).toBe(true);
    const t = w.idx(x0, y);
    expect((w as unknown as { blocked: Uint8Array }).blocked[t]).toBe(0);
    for (let i = 0; i < 3000 && !w.buildings.find((b) => b.kind === 'bridge')!.done; i++) w.step();
    const b = w.buildings.find((x) => x.kind === 'bridge')!;
    expect(b.done).toBe(true);
    expect(b.flooded).toBe(false);
    expect(w.demolish(b.id)).toBe(true);
    expect(w.bridge[t]).toBe(0);
  });

  it('só se constrói ponte sobre o rio', () => {
    const w = new World(5);
    w.stock.wood = 100;
    expect(w.requestBuild('bridge', 3, 3).ok).toBe(false); // terra firme
  });

  it('o save mantém as pontes concluídas', () => {
    const w = new World(5);
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'build');
    w.stock.wood = 100;
    const { y, x0 } = crossing(w);
    w.requestBuild('bridge', x0, y);
    for (let i = 0; i < 3000 && !w.buildings.find((b) => b.kind === 'bridge')!.done; i++) w.step();
    const r = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(r.bridge[r.idx(x0, y)]).toBe(1);
    expect(r.deck[r.idx(x0, y)]).toBe(w.deck[w.idx(x0, y)]);
  });

  it('aldeões autônomos constroem ponte onde vivem atravessando a vau', () => {
    const w = new World(6);
    for (let i = 0; i < 10; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    for (let t = 0; t < 6000; t++) { w.step(); w.stock.wood = Math.max(w.stock.wood, 100); }
    expect(w.buildings.some((b) => b.kind === 'bridge')).toBe(true);
    const off = new World(6);
    off.autonomy = false;
    for (let i = 0; i < 10; i++) off.addVillager(`u${i}`, `V${i}`, '#fff');
    for (let t = 0; t < 6000; t++) { off.step(); off.stock.wood = Math.max(off.stock.wood, 100); }
    expect(off.buildings.some((b) => b.kind === 'bridge')).toBe(false);
  });
});
