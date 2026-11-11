import { InstancedMesh, Matrix4, Mesh, Object3D, Quaternion, Vector3, type Scene } from 'three';
import { GRID_H, GRID_W, MIN_HARVEST, NODE_MAX } from '../sim/config';
import type { World } from '../sim/world';
import { COLORS, TREE_KINDS, makeTreeKind, mat, treeKind } from './models';
import { TREE_GLB, glbTemplate, glbVersion, isFoliage } from './glb';
import { HS } from './terrain';

interface Part { variant: number; dry: boolean; leaf: boolean; mesh: InstancedMesh; local: Matrix4; n: number }

/**
 * Todas as árvores num punhado de InstancedMesh (uma chamada de desenho por peça e tipo), em vez de
 * centenas de grupos soltos. Folhagem seca usa um conjunto separado com a cor de seca.
 */
export class TreeBatch {
  private parts: Part[] = [];
  private frame = 0;
  private lastCount = -1;
  private m = new Matrix4();
  private q = new Quaternion();
  private p = new Vector3();
  private sc = new Vector3();
  private up = new Vector3(0, 1, 0);

  private built = -1;

  constructor(private scene: Scene, private capacity = GRID_W * GRID_H) {
    this.build();
  }

  /** Monta as instâncias a partir dos moldes: o modelo do Blender de cada tipo, se carregou, senão o feito em código. */
  private build(): void {
    for (const part of this.parts) { this.scene.remove(part.mesh); part.mesh.dispose(); }
    this.parts = [];
    this.built = glbVersion();
    this.lastCount = -1;
    for (let v = 0; v < TREE_KINDS; v++) {
      const glb = glbTemplate(TREE_GLB[v]);
      const tpl = glb ?? makeTreeKind(v);
      tpl.updateMatrixWorld(true);
      const leaves = glb ? null : new Set<Object3D>(tpl.userData.leaves as Object3D[]);
      const inv = new Matrix4().copy(tpl.matrixWorld).invert();
      tpl.traverse((child) => {
        const src = child as Mesh;
        if (!src.isMesh) return;
        const isLeaf = leaves ? leaves.has(child) : isFoliage(child, tpl);
        const local = inv.clone().multiply(src.matrixWorld);
        const make = (material: Mesh['material'], dry: boolean): void => {
          const mesh = new InstancedMesh(src.geometry, material, this.capacity);
          mesh.count = 0;
          mesh.castShadow = true;
          mesh.frustumCulled = false;
          this.scene.add(mesh);
          this.parts.push({ variant: v, dry, leaf: isLeaf, mesh, local, n: 0 });
        };
        make(src.material, false);
        if (isLeaf) make(mat(COLORS.leafDry), true);
      });
    }
  }

  /** Reposiciona as instâncias (a cada poucos quadros; as árvores mudam devagar). */
  update(w: World, hash01: (id: number) => number): void {
    if (this.built !== glbVersion()) this.build(); // chegou modelo do Blender
    const trees = w.nodes.filter((n) => n.kind === 'tree');
    if (this.frame++ % 8 !== 0 && trees.length === this.lastCount) return;
    this.lastCount = trees.length;
    for (const part of this.parts) part.n = 0;
    for (const n of trees) {
      const i = w.idx(n.x, n.y);
      const dry = w.moisture[i] < 0.35;
      const grown = Math.min(1, n.amount / NODE_MAX.tree);
      const k = (0.4 + 0.6 * grown) * (n.amount < MIN_HARVEST ? 0.7 : 1) * (0.9 + hash01(n.id) * 0.2);
      this.q.setFromAxisAngle(this.up, hash01(n.id) * Math.PI * 2);
      this.p.set(n.x + 0.5, w.height[i] * HS, n.y + 0.5);
      this.sc.set(k, k, k);
      this.m.compose(this.p, this.q, this.sc);
      const variant = treeKind(n.id);
      for (const part of this.parts) {
        if (part.variant !== variant || (part.dry && !dry) || (!part.dry && part.leaf && dry)) continue;
        part.mesh.setMatrixAt(part.n++, this.m.clone().multiply(part.local));
      }
    }
    for (const part of this.parts) {
      part.mesh.count = part.n;
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
