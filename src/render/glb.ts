import { Group, MeshLambertMaterial, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';

/**
 * Modelos feitos no Blender (.glb) que substituem os modelos gerados por código.
 * Tudo aqui é opcional: sem `public/models/manifest.json` (ou com a lista vazia) nada é baixado e o jogo
 * usa os modelos de sempre. Convenções de nome, escala e eixo: ver `public/models/README.md`.
 */

/** Árvores na ordem dos tipos do jogo (0 pinheiro, 1 carvalho, 2 bétula). */
export const TREE_KEYS = ['tree_pine', 'tree_oak', 'tree_birch'] as const;

/** Etapas visuais de cada prédio (as mesmas de `buildingStage`). Prédio sem etapa usa só o nome. */
const STAGES: Record<string, string[]> = {
  townhall: ['fogueira', 'prefeitura', 'governo'],
  house: ['0', '1', '2', '3', '4', '5', '6'],
  market: ['0', '1', '2'],
  waterwheel: ['0', '1', '2', '3'],
  farm: [], well: [], sawmill: [], quarry: [], warehouse: [], dam: [], bridge: [],
};

/** Todos os nomes de arquivo aceitos (sem o `.glb`). */
export const MODEL_KEYS: ReadonlySet<string> = new Set([
  ...Object.entries(STAGES).flatMap(([kind, stages]) => [kind, ...stages.map((s) => `${kind}_${s}`)]),
  ...TREE_KEYS,
]);

/** Partes com comportamento no jogo, achadas pelo começo do nome do objeto no Blender (inglês ou português). */
const PARTS: Record<'wheel' | 'rows' | 'water', string[]> = {
  wheel: ['wheel', 'roda'], // gira em torno do próprio eixo X
  rows: ['rows', 'plantio'], // plantação: amarela quando falta irrigação
  water: ['water', 'agua'], // água do poço: cinza quando o poço está seco
};
const LEAF_NAMES = ['leaf', 'leaves', 'folha', 'copa'];

const models = new Map<string, Group>();
let version = 0;

/** Sobe a cada leva de modelos carregada: quem desenha compara e reconstrói o que já estava na cena. */
export const modelsVersion = (): number => version;

const starts = (name: string, prefixes: string[]): boolean => {
  const n = name.toLowerCase();
  return prefixes.some((p) => n.startsWith(p));
};

/**
 * O glTF chega com material PBR; o jogo ilumina tudo com Lambert (sem mapa de ambiente, metal ficaria preto).
 * Mantém cor, textura, cor por vértice, transparência e emissão (janelas acesas pegam o bloom).
 */
const lambertOf = new WeakMap<Material, Material>();
function toLambert(src: Material): Material {
  const s = src as MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return src;
  let m = lambertOf.get(src);
  if (!m) {
    m = new MeshLambertMaterial({
      color: s.color, map: s.map, vertexColors: s.vertexColors, flatShading: s.flatShading,
      transparent: s.transparent, opacity: s.opacity, alphaTest: s.alphaTest, side: s.side,
      emissive: s.emissive, emissiveMap: s.emissiveMap, emissiveIntensity: s.emissiveIntensity,
    });
    m.name = s.name;
    lambertOf.set(src, m);
  }
  return m;
}

/** Prepara a cena de um .glb e guarda como molde. Devolve false se o nome não é um dos aceitos. */
export function registerModel(key: string, scene: Object3D): boolean {
  if (!MODEL_KEYS.has(key)) return false;
  const root = new Group();
  root.add(scene);
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toLambert) : toLambert(mesh.material);
    const matName = Array.isArray(mesh.material) ? '' : mesh.material.name;
    if (starts(o.name, LEAF_NAMES) || starts(matName, LEAF_NAMES)) o.userData.leaf = true;
  });
  // cada parte com comportamento (roda, plantação, água) vira um grupo nomeado: a roda gira em volta do próprio eixo
  const parts: Record<string, string> = {};
  for (const [part, prefixes] of Object.entries(PARTS)) {
    const objs: Object3D[] = [];
    root.traverse((o) => { if ((o as Mesh).isMesh && starts(o.name, prefixes)) objs.push(o); });
    if (!objs.length) continue;
    const g = new Group();
    g.name = `vila_${part}`;
    if (part === 'wheel') g.position.setFromMatrixPosition(objs[0].matrixWorld); // eixo = posição da primeira peça
    root.add(g);
    for (const o of objs) g.attach(o); // attach mantém a posição de cada peça
    parts[part] = g.name;
  }
  root.userData = { glb: true, parts };
  root.updateMatrixWorld(true);
  models.set(key, root);
  return true;
}

/** Fecha uma leva de `registerModel`: avisa a cena para trocar os modelos. */
export const commitModels = (): void => { version++; };

/** Esquece tudo (testes). */
export function clearModels(): void { models.clear(); version++; }

/** Cópia do modelo .glb do prédio nesta etapa (`house_3`), ou do genérico (`house`); null = usar o modelo em código. */
export function glbBuilding(kind: string, stage: string): Group | null {
  const tpl = (stage ? models.get(`${kind}_${stage}`) : undefined) ?? models.get(kind);
  if (!tpl) return null;
  const g = tpl.clone(true);
  const names = tpl.userData.parts as Record<string, string>;
  g.userData = { glb: true };
  for (const [part, name] of Object.entries(names)) g.userData[part] = g.getObjectByName(name);
  return g;
}

/** Molde da árvore do tipo dado (as folhas vêm com `userData.leaf`), ou null. */
export const glbTree = (kind: number): Group | null => models.get(TREE_KEYS[kind]) ?? null;

const tintCache = new WeakMap<Material, Map<string, Material>>();
/** Mesmo material com outra cor (folha seca, plantação sem água). Uma cópia por material e cor. */
export function tinted(base: Material, hex: string): Material {
  let byHex = tintCache.get(base);
  if (!byHex) { byHex = new Map(); tintCache.set(base, byHex); }
  let m = byHex.get(hex);
  if (!m) {
    m = base.clone();
    (m as MeshLambertMaterial).color.set(hex);
    byHex.set(hex, m);
  }
  return m;
}

const baseMat = new WeakMap<Mesh, Material>();
/** Pinta uma parte do modelo .glb (hex) ou devolve o material original (null). */
export function tintPart(part: Object3D, hex: string | null): void {
  part.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    let base = baseMat.get(mesh);
    if (!base) { base = mesh.material; baseMat.set(mesh, base); }
    mesh.material = hex ? tinted(base, hex) : base;
  });
}

let started: Promise<number> | null = null;
/**
 * Lê `models/manifest.json` e baixa os .glb listados (uma vez por página). Qualquer falha só deixa o modelo
 * em código no lugar. `?semglb` no endereço desliga tudo, para comparar. Devolve quantos modelos entraram.
 */
export function loadModels(base = `${import.meta.env.BASE_URL}models/`): Promise<number> {
  started ??= (async () => {
    if (new URLSearchParams(location.search).has('semglb')) return 0;
    let files: string[];
    try {
      const res = await fetch(`${base}manifest.json`, { cache: 'no-cache' });
      if (!res.ok) return 0;
      const json = await res.json() as string[] | { models?: string[] };
      files = (Array.isArray(json) ? json : json.models ?? []).filter((f) => typeof f === 'string');
    } catch { return 0; }
    if (!files.length) return 0;
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    let n = 0;
    await Promise.all(files.map(async (file) => {
      const key = file.replace(/^.*\//, '').replace(/\.glb$/i, '').toLowerCase();
      if (!MODEL_KEYS.has(key)) { console.warn(`[modelos] "${file}" ignorado: nome desconhecido (ver public/models/README.md)`); return; }
      try {
        const gltf = await loader.loadAsync(base + file);
        if (registerModel(key, gltf.scene)) n++;
      } catch (e) { console.warn(`[modelos] não deu para carregar "${file}"; fica o modelo em código`, e); }
    }));
    if (n) commitModels();
    return n;
  })();
  return started;
}
