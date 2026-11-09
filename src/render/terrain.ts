import { GRID_H, GRID_W } from '../sim/config';
import type { World } from '../sim/world';

/** Altura de um degrau do terreno, em tiles (o tile tem 1 de lado). */
export const HS = 0.5;

const N = GRID_W * GRID_H;

type RGB = [number, number, number];
// o Three.js trata cor de vértice como linear: converte do sRGB da paleta, senão tudo sai lavado
const lin = (v: number): number => Math.pow(v / 255, 2.2);
const hex = (h: string): RGB => [lin(parseInt(h.slice(1, 3), 16)), lin(parseInt(h.slice(3, 5), 16)), lin(parseInt(h.slice(5, 7), 16))];
// matiz por bioma (campo, floresta, terra pedregosa)
const TINT: RGB[] = [[1, 1, 1], [0.82, 0.93, 0.8], [1.08, 0.97, 0.88]];
const GRASS = hex('#76c957'), DRY = hex('#c9b360'), STONE = hex('#adb5bd'), SOIL = hex('#8f5f33');

export interface TerrainData {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  /** as N primeiras quadras (4 vértices cada) são os topos dos tiles, na ordem dos tiles */
  topCount: number;
}

/**
 * Terreno em baixo polígono: um topo plano por tile mais paredes onde o vizinho é mais baixo.
 * Coordenadas: X = x do tile, Y = altura, Z = y do tile.
 */
export function buildTerrain(w: World): TerrainData {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i < N; i++) {
    const x = i % GRID_W, z = (i - x) / GRID_W;
    const h = w.height[i] * HS;
    pos.push(x, h, z, x + 1, h, z, x + 1, h, z + 1, x, h, z + 1);
    for (let k = 0; k < 4; k++) col.push(0, 0, 0);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2); // voltado para cima
  }

  // paredes: cada lado do tile, quando o vizinho (ou a borda do mapa) é mais baixo
  const sides: { dx: number; dz: number; ax: number; az: number; bx: number; bz: number }[] = [
    { dx: 1, dz: 0, ax: 1, az: 0, bx: 1, bz: 1 },
    { dx: -1, dz: 0, ax: 0, az: 1, bx: 0, bz: 0 },
    { dx: 0, dz: 1, ax: 1, az: 1, bx: 0, bz: 1 },
    { dx: 0, dz: -1, ax: 0, az: 0, bx: 1, bz: 0 },
  ];
  for (let i = 0; i < N; i++) {
    const x = i % GRID_W, z = (i - x) / GRID_W;
    const h = w.height[i] * HS;
    for (const s of sides) {
      const nx = x + s.dx, nz = z + s.dz;
      const inside = nx >= 0 && nz >= 0 && nx < GRID_W && nz < GRID_H;
      const hn = inside ? w.height[nz * GRID_W + nx] * HS : 0;
      if (hn >= h) continue;
      const base = pos.length / 3;
      pos.push(x + s.ax, h, z + s.az, x + s.bx, h, z + s.bz, x + s.bx, hn, z + s.bz, x + s.ax, hn, z + s.az);
      for (let k = 0; k < 4; k++) col.push(...SOIL);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { positions: new Float32Array(pos), colors: new Float32Array(col), indices: new Uint32Array(idx), topCount: N };
}

/** Pinta o topo de cada tile conforme umidade, altura e represa. */
export function paintTops(w: World, colors: Float32Array): void {
  for (let i = 0; i < N; i++) {
    let c: RGB;
    if (w.dam[i]) c = STONE;
    else {
      const t = 0.4 + 0.6 * w.moisture[i];
      const lift = 1 + (w.height[i] - 3) * 0.03;
      const tint = TINT[w.biome[i]] ?? TINT[0];
      c = [
        (DRY[0] + (GRASS[0] - DRY[0]) * t) * lift * tint[0],
        (DRY[1] + (GRASS[1] - DRY[1]) * t) * lift * tint[1],
        (DRY[2] + (GRASS[2] - DRY[2]) * t) * lift * tint[2],
      ];
    }
    for (let k = 0; k < 4; k++) {
      const o = (i * 4 + k) * 3;
      colors[o] = c[0]; colors[o + 1] = c[1]; colors[o + 2] = c[2];
    }
  }
}

/** Índices fixos das quadras de água (uma por tile possível). */
export function waterIndices(): Uint32Array {
  const idx = new Uint32Array(N * 6);
  for (let q = 0; q < N; q++) {
    const b = q * 4;
    idx.set([b, b + 2, b + 1, b, b + 3, b + 2], q * 6);
  }
  return idx;
}

/** Preenche as quadras de água dos tiles molhados (compactadas no início); devolve quantas. */
export function fillWater(w: World, positions: Float32Array, time: number): number {
  let q = 0;
  for (let i = 0; i < N; i++) {
    const d = w.water[i];
    if (d < 0.04) continue;
    const x = i % GRID_W, z = (i - x) / GRID_W;
    const y = (w.height[i] + Math.min(d, 2.5)) * HS + Math.sin(time * 1.6 + x * 0.8 + z * 0.6) * 0.015;
    const o = q * 12;
    const m = 0.012; // quadras vizinhas se sobrepõem um fio, para não aparecer risco entre elas
    positions[o] = x - m; positions[o + 1] = y; positions[o + 2] = z - m;
    positions[o + 3] = x + 1 + m; positions[o + 4] = y; positions[o + 5] = z - m;
    positions[o + 6] = x + 1 + m; positions[o + 7] = y; positions[o + 8] = z + 1 + m;
    positions[o + 9] = x - m; positions[o + 10] = y; positions[o + 11] = z + 1 + m;
    q++;
  }
  return q;
}
