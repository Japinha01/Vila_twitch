import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_KEYS, clearModels, commitModels, glbBuilding, glbTree, modelsVersion, registerModel, tintPart } from '../src/render/glb';
import { makeBuilding } from '../src/render/models';

const part = (name: string, matName = 'm'): Mesh => {
  const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#ff0000', name: matName }));
  m.name = name;
  return m;
};
const scene = (...parts: Mesh[]): Group => { const g = new Group(); g.add(...parts); return g; };

afterEach(() => clearModels());

describe('modelos .glb', () => {
  it('sem modelo registrado, usa o modelo em código', () => {
    expect(glbBuilding('house', '0')).toBeNull();
    expect(makeBuilding('house', 0).userData.glb).toBeUndefined();
  });

  it('recusa nome desconhecido e aceita os nomes da convenção', () => {
    expect(registerModel('castelo', scene(part('a')))).toBe(false);
    for (const k of ['house_0', 'house_6', 'townhall_fogueira', 'market_2', 'waterwheel_3', 'farm', 'bridge', 'tree_birch', 'house']) expect(MODEL_KEYS.has(k)).toBe(true);
  });

  it('a etapa própria ganha do genérico, e o genérico cobre as outras etapas', () => {
    registerModel('house', scene(part('generica')));
    registerModel('house_2', scene(part('enxaimel')));
    expect(glbBuilding('house', '2')!.getObjectByName('enxaimel')).toBeTruthy();
    expect(glbBuilding('house', '5')!.getObjectByName('generica')).toBeTruthy();
    expect(makeBuilding('house', 2).userData.glb).toBe(true);
    expect(makeBuilding('farm').userData.glb).toBeUndefined();
  });

  it('troca o material PBR por Lambert e mantém os que não são PBR', () => {
    const unlit = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    registerModel('sawmill', scene(part('corpo'), unlit));
    const g = glbBuilding('sawmill', '')!;
    const mats = (g.children[0].children as Mesh[]).map((m) => m.material);
    expect(mats[0]).toBeInstanceOf(MeshLambertMaterial);
    expect((mats[0] as MeshLambertMaterial).color.getHexString()).toBe('ff0000');
    expect(mats[1]).toBeInstanceOf(MeshBasicMaterial);
  });

  it('junta a roda num grupo que gira em volta do próprio eixo', () => {
    const wheel = part('Roda.001');
    wheel.position.set(0.8, 0.6, 0);
    registerModel('waterwheel_0', scene(part('casa'), wheel, part('Roda_pa.002')));
    const a = glbBuilding('waterwheel', '0')!, b = glbBuilding('waterwheel', '0')!;
    const wa = a.userData.wheel as Group, wb = b.userData.wheel as Group;
    expect(wa.name).toBe('vila_wheel');
    expect(wa).not.toBe(wb);
    expect(wa.rotation.x).toBeCloseTo(0);
    expect(wa.position.x).toBeCloseTo(0.8);
    expect(wa.position.y).toBeCloseTo(0.6);
    expect(wa.children).toHaveLength(2);
    expect(wa.children[0].position.length()).toBeCloseTo(0);
  });

  it('pinta a plantação seca e devolve o material original', () => {
    registerModel('farm', scene(part('base'), part('plantio')));
    const g = glbBuilding('farm', '')!;
    const rows = g.userData.rows as Group; // grupo com as peças da plantação
    const crop = rows.children[0] as Mesh;
    const original = crop.material;
    tintPart(rows, '#d6c58a');
    expect((crop.material as MeshLambertMaterial).color.getHexString()).toBe('d6c58a');
    expect(crop.material).not.toBe(original);
    tintPart(rows, null);
    expect(crop.material).toBe(original);
    expect(g.userData.water).toBeUndefined();
  });

  it('marca a folhagem da árvore pelo nome do objeto ou do material', () => {
    registerModel('tree_oak', scene(part('tronco'), part('copa'), part('esfera', 'folha_carvalho')));
    const flags: boolean[] = [];
    glbTree(1)!.traverse((o) => { if ((o as Mesh).isMesh) flags.push(o.userData.leaf === true); });
    expect(flags).toEqual([false, true, true]);
    expect(glbTree(0)).toBeNull();
  });

  it('avisa a cena quando uma leva de modelos chega', () => {
    const v = modelsVersion();
    commitModels();
    expect(modelsVersion()).toBe(v + 1);
  });
});
