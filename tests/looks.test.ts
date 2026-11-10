import { describe, expect, it } from 'vitest';
import { applyLook, sanitizeLook, unlockedFor } from '../src/sim/looks';
import { World } from '../src/sim/world';
import { CommandProcessor } from '../src/chat/commands';
import { fromProfileRows, toProfileRows } from '../src/cloud/rows';

describe('visual do viewer (M6)', () => {
  it('cor, cabelo e pele são livres; chapéu e moldura exigem XP', () => {
    expect(applyLook({}, 'cor', 'Azul', 0)).toMatchObject({ ok: true, look: { shirt: 6 } });
    expect(applyLook({}, 'pele', 'ébano', 0)).toMatchObject({ ok: true, look: { skin: 5 } });
    expect(applyLook({}, 'chapeu', 'palha', 10)).toEqual({ ok: false, reason: 'locked', need: 140 });
    expect(applyLook({}, 'chapeu', 'chapéu de palha', 150)).toMatchObject({ ok: true, look: { hat: 'palha' } });
    expect(applyLook({ hat: 'bone' }, 'chapeu', 'nenhum', 0)).toEqual({ ok: true, look: {} });
    expect(applyLook({}, 'cor', 'xyz', 0)).toMatchObject({ ok: false, reason: 'unknown' });
    expect(unlockedFor(500).hats).toHaveLength(3);
  });
  it('descarta visual inválido vindo de fora', () => {
    expect(sanitizeLook({ skin: 99, hat: 'x', frame: 'ouro', shirt: 2 })).toEqual({ shirt: 2, frame: 'ouro' });
    expect(sanitizeLook('x')).toBeUndefined();
    expect(sanitizeLook({ skin: -1 })).toBeUndefined();
  });
  it('!chapeu/!cor pelo chat, guarda no perfil e volta ao reentrar', () => {
    const w = new World(3);
    w.npcsOn = false;
    const r = w.addVillager('55', 'Ana', '#fff');
    if (!r.ok) throw new Error();
    r.villager.xp = 160;
    const out: string[] = [];
    let t = 0;
    const cp = new CommandProcessor(w, { now: () => (t += 20000) });
    cp.onReply = (_to, text) => out.push(text);
    for (const text of ['!cor verde', '!chapeu palha', '!chapeu mago', '!moldura ouro', '!chapeu']) cp.submit({ userId: '55', user: 'Ana', text });
    cp.process();
    expect(out[0]).toContain('atualizado');
    expect(out[1]).toContain('atualizado');
    expect(out[2]).toContain('bloqueado');
    expect(out[3]).toContain('bloqueado');
    expect(out[4]).toContain('Opções');
    expect(w.findVillager('55')!.look).toEqual({ shirt: 3, hat: 'palha' });
    const profiles = w.collectProfiles();
    expect(profiles.get('55')!.look).toEqual({ shirt: 3, hat: 'palha' });
    const back = fromProfileRows(toProfileRows('o', profiles).map((x) => ({ ...x })));
    expect(back.get('55')!.look).toEqual({ shirt: 3, hat: 'palha' });
    w.profiles = profiles;
    w.removeVillager('55');
    const again = w.addVillager('55', 'Ana', '#fff');
    expect(again.ok && again.villager.look).toEqual({ shirt: 3, hat: 'palha' });
  });
  it('o visual sobrevive ao salvar e carregar', () => {
    const w = new World(3);
    const r = w.addVillager('9', 'Bia', '#fff');
    if (r.ok) r.villager.look = { hair: 7 };
    const w2 = World.fromSave(JSON.parse(JSON.stringify(w.serialize())));
    expect(w2.findVillager('9')!.look).toEqual({ hair: 7 });
  });
});

import { twitchIdOf, visibleLook } from '../src/sim/looks';
describe('visual global (página ?conta)', () => {
  it('chapéu e moldura só aparecem com o XP daquela vila', () => {
    const l = { shirt: 1, hat: 'cartola' as const, frame: 'ouro' as const };
    expect(visibleLook(l, 0)).toEqual({ shirt: 1 });
    expect(visibleLook(l, 400)).toEqual({ shirt: 1, hat: 'cartola' });
    expect(visibleLook(l, 5000)).toBe(l);
    expect(visibleLook(undefined, 10)).toBeUndefined();
  });
  it('lê o ID da Twitch só da identidade de login e só se for numérico', () => {
    expect(twitchIdOf({ identities: [{ provider: 'github', id: '9' }, { provider: 'twitch', id: '12345' }] })).toBe('12345');
    expect(twitchIdOf({ identities: [], user_metadata: { provider_id: '777' } })).toBe('777');
    expect(twitchIdOf({ identities: [{ provider: 'twitch', id: 'abc' }] })).toBeNull();
    expect(twitchIdOf(null)).toBeNull();
  });
});
