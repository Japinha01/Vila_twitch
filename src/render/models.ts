import {
  BoxGeometry, BufferAttribute, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial,
  BufferGeometry, CanvasTexture, NearestFilter, NoColorSpace, RepeatWrapping, type Material, type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingKind } from '../sim/types';
import { buildingGlbNames, cloneGlb } from './glb';

/** Modelos low poly gerados por código. Origem no chão, centro da base em (0, 0, 0). Unidade = 1 tile. */

/** Textura de "pixels" em tons de cinza (8×8, sem filtro): multiplica a cor e dá o grão de pixel art às superfícies. */
let pixelTex: CanvasTexture | null = null;
function pixelGrain(): CanvasTexture | null {
  if (pixelTex || typeof document === 'undefined') return pixelTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 8;
  const g = cv.getContext('2d');
  if (!g) return null;
  let seed = 7;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = Math.round(255 * (0.8 + 0.2 * Math.floor(rnd() * 4) / 3 + (y % 4 === 0 ? -0.05 : 0)));
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, y, 1, 1);
  }
  pixelTex = new CanvasTexture(cv);
  pixelTex.magFilter = pixelTex.minFilter = NearestFilter;
  pixelTex.generateMipmaps = false;
  pixelTex.wrapS = pixelTex.wrapT = RepeatWrapping;
  pixelTex.colorSpace = NoColorSpace;
  return pixelTex;
}

const matCache = new Map<string, MeshLambertMaterial>();
export const mat = (hex: string): MeshLambertMaterial => {
  let m = matCache.get(hex);
  if (!m) { m = new MeshLambertMaterial({ color: hex, flatShading: true, map: pixelGrain() }); matCache.set(hex, m); }
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
  flag: '#e03131', thatch: '#d9b45a', thatchDark: '#b8923d', glass: '#8fd0f5', plaster: '#f1e7d0', brick: '#b5523b', slate: '#5f6b7a',
  pine: '#2f8a46', pineDark: '#246b37', birch: '#e9ecef', cloth: '#c9a66b',
};

/** Prisma triangular (telhado de duas águas): largura w (x), altura h, comprimento d (z), base em yBottom. */
function gableGeo(w: number, h: number, d: number): BufferGeometry {
  const hw = w / 2, hd = d / 2;
  const P = { a: [-hw, 0, hd], b: [hw, 0, hd], c: [0, h, hd], a2: [-hw, 0, -hd], b2: [hw, 0, -hd], c2: [0, h, -hd] };
  const tris: number[][][] = [
    [P.a, P.b, P.c], [P.b2, P.a2, P.c2], // empenas (frente e trás)
    [P.b, P.b2, P.c2], [P.b, P.c2, P.c], // água direita
    [P.a2, P.a, P.c], [P.a2, P.c, P.c2], // água esquerda
  ];
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((v, j) => pos.set(v, i * 9 + j * 3)));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function gable(m: Material, w: number, h: number, d: number, x: number, yBottom: number, z: number, rotY = 0): Mesh {
  const o = new Mesh(geo(`gable${w}/${h}/${d}`, () => gableGeo(w, h, d)), m);
  o.position.set(x, yBottom, z);
  o.rotation.y = rotY;
  return o;
}
/** Janela: vidro com moldura. Fica na face +z (frente) a z. */
function windowAt(g: Group, x: number, y: number, z: number, w = 0.2, h = 0.22, frame = COLORS.woodDark): void {
  g.add(box(mat(frame), w + 0.06, h + 0.06, 0.04, x, y - 0.03, z));
  g.add(box(mat(COLORS.glass), w, h, 0.05, x, y, z + 0.005));
}
function blob(m: Material, r: number, x: number, yCenter: number, z: number, sy = 0.85): Mesh {
  const o = new Mesh(geo(`blob${r}`, () => new IcosahedronGeometry(r, 1)), m);
  o.scale.y = sy;
  o.position.set(x, yCenter, z);
  return o;
}
const hash = (n: number): number => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Árvores de três tipos (pinheiro, carvalho, bétula), escolhidos pelo id. `userData.leaves` é a folhagem que seca. */
export const TREE_KINDS = 3;
/** Tipo da árvore (0 pinheiro, 1 carvalho, 2 bétula) para um id: estável. */
export const treeKind = (seed: number): number => Math.floor(hash(seed) * TREE_KINDS);
export const makeTree = (seed = 0): Group => makeTreeKind(treeKind(seed));
export function makeTreeKind(kind: number): Group {
  const g = new Group();
  const leaves: Mesh[] = [];
  const foliage = (mesh: Mesh): Mesh => { leaves.push(mesh); g.add(mesh); return mesh; };
  if (kind === 0) { // pinheiro: tronco fino e cones empilhados
    g.add(cyl(mat(COLORS.trunk), 0.06, 0.1, 0.45, 5, 0, 0, 0));
    foliage(cone(mat(COLORS.pineDark), 0.46, 0.55, 7, 0, 0.3, 0));
    foliage(cone(mat(COLORS.pine), 0.36, 0.55, 7, 0, 0.62, 0, 0.4));
    foliage(cone(mat(COLORS.pineDark), 0.26, 0.5, 7, 0, 0.95, 0, 0.8));
    foliage(cone(mat(COLORS.pine), 0.15, 0.4, 7, 0, 1.25, 0));
  } else if (kind === 1) { // carvalho: tronco grosso e copa de blocos redondos
    g.add(cyl(mat(COLORS.trunk), 0.09, 0.14, 0.6, 6, 0, 0, 0));
    g.add(box(mat(COLORS.trunk), 0.05, 0.22, 0.05, 0.1, 0.4, 0.02));
    foliage(blob(mat(COLORS.leaf), 0.42, 0, 0.88, 0));
    foliage(blob(mat(COLORS.leaf), 0.3, 0.26, 0.74, 0.1));
    foliage(blob(mat(COLORS.leaf), 0.28, -0.24, 0.8, -0.12));
    foliage(blob(mat(COLORS.leaf), 0.24, 0.02, 1.15, 0.05));
  } else { // bétula: tronco claro e copa leve
    g.add(cyl(mat(COLORS.birch), 0.05, 0.075, 0.9, 5, 0, 0, 0));
    g.add(box(mat('#343a40'), 0.11, 0.03, 0.11, 0, 0.3, 0), box(mat('#343a40'), 0.1, 0.03, 0.1, 0, 0.55, 0));
    foliage(blob(mat(COLORS.leaf), 0.3, 0, 1.05, 0, 1.15));
    foliage(blob(mat(COLORS.leaf), 0.2, 0.15, 0.82, 0.08));
    foliage(blob(mat(COLORS.leaf), 0.18, -0.14, 0.92, -0.08));
  }
  g.userData.leaves = leaves;
  return g;
}

export function makeBush(): Group {
  const g = new Group();
  const body = new Group();
  body.add(blob(mat(COLORS.bush), 0.26, 0, 0.2, 0, 0.8), blob(mat(COLORS.bush), 0.2, 0.2, 0.16, 0.08, 0.8), blob(mat(COLORS.bush), 0.18, -0.18, 0.15, -0.06, 0.8));
  g.add(body);
  const berries = new Group();
  for (const [x, y, z] of [[-0.15, 0.3, 0.12], [0.12, 0.34, -0.1], [0.02, 0.38, 0.2], [0.26, 0.24, 0.16], [-0.24, 0.24, -0.08]] as const) berries.add(rock(mat(COLORS.berry), 0.05, x, y - 0.04, z, 1));
  g.add(berries);
  g.userData.body = body; // grupo: a cor é trocada em cada blob
  g.userData.berries = berries;
  return g;
}

export function makeRock(): Group {
  const g = new Group();
  g.add(rock(mat(COLORS.stone), 0.36, 0, 0, 0, 0.75), rock(mat(COLORS.stoneDark), 0.22, 0.28, 0, 0.1, 0.8), rock(mat('#ced4da'), 0.14, -0.22, 0, 0.18, 0.9));
  return g;
}

export type HouseTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Casa evolui com a era: cabana de galhos, casa de madeira, casa enxaimel, casa de pedra de dois andares. */
/** No centro denso da cidade a casa já é um degrau acima da era: bloco de tijolo → torre de vidro → condomínio. */
export const houseTier = (era: number, dense = false): HouseTier => {
  const base = era <= 3 ? Math.max(0, era) : era <= 5 ? 4 : 5;
  return Math.min(6, base + (dense && era >= 3 ? 1 : 0)) as HouseTier;
};

function house(tier: HouseTier = 1): Group {
  const g = new Group();
  if (tier === 0) { // cabana primitiva: troncos e teto de palha
    g.add(cyl(mat(COLORS.woodDark), 0.62, 0.7, 0.55, 8, 0, 0, 0));
    g.add(cone(mat(COLORS.thatch), 0.95, 0.85, 8, 0, 0.5, 0));
    g.add(cone(mat(COLORS.thatchDark), 0.5, 0.25, 8, 0, 1.2, 0));
    g.add(box(mat(COLORS.door), 0.28, 0.4, 0.06, 0, 0, 0.64));
    for (const a of [0.9, 2.4, 4.4]) g.add(cyl(mat(COLORS.trunk), 0.035, 0.035, 0.5, 4, Math.cos(a) * 0.66, 0.35, Math.sin(a) * 0.66));
  } else if (tier === 1) { // casa de tábuas com telhado de palha
    g.add(box(mat(COLORS.wood), 1.4, 0.7, 1.3, 0, 0, 0));
    g.add(box(mat(COLORS.woodDark), 1.44, 0.07, 1.34, 0, 0, 0));
    g.add(gable(mat(COLORS.thatch), 1.7, 0.7, 1.5, 0, 0.7, 0));
    g.add(box(mat(COLORS.door), 0.3, 0.46, 0.06, -0.2, 0, 0.66));
    windowAt(g, 0.35, 0.32, 0.66);
    g.add(box(mat(COLORS.stoneDark), 0.2, 0.55, 0.2, 0.45, 0.8, -0.3)); // chaminé
  } else if (tier === 2) { // enxaimel, telhado de telhas, chaminé
    g.add(box(mat(COLORS.plaster), 1.5, 0.8, 1.4, 0, 0, 0));
    for (const x of [-0.7, 0, 0.7]) g.add(box(mat(COLORS.woodDark), 0.07, 0.8, 1.44, x, 0, 0));
    g.add(box(mat(COLORS.woodDark), 1.54, 0.07, 1.44, 0, 0.72, 0));
    g.add(gable(mat(COLORS.brick), 1.8, 0.8, 1.6, 0, 0.8, 0));
    g.add(box(mat(COLORS.door), 0.3, 0.5, 0.06, -0.3, 0, 0.72));
    windowAt(g, 0.3, 0.38, 0.72); windowAt(g, 0.58, 0.38, 0.72);
    g.add(box(mat(COLORS.stone), 0.22, 0.7, 0.22, 0.5, 0.9, -0.35));
  } else if (tier === 4) { // era industrial/estado: bloco de tijolo de três andares, teto plano, chaminés
    g.add(box(mat(COLORS.brick), 1.6, 1.5, 1.4, 0, 0, 0));
    for (const y of [0.5, 1.0]) g.add(box(mat('#8a3b28'), 1.64, 0.05, 1.44, 0, y, 0));
    g.add(box(mat(COLORS.stoneDark), 1.7, 0.08, 1.5, 0, 1.5, 0));
    g.add(box(mat(COLORS.door), 0.3, 0.38, 0.06, 0, 0, 0.71));
    for (const x of [-0.5, 0.5]) for (const y of [0.1, 0.62, 1.12]) if (!(x === 0 && y === 0.1)) windowAt(g, x, y + 0.08, 0.71);
    for (const y of [0.62, 1.12]) windowAt(g, 0, y + 0.08, 0.71);
    for (const x of [-0.45, 0.4]) g.add(cyl(mat('#495057'), 0.1, 0.12, 0.55, 6, x, 1.58, -0.3));
  } else if (tier === 5) { // era do futuro: torre de vidro com teto verde, painéis solares e antena
    g.add(box(mat('#dfe9f2'), 1.5, 0.14, 1.5, 0, 0, 0));
    g.add(box(mat('#cfe3f4'), 1.2, 1.9, 1.2, 0, 0.14, 0));
    for (const y of [0.35, 0.75, 1.15, 1.55]) {
      g.add(box(mat('#4ab3f0'), 1.24, 0.22, 1.24, 0, y, 0));
      g.add(box(mat('#ffffff'), 1.26, 0.03, 1.26, 0, y + 0.22, 0));
    }
    g.add(box(mat('#2f9e44'), 1.3, 0.1, 1.3, 0, 2.04, 0)); // teto verde
    g.add(box(mat('#1c3d6e'), 0.5, 0.04, 0.35, -0.25, 2.16, 0.2)); // painel solar
    g.add(box(mat('#1c3d6e'), 0.5, 0.04, 0.35, 0.3, 2.16, -0.2));
    g.add(cyl(mat('#adb5bd'), 0.02, 0.02, 0.5, 4, 0.5, 2.14, 0.4));
    g.add(box(mat('#22b8cf'), 0.3, 0.4, 0.04, 0, 0.14, 0.62)); // porta de vidro
  } else if (tier === 6) { // condomínio: pódio com jardim e duas torres ligadas por passarela
    g.add(box(mat('#ced4da'), 1.85, 0.3, 1.75, 0, 0, 0));
    g.add(box(mat('#51cf66'), 1.75, 0.05, 1.65, 0, 0.3, 0)); // jardim no pódio
    for (const x of [-0.5, 0.5]) {
      g.add(box(mat('#f1f3f5'), 0.7, 1.9, 0.7, x, 0.35, -0.2));
      for (let f = 0; f < 6; f++) {
        g.add(box(mat('#4ab3f0'), 0.74, 0.14, 0.74, x, 0.5 + f * 0.3, -0.2)); // faixas de janela
        g.add(box(mat('#adb5bd'), 0.5, 0.03, 0.12, x, 0.48 + f * 0.3, 0.2)); // sacadas
      }
      g.add(box(mat('#2f9e44'), 0.74, 0.07, 0.74, x, 2.25, -0.2));
      g.add(cyl(mat('#adb5bd'), 0.02, 0.02, 0.35, 4, x + 0.2, 2.32, -0.2));
    }
    g.add(box(mat('#dee2e6'), 0.4, 0.14, 0.3, 0, 1.45, -0.2)); // passarela
    g.add(box(mat('#4ab3f0'), 0.9, 0.3, 0.04, 0, 0.32, 0.85));
    g.add(box(mat('#212529'), 0.5, 0.05, 0.3, 0, 0.62, 0.95)); // marquise de entrada
    for (const x of [-0.8, 0.8]) g.add(blob(mat('#2f9e44'), 0.16, x, 0.48, 0.7));
  } else { // casa de pedra de dois andares, telhado de ardósia, janelas
    g.add(box(mat(COLORS.stone), 1.6, 0.5, 1.4, 0, 0, 0));
    g.add(box(mat(COLORS.plaster), 1.5, 0.75, 1.3, 0, 0.5, 0));
    g.add(box(mat(COLORS.woodDark), 1.64, 0.06, 1.44, 0, 0.5, 0));
    g.add(gable(mat(COLORS.slate), 1.9, 0.75, 1.6, 0, 1.25, 0));
    g.add(box(mat(COLORS.door), 0.3, 0.42, 0.06, 0, 0, 0.72));
    for (const x of [-0.5, 0.5]) { windowAt(g, x, 0.18, 0.72); windowAt(g, x, 0.72, 0.66); }
    windowAt(g, 0, 0.72, 0.66);
    g.add(box(mat(COLORS.brick), 0.24, 0.8, 0.24, 0.55, 1.3, -0.35));
  }
  return g;
}

function townhall(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.stone), 2.7, 0.25, 2.7, 0, 0, 0)); // degrau
  g.add(box(mat(COLORS.wall), 2.4, 1.1, 2.3, 0, 0.25, 0));
  g.add(box(mat(COLORS.wallShade), 2.6, 0.12, 2.5, 0, 1.35, 0));
  g.add(gable(mat(COLORS.hallRoof), 2.7, 0.85, 2.5, 0, 1.47, 0));
  for (const x of [-0.75, 0.75]) g.add(cyl(mat(COLORS.stone), 0.1, 0.1, 1.05, 8, x, 0.25, 1.22)); // colunas
  g.add(box(mat(COLORS.wallShade), 1.9, 0.1, 0.3, 0, 1.3, 1.22));
  g.add(box(mat(COLORS.door), 0.6, 0.8, 0.06, 0, 0.25, 1.17));
  for (const x of [-1.0, 1.0]) windowAt(g, x, 0.7, 1.17, 0.25, 0.3);
  // torre do relógio
  g.add(box(mat(COLORS.wall), 0.7, 1.0, 0.7, 0, 1.47, -0.2));
  g.add(cone(mat(COLORS.roof), 0.6, 0.6, 4, 0, 2.47, -0.2, Math.PI / 4));
  g.add(cyl(mat('#fff'), 0.2, 0.2, 0.05, 12, 0, 1.95, 0.15));
  g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  g.add(cyl(mat('#495057'), 0.02, 0.02, 0.5, 4, 0, 3.05, -0.2));
  g.add(box(mat(COLORS.flag), 0.38, 0.2, 0.03, 0.2, 3.35, -0.2));
  return g;
}

/** Palácio de governo (Era do Estado em diante): escadaria, colunata, frontão, cúpula e bandeiras. */
function capitol(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.stone), 3.0, 0.2, 2.8, 0, 0, 0));
  g.add(box(mat('#e9ecef'), 2.8, 0.1, 2.6, 0, 0.2, 0));
  g.add(box(mat('#f8f9fa'), 2.4, 1.2, 2.0, 0, 0.3, -0.1));
  g.add(box(mat('#dee2e6'), 2.6, 0.12, 2.2, 0, 1.5, -0.1));
  for (let k = 0; k < 6; k++) g.add(cyl(mat('#ffffff'), 0.09, 0.09, 1.2, 8, -1.0 + k * 0.4, 0.3, 1.1)); // colunata
  g.add(box(mat('#dee2e6'), 2.4, 0.1, 0.4, 0, 1.5, 1.05));
  g.add(gable(mat('#f1f3f5'), 2.4, 0.5, 0.45, 0, 1.6, 1.05)); // frontão
  g.add(cyl(mat('#f1f3f5'), 0.6, 0.65, 0.35, 12, 0, 1.62, -0.1)); // tambor
  const dome = blob(mat('#ffd43b'), 0.55, 0, 2.0, -0.1, 0.9);
  g.add(dome);
  g.add(cyl(mat('#495057'), 0.02, 0.02, 0.5, 4, 0, 2.45, -0.1));
  g.add(box(mat(COLORS.flag), 0.4, 0.24, 0.03, 0.2, 2.75, -0.1));
  for (const x of [-1.15, 1.15]) { g.add(cyl(mat('#495057'), 0.02, 0.02, 0.9, 4, x, 0.3, 1.05)); g.add(box(mat('#1971c2'), 0.3, 0.2, 0.03, x + 0.16, 1.0, 1.05)); }
  g.add(box(mat(COLORS.door), 0.5, 0.7, 0.05, 0, 0.3, 0.9));
  return g;
}

/** Fogueira do acampamento: anel de pedras, lenha em estrela, chama pequena, troncos de sentar e duas barracas de peles. */
function campfire(): Group {
  const g = new Group();
  g.add(cyl(mat('#5c4a38'), 0.62, 0.66, 0.05, 10, 0, 0, 0)); // chão queimado
  g.add(cyl(mat('#2b211a'), 0.36, 0.38, 0.02, 10, 0, 0.05, 0)); // cinzas
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    g.add(rock(mat(k % 2 ? COLORS.stone : COLORS.stoneDark), 0.1, Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52, 0.8));
  }
  for (let k = 0; k < 5; k++) { // lenha em estrela, cada tora deitada apontando para o centro
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const log = cyl(mat(k % 2 ? COLORS.woodDark : COLORS.wood), 0.045, 0.05, 0.42, 5, 0, 0, 0);
    log.rotation.z = Math.PI / 2 - 0.15;
    const holder = new Group();
    log.position.set(0.2, 0.1, 0);
    holder.add(log);
    holder.rotation.y = a;
    g.add(holder);
  }
  g.add(cone(mat('#ff8a1f'), 0.19, 0.46, 6, 0, 0.1, 0, 0.3)); // chamas: pequenas, para não esconder a lenha
  g.add(cone(mat('#ffd43b'), 0.11, 0.34, 5, 0.03, 0.1, 0.02));
  g.add(cone(mat('#ff6b1a'), 0.1, 0.26, 5, -0.08, 0.1, -0.04, 1));
  for (const [x, z, r] of [[0.0, 0.95, 0], [-0.95, -0.05, Math.PI / 2]] as const) { // troncos para sentar
    const seat = cyl(mat(COLORS.trunk), 0.09, 0.09, 0.55, 6, 0, 0, 0);
    seat.rotation.z = Math.PI / 2;
    const h = new Group(); seat.position.y = 0.09; h.add(seat); h.position.set(x, 0, z); h.rotation.y = r; g.add(h);
  }
  for (const [x, z, r] of [[-1.15, -0.85, 0.7], [1.1, -0.7, -0.6]] as const) { // barracas de peles (duas águas)
    const t = new Group();
    t.add(gable(mat(COLORS.cloth), 0.95, 0.72, 1.05, 0, 0, 0));
    const ridge = cyl(mat('#a98456'), 0.04, 0.04, 1.12, 5, 0, 0.7, 0); ridge.rotation.x = Math.PI / 2; ridge.position.y = 0.72; t.add(ridge); // cumeeira
    t.add(box(mat('#2b1d12'), 0.26, 0.4, 0.04, 0, 0, 0.53)); // entrada
    t.position.set(x, 0, z); t.rotation.y = r;
    g.add(t);
  }
  g.add(box(mat(COLORS.wood), 0.16, 0.16, 0.16, 0.55, 0, 0.95), box(mat(COLORS.woodDark), 0.14, 0.14, 0.14, 0.72, 0, 0.88)); // caixotes
  return g;
}

function farm(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.soil), 1.9, 0.1, 1.9, 0, 0, 0));
  const rows = new Group();
  for (let r = 0; r < 4; r++) {
    const y = -0.7 + r * 0.46;
    rows.add(box(mat(COLORS.crop), 1.6, 0.16, 0.18, 0, 0.1, y));
    for (let c = 0; c < 5; c++) rows.add(cone(mat(COLORS.crop), 0.07, 0.2, 4, -0.62 + c * 0.31, 0.2, y));
  }
  g.add(rows);
  g.userData.rows = rows; // o scenesync troca o material de cada filho
  // cerca nas pontas e espantalho
  for (const x of [-0.92, 0.92]) for (const z of [-0.92, 0.92]) g.add(box(mat(COLORS.woodDark), 0.07, 0.3, 0.07, x, 0.05, z));
  g.add(box(mat(COLORS.wood), 1.84, 0.05, 0.04, 0, 0.22, 0.92), box(mat(COLORS.wood), 1.84, 0.05, 0.04, 0, 0.22, -0.92));
  g.add(cyl(mat(COLORS.woodDark), 0.025, 0.025, 0.55, 4, 0.7, 0.1, -0.2));
  g.add(box(mat(COLORS.woodDark), 0.4, 0.04, 0.04, 0.7, 0.5, -0.2));
  g.add(rock(mat('#e9c46a'), 0.09, 0.7, 0.62, -0.2, 1));
  g.add(cone(mat('#7b4a24'), 0.12, 0.1, 6, 0.7, 0.68, -0.2));
  return g;
}

function well(): Group {
  const g = new Group();
  g.add(cyl(mat(COLORS.stone), 0.5, 0.53, 0.45, 10, 0, 0, 0));
  g.add(cyl(mat(COLORS.stoneDark), 0.54, 0.54, 0.06, 10, 0, 0.4, 0));
  const water = cyl(mat(COLORS.water), 0.36, 0.36, 0.04, 10, 0, 0.42, 0);
  g.add(water);
  g.userData.water = water;
  g.add(box(mat(COLORS.woodDark), 0.07, 0.95, 0.07, -0.46, 0, 0), box(mat(COLORS.woodDark), 0.07, 0.95, 0.07, 0.46, 0, 0));
  g.add(gable(mat(COLORS.roof), 1.25, 0.4, 0.9, 0, 0.92, 0, Math.PI / 2));
  const bar = cyl(mat(COLORS.wood), 0.03, 0.03, 0.95, 5, 0, 0.78, 0); bar.rotation.z = Math.PI / 2; g.add(bar);
  g.add(cyl(mat(COLORS.woodDark), 0.07, 0.06, 0.1, 6, 0.1, 0.5, 0.0)); // balde
  g.add(cyl(mat('#dee2e6'), 0.01, 0.01, 0.2, 3, 0.1, 0.6, 0));
  return g;
}

function sawmill(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.wood), 1.6, 0.8, 1.2, 0, 0, -0.25));
  g.add(gable(mat(COLORS.woodDark), 1.9, 0.5, 1.45, 0, 0.8, -0.25));
  g.add(box(mat(COLORS.door), 0.4, 0.55, 0.06, -0.45, 0, 0.36));
  const saw = new Mesh(geo('saw', () => new CylinderGeometry(0.32, 0.32, 0.04, 12)), mat('#dee2e6'));
  saw.rotation.x = Math.PI / 2;
  saw.position.set(0.35, 0.55, 0.4);
  g.add(saw);
  const hub = cyl(mat('#868e96'), 0.05, 0.05, 0.06, 6, 0.35, 0.53, 0.43);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  g.add(box(mat(COLORS.woodDark), 0.9, 0.35, 0.5, 0.3, 0, 0.5)); // bancada
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { const l = cyl(mat(COLORS.trunk), 0.09, 0.09, 0.75, 6, -0.7 + i * 0.2, 0.09 + j * 0.17, 0.85); l.rotation.x = Math.PI / 2; l.rotation.z = 0; g.add(l); }
  return g;
}

function quarry(): Group {
  const g = new Group();
  g.add(box(mat('#a89a85'), 1.9, 0.05, 1.9, 0, 0, 0)); // chão de terra batida
  // paredão de rocha em degraus ao fundo
  g.add(box(mat(COLORS.stoneDark), 1.8, 0.45, 0.65, 0, 0.05, -0.62));
  g.add(box(mat(COLORS.stone), 1.4, 0.4, 0.5, -0.1, 0.5, -0.66));
  g.add(box(mat('#ced4da'), 0.9, 0.35, 0.4, -0.2, 0.9, -0.7));
  g.add(rock(mat(COLORS.stoneDark), 0.2, 0.55, 0.5, -0.62), rock(mat(COLORS.stone), 0.16, -0.65, 0.9, -0.66), rock(mat('#dee2e6'), 0.14, 0.05, 1.25, -0.7));
  // pilha de blocos já cortados
  for (const [x, z] of [[-0.62, 0.3], [-0.3, 0.3], [-0.46, 0.62]] as const) g.add(box(mat('#ced4da'), 0.3, 0.26, 0.3, x, 0.05, z));
  for (const [x, z] of [[-0.46, 0.3]] as const) g.add(box(mat(COLORS.stone), 0.3, 0.26, 0.3, x, 0.31, z));
  g.add(box(mat('#ced4da'), 0.3, 0.26, 0.3, -0.46, 0.05, 0.3));
  // guindaste de madeira com bloco pendurado
  g.add(box(mat(COLORS.woodDark), 0.08, 1.0, 0.08, 0.55, 0.05, 0.2), box(mat(COLORS.woodDark), 0.08, 1.0, 0.08, 0.85, 0.05, 0.2));
  g.add(box(mat(COLORS.wood), 0.55, 0.07, 0.08, 0.7, 1.05, 0.2));
  g.add(cyl(mat('#e9d8a6'), 0.012, 0.012, 0.5, 3, 0.62, 0.55, 0.2));
  g.add(box(mat(COLORS.stone), 0.22, 0.2, 0.22, 0.62, 0.35, 0.2));
  // carrinho de mão e picareta cravada numa pedra
  g.add(box(mat(COLORS.woodDark), 0.38, 0.12, 0.26, 0.35, 0.2, 0.7));
  const wheel = cyl(mat('#495057'), 0.1, 0.1, 0.05, 8, 0.2, 0.1, 0.7);
  wheel.rotation.z = Math.PI / 2;
  g.add(wheel);
  g.add(rock(mat(COLORS.stone), 0.13, 0.05, 0.05, 0.55));
  const handle = cyl(mat(COLORS.woodDark), 0.02, 0.02, 0.5, 4, 0.05, 0.12, 0.55);
  handle.rotation.z = 0.5;
  g.add(handle);
  g.add(box(mat('#495057'), 0.26, 0.04, 0.04, 0.2, 0.56, 0.55));
  return g;
}

function warehouse(): Group {
  const g = new Group();
  g.add(box(mat('#e3d3a4'), 1.7, 0.85, 1.6, 0, 0, 0));
  g.add(box(mat(COLORS.woodDark), 1.74, 0.06, 1.64, 0, 0, 0));
  g.add(gable(mat('#7c5a3a'), 2.0, 0.65, 1.8, 0, 0.85, 0));
  g.add(box(mat(COLORS.door), 0.9, 0.65, 0.06, 0, 0, 0.8));
  g.add(box(mat(COLORS.woodDark), 0.05, 0.65, 0.07, 0, 0, 0.82));
  g.add(box(mat('#fff3bf'), 0.4, 0.14, 0.05, 0, 1.0, 0.82)); // fardo de feno no sótão
  g.add(box(mat(COLORS.wood), 0.28, 0.28, 0.28, 0.65, 0, 0.98), box(mat(COLORS.woodDark), 0.24, 0.24, 0.24, -0.62, 0, 1.0), box(mat(COLORS.wood), 0.22, 0.22, 0.22, -0.62, 0.24, 1.0));
  return g;
}

function dam(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.stone), 2, 0.9, 1, 0, 0, 0));
  g.add(box(mat(COLORS.stoneDark), 2.05, 0.08, 1.05, 0, 0.9, 0));
  for (const x of [-0.6, 0, 0.6]) g.add(box(mat(COLORS.stoneDark), 0.04, 0.9, 1.02, x, 0, 0));
  return g;
}

function bridge(): Group {
  const g = new Group();
  g.add(box(mat('#b98b53'), 1, 0.1, 1, 0, 0, 0)); // tabuleiro
  for (let i = -1; i <= 1; i++) g.add(box(mat('#8d6a3f'), 0.08, 0.02, 0.9, i * 0.3, 0.1, 0)); // tábuas (atravessadas)
  for (const sz of [-0.46, 0.46]) {
    g.add(box(mat('#74481f'), 1, 0.06, 0.06, 0, 0.32, sz)); // corrimão
    g.add(box(mat('#74481f'), 1, 0.05, 0.05, 0, 0.18, sz));
    for (const x of [-0.45, 0.45]) g.add(box(mat('#5c3a17'), 0.07, 0.3, 0.07, x, 0.1, sz)); // balaústres nas pontas
  }
  return g;
}

export type MarketTier = 0 | 1 | 2;
/** Mercado vira galeria e depois shopping com a era; no centro denso, um degrau antes. */
export const marketTier = (era: number, dense = false): MarketTier => (era <= 2 ? 0 : era === 3 ? (dense ? 1 : 0) : era <= 5 ? (dense ? 2 : 1) : 2);

function galeria(): Group {
  const g = new Group();
  g.add(box(mat('#efe3c4'), 1.75, 0.85, 1.7, 0, 0, 0));
  g.add(box(mat('#b08968'), 1.8, 0.07, 1.75, 0, 0.85, 0));
  g.add(gable(mat('#9fd8f5'), 1.5, 0.55, 1.5, 0, 0.92, 0)); // cobertura de vidro
  g.add(gable(mat('#dff3ff'), 0.9, 0.3, 1.52, 0, 1.02, 0));
  for (const x of [-0.6, 0, 0.6]) { // arcadas
    g.add(box(mat('#1c3d6e'), 0.38, 0.5, 0.05, x, 0.05, 0.86));
    g.add(box(mat('#efe3c4'), 0.1, 0.55, 0.1, x + 0.3, 0.05, 0.88));
  }
  g.add(box(mat('#c2255c'), 1.1, 0.16, 0.05, 0, 0.62, 0.88)); // letreiro
  g.add(box(mat('#fff'), 0.9, 0.05, 0.06, 0, 0.66, 0.9));
  g.add(box(mat('#e9d8a6'), 0.35, 0.22, 0.3, -0.7, 0, 1.05), box(mat('#e03131'), 0.3, 0.16, 0.26, 0.7, 0, 1.05)); // bancas na calçada
  return g;
}

function shopping(): Group {
  const g = new Group();
  g.add(box(mat('#868e96'), 1.9, 0.12, 1.85, 0, 0, 0)); // estacionamento / calçada
  g.add(box(mat('#f1f3f5'), 1.75, 1.2, 1.5, 0, 0.12, -0.1));
  for (const y of [0.4, 0.85]) g.add(box(mat('#4ab3f0'), 1.79, 0.22, 1.54, 0, y, -0.1)); // faixas de vidro
  g.add(box(mat('#dee2e6'), 1.85, 0.08, 1.6, 0, 1.32, -0.1));
  g.add(blob(mat('#9fd8f5'), 0.5, 0, 1.42, -0.1, 0.55)); // domo de vidro (átrio)
  g.add(box(mat('#e03131'), 1.0, 0.28, 0.08, 0, 0.9, 0.7)); // letreiro grande
  g.add(box(mat('#fff'), 0.7, 0.08, 0.09, 0, 1.0, 0.7));
  g.add(box(mat('#212529'), 0.9, 0.05, 0.4, 0, 0.5, 0.88)); // marquise
  for (const x of [-0.45, 0.45]) g.add(cyl(mat('#adb5bd'), 0.03, 0.03, 0.4, 4, x, 0.12, 0.98));
  g.add(box(mat('#4ab3f0'), 0.6, 0.38, 0.04, 0, 0.12, 0.68)); // entrada
  for (const [x, c] of [[-0.7, '#e03131'], [-0.3, '#fcc419'], [0.2, '#339af0'], [0.7, '#51cf66']] as const) g.add(box(mat(c), 0.12, 0.08, 0.2, x, 0.12, 0.88)); // carros
  g.add(cyl(mat('#495057'), 0.02, 0.02, 0.9, 4, 0.82, 0.12, 0.8), box(mat('#fcc419'), 0.28, 0.18, 0.03, 0.95, 0.9, 0.8)); // bandeira
  return g;
}

function market(): Group {
  const g = new Group();
  g.add(box(mat('#e9d8a6'), 1.7, 0.7, 1.7, 0, 0, 0));
  g.add(box(mat('#d9480f'), 1.95, 0.1, 1.95, 0, 0.7, 0)); // toldo
  for (const sx of [-0.65, -0.22, 0.22, 0.65]) g.add(box(mat('#fff'), 0.2, 0.11, 1.97, sx, 0.705, 0)); // listras do toldo
  g.add(box(mat('#d9480f'), 1.95, 0.18, 0.04, 0, 0.55, 0.98)); // franja frontal
  g.add(box(mat(COLORS.door), 0.4, 0.4, 0.06, 0.5, 0, 0.86));
  g.add(box(mat(COLORS.wood), 0.9, 0.22, 0.4, -0.4, 0, 1.05)); // balcão
  for (const [x, c] of [[-0.7, '#e03131'], [-0.45, '#fcc419'], [-0.2, '#82c91e']] as const) g.add(rock(mat(c), 0.08, x, 0.22, 1.05, 1)); // frutas
  g.add(box(mat('#a5d8ff'), 0.7, 0.28, 0.05, -0.35, 0.2, 0.86));
  g.add(box(mat(COLORS.wood), 0.26, 0.26, 0.26, 0.75, 0, 1.0), box(mat(COLORS.woodDark), 0.22, 0.22, 0.22, 0.75, 0.26, 1.0));
  g.add(cyl(mat(COLORS.woodDark), 0.03, 0.03, 0.6, 4, 0.9, 0.7, 0.9), cyl(mat(COLORS.woodDark), 0.03, 0.03, 0.6, 4, -0.9, 0.7, 0.9));
  g.add(box(mat('#fcc419'), 0.3, 0.2, 0.03, 0.9, 1.12, 0.9)); // bandeira
  return g;
}

/** Roda d'água → roda de ferro → turbina → usina, conforme a era. `userData.wheel` gira (o scenesync anima). */
export const wheelTier = (era: number): 0 | 1 | 2 | 3 => (era <= 2 ? 0 : era <= 4 ? 1 : era <= 6 ? 2 : 3);
function waterwheel(tier: 0 | 1 | 2 | 3 = 0): Group {
  const g = new Group();
  const wheel = new Group();
  const metal = tier >= 1;
  const rimCol = metal ? '#868e96' : COLORS.woodDark;
  const padCol = metal ? '#adb5bd' : COLORS.wood;
  const r = tier >= 2 ? 0.45 : 0.55;
  for (const dx of [-0.07, 0.07]) {
    const rim = cyl(mat(rimCol), r, r, 0.04, 14, dx, -0.02, 0);
    rim.rotation.z = Math.PI / 2;
    wheel.add(rim);
  }
  const hub = cyl(mat('#495057'), 0.09, 0.09, 0.2, 8, 0, 0, 0);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  const blades = tier >= 2 ? 10 : 8;
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2;
    const pad = box(mat(padCol), 0.16, 0.1, 0.34, 0, 0, 0);
    pad.position.set(0, Math.sin(a) * (r - 0.1), Math.cos(a) * (r - 0.1));
    pad.rotation.x = a;
    wheel.add(pad);
  }
  wheel.position.set(0.82, r + 0.08, 0.1);
  g.add(wheel);
  g.userData.wheel = wheel;
  g.add(box(mat(COLORS.stoneDark), 0.12, r + 0.1, 0.12, 0.82, 0, 0.1 - r - 0.1)); // suporte
  g.add(box(mat('#8a7f72'), 1.9, 0.06, 1.9, 0, 0, 0)); // piso
  if (tier === 0) { // moinho de madeira com telhado de palha
    g.add(box(mat(COLORS.wood), 1.1, 0.7, 1.1, -0.35, 0.06, -0.3));
    g.add(gable(mat(COLORS.thatch), 1.35, 0.55, 1.3, -0.35, 0.76, -0.3, Math.PI / 2));
    g.add(box(mat(COLORS.door), 0.28, 0.42, 0.06, -0.35, 0.06, 0.26));
    g.add(box(mat(COLORS.woodDark), 0.5, 0.06, 0.1, 0.5, 0.5, 0.1)); // eixo até a roda
  } else if (tier === 1) { // casa de tijolos com gerador e poste
    g.add(box(mat(COLORS.brick), 1.1, 0.75, 1.1, -0.35, 0.06, -0.3));
    g.add(gable(mat(COLORS.slate), 1.35, 0.5, 1.3, -0.35, 0.81, -0.3, Math.PI / 2));
    g.add(box(mat('#212529'), 0.3, 0.4, 0.06, -0.35, 0.06, 0.26));
    g.add(box(mat('#c2410c'), 0.3, 0.3, 0.3, 0.3, 0.06, -0.55)); // gerador
    g.add(cyl(mat('#74481f'), 0.04, 0.04, 1.2, 5, -0.85, 0.06, 0.6));
    g.add(box(mat('#74481f'), 0.5, 0.05, 0.05, -0.85, 1.1, 0.6));
  } else if (tier === 2) { // casa de turbina de concreto, tubulação e transformador
    g.add(box(mat('#ced4da'), 1.2, 0.85, 1.1, -0.35, 0.06, -0.3));
    g.add(box(mat('#868e96'), 1.26, 0.08, 1.16, -0.35, 0.91, -0.3));
    g.add(box(mat('#4ab3f0'), 0.8, 0.22, 0.04, -0.35, 0.5, 0.26)); // janelão
    const pipe = cyl(mat('#6c757d'), 0.12, 0.12, 1.0, 8, 0.4, 0.2, -0.6);
    pipe.rotation.z = Math.PI / 2;
    g.add(pipe);
    g.add(box(mat('#495057'), 0.3, 0.45, 0.3, 0.6, 0.06, -0.6)); // transformador
    for (const x of [-0.85, -0.65]) g.add(cyl(mat('#adb5bd'), 0.03, 0.03, 1.3, 4, x, 0.06, 0.65));
    g.add(box(mat('#adb5bd'), 0.5, 0.04, 0.04, -0.75, 1.3, 0.65));
  } else { // usina hidrelétrica: bloco moderno com arco de vidro, torres de transmissão e luzes
    g.add(box(mat('#e9ecef'), 1.3, 0.95, 1.2, -0.35, 0.06, -0.3));
    g.add(box(mat('#4ab3f0'), 1.1, 0.4, 0.05, -0.35, 0.45, 0.31));
    g.add(box(mat('#1c3d6e'), 1.3, 0.1, 1.2, -0.35, 1.01, -0.3));
    g.add(box(mat('#22b8cf'), 0.9, 0.04, 0.5, -0.35, 1.11, -0.2)); // painel solar
    for (const [x, z] of [[-0.85, 0.7], [0.1, 0.8]] as const) {
      g.add(cyl(mat('#adb5bd'), 0.025, 0.05, 1.5, 4, x, 0.06, z));
      g.add(box(mat('#adb5bd'), 0.6, 0.04, 0.04, x, 1.35, z), box(mat('#fcc419'), 0.07, 0.07, 0.07, x + 0.3, 1.45, z), box(mat('#fcc419'), 0.07, 0.07, 0.07, x - 0.3, 1.45, z));
    }
    g.add(box(mat('#495057'), 0.35, 0.5, 0.35, 0.6, 0.06, -0.62));
  }
  return g;
}

const MAKERS: Record<BuildingKind, () => Group> = { townhall, house, farm, well, sawmill, quarry, warehouse, dam, bridge, market, waterwheel };
/** Na Era da Pedra e do Bronze o centro é uma fogueira; a prefeitura vem na Era Medieval. */
export const hallStage = (era: number): 'fogueira' | 'prefeitura' | 'governo' => (era < 2 ? 'fogueira' : era < 5 ? 'prefeitura' : 'governo');
/** Etapa visual de um prédio (muda de modelo quando a era faz ele evoluir): '' se nunca muda. */
export const buildingStage = (kind: BuildingKind, era: number, dense = false): string => (kind === 'townhall' ? hallStage(era) : kind === 'house' ? String(houseTier(era, dense)) : kind === 'market' ? String(marketTier(era, dense)) : kind === 'waterwheel' ? String(wheelTier(era)) : '');
const bakedMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });

/**
 * Funde as dezenas de peças de um prédio numa malha só (cor por vértice): uma chamada de desenho por prédio
 * em vez de dezenas. As peças que o jogo recolore depois (`userData.rows`, `userData.water`) ficam separadas.
 */
function bake(src: Group): Group {
  const keep = new Set<Object3D>();
  for (const key of ['rows', 'water', 'wheel']) { const o = src.userData[key] as Object3D | undefined; if (o) keep.add(o); }
  src.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  src.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    for (let p: Object3D | null = o; p; p = p.parent) if (keep.has(p)) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as BufferGeometry;
    g.applyMatrix4(m.matrixWorld);
    g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const c = (m.material as MeshLambertMaterial).color;
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new BufferAttribute(col, 3));
    parts.push(g);
  });
  const out = new Group();
  out.userData = src.userData;
  const merged = parts.length ? mergeGeometries(parts, false) : null;
  if (merged) out.add(new Mesh(merged, bakedMat));
  for (const k of keep) out.add(k);
  return out;
}

export const makeBuilding = (kind: BuildingKind, era = 0, dense = false): Group => {
  // modelo do Blender, se houver (o mais específico para a etapa, senão o geral do tipo)
  for (const name of buildingGlbNames(kind, buildingStage(kind, era, dense))) {
    const m = cloneGlb(name);
    if (m) { const g = new Group(); g.add(m); g.userData = m.userData; return g; }
  }
  if (kind === 'townhall' && hallStage(era) === 'fogueira') return bake(campfire());
  if (kind === 'townhall' && hallStage(era) === 'governo') return bake(capitol());
  if (kind === 'house') return bake(house(houseTier(era, dense)));
  if (kind === 'market') return bake([market, galeria, shopping][marketTier(era, dense)]());
  if (kind === 'waterwheel') return bake(waterwheel(wheelTier(era)));
  return bake(MAKERS[kind]());
};
