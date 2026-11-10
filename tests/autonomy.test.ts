import { describe, expect, it } from 'vitest';
import { CommandProcessor } from '../src/chat/commands';
import { AUTONOMY_EVERY } from '../src/sim/config';
import { World } from '../src/sim/world';

/** Dá à vila uma fazenda e um poço prontos (se o mapa permitir), para a moradia deixar de esperar por eles. */
function withBasics(w: World): void {
  const priv = w as unknown as {
    findSite(k: string): { x: number; y: number } | null;
    placeBuilding(k: string, x: number, y: number, ww: number, h: number, work: number, done: boolean): unknown;
  };
  for (const [k, ww, h, work] of [['farm', 2, 2, 100], ['well', 2, 2, 80]] as const) {
    const site = priv.findSite(k);
    if (!site) throw new Error(`sem lugar para ${k}`);
    priv.placeBuilding(k, site.x, site.y, ww, h, work, true);
  }
}

const run = (w: World, ticks: number): void => { for (let i = 0; i < ticks; i++) w.step(); };

describe('autonomia dos aldeões', () => {
  it('sem moradia sobrando, os aldeões constroem uma casa sozinhos (gastando o estoque)', () => {
    const w = new World(5);
    withBasics(w);
    for (let i = 0; i < w.popCap; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    w.stock.wood = 200; w.stock.stone = 50; w.stock.food = 60; w.stock.water = 60;
    const before = w.buildings.length;
    run(w, AUTONOMY_EVERY + 1);
    const house = w.buildings.find((b) => b.kind === 'house');
    expect(w.buildings.length).toBe(before + 1);
    expect(house && !house.done).toBe(true);
    expect(w.stock.wood).toBeLessThan(200);
    expect(w.drainEvents().some((e) => e.includes('decidiram construir uma casa'))).toBe(true);
  });

  it('com a vila passando fome e sede, constroem fazenda e poço antes de qualquer casa', () => {
    const w = new World(5);
    for (let i = 0; i < w.popCap; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    w.stock.wood = 200; w.stock.stone = 60; w.stock.food = 0; w.stock.water = 0;
    run(w, AUTONOMY_EVERY * 3);
    expect(w.buildings.some((b) => b.kind === 'farm')).toBe(true);
    expect(w.buildings.some((b) => b.kind === 'well')).toBe(true);
    expect(w.buildings.some((b) => b.kind === 'house')).toBe(false);
    expect(w.drainEvents().some((e) => e.includes('uma fazenda'))).toBe(true);
  });

  it('com madeira e pedra no limite do estoque, a vila só pede comida e água', () => {
    const w = new World(5);
    for (let i = 0; i < 8; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    w.stock.wood = w.storageCap; w.stock.stone = w.storageCap; w.stock.food = 10; w.stock.water = 10;
    const need = (w as unknown as { neediestResource(): string }).neediestResource();
    expect(['food', 'water']).toContain(need);
  });

  it('uma vila que cresce não chega a passar fome e sede (simulação longa)', () => {
    const w = new World(3);
    let minFood = Infinity, minWater = Infinity;
    for (let i = 0; i < 4; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    for (let t = 1; t <= 6000; t++) {
      if (t % 600 === 0) for (let k = 0; k < 2; k++) w.addVillager(`n${t}${k}`, `N${t}${k}`, '#fff');
      w.step();
      if (t > 2400) { minFood = Math.min(minFood, w.stock.food); minWater = Math.min(minWater, w.stock.water); }
    }
    expect(w.buildings.some((b) => b.kind === 'farm' && b.done)).toBe(true);
    expect(w.buildings.some((b) => b.kind === 'well' && b.done)).toBe(true);
    expect(Math.max(minFood, minWater)).toBeGreaterThan(0);
  });

  it('não constrói se faltar estoque, se houver moradia ou se a autonomia estiver desligada', () => {
    const poor = new World(5);
    for (let i = 0; i < poor.popCap; i++) poor.addVillager(`u${i}`, `V${i}`, '#fff');
    poor.stock.wood = 10;
    run(poor, AUTONOMY_EVERY + 1);
    expect(poor.buildings.some((b) => b.kind === 'house')).toBe(false);

    const roomy = new World(5);
    roomy.addVillager('a', 'A', '#fff');
    roomy.stock.wood = 500;
    run(roomy, AUTONOMY_EVERY * 3);
    expect(roomy.buildings.some((b) => b.kind === 'house')).toBe(false);

    const off = new World(5);
    off.autonomy = false;
    for (let i = 0; i < off.popCap; i++) off.addVillager(`u${i}`, `V${i}`, '#fff');
    off.stock.wood = 500;
    run(off, AUTONOMY_EVERY * 3);
    expect(off.buildings.some((b) => b.kind === 'house')).toBe(false);
  });

  it('só uma casa por vez e sempre em terreno válido, longe da irrigação e com corredor livre', () => {
    const w = new World(9);
    withBasics(w);
    for (let i = 0; i < w.popCap; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    w.stock.wood = 500; w.stock.stone = 100; w.stock.food = 60; w.stock.water = 60;
    run(w, AUTONOMY_EVERY * 4);
    const houses = w.buildings.filter((b) => b.kind === 'house');
    expect(houses.length).toBeLessThanOrEqual(1 + (w.buildings.filter((b) => b.kind === 'house' && b.done).length));
    for (const h of houses) expect(w.irrigated[w.idx(h.x, h.y)]).toBe(0);
  });

  it('quem escolheu com !trabalhar não muda sozinho; !livre devolve a decisão', () => {
    const w = new World(5);
    const chat = new CommandProcessor(w, { now: () => 0 });
    w.npcsOn = false;
    w.addVillager('1', 'Ana', '#fff');
    w.stock.stone = 0; w.stock.food = 500; w.stock.water = 500; w.stock.wood = 500;
    w.setJob('1', 'wood');
    run(w, AUTONOMY_EVERY * 12);
    expect(w.findVillager('1')!.job).toBe('wood');
    chat.submit({ userId: '1', user: 'Ana', text: '!livre' });
    chat.process();
    expect(w.findVillager('1')!.ordered).toBe(false);
    run(w, AUTONOMY_EVERY * 12);
    expect(w.findVillager('1')!.job).toBe('stone'); // o que mais falta
  });

  it('o save guarda a autonomia e a ordem do viewer', () => {
    const w = new World(5);
    w.autonomy = false;
    w.addVillager('1', 'Ana', '#fff');
    w.setJob('1', 'food');
    const r = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(r.autonomy).toBe(false);
    expect(r.findVillager('1')!.ordered).toBe(true);
  });
});
