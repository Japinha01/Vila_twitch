import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../src/sim/config';
import { BIOME_FOREST, BIOME_ROCKY, World } from '../src/sim/world';

const N = GRID_W * GRID_H;
/** Tiles com água que não são leito do rio: lagos. */
const lakeTiles = (w: World): number => { let n = 0; for (let i = 0; i < N; i++) if (w.water[i] > 0.3 && !w.channel[i]) n++; return n; };

describe('mapas variados', () => {
  it('a mesma seed gera sempre o mesmo mapa (inclusive lagos e biomas)', () => {
    const a = new World(11), b = new World(11);
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
    expect(Array.from(a.water)).toEqual(Array.from(b.water));
    expect(Array.from(a.biome)).toEqual(Array.from(b.biome));
    expect(a.nodes).toEqual(b.nodes);
  });

  it('seeds diferentes dão mapas diferentes: rio, lagos e biomas mudam', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const worlds = seeds.map((s) => new World(s));
    const lakes = new Set(worlds.map(lakeTiles));
    expect(lakes.size).toBeGreaterThanOrEqual(5);
    for (const w of worlds) expect(lakeTiles(w)).toBeGreaterThanOrEqual(6); // todo mapa tem pelo menos um lago
    expect(new Set(worlds.map((w) => w.channel.findIndex((c, i) => !!c && i >= GRID_W * 10))).size).toBeGreaterThan(1);
    const withForest = worlds.filter((w) => w.biome.includes(BIOME_FOREST)).length;
    const withRocky = worlds.filter((w) => w.biome.includes(BIOME_ROCKY)).length;
    expect(withForest).toBeGreaterThan(2);
    expect(withRocky).toBeGreaterThan(2);
  });

  it('em todo mapa a vila tem espaço, a água do lago não alaga o terreno e os recursos existem', () => {
    for (let s = 1; s <= 12; s++) {
      const w = new World(s);
      for (let t = 0; t < 1500; t++) w.step();
      const hall = w.buildings[0];
      for (let j = hall.y; j < hall.y + hall.h; j++) for (let i = hall.x; i < hall.x + hall.w; i++) expect(w.water[w.idx(i, j)]).toBeLessThan(0.05);
      expect(w.nodes.filter((n) => n.kind === 'tree').length).toBeGreaterThan(30);
      expect(w.nodes.filter((n) => n.kind === 'rock').length).toBeGreaterThan(8);
      let wet = 0;
      for (let i = 0; i < N; i++) if (w.water[i] > 0.02) wet++;
      expect(wet).toBeLessThan(N * 0.22); // água não toma o mapa
    }
  });

  it('lagos secam na seca e voltam depois', () => {
    const w = new World(3);
    const full = lakeTiles(w);
    let min = full;
    for (let t = 0; t < 8400; t++) { w.step(); if (t % 100 === 0) min = Math.min(min, lakeTiles(w)); }
    expect(min).toBeLessThan(full * 0.3);
    expect(lakeTiles(w)).toBeGreaterThan(full * 0.5);
  });
});
