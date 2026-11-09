import { GRID_H, GRID_W } from '../sim/config';
import type { Building, ResourceNode, Resource, Villager } from '../sim/types';
import type { World } from '../sim/world';

const C = {
  grassA: '#8fd16e', grassB: '#89cb69', water: '#4dabf7', waterLight: '#74c0fc',
  trunk: '#8d5a2b', leaf: '#2f9e44', leafDark: '#2b8a3e',
  rock: '#adb5bd', rockLight: '#ced4da', bush: '#37b24d', berry: '#e03131',
  wall: '#f8e9c8', roof: '#e8590c', roofDark: '#c2410c', field: '#a9743d', crop: '#82c91e',
  stone: '#868e96', wood: '#b9824a', hall: '#fcc419', ink: 'rgba(33,37,41,0.75)',
};
const RES_COLOR: Record<Resource, string> = { wood: '#a9743d', stone: '#868e96', food: '#e03131', water: '#339af0' };

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private tile = 20;
  private ox = 0;
  private oy = 0;

  constructor(private canvas: HTMLCanvasElement, private world: World) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
  }

  private resize(): void {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(box.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(box.height * dpr));
    this.canvas.style.width = `${box.width}px`;
    this.canvas.style.height = `${box.height}px`;
    this.tile = Math.min(this.canvas.width / GRID_W, this.canvas.height / GRID_H);
    this.ox = (this.canvas.width - this.tile * GRID_W) / 2;
    this.oy = (this.canvas.height - this.tile * GRID_H) / 2;
  }

  draw(): void {
    const { ctx, tile: t, world: w } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#5fa84a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate(this.ox, this.oy);

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        ctx.fillStyle = (x + y) % 2 ? C.grassA : C.grassB;
        ctx.fillRect(x * t, y * t, t + 0.5, t + 0.5);
      }
    }
    // ordem de pintura: água/pedra/arbusto no chão, depois prédios, árvores e aldeões por profundidade
    for (const n of w.nodes) if (n.kind === 'water') this.drawWater(n);
    for (const n of w.nodes) if (n.kind === 'rock') this.drawRock(n);
    for (const n of w.nodes) if (n.kind === 'bush') this.drawBush(n);
    for (const b of w.buildings) this.drawBuilding(b);
    const depth: { y: number; draw: () => void }[] = [];
    for (const n of w.nodes) if (n.kind === 'tree') depth.push({ y: n.y + 1, draw: () => this.drawTree(n) });
    for (const v of w.villagers) depth.push({ y: v.y, draw: () => this.drawVillager(v) });
    depth.sort((a, b) => a.y - b.y);
    for (const d of depth) d.draw();
    if (w.villagers.length <= 40) for (const v of w.villagers) this.drawLabel(v);
  }

  private drawWater(n: ResourceNode): void {
    const { ctx, tile: t } = this;
    ctx.fillStyle = C.water;
    this.rr(n.x * t - 1, n.y * t - 1, t + 2, t + 2, t * 0.25);
    ctx.fillStyle = C.waterLight;
    ctx.fillRect(n.x * t + t * 0.25, n.y * t + t * 0.45, t * 0.4, t * 0.08);
  }

  private drawRock(n: ResourceNode): void {
    const { ctx, tile: t } = this;
    const k = 0.6 + 0.4 * Math.min(1, n.amount / 40);
    const cx = (n.x + 0.5) * t, cy = (n.y + 0.6) * t, r = t * 0.42 * k;
    ctx.fillStyle = C.rock;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + r * 0.6); ctx.lineTo(cx - r * 0.7, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.2, cy - r); ctx.lineTo(cx + r, cy - r * 0.1); ctx.lineTo(cx + r * 0.8, cy + r * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.rockLight;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy - r * 0.4); ctx.lineTo(cx + r * 0.2, cy - r * 0.9); ctx.lineTo(cx, cy - r * 0.1); ctx.closePath(); ctx.fill();
  }

  private drawBush(n: ResourceNode): void {
    const { ctx, tile: t } = this;
    const cx = (n.x + 0.5) * t, cy = (n.y + 0.55) * t, r = t * 0.36;
    ctx.fillStyle = C.bush;
    this.circle(cx, cy, r);
    ctx.fillStyle = C.berry;
    this.circle(cx - r * 0.4, cy - r * 0.2, r * 0.18);
    this.circle(cx + r * 0.35, cy + r * 0.1, r * 0.18);
    this.circle(cx, cy - r * 0.5, r * 0.18);
  }

  private drawTree(n: ResourceNode): void {
    const { ctx, tile: t } = this;
    const k = 0.7 + 0.3 * Math.min(1, n.amount / 40);
    const cx = (n.x + 0.5) * t, base = (n.y + 0.95) * t;
    ctx.fillStyle = C.trunk;
    ctx.fillRect(cx - t * 0.07, base - t * 0.4, t * 0.14, t * 0.4);
    ctx.fillStyle = C.leafDark;
    this.circle(cx, base - t * 0.55 * k, t * 0.38 * k);
    ctx.fillStyle = C.leaf;
    this.circle(cx - t * 0.05, base - t * 0.65 * k, t * 0.3 * k);
  }

  private drawBuilding(b: Building): void {
    const { ctx, tile: t } = this;
    const x = b.x * t, y = b.y * t, s = b.size * t;
    ctx.save();
    if (!b.done) ctx.globalAlpha = 0.45 + 0.4 * (b.progress / b.workNeeded);
    switch (b.kind) {
      case 'townhall': {
        ctx.fillStyle = C.wall; this.rr(x, y + s * 0.3, s, s * 0.7, t * 0.2);
        ctx.fillStyle = C.hall; ctx.beginPath(); ctx.moveTo(x - t * 0.2, y + s * 0.35); ctx.lineTo(x + s / 2, y - t * 0.2); ctx.lineTo(x + s + t * 0.2, y + s * 0.35); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.roofDark; ctx.fillRect(x + s * 0.43, y + s * 0.62, s * 0.14, s * 0.38);
        ctx.fillStyle = '#e03131'; ctx.fillRect(x + s / 2, y - t * 0.7, t * 0.5, t * 0.3); ctx.fillStyle = '#495057'; ctx.fillRect(x + s / 2 - 2, y - t * 0.7, 3, t * 0.9);
        break;
      }
      case 'house': case 'warehouse': {
        const wide = b.kind === 'warehouse';
        ctx.fillStyle = wide ? '#e9d7a8' : C.wall; this.rr(x + t * 0.1, y + s * 0.4, s - t * 0.2, s * 0.58, t * 0.12);
        ctx.fillStyle = wide ? '#7c5a3a' : C.roof;
        ctx.beginPath(); ctx.moveTo(x, y + s * 0.45); ctx.lineTo(x + s / 2, y + s * 0.05); ctx.lineTo(x + s, y + s * 0.45); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.roofDark; ctx.fillRect(x + s * 0.42, y + s * 0.65, s * 0.16, s * 0.33);
        break;
      }
      case 'farm': {
        ctx.fillStyle = C.field; this.rr(x + t * 0.05, y + t * 0.05, s - t * 0.1, s - t * 0.1, t * 0.15);
        ctx.fillStyle = C.crop;
        for (let i = 0; i < 4; i++) ctx.fillRect(x + t * 0.25, y + t * (0.3 + i * 0.45), s - t * 0.5, t * 0.16);
        break;
      }
      case 'well': {
        ctx.fillStyle = C.stone; this.circle(x + s / 2, y + s / 2, s * 0.38);
        ctx.fillStyle = C.water; this.circle(x + s / 2, y + s / 2, s * 0.24);
        ctx.fillStyle = C.trunk; ctx.fillRect(x + s * 0.2, y + s * 0.1, t * 0.1, s * 0.3); ctx.fillRect(x + s * 0.8 - t * 0.1, y + s * 0.1, t * 0.1, s * 0.3);
        ctx.fillRect(x + s * 0.2, y + s * 0.1, s * 0.6, t * 0.1);
        break;
      }
      case 'sawmill': {
        ctx.fillStyle = C.wood; this.rr(x + t * 0.1, y + s * 0.3, s - t * 0.2, s * 0.65, t * 0.12);
        ctx.fillStyle = '#dee2e6'; this.circle(x + s / 2, y + s * 0.6, s * 0.22);
        ctx.fillStyle = C.wood; this.circle(x + s / 2, y + s * 0.6, s * 0.06);
        break;
      }
      case 'quarry': {
        ctx.fillStyle = '#868e96'; this.rr(x + t * 0.05, y + t * 0.2, s - t * 0.1, s - t * 0.3, t * 0.25);
        ctx.fillStyle = '#adb5bd'; this.circle(x + s * 0.35, y + s * 0.55, s * 0.18); this.circle(x + s * 0.65, y + s * 0.6, s * 0.14);
        break;
      }
    }
    ctx.restore();
    if (!b.done) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.setLineDash([t * 0.2, t * 0.15]);
      ctx.strokeRect(x, y, s, s); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + s + 3, s, t * 0.18);
      ctx.fillStyle = '#fab005'; ctx.fillRect(x, y + s + 3, s * (b.progress / b.workNeeded), t * 0.18);
    }
  }

  private drawVillager(v: Villager): void {
    const { ctx, tile: t } = this;
    const x = v.x * t, y = v.y * t, r = t * 0.26;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = v.color; this.rr(x - r * 0.8, y - r * 0.3, r * 1.6, r * 1.3, r * 0.5);
    ctx.fillStyle = '#ffe3c4'; this.circle(x, y - r * 0.7, r * 0.7);
    if (v.carryRes) { ctx.fillStyle = RES_COLOR[v.carryRes]; ctx.fillRect(x + r * 0.5, y - r * 1.6, r * 0.9, r * 0.9); }
    if (v.state === 'working') { ctx.fillStyle = '#fff'; this.circle(x - r * 1.1, y - r * 1.4, r * 0.25); }
  }

  private drawLabel(v: Villager): void {
    const { ctx, tile: t } = this;
    ctx.font = `600 ${Math.max(9, t * 0.36)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.fillStyle = '#212529';
    ctx.strokeText(v.name, v.x * t, v.y * t - t * 0.6);
    ctx.fillText(v.name, v.x * t, v.y * t - t * 0.6);
  }

  private circle(x: number, y: number, r: number): void {
    this.ctx.beginPath(); this.ctx.arc(x, y, r, 0, Math.PI * 2); this.ctx.fill();
  }

  private rr(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath(); this.ctx.roundRect(x, y, w, h, r); this.ctx.fill();
  }
}
