import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh,
  MeshLambertMaterial, Object3D, SphereGeometry, type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Job, Resource, Villager } from '../sim/types';
import { JOBS } from '../sim/types';
import type { World } from '../sim/world';
import { HAIRS, HATS, SHIRTS, SKINS, type HatId } from '../sim/looks';
import { HS } from './terrain';

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

/** Ferramenta de cada função, com a ponta de pé em y = 0 (a mão segura o meio do cabo). */
function toolGeometry(job: Job): BufferGeometry {
  const handle = paint(new BoxGeometry(0.022, 0.3, 0.022).translate(0, 0.02, 0), '#7a5230');
  const parts: BufferGeometry[] = [handle];
  switch (job) {
    case 'wood': parts.push(paint(new BoxGeometry(0.1, 0.07, 0.025).translate(0.05, 0.14, 0), '#9aa3ab')); break; // machado
    case 'stone': parts.push(paint(new BoxGeometry(0.16, 0.03, 0.03).translate(0, 0.16, 0), '#868e96')); break; // picareta
    case 'food': parts.push(paint(new BoxGeometry(0.09, 0.03, 0.025).translate(0.045, 0.16, 0), '#c0c6cc')); break; // enxada
    case 'water': parts.push(paint(new CylinderGeometry(0.05, 0.04, 0.07, 8).translate(0, -0.13, 0), '#339af0')); break; // balde
    default: parts.push(paint(new BoxGeometry(0.08, 0.055, 0.055).translate(0.02, 0.16, 0), '#5c6770')); // martelo
  }
  return mergeGeometries(parts)!;
}

/**
 * Aldeões em instâncias (poucas chamadas de desenho para centenas de gente): pernas que andam, torso na cor do viewer,
 * cabeça e cabelo variados, ferramenta da função na mão e uma coroa dourada para líder de profissão.
 */
export class People {
  private torso: InstancedMesh;
  private legs: InstancedMesh;
  private heads: InstancedMesh;
  private hair: InstancedMesh;
  private crowns: InstancedMesh;
  private loads: InstancedMesh;
  private tools: InstancedMesh[];
  private hats: InstancedMesh[];
  private d = new Object3D();
  private tmp = new Color();
  private cols = new Map<string, { sig: string; shirt: Color; pants: Color; skin: Color; hair: Color }>();
  private face = new Map<number, { x: number; y: number; a: number }>();
  private spread = new Map<number, { x: number; y: number }>(); // afastamento suave entre aldeões que dividem o tile
  private lastTime = 0;

  constructor(scene: Scene) {
    const lambert = (): MeshLambertMaterial => new MeshLambertMaterial({ flatShading: true });
    this.torso = new InstancedMesh(new CylinderGeometry(0.1, 0.125, 0.23, 6), lambert(), MAX);
    this.legs = new InstancedMesh(new BoxGeometry(0.065, 0.17, 0.07).translate(0, -0.085, 0), lambert(), MAX * 2);
    this.heads = new InstancedMesh(new IcosahedronGeometry(0.088, 0), lambert(), MAX);
    this.hair = new InstancedMesh(new SphereGeometry(0.094, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), lambert(), MAX);
    this.crowns = new InstancedMesh(new CylinderGeometry(0.075, 0.06, 0.06, 6), new MeshLambertMaterial({ color: '#ffd43b', flatShading: true, emissive: '#6b5200' }), MAX);
    this.loads = new InstancedMesh(new BoxGeometry(0.11, 0.11, 0.11), lambert(), MAX);
    const toolMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.tools = JOBS.map((j) => new InstancedMesh(toolGeometry(j), toolMat, MAX));
    this.hats = HATS.map((h) => new InstancedMesh(hatGeometry(h.id), toolMat, MAX));
    for (const m of [this.torso, this.legs, this.heads, this.hair, this.crowns, this.loads, ...this.tools, ...this.hats]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      scene.add(m);
    }
    this.heads.castShadow = this.hair.castShadow = this.loads.castShadow = false;
    this.d.rotation.order = 'YXZ';
  }

  private colorsFor(v: Villager): { shirt: Color; pants: Color; skin: Color; hair: Color } {
    const l = v.look;
    const sig = l ? `${l.skin}|${l.hair}|${l.shirt}` : '';
    let c = this.cols.get(v.userId);
    if (!c || c.sig !== sig) {
      const h = hashStr(v.userId);
      const shirt = new Color(l?.shirt !== undefined ? SHIRTS[l.shirt].color : v.color);
      c = {
        sig,
        shirt,
        pants: shirt.clone().multiplyScalar(0.45),
        skin: new Color(l?.skin !== undefined ? SKINS[l.skin].color : SKIN[h % SKIN.length]),
        hair: new Color(l?.hair !== undefined ? HAIRS[l.hair].color : v.npc ? '#8a8f94' : HAIR[(h >>> 5) % HAIR.length]),
      };
      this.cols.set(v.userId, c);
      if (this.cols.size > 2500) this.cols.clear();
    }
    return c;
  }

  update(world: World, time: number, at: (v: Villager) => { x: number; y: number }): void {
    const list = world.villagers.slice(0, MAX);
    const d = this.d;
    const toolCount = JOBS.map(() => 0);
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
      // direção do corpo: para onde ele andou por último
      let f = this.face.get(v.id);
      if (!f) { f = { x: base.x, y: base.y, a: (v.id * 2.399) % (Math.PI * 2) }; this.face.set(v.id, f); }
      const dx = base.x - f.x, dy = base.y - f.y;
      if (dx * dx + dy * dy > 1e-6) f.a = Math.atan2(dx, dy);
      f.x = base.x; f.y = base.y;
      const phase = time * 10 + v.id;
      const bob = moving ? Math.abs(Math.sin(phase)) * 0.03 : working ? Math.sin(time * 12 + v.id) * 0.015 : 0;
      const y = world.groundZ(q.x, q.y) * HS + bob;
      const c = this.colorsFor(v);
      const cs = Math.cos(f.a), sn = Math.sin(f.a);
      const sc = v.kid ? 0.68 : 1;
      const at3 = (lx: number, ly: number, lz: number): void => { d.position.set(q.x + (cs * lx + sn * lz) * sc, y + ly * sc, q.y + (-sn * lx + cs * lz) * sc); };

      d.scale.setScalar(sc);
      d.rotation.set(0, f.a, 0);
      at3(0, 0.285, 0); d.updateMatrix(); this.torso.setMatrixAt(i, d.matrix); this.torso.setColorAt(i, c.shirt);
      at3(0, 0.46, 0); d.updateMatrix(); this.heads.setMatrixAt(i, d.matrix); this.heads.setColorAt(i, c.skin);
      at3(0, 0.465, -0.012); d.updateMatrix(); this.hair.setMatrixAt(i, d.matrix); this.hair.setColorAt(i, c.hair);
      const crown = !v.npc && world.isLeader(v);
      at3(0, 0.575, 0); d.scale.setScalar(crown && !v.look?.hat ? sc : 0.0001); d.updateMatrix(); this.crowns.setMatrixAt(i, d.matrix);
      d.scale.setScalar(sc);

      const hi = v.look?.hat ? HATS.findIndex((h) => h.id === v.look!.hat) : -1;
      if (hi >= 0) {
        const hm = this.hats[hi];
        d.rotation.set(0, f.a, 0);
        at3(0, 0.535, -0.008); d.updateMatrix(); hm.setMatrixAt(hatCount[hi]++, d.matrix);
        d.rotation.set(0, f.a, 0);
      }
      const swing = moving ? Math.sin(phase) * 0.7 : 0;
      for (let s = -1; s <= 1; s += 2) {
        d.rotation.set(swing * s, f.a, 0);
        at3(0.045 * s, 0.17, 0); d.updateMatrix();
        this.legs.setMatrixAt(i * 2 + (s < 0 ? 0 : 1), d.matrix);
        this.legs.setColorAt(i * 2 + (s < 0 ? 0 : 1), c.pants);
      }

      d.rotation.set(0, f.a, 0);
      at3(-0.13, 0.3, 0.05); d.scale.setScalar(v.carryRes ? sc : 0.0001); d.updateMatrix(); this.loads.setMatrixAt(i, d.matrix);
      this.loads.setColorAt(i, this.tmp.set(v.carryRes ? LOAD_COLOR[v.carryRes] : '#ffffff'));
      d.scale.setScalar(sc);

      const ji = JOBS.indexOf(v.job);
      const tm = this.tools[ji];
      const k = toolCount[ji]++;
      d.rotation.set(working ? -0.9 + Math.sin(time * 9 + v.id) * 0.8 : -0.2, f.a, working ? 0 : -0.25);
      at3(0.14, 0.27, 0.05); d.updateMatrix(); tm.setMatrixAt(k, d.matrix);
    });
    const n = list.length;
    for (const m of [this.torso, this.heads, this.hair, this.crowns, this.loads]) m.count = n;
    this.legs.count = n * 2;
    this.tools.forEach((m, j) => { m.count = toolCount[j]; m.instanceMatrix.needsUpdate = true; });
    this.hats.forEach((m, j) => { m.count = hatCount[j]; m.instanceMatrix.needsUpdate = true; });
    for (const m of [this.torso, this.legs, this.heads, this.hair, this.crowns, this.loads]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (this.face.size > 3000) this.face.clear();
    if (this.spread.size > 3000) this.spread.clear();
  }
}
