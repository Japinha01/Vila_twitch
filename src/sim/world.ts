import {
  BASE_POP_CAP, BASE_STORAGE, BUILDINGS, CARRY_CAPACITY, CONSUME_EVERY, CONVEY, DAM_RAISE,
  DROUGHT_DAYS, EVAP_DROUGHT, EVAP_TEMPERATE, FLOW_EVERY, FLOW_FRACTION, GATHER_TICKS, GRID_H,
  GRID_W, HOUSE_POP, IRRIGATION_RADIUS, MIN_HARVEST, MOISTURE_RATE, MOVE_SPEED, NODE_MAX,
  QUARRY_BONUS, REACH, REGROW_EVERY, SAWMILL_BONUS, SOURCE_RATE, START_STOCK, STARVING_SLOWDOWN,
  SUPPORT_BONUS, SUPPORT_MAX_TICKS, SUPPORT_TICKS, TEMPERATE_DAYS, TICKS_PER_DAY, WAREHOUSE_STORAGE,
  WATER_SLOWDOWN, WELL_RANGE, WET_DEPTH,
} from './config';
import { hashString, mulberry32 } from './rng';
import {
  RESOURCES, type Building, type BuildingKind, type Job, type NodeKind, type Resource,
  type ResourceNode, type Stock, type Villager,
} from './types';

export type AddResult = { ok: true; villager: Villager } | { ok: false; reason: 'exists' | 'full' };
export type PlaceCheck = { ok: true } | { ok: false; reason: 'cost' | 'space'; missing?: Partial<Stock> };
export type BuildResult = { ok: true; building: Building } | Exclude<PlaceCheck, { ok: true }>;
export type PlaceableKind = Exclude<BuildingKind, 'townhall'>;
export interface Season { drought: boolean; daysLeft: number }

const N = GRID_W * GRID_H;
const MIN_W = 0.003;
const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

// deslocamentos para a irrigação (círculo de raio IRRIGATION_RADIUS)
const IRR_OFFSETS: [number, number][] = [];
for (let dy = -IRRIGATION_RADIUS; dy <= IRRIGATION_RADIUS; dy++) {
  for (let dx = -IRRIGATION_RADIUS; dx <= IRRIGATION_RADIUS; dx++) {
    if (dx * dx + dy * dy <= (IRRIGATION_RADIUS + 0.5) ** 2) IRR_OFFSETS.push([dx, dy]);
  }
}

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

  /** altura do chão por tile (unidades de degrau) */
  readonly height = new Float32Array(N);
  /** profundidade da água por tile */
  readonly water = new Float32Array(N);
  /** 0 (seco) a 1 (irrigado): suaviza a mudança de cor/solo */
  readonly moisture = new Float32Array(N);
  /** 1 = leito do rio (nasce, flui e é onde cabe represa) */
  readonly channel = new Uint8Array(N);
  /** 1 = represa concluída (terreno elevado, bloqueia o rio) */
  readonly dam = new Uint8Array(N);
  /** 1 = tile coberto pela zona de irrigação (perto de água) */
  readonly irrigated = new Uint8Array(N);

  private nextId = 1;
  private occ = new Uint8Array(N); // 1 = tile ocupado por nó/prédio
  private downstream = new Int32Array(N).fill(-1);
  private sources: number[] = [];
  private wet: number[] = [];
  private delta = new Float32Array(N);
  private flows = new Float32Array(4);
  private events: string[] = [];
  private prevDrought = false;
  private rx: number[] = []; // x esquerdo do leito por linha
  private readonly rng: () => number;

  constructor(public readonly seed: number) {
    this.rng = mulberry32(seed);
    this.generate();
  }

  // ---------- consulta ----------
  get day(): number { return Math.floor(this.tick / TICKS_PER_DAY) + 1; }
  get popCap(): number { return BASE_POP_CAP + this.doneCount('house') * HOUSE_POP; }
  get storageCap(): number { return BASE_STORAGE + this.doneCount('warehouse') * WAREHOUSE_STORAGE; }
  get supportActive(): boolean { return this.tick < this.supportUntil; }
  get starving(): boolean { return this.stock.food <= 0 || this.stock.water <= 0; }

  get season(): Season {
    const cycle = TEMPERATE_DAYS + DROUGHT_DAYS;
    const t = (this.tick / TICKS_PER_DAY) % cycle;
    return t < TEMPERATE_DAYS
      ? { drought: false, daysLeft: TEMPERATE_DAYS - t }
      : { drought: true, daysLeft: cycle - t };
  }

  idx(x: number, y: number): number { return y * GRID_W + x; }
  townHall(): Building { return this.buildings[0]; }
  doneCount(kind: BuildingKind): number { return this.buildings.filter((b) => b.kind === kind && b.done).length; }
  findVillager(userId: string): Villager | undefined { return this.villagers.find((v) => v.userId === userId); }
  isWet(i: number): boolean { return this.water[i] >= WET_DEPTH; }

  drainEvents(): string[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Altura do chão interpolada (para posicionar aldeões), em coordenadas de tile contínuas. */
  groundZ(x: number, y: number): number {
    const fx = Math.min(GRID_W - 1.001, Math.max(0, x - 0.5));
    const fy = Math.min(GRID_H - 1.001, Math.max(0, y - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const h = (a: number, b: number): number => this.height[this.idx(a, b)];
    return (h(x0, y0) * (1 - tx) + h(x0 + 1, y0) * tx) * (1 - ty) + (h(x0, y0 + 1) * (1 - tx) + h(x0 + 1, y0 + 1) * tx) * ty;
  }

  // ---------- ações dos viewers ----------
  addVillager(userId: string, name: string, color: string): AddResult {
    if (this.findVillager(userId)) return { ok: false, reason: 'exists' };
    if (this.villagers.length >= this.popCap) return { ok: false, reason: 'full' };
    const hall = this.townHall();
    const a = this.rng() * Math.PI * 2;
    const v: Villager = {
      id: this.nextId++, userId, name, color,
      x: hall.x + hall.w / 2 + Math.cos(a) * 2.3,
      y: hall.y + hall.h / 2 + Math.sin(a) * 2.3,
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

  support(): void {
    this.supportUntil = Math.min(Math.max(this.supportUntil, this.tick) + SUPPORT_TICKS, this.tick + SUPPORT_MAX_TICKS);
  }

  // ---------- ações do streamer ----------
  /** Valida a posição e o custo; usada pela prévia (fantasma) do painel. */
  canPlace(kind: PlaceableKind, x: number, y: number): PlaceCheck {
    const spec = BUILDINGS[kind];
    if (!this.spotOk(kind, x, y)) return { ok: false, reason: 'space' };
    const missing: Partial<Stock> = {};
    for (const r of RESOURCES) {
      const need = spec.cost[r] ?? 0;
      if (this.stock[r] < need) missing[r] = need - this.stock[r];
    }
    return Object.keys(missing).length ? { ok: false, reason: 'cost', missing } : { ok: true };
  }

  requestBuild(kind: PlaceableKind, x: number, y: number): BuildResult {
    const c = this.canPlace(kind, x, y);
    if (!c.ok) return c;
    const spec = BUILDINGS[kind];
    for (const r of RESOURCES) this.stock[r] -= spec.cost[r] ?? 0;
    return { ok: true, building: this.placeBuilding(kind, x, y, spec.w, spec.h, spec.work, false) };
  }

  /** Cancela uma obra em andamento e devolve os recursos. */
  cancelBuild(id: number): boolean {
    const b = this.buildings.find((x) => x.id === id);
    if (!b || b.done || b.kind === 'townhall') return false;
    const spec = BUILDINGS[b.kind];
    for (const r of RESOURCES) this.stock[r] = Math.min(this.storageCap, this.stock[r] + (spec.cost[r] ?? 0));
    this.buildings.splice(this.buildings.indexOf(b), 1);
    this.markRect(b.x, b.y, b.w, b.h, 0);
    for (const v of this.villagers) if (v.targetId === id) { v.state = 'idle'; v.targetId = null; }
    return true;
  }

  togglePriority(id: number): boolean {
    const b = this.buildings.find((x) => x.id === id);
    if (!b || b.done) return false;
    b.priority = !b.priority;
    return true;
  }

  buildingAt(x: number, y: number): Building | undefined {
    return this.buildings.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  }

  // ---------- simulação ----------
  step(): void {
    this.tick++;
    const drought = this.season.drought;
    if (drought !== this.prevDrought) {
      this.prevDrought = drought;
      this.events.push(drought ? '🔥 A seca começou! O rio secou: guardem água e protejam as plantações.' : '🌧 A seca acabou. A água voltou ao rio.');
    }
    if (this.tick % FLOW_EVERY === 0) this.flowStep(!drought);
    for (const v of this.villagers) this.stepVillager(v);
    if (this.tick % CONSUME_EVERY === 0) this.consume();
    if (this.tick % REGROW_EVERY === 0) this.regrow();
  }

  private consume(): void {
    const n = this.villagers.length;
    this.stock.food = Math.max(0, this.stock.food - n);
    this.stock.water = Math.max(0, this.stock.water - n);
  }

  private regrow(): void {
    for (const n of this.nodes) {
      if (n.kind === 'rock' || n.amount >= NODE_MAX[n.kind]) continue;
      if (this.irrigated[this.idx(n.x, n.y)]) n.amount += 1;
    }
  }

  // ---------- água ----------
  private flowStep(sourcesOn: boolean): void {
    const w = this.water, h = this.height, d = this.delta, f = this.flows;
    if (sourcesOn) for (const s of this.sources) w[s] += SOURCE_RATE;

    // 1) escorrimento: cada tile entrega parte da diferença de nível aos vizinhos mais baixos
    d.fill(0);
    for (let i = 0; i < N; i++) {
      const wi = w[i];
      if (wi < MIN_W) continue;
      const si = h[i] + wi;
      const x = i % GRID_W, y = (i - x) / GRID_W;
      let total = 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        f[k] = 0;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const j = ny * GRID_W + nx;
        const diff = si - (h[j] + w[j]);
        if (diff > 0.002) { f[k] = diff * FLOW_FRACTION; total += f[k]; }
      }
      if (total <= 0) continue;
      const scale = total > wi ? wi / total : 1;
      for (let k = 0; k < 4; k++) {
        if (f[k] === 0) continue;
        const j = (y + DY[k]) * GRID_W + (x + DX[k]);
        const out = f[k] * scale;
        d[i] -= out;
        d[j] += out;
      }
    }
    for (let i = 0; i < N; i++) w[i] = Math.max(0, w[i] + d[i]);

    // 2) correnteza: a água do leito avança rio abaixo, exceto contra represas
    d.fill(0);
    for (let i = 0; i < N; i++) {
      const j = this.downstream[i];
      if (j < 0 || this.dam[j] || w[i] < MIN_W) continue;
      const move = w[i] * CONVEY;
      d[i] -= move;
      d[j] += move;
    }
    for (let i = 0; i < N; i++) w[i] = Math.max(0, w[i] + d[i]);

    // 3) ralo na borda sul, represa seca o tile e evaporação
    const evap = sourcesOn ? EVAP_TEMPERATE : EVAP_DROUGHT;
    for (let i = 0; i < N; i++) {
      if (i >= N - GRID_W || this.dam[i]) w[i] = 0;
      else if (w[i] > 0) w[i] = w[i] - evap < MIN_W ? 0 : w[i] - evap;
    }

    // 4) irrigação e umidade do solo
    this.wet.length = 0;
    for (let i = 0; i < N; i++) if (w[i] >= WET_DEPTH) this.wet.push(i);
    this.irrigated.fill(0);
    for (const i of this.wet) {
      const x = i % GRID_W, y = (i - x) / GRID_W;
      for (const [ox, oy] of IRR_OFFSETS) {
        const nx = x + ox, ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < GRID_W && ny < GRID_H) this.irrigated[ny * GRID_W + nx] = 1;
      }
    }
    for (let i = 0; i < N; i++) {
      const m = this.moisture[i] + (this.irrigated[i] ? MOISTURE_RATE : -MOISTURE_RATE);
      this.moisture[i] = m < 0 ? 0 : m > 1 ? 1 : m;
    }
  }

  // ---------- aldeões ----------
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
        if (!t || !this.targetValid(v)) { v.state = 'idle'; v.targetId = null; return; }
        if (this.moveToward(v, t.x, t.y, t.reach)) {
          v.state = 'working';
          v.workLeft = v.job === 'build' ? Infinity : GATHER_TICKS;
        }
        return;
      }
      case 'working': return this.work(v);
      case 'toStore': {
        const hall = this.nearestStore(v);
        if (this.moveToward(v, hall.x + hall.w / 2, hall.y + hall.h / 2, Math.max(hall.w, hall.h) / 2 + 0.8)) {
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
      const sites = this.buildings.filter((b) => !b.done);
      if (!sites.length) return;
      const pri = sites.filter((b) => b.priority);
      const pool = pri.length ? pri : sites;
      const site = this.nearestBy(v, pool, (b) => b.x + b.w / 2, (b) => b.y + b.h / 2);
      if (site) { v.targetId = site.id; v.state = 'toTarget'; }
      return;
    }
    const src = this.nearestSource(v, v.job);
    if (src !== undefined) { v.targetId = src; v.state = 'toTarget'; }
  }

  private work(v: Villager): void {
    if (v.job === 'build') {
      const b = this.buildings.find((x) => x.id === v.targetId);
      if (!b || b.done) { v.state = 'idle'; v.targetId = null; return; }
      b.progress += this.speedFactor();
      if (b.progress >= b.workNeeded) this.finish(b);
      return;
    }
    if (!this.targetValid(v)) { v.state = 'idle'; v.targetId = null; return; }
    v.workLeft -= this.speedFactor();
    if (v.workLeft > 0) return;
    const res = v.job as Resource;
    let amt = CARRY_CAPACITY;
    if (res === 'wood' && this.doneCount('sawmill') > 0) amt *= SAWMILL_BONUS;
    if (res === 'stone' && this.doneCount('quarry') > 0) amt *= QUARRY_BONUS;
    amt = Math.round(amt);
    const node = this.nodes.find((n) => n.id === v.targetId);
    if (node) {
      amt = Math.min(amt, node.amount);
      node.amount -= amt;
      if (node.kind === 'rock' && node.amount <= 0) this.removeNode(node);
    }
    v.carry = amt;
    v.carryRes = res;
    v.state = 'toStore';
    v.targetId = null;
  }

  private finish(b: Building): void {
    b.done = true;
    b.progress = b.workNeeded;
    if (b.kind === 'dam') {
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
        const t = this.idx(b.x + i, b.y + j);
        this.height[t] += DAM_RAISE;
        this.dam[t] = 1;
        this.water[t] = 0;
      }
    }
    this.events.push(`${BUILDINGS[b.kind as PlaceableKind].label} concluída!`);
    for (const o of this.villagers) {
      if (o.job === 'build' && o.targetId === b.id) { o.state = 'idle'; o.targetId = null; }
    }
  }

  private moveToward(v: Villager, tx: number, ty: number, reach: number): boolean {
    const dx = tx - v.x, dy = ty - v.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= reach) return true;
    const inWater = this.water[this.idx(Math.min(GRID_W - 1, Math.max(0, Math.floor(v.x))), Math.min(GRID_H - 1, Math.max(0, Math.floor(v.y))))] > 0.3;
    const step = Math.min(MOVE_SPEED * (inWater ? WATER_SLOWDOWN : 1), dist - reach);
    v.x += (dx / dist) * step;
    v.y += (dy / dist) * step;
    return dist - step <= reach + 1e-9;
  }

  private targetPos(v: Villager): { x: number; y: number; reach: number } | null {
    const id = v.targetId;
    if (id === null) return null;
    if (id < 0) {
      const i = -id - 1;
      return { x: (i % GRID_W) + 0.5, y: Math.floor(i / GRID_W) + 0.5, reach: REACH };
    }
    const b = this.buildings.find((x) => x.id === id);
    if (b) return { x: b.x + b.w / 2, y: b.y + b.h / 2, reach: Math.max(b.w, b.h) / 2 + 0.7 };
    const n = this.nodes.find((x) => x.id === id);
    if (n) return { x: n.x + 0.5, y: n.y + 0.5, reach: REACH };
    return null;
  }

  /** O alvo ainda serve? (a seca pode ter secado o poço, a fazenda ou a margem) */
  private targetValid(v: Villager): boolean {
    const id = v.targetId;
    if (id === null) return false;
    if (v.job === 'build') return true;
    if (id < 0) return this.water[-id - 1] >= WET_DEPTH * 0.6;
    const b = this.buildings.find((x) => x.id === id);
    if (b) return b.done && this.buildingWorks(b);
    const n = this.nodes.find((x) => x.id === id);
    return !!n && this.nodeHarvestable(n);
  }

  private nodeHarvestable(n: ResourceNode): boolean {
    return n.kind === 'rock' ? n.amount > 0 : n.amount >= MIN_HARVEST;
  }

  private buildingWorks(b: Building): boolean {
    if (b.kind === 'farm') return this.irrigated[this.idx(b.x, b.y)] === 1;
    if (b.kind === 'well') return this.waterNear(b.x + b.w / 2, b.y + b.h / 2, WELL_RANGE);
    return false;
  }

  private waterNear(cx: number, cy: number, range: number): boolean {
    for (const i of this.wet) {
      const x = (i % GRID_W) + 0.5, y = Math.floor(i / GRID_W) + 0.5;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= range * range) return true;
    }
    return false;
  }

  private slotsFree(b: Building): boolean {
    const slots = BUILDINGS[b.kind as PlaceableKind]?.slots;
    if (!slots) return true;
    let used = 0;
    for (const v of this.villagers) {
      if (v.targetId === b.id && (v.state === 'toTarget' || v.state === 'working')) used++;
    }
    return used < slots;
  }

  /** Fonte mais próxima para um recurso. Devolve id de nó/prédio, ou -(tile+1) para água do rio. */
  private nearestSource(v: Villager, res: Resource): number | undefined {
    const c: { id: number; x: number; y: number }[] = [];
    if (res === 'wood' || res === 'stone' || res === 'food') {
      const kind: NodeKind = res === 'wood' ? 'tree' : res === 'stone' ? 'rock' : 'bush';
      for (const n of this.nodes) if (n.kind === kind && this.nodeHarvestable(n)) c.push({ id: n.id, x: n.x + 0.5, y: n.y + 0.5 });
    }
    if (res === 'food' || res === 'water') {
      const kind: BuildingKind = res === 'food' ? 'farm' : 'well';
      for (const b of this.buildings) {
        if (b.kind === kind && b.done && this.buildingWorks(b) && this.slotsFree(b)) c.push({ id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2 });
      }
    }
    if (res === 'water') {
      for (const i of this.wet) c.push({ id: -(i + 1), x: (i % GRID_W) + 0.5, y: Math.floor(i / GRID_W) + 0.5 });
    }
    return this.nearestBy(v, c, (t) => t.x, (t) => t.y)?.id;
  }

  private nearestBy<T>(v: Villager, list: T[], gx: (t: T) => number, gy: (t: T) => number): T | undefined {
    let best: T | undefined;
    let bd = Infinity;
    for (const t of list) {
      const dd = (gx(t) - v.x) ** 2 + (gy(t) - v.y) ** 2;
      if (dd < bd) { bd = dd; best = t; }
    }
    return best;
  }

  private nearestStore(v: Villager): Building {
    const stores = this.buildings.filter((b) => b.done && (b.kind === 'townhall' || b.kind === 'warehouse'));
    return this.nearestBy(v, stores, (b) => b.x + b.w / 2, (b) => b.y + b.h / 2)!;
  }

  /** Profissão inicial: o recurso mais escasso, descontando quem já trabalha nele. */
  private neediestResource(): Resource {
    const score = (r: Resource): number => this.stock[r] + 12 * this.villagers.filter((v) => v.job === r).length;
    let best: Resource = 'wood';
    for (const r of RESOURCES) if (score(r) < score(best)) best = r;
    return best;
  }

  // ---------- colocação ----------
  private inBounds(x: number, y: number, w: number, h: number): boolean {
    return x >= 1 && y >= 1 && x + w <= GRID_W - 1 && y + h <= GRID_H - 1;
  }

  private markRect(x: number, y: number, w: number, h: number, val: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.occ[this.idx(x + i, y + j)] = val;
  }

  private spotOk(kind: PlaceableKind, x: number, y: number): boolean {
    const { w, h } = BUILDINGS[kind];
    if (!this.inBounds(x, y, w, h)) return false;
    const h0 = this.height[this.idx(x, y)];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const t = this.idx(x + i, y + j);
        if (this.occ[t] || this.dam[t]) return false;
        if (kind === 'dam') { if (!this.channel[t]) return false; continue; }
        if (this.channel[t] || this.water[t] > 0.05 || this.height[t] !== h0) return false;
      }
    }
    if (kind === 'dam') {
      // uma represa por trecho: sem outra a menos de 3 linhas
      if (this.buildings.some((b) => b.kind === 'dam' && Math.abs(b.y - y) < 3)) return false;
    }
    if (kind === 'farm') return this.irrigated[this.idx(x, y)] === 1;
    if (kind === 'well') return this.waterNear(x + w / 2, y + h / 2, WELL_RANGE);
    return true;
  }

  private placeBuilding(kind: BuildingKind, x: number, y: number, w: number, h: number, work: number, done: boolean): Building {
    const b: Building = { id: this.nextId++, kind, x, y, w, h, progress: done ? work : 0, workNeeded: work, done, priority: false };
    this.buildings.push(b);
    this.markRect(x, y, w, h, 1);
    return b;
  }

  private removeNode(n: ResourceNode): void {
    this.nodes.splice(this.nodes.indexOf(n), 1);
    this.occ[this.idx(n.x, n.y)] = 0;
  }

  // ---------- geração do mapa ----------
  private baseHeight(y: number): number { return 5 - Math.floor((y * 3) / GRID_H); }

  private generate(): void {
    const phase = this.rng() * Math.PI * 2;
    // ruído suave (grade grosseira interpolada) para colinas nas margens
    const cw = 9, ch = 7;
    const coarse = Array.from({ length: cw * ch }, () => this.rng());
    const noise = (x: number, y: number): number => {
      const fx = (x / (GRID_W - 1)) * (cw - 1), fy = (y / (GRID_H - 1)) * (ch - 1);
      const x0 = Math.min(cw - 2, Math.floor(fx)), y0 = Math.min(ch - 2, Math.floor(fy));
      const tx = fx - x0, ty = fy - y0;
      const c = (a: number, b: number): number => coarse[b * cw + a];
      return (c(x0, y0) * (1 - tx) + c(x0 + 1, y0) * tx) * (1 - ty) + (c(x0, y0 + 1) * (1 - tx) + c(x0 + 1, y0 + 1) * tx) * ty;
    };

    for (let y = 0; y < GRID_H; y++) this.rx[y] = 27 + Math.round(Math.sin(y * 0.33 + phase) * 3);

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const n = noise(x, y);
        this.height[this.idx(x, y)] = this.baseHeight(y) + (n > 0.68 ? 1 : 0) + (n > 0.88 ? 1 : 0);
      }
    }

    // vila no terraço do meio, em um platô plano perto do rio
    const hx = 17, hy = 15;
    const plat = this.baseHeight(hy);
    for (let y = hy - 2; y <= hy + 4; y++) for (let x = hx - 2; x <= hx + 4; x++) this.height[this.idx(x, y)] = plat;

    // leito do rio: duas colunas, um degrau abaixo das margens
    for (let y = 0; y < GRID_H; y++) {
      for (let k = 0; k < 2; k++) {
        const i = this.idx(this.rx[y] + k, y);
        this.channel[i] = 1;
        this.height[i] = Math.max(0, this.baseHeight(y) - 1);
        this.water[i] = 0.5;
        if (y < GRID_H - 1) this.downstream[i] = this.idx(this.rx[y + 1] + k, y + 1);
      }
    }
    this.sources = [this.idx(this.rx[0], 0), this.idx(this.rx[0] + 1, 0)];

    this.placeBuilding('townhall', hx, hy, 3, 3, 0, true);

    for (let s = 0; s < 160; s++) this.flowStep(true); // assenta o rio
    for (let i = 0; i < N; i++) this.moisture[i] = this.irrigated[i];

    const scatter = (kind: NodeKind, count: number, minDist: number, needWater: boolean): void => {
      let tries = 0;
      while (count > 0 && tries++ < 4000) {
        const x = 1 + Math.floor(this.rng() * (GRID_W - 2));
        const y = 1 + Math.floor(this.rng() * (GRID_H - 2));
        const i = this.idx(x, y);
        if (this.occ[i] || this.channel[i] || this.water[i] > 0.02) continue;
        if (Math.hypot(x - hx - 1, y - hy - 1) < minDist) continue;
        if (needWater && !this.irrigated[i]) continue;
        this.nodes.push({ id: this.nextId++, kind, x, y, amount: NODE_MAX[kind] });
        this.occ[i] = 1;
        count--;
      }
    };
    scatter('tree', 55, 4, true);
    scatter('bush', 14, 4, true);
    scatter('rock', 18, 6, false);
  }

  /** Cor estável por viewer, usada quando não há cor da Twitch. */
  static colorFor(userId: string): string {
    return `hsl(${hashString(userId) % 360}, 70%, 55%)`;
  }
}
