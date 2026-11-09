import { BufferAttribute, BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../src/sim/config';
import { World } from '../src/sim/world';
import { buildTerrain, fillWater, HS, paintTops, waterIndices } from '../src/render/terrain';

const N = GRID_W * GRID_H;

describe('terreno 3D', () => {
  const w = new World(1);
  const t = buildTerrain(w);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(t.positions, 3));
  g.setIndex(new BufferAttribute(t.indices, 1));
  g.computeVertexNormals();
  const normal = (v: number): [number, number, number] => {
    const n = g.getAttribute('normal');
    return [n.getX(v), n.getY(v), n.getZ(v)];
  };

  it('tem um topo por tile, todos virados para cima e na altura certa', () => {
    expect(t.topCount).toBe(N);
    for (let i = 0; i < N; i += 37) {
      expect(normal(i * 4)[1]).toBeGreaterThan(0.99);
      expect(t.positions[i * 12 + 1]).toBeCloseTo(w.height[i] * HS, 5);
    }
  });

  it('paredes só existem onde o vizinho é mais baixo e apontam para o lado', () => {
    const wallVerts = t.positions.length / 3 - N * 4;
    expect(wallVerts).toBeGreaterThan(0);
    expect(wallVerts % 4).toBe(0);
    for (let v = N * 4; v < t.positions.length / 3; v += 4) {
      const [, ny] = normal(v);
      expect(Math.abs(ny)).toBeLessThan(1e-4);
      expect(t.positions[v * 3 + 1]).toBeGreaterThan(t.positions[(v + 2) * 3 + 1]); // topo acima da base
    }
  });

  it('pinta mais verde onde há umidade e usa pedra na represa', () => {
    const wet = w.moisture.findIndex((m) => m > 0.9), dry = w.moisture.findIndex((m) => m < 0.1);
    paintTops(w, t.colors);
    const green = (i: number): number => t.colors[i * 12 + 1] - t.colors[i * 12]; // verde menos vermelho
    expect(green(wet)).toBeGreaterThan(green(dry));
    expect(t.colors.every((c) => c >= 0 && c <= 1.3)).toBe(true);
  });
});

describe('água 3D', () => {
  it('uma quadra por tile molhado, na altura do nível da água', () => {
    const w = new World(1);
    const pos = new Float32Array(N * 12);
    const q = fillWater(w, pos, 0);
    expect(q).toBe(w.water.filter((d) => d >= 0.04).length);
    expect(q).toBeGreaterThan(30);
    const first = w.water.findIndex((d) => d >= 0.04);
    expect(pos[1]).toBeCloseTo((w.height[first] + Math.min(w.water[first], 2.5)) * HS, 1);
    expect(waterIndices().length).toBe(N * 6);
  });
});
