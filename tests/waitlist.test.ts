import { describe, expect, it } from 'vitest';
import { CommandProcessor } from '../src/chat/commands';
import { AUTONOMY_EVERY } from '../src/sim/config';
import { World } from '../src/sim/world';

const run = (w: World, ticks: number): void => { for (let i = 0; i < ticks; i++) w.step(); };
const fill = (w: World): void => { for (let i = 0; i < w.popCap; i++) w.addVillager(`u${i}`, `V${i}`, '#fff'); };

describe('lista de espera', () => {
  it('!entrar com a vila cheia entra na fila, mostra a posição e !fila sai dela', () => {
    const w = new World(5);
    fill(w);
    const replies: string[] = [];
    const chat = new CommandProcessor(w, { now: () => 0 }, (_u, t) => replies.push(t));
    chat.submit({ userId: 'x', user: 'Xis', text: '!entrar' });
    chat.process();
    expect(w.waitlist.map((q) => q.userId)).toEqual(['x']);
    expect(replies.at(-1)).toContain('posição 1');
    chat.submit({ userId: 'x', user: 'Xis', text: '!fila' });
    chat.process();
    expect(w.waitlist.length).toBe(0);
  });

  it('desligada, recusa como antes; é chamada na ordem quando abre vaga', () => {
    const w = new World(5);
    fill(w);
    w.waitlistOn = false;
    expect(w.enqueue('a', 'A', '#fff').ok).toBe(false);
    w.waitlistOn = true;
    w.enqueue('a', 'A', '#fff'); w.enqueue('b', 'B', '#fff');
    w.removeVillager('u0');
    run(w, 40);
    expect(w.findVillager('a')).toBeTruthy();
    expect(w.findVillager('b')).toBeUndefined();
    expect(w.waitlist.map((q) => q.userId)).toEqual(['b']);
  });

  it('a fila leva os aldeões a construir casas e o save guarda a fila', () => {
    const w = new World(5);
    fill(w);
    w.stock.wood = 300; w.stock.stone = 100; w.stock.food = 300; w.stock.water = 300;
    for (let i = 0; i < 8; i++) w.enqueue(`q${i}`, `Q${i}`, '#fff');
    run(w, AUTONOMY_EVERY * 3);
    expect(w.buildings.some((b) => b.kind === 'house')).toBe(true);
    const r = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(r.waitlist.length).toBe(w.waitlist.length);
    expect(r.waitlistOn).toBe(true);
  });
});
