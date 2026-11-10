import { describe, expect, it } from 'vitest';
import { COUPLE_AT, FRIEND_AT, KID_GROW_TICKS } from '../src/sim/config';
import { CommandProcessor } from '../src/chat/commands';
import { World } from '../src/sim/world';

function pair(): { w: World } {
  const w = new World(9);
  w.npcsOn = false;
  w.autonomy = false;
  w.addVillager('a', 'Ana', '#fff');
  w.addVillager('b', 'Beto', '#fff');
  const va = w.findVillager('a')!, vb = w.findVillager('b')!;
  vb.x = va.x; vb.y = va.y;
  for (const v of [va, vb]) { v.wait = 1e9; v.state = 'idle'; }
  return { w };
}

describe('amizades e famílias', () => {
  it('quem fica perto vira amigo, depois casal, e o casal tem filho que cresce', () => {
    const { w } = pair();
    const ev: string[] = [];
    for (let t = 0; t < 2 * (COUPLE_AT * 20) + 12000 && !ev.some((e) => e.includes('cresceu')); t++) {
      w.step();
      ev.push(...w.drainEvents());
      if (t > 3000 && t < 3005) w.stock = { wood: 400, stone: 400, food: 400, water: 400 };
    }
    const text = ev.join('|');
    expect(text).toContain('viraram amigos');
    expect(text).toContain('começaram a namorar');
    expect(text).toContain('tiveram um filho');
    const a = w.findVillager('a')!;
    expect(a.partner).toBe('b');
    expect(FRIEND_AT).toBeLessThan(COUPLE_AT);
    expect(w.relationsOf('a').kids.length).toBeGreaterThan(0);
    expect(KID_GROW_TICKS).toBeGreaterThan(0);
  }, 60000);

  it('o comando !amigos mostra parceiro e amigos; vínculos somem quando o outro sai', () => {
    const { w } = pair();
    const replies: string[] = [];
    const chat = new CommandProcessor(w, { now: () => 0 }, (_to, t) => replies.push(t));
    for (let t = 0; t < COUPLE_AT * 20 + 40; t++) w.step();
    chat.submit({ userId: 'a', user: 'Ana', text: '!amigos' });
    chat.process();
    expect(replies.join(' ')).toContain('Beto');
    w.removeVillager('b');
    for (let t = 0; t < 40; t++) w.step();
    expect(w.findVillager('a')!.partner).toBeUndefined();
    expect(w.relationsOf('a').friends).toEqual([]);
  }, 60000);
});
