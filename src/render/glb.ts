import { Group, MeshLambertMaterial, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import type { BuildingKind } from '../sim/types';

/**
 * Modelos feitos no Blender (.glb) por cima dos modelos em código.
 *
 * O jogo lê `public/models/manifest.json` (lista de nomes) e carrega `public/models/<nome>.glb`. Cada modelo
 * que carregar substitui o equivalente feito em código; o que faltar ou der erro continua no modelo em código.
 * Convenções (nomes, escala, peças animadas) em `public/models/LEIAME.md`. `?semglb` na URL desliga tudo.
 */

/** Nomes das árvores na ordem dos tipos de `makeTreeKind` (0 pinheiro, 1 carvalho, 2 bétula). */
export const TREE_GLB = ['arvore_pinheiro', 'arvore_carvalho', 'arvore_betula'] as const;

/** Peças que o jogo mexe depois (recolore ou gira), achadas pelo começo do nome do objeto no Blender. */
const PARTS = ['rows', 'water', 'wheel'] as const;

const templates = new Map<string, Object3D>();
let version = 0;
let started = false;

/** Muda cada vez que um modelo novo chega (o 3D usa para trocar os modelos já na tela). */
export const glbVersion = (): number => version;
export const hasGlb = (name: string): boolean => templates.has(name);

/** Nomes que servem para um prédio, do mais específico ao mais geral: `predio_house_3`, depois `predio_house`. */
export function buildingGlbNames(kind: BuildingKind, stage: string): string[] {
  return stage ? [`predio_${kind}_${stage}`, `predio_${kind}`] : [`predio_${kind}`];
}

/** O GLTFLoader tira pontos e espaços dos nomes ("rows.001" vira "rows001"), então comparamos pelo começo. */
const named = (o: Object3D, prefix: string): boolean => o.name.toLowerCase().startsWith(prefix);
const matName = (m: Material | Material[]): string => (Array.isArray(m) ? m.map((x) => x.name).join(' ') : m.name).toLowerCase();

/** Folhagem (seca com a falta d'água): objeto, pai ou material com nome começando em "folha" ou "leaf". */
export function isFoliage(o: Object3D, root: Object3D): boolean {
  const mesh = o as Mesh;
  if (mesh.isMesh && /(^|\s)(folha|leaf)/.test(matName(mesh.material))) return true;
  for (let p: Object3D | null = o; p && p !== root; p = p.parent) if (named(p, 'folha') || named(p, 'leaf')) return true;
  return false;
}

const lambertCache = new Map<Material, MeshLambertMaterial>();
/** Troca o material PBR do glTF por Lambert facetado, como os modelos em código (mais leve e combina com a luz do jogo). */
function toLambert(src: Material, vertexColors: boolean): MeshLambertMaterial {
  let m = lambertCache.get(src);
  if (m) return m;
  const s = src as MeshStandardMaterial;
  m = new MeshLambertMaterial({
    name: s.name,
    color: s.color ? s.color.clone() : 0xffffff,
    map: s.map ?? null,
    emissive: s.emissive ? s.emissive.clone() : 0x000000, // emissivo acende no bloom (janelas, fogo, lâmpadas)
    emissiveMap: s.emissiveMap ?? null,
    emissiveIntensity: s.emissiveIntensity ?? 1,
    transparent: s.transparent,
    opacity: s.opacity,
    alphaTest: s.alphaTest,
    side: s.side,
    vertexColors,
    flatShading: !s.name.toLowerCase().endsWith('_liso'),
  });
  lambertCache.set(src, m);
  return m;
}

/** Prepara a cena vinda do glTF para virar molde: materiais Lambert e sombras. */
export function prepareTemplate(root: Object3D): Object3D {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const vc = !!mesh.geometry.getAttribute('color');
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((x) => toLambert(x, vc)) : toLambert(mesh.material, vc);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  return root;
}

/** Acha as peças animadas num clone e guarda em `userData` (clone não copia referências de objetos). */
export function linkParts(root: Object3D): void {
  for (const key of PARTS) {
    let found: Object3D | undefined;
    root.traverse((o) => { if (!found && o !== root && named(o, key)) found = o; });
    if (!found) continue;
    if (key === 'wheel' && found.parent) {
      // o jogo gira a roda no eixo X: um pivô no lugar dela preserva a rotação que veio do Blender
      const pivot = new Group();
      pivot.position.copy(found.position);
      found.parent.add(pivot);
      found.position.set(0, 0, 0);
      pivot.add(found);
      found = pivot;
    }
    root.userData[key] = found;
  }
}

/** Cópia nova de um modelo carregado (geometria e materiais compartilhados), ou null se não existe. */
export function cloneGlb(name: string): Object3D | null {
  const t = templates.get(name);
  if (!t) return null;
  const c = t.clone(true);
  c.userData = {};
  linkParts(c);
  return c;
}

/** Molde original (para as árvores, que viram instâncias). */
export const glbTemplate = (name: string): Object3D | null => templates.get(name) ?? null;

/** Registra um molde já pronto (usado pelo carregador e pelos testes). */
export function registerGlb(name: string, root: Object3D): void {
  templates.set(name, prepareTemplate(root));
  version++;
}

/** Começa a carregar os modelos em segundo plano. Pode chamar várias vezes; só carrega uma. */
export function loadGlbModels(base = import.meta.env.BASE_URL ?? '/'): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (new URLSearchParams(window.location.search).has('semglb')) return;
  void (async () => {
    let names: string[] = [];
    try {
      const res = await fetch(`${base}models/manifest.json`, { cache: 'no-cache' });
      if (!res.ok) return;
      const data = (await res.json()) as { modelos?: unknown };
      if (Array.isArray(data.modelos)) names = data.modelos.filter((n): n is string => typeof n === 'string' && /^[a-z0-9_]+$/.test(n));
    } catch {
      return; // sem manifesto: fica tudo nos modelos em código
    }
    if (!names.length) return;
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    await Promise.all(names.map(async (n) => {
      try {
        const gltf = await loader.loadAsync(`${base}models/${n}.glb`);
        registerGlb(n, gltf.scene);
      } catch (e) {
        console.warn(`[modelos] não carregou ${n}.glb, usando o modelo em código`, e);
      }
    }));
    console.info(`[modelos] ${templates.size}/${names.length} modelos do Blender carregados`);
  })();
}
