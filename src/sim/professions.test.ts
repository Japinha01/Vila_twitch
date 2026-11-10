import { describe, expect, it } from 'vitest';
import { World } from './world';

function village(): World {
  const w = new World(7);
  for (let i = 0; i < 6; i++) w.addVillager(`u${i}`, `Viewer${i}`, '#fff');
  return w;
}

describe('profissões, líderes e donos', () => {
  it('a profissão vem de onde o viewer mais trabalhou e o pioneiro vira líder', () => {
    const w = village();
    for (let t = 0; t < 12000; t++) w.step();
    const profs = new Set(w.villagers.map((v) => w.professionOf(v)));
    expect(profs.size).toBeGreaterThan(0);
    for (const [job, id] of Object.entries(w.leaders)) {
      const v = w.findVillager(id!)!;
      expect(v).toBeDefined();
      expect(w.professionOf(v)).toBe(job);
    }
  });

  it('estabelecimentos prontos têm dono presente na vila e nome "tipo de viewer"', () => {
    const w = village();
    for (let t = 0; t < 12000; t++) w.step();
    const owned = w.buildings.filter((b) => b.done && b.owner);
    expect(owned.length).toBeGreaterThan(0);
    for (const b of owned) {
      expect(w.findVillager(b.owner!)).toBeDefined();
      expect(w.establishmentName(b)).toContain(w.ownerOf(b)!.name);
    }
  });

  it('é determinístico e sobrevive ao salvar e carregar', () => {
    const a = village(); const b = village();
    for (let t = 0; t < 3000; t++) { a.step(); b.step(); }
    expect(a.leaders).toEqual(b.leaders);
    const c = World.fromSave(JSON.parse(JSON.stringify(a.serialize())));
    expect(c.leaders).toEqual(a.leaders);
  });
});
