import { describe, expect, it } from 'vitest';
import { parseSeed } from '../src/sim/seed';
import { World } from '../src/sim/world';

describe('seed do mapa', () => {
  it('aceita número, texto e vazio', () => {
    expect(parseSeed('12345')).toBe(12345);
    expect(parseSeed('  0042 ')).toBe(42);
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('   ')).toBeNull();
    const t = parseSeed('Vila do Japa');
    expect(typeof t).toBe('number');
    expect(parseSeed('vila do japa')).toBe(t); // ignora maiúsculas
    expect(parseSeed('outra')).not.toBe(t);
  });
  it('texto gigante ou número enorme viram seed válida', () => {
    expect(parseSeed('9'.repeat(30))).toBeGreaterThanOrEqual(0);
    expect(parseSeed('99999999999')).toBeGreaterThanOrEqual(0);
  });
  it('mesma seed, mesmo mapa', () => {
    const a = new World(parseSeed('minha-vila')!), b = new World(parseSeed('minha-vila')!), c = new World(parseSeed('outra-vila')!);
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
    expect(a.nodes.map((n) => [n.kind, n.x, n.y])).toEqual(b.nodes.map((n) => [n.kind, n.x, n.y]));
    expect(a.nodes.map((n) => [n.x, n.y])).not.toEqual(c.nodes.map((n) => [n.x, n.y]));
  });
});
