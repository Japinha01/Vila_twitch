import {
  Color, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, BoxGeometry, Mesh, MeshLambertMaterial,
  Object3D, type Scene,
} from 'three';
import { MIN_HARVEST, NODE_MAX } from '../sim/config';
import type { Resource, Villager } from '../sim/types';
import type { World } from '../sim/world';
import { COLORS, makeBuilding, makeBush, makeRock, makeTree, mat } from './models';
import { HS } from './terrain';

const MAX_VILLAGERS = 600;
const LOAD_COLOR: Record<Resource, string> = { wood: '#a9743d', stone: '#868e96', food: '#e03131', water: '#339af0' };

/** Variação estável por id (rotação, tamanho) sem usar aleatório. */
const hash01 = (id: number): number => ((Math.imul(id, 2654435761) >>> 0) % 1000) / 1000;

/** Mantém a cena 3D (prédios, árvores, pedras, aldeões) em sincronia com o mundo. */
export class SceneSync {
  private nodes = new Map<number, Group>();
  private buildings = new Map<number, Group>();
  private bodies: InstancedMesh;
  private heads: InstancedMesh;
  private loads: InstancedMesh;
  private colors = new Map<number, Color>();
  private dummy = new Object3D();
  private tmp = new Color();

  constructor(private scene: Scene, private world: World) {
    this.bodies = new InstancedMesh(new CylinderGeometry(0.11, 0.14, 0.34, 6), new MeshLambertMaterial({ flatShading: true }), MAX_VILLAGERS);
    this.heads = new InstancedMesh(new IcosahedronGeometry(0.1, 0), mat('#ffe0bd'), MAX_VILLAGERS);
    this.loads = new InstancedMesh(new BoxGeometry(0.11, 0.11, 0.11), new MeshLambertMaterial({ flatShading: true }), MAX_VILLAGERS);
    for (const m of [this.bodies, this.heads, this.loads]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  update(time: number): void {
    this.syncNodes();
    this.syncBuildings();
    this.syncVillagers(time);
  }

  private syncNodes(): void {
    const w = this.world;
    const seen = new Set<number>();
    for (const n of w.nodes) {
      seen.add(n.id);
      let g = this.nodes.get(n.id);
      if (!g) {
        g = n.kind === 'tree' ? makeTree() : n.kind === 'bush' ? makeBush() : makeRock();
        g.rotation.y = hash01(n.id) * Math.PI * 2;
        this.scene.add(g);
        this.nodes.set(n.id, g);
      }
      const i = w.idx(n.x, n.y);
      g.position.set(n.x + 0.5, w.height[i] * HS, n.y + 0.5);
      const dry = w.moisture[i] < 0.35;
      const grown = Math.min(1, n.amount / NODE_MAX[n.kind]);
      if (n.kind === 'tree') {
        const k = (0.4 + 0.6 * grown) * (n.amount < MIN_HARVEST ? 0.7 : 1) * (0.9 + hash01(n.id) * 0.2);
        g.scale.setScalar(k);
        for (const leaf of g.userData.leaves as Mesh[]) leaf.material = mat(dry ? COLORS.leafDry : COLORS.leaf);
      } else if (n.kind === 'bush') {
        g.scale.setScalar(0.55 + 0.45 * grown);
        (g.userData.body as Mesh).material = mat(dry ? COLORS.bushDry : COLORS.bush);
        (g.userData.berries as Group).visible = n.amount >= MIN_HARVEST;
      } else {
        g.scale.setScalar(0.65 + 0.35 * grown);
      }
    }
    for (const [id, g] of this.nodes) if (!seen.has(id)) { this.scene.remove(g); this.nodes.delete(id); }
  }

  private syncBuildings(): void {
    const w = this.world;
    const seen = new Set<number>();
    for (const b of w.buildings) {
      // represa pronta já virou terreno elevado (pedra), não precisa de modelo
      if (b.kind === 'dam' && b.done) continue;
      seen.add(b.id);
      let g = this.buildings.get(b.id);
      if (!g) {
        g = makeBuilding(b.kind);
        this.scene.add(g);
        this.buildings.set(b.id, g);
      }
      g.position.set(b.x + b.w / 2, w.height[w.idx(b.x, b.y)] * HS, b.y + b.h / 2);
      // obra "sobe" conforme o progresso
      g.scale.y = b.done ? 1 : 0.12 + 0.88 * (b.progress / b.workNeeded);
      if (b.kind === 'farm') {
        const ok = w.irrigated[w.idx(b.x, b.y)] === 1;
        for (const r of (g.userData.rows as Group).children as Mesh[]) r.material = mat(ok ? COLORS.crop : COLORS.cropDry);
      } else if (b.kind === 'well') {
        (g.userData.water as Mesh).material = mat(w.buildingWorks(b) ? COLORS.water : '#495057');
      }
    }
    for (const [id, g] of this.buildings) if (!seen.has(id)) { this.scene.remove(g); this.buildings.delete(id); }
  }

  private syncVillagers(time: number): void {
    const w = this.world;
    const list = w.villagers.slice(0, MAX_VILLAGERS);
    const d = this.dummy;
    list.forEach((v: Villager, i: number) => {
      const moving = v.state === 'toTarget' || v.state === 'toStore';
      const bob = moving ? Math.abs(Math.sin(time * 9 + v.id)) * 0.04 : v.state === 'working' ? Math.sin(time * 12 + v.id) * 0.02 : 0;
      const y = w.groundZ(v.x, v.y) * HS + bob;
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.position.set(v.x, y + 0.17, v.y);
      d.updateMatrix();
      this.bodies.setMatrixAt(i, d.matrix);
      d.position.set(v.x, y + 0.45, v.y);
      d.updateMatrix();
      this.heads.setMatrixAt(i, d.matrix);
      d.position.set(v.x + 0.12, y + 0.3, v.y + 0.05);
      d.scale.setScalar(v.carryRes ? 1 : 0.0001); // sem carga: some
      d.updateMatrix();
      this.loads.setMatrixAt(i, d.matrix);
      let c = this.colors.get(v.id);
      if (!c) { c = new Color(v.color); this.colors.set(v.id, c); }
      this.bodies.setColorAt(i, c);
      this.loads.setColorAt(i, this.tmp.set(v.carryRes ? LOAD_COLOR[v.carryRes] : '#ffffff'));
    });
    for (const m of [this.bodies, this.heads, this.loads]) {
      m.count = list.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (this.colors.size > 2000) this.colors.clear();
  }
}
