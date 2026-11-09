import {
  BASE_POP_CAP, BASE_STORAGE, BUILDINGS, CARRY_CAPACITY, CONSUME_EVERY, GATHER_TICKS,
  GRID_H, GRID_W, HOUSE_POP, MOVE_SPEED, NODE_AMOUNT, QUARRY_BONUS, REACH, SAWMILL_BONUS,
  START_STOCK, STARVING_SLOWDOWN, SUPPORT_BONUS, SUPPORT_MAX_TICKS, SUPPORT_TICKS,
  TICKS_PER_DAY, WAREHOUSE_STORAGE,
} from './config';
import { hashString, mulberry32 } from './rng';
import {
  RESOURCES, type Building, type BuildingKind, type Job, type NodeKind, type Resource,
  type ResourceNode, type Stock, type Villager,
} from './types';

export type AddResult = { ok: true; villager: Villager } | { ok: false; reason: 'exists' | 'full' };
export type BuildResult =
  | { ok: true; building: Building }
  | { ok: false; reason: 'cost' | 'space'; missing?: Partial<Stock> };

const NODE_FOR_RESOURCE: Record<Resource, NodeKind> = {
  wood: 'tree', stone: 'rock', food: 'bush', water: 'water',
};

/**
 * Estado e regras da vila. Lógica pura: sem DOM, sem relógio real, sem Math.random.
 * Mesma seed + mesma sequência de chamadas = mesmo resultado.
 */
export class World {
  tick = 0;
  stock: Stock = { ...START_STOCK };
  villagers: Villager[] = [];
  buildings: Building[] = [];
  nodes: ResourceNode[] = [];
  supportUntil = 0;
  private nextId = 1;
  private occ: Uint8Array = new Uint8Array(GRID_W * GRID_H); // 1 = tile ocupado
  private events: string[] = [];
  private readonly rng: () => number;

  constructor(public readonly seed: number) {
    this.rng = mulberry32(seed);
    this.generate();
  }

  // ---------- consulta ----------
  get day(): number { return Math.floor(this.tick / TICKS_PER_DAY) + 1; }

  get popCap(): number {
    return BASE_POP_CAP + this.doneCount('house') * HOUSE_POP;
  }

  get storageCap(): number {
    return BASE_STORAGE + this.doneCount('warehouse') * WAREHOUSE_STORAGE;
  }

  get supportActive(): boolean { return this.tick < this.supportUntil; }

  get starving(): boolean { return this.stock.food <= 0 || this.stock.water <= 0; }

  doneCount(kind: BuildingKind): number {
    return this.buildings.filter((b) => b.kind === kind && b.done).length;
  }

  findVillager(userId: string): Villager | undefined {
    return this.villagers.find((v) => v.userId === userId);
  }

  drainEvents(): string[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- ações (chamadas pelo chat) ----------
  addVillager(userId: string, name: string, color: string): AddResult {
    if (this.findVillager(userId)) return { ok: false, reason: 'exists' };
    if (this.villagers.length >= this.popCap) return { ok: false, reason: 'full' };
    const hall = this.townHall();
    const a = this.rng() * Math.PI * 2;
    const v: Villager = {
      id: this.nextId++, userId, name, color,
      x: hall.x + hall.size / 2 + Math.cos(a) * 2.2,
      y: hall.y + hall.size / 2 + Math.sin(a) * 2.2,
      job: this.neediestResource(), state: 'idle', targetId: null,
      carry: 0, carryRes: null, workLeft: 0, xp: 0,
    };
    this.villagers.push(v);
    return { ok: true, villager: v };
  }

  setJob(userId: string, job: Job): boolean {
    const v = this.findVillager(userId);
    if (!v) return false;
    v.job = job;
    v.state = 'idle';
    v.targetId = null;
    return true;
  }

  requestBuild(kind: Exclude<BuildingKind, 'townhall'>): BuildResult {
    const spec = BUILDINGS[kind];
    const missing: Partial<Stock> = {};
    for (const r of RESOURCES) {
      const need = spec.cost[r] ?? 0;
      if (this.stock[r] < need) missing[r] = need - this.stock[r];
    }
    if (Object.keys(missing).length) return { ok: false, reason: 'cost', missing };
    const spot = this.findSpot(spec.size);
    if (!spot) return { ok: false, reason: 'space' };
    for (const r of RESOURCES) this.stock[r] -= spec.cost[r] ?? 0;
    const b = this.placeBuilding(kind, spot.x, spot.y, spec.size, spec.work, false);
    return { ok: true, building: b };
  }

  support(): void {
    this.supportUntil = Math.min(
      Math.max(this.supportUntil, this.tick) + SUPPORT_TICKS,
      this.tick + SUPPORT_MAX_TICKS,
    );
  }

  // ---------- simulação ----------
  step(): void {
    this.tick++;
    for (const v of this.villagers) this.stepVillager(v);
    if (this.tick % CONSUME_EVERY === 0) this.consume();
  }

  private consume(): void {
    const n = this.villagers.length;
    this.stock.food = Math.max(0, this.stock.food - n);
    this.stock.water = Math.max(0, this.stock.water - n);
  }

  private speedFactor(): number {
    let f = 1;
    if (this.starving) f *= STARVING_SLOWDOWN;
    if (this.supportActive) f *= SUPPORT_BONUS;
    return f;
  }

  private stepVillager(v: Villager): void {
    switch (v.state) {
      case 'idle': return this.decide(v);
      case 'toTarget': {
        const t = this.targetPos(v);
        if (!t) { v.state = 'idle'; v.targetId = null; return; }
        if (this.moveToward(v, t.x, t.y, t.reach)) {
          v.state = 'working';
          v.workLeft = v.job === 'build' ? Infinity : GATHER_TICKS;
        }
        return;
      }
      case 'working': return this.work(v);
      case 'toStore': {
        const hall = this.nearestStore(v);
        if (this.moveToward(v, hall.x + hall.size / 2, hall.y + hall.size / 2, hall.size / 2 + 0.8)) {
          if (v.carryRes) {
            this.stock[v.carryRes] = Math.min(this.storageCap, this.stock[v.carryRes] + v.carry);
            v.xp += v.carry;
          }
          v.carry = 0;
          v.carryRes = null;
          v.state = 'idle';
        }
        return;
      }
    }
  }

  private decide(v: Villager): void {
    if (v.job === 'build') {
      const site = this.nearestBy(v, this.buildings.filter((b) => !b.done), (b) => b.x + b.size / 2, (b) => b.y + b.size / 2);
      if (site) { v.targetId = site.id; v.state = 'toTarget'; }
      return;
    }
    const src = this.nearestSource(v, v.job);
    if (src) { v.targetId = src.id; v.state = 'toTarget'; }
  }

  private work(v: Villager): void {
    if (v.job === 'build') {
      const b = this.buildings.find((x) => x.id === v.targetId);
      if (!b || b.done) { v.state = 'idle'; v.targetId = null; return; }
      b.progress += this.speedFactor();
      if (b.progress >= b.workNeeded) {
        b.done = true;
        b.progress = b.workNeeded;
        this.events.push(`${BUILDINGS[b.kind as Exclude<BuildingKind, 'townhall'>].label} concluída!`);
        for (const o of this.villagers) {
          if (o.job === 'build' && o.targetId === b.id) { o.state = 'idle'; o.targetId = null; }
        }
      }
      return;
    }
    v.workLeft -= this.speedFactor();
    if (v.workLeft > 0) return;
    const res = v.job as Resource;
    let yieldAmt = CARRY_CAPACITY;
    if (res === 'wood' && this.doneCount('sawmill') > 0) yieldAmt *= SAWMILL_BONUS;
    if (res === 'stone' && this.doneCount('quarry') > 0) yieldAmt *= QUARRY_BONUS;
    yieldAmt = Math.round(yieldAmt);
    const node = this.nodes.find((n) => n.id === v.targetId);
    if (node) {
      yieldAmt = Math.min(yieldAmt, node.amount);
      node.amount -= yieldAmt;
      if (node.amount <= 0) this.removeNode(node);
    }
    v.carry = yieldAmt;
    v.carryRes = res;
    v.state = 'toStore';
    v.targetId = null;
  }

  // ---------- movimento e busca ----------
  private moveToward(v: Villager, tx: number, ty: number, reach: number): boolean {
    const dx = tx - v.x, dy = ty - v.y;
    const d = Math.hypot(dx, dy);
    if (d <= reach) return true;
    const step = Math.min(MOVE_SPEED, d - reach);
    v.x += (dx / d) * step;
    v.y += (dy / d) * step;
    return d - step <= reach + 1e-9;
  }

  private targetPos(v: Villager): { x: number; y: number; reach: number } | null {
    const b = this.buildings.find((x) => x.id === v.targetId);
    if (b) return { x: b.x + b.size / 2, y: b.y + b.size / 2, reach: b.size / 2 + 0.7 };
    const n = this.nodes.find((x) => x.id === v.targetId);
    if (n) return { x: n.x + 0.5, y: n.y + 0.5, reach: REACH };
    return null;
  }

  private nearestBy<T>(v: Villager, list: T[], gx: (t: T) => number, gy: (t: T) => number): T | undefined {
    let best: T | undefined;
    let bd = Infinity;
    for (const t of list) {
      const d = (gx(t) - v.x) ** 2 + (gy(t) - v.y) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  /** Fonte mais próxima: nó natural ou prédio produtor (fazenda → comida, poço → água). */
  private nearestSource(v: Villager, res: Resource): { id: number } | undefined {
    const kind = NODE_FOR_RESOURCE[res];
    const cands: { id: number; x: number; y: number }[] = [];
    for (const n of this.nodes) if (n.kind === kind && n.amount > 0) cands.push({ id: n.id, x: n.x + 0.5, y: n.y + 0.5 });
    const producer = res === 'food' ? 'farm' : res === 'water' ? 'well' : null;
    if (producer) {
      for (const b of this.buildings) {
        if (b.done && b.kind === producer) cands.push({ id: b.id, x: b.x + b.size / 2, y: b.y + b.size / 2 });
      }
    }
    return this.nearestBy(v, cands, (c) => c.x, (c) => c.y);
  }

  private nearestStore(v: Villager): Building {
    const stores = this.buildings.filter((b) => b.done && (b.kind === 'townhall' || b.kind === 'warehouse'));
    return this.nearestBy(v, stores, (b) => b.x + b.size / 2, (b) => b.y + b.size / 2)!;
  }

  /** Profissão inicial: o recurso mais escasso, descontando quem já trabalha nele (evita todo mundo na mesma função). */
  private neediestResource(): Resource {
    const score = (r: Resource): number =>
      this.stock[r] + 12 * this.villagers.filter((v) => v.job === r).length;
    let best: Resource = 'wood';
    for (const r of RESOURCES) if (score(r) < score(best)) best = r;
    return best;
  }

  // ---------- geração do mapa ----------
  townHall(): Building { return this.buildings[0]; }

  private idx(x: number, y: number): number { return y * GRID_W + x; }

  private isFree(x: number, y: number, size = 1): boolean {
    if (x < 1 || y < 1 || x + size > GRID_W - 1 || y + size > GRID_H - 1) return false;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (this.occ[this.idx(x + i, y + j)]) return false;
    return true;
  }

  private mark(x: number, y: number, size: number, val: number): void {
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) this.occ[this.idx(x + i, y + j)] = val;
  }

  private placeBuilding(kind: BuildingKind, x: number, y: number, size: number, work: number, done: boolean): Building {
    const b: Building = { id: this.nextId++, kind, x, y, size, progress: done ? work : 0, workNeeded: work, done };
    this.buildings.push(b);
    this.mark(x, y, size, 1);
    return b;
  }

  /** Procura um local livre numa malha de passo 3 (deixa vão entre prédios), do centro para fora. */
  private findSpot(size: number): { x: number; y: number } | null {
    const hall = this.townHall();
    const cx = hall.x, cy = hall.y;
    const cands: { x: number; y: number; d: number }[] = [];
    for (let j = -8; j <= 8; j++) {
      for (let i = -12; i <= 12; i++) {
        const x = cx + i * 3, y = cy + j * 3;
        if (i === 0 && j === 0) continue;
        cands.push({ x, y, d: (i * 3) ** 2 + (j * 3) ** 2 });
      }
    }
    cands.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    for (const c of cands) if (this.isFree(c.x, c.y, size)) return c;
    return null;
  }

  private addNode(kind: NodeKind, x: number, y: number, amount: number): void {
    this.nodes.push({ id: this.nextId++, kind, x, y, amount });
    this.occ[this.idx(x, y)] = 1;
  }

  private removeNode(n: ResourceNode): void {
    this.nodes.splice(this.nodes.indexOf(n), 1);
    this.occ[this.idx(n.x, n.y)] = 0;
  }

  private generate(): void {
    const cx = Math.floor(GRID_W / 2) - 1, cy = Math.floor(GRID_H / 2) - 1;
    this.placeBuilding('townhall', cx, cy, 3, 0, true);

    // lagoa num canto afastado do centro
    const px = 3 + Math.floor(this.rng() * 4);
    const py = 3 + Math.floor(this.rng() * 4);
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 5; i++) {
        const corner = (i === 0 || i === 4) && (j === 0 || j === 3);
        if (!corner && this.isFree(px + i, py + j)) this.addNode('water', px + i, py + j, Infinity);
      }
    }

    const scatter = (kind: NodeKind, count: number, amount: number, minDist: number): void => {
      let tries = 0;
      while (count > 0 && tries++ < 2000) {
        const x = 1 + Math.floor(this.rng() * (GRID_W - 2));
        const y = 1 + Math.floor(this.rng() * (GRID_H - 2));
        if (Math.hypot(x - cx - 1, y - cy - 1) < minDist || !this.isFree(x, y)) continue;
        this.addNode(kind, x, y, amount);
        count--;
      }
    };
    scatter('tree', 55, NODE_AMOUNT.tree, 5);
    scatter('rock', 16, NODE_AMOUNT.rock, 6);
    scatter('bush', 12, NODE_AMOUNT.bush, 5);
  }

  /** Cor estável por viewer, usada quando não há cor da Twitch. */
  static colorFor(userId: string): string {
    const h = hashString(userId) % 360;
    return `hsl(${h}, 70%, 55%)`;
  }
}
