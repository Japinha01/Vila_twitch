import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, InstancedMesh, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, RingGeometry, Sprite, SpriteMaterial,
  type Camera, type Scene,
} from 'three';
import { MIN_HARVEST, NODE_MAX } from '../sim/config';
import type { Building, Resource, Villager } from '../sim/types';
import type { World } from '../sim/world';
import { COLORS, buildingStage, makeBuilding, makeBush, makeRock, mat } from './models';
import { TreeBatch } from './trees';
import { HS } from './terrain';

const MAX_VILLAGERS = 600;
const MAX_NAMES = 120; // acima disso a tela vira só texto
const LOAD_COLOR: Record<Resource, string> = { wood: '#a9743d', stone: '#868e96', food: '#e03131', water: '#339af0' };

/** Faz o grupo projetar sombra. */
const shade = (g: Group): void => g.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).castShadow = true; });

/** Variação estável por id (rotação, tamanho) sem usar aleatório. */
const hash01 = (id: number): number => ((Math.imul(id, 2654435761) >>> 0) % 1000) / 1000;

/** Mantém a cena 3D (prédios, árvores, pedras, aldeões) em sincronia com o mundo. */
export class SceneSync {
  private nodes = new Map<number, Group>();
  private trees: TreeBatch;
  private buildings = new Map<number, Group>();
  private bodies: InstancedMesh;
  private heads: InstancedMesh;
  private loads: InstancedMesh;
  private colors = new Map<number, Color>();
  private dummy = new Object3D();
  private tmp = new Color();
  private bars = new Map<number, Group>(); // barra de progresso das obras
  private floods = new Map<number, Mesh>(); // véu azul em prédio alagado
  /** nomes flutuando sobre os aldeões (overlay da live) */
  names = false;
  private nameSprites = new Map<number, Sprite>();
  private nameTex = new Map<string, CanvasTexture>();
  // interpolação entre ticks: a simulação anda a 10 passos/s; o vídeo, a 60 quadros/s
  private pos = new Map<number, { fx: number; fy: number; tx: number; ty: number; x: number; y: number }>();
  private lastTick = -1;
  private tickAt = 0;
  private interval = 0.1;
  private ring: Mesh;
  private label: Sprite | null = null;
  private labelFor = -1;
  private barBg = new MeshBasicMaterial({ color: '#212529', depthTest: false, transparent: true, opacity: 0.8 });
  private barFill = new MeshBasicMaterial({ color: '#fcc419', depthTest: false });
  private barBgGeo = new PlaneGeometry(1.2, 0.16);
  private barFillGeo = new PlaneGeometry(1.1, 0.09).translate(0.55, 0, 0);

  constructor(private scene: Scene, private world: World) {
    this.trees = new TreeBatch(scene);
    this.bodies = new InstancedMesh(new CylinderGeometry(0.11, 0.14, 0.34, 6), new MeshLambertMaterial({ flatShading: true }), MAX_VILLAGERS);
    this.heads = new InstancedMesh(new IcosahedronGeometry(0.1, 0), mat('#ffe0bd'), MAX_VILLAGERS);
    this.loads = new InstancedMesh(new BoxGeometry(0.11, 0.11, 0.11), new MeshLambertMaterial({ flatShading: true }), MAX_VILLAGERS);
    for (const m of [this.bodies, this.heads, this.loads]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      scene.add(m);
    }
    this.heads.castShadow = this.loads.castShadow = false;
    this.ring = new Mesh(new RingGeometry(0.28, 0.36, 24).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#ffd43b', side: DoubleSide, depthTest: false, transparent: true }));
    this.ring.renderOrder = 6;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  /**
   * Posição suave dos aldeões: a cada tick novo, parte de onde o aldeão está sendo mostrado e vai até a
   * posição nova no tempo médio entre ticks. Fica um tick atrasado, mas sem saltos (serve também para
   * o overlay, onde os "ticks" são os quadros recebidos).
   */
  private smoothPositions(time: number): void {
    const w = this.world;
    if (w.tick !== this.lastTick) {
      if (this.lastTick >= 0 && time > this.tickAt) this.interval = Math.min(0.4, Math.max(0.03, this.interval * 0.7 + (time - this.tickAt) * 0.3));
      this.lastTick = w.tick;
      this.tickAt = time;
      const seen = new Set<number>();
      for (const v of w.villagers) {
        seen.add(v.id);
        const p = this.pos.get(v.id);
        if (!p) { this.pos.set(v.id, { fx: v.x, fy: v.y, tx: v.x, ty: v.y, x: v.x, y: v.y }); continue; }
        const far = Math.abs(v.x - p.x) + Math.abs(v.y - p.y) > 4; // teleporte (expulso de prédio, vila nova): sem animação
        p.fx = far ? v.x : p.x;
        p.fy = far ? v.y : p.y;
        p.tx = v.x; p.ty = v.y;
      }
      for (const id of this.pos.keys()) if (!seen.has(id)) this.pos.delete(id);
    }
    const a = Math.min(1, (time - this.tickAt) / this.interval);
    for (const p of this.pos.values()) {
      p.x = p.fx + (p.tx - p.fx) * a;
      p.y = p.fy + (p.ty - p.fy) * a;
    }
  }

  /** Posição suavizada de um aldeão pelo id (para a câmera seguir sem tremer). */
  positionOf(id: number): { x: number; y: number } | null {
    const p = this.pos.get(id);
    return p ? { x: p.x, y: p.y } : null;
  }

  /** Posição mostrada do aldeão (suavizada). */
  private at(v: Villager): { x: number; y: number } {
    return this.pos.get(v.id) ?? v;
  }

  update(time: number, camera: Camera, selectedId: number | null): void {
    this.smoothPositions(time);
    this.syncNodes();
    this.syncBuildings(camera);
    this.syncVillagers(time);
    this.syncSelection(camera, selectedId);
    this.syncNames();
  }

  /** Textura do nome (uma por nome, reaproveitada). */
  private nameTexture(name: string): CanvasTexture {
    let t = this.nameTex.get(name);
    if (!t) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 56;
      const g = c.getContext('2d')!;
      g.font = 'bold 30px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(10,14,18,0.9)'; g.lineJoin = 'round';
      g.strokeText(name.slice(0, 18), 128, 30);
      g.fillStyle = '#fff';
      g.fillText(name.slice(0, 18), 128, 30);
      t = new CanvasTexture(c);
      this.nameTex.set(name, t);
      if (this.nameTex.size > 400) { for (const [k, v] of this.nameTex) { v.dispose(); this.nameTex.delete(k); if (this.nameTex.size <= 300) break; } }
    }
    return t;
  }

  private syncNames(): void {
    const list = this.names ? this.world.villagers.slice(0, MAX_NAMES) : [];
    const seen = new Set<number>();
    for (const v of list) {
      seen.add(v.id);
      let sp = this.nameSprites.get(v.id);
      const tex = this.nameTexture(v.name);
      if (!sp) {
        sp = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        sp.scale.set(1.8, 0.39, 1);
        sp.renderOrder = 7;
        this.scene.add(sp);
        this.nameSprites.set(v.id, sp);
      } else if ((sp.material as SpriteMaterial).map !== tex) {
        (sp.material as SpriteMaterial).map = tex;
        sp.material.needsUpdate = true;
      }
      const q = this.at(v);
      sp.position.set(q.x, this.world.groundZ(q.x, q.y) * HS + 0.78, q.y);
    }
    for (const [id, sp] of this.nameSprites) if (!seen.has(id)) { this.scene.remove(sp); sp.material.dispose(); this.nameSprites.delete(id); }
  }


  /** Anel e nome sobre o aldeão selecionado. */
  private syncSelection(camera: Camera, selectedId: number | null): void {
    const v = selectedId === null ? undefined : this.world.villagers.find((q) => q.id === selectedId);
    this.ring.visible = !!v;
    if (!v) { if (this.label) this.label.visible = false; return; }
    const q = this.at(v);
    const y = this.world.groundZ(q.x, q.y) * HS;
    this.ring.position.set(q.x, y + 0.03, q.y);
    if (this.labelFor !== v.id) {
      if (this.label) { this.scene.remove(this.label); (this.label.material as SpriteMaterial).map?.dispose(); }
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const g = c.getContext('2d')!;
      g.font = 'bold 30px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(20,24,28,0.8)';
      g.beginPath(); g.roundRect(8, 8, 240, 48, 14); g.fill();
      g.fillStyle = '#fff';
      g.fillText(v.name.slice(0, 16), 128, 33);
      this.label = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), depthTest: false, transparent: true }));
      this.label.scale.set(1.6, 0.4, 1);
      this.label.renderOrder = 7;
      this.scene.add(this.label);
      this.labelFor = v.id;
    }
    this.label!.visible = true;
    this.label!.position.set(q.x, y + 0.95, q.y);
    void camera;
  }

  private syncNodes(): void {
    const w = this.world;
    const seen = new Set<number>();
    this.trees.update(w, hash01); // árvores: instâncias
    for (const n of w.nodes) {
      if (n.kind === 'tree') continue;
      seen.add(n.id);
      let g = this.nodes.get(n.id);
      if (!g) {
        g = n.kind === 'bush' ? makeBush() : makeRock();
        g.rotation.y = hash01(n.id) * Math.PI * 2;
        shade(g);
        this.scene.add(g);
        this.nodes.set(n.id, g);
      }
      const i = w.idx(n.x, n.y);
      g.position.set(n.x + 0.5, w.height[i] * HS, n.y + 0.5);
      const dry = w.moisture[i] < 0.35;
      const grown = Math.min(1, n.amount / NODE_MAX[n.kind]);
      if (n.kind === 'bush') {
        g.scale.setScalar(0.55 + 0.45 * grown);
        for (const m of (g.userData.body as Group).children as Mesh[]) m.material = mat(dry ? COLORS.bushDry : COLORS.bush);
        (g.userData.berries as Group).visible = n.amount >= MIN_HARVEST;
      } else {
        g.scale.setScalar(0.65 + 0.35 * grown);
      }
    }
    for (const [id, g] of this.nodes) if (!seen.has(id)) { this.scene.remove(g); this.nodes.delete(id); }
  }

  private syncBuildings(camera: Camera): void {
    const w = this.world;
    const seen = new Set<number>();
    for (const b of w.buildings) {
      // represa pronta já virou terreno elevado (pedra), não precisa de modelo
      if (b.kind === 'dam' && b.done) continue;
      seen.add(b.id);
      let g = this.buildings.get(b.id);
      const stage = buildingStage(b.kind, w.era);
      if (g && g.userData.stage !== stage) { this.scene.remove(g); this.buildings.delete(b.id); g = undefined; } // a fogueira vira prefeitura
      if (!g) {
        g = makeBuilding(b.kind, w.era);
        g.userData.stage = stage;
        shade(g);
        this.scene.add(g);
        this.buildings.set(b.id, g);
      }
      g.position.set(b.x + b.w / 2, (b.kind === 'bridge' ? w.deckHeight(b.x, b.y) : w.height[w.idx(b.x, b.y)]) * HS, b.y + b.h / 2);
      // obra "sobe" conforme o progresso
      g.scale.y = b.done ? 1 : 0.12 + 0.88 * (b.progress / b.workNeeded);
      this.syncBar(b, g, camera);
      this.syncFlood(b, g);
      if (b.kind === 'farm') {
        const ok = w.irrigated[w.idx(b.x, b.y)] === 1;
        for (const r of (g.userData.rows as Group).children as Mesh[]) r.material = mat(ok ? COLORS.crop : COLORS.cropDry);
      } else if (b.kind === 'well') {
        (g.userData.water as Mesh).material = mat(w.buildingWorks(b) ? COLORS.water : '#495057');
      }
    }
    for (const [id, g] of this.buildings) if (!seen.has(id)) { this.scene.remove(g); this.buildings.delete(id); }
    for (const [id, g] of this.bars) if (!seen.has(id)) { this.scene.remove(g); this.bars.delete(id); }
    for (const [id, m] of this.floods) if (!seen.has(id)) { this.scene.remove(m); this.floods.delete(id); }
  }

  /** Barra de progresso flutuante, sempre de frente para a câmera. */
  private syncBar(b: Building, g: Group, camera: Camera): void {
    let bar = this.bars.get(b.id);
    if (b.done) { if (bar) bar.visible = false; return; }
    if (!bar) {
      bar = new Group();
      const bg = new Mesh(this.barBgGeo, this.barBg);
      const fill = new Mesh(this.barFillGeo, this.barFill);
      fill.position.set(-0.55, 0, 0.001);
      bg.renderOrder = 8; fill.renderOrder = 9;
      bar.add(bg, fill);
      bar.userData.fill = fill;
      this.scene.add(bar);
      this.bars.set(b.id, bar);
    }
    bar.visible = true;
    bar.position.set(g.position.x, g.position.y + 1.5, g.position.z);
    bar.quaternion.copy(camera.quaternion);
    (bar.userData.fill as Mesh).scale.x = Math.max(0.02, b.progress / b.workNeeded);
  }

  /** Véu azul translúcido sobre prédio alagado (desativado). */
  private syncFlood(b: Building, g: Group): void {
    let m = this.floods.get(b.id);
    if (!b.flooded) { if (m) m.visible = false; return; }
    if (!m) {
      m = new Mesh(new BoxGeometry(b.w, 0.5, b.h), new MeshBasicMaterial({ color: '#339af0', transparent: true, opacity: 0.45, depthWrite: false }));
      this.scene.add(m);
      this.floods.set(b.id, m);
    }
    m.visible = true;
    m.position.set(g.position.x, g.position.y + 0.25, g.position.z);
  }

  private syncVillagers(time: number): void {
    const w = this.world;
    const list = w.villagers.slice(0, MAX_VILLAGERS);
    const d = this.dummy;
    list.forEach((v: Villager, i: number) => {
      const moving = v.state === 'toTarget' || v.state === 'toStore';
      const bob = moving ? Math.abs(Math.sin(time * 9 + v.id)) * 0.04 : v.state === 'working' ? Math.sin(time * 12 + v.id) * 0.02 : 0;
      const q = this.at(v);
      const y = w.groundZ(q.x, q.y) * HS + bob;
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.position.set(q.x, y + 0.17, q.y);
      d.updateMatrix();
      this.bodies.setMatrixAt(i, d.matrix);
      d.position.set(q.x, y + 0.45, q.y);
      d.updateMatrix();
      this.heads.setMatrixAt(i, d.matrix);
      d.position.set(q.x + 0.12, y + 0.3, q.y + 0.05);
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
