import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W, MAX_HEIGHT } from '../src/sim/config';
import { World } from '../src/sim/world';

const run = (w: World, n: number): void => { for (let i = 0; i < n; i++) w.step(); };
const priv = (w: World) => w as unknown as { autoCanal(): boolean; autoLevel(k: string): { x: number; y: number } | null };

/** Tile de terra livre ao lado do rio, na altura da margem (1 nível acima do leito). */
function bankTile(w: World): { x: number; y: number } {
  for (let y = 5; y < GRID_H - 5; y++) {
    for (let x = 3; x < GRID_W - 3; x++) {
      const t = w.idx(x, y);
      if (w.channel[t] || w.water[t] > 0.02) continue;
      if (w.channel[w.idx(x + 1, y)] && w.height[t] === w.height[w.idx(x + 1, y)] + 1 && !w.buildingAt(x, y)) return { x, y };
    }
  }
  throw new Error('sem margem');
}

describe('ferramentas de terreno', () => {
  it('cavar baixa 1 nível e elevar sobe 1, gastando estoque; respeita limites e prédios', () => {
    const w = new World(3);
    w.stock.wood = 50; w.stock.stone = 50;
    const { x, y } = bankTile(w);
    const h0 = w.height[w.idx(x, y)];
    const v0 = w.terrainVersion;
    expect(w.terraform(x, y, 'dig').ok).toBe(true);
    expect(w.height[w.idx(x, y)]).toBe(h0 - 1);
    expect(w.stock.wood).toBe(49);
    expect(w.terrainVersion).toBeGreaterThan(v0);
    expect(w.terraform(x, y, 'raise').ok).toBe(true);
    expect(w.height[w.idx(x, y)]).toBe(h0);
    expect(w.stock.stone).toBe(49);
    const hall = w.buildings[0];
    expect(w.terraform(hall.x, hall.y, 'dig').ok).toBe(false);
    w.height[w.idx(x, y)] = MAX_HEIGHT;
    expect(w.terraform(x, y, 'raise').ok).toBe(false);
    w.height[w.idx(x, y)] = 0;
    expect(w.terraform(x, y, 'dig').ok).toBe(false);
    w.stock.wood = 0; w.height[w.idx(x, y)] = 4;
    const r = w.terraform(x, y, 'dig');
    expect(r.ok === false && r.reason).toBe('cost');
  });

  it('um canal cavado da margem deixa a água do rio entrar', () => {
    const w = new World(3);
    w.stock.wood = 50;
    const { x, y } = bankTile(w);
    expect(w.water[w.idx(x, y)]).toBeLessThan(0.02);
    w.terraform(x, y, 'dig');
    run(w, 200);
    expect(w.water[w.idx(x, y)]).toBeGreaterThan(0.1);
  });

  it('nascente enche um buraco cavado, vai no save e volta', () => {
    const w = new World(3);
    w.stock.wood = 100; w.stock.stone = 100;
    // um poço bem longe do rio e dos lagos, num trecho de terra
    let spot: { x: number; y: number } | null = null;
    for (let y = 4; y < GRID_H - 4 && !spot; y++) for (let x = 4; x < 14 && !spot; x++) {
      const t = w.idx(x, y);
      if (!w.channel[t] && w.water[t] < 0.02 && !w.buildingAt(x, y) && w.height[t] >= 2) spot = { x, y };
    }
    expect(spot).not.toBeNull();
    const { x, y } = spot!;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { w.terraform(x + i, y + j, 'dig'); w.terraform(x + i, y + j, 'dig'); }
    expect(w.addSpring(x, y).ok).toBe(true);
    expect(w.isSpring(x, y)).toBe(true);
    run(w, 400);
    expect(w.water[w.idx(x, y)]).toBeGreaterThan(0.2);
    const r = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(r.isSpring(x, y)).toBe(true);
    expect(r.height[r.idx(x, y)]).toBe(w.height[w.idx(x, y)]);
  });
});

describe('terreno feito pelos aldeões', () => {
  it('cavam um canal da água até terra seca perto da prefeitura e ela passa a ser irrigada', () => {
    const count = (w: World): number => { const h = w.buildings[0]; let n = 0; for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (w.irrigated[w.idx(x, y)] && Math.hypot(x - h.x, y - h.y) < 14) n++; return n; };
    const a = new World(3), b = new World(3);
    a.autonomy = false; b.autonomy = false;
    a.stock.wood = 200; b.stock.wood = 200;
    run(a, 300); run(b, 300);
    expect(priv(a).autoCanal()).toBe(true);
    expect(a.stock.wood).toBeLessThan(200);
    expect(a.drainEvents().some((e) => e.includes('canal'))).toBe(true);
    run(a, 600); run(b, 600);
    expect(count(a)).toBeGreaterThan(count(b)); // o canal levou água (e irrigação) para onde não havia
  });

  it('aplainam um terreno quase plano para caber o prédio', () => {
    const w = new World(3);
    w.stock.wood = 100;
    const hall = w.buildings[0];
    // chão em xadrez de 1 nível perto da prefeitura: nenhum 2x2 é plano
    for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
      if (Math.hypot(x - hall.x, y - hall.y) < 12 && !w.buildingAt(x, y) && !w.channel[w.idx(x, y)]) w.height[w.idx(x, y)] = 4 + ((x + y) % 2);
    }
    expect(w.canPlace('house', hall.x + 4, hall.y).ok).toBe(false);
    const site = priv(w).autoLevel('house');
    expect(site).not.toBeNull();
    expect(w.canPlace('house', site!.x, site!.y).ok).toBe(true);
    expect(w.stock.wood).toBeLessThan(100);
  });
});
