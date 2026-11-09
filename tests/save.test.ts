import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../src/sim/config';
import { SAVE_VERSION, World, type SaveData } from '../src/sim/world';

function village(): World {
  const w = new World(33);
  w.stock = { wood: 400, stone: 300, food: 60, water: 60 };
  for (let i = 0; i < 8; i++) w.addVillager(`u${i}`, `u${i}`, '#fff');
  const jobs = ['wood', 'stone', 'food', 'water', 'build'] as const;
  w.villagers.forEach((v, i) => w.setJob(v.userId, jobs[i % 5]));
  for (const k of ['house', 'farm', 'well'] as const) {
    let s: { x: number; y: number } | null = null;
    const h = w.townHall();
    let bd = Infinity;
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      if (!w.canPlace(k, x, y).ok) continue;
      const d = (x - h.x) ** 2 + (y - h.y) ** 2;
      if (d < bd) { bd = d; s = { x, y }; }
    }
    w.requestBuild(k, s!.x, s!.y);
  }
  return w;
}

const fingerprint = (w: World): string =>
  JSON.stringify([w.tick, w.stock, w.villagers, w.buildings, w.nodes, w.supportUntil]) + Array.from(w.water).join(',') + Array.from(w.height).join(',');

describe('salvar e carregar', () => {
  it('depois de carregar, a vila continua exatamente igual à original', () => {
    const a = village();
    for (let i = 0; i < 1500; i++) a.step();
    const data = JSON.parse(JSON.stringify(a.serialize())) as SaveData; // passa por JSON de verdade
    const b = World.fromSave(data);
    expect(fingerprint(b)).toBe(fingerprint(a));
    for (let i = 0; i < 2500; i++) { a.step(); b.step(); } // atravessa o começo da seca
    expect(fingerprint(b)).toBe(fingerprint(a));
  });

  it('preserva construtores trabalhando (workLeft infinito) e as regras de colocação', () => {
    const a = village();
    for (let i = 0; i < 600; i++) a.step();
    const b = World.fromSave(JSON.parse(JSON.stringify(a.serialize())) as SaveData);
    expect(b.villagers.some((v) => v.workLeft === Infinity)).toBe(a.villagers.some((v) => v.workLeft === Infinity));
    for (let y = 0; y < GRID_H; y += 3) for (let x = 0; x < GRID_W; x += 3) {
      expect(b.canPlace('house', x, y).ok).toBe(a.canPlace('house', x, y).ok);
    }
  });

  it('rejeita save de outra versão, mapa truncado e lixo', () => {
    const good = village().serialize();
    expect(() => World.fromSave({ ...good, version: SAVE_VERSION + 1 })).toThrow();
    expect(() => World.fromSave({ ...good, water: good.water.slice(1) })).toThrow();
    expect(() => World.fromSave({ ...good, stock: { ...good.stock, wood: NaN } })).toThrow();
    expect(() => World.fromSave({ ...good, buildings: [] })).toThrow();
    expect(() => World.fromSave(null as unknown as SaveData)).toThrow();
  });
});
