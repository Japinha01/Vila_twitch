import { describe, expect, it } from 'vitest';
import { fromProfileRows, toProfileRows } from '../src/cloud/rows';
import { World } from '../src/sim/world';

describe('perfis na nuvem', () => {
  it('só grava IDs numéricos da Twitch e limpa o XP', () => {
    const m = new Map([
      ['123', { name: 'Ana', xp: 12.7, job: 'wood' as const }],
      ['viewer1', { name: 'Sim', xp: 5, job: 'stone' as const }],
      ['9', { name: 'Neg', xp: -4, job: 'food' as const }],
    ]);
    expect(toProfileRows('dono', m)).toEqual([
      { owner: 'dono', twitch_id: '123', name: 'Ana', xp: 12, job: 'wood', coins: 0 },
      { owner: 'dono', twitch_id: '9', name: 'Neg', xp: 0, job: 'food', coins: 0 },
    ]);
  });

  it('descarta linhas inválidas ao ler', () => {
    const p = fromProfileRows([
      { twitch_id: '1', name: 'Ok', xp: 10, job: 'water' },
      { twitch_id: '2', name: 'Mau', xp: 'x', job: 'water' },
      { twitch_id: '3', name: 'Mau', xp: 1, job: 'hacker' },
      null,
    ]);
    expect([...p.keys()]).toEqual(['1']);
    expect(fromProfileRows('lixo').size).toBe(0);
  });

  it('refiltra o nome vindo da nuvem', () => {
    const p = fromProfileRows([{ twitch_id: '1', name: '   ', xp: 1, job: 'wood' }]);
    expect(p.get('1')!.name.trim().length).toBeGreaterThan(0);
  });
});

describe('perfis no mundo', () => {
  it('quem volta numa vila nova mantém XP e função', () => {
    const w = new World(7);
    w.profiles.set('55', { name: 'Bia', xp: 40, job: 'stone' });
    const r = w.addVillager('55', 'Bia', '#fff');
    expect(r.ok && r.villager.xp).toBe(40);
    expect(r.ok && r.villager.job).toBe('stone');
  });

  it('collectProfiles junta nuvem e aldeões atuais, mantendo o maior XP', () => {
    const w = new World(7);
    w.profiles.set('1', { name: 'A', xp: 100, job: 'wood' });
    w.profiles.set('2', { name: 'B', xp: 5, job: 'wood' });
    const a = w.addVillager('1', 'A', '#fff');
    const b = w.addVillager('2', 'B', '#fff');
    if (a.ok) a.villager.xp = 30;
    if (b.ok) b.villager.xp = 50;
    const c = w.collectProfiles();
    expect(c.get('1')!.xp).toBe(100);
    expect(c.get('2')!.xp).toBe(50);
  });

  it('sem perfil, o comportamento é o de antes', () => {
    const w = new World(7);
    const r = w.addVillager('9', 'Novo', '#fff');
    expect(r.ok && r.villager.xp).toBe(0);
  });
});
