import { GRID_H, GRID_W, MIN_HARVEST, NODE_MAX } from '../sim/config';
import type { Building, ResourceNode, Resource, Villager } from '../sim/types';
import type { World } from '../sim/world';
import { BUILDINGS } from '../sim/config';
import type { GameView, Ghost } from './view';

/** Projeção isométrica: tile (x, y, z) → tela. */
const TW = 64; // largura do losango do tile (px a escala 1)
const TH = 32;
const ZH = 14; // pixels por degrau de altura


type RGB = [number, number, number];
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

const GRASS = rgb('#76c957'), DRY = rgb('#c9b360');
const SOIL_L = '#9c6b3f', SOIL_R = '#835628';
const RES_COLOR: Record<Resource, string> = { wood: '#a9743d', stone: '#868e96', food: '#e03131', water: '#339af0' };

interface Drawable { key: number; draw: () => void }

export class Renderer implements GameView {
  private ctx: CanvasRenderingContext2D;
  private s = 1; // escala (zoom) em px de dispositivo
  private fitScale = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  ghost: Ghost | null = null;
  hoverTile: { x: number; y: number } | null = null;
  selectedId: number | null = null;

  constructor(private canvas: HTMLCanvasElement, private world: World) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
  }

  // ---------- câmera ----------
  private resize(): void {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(box.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(box.height * this.dpr));
    this.canvas.style.width = `${box.width}px`;
    this.canvas.style.height = `${box.height}px`;
    this.resetCamera();
  }

  resetCamera(): void {
    const minX = -GRID_H * TW / 2, maxX = GRID_W * TW / 2;
    const minY = -7 * ZH, maxY = (GRID_W + GRID_H) * TH / 2;
    this.fitScale = Math.min(this.canvas.width / (maxX - minX), this.canvas.height / (maxY - minY)) * 0.96;
    this.s = this.fitScale * 1.7;
    // centro entre a prefeitura e o rio
    const cx = ((23 - 16) * TW) / 2, cy = ((23 + 16) * TH) / 2 - 4 * ZH;
    this.ox = this.canvas.width / 2 - cx * this.s;
    this.oy = this.canvas.height / 2 - cy * this.s;
  }

  /** Centraliza a câmera num ponto do mundo (coordenadas de tile). */
  centerOn(x: number, y: number): void {
    const z = this.world.groundZ(x, y);
    this.ox = this.canvas.width / 2 - ((x - y) * TW / 2) * this.s;
    this.oy = this.canvas.height / 2 - ((x + y) * TH / 2 - z * ZH) * this.s;
  }

  panBy(dxCss: number, dyCss: number): void { this.ox += dxCss * this.dpr; this.oy += dyCss * this.dpr; }

  zoomAt(factor: number, cssX: number, cssY: number): void {
    const px = cssX * this.dpr, py = cssY * this.dpr;
    const ns = Math.min(this.fitScale * 4, Math.max(this.fitScale * 0.6, this.s * factor));
    const k = ns / this.s;
    this.ox = px - (px - this.ox) * k;
    this.oy = py - (py - this.oy) * k;
    this.s = ns;
  }

  private P(x: number, y: number, z: number): [number, number] {
    return [((x - y) * TW / 2) * this.s + this.ox, ((x + y) * TH / 2 - z * ZH) * this.s + this.oy];
  }

  /** Tile sob o ponteiro (coordenadas CSS do canvas), testando da frente para trás. */
  pickTile(cssX: number, cssY: number): { x: number; y: number } | null {
    const px = cssX * this.dpr, py = cssY * this.dpr;
    for (let d = GRID_W + GRID_H - 2; d >= 0; d--) {
      for (let x = Math.min(GRID_W - 1, d); x >= Math.max(0, d - (GRID_H - 1)); x--) {
        const y = d - x;
        const z = this.world.height[this.world.idx(x, y)];
        const a = this.P(x, y, z), b = this.P(x + 1, y, z), c = this.P(x + 1, y + 1, z), e = this.P(x, y + 1, z);
        const cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2;
        const hw = (b[0] - e[0]) / 2, hh = (c[1] - a[1]) / 2;
        if (Math.abs(px - cx) / hw + Math.abs(py - cy) / hh <= 1) return { x, y };
      }
    }
    return null;
  }

  // ---------- desenho ----------
  draw(): void {
    const { ctx, world: w } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#26323a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // passo 1: terreno, de trás para frente
    for (let d = 0; d <= GRID_W + GRID_H - 2; d++) {
      for (let x = Math.max(0, d - (GRID_H - 1)); x <= Math.min(GRID_W - 1, d); x++) this.drawGround(x, d - x);
    }
    // passo 2: água por cima do terreno
    for (let d = 0; d <= GRID_W + GRID_H - 2; d++) {
      for (let x = Math.max(0, d - (GRID_H - 1)); x <= Math.min(GRID_W - 1, d); x++) this.drawWater(x, d - x);
    }
    // passo 3: objetos ordenados por profundidade
    const list: Drawable[] = [];
    for (const n of w.nodes) list.push({ key: n.x + n.y + 1.01, draw: () => this.drawNode(n) });
    for (const b of w.buildings) {
      if (b.kind === 'dam' && b.done) continue; // represa pronta já é terreno elevado
      list.push({ key: b.x + b.y + (b.w + b.h) / 2 + 0.02, draw: () => this.drawBuilding(b) });
    }
    for (const v of w.villagers) list.push({ key: v.x + v.y, draw: () => this.drawVillager(v) });
    list.sort((a, b) => a.key - b.key);
    for (const o of list) o.draw();
    if (w.villagers.length <= 30) for (const v of w.villagers) this.drawLabel(v);

    this.drawOverlay();
  }

  private quad(a: [number, number], b: [number, number], c: [number, number], d: [number, number], fill: string, seam = true): void {
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    ctx.closePath();
    ctx.fill();
    if (!seam) return; // translúcidos (água) não levam contorno: ele apareceria como grade
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawGround(x: number, y: number): void {
    const w = this.world, i = w.idx(x, y);
    const z = w.height[i];
    const isDam = w.dam[i] === 1;
    const m = w.moisture[i];
    const lift = 1 + (z - 3) * 0.025;
    const top = isDam ? '#adb5bd' : mix(DRY.map((c) => c * lift) as RGB, GRASS.map((c) => c * lift) as RGB, 0.4 + 0.6 * m);
    const zr = x + 1 < GRID_W ? w.height[w.idx(x + 1, y)] : 0;
    const zl = y + 1 < GRID_H ? w.height[w.idx(x, y + 1)] : 0;
    if (zl < z) this.quad(this.P(x, y + 1, z), this.P(x + 1, y + 1, z), this.P(x + 1, y + 1, zl), this.P(x, y + 1, zl), isDam ? '#868e96' : SOIL_L);
    if (zr < z) this.quad(this.P(x + 1, y, z), this.P(x + 1, y + 1, z), this.P(x + 1, y + 1, zr), this.P(x + 1, y, zr), isDam ? '#6c757d' : SOIL_R);
    this.quad(this.P(x, y, z), this.P(x + 1, y, z), this.P(x + 1, y + 1, z), this.P(x, y + 1, z), top);
  }

  private drawWater(x: number, y: number): void {
    const w = this.world, i = w.idx(x, y);
    const dep = w.water[i];
    if (dep < 0.04) return;
    const z = w.height[i] + Math.min(dep, 2.5);
    const a = 0.55 + 0.25 * Math.min(1, dep);
    this.quad(this.P(x, y, z), this.P(x + 1, y, z), this.P(x + 1, y + 1, z), this.P(x, y + 1, z), `rgba(51,154,240,${a})`, false);
    // parede de água visível sobre degraus do leito
    const zr = x + 1 < GRID_W ? w.height[w.idx(x + 1, y)] + w.water[w.idx(x + 1, y)] : 0;
    const zl = y + 1 < GRID_H ? w.height[w.idx(x, y + 1)] + w.water[w.idx(x, y + 1)] : 0;
    if (zl < z - 0.02) this.quad(this.P(x, y + 1, z), this.P(x + 1, y + 1, z), this.P(x + 1, y + 1, zl), this.P(x, y + 1, zl), `rgba(34,139,230,${a})`, false);
    if (zr < z - 0.02) this.quad(this.P(x + 1, y, z), this.P(x + 1, y + 1, z), this.P(x + 1, y + 1, zr), this.P(x + 1, y, zr), `rgba(28,126,214,${a})`, false);
  }

  private circle(x: number, y: number, r: number, fill: string): void {
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  private u(): number { return this.s * 32; }

  private drawNode(n: ResourceNode): void {
    const w = this.world, i = w.idx(n.x, n.y);
    const [cx, cy] = this.P(n.x + 0.5, n.y + 0.5, w.height[i]);
    const u = this.u();
    if (n.kind === 'tree') {
      const k = 0.3 + 0.7 * Math.min(1, n.amount / NODE_MAX.tree);
      const sapling = n.amount < MIN_HARVEST;
      const leaf = mix(rgb('#a8a23a'), rgb('#2f9e44'), w.moisture[i]);
      const leaf2 = mix(rgb('#8f9a2e'), rgb('#37b24d'), w.moisture[i]);
      this.ctx.fillStyle = '#8d5a2b';
      this.ctx.fillRect(cx - u * 0.07, cy - u * 0.5 * k, u * 0.14, u * 0.5 * k);
      this.circle(cx, cy - u * 0.65 * k, u * (sapling ? 0.2 : 0.42) * k + u * 0.05, leaf);
      this.circle(cx - u * 0.05, cy - u * 0.78 * k, u * (sapling ? 0.14 : 0.3) * k + u * 0.03, leaf2);
    } else if (n.kind === 'bush') {
      const k = 0.4 + 0.6 * Math.min(1, n.amount / NODE_MAX.bush);
      this.circle(cx, cy - u * 0.15, u * 0.3 * k, mix(rgb('#8f9a2e'), rgb('#37b24d'), w.moisture[i]));
      if (n.amount >= MIN_HARVEST) {
        this.circle(cx - u * 0.1, cy - u * 0.2, u * 0.05, '#e03131');
        this.circle(cx + u * 0.1, cy - u * 0.12, u * 0.05, '#e03131');
      }
    } else {
      const k = 0.6 + 0.4 * Math.min(1, n.amount / NODE_MAX.rock);
      const { ctx } = this;
      ctx.fillStyle = '#adb5bd';
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.3 * k, cy); ctx.lineTo(cx - u * 0.2 * k, cy - u * 0.28 * k);
      ctx.lineTo(cx + u * 0.1 * k, cy - u * 0.36 * k); ctx.lineTo(cx + u * 0.32 * k, cy - u * 0.1 * k);
      ctx.lineTo(cx + u * 0.25 * k, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ced4da';
      ctx.beginPath(); ctx.moveTo(cx - u * 0.2 * k, cy - u * 0.28 * k); ctx.lineTo(cx + u * 0.1 * k, cy - u * 0.36 * k); ctx.lineTo(cx, cy - u * 0.12 * k); ctx.closePath(); ctx.fill();
    }
  }

  /** Caixa isométrica: faces +y (esquerda), +x (direita) e topo. */
  private box(x: number, y: number, w: number, h: number, z0: number, hgt: number, top: string, left: string, right: string): void {
    const z1 = z0 + hgt;
    this.quad(this.P(x, y + h, z1), this.P(x + w, y + h, z1), this.P(x + w, y + h, z0), this.P(x, y + h, z0), left);
    this.quad(this.P(x + w, y, z1), this.P(x + w, y + h, z1), this.P(x + w, y + h, z0), this.P(x + w, y, z0), right);
    this.quad(this.P(x, y, z1), this.P(x + w, y, z1), this.P(x + w, y + h, z1), this.P(x, y + h, z1), top);
  }

  /** Telhado em pirâmide sobre o retângulo (x,y,w,h) a partir de z0. */
  private roof(x: number, y: number, w: number, h: number, z0: number, rise: number, left: string, right: string): void {
    const { ctx } = this;
    const apex = this.P(x + w / 2, y + h / 2, z0 + rise);
    const tri = (a: [number, number], b: [number, number], fill: string): void => {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(apex[0], apex[1]); ctx.closePath(); ctx.fill();
    };
    tri(this.P(x - 0.1, y + h + 0.1, z0), this.P(x + w + 0.1, y + h + 0.1, z0), left);
    tri(this.P(x + w + 0.1, y - 0.1, z0), this.P(x + w + 0.1, y + h + 0.1, z0), right);
  }

  private drawBuilding(b: Building): void {
    const { ctx, world: wd } = this;
    const z0 = wd.height[wd.idx(b.x, b.y)];
    const { x, y, w, h } = b;
    ctx.save();
    if (!b.done) ctx.globalAlpha = 0.45 + 0.4 * (b.progress / b.workNeeded);
    switch (b.kind) {
      case 'townhall':
        this.box(x, y, w, h, z0, 1.6, '#f6ead0', '#f1dfb8', '#dcc89a');
        this.roof(x, y, w, h, z0 + 1.6, 1.5, '#fcc419', '#f08c00');
        { const [fx, fy] = this.P(x + w / 2, y + h / 2, z0 + 3.2); ctx.fillStyle = '#495057'; ctx.fillRect(fx - 1, fy - this.u() * 0.6, 2, this.u() * 0.6); ctx.fillStyle = '#e03131'; ctx.fillRect(fx + 1, fy - this.u() * 0.6, this.u() * 0.35, this.u() * 0.2); }
        break;
      case 'house':
        this.box(x + 0.1, y + 0.1, w - 0.2, h - 0.2, z0, 1.0, '#f8e9c8', '#f8e9c8', '#e2cf9f');
        this.roof(x + 0.1, y + 0.1, w - 0.2, h - 0.2, z0 + 1.0, 0.9, '#e8590c', '#c2410c');
        break;
      case 'warehouse':
        this.box(x + 0.05, y + 0.05, w - 0.1, h - 0.1, z0, 1.1, '#8a6a47', '#e3d3a4', '#c9b783');
        this.quad(this.P(x + 0.6, y + h - 0.05, z0 + 0.7), this.P(x + 1.4, y + h - 0.05, z0 + 0.7), this.P(x + 1.4, y + h - 0.05, z0), this.P(x + 0.6, y + h - 0.05, z0), '#6b4a2b');
        break;
      case 'sawmill': {
        this.box(x + 0.1, y + 0.1, w - 0.2, h - 0.2, z0, 0.9, '#d9a86c', '#b9824a', '#9d6b3b');
        const [sx, sy] = this.P(x + w / 2, y + h / 2, z0 + 0.9);
        this.circle(sx, sy, this.u() * 0.28, '#dee2e6'); this.circle(sx, sy, this.u() * 0.07, '#868e96');
        break;
      }
      case 'quarry': {
        this.box(x + 0.05, y + 0.05, w - 0.1, h - 0.1, z0, 0.25, '#868e96', '#6c757d', '#5c636a');
        const [qx, qy] = this.P(x + w / 2, y + h / 2, z0 + 0.25);
        this.circle(qx - this.u() * 0.2, qy, this.u() * 0.18, '#adb5bd'); this.circle(qx + this.u() * 0.18, qy + this.u() * 0.05, this.u() * 0.14, '#ced4da');
        break;
      }
      case 'farm': {
        const ok = wd.irrigated[wd.idx(x, y)] === 1;
        this.box(x + 0.05, y + 0.05, w - 0.1, h - 0.1, z0, 0.15, '#a9743d', '#8a5a2b', '#74481f');
        for (let r = 0; r < 4; r++) {
          const yy = y + 0.25 + r * 0.45;
          this.quad(this.P(x + 0.2, yy, z0 + 0.2), this.P(x + w - 0.2, yy, z0 + 0.2), this.P(x + w - 0.2, yy + 0.2, z0 + 0.2), this.P(x + 0.2, yy + 0.2, z0 + 0.2), ok ? '#82c91e' : '#d9c58a');
        }
        break;
      }
      case 'well': {
        const works = wd.irrigated[wd.idx(x, y)] === 1;
        this.box(x + 0.4, y + 0.4, 1.2, 1.2, z0, 0.5, works ? '#4dabf7' : '#495057', '#adb5bd', '#868e96');
        this.box(x + 0.4, y + 0.4, 0.12, 0.12, z0 + 0.5, 0.9, '#8d5a2b', '#8d5a2b', '#74481f');
        this.box(x + 1.48, y + 1.48, 0.12, 0.12, z0 + 0.5, 0.9, '#8d5a2b', '#8d5a2b', '#74481f');
        break;
      }
      case 'dam':
        this.box(x, y, w, h, z0, 1.2, '#adb5bd', '#868e96', '#6c757d');
        break;
    }
    ctx.restore();

    if (b.flooded) {
      let deep = 0;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) deep = Math.max(deep, wd.water[wd.idx(x + i, y + j)]);
      const z = z0 + Math.min(deep, 2.5);
      this.quad(this.P(x, y, z), this.P(x + w, y, z), this.P(x + w, y + h, z), this.P(x, y + h, z), 'rgba(51,154,240,0.45)', false);
      const [fx, fy] = this.P(x + w / 2, y + h / 2, z0 + 2.2);
      ctx.font = `700 ${this.u() * 0.5}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#e7f5ff';
      ctx.strokeStyle = '#1864ab'; ctx.lineWidth = 3; ctx.strokeText('🌊', fx, fy); ctx.fillText('🌊', fx, fy);
    }

    if (!b.done) {
      const a = this.P(x, y, z0), c = this.P(x + w, y, z0), d = this.P(x + w, y + h, z0), e = this.P(x, y + h, z0);
      ctx.strokeStyle = b.priority ? '#ffa94d' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(1.5, this.s * 2);
      ctx.setLineDash([this.s * 8, this.s * 5]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      const [bx, by] = this.P(x + w / 2, y + h / 2, z0 + 2);
      const bw = this.u() * 1.1, bh = this.u() * 0.14;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx - bw / 2, by, bw, bh);
      ctx.fillStyle = '#fab005'; ctx.fillRect(bx - bw / 2, by, bw * (b.progress / b.workNeeded), bh);
      if (b.priority) { ctx.fillStyle = '#ffa94d'; ctx.font = `700 ${this.u() * 0.4}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('★', bx, by - this.u() * 0.08); }
    }
  }

  private drawVillager(v: Villager): void {
    const { ctx, world: w } = this;
    const [x, y] = this.P(v.x, v.y, w.groundZ(v.x, v.y));
    const u = this.u(), r = u * 0.2;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = v.color;
    ctx.beginPath(); ctx.roundRect(x - r * 0.8, y - r * 1.6, r * 1.6, r * 1.6, r * 0.5); ctx.fill();
    this.circle(x, y - r * 2.05, r * 0.7, '#ffe3c4');
    if (v.carryRes) { ctx.fillStyle = RES_COLOR[v.carryRes]; ctx.fillRect(x + r * 0.6, y - r * 2.4, r * 0.9, r * 0.9); }
    if (v.state === 'working') this.circle(x - r * 1.2, y - r * 2.2, r * 0.25, '#fff');
    if (v.id === this.selectedId) {
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = Math.max(2, this.s * 2.5);
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  private drawLabel(v: Villager): void {
    const { ctx, world: w } = this;
    const [x, y] = this.P(v.x, v.y, w.groundZ(v.x, v.y));
    ctx.font = `600 ${Math.max(9, this.u() * 0.3)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.fillStyle = '#212529';
    ctx.strokeText(v.name, x, y - this.u() * 0.75);
    ctx.fillText(v.name, x, y - this.u() * 0.75);
  }

  /** Prévia de construção e destaque do tile sob o mouse. */
  private drawOverlay(): void {
    const w = this.world, { ctx } = this;
    if (this.ghost) {
      const g = this.ghost, spec = BUILDINGS[g.kind];
      const color = g.ok ? 'rgba(81,207,102,0.5)' : 'rgba(255,107,107,0.5)';
      for (let j = 0; j < spec.h; j++) {
        for (let i = 0; i < spec.w; i++) {
          const x = g.x + i, y = g.y + j;
          if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
          const z = w.height[w.idx(x, y)] + Math.min(w.water[w.idx(x, y)], 2.5) + 0.02;
          this.quad(this.P(x, y, z), this.P(x + 1, y, z), this.P(x + 1, y + 1, z), this.P(x, y + 1, z), color, false);
        }
      }
      if (g.x >= 0 && g.y >= 0 && g.x < GRID_W && g.y < GRID_H) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        this.box(g.x, g.y, spec.w, spec.h, w.height[w.idx(g.x, g.y)], g.kind === 'dam' ? 1.2 : 1, g.ok ? '#b2f2bb' : '#ffc9c9', g.ok ? '#8ce99a' : '#ffa8a8', g.ok ? '#69db7c' : '#ff8787');
        ctx.restore();
      }
    } else if (this.hoverTile) {
      const { x, y } = this.hoverTile;
      const z = w.height[w.idx(x, y)] + 0.02;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1.5, this.s * 2);
      const a = this.P(x, y, z), b = this.P(x + 1, y, z), c = this.P(x + 1, y + 1, z), d = this.P(x, y + 1, z);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.stroke();
    }
  }
}
