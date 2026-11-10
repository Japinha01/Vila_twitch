import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, LineBasicMaterial, LineSegments,
  Mesh, MeshLambertMaterial, Points, PointsMaterial, type DirectionalLight, type HemisphereLight, type Scene, type Vector3,
} from 'three';
import { GRID_H, GRID_W } from '../sim/config';
import type { EventKind } from '../sim/events';
import type { World } from '../sim/world';
import { HS } from './terrain';

/** Cor e escurecimento do céu em cada evento. */
const TINT: Partial<Record<EventKind, { color: string; mix: number; dim: number }>> = {
  rain: { color: '#6f8fb0', mix: 0.35, dim: 0.2 },
  storm: { color: '#3d4a63', mix: 0.55, dim: 0.45 },
  fire: { color: '#ff7a2e', mix: 0.35, dim: 0.1 },
  plague: { color: '#7fae5a', mix: 0.35, dim: 0.2 },
  harvest: { color: '#ffd76a', mix: 0.3, dim: 0 },
  festival: { color: '#ffc4f0', mix: 0.2, dim: 0 },
  arrival: { color: '#ffffff', mix: 0, dim: 0 },
  meteor: { color: '#ffb066', mix: 0.2, dim: 0.1 },
};

const DROPS = 900;
const MOTES = 520;
const CONFETTI = ['#ffd43b', '#ff8787', '#74c0fc', '#8ce99a', '#da77f2', '#ffa94d'].map((c) => new Color(c));
const fract = (x: number): number => x - Math.floor(x);

/**
 * Efeitos visuais dos eventos no 3D: chuva e tempestade (com relâmpagos), confete do festival, brilho da colheita,
 * névoa da praga, chamas do incêndio, meteoro com cratera de brasas, caravana e chegada de moradores.
 * Puramente visual: lê `world.event` e usa tempo real, nunca mexe na simulação.
 */
export class EventFx {
  private drops: LineSegments;
  private dropPos = new Float32Array(DROPS * 6);
  private dropSeed = new Float32Array(DROPS * 3);
  private motes: Points;
  private motePos = new Float32Array(MOTES * 3);
  private moteCol = new Float32Array(MOTES * 3);
  private seed = new Float32Array(MOTES * 2);
  private wagon: Group | null = null;
  private key = '';
  private startedAt = 0;
  private amt = 0;
  private col = new Color('#ffffff');
  private tmp = new Color();
  private nextBolt = 0;
  private bolt = 0;
  /** brilho momentâneo (relâmpago, impacto do meteoro) que o renderizador soma à luz */
  flash = 0;

  constructor(private scene: Scene, private world: World) {
    for (let i = 0; i < this.dropSeed.length; i++) this.dropSeed[i] = Math.random();
    for (let i = 0; i < this.seed.length; i++) this.seed[i] = Math.random();
    const dg = new BufferGeometry();
    dg.setAttribute('position', new BufferAttribute(this.dropPos, 3));
    this.drops = new LineSegments(dg, new LineBasicMaterial({ color: '#bcd8ff', transparent: true, opacity: 0.55, depthWrite: false }));
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    const mg = new BufferGeometry();
    mg.setAttribute('position', new BufferAttribute(this.motePos, 3));
    mg.setAttribute('color', new BufferAttribute(this.moteCol, 3));
    this.motes = new Points(mg, new PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true }));
    this.motes.frustumCulled = false;
    this.motes.visible = false;
    scene.add(this.drops, this.motes);
  }

  /** Quadro a quadro: atualiza partículas e devolve `true` se há algum efeito na tela. */
  update(now: number, target: Vector3): void {
    const ev = this.world.event;
    const kind = ev && this.world.tick < ev.until ? ev.kind : null;
    const key = kind ? `${kind}:${ev!.until}` : '';
    if (key !== this.key) { this.key = key; this.startedAt = now; this.nextBolt = now + 2; }
    const t = now - this.startedAt;
    this.amt += ((kind ? 1 : 0) - this.amt) * 0.03;
    if (kind && TINT[kind]) this.col.lerp(this.tmp.set(TINT[kind]!.color), 0.08);
    this.flash *= 0.88;

    const hall = this.world.townHall();
    const hx = hall.x + hall.w / 2, hy = hall.y + hall.h / 2;
    const gz = (x: number, y: number): number => this.world.groundZ(x, y) * HS;
    const hz = gz(hx, hy);

    // chuva e tempestade
    const rainy = kind === 'rain' || kind === 'storm';
    this.drops.visible = rainy;
    if (rainy) {
      const n = kind === 'storm' ? DROPS : Math.floor(DROPS * 0.6);
      const speed = kind === 'storm' ? 32 : 22, slant = kind === 'storm' ? 0.35 : 0.1;
      for (let i = 0; i < n; i++) {
        const sx = this.dropSeed[i * 3], sz = this.dropSeed[i * 3 + 1], sy = this.dropSeed[i * 3 + 2];
        const y = 26 - fract(sy + now * speed / 26) * 28;
        const x = target.x + (sx - 0.5) * 46 + (26 - y) * slant, z = target.z + (sz - 0.5) * 46;
        const o = i * 6;
        this.dropPos[o] = x; this.dropPos[o + 1] = target.y + y; this.dropPos[o + 2] = z;
        this.dropPos[o + 3] = x + slant * 0.9; this.dropPos[o + 4] = target.y + y + 0.9; this.dropPos[o + 5] = z;
      }
      this.drops.geometry.setDrawRange(0, n * 2);
      (this.drops.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      if (kind === 'storm') {
        if (now >= this.nextBolt) { this.bolt = 1; this.nextBolt = now + 3 + Math.random() * 6; }
        if (this.bolt > 0) { this.flash = Math.max(this.flash, 0.9 * this.bolt * (Math.random() < 0.5 ? 1 : 0.4)); this.bolt -= 0.12; }
      }
    }

    // partículas de brilho: confete, ouro, névoa, chamas, meteoro, chegada
    let on = true;
    const set = (i: number, x: number, y: number, z: number, c: Color | [number, number, number], k = 1): void => {
      this.motePos[i * 3] = x; this.motePos[i * 3 + 1] = y; this.motePos[i * 3 + 2] = z;
      if (Array.isArray(c)) { this.moteCol[i * 3] = c[0] * k; this.moteCol[i * 3 + 1] = c[1] * k; this.moteCol[i * 3 + 2] = c[2] * k; }
      else { this.moteCol[i * 3] = c.r * k; this.moteCol[i * 3 + 1] = c.g * k; this.moteCol[i * 3 + 2] = c.b * k; }
    };
    const hide = (i: number): void => set(i, 0, -200, 0, [0, 0, 0]);
    const mat = this.motes.material as PointsMaterial;
    mat.size = 0.28;
    if (kind === 'festival') {
      for (let i = 0; i < MOTES; i++) {
        const s1 = this.seed[i * 2], s2 = this.seed[i * 2 + 1], p = fract(s1 + now * 0.07);
        set(i, target.x + (s2 - 0.5) * 40 + Math.sin(now * 2 + i) * 0.6, target.y + 18 - p * 20, target.z + (fract(s1 * 7.3) - 0.5) * 40 + Math.cos(now * 1.7 + i) * 0.6, CONFETTI[i % CONFETTI.length], 0.9);
      }
    } else if (kind === 'harvest') {
      for (let i = 0; i < MOTES; i++) {
        const s1 = this.seed[i * 2], s2 = this.seed[i * 2 + 1], p = fract(s1 + now * 0.12);
        const x = target.x + (s2 - 0.5) * 36 + Math.sin(now + i) * 0.5, z = target.z + (fract(s1 * 5.1) - 0.5) * 36;
        set(i, x, gz(x, z) + 0.3 + p * 5, z, [1, 0.8, 0.25], 1 - p);
      }
    } else if (kind === 'plague') {
      mat.size = 0.9;
      for (let i = 0; i < MOTES / 2; i++) {
        const s1 = this.seed[i * 2], s2 = this.seed[i * 2 + 1], p = fract(s1 + now * 0.05);
        const x = hx + (s2 - 0.5) * 26 + Math.sin(now * 0.6 + i) * 1.4, z = hy + (fract(s1 * 9.7) - 0.5) * 26;
        set(i, x, gz(x, z) + 0.4 + p * 1.8, z, [0.25, 0.5, 0.12], Math.sin(p * Math.PI) * 0.8);
      }
      for (let i = MOTES / 2; i < MOTES; i++) hide(i);
    } else if (kind === 'fire') {
      mat.size = 0.4;
      const fx = hx + 1.5, fy = hy + 1.5; // o incêndio é no depósito, perto do centro
      for (let i = 0; i < MOTES; i++) {
        const s1 = this.seed[i * 2], s2 = this.seed[i * 2 + 1], p = fract(s1 + now * (0.6 + s2 * 0.5));
        const x = fx + (s2 - 0.5) * 3 * (1 - p * 0.5), z = fy + (fract(s1 * 3.3) - 0.5) * 3 * (1 - p * 0.5);
        set(i, x + Math.sin(now * 3 + i) * 0.2 * p, gz(fx, fy) + 0.2 + p * 6, z, [1, 0.55 - 0.4 * p, 0.08], (1 - p) * 1.1);
      }
    } else if (kind === 'meteor') {
      const ix = Math.min(GRID_W - 3, hx + 9), iy = Math.min(GRID_H - 3, hy + 4), iz = gz(ix, iy);
      const fall = 2.4;
      for (let i = 0; i < MOTES; i++) {
        const s1 = this.seed[i * 2], s2 = this.seed[i * 2 + 1];
        if (t < fall && i < 140) {
          const h = Math.min(1, t / fall) - i * 0.006; // cauda atrás da cabeça
          if (h < 0) { hide(i); continue; }
          set(i, ix - 22 * (1 - h) + (s2 - 0.5) * 0.3, iz + 26 * (1 - h) + (s1 - 0.5) * 0.3, iy - 8 * (1 - h), [1, 0.7 - 0.4 * (i / 140), 0.2], 1 - i / 160);
        } else if (t >= fall && t < fall + 9) {
          const p = fract((t - fall) * 0.35 + s1);
          const a = s2 * Math.PI * 2, r = p * (1 + s1 * 3);
          set(i, ix + Math.cos(a) * r, iz + 0.2 + Math.sin(p * Math.PI) * 2.4 * s1, iy + Math.sin(a) * r, [1, 0.5, 0.1], (1 - p) * Math.max(0, 1 - (t - fall) / 9));
        } else hide(i);
      }
      if (t >= fall && t < fall + 0.4) this.flash = Math.max(this.flash, 1.2);
    } else if (kind === 'arrival') {
      mat.size = 0.35;
      for (let i = 0; i < MOTES; i++) {
        const s1 = this.seed[i * 2], s2 = this.seed[i * 2 + 1], p = fract(s1 + now * 0.5);
        const a = s2 * Math.PI * 2, r = 0.5 + p * 4;
        set(i, hx + Math.cos(a) * r, hz + 0.2 + p * 5, hy + Math.sin(a) * r, CONFETTI[i % CONFETTI.length], 1 - p);
      }
    } else on = false;
    this.motes.visible = on;
    if (on) {
      (this.motes.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (this.motes.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
    }

    this.updateWagon(kind === 'caravan', t, hx, hy, gz);
  }

  /** Carroça da caravana: vem do oeste, para perto da prefeitura e depois vai embora. */
  private updateWagon(active: boolean, t: number, hx: number, hy: number, gz: (x: number, y: number) => number): void {
    if (!active || t > 50) { if (this.wagon) this.wagon.visible = false; return; }
    if (!this.wagon) this.wagon = makeWagon(), this.scene.add(this.wagon);
    const w = this.wagon;
    w.visible = true;
    const stopX = hx - 4, startX = Math.max(1, hx - 22);
    const arrive = Math.min(1, t / 18), leave = Math.max(0, (t - 32) / 18);
    const x = startX + (stopX - startX) * arrive - (stopX - startX) * leave;
    const y = hy + 3;
    w.position.set(x, gz(x, y) + 0.05, y);
    w.rotation.y = leave > 0 ? Math.PI : 0;
    w.children.forEach((c) => { if (c.userData.wheel) c.rotation.z -= (arrive < 1 || leave > 0 ? 0.12 : 0); });
  }

  /** Dá a cor do céu do evento ao sol, ao hemisfério e ao fundo (soma-se ao humor da estação). */
  applyLight(sun: DirectionalLight, hemi: HemisphereLight, bg: Color | null): void {
    const kind = this.world.event && this.world.tick < this.world.event.until ? this.world.event.kind : null;
    const tint = kind ? TINT[kind] : undefined;
    const k = this.amt;
    if (k > 0.01) {
      const mix = (tint?.mix ?? 0.2) * k, dim = (tint?.dim ?? 0) * k;
      sun.color.lerp(this.col, mix); hemi.color.lerp(this.col, mix);
      sun.intensity *= 1 - dim; hemi.intensity *= 1 - dim * 0.6;
      bg?.lerp(this.col, mix).multiplyScalar(1 - dim * 0.7);
    }
    hemi.intensity += this.flash * 1.4;
    sun.intensity += this.flash * 0.8;
  }
}

function makeWagon(): Group {
  const g = new Group();
  const wood = new MeshLambertMaterial({ color: '#8a5a2b' }), cloth = new MeshLambertMaterial({ color: '#f1e3c0' }), dark = new MeshLambertMaterial({ color: '#3b2a1a' }), fur = new MeshLambertMaterial({ color: '#8d8d8d' });
  const body = new Mesh(new BoxGeometry(1.6, 0.4, 0.9), wood); body.position.y = 0.55;
  const cover = new Mesh(new BoxGeometry(1.3, 0.55, 0.8), cloth); cover.position.set(-0.1, 0.98, 0);
  g.add(body, cover);
  for (const [x, z] of [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]]) {
    const wheel = new Mesh(new CylinderGeometry(0.28, 0.28, 0.08, 10), dark);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(x, 0.3, z * 1.0); wheel.userData.wheel = true;
    g.add(wheel);
  }
  const ox = new Mesh(new BoxGeometry(0.9, 0.5, 0.45), fur); ox.position.set(1.5, 0.55, 0);
  const head = new Mesh(new BoxGeometry(0.35, 0.3, 0.3), fur); head.position.set(2.1, 0.7, 0);
  g.add(ox, head);
  g.traverse((o) => { o.castShadow = true; });
  g.scale.setScalar(1.1);
  return g;
}
