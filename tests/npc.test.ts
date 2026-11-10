import { describe, expect, it } from 'vitest';
import { NPC_MIN } from '../src/sim/config';
import { World } from '../src/sim/world';

describe('moradores NPC', () => {
  it('chegam se preciso, só até NPC_MIN sem viewers, e viram população', () => {
    const w = new World(5);
    w.stock = { wood: 400, stone: 200, food: 200, water: 200 };
    w.addVillager('u1', 'Ana', '#fff');
    for (let t = 0; t < 9000; t++) w.step();
    expect(w.npcCount).toBeGreaterThan(0);
    expect(w.npcCount).toBeLessThanOrEqual(Math.max(NPC_MIN, 1));
    expect(w.villagers.length).toBe(1 + w.villagers.filter((v) => v.npc).length); // NPCs adultos e crianças
  });

  it('viewer tem prioridade: com a vila cheia, um NPC sai para dar a vaga', () => {
    const w = new World(5);
    w.addVillager('u1', 'Ana', '#fff');
    while (w.villagers.length < w.popCap) { const r = w.addVillager(`n${w.villagers.length}`, 'N', '#fff'); if (!r.ok) break; r.villager.npc = true; }
    expect(w.villagers.length).toBe(w.popCap);
    const r = w.addVillager('novo', 'Novo', '#fff');
    expect(r.ok).toBe(true);
    expect(w.findVillager('novo')).toBeDefined();
    expect(w.villagers.length).toBe(w.popCap);
    expect(w.npcCount).toBe(w.popCap - 2);
  });

  it('NPC não lidera profissão nem é dono de estabelecimento, e é determinístico', () => {
    const a = new World(5), b = new World(5);
    for (const w of [a, b]) { w.stock = { wood: 400, stone: 200, food: 200, water: 200 }; w.addVillager('u1', 'Ana', '#fff'); for (let t = 0; t < 6000; t++) w.step(); }
    for (const id of Object.values(a.leaders)) expect(a.findVillager(id!)!.npc).toBeFalsy();
    for (const bd of a.buildings) if (bd.owner) expect(a.findVillager(bd.owner)!.npc).toBeFalsy();
    expect(a.villagers.length).toBe(b.villagers.length);
  });
});
