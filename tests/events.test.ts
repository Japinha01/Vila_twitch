import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { EVENTS, pickEvent } from '../src/sim/events';
import { ACHIEVEMENTS } from '../src/sim/achievements';
import { TICKS_PER_DAY } from '../src/sim/config';

function run(seed: number, days: number): { kinds: string[]; log: string[] } {
  const w = new World(seed);
  w.npcsOn = false;
  for (let i = 0; i < 12; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
  const kinds: string[] = [];
  const log: string[] = [];
  for (let t = 0; t < days * TICKS_PER_DAY; t++) {
    w.step();
    if (w.event && kinds[kinds.length - 1] !== `${w.event.until}`) kinds.push(`${w.event.until}`);
    log.push(...w.drainEvents());
  }
  return { kinds, log };
}

describe('eventos locais', () => {
  it('são determinísticos pela seed', () => {
    expect(run(7, 25)).toEqual(run(7, 25));
  });
  it('acontecem ao longo dos dias e terminam', () => {
    const { kinds, log } = run(3, 40);
    expect(kinds.length).toBeGreaterThan(0);
    expect(log.some((l) => l.includes('terminou'))).toBe(true);
  });
  it('o sorteio respeita a população mínima', () => {
    for (let r = 0; r < 1; r += 0.05) expect(['harvest', 'storm']).toContain(pickEvent(r, 0) ?? 'harvest');
    expect(EVENTS.plague.minPop).toBeGreaterThan(0);
  });
  it('salva e carrega o evento ativo e as conquistas', () => {
    const w = new World(5);
    w.event = { kind: 'harvest', until: 999 };
    w.achievements = ['pop10'];
    const w2 = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(w2.event).toEqual({ kind: 'harvest', until: 999 });
    expect(w2.achievements).toEqual(['pop10']);
  });
});

describe('conquistas', () => {
  it('ids são únicos e a de população dispara com o aviso', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const w = new World(2);
    w.npcsOn = false;
    for (let i = 0; i < 10; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    for (let t = 0; t < 60; t++) w.step();
    expect(w.achievements).toContain('pop10');
    expect(w.drainEvents().some((l) => l.startsWith('🏆'))).toBe(true);
  });
});
