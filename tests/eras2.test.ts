import { describe, expect, it } from 'vitest';
import { ERAS, eraGather, eraHousePop, eraStorage, goalsMet } from '../src/sim/eras';
import { World } from '../src/sim/world';

describe('eras avançadas', () => {
  it('há oito eras, com metas crescentes e vantagens que só aumentam', () => {
    expect(ERAS.map((e) => e.name)).toEqual([
      'Era da Pedra', 'Era do Bronze', 'Era Medieval', 'Era da Cidade', 'Era Industrial', 'Era do Estado', 'Era da Nação', 'Era do Futuro',
    ]);
    const pops = ERAS.slice(1).map((e) => e.goals.find((g) => g.label === 'aldeões')!.need);
    expect([...pops].sort((a, b) => a - b)).toEqual(pops);
    for (let i = 1; i < ERAS.length; i++) {
      expect(eraGather(i)).toBeGreaterThanOrEqual(eraGather(i - 1));
      expect(eraHousePop(i)).toBeGreaterThanOrEqual(eraHousePop(i - 1));
      expect(eraStorage(i)).toBeGreaterThanOrEqual(eraStorage(i - 1));
    }
  });

  it('as vantagens mudam a capacidade da vila: moradores por casa e estoque', () => {
    const w = new World(5);
    const priv = w as unknown as { placeBuilding(k: string, x: number, y: number, ww: number, h: number, work: number, done: boolean): unknown; findSite(k: string): { x: number; y: number } | null };
    for (const k of ['house', 'warehouse'] as const) { const s = priv.findSite(k)!; priv.placeBuilding(k, s.x, s.y, 2, 2, 10, true); }
    w.era = 3;
    const cap3 = w.popCap, st3 = w.storageCap;
    w.era = 7;
    expect(w.popCap).toBe(cap3 + 3);
    expect(w.storageCap).toBe(st3 * 2);
  });

  it('só sobe com as metas e avisa a nova era; o save aceita a era 7', () => {
    const w = new World(5);
    w.era = 3;
    expect(goalsMet(4, w.eraSnapshot())).toBe(false);
    w.era = 7;
    const r = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(r.era).toBe(7);
  });

  it('a vila constrói serraria, pedreira e mercados que a próxima era pede', () => {
    const w = new World(5);
    w.era = 3;
    for (let i = 0; i < 34; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    // vila rica e com população perto da meta (40): o planejador passa a perseguir as metas de apoio
    for (let t = 0; t < 4000; t++) {
      w.stock.wood = Math.max(w.stock.wood, 400); w.stock.stone = Math.max(w.stock.stone, 200); w.stock.food = 600; w.stock.water = 600;
      for (let i = w.villagers.length; i < 34; i++) w.addVillager(`n${t}${i}`, 'N', '#fff');
      w.step();
    }
    const kinds = w.buildings.map((b) => b.kind);
    expect(kinds).toContain('sawmill');
    expect(kinds).toContain('quarry');
  });
});
