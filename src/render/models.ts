import {
  BoxGeometry, BufferAttribute, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial,
  BufferGeometry, type Material,
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
export function makeTree(seed = 0): Group {
  const g = new Group();
  const kind = Math.floor(hash(seed) * 3);
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

export type HouseTier = 0 | 1 | 2 | 3 | 4 | 5;
/** Casa evolui com a era: cabana de galhos, casa de madeira, casa enxaimel, casa de pedra de dois andares. */
export const houseTier = (era: number): HouseTier => (era <= 3 ? Math.max(0, era) : era <= 5 ? 4 : 5) as HouseTier;

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
  g.add(cyl(mat('#868e96'), 0.05, 0.05, 0.06, 6, 0.35, 0.53, 0.43)).rotation.x = Math.PI / 2;
  g.add(box(mat(COLORS.woodDark), 0.9, 0.35, 0.5, 0.3, 0, 0.5)); // bancada
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { const l = cyl(mat(COLORS.trunk), 0.09, 0.09, 0.75, 6, -0.7 + i * 0.2, 0.09 + j * 0.17, 0.85); l.rotation.x = Math.PI / 2; l.rotation.z = 0; g.add(l); }
  return g;
}

function quarry(): Group {
  const g = new Group();
  g.add(box(mat(COLORS.stoneDark), 1.9, 0.2, 1.9, 0, 0, 0));
  g.add(box(mat('#6c757d'), 1.2, 0.08, 1.0, -0.2, 0.2, -0.2)); // cova
  g.add(rock(mat(COLORS.stone), 0.32, -0.45, 0.2, 0.4), rock(mat(COLORS.stone), 0.24, 0.5, 0.2, -0.4), rock(mat('#ced4da'), 0.2, 0.35, 0.2, 0.5), rock(mat(COLORS.stoneDark), 0.26, 0.55, 0.2, 0.1));
  // carrinho de mão e picareta
  g.add(box(mat(COLORS.woodDark), 0.4, 0.14, 0.28, -0.55, 0.22, -0.5), cyl(mat('#495057'), 0.1, 0.1, 0.05, 8, -0.55, 0.12, -0.38)).rotation.x = Math.PI / 2;
  const handle = cyl(mat(COLORS.woodDark), 0.025, 0.025, 0.6, 4, 0.1, 0.2, -0.65); handle.rotation.z = 0.7; g.add(handle);
  g.add(box(mat('#495057'), 0.3, 0.05, 0.05, 0.25, 0.7, -0.65));
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

const MAKERS: Record<BuildingKind, () => Group> = { townhall, house, farm, well, sawmill, quarry, warehouse, dam, bridge, market };
/** Na Era da Pedra e do Bronze o centro é uma fogueira; a prefeitura vem na Era Medieval. */
export const hallStage = (era: number): 'fogueira' | 'prefeitura' | 'governo' => (era < 2 ? 'fogueira' : era < 5 ? 'prefeitura' : 'governo');
/** Etapa visual de um prédio (muda de modelo quando a era faz ele evoluir): '' se nunca muda. */
export const buildingStage = (kind: BuildingKind, era: number): string => (kind === 'townhall' ? hallStage(era) : kind === 'house' ? String(houseTier(era)) : '');
export const makeBuilding = (kind: BuildingKind, era = 0): Group => {
  if (kind === 'townhall' && hallStage(era) === 'fogueira') return campfire();
  if (kind === 'townhall' && hallStage(era) === 'governo') return capitol();
  if (kind === 'house') return house(houseTier(era));
  return MAKERS[kind]();
};
