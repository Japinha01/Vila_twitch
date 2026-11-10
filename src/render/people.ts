import {
  BoxGeometry, BufferGeometry, type Camera, CircleGeometry, Color, CylinderGeometry, DynamicDrawUsage, Float32BufferAttribute,
  InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry,
  SRGBColorSpace, ShaderMaterial, type Scene, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Resource, Villager } from '../sim/types';
import { JOBS } from '../sim/types';
import type { World } from '../sim/world';
import { HAIRS, HATS, SHIRTS, SKINS, visibleLook, type HatId } from '../sim/looks';
import { HS } from './terrain';
import { SPRITE_FRAG, SPRITE_VERT, makeAtlas } from './sprites';

const MAX = 600;
const SKIN = SKINS.slice(0, 6).map((s) => s.color);
const HAIR = HAIRS.slice(0, 7).map((h) => h.color); // o padrão do ID só usa as cores naturais; azul e rosa são escolha do viewer
const LOAD_COLOR: Record<Resource, string> = { wood: '#a9743d', stone: '#868e96', food: '#e03131', water: '#339af0' };

const hashStr = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Pinta a geometria inteira de uma cor (cor por vértice) e a prepara para juntar com outras. */
function paint(g: BufferGeometry, hex: string): BufferGeometry {
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
  return g.index ? g.toNonIndexed() : g;
}

/** Chapéu: peças pintadas e juntas, com a base em y = 0 (assenta no topo da cabeça). */
function hatGeometry(id: HatId): BufferGeometry {
  const color = HATS.find((h) => h.id === id)!.color;
  const parts: BufferGeometry[] = [];
  switch (id) {
    case 'bone':
      parts.push(paint(new CylinderGeometry(0.085, 0.092, 0.05, 8).translate(0, 0.025, 0), color));
      parts.push(paint(new BoxGeometry(0.1, 0.012, 0.07).translate(0, 0.008, 0.095), color)); // aba da frente
      break;
    case 'palha':
      parts.push(paint(new CylinderGeometry(0.17, 0.17, 0.012, 10).translate(0, 0.006, 0), color));
      parts.push(paint(new CylinderGeometry(0.075, 0.085, 0.07, 8).translate(0, 0.045, 0), color));
      parts.push(paint(new CylinderGeometry(0.0765, 0.0865, 0.018, 8).translate(0, 0.03, 0), '#b4452c')); // fita
      break;
    case 'cartola':
      parts.push(paint(new CylinderGeometry(0.13, 0.13, 0.012, 10).translate(0, 0.006, 0), color));
      parts.push(paint(new CylinderGeometry(0.075, 0.08, 0.14, 8).translate(0, 0.082, 0), color));
      parts.push(paint(new CylinderGeometry(0.0805, 0.0855, 0.025, 8).translate(0, 0.03, 0), '#c92a2a'));
      break;
    case 'mago':
      parts.push(paint(new CylinderGeometry(0.14, 0.14, 0.012, 10).translate(0, 0.006, 0), color));
      parts.push(paint(new CylinderGeometry(0.01, 0.09, 0.2, 8).translate(0, 0.112, 0), color));
      parts.push(paint(new CylinderGeometry(0.092, 0.095, 0.02, 8).translate(0, 0.022, 0), '#ffd43b'));
      break;
  }
  return mergeGeometries(parts)!;
}

/**
 * Aldeões em estilo HD-2D (Octopath): sprites pixel art em pé, sempre de frente para a câmera, num mapa 3D.
 * Um único draw call para todos: o shader troca pele, cabelo, camisa e calça pela cor de cada viewer.
 * Chapéu, coroa, carga e sombra seguem em 3D simples por cima do sprite.
 */
const PX = 0.0275; // tamanho de um pixel do sprite no mundo
const BODY_H = 24 * PX;

export class People {
  private sprites: Mesh;
  private shadows: InstancedMesh;
  private crowns: InstancedMesh;
  private loads: InstancedMesh;
  private hats: InstancedMesh[];
  private attr: Record<'off' | 'cell' | 'flip' | 'scale' | 'skin' | 'hair' | 'shirt' | 'pants', InstancedBufferAttribute>;
  private uniforms = { uMap: { value: makeAtlas() }, uRight: { value: new Vector3(1, 0, 0) }, uPx: { value: PX }, uTint: { value: new Color(1, 1, 1) } };
  private right = new Vector3(1, 0, 0);
  private d = new Object3D();
  private tmp = new Color();
  private cols = new Map<string, { sig: string; shirt: Color; pants: Color; skin: Color; hair: Color }>();
  private face = new Map<number, { x: number; y: number; s: number }>();
  private spread = new Map<number, { x: number; y: number }>(); // afastamento suave entre aldeões que dividem o tile
  private lastTime = 0;

  constructor(scene: Scene) {
    const geo = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setIndex(quad.getIndex());
    const mk = (n: number): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(MAX * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.attr = { off: mk(3), cell: mk(2), flip: mk(1), scale: mk(1), skin: mk(3), hair: mk(3), shirt: mk(3), pants: mk(3) };
    geo.setAttribute('aOff', this.attr.off); geo.setAttribute('aCell', this.attr.cell); geo.setAttribute('aFlip', this.attr.flip);
    geo.setAttribute('aScale', this.attr.scale); geo.setAttribute('aSkin', this.attr.skin); geo.setAttribute('aHair', this.attr.hair);
    geo.setAttribute('aShirt', this.attr.shirt); geo.setAttribute('aPants', this.attr.pants);
    geo.instanceCount = 0;
    this.sprites = new Mesh(geo, new ShaderMaterial({ uniforms: this.uniforms, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG }));
    this.sprites.frustumCulled = false;
    scene.add(this.sprites);

    this.shadows = new InstancedMesh(new CircleGeometry(0.17, 10).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAX);
    this.crowns = new InstancedMesh(new CylinderGeometry(0.075, 0.06, 0.06, 6), new MeshLambertMaterial({ color: '#ffd43b', flatShading: true, emissive: '#6b5200' }), MAX);
    this.loads = new InstancedMesh(new BoxGeometry(0.11, 0.11, 0.11), new MeshLambertMaterial({ flatShading: true }), MAX);
    const toolMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.hats = HATS.map((h) => new InstancedMesh(hatGeometry(h.id), toolMat, MAX));
    for (const m of [this.shadows, this.crowns, this.loads, ...this.hats]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.d.rotation.order = 'YXZ';
  }

  /** Câmera e luz do quadro: o sprite é de frente para a câmera e escurece/esquenta com o clima. */
  setView(camera: Camera, tint: Color): void {
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    this.uniforms.uRight.value.copy(this.right);
    this.uniforms.uTint.value.copy(tint);
  }

  private colorsFor(v: Villager): { shirt: Color; pants: Color; skin: Color; hair: Color } {
    const l = v.look;
    const sig = l ? `${l.skin}|${l.hair}|${l.shirt}` : '';
    let c = this.cols.get(v.userId);
    if (!c || c.sig !== sig) {
      const h = hashStr(v.userId);
      const srgb = (hex: string, k = 1): Color => { const o = new Color(); new Color(hex).getRGB(o, SRGBColorSpace); return o.multiplyScalar(k); };
      const shirt = l?.shirt !== undefined ? SHIRTS[l.shirt].color : v.color;
      c = {
        sig,
        shirt: srgb(shirt),
        pants: srgb(shirt, 0.55),
        skin: srgb(l?.skin !== undefined ? SKINS[l.skin].color : SKIN[h % SKIN.length]),
        hair: srgb(l?.hair !== undefined ? HAIRS[l.hair].color : v.npc ? '#8a8f94' : HAIR[(h >>> 5) % HAIR.length]),
      };
      this.cols.set(v.userId, c);
      if (this.cols.size > 2500) this.cols.clear();
    }
    return c;
  }

  update(world: World, time: number, at: (v: Villager) => { x: number; y: number }): void {
    const list = world.villagers.slice(0, MAX);
    const d = this.d;
    const hatCount = HATS.map(() => 0);
    // quem divide o tile se espalha em espiral (só visual); o afastamento anda suave para ninguém "pular"
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const ease = 1 - Math.exp(-6 * dt);
    const rank = new Map<number, number>();
    const seen = new Map<number, number>();
    for (const v of list) {
      const p0 = at(v);
      const cell = Math.floor(p0.x) * 4096 + Math.floor(p0.y);
      const k = seen.get(cell) ?? 0;
      seen.set(cell, k + 1);
      rank.set(v.id, k);
    }
    const A = this.attr;
    const rx = this.right.x, rz = this.right.z;
    list.forEach((v, i) => {
      const base = at(v);
      const slot = rank.get(v.id) ?? 0;
      const ang = slot * 2.399 + (v.id % 7) * 0.3;
      const rad = Math.min(0.85, 0.22 * Math.sqrt(slot));
      let o = this.spread.get(v.id);
      if (!o) { o = { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad }; this.spread.set(v.id, o); }
      o.x += (Math.cos(ang) * rad - o.x) * ease;
      o.y += (Math.sin(ang) * rad - o.y) * ease;
      const q = { x: base.x + o.x, y: base.y + o.y };
      const moving = v.state === 'toTarget' || v.state === 'toStore';
      const working = v.state === 'working';
      // lado para onde olha: o último movimento projetado no eixo da câmera (direita = +1)
      let f = this.face.get(v.id);
      if (!f) { f = { x: base.x, y: base.y, s: v.id % 2 ? 1 : -1 }; this.face.set(v.id, f); }
      const dx = base.x - f.x, dy = base.y - f.y;
      if (dx * dx + dy * dy > 1e-6) { const side = dx * rx + dy * rz; if (Math.abs(side) > 1e-4) f.s = side > 0 ? 1 : -1; }
      f.x = base.x; f.y = base.y;
      const bob = moving ? Math.abs(Math.sin(time * 10 + v.id)) * 0.025 : 0;
      const y = world.groundZ(q.x, q.y) * HS;
      const c = this.colorsFor(v);
      const sc = v.kid ? 0.68 : 1;
      const frame = working ? 3 + (Math.floor(time * 3.5 + v.id) & 1) : moving ? 1 + (Math.floor(time * 6 + v.id) & 1) : 0;
      const ji = Math.max(0, JOBS.indexOf(v.job));

      A.off.setXYZ(i, q.x, y + bob, q.y);
      A.cell.setXY(i, frame, ji);
      A.flip.setX(i, f.s);
      A.scale.setX(i, sc);
      A.skin.setXYZ(i, c.skin.r, c.skin.g, c.skin.b);
      A.hair.setXYZ(i, c.hair.r, c.hair.g, c.hair.b);
      A.shirt.setXYZ(i, c.shirt.r, c.shirt.g, c.shirt.b);
      A.pants.setXYZ(i, c.pants.r, c.pants.g, c.pants.b);

      d.rotation.set(0, 0, 0);
      d.scale.setScalar(sc);
      d.position.set(q.x, y + 0.01, q.y); d.updateMatrix(); this.shadows.setMatrixAt(i, d.matrix);

      const look = visibleLook(v.look, v.xp);
      const hi = look?.hat ? HATS.findIndex((h) => h.id === look.hat) : -1;
      const crown = !v.npc && world.isLeader(v);
      const top = y + bob + (BODY_H - 0.015) * sc;
      d.position.set(q.x, top + 0.02 * sc, q.y); d.scale.setScalar(crown && hi < 0 ? sc : 0.0001); d.updateMatrix(); this.crowns.setMatrixAt(i, d.matrix);
      d.scale.setScalar(sc);
      if (hi >= 0) {
        d.position.set(q.x, top - 0.03 * sc, q.y); d.updateMatrix(); this.hats[hi].setMatrixAt(hatCount[hi]++, d.matrix);
      }
      // carga nas costas do lado oposto ao que olha
      d.position.set(q.x - rx * 0.13 * f.s * sc, y + bob + 0.3 * sc, q.y - rz * 0.13 * f.s * sc);
      d.scale.setScalar(v.carryRes ? sc : 0.0001); d.updateMatrix(); this.loads.setMatrixAt(i, d.matrix);
      this.loads.setColorAt(i, this.tmp.set(v.carryRes ? LOAD_COLOR[v.carryRes] : '#ffffff'));
    });
    const n = list.length;
    (this.sprites.geometry as InstancedBufferGeometry).instanceCount = n;
    for (const a of Object.values(A)) a.needsUpdate = true;
    for (const m of [this.shadows, this.crowns, this.loads]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
    if (this.loads.instanceColor) this.loads.instanceColor.needsUpdate = true;
    this.hats.forEach((m, j) => { m.count = hatCount[j]; m.instanceMatrix.needsUpdate = true; });
    if (this.face.size > 3000) this.face.clear();
    if (this.spread.size > 3000) this.spread.clear();
  }
}
