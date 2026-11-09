import { describe, expect, it } from 'vitest';
import { CommandProcessor } from '../src/chat/commands';
import { GRID_H, GRID_W, TICKS_PER_DAY } from '../src/sim/config';
import { World } from '../src/sim/world';

describe('equilíbrio', () => {
  it('com o estoque cheio ninguém gasta recurso finito: as pedras não somem à toa', () => {
    const w = new World(2);
    w.autonomy = false; // testa só a coleta, sem obras gastando o estoque
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'stone');
    w.stock.stone = w.storageCap;
    const rocks = w.nodes.filter((n) => n.kind === 'rock').reduce((a, n) => a + n.amount, 0);
    for (let i = 0; i < 1500; i++) w.step();
    expect(w.nodes.filter((n) => n.kind === 'rock').reduce((a, n) => a + n.amount, 0)).toBe(rocks);
    expect(w.isStuck(w.villagers[0])).toBe(true);
  });

  it('o aldeão volta a trabalhar quando abre espaço no estoque', () => {
    const w = new World(2);
    w.autonomy = false; // testa só a coleta, sem obras gastando o estoque
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'stone');
    w.stock.stone = w.storageCap;
    for (let i = 0; i < 100; i++) w.step();
    w.stock.stone = 10;
    for (let i = 0; i < 800; i++) w.step();
    expect(w.stock.stone).toBeGreaterThan(10);
  });

  it('a pedreira é fonte de pedra quando as pedras do mapa acabam', () => {
    const w = new World(2);
    w.autonomy = false;
    w.stock = { wood: 999, stone: 10, food: 50, water: 50 };
    let s: { x: number; y: number } | null = null;
    const hall = w.buildings[0];
    let bd = Infinity;
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) { const d = (x - hall.x) ** 2 + (y - hall.y) ** 2; if (d < bd && w.canPlace('quarry', x, y).ok) { s = { x, y }; bd = d; } } // o mais perto da prefeitura
    const r = w.requestBuild('quarry', s!.x, s!.y);
    if (!r.ok) throw new Error('pedreira');
    r.building.done = true;
    r.building.progress = r.building.workNeeded;
    w.nodes = w.nodes.filter((n) => n.kind !== 'rock'); // acabaram as pedras
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'stone');
    w.stock.stone = 10;
    for (let i = 0; i < 800; i++) w.step();
    expect(w.stock.stone).toBeGreaterThan(10);
  });

  it('avisa a seca um dia antes, uma vez só por estação', () => {
    const w = new World(2);
    const warn = (): number => w.drainEvents().filter((e) => e.includes('seca chega')).length;
    for (let i = 0; i < TICKS_PER_DAY * 3 - 5; i++) w.step();
    expect(warn()).toBe(0);
    for (let i = 0; i < 20; i++) w.step();
    for (let i = 0; i < TICKS_PER_DAY * 0.5; i++) w.step();
    expect(warn()).toBe(1);
    for (let i = 0; i < TICKS_PER_DAY * 3; i++) w.step(); // entra na seca e sai
    expect(warn()).toBe(0);
    for (let i = 0; i < TICKS_PER_DAY * 3.2; i++) w.step(); // próximo aviso
    expect(warn()).toBe(1);
  });

  it('!status avisa quando o aldeão está sem trabalho', () => {
    const w = new World(2);
    const replies: string[] = [];
    const p = new CommandProcessor(w, { now: () => 0 }, (_to, t) => replies.push(t));
    p.submit({ userId: 'a', user: 'A', text: '!entrar' });
    p.process();
    w.setJob('a', 'stone');
    w.stock.stone = w.storageCap;
    for (let i = 0; i < 50; i++) w.step();
    p.submit({ userId: 'a', user: 'A', text: '!status' });
    p.process();
    expect(replies[replies.length - 1]).toContain('Sem trabalho');
  });
});
