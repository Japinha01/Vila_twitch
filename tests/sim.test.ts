import { describe, expect, it } from 'vitest';
import { CommandProcessor, parseCommand } from '../src/chat/commands';
import { isBlocked, sanitizeName } from '../src/chat/names';
import { World } from '../src/sim/world';

function enter(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.addVillager(`u${i}`, `u${i}`, '#fff');
}

describe('simulação', () => {
  it('é determinística: mesma seed, mesmo resultado', () => {
    const run = (): string => {
      const w = new World(42);
      enter(w, 8);
      w.setJob('u0', 'build');
      w.requestBuild('house');
      for (let i = 0; i < 3000; i++) w.step();
      return JSON.stringify([w.stock, w.villagers, w.buildings]);
    };
    expect(run()).toBe(run());
  });

  it('cria o aldeão uma vez só e respeita o limite de população', () => {
    const w = new World(1);
    expect(w.addVillager('a', 'A', '#fff').ok).toBe(true);
    expect(w.addVillager('a', 'A', '#fff')).toEqual({ ok: false, reason: 'exists' });
    enter(w, 30);
    expect(w.villagers.length).toBe(w.popCap);
  });

  it('aldeões coletam recursos e depositam no estoque', () => {
    const w = new World(7);
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'wood');
    const before = w.stock.wood;
    for (let i = 0; i < 600; i++) w.step();
    expect(w.stock.wood).toBeGreaterThan(before);
  });

  it('construir cobra recursos, recusa sem estoque e conclui com construtor', () => {
    const w = new World(3);
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'build');
    const woodBefore = w.stock.wood;
    const r = w.requestBuild('house');
    expect(r.ok).toBe(true);
    expect(w.stock.wood).toBe(woodBefore - 25);
    w.stock.wood = 0;
    expect(w.requestBuild('warehouse')).toMatchObject({ ok: false, reason: 'cost' });
    const cap = w.popCap;
    for (let i = 0; i < 1000; i++) w.step();
    expect(w.doneCount('house')).toBe(1);
    expect(w.popCap).toBe(cap + 4);
  });

  it('prédios não se sobrepõem', () => {
    const w = new World(5);
    w.stock = { wood: 999, stone: 999, food: 0, water: 0 };
    for (let i = 0; i < 10; i++) w.requestBuild('house');
    const seen = new Set<string>();
    for (const b of w.buildings) {
      for (let j = 0; j < b.size; j++) for (let i = 0; i < b.size; i++) {
        const k = `${b.x + i},${b.y + j}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe('chat', () => {
  const msg = (text: string, userId = 'u', user = 'U') => ({ userId, user, text });

  it('interpreta comandos com acento e maiúsculas', () => {
    expect(parseCommand('!Trabalhar ÁGUA')).toEqual({ ok: true, cmd: { name: 'trabalhar', job: 'water' } });
    expect(parseCommand('!construir poço')).toEqual({ ok: true, cmd: { name: 'construir', building: 'well' } });
    expect(parseCommand('oi pessoal')).toEqual({ ok: false });
  });

  it('aplica cooldown por viewer e comando', () => {
    let t = 0;
    const w = new World(1);
    const p = new CommandProcessor(w, { now: () => t });
    p.submit(msg('!entrar'));
    p.submit(msg('!entrar'));
    expect(p.queued).toBe(1);
    t += 6000;
    p.submit(msg('!entrar'));
    expect(p.queued).toBe(2);
  });

  it('limita a fila e a quantidade processada por chamada', () => {
    const w = new World(1);
    const p = new CommandProcessor(w, { now: () => 0, queueLimit: 5, perCall: 2 });
    for (let i = 0; i < 20; i++) p.submit(msg('!entrar', `u${i}`));
    expect(p.queued).toBe(5);
    expect(p.dropped).toBe(15);
    p.process();
    expect(p.queued).toBe(3);
    expect(w.villagers.length).toBe(2);
  });

  it('exige !entrar antes dos outros comandos', () => {
    const w = new World(1);
    const replies: string[] = [];
    const p = new CommandProcessor(w, { now: () => 0 }, (_to, t) => replies.push(t));
    p.submit(msg('!status'));
    p.process();
    expect(replies[0]).toContain('!entrar');
  });

  it('filtra nomes ofensivos, inclusive com leetspeak', () => {
    expect(isBlocked('M3rd@')).toBe(true);
    expect(sanitizeName('Caralho123', 'x')).toMatch(/^Aldeão\d+$/);
    expect(sanitizeName('Maria', 'x')).toBe('Maria');
  });
});

describe('distribuição inicial', () => {
  it('não coloca todos os recém-chegados na mesma profissão', () => {
    const w = new World(9);
    enter(w, 10);
    const jobs = new Set(w.villagers.map((v) => v.job));
    expect(jobs.size).toBeGreaterThanOrEqual(3);
  });
});
