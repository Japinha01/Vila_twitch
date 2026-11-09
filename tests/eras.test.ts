import { describe, expect, it } from 'vitest';
import { makeLight, OverlayMirror, packKeyframe, unpackKeyframe } from '../src/cloud/frames';
import { ERAS, goalsMet, nextEraSummary } from '../src/sim/eras';
import { World } from '../src/sim/world';

const run = (w: World, n: number): void => { for (let i = 0; i < n; i++) w.step(); };
const priv = (w: World) => w as unknown as {
  findSite(k: string): { x: number; y: number } | null;
  placeBuilding(k: string, x: number, y: number, ww: number, h: number, work: number, done: boolean): unknown;
};
function addDone(w: World, kind: 'house' | 'farm' | 'well' | 'warehouse'): void {
  const site = priv(w).findSite(kind);
  if (!site) throw new Error(`sem lugar para ${kind}`);
  priv(w).placeBuilding(kind, site.x, site.y, 2, 2, 100, true);
}

describe('eras', () => {
  it('a vila começa na Era da Pedra e a próxima meta aparece no resumo', () => {
    const w = new World(5);
    expect(w.era).toBe(0);
    expect(ERAS[0].name).toBe('Era da Pedra');
    expect(nextEraSummary(0, w.eraSnapshot())).toContain('Era do Bronze');
    expect(goalsMet(1, w.eraSnapshot())).toBe(false);
  });

  it('cumpridas as metas, sobe sozinha de era e avisa', () => {
    const w = new World(5);
    w.autonomy = false;
    for (let i = 0; i < 8; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    addDone(w, 'house'); addDone(w, 'farm'); addDone(w, 'well');
    run(w, 50);
    expect(w.era).toBe(1);
    expect(w.drainEvents().some((e) => e.includes('Era do Bronze'))).toBe(true);
  });

  it('não sobe sem as metas e nunca passa da última era', () => {
    const w = new World(5);
    w.autonomy = false;
    for (let i = 0; i < 7; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    addDone(w, 'house'); addDone(w, 'farm'); addDone(w, 'well');
    run(w, 100);
    expect(w.era).toBe(0);
    w.era = ERAS.length - 1;
    run(w, 100);
    expect(w.era).toBe(ERAS.length - 1);
  });

  it('a era vai no save e no overlay (keyframe e quadro leve)', async () => {
    const w = new World(5);
    w.era = 2;
    expect(World.fromSave(JSON.parse(JSON.stringify(w.serialize()))).era).toBe(2);
    const mirror = OverlayMirror.fromKeyframe(await unpackKeyframe(await packKeyframe(w)));
    expect(mirror.world!.era).toBe(2);
    w.era = 3;
    mirror.applyLight(makeLight(w, false));
    expect(mirror.world!.era).toBe(3);
  });

  it('uma vila autônoma sobe de era sozinha numa simulação longa', () => {
    const w = new World(3);
    for (let i = 0; i < 6; i++) w.addVillager(`u${i}`, `V${i}`, '#fff');
    for (let t = 1; t <= 9000; t++) { if (t % 600 === 0) for (let k = 0; k < 3; k++) w.addVillager(`n${t}${k}`, `N${t}${k}`, '#fff'); w.step(); }
    expect(w.era).toBeGreaterThanOrEqual(2);
  });
});
