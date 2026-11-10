import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { CommandProcessor } from '../src/chat/commands';
import { CARDS, COIN_XP } from '../src/sim/events';
import { TICKS_PER_DAY } from '../src/sim/config';

function setup(coins = 100): { w: World; id: string } {
  const w = new World(4);
  w.npcsOn = false;
  const r = w.addVillager('1', 'Ana', '#fff');
  if (!r.ok) throw new Error('sem vaga');
  r.villager.coins = coins;
  return { w, id: '1' };
}

describe('cartas de evento (moedas da vila)', () => {
  it('moedas vêm do XP (1 a cada COIN_XP)', () => {
    const w = new World(4);
    w.npcsOn = false;
    w.addVillager('1', 'Ana', '#fff');
    for (let t = 0; t < 3000; t++) w.step();
    const v = w.findVillager('1')!;
    expect(v.xp).toBeGreaterThan(0);
    expect(v.coins).toBe(Math.floor(v.xp / COIN_XP));
  });
  it('aprovação automática: gasta, ativa o evento com o nome de quem pediu e respeita a espera', () => {
    const { w, id } = setup();
    expect(w.requestCard(id, 'chuva')).toEqual({ ok: true, queued: false });
    expect(w.event?.kind).toBe('rain');
    expect(w.event?.by).toBe('Ana');
    expect(w.findVillager(id)!.coins).toBe(70);
    expect(w.requestCard(id, 'festa')).toMatchObject({ ok: false, reason: 'busy' });
    for (let t = 0; t < TICKS_PER_DAY; t++) w.step();
    w.event = null;
    expect(w.requestCard(id, 'chuva')).toMatchObject({ ok: false, reason: 'cooldown' });
  });
  it('sem moedas, carta desconhecida e NPC são recusados', () => {
    const { w, id } = setup(5);
    expect(w.requestCard(id, 'chuva')).toMatchObject({ ok: false, reason: 'coins', need: 25 });
    expect(w.requestCard(id, 'xyz')).toMatchObject({ ok: false, reason: 'unknown' });
    expect(w.requestCard('nope', 'chuva')).toMatchObject({ ok: false, reason: 'villager' });
  });
  it('com aprovação manual: reserva as moedas, recusar devolve, aprovar ativa', () => {
    const { w, id } = setup();
    w.cardAuto = false;
    expect(w.requestCard(id, 'meteoro')).toEqual({ ok: true, queued: true });
    expect(w.findVillager(id)!.coins).toBe(50);
    expect(w.requestCard(id, 'chuva')).toMatchObject({ reason: 'pending' });
    w.refuseCard(w.cardQueue[0].id);
    expect(w.findVillager(id)!.coins).toBe(100);
    w.requestCard(id, 'meteoro');
    const stone = w.stock.stone;
    expect(w.approveCard(w.cardQueue[0].id)).toBe(true);
    expect(w.stock.stone).toBeGreaterThan(stone);
    expect(w.cardQueue).toHaveLength(0);
  });
  it('chegada de moradores cria NPCs e o estado sobrevive ao save', () => {
    const { w, id } = setup();
    for (let i = 0; i < 8; i++) w.addVillager(`x${i}`, `V${i}`, '#fff');
    const before = w.villagers.length;
    w.requestCard(id, 'chegada');
    expect(w.villagers.length).toBeGreaterThan(before);
    expect(w.villagers.slice(before).every((v) => v.npc)).toBe(true);
    w.cardAuto = false;
    w.requestCard('x1', 'chuva');
    const w2 = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(w2.cardQueue).toEqual(w.cardQueue);
    expect(w2.cardAuto).toBe(false);
  });
  it('!evento e !moedas respondem no chat', () => {
    const { w } = setup();
    const out: string[] = [];
    let t = 0;
    const cp = new CommandProcessor(w, { now: () => (t += 20000) });
    cp.onReply = (_to, text) => out.push(text);
    cp.submit({ userId: '1', user: 'Ana', text: '!moedas' });
    cp.submit({ userId: '1', user: 'Ana', text: '!evento' });
    cp.submit({ userId: '1', user: 'Ana', text: '!evento chuva' });
    cp.process();
    expect(out[0]).toContain('100');
    expect(out[1]).toContain(CARDS[0].alias[0]);
    expect(out[2]).toContain('ativada');
  });
});
