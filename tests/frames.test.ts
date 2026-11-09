import { describe, expect, it } from 'vitest';
import { makeLight, OverlayMirror, packKeyframe, unpackKeyframe } from '../src/cloud/frames';
import { World } from '../src/sim/world';

function busyWorld(): World {
  const w = new World(11);
  for (let i = 0; i < 8; i++) w.addVillager(`u${i}`, `Aldeao${i}`, '#abcdef');
  w.requestBuild('house', 20, 14);
  w.requestBuild('farm', 24, 16);
  for (let i = 0; i < 400; i++) w.step();
  return w;
}

describe('quadros do overlay', () => {
  it('keyframe: ida e volta mantém a vila e cabe no limite de mensagem', async () => {
    const a = busyWorld();
    const packed = await packKeyframe(a);
    expect(packed.length).toBeLessThan(120_000); // limite do Realtime gratuito: 250 KB
    const save = await unpackKeyframe(packed);
    const m = OverlayMirror.fromKeyframe(save);
    expect(m.world!.villagers.length).toBe(a.villagers.length);
    expect(m.world!.buildings.length).toBe(a.buildings.length);
    expect(m.world!.nodes.length).toBe(a.nodes.length);
    expect(m.world!.tick).toBe(a.tick);
    expect(Array.from(m.world!.height)).toEqual(Array.from(a.height));
  });

  it('quadro leve (com água) atualiza aldeões, obras e água; quadro leve cabe em poucos KB', async () => {
    const a = busyWorld();
    const m = OverlayMirror.fromKeyframe(await unpackKeyframe(await packKeyframe(a)));
    for (let i = 0; i < 100; i++) a.step();
    const f = makeLight(a, true);
    expect(JSON.stringify(f).length).toBeLessThan(12_000);
    m.applyLight(f);
    expect(m.world!.tick).toBe(a.tick);
    expect(m.world!.buildings.map((b) => [b.id, b.progress, b.done])).toEqual(a.buildings.map((b) => [b.id, Math.round(b.progress * 100) / 100, b.done]));
    for (let i = 0; i < 1632; i += 97) expect(Math.abs(m.world!.water[i] - a.water[i])).toBeLessThanOrEqual(1 / 64 + 1e-6);
    // aldeões vão direto para a posição recebida (quem suaviza é o visual 3D)
    const v0 = a.villagers[0];
    const mv = m.world!.villagers.find((v) => v.id === v0.id)!;
    expect(Math.abs(mv.x - v0.x) + Math.abs(mv.y - v0.y)).toBeLessThan(0.02);
  });

  it('quadro leve sem água não mexe nos prédios', async () => {
    const a = busyWorld();
    const m = OverlayMirror.fromKeyframe(await unpackKeyframe(await packKeyframe(a)));
    const f = makeLight(a, false);
    expect(f.b).toBeUndefined();
    const before = m.world!.buildings;
    m.applyLight(f);
    expect(m.world!.buildings).toBe(before);
  });

  it('quadro leve leva câmera, opções e apoio; sem extras não leva nada além do básico', async () => {
    const a = busyWorld();
    a.support();
    const m = OverlayMirror.fromKeyframe(await unpackKeyframe(await packKeyframe(a)));
    m.applyLight(makeLight(a, false, { c: [0.7853981, 0.9, 30, 23, 2, 16], o: { names: false, hud: true } }));
    expect(m.camera).toEqual([0.785, 0.9, 30, 23, 2, 16]);
    expect(m.options).toEqual({ names: false, hud: true });
    expect(m.world!.supportActive).toBe(true);
    const bare = makeLight(a, false);
    expect(bare.c).toBeUndefined();
    expect(bare.o).toBeUndefined();
  });

  it('aldeão novo só aparece no próximo keyframe, e quem saiu some', async () => {
    const a = busyWorld();
    const m = OverlayMirror.fromKeyframe(await unpackKeyframe(await packKeyframe(a)));
    a.addVillager('novo', 'Novo', '#fff');
    a.removeVillager('u0');
    m.applyLight(makeLight(a, false));
    expect(m.world!.villagers.length).toBe(a.villagers.length - 1);
    m.applyKeyframe(await unpackKeyframe(await packKeyframe(a)));
    expect(m.world!.villagers.length).toBe(a.villagers.length);
  });
});
