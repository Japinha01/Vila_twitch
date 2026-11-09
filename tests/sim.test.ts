import { describe, expect, it } from 'vitest';
import { CommandProcessor, parseCommand } from '../src/chat/commands';
import { isBlocked, sanitizeName } from '../src/chat/names';
import { GRID_H, GRID_W, TICKS_PER_DAY } from '../src/sim/config';
import { World, type PlaceableKind } from '../src/sim/world';

function enter(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.addVillager(`u${i}`, `u${i}`, '#fff');
}

/** Primeira posição válida para o prédio, a mais próxima da prefeitura. */
function spot(w: World, kind: PlaceableKind): { x: number; y: number } {
  const hall = w.townHall();
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!w.canPlace(kind, x, y).ok) continue;
      const d = (x - hall.x) ** 2 + (y - hall.y) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (!best) throw new Error(`sem lugar para ${kind}`);
  return best;
}

const rich = (w: World): void => { w.stock = { wood: 999, stone: 999, food: 50, water: 50 }; };
const waterSum = (w: World): number => w.water.reduce((a, b) => a + b, 0);
const run = (w: World, ticks: number): void => { for (let i = 0; i < ticks; i++) w.step(); };

describe('simulação', () => {
  it('é determinística: mesma seed, mesmo resultado (água incluída)', () => {
    const go = (): string => {
      const w = new World(42);
      enter(w, 8);
      w.setJob('u0', 'build');
      const s = spot(w, 'house');
      w.requestBuild('house', s.x, s.y);
      run(w, 3000);
      return JSON.stringify([w.stock, w.villagers, w.buildings]) + Array.from(w.water).join(',');
    };
    expect(go()).toBe(go());
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
    run(w, 800);
    expect(w.stock.wood).toBeGreaterThan(before);
  });

  it('prédios não se sobrepõem', () => {
    const w = new World(5);
    rich(w);
    for (let i = 0; i < 10; i++) { const s = spot(w, 'house'); w.requestBuild('house', s.x, s.y); }
    const seen = new Set<string>();
    for (const b of w.buildings) {
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
        const k = `${b.x + i},${b.y + j}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });

  it('construir cobra recursos, recusa sem estoque e cancelar devolve', () => {
    const w = new World(3);
    const s = spot(w, 'house');
    const wood = w.stock.wood;
    const r = w.requestBuild('house', s.x, s.y);
    expect(r.ok).toBe(true);
    expect(w.stock.wood).toBe(wood - 25);
    w.stock.wood = 0;
    expect(w.canPlace('warehouse', s.x + 5, s.y)).toMatchObject({ ok: false });
    if (r.ok) expect(w.cancelBuild(r.building.id)).toBe(true);
    expect(w.stock.wood).toBe(25);
  });

  it('um construtor conclui a obra e a casa aumenta a população máxima', () => {
    const w = new World(3);
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'build');
    const s = spot(w, 'house');
    w.requestBuild('house', s.x, s.y);
    const cap = w.popCap;
    run(w, 1200);
    expect(w.doneCount('house')).toBe(1);
    expect(w.popCap).toBe(cap + 4);
  });

  it('obra prioritária é atendida antes das outras', () => {
    const w = new World(11);
    rich(w);
    w.addVillager('a', 'A', '#fff');
    w.setJob('a', 'build');
    const s1 = spot(w, 'house');
    const r1 = w.requestBuild('house', s1.x, s1.y);
    const s2 = spot(w, 'house');
    const r2 = w.requestBuild('house', s2.x, s2.y);
    if (!r1.ok || !r2.ok) throw new Error('obras');
    w.togglePriority(r2.building.id);
    run(w, 5);
    expect(w.villagers[0].targetId).toBe(r2.building.id);
  });
});

describe('água e estações', () => {
  it('o rio nasce, corre até o sul e irriga o entorno', () => {
    const w = new World(1);
    expect(w.water.filter((d) => d >= 0.25).length).toBeGreaterThan(30);
    expect(w.irrigated.reduce((a, b) => a + b, 0)).toBeGreaterThan(200);
    const bottom = Array.from({ length: GRID_W }, (_, x) => w.water[w.idx(x, GRID_H - 3)]);
    expect(Math.max(...bottom)).toBeGreaterThan(0.25);
  });

  it('a seca seca o rio e a terra; depois a água volta', () => {
    const w = new World(1);
    const wet0 = waterSum(w);
    const soil0 = w.moisture.reduce((a, b) => a + b, 0);
    run(w, TICKS_PER_DAY * 4 + 1100); // fim da estação temperada + quase toda a seca
    expect(w.season.drought).toBe(true);
    expect(waterSum(w)).toBeLessThan(wet0 * 0.2);
    expect(w.moisture.reduce((a, b) => a + b, 0)).toBeLessThan(soil0 * 0.8);
    run(w, TICKS_PER_DAY * 1 + 600); // seca termina, rio volta
    expect(w.season.drought).toBe(false);
    expect(waterSum(w)).toBeGreaterThan(wet0 * 0.5);
  });

  it('avisa quando a seca começa e termina', () => {
    const w = new World(2);
    run(w, TICKS_PER_DAY * 6 + 10);
    const ev = w.drainEvents().join('|');
    expect(ev).toContain('seca começou');
    expect(ev).toContain('seca acabou');
  });

  it('a represa concluída eleva o terreno e acumula água a montante', () => {
    const base = new World(4);
    const dammed = new World(4);
    rich(dammed);
    // acha a linha do rio onde a represa é válida
    let at: { x: number; y: number } | null = null;
    for (let y = 14; y < GRID_H - 4 && !at; y++) for (let xx = 0; xx < GRID_W && !at; xx++) if (dammed.canPlace('dam', xx, y).ok) at = { x: xx, y };
    expect(at).not.toBeNull();
    dammed.addVillager('a', 'A', '#fff');
    dammed.setJob('a', 'build');
    const r = dammed.requestBuild('dam', at!.x, at!.y);
    expect(r.ok).toBe(true);
    const h0 = dammed.height[dammed.idx(at!.x, at!.y)];
    run(base, 1800);
    run(dammed, 1800);
    expect(dammed.doneCount('dam')).toBe(1);
    expect(dammed.height[dammed.idx(at!.x, at!.y)]).toBe(h0 + 2);
    const upstream = (w: World): number => w.water[w.idx(at!.x, at!.y - 1)] + w.water[w.idx(at!.x + 1, at!.y - 1)];
    expect(upstream(dammed)).toBeGreaterThan(upstream(base) + 0.2);
    expect(dammed.water[dammed.idx(at!.x, at!.y)]).toBe(0);
  });

  it('só dá para construir represa sobre o rio, e fazenda só em solo irrigado', () => {
    const w = new World(6);
    rich(w);
    expect(w.canPlace('dam', 3, 3)).toMatchObject({ ok: false, reason: 'space' });
    expect(w.canPlace('farm', 2, 2)).toMatchObject({ ok: false, reason: 'space' });
    expect(w.canPlace('farm', spot(w, 'farm').x, spot(w, 'farm').y).ok).toBe(true);
  });

  it('a fazenda respeita o limite de vagas de trabalhadores', () => {
    const w = new World(8);
    rich(w);
    const s = spot(w, 'farm');
    const r = w.requestBuild('farm', s.x, s.y);
    if (!r.ok) throw new Error('fazenda');
    r.building.progress = r.building.workNeeded;
    r.building.done = true;
    enter(w, 8);
    for (const v of w.villagers) w.setJob(v.userId, 'food');
    let maxOn = 0;
    for (let t = 0; t < 300; t++) {
      w.step();
      const on = w.villagers.filter((v) => v.targetId === r.building.id && (v.state === 'toTarget' || v.state === 'working')).length;
      maxOn = Math.max(maxOn, on);
    }
    expect(maxOn).toBeGreaterThan(0);
    expect(maxOn).toBeLessThanOrEqual(3);
  });

  it('árvores cortadas rebrotam em solo irrigado', () => {
    const w = new World(9);
    const tree = w.nodes.find((n) => n.kind === 'tree' && w.irrigated[w.idx(n.x, n.y)])!;
    tree.amount = 0;
    run(w, 500);
    expect(tree.amount).toBeGreaterThanOrEqual(8);
  });

  it('não coloca todos os recém-chegados na mesma profissão', () => {
    const w = new World(9);
    enter(w, 10);
    expect(new Set(w.villagers.map((v) => v.job)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('chat', () => {
  const msg = (text: string, userId = 'u', user = 'U') => ({ userId, user, text });

  it('interpreta comandos com acento e maiúsculas', () => {
    expect(parseCommand('!Trabalhar ÁGUA')).toEqual({ ok: true, cmd: { name: 'trabalhar', job: 'water' } });
    expect(parseCommand('!trabalhar construir')).toEqual({ ok: true, cmd: { name: 'trabalhar', job: 'build' } });
    expect(parseCommand('oi pessoal')).toEqual({ ok: false });
  });

  it('o chat não constrói: !construir é do streamer', () => {
    expect(parseCommand('!construir casa')).toEqual({ ok: false });
  });

  it('aplica cooldown por viewer e comando', () => {
    let t = 0;
    const p = new CommandProcessor(new World(1), { now: () => t });
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
    const replies: string[] = [];
    const p = new CommandProcessor(new World(1), { now: () => 0 }, (_to, t) => replies.push(t));
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
