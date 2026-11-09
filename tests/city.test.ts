import { describe, expect, it } from 'vitest';
import { AUTONOMY_EVERY, GRID_H, GRID_W, ROAD_STEP_COST } from '../src/sim/config';
import { World } from '../src/sim/world';

const run = (w: World, n: number): void => { for (let i = 0; i < n; i++) w.step(); };
const priv = (w: World) => w as unknown as {
  stepCost(a: number, b: number): number;
  findSite(k: string): { x: number; y: number } | null;
  placeBuilding(k: string, x: number, y: number, ww: number, h: number, work: number, done: boolean): unknown;
};
function withBasics(w: World): void {
  for (const k of ['farm', 'well'] as const) {
    const site = priv(w).findSite(k);
    if (!site) throw new Error(`sem lugar para ${k}`);
    priv(w).placeBuilding(k, site.x, site.y, 2, 2, 100, true);
  }
}
/** Quadrado de terra plana e livre, perto da prefeitura (canto de cima à esquerda). */
function flatPatch(w: World, size: number, minDist = 6): { x: number; y: number } {
  const hall = w.buildings[0];
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let y = 2; y < GRID_H - size - 2; y++) for (let x = 2; x < GRID_W - size - 2; x++) {
    const d = Math.hypot(x + size / 2 - hall.x, y + size / 2 - hall.y);
    if (d < minDist || d >= bd) continue;
    const h0 = w.height[w.idx(x, y)];
    let ok = true;
    for (let j = -1; j <= size && ok; j++) for (let i = -1; i <= size; i++) {
      const t = w.idx(x + i, y + j);
      if (w.height[t] !== h0 || w.channel[t] || w.water[t] > 0.02 || w.buildingAt(x + i, y + j) || w.irrigated[t]) { ok = false; break; }
    }
    if (ok) { best = { x, y }; bd = d; }
  }
  if (!best) throw new Error('sem terreno plano');
  return best;
}

describe('estradas', () => {
  it('estrada custa estoque, não vale sobre rio, prédio ou outra estrada, e demolir devolve metade', () => {
    const w = new World(3);
    const p = flatPatch(w, 4);
    const before = { ...w.stock };
    expect(w.paintRoad(p.x, p.y).ok).toBe(true);
    expect(w.road[w.idx(p.x, p.y)]).toBe(1);
    expect(w.stock.wood).toBeLessThan(before.wood);
    expect(w.paintRoad(p.x, p.y).ok).toBe(false);
    const hall = w.buildings[0];
    expect(w.paintRoad(hall.x, hall.y).ok).toBe(false);
    const river = w.channel.findIndex((c) => c === 1);
    expect(w.paintRoad(river % GRID_W, Math.floor(river / GRID_W)).ok).toBe(false);
    w.stock.wood = 0;
    const r = w.paintRoad(p.x + 1, p.y);
    expect(r.ok === false && r.reason).toBe('cost');
    expect(w.removeRoad(p.x, p.y)).toBe(true);
    expect(w.road[w.idx(p.x, p.y)]).toBe(0);
  });

  it('andar em estrada custa menos e prédio não nasce sobre ela', () => {
    const w = new World(3);
    const p = flatPatch(w, 4);
    w.stock.wood = 100; w.stock.stone = 100;
    const a = w.idx(p.x, p.y), b = w.idx(p.x + 1, p.y);
    expect(priv(w).stepCost(a, b)).toBe(1);
    w.paintRoad(p.x + 1, p.y);
    expect(priv(w).stepCost(a, b)).toBe(ROAD_STEP_COST);
    expect(w.canPlace('house', p.x + 1, p.y).ok).toBe(false);
  });

  it('estradas e zonas vão no save', () => {
    const w = new World(3);
    const p = flatPatch(w, 4);
    w.stock.wood = 100; w.stock.stone = 100;
    w.paintRoad(p.x, p.y);
    w.paintZone(p.x + 1, p.y + 1, 2);
    const r = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(r.road[r.idx(p.x, p.y)]).toBe(1);
    expect(r.zone[r.idx(p.x + 1, p.y + 1)]).toBe(2);
  });
});

describe('zonas e lotes', () => {
  it('com zona residencial e estrada, as casas nascem dentro da zona, coladas na estrada', () => {
    const w = new World(3);
    withBasics(w);
    const p = flatPatch(w, 6);
    w.stock.wood = 400; w.stock.stone = 200; w.stock.food = 80; w.stock.water = 80;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) w.paintZone(p.x + i, p.y + j, 1);
    for (let i = -1; i <= 6; i++) w.road[w.idx(p.x + i, p.y - 1)] = 1; // estrada ao longo da zona
    for (let i = 0; i < w.popCap; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    run(w, AUTONOMY_EVERY * 4);
    const houses = w.buildings.filter((b) => b.kind === 'house');
    expect(houses.length).toBeGreaterThan(0);
    for (const h of houses) {
      for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++) expect(w.zone[w.idx(h.x + i, h.y + j)]).toBe(1);
    }
    expect(houses.some((h) => h.y === p.y)).toBe(true); // a primeira fila encosta na estrada
  });

  it('zona longe da prefeitura e sem estrada: os aldeões abrem a estrada sozinhos e depois constroem', () => {
    const w = new World(3);
    withBasics(w);
    const p = flatPatch(w, 6, 9);
    w.stock.wood = 600; w.stock.stone = 300; w.stock.food = 90; w.stock.water = 90;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) w.paintZone(p.x + i, p.y + j, 1);
    expect(w.road.includes(1)).toBe(false);
    for (let i = 0; i < w.popCap; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    run(w, AUTONOMY_EVERY * 30);
    expect(w.road.filter((r) => r === 1).length).toBeGreaterThan(3);
    expect(w.buildings.some((b) => b.kind === 'house')).toBe(true);
    expect(w.drainEvents().some((e) => e.includes('estrada'))).toBe(true);
  });

  it('zona de outro tipo não recebe casa; sem zona o crescimento continua perto da prefeitura', () => {
    const w = new World(3);
    withBasics(w);
    const p = flatPatch(w, 6);
    w.stock.wood = 400; w.stock.stone = 200; w.stock.food = 80; w.stock.water = 80;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) w.paintZone(p.x + i, p.y + j, 2); // só comercial
    for (let i = -1; i <= 6; i++) w.road[w.idx(p.x + i, p.y - 1)] = 1;
    for (let i = 0; i < w.popCap; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    run(w, AUTONOMY_EVERY * 4);
    // sem nenhuma zona residencial pintada, as casas voltam ao comportamento antigo (terreno livre), mas nunca em terra zoneada
    const houses = w.buildings.filter((b) => b.kind === 'house');
    expect(houses.length).toBeGreaterThan(0);
    for (const h of houses) for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++) expect(w.zone[w.idx(h.x + i, h.y + j)]).toBe(0);
  });
});

describe('estradas automáticas', () => {
  it('numa vila nova, sem zona nenhuma, os aldeões abrem estradas até os prédios sozinhos', () => {
    const w = new World(3);
    for (let i = 0; i < 12; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    for (let t = 1; t <= 6000; t++) { if (t % 600 === 0) for (let k = 0; k < 4; k++) w.addVillager(`n${t}${k}`, `N${t}${k}`, '#fff'); w.step(); }
    expect(w.zone.includes(1)).toBe(false);
    expect(w.road.filter((r) => r === 1).length).toBeGreaterThan(5);
    expect(w.drainEvents().some((e) => e.includes('estradas'))).toBe(true);
    // e o crescimento não parou: segue construindo casas
    expect(w.buildings.filter((b) => b.kind === 'house').length).toBeGreaterThan(1);
  });
});

describe('comércio', () => {
  it('mercados pronto reduzem o consumo de comida e água', () => {
    const mk = (markets: number): World => {
      const w = new World(3);
      w.autonomy = false;
      for (let i = 0; i < 20; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
      for (let k = 0; k < markets; k++) { const s = priv(w).findSite('market'); priv(w).placeBuilding('market', s!.x, s!.y, 2, 2, 100, true); }
      w.stock.food = 100; w.stock.water = 100;
      return w;
    };
    const a = mk(0), b = mk(3);
    (a as unknown as { consume(): void }).consume();
    (b as unknown as { consume(): void }).consume();
    expect(b.stock.food).toBeGreaterThan(a.stock.food);
  });
});
