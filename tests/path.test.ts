import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../src/sim/config';
import { findPath } from '../src/sim/path';
import { World, type PlaceableKind } from '../src/sim/world';

const at = (x: number, y: number): number => y * GRID_W + x;

describe('findPath', () => {
  it('já está na meta: caminho vazio', () => {
    expect(findPath(at(3, 3), (t) => t === at(3, 3), () => 1)).toEqual([]);
  });

  it('contorna um muro', () => {
    const wall = (t: number): boolean => t % GRID_W === 5 && Math.floor(t / GRID_W) < 20; // muro x=5, y<20
    const p = findPath(at(2, 5), (t) => t === at(8, 5), (_a, b) => (wall(b) ? Infinity : 1))!;
    expect(p[p.length - 1]).toBe(at(8, 5));
    expect(p.some((t) => Math.floor(t / GRID_W) >= 20)).toBe(true); // passou pela abertura no fim do muro
    expect(p.every((t) => !wall(t))).toBe(true);
  });

  it('não corta quina entre dois bloqueios', () => {
    const blocked = new Set([at(5, 4), at(4, 5)]);
    const p = findPath(at(4, 4), (t) => t === at(5, 5), (_a, b) => (blocked.has(b) ? Infinity : 1))!;
    expect(p).not.toEqual([at(5, 5)]); // a diagonal direta cortaria a quina
    expect(p.length).toBeGreaterThan(2);
    expect(p.every((t) => !blocked.has(t))).toBe(true);
  });

  it('devolve null quando a meta é inalcançável', () => {
    const p = findPath(at(2, 2), (t) => t === at(30, 20), (_a, b) => (b % GRID_W === 10 ? Infinity : 1));
    expect(p).toBeNull();
  });
});

describe('caminhos na vila', () => {
  const rich = (w: World): void => { w.stock = { wood: 999, stone: 999, food: 80, water: 80 }; };
  const spot = (w: World, kind: PlaceableKind): { x: number; y: number } => {
    const h = w.townHall();
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      if (!w.canPlace(kind, x, y).ok) continue;
      const d = (x - h.x) ** 2 + (y - h.y) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
    return best!;
  };

  it('aldeões nunca entram em prédios nem sobem penhascos', () => {
    const w = new World(12);
    rich(w);
    for (let i = 0; i < 10; i++) w.addVillager(`u${i}`, `u${i}`, '#fff');
    const jobs = ['wood', 'stone', 'food', 'water', 'build'] as const;
    w.villagers.forEach((v, i) => w.setJob(v.userId, jobs[i % 5]));
    for (const k of ['house', 'farm', 'well', 'sawmill'] as const) { const s = spot(w, k); w.requestBuild(k, s.x, s.y); }

    const last = new Map<number, number>();
    for (let t = 0; t < 2500; t++) {
      w.step();
      for (const v of w.villagers) {
        const tile = Math.floor(v.y) * GRID_W + Math.floor(v.x);
        expect(w.buildingAt(Math.floor(v.x), Math.floor(v.y))).toBeUndefined();
        const prev = last.get(v.id);
        if (prev !== undefined && prev !== tile) expect(Math.abs(w.height[tile] - w.height[prev])).toBeLessThanOrEqual(1);
        last.set(v.id, tile);
      }
    }
  });

  it('sem alvos ou sem caminho o aldeão espera e não trava a simulação', () => {
    const w = new World(3);
    w.nodes.length = 0; // nenhuma árvore
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'wood');
    for (let i = 0; i < 200; i++) w.step();
    expect(w.villagers[0].state).toBe('idle');
  });

  it('o aldeão atravessa o rio (vau raso) para chegar ao outro lado', () => {
    const w = new World(1);
    const v = w.addVillager('a', 'A', '#fff');
    if (!v.ok) throw new Error('aldeão');
    // só árvores do outro lado do rio: ele precisa cruzar
    const side = (n: { x: number }): boolean => n.x > 33;
    w.nodes = w.nodes.filter((n) => n.kind !== 'tree' || side(n));
    expect(w.nodes.some((n) => n.kind === 'tree')).toBe(true);
    w.setJob('a', 'wood');
    const before = w.stock.wood;
    for (let i = 0; i < 2500; i++) w.step();
    expect(w.stock.wood).toBeGreaterThan(before);
  });
});

describe('construir sobre aldeões', () => {
  it('quem estava no terreno é empurrado para fora da obra', () => {
    const w = new World(5);
    w.stock = { wood: 999, stone: 999, food: 50, water: 50 };
    let s: { x: number; y: number } | null = null;
    for (let y = 0; y < GRID_H && !s; y++) for (let x = 0; x < GRID_W && !s; x++) if (w.canPlace('house', x, y).ok) s = { x, y };
    w.addVillager('a', 'A', '#fff');
    const v = w.villagers[0];
    v.x = s!.x + 0.5; v.y = s!.y + 0.5;
    const r = w.requestBuild('house', s!.x, s!.y);
    expect(r.ok).toBe(true);
    expect(w.buildingAt(Math.floor(v.x), Math.floor(v.y))).toBeUndefined();
  });
});
