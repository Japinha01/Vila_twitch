import {
  AdditiveBlending, CanvasTexture, Color, PointLight, Sprite, SpriteMaterial, type DirectionalLight, type HemisphereLight, type Scene,
} from 'three';
import { TICKS_PER_DAY } from '../sim/config';
import type { BuildingKind } from '../sim/types';
import type { World } from '../sim/world';
import { HS } from './terrain';

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 0 = dia claro, 1 = noite fechada. O dia começa de manhã; entardecer a ~60% e amanhecer a ~90%. */
export function nightAmount(tick: number): number {
  const p = (((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY) / TICKS_PER_DAY;
  return smooth(0.56, 0.7, p) * (1 - smooth(0.88, 0.99, p));
}

/** Prédios que acendem luz de noite, com a altura da janela e o tamanho do brilho. */
const LAMPS: Partial<Record<BuildingKind, { h: number; s: number; warm: string }>> = {
  house: { h: 0.45, s: 1.5, warm: '#ffb54a' },
  townhall: { h: 0.6, s: 2.4, warm: '#ffb54a' },
  market: { h: 0.55, s: 1.8, warm: '#ffc65c' },
  sawmill: { h: 0.45, s: 1.3, warm: '#ffb54a' },
  warehouse: { h: 0.4, s: 1.2, warm: '#ffb54a' },
  quarry: { h: 0.4, s: 1.1, warm: '#ffb54a' },
};
const MAX_LAMPS = 90;

function haloTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
}

/** Noite: escurece e esfria a luz, e acende brilho nas janelas e na fogueira (com uma luz de verdade no centro). */
export class NightFx {
  private halos: Sprite[] = [];
  private tex = haloTexture();
  private fire = new PointLight('#ff9a3c', 0, 9, 1.4);
  private night = 0;
  private tmp = new Color();

  constructor(private scene: Scene, private world: World) {
    this.fire.castShadow = false;
    scene.add(this.fire);
  }

  /** Mistura as luzes e o céu com a noite (chamar depois do clima, antes dos efeitos de evento). */
  applyLight(sun: DirectionalLight, hemi: HemisphereLight, bg: Color | null, fog: Color | null): void {
    const n = (this.night = nightAmount(this.world.tick));
    if (n <= 0.001) return;
    sun.color.lerp(this.tmp.set('#7a92d8'), n);
    sun.intensity *= 1 - 0.78 * n;
    hemi.color.lerp(this.tmp.set('#34466f'), n);
    hemi.intensity *= 1 - 0.35 * n;
    if (bg) { bg.lerp(this.tmp.set('#0b1224'), n * 0.85); fog?.copy(bg); }
  }

  update(now: number): void {
    const n = this.night;
    const w = this.world;
    let k = 0;
    this.fire.intensity = 0;
    if (n > 0.02) {
      const t = now;
      for (const b of w.buildings) {
        const lamp = LAMPS[b.kind];
        if (!lamp || !b.done || b.flooded || k >= MAX_LAMPS) continue;
        let s = this.halos[k];
        if (!s) {
          s = new Sprite(new SpriteMaterial({ map: this.tex, blending: AdditiveBlending, transparent: true, depthWrite: false }));
          s.renderOrder = 5;
          this.scene.add(s);
          this.halos[k] = s;
        }
        k++;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const flick = 0.88 + 0.12 * Math.sin(t * 7 + b.id * 1.7) * Math.sin(t * 3.1 + b.id);
        (s.material as SpriteMaterial).color.set(lamp.warm);
        (s.material as SpriteMaterial).opacity = Math.min(1, n * 1.1) * flick;
        s.scale.setScalar(lamp.s * (b.kind === 'townhall' && w.era < 2 ? 1.6 : 1));
        s.position.set(cx, w.groundZ(cx, cy) * HS + lamp.h, cy);
        s.visible = true;
        if (b.kind === 'townhall') {
          this.fire.position.set(cx, w.groundZ(cx, cy) * HS + 0.9, cy);
          this.fire.intensity = n * 6 * flick;
        }
      }
    }
    for (let i = k; i < this.halos.length; i++) this.halos[i].visible = false;
  }
}
