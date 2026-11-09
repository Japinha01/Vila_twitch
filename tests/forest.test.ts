import { describe, expect, it } from 'vitest';
import { CLEARING_RADIUS, GRID_H, GRID_W, MIN_HARVEST } from '../src/sim/config';
import { World } from '../src/sim/world';

const run = (w: World, n: number): void => { for (let i = 0; i < n; i++) w.step(); };
const treeCount = (w: World): number => w.nodes.filter((n) => n.kind === 'tree').length;

describe('começo na floresta', () => {
  it('começa numa floresta fechada, com clareira em volta da fogueira', () => {
    for (const seed of [3, 7, 11]) {
      const w = new World(seed);
      const hall = w.buildings[0];
      const cx = hall.x + 1.5, cy = hall.y + 1.5;
      expect(treeCount(w)).toBeGreaterThan(450);
      expect(w.nodes.some((n) => n.kind === 'tree' && Math.hypot(n.x + 0.5 - cx, n.y + 0.5 - cy) < CLEARING_RADIUS - 0.8)).toBe(false);
      // perto do acampamento a mata é bem mais cheia que no resto do mapa
      const near = w.nodes.filter((n) => n.kind === 'tree' && Math.hypot(n.x - cx, n.y - cy) < 12).length / (Math.PI * 144);
      const far = w.nodes.filter((n) => n.kind === 'tree' && Math.hypot(n.x - cx, n.y - cy) > 24).length / (GRID_W * GRID_H - Math.PI * 576);
      expect(near).toBeGreaterThan(far);
    }
  });

  it('árvore cortada até acabar é derrubada e o tile fica livre', () => {
    const w = new World(3);
    w.autonomy = false;
    const hall = w.buildings[0];
    const tree = w.nodes.filter((n) => n.kind === 'tree').sort((a, b) => Math.hypot(a.x - hall.x, a.y - hall.y) - Math.hypot(b.x - hall.x, b.y - hall.y))[0];
    tree.amount = MIN_HARVEST + 1;
    w.nodes = [tree]; // a única árvore do mapa: é a que ele vai cortar
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'wood');
    run(w, 600);
    expect(w.nodes.includes(tree)).toBe(false);
    expect(w.forest[w.idx(tree.x, tree.y)]).toBe(0);
  });

  it('obra e estrada abrem espaço: derrubam as árvores do terreno', () => {
    const w = new World(3);
    w.stock.wood = 200; w.stock.stone = 100;
    const tree = w.nodes.find((n) => n.kind === 'tree' && w.canRoad(n.x, n.y).ok)!;
    expect(w.paintRoad(tree.x, tree.y).ok).toBe(true);
    expect(w.nodes.includes(tree)).toBe(false);
    expect(w.forest[w.idx(tree.x, tree.y)]).toBe(0);
    // casa sobre um trecho de floresta
    let spot: { x: number; y: number } | null = null;
    for (const n of w.nodes) if (n.kind === 'tree' && w.canPlace('house', n.x, n.y).ok) { spot = { x: n.x, y: n.y }; break; }
    expect(spot).not.toBeNull();
    const before = treeCount(w);
    expect(w.requestBuild('house', spot!.x, spot!.y).ok).toBe(true);
    expect(treeCount(w)).toBeLessThan(before);
  });

  it('a floresta se espalha devagar: nascem mudas em volta das árvores', () => {
    const w = new World(3);
    w.autonomy = false;
    const before = treeCount(w);
    run(w, 6000);
    expect(treeCount(w)).toBeGreaterThan(before);
  });

  it('a clareira cresce: em poucos dias a vila derruba árvores e constrói', () => {
    const w = new World(3);
    for (let i = 0; i < 8; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    const before = treeCount(w);
    run(w, 3000);
    expect(treeCount(w)).toBeLessThan(before);
    expect(w.buildings.filter((b) => b.kind === 'house').length).toBeGreaterThan(0);
  });
});
