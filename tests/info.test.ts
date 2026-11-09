import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../src/sim/config';
import { World } from '../src/sim/world';
import { describeTile } from '../src/ui/info';

describe('dicas do mapa', () => {
  it('descreve a prefeitura, o solo e a água', () => {
    const w = new World(1);
    const h = w.townHall();
    expect(describeTile(w, h.x, h.y).join('\n')).toContain('Prefeitura');
    let wet: [number, number] | null = null;
    for (let y = 0; y < GRID_H && !wet; y++) for (let x = 0; x < GRID_W && !wet; x++) if (w.water[w.idx(x, y)] > 0.3) wet = [x, y];
    expect(describeTile(w, wet![0], wet![1]).join('\n')).toContain('Água');
    expect(describeTile(w, 1, 1).join('\n')).toMatch(/Solo (irrigado|seco)/);
  });

  it('descreve árvore, muda e obra com progresso e prioridade', () => {
    const w = new World(1);
    const tree = w.nodes.find((n) => n.kind === 'tree')!;
    expect(describeTile(w, tree.x, tree.y).join('\n')).toContain('Árvore');
    tree.amount = 2;
    expect(describeTile(w, tree.x, tree.y).join('\n')).toContain('Muda');
    w.stock = { wood: 999, stone: 999, food: 0, water: 0 };
    let s: { x: number; y: number } | null = null;
    for (let y = 0; y < GRID_H && !s; y++) for (let x = 0; x < GRID_W && !s; x++) if (w.canPlace('house', x, y).ok) s = { x, y };
    const r = w.requestBuild('house', s!.x, s!.y);
    if (!r.ok) throw new Error('obra');
    r.building.progress = r.building.workNeeded / 2;
    w.togglePriority(r.building.id);
    const txt = describeTile(w, s!.x, s!.y).join('\n');
    expect(txt).toContain('em obras 50%');
    expect(txt).toContain('prioridade');
  });

  it('mostra aldeões no tile e avisa quando a fazenda não tem irrigação', () => {
    const w = new World(1);
    w.addVillager('a', 'Ana', '#fff');
    const v = w.villagers[0];
    expect(describeTile(w, Math.floor(v.x), Math.floor(v.y)).join('\n')).toContain('Ana');
    w.stock = { wood: 999, stone: 999, food: 0, water: 0 };
    let s: { x: number; y: number } | null = null;
    for (let y = 0; y < GRID_H && !s; y++) for (let x = 0; x < GRID_W && !s; x++) if (w.canPlace('farm', x, y).ok) s = { x, y };
    const r = w.requestBuild('farm', s!.x, s!.y);
    if (!r.ok) throw new Error('fazenda');
    r.building.done = true;
    w.irrigated.fill(0); // seca total
    const txt = describeTile(w, s!.x, s!.y).join('\n');
    expect(txt).toContain('Sem irrigação');
    expect(txt).toContain('Trabalhadores 0/3');
  });
});

describe('remover aldeão', () => {
  it('remove e permite voltar com !entrar', () => {
    const w = new World(1);
    w.addVillager('a', 'A', '#fff');
    expect(w.removeVillager('a')).toBe(true);
    expect(w.removeVillager('a')).toBe(false);
    expect(w.villagers.length).toBe(0);
    expect(w.addVillager('a', 'A', '#fff').ok).toBe(true);
  });
});
