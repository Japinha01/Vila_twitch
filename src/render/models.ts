import {
  BoxGeometry, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial,
  type BufferGeometry, type Material,
} from 'three';
import type { BuildingKind } from '../sim/types';

/** Modelos low poly gerados por código. Origem no chão, centro da base em (0, 0, 0). Unidade = 1 tile. */

const matCache = new Map<string, MeshLambertMaterial>();
export const mat = (hex: string): MeshLambertMaterial => {
  let m = matCache.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex, flatShading: true }); matCache.set(hex, m); }
  return m;
};

const geoCache = new Map<string, BufferGeometry>();
const geo = (key: string, make: () => BufferGeometry): BufferGeometry => {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
};

const BOX = (): BufferGeometry => geo('box', () => new BoxGeometry(1, 1, 1));

/** Caixa com a base em yBottom, centrada em (x, z). */
function box(m: Material, w: number, h: number, d: number, x: number, yBottom: number, z: number): Mesh {
  const o = new Mesh(BOX(), m);
  o.scale.set(w, h, d);
  o.position.set(x, yBottom + h / 2, z);
  return o;
}

function cone(m: Material, r: number, h: number, seg: number, x: number, yBottom: number, z: number, rotY = 0): Mesh {
  const o = new Mesh(geo(`cone${r}/${h}/${seg}`, () => new ConeGeometry(r, h, seg)), m);
  o.position.set(x, yBottom + h / 2, z);
  o.rotation.y = rotY;
  return o;
}

function cyl(m: Material, rTop: number, rBot: number, h: number, seg: number, x: number, yBottom: number, z: number): Mesh {
  const o = new Mesh(geo(`cyl${rTop}/${rBot}/${h}/${seg}`, () => new CylinderGeometry(rTop, rBot, h, seg)), m);
  o.position.set(x, yBottom + h / 2, z);
  return o;
}

function rock(m: Material, r: number, x: number, yBottom: number, z: number, sy = 0.7): Mesh {
  const o = new Mesh(geo(`ico${r}`, () => new IcosahedronGeometry(r, 0)), m);
  o.scale.y = sy;
  o.position.set(x, yBottom + r * sy * 0.8, z);
  return o;
}

export const COLORS = {
  leaf: '#3a9d44', leafDry: '#a3a23a', trunk: '#8d5a2b', bush: '#43b04f', bushDry: '#98a336', berry: '#e03131',
  stone: '#adb5bd', stoneDark: '#868e96', wall: '#f4e6c4', wallShade: '#e6d3a3', roof: '#e8590c', hallRoof: '#fcc419',
  wood: '#b9824a', woodDark: '#8a5a2b', soil: '#a9743d', crop: '#82c91e', cropDry: '#d6c58a', water: '#52b0ff', door: '#6b4a2b',
  flag: '#e03131',
};

export function makeTree(): Group {
  const g = new Group();
  g.add(cyl(mat(COLORS.trunk), 0.07, 0.1, 0.5, 5, 0, 0, 0));
  const lower = cone(mat(COLORS.leaf), 0.42, 0.8, 6, 0, 0.35, 0);
  const upper = cone(mat(COLORS.leaf), 0.3, 0.7, 6, 0, 0.8, 0, 0.5);
  g.add(lower, upper);
  g.userData.leaves = [lower, upper];
  return g;
}

export function makeBush(): Group {
  const g = new Group();
  const body = rock(mat(COLORS.bush), 0.32, 0, 0, 0, 0.75);
  g.add(body);
  const berries = new Group();
  for (const [x, z] of [[-0.15, 0.1], [0.12, -0.08], [0.02, 0.2]] as const) berries.add(rock(mat(COLORS.berry), 0.06, x, 0.2, z, 1));
  g.add(berries);
  g.userData.body = body;
  g.userData.berries = berries;
  return g;
}

export function makeRock(): Group {
  const g = new Group();
  g.add(rock(mat(COLORS.stone), 0.34, 0, 0, 0, 0.75), rock(mat(COLORS.stoneDark), 0.2, 0.25, 0, 0.1, 0.8));
  return g;
}

function house(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.wall), 1.5, 0.75, 1.5, 0, 0, 0));
  g.add(cone(mat(COLORS.roof), 1.25, 0.8, 4, 0, 0.75, 0, Math.PI / 4));
  g.add(box(mat(COLORS.door), 0.3, 0.45, 0.06, 0, 0, 0.76));
  return g;
}

function townhall(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.wall), 2.5, 1.1, 2.5, 0, 0, 0));
  g.add(box(mat(COLORS.wallShade), 2.7, 0.12, 2.7, 0, 1.1, 0));
  g.add(cone(mat(COLORS.hallRoof), 2.1, 1.1, 4, 0, 1.22, 0, Math.PI / 4));
  g.add(box(mat(COLORS.door), 0.55, 0.75, 0.06, 0, 0, 1.26));
  g.add(cyl(mat('#495057'), 0.025, 0.025, 0.8, 4, 0, 2.3, 0));
  g.add(box(mat(COLORS.flag), 0.4, 0.22, 0.03, 0.2, 2.8, 0));
  return g;
}

function farm(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.soil), 1.9, 0.1, 1.9, 0, 0, 0));
  const rows = new Group();
  for (let r = 0; r < 4; r++) rows.add(box(mat(COLORS.crop), 1.6, 0.16, 0.2, 0, 0.1, -0.7 + r * 0.46));
  g.add(rows);
  g.userData.rows = rows;
  return g;
}

function well(): Group {
  const g = new Group();
  g.add(cyl(mat(COLORS.stone), 0.5, 0.52, 0.45, 8, 0, 0, 0));
  const water = cyl(mat(COLORS.water), 0.36, 0.36, 0.04, 8, 0, 0.42, 0);
  g.add(water);
  g.userData.water = water;
  g.add(cyl(mat(COLORS.woodDark), 0.04, 0.04, 0.9, 4, -0.45, 0, 0), cyl(mat(COLORS.woodDark), 0.04, 0.04, 0.9, 4, 0.45, 0, 0));
  g.add(cone(mat(COLORS.roof), 0.75, 0.35, 4, 0, 0.9, 0, Math.PI / 4));
  return g;
}

function sawmill(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.wood), 1.6, 0.8, 1.2, 0, 0, -0.2));
  g.add(box(mat(COLORS.woodDark), 1.7, 0.12, 1.3, 0, 0.8, -0.2));
  const saw = new Mesh(geo('saw', () => new CylinderGeometry(0.3, 0.3, 0.04, 10)), mat('#dee2e6'));
  saw.rotation.x = Math.PI / 2;
  saw.position.set(0, 0.55, 0.45);
  g.add(saw);
  for (let i = 0; i < 3; i++) g.add(cyl(mat(COLORS.trunk), 0.1, 0.1, 0.9, 6, -0.6 + i * 0.3, 0, 0.75));
  return g;
}

function quarry(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.stoneDark), 1.9, 0.2, 1.9, 0, 0, 0));
  g.add(rock(mat(COLORS.stone), 0.32, -0.4, 0.2, 0.2), rock(mat(COLORS.stone), 0.24, 0.35, 0.2, -0.3), rock(mat('#ced4da'), 0.2, 0.3, 0.2, 0.4));
  return g;
}

function warehouse(): Group {
  const g = new Group();
  g.add(box(mat('#e3d3a4'), 1.7, 0.9, 1.7, 0, 0, 0));
  g.add(box(mat('#7c5a3a'), 1.8, 0.16, 1.8, 0, 0.9, 0));
  g.add(box(mat(COLORS.door), 0.8, 0.6, 0.06, 0, 0, 0.86));
  return g;
}

function dam(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.stone), 2, 0.9, 1, 0, 0, 0));
  return g;
}

function bridge(): Group {
  const g = new Group();
  g.add(box(mat('#b98b53'), 1, 0.1, 1, 0, 0, 0)); // tabuleiro
  for (let i = -1; i <= 1; i++) g.add(box(mat('#8d6a3f'), 0.08, 0.02, 0.9, i * 0.3, 0.1, 0)); // tábuas (atravessadas)
  for (const sz of [-0.46, 0.46]) g.add(box(mat('#74481f'), 1, 0.3, 0.07, 0, 0.1, sz)); // guarda-corpos ao longo do rio
  return g;
}

const MAKERS: Record<BuildingKind, () => Group> = { townhall, house, farm, well, sawmill, quarry, warehouse, dam, bridge };
export const makeBuilding = (kind: BuildingKind): Group => MAKERS[kind]();
