import {
  AUTO_BRIDGE_MAX_SPAN, AUTO_CANAL_MAX, AUTO_CANAL_MAX_DEPTH, AUTO_CANAL_MAX_LEN, AUTO_DRAIN_LEN, AUTO_DRAIN_MAX, AUTO_DRAIN_ROUNDS, BOND_EVERY, BOND_RADIUS, FRIEND_AT, COUPLE_AT, FRIENDS_MAX, BIRTH_EVERY, BIRTH_CHANCE, KIDS_MAX, KID_GROW_TICKS, STORE_GIVE_UP, CROWD_COST, CROWD_MAX, AUTO_FILL_ROUNDS, AUTO_DEMOLISH_ROUNDS, AUTO_DEMOLISH_MAX, DIG_COST, NPC_EVERY, NPC_MIN, NPC_NAMES, MAX_HEIGHT, MAX_SPRINGS, RAISE_COST, SPRING_COST, SPRING_RATE, CLEARING_RADIUS, FOREST_FADE_LEN, FOREST_FADE_START, FOREST_FAR, FOREST_NEAR, SAPLING_CHANCE, SAPLING_GROW_EVERY, AUTO_ROAD_MAX_LEN, AUTO_ROAD_RESERVE, AUTO_ROAD_PER_PASS, MARKET_RELIEF, MINE_MIN_DIST, MINE_VEINS, QUARRY_MAX_DIST, POWER_BONUS, POWER_DEMAND, POWER_SUPPLY, POWER_WATER_FULL, MARKET_RELIEF_MAX, ROAD_COST, ROAD_SPEED, ROAD_STEP_COST, AUTO_BRIDGE_MIN_STRANDED, AUTO_BRIDGE_WADE_MIN, AUTO_BUILD_MAX_DIST, AUTO_HOUSE_RESERVE, AUTO_JOB_MARGIN, AUTONOMY_EVERY, BASE_POP_CAP, BASE_STORAGE, BUILDINGS, CARRY_CAPACITY, CONSUME_EVERY, CONVEY, DAM_RAISE,
  DROUGHT_DAYS, EVAP_DROUGHT, EVAP_TEMPERATE, FLOW_EVERY, FLOW_FRACTION, GATHER_TICKS, WAITLIST_MAX, AXE_COST, PICK_COST, TOOL_BONUS, TOOL_RESERVE, GRID_H,
  GRID_W, MAP_SCALE, HOUSE_POP, IRRIGATION_RADIUS, MIN_HARVEST, MOISTURE_RATE, MOVE_SPEED, NODE_MAX,
  QUARRY_BONUS, REACH, REGROW_EVERY, SAWMILL_BONUS, SOURCE_RATE, START_STOCK, STARVING_SLOWDOWN,
  SUPPORT_BONUS, SUPPORT_MAX_TICKS, SUPPORT_TICKS, TEMPERATE_DAYS, TICKS_PER_DAY, WAREHOUSE_STORAGE,
  WATER_SLOWDOWN, WELL_RANGE, WET_DEPTH, MAX_STEP, MAX_WADE, RETRY_TICKS, WADE_SLOW_DEPTH, FLOOD_DEPTH, DEMOLISH_REFUND, DROUGHT_WARNING_DAYS,
} from './config';
import { ERAS, eraGather, eraHousePop, eraStorage, goalsMet, type EraSnapshot } from './eras';
import { findPath } from './path';
import { ACHIEVEMENTS, type AchStats } from './achievements';
import { ARRIVAL_COUNT, CARDS, CARD_HOUR_MAX, CARD_HOUR_TICKS, CARD_QUEUE_MAX, COIN_XP, EVENTS, EVENT_CHANCE, EVENT_FIRST_DAY, eventStockDelta, pickEvent, type EventKind } from './events';
import { hashString, mulberry32, type Rng } from './rng';
import {
  JOBS, RESOURCES, type Building, type BuildingKind, type Job, type NodeKind, type Resource,
  type ResourceNode, type Stock, type Villager, type ZoneKind,
} from './types';

export type AddResult = { ok: true; villager: Villager } | { ok: false; reason: 'exists' | 'full' };
export type QueueResult = { ok: true; position: number; already: boolean } | { ok: false; reason: 'off' | 'full' };
export type PlaceCheck = { ok: true } | { ok: false; reason: 'cost' | 'space' | 'mine'; missing?: Partial<Stock> };
export type BuildResult = { ok: true; building: Building } | Exclude<PlaceCheck, { ok: true }>;
export type PlaceableKind = Exclude<BuildingKind, 'townhall'>;
export interface Season { drought: boolean; daysLeft: number }

export const SAVE_VERSION = 1;
export interface Profile { name: string; xp: number; job: Job; coins?: number }

/** Estado completo da vila em JSON simples. O terreno base (rio, nascentes) volta da seed. */
/** Pedido de carta de evento esperando o streamer. */
export interface CardRequest { id: number; kind: EventKind; userId: string; name: string; cost: number }
export type CardResult = { ok: true; queued: boolean } | { ok: false; reason: 'villager' | 'unknown' | 'coins' | 'busy' | 'cooldown' | 'limit' | 'pending' | 'full'; need?: number; days?: number };

export interface SaveData {
  version: number;
  seed: number;
  tick: number;
  stock: Stock;
  supportUntil: number;
  nextId: number;
  rngState: number;
  prevDrought: boolean;
  warned?: boolean;
  autonomy?: boolean;
  era?: number;
  road?: number[];
  zone?: number[];
  springs?: number[];
  canals?: number;
  drains?: number;
  autoDemolished?: number;
  axes?: number;
  mine?: number[];
  waitlistOn?: boolean;
  waitlist?: { userId: string; name: string; color: string }[];
  picks?: number;
  leaders?: Partial<Record<Job, string>>;
  event?: { kind: EventKind; until: number; by?: string } | null;
  cardQueue?: CardRequest[];
  cardAuto?: boolean;
  cardCooldown?: Partial<Record<EventKind, number>>;
  cardHistory?: number[];
  eventsSeen?: number;
  achievements?: string[];
  villagers: (Omit<Villager, 'workLeft'> & { workLeft: number | null })[];
  buildings: Building[];
  nodes: ResourceNode[];
  height: number[];
  water: number[];
  moisture: number[];
  dam: number[];
  irrigated: number[];
}

export const BIOME_MEADOW = 0, BIOME_FOREST = 1, BIOME_ROCKY = 2;
const LAKE_RATE_PER_TILE = 0.0015;
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
/** Metas de era sem `kind` explícito que mesmo assim guiam o planejador (para a vila focar em subir de era). */
const GOAL_KIND: Record<string, BuildingKind> = { casa: 'house', casas: 'house', fazenda: 'farm', fazendas: 'farm', poço: 'well', poços: 'well' };

export class World {
  tick = 0;
  /** sobe sempre que o relevo muda (represa construída ou demolida); o visual 3D refaz o terreno */
  terrainVersion = 0;
  /** aldeões sem ordem decidem a profissão e constroem casas sozinhos, gastando o estoque da vila */
  autonomy = true;
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
  /** 1 = ponte concluída: dá para atravessar a água e o degrau da margem */
  readonly bridge = new Uint8Array(N);
  readonly mine = new Uint8Array(N); // 1 = jazida de pedra: só a pedreira se constrói aqui
  readonly forest = new Uint8Array(N); // 1 = tile com árvore (conta como ocupado, mas dá para limpar)
  readonly road = new Uint8Array(N); // 1 = estrada (não fecha o caminho, anda-se mais rápido)
  readonly zone = new Uint8Array(N); // ZoneKind pintada pelo streamer
  /** altura do tabuleiro onde há ponte */
  readonly deck = new Float32Array(N);
  /** passos de aldeões com água até o joelho, por tile (decai com o tempo): mostra onde falta ponte */
  private wadeTraffic = new Float32Array(N);
  private crowd = new Uint8Array(N); // aldeões por tile (atualizado a cada 5 passos), pesa nas rotas

  private nextId = 1;
  private occ = new Uint8Array(N); // 1 = tile ocupado por nó/prédio
  private blocked = new Uint8Array(N); // 1 = tile coberto por prédio (aldeão não atravessa)
  private downstream = new Int32Array(N).fill(-1);
  private sources: number[] = [];
  private sourceRates: number[] = [];
  readonly biome = new Uint8Array(N); // BIOME_*, vem da seed (não entra no save)
  private wet: number[] = [];
  private delta = new Float32Array(N);
  private flows = new Float32Array(4);
  private events: string[] = [];
  era = 0; // índice em ERAS
  private roadAnnounced = false;
  private baseSources = 0; // nascentes geradas com o mapa (rio e lagos)
  private springs: number[] = []; // nascentes criadas pelo streamer
  npcsOn = true; // moradores NPC "se preciso"
  waitlistOn = true; // com a vila cheia, quem usa !entrar entra na fila em vez de ser recusado
  waitlist: { userId: string; name: string; color: string }[] = [];
  /** energia das rodas d'água: oferta, demanda e a razão (0 a 1) que vira bônus nos prédios movidos a ela */
  power = { supply: 0, demand: 0, ratio: 0 };
  axes = 0; // machados fabricados (aceleram a lenha)
  picks = 0; // picaretas fabricadas (aceleram a pedra)
  /** pioneiro de cada profissão: o primeiro viewer a exercê-la lidera até sair ou mudar de profissão */
  leaders: Partial<Record<Job, string>> = {};
  /** evento local ativo (colheita, tempestade...) */
  event: { kind: EventKind; until: number; by?: string } | null = null;
  /** cartas de evento: fila de aprovação, aprovação automática, espera por tipo e cartas já ativadas na última hora */
  cardQueue: CardRequest[] = [];
  cardAuto = true;
  private cardCooldown: Partial<Record<EventKind, number>> = {};
  private cardHistory: number[] = [];
  private cardSeq = 1;
  private eventsSeen = 0;
  achievements: string[] = [];
  private canals = 0; // canais cavados pelos aldeões
  private autoDemolished = 0; // demolições feitas pelos aldeões
  private drains = 0; // canais de drenagem cavados contra alagamentos
  private floodRounds = 0; // rodadas de autonomia seguidas com algum prédio alagado
  private needIrrigation = false; // o planejador não achou terra irrigada para uma fazenda
  private prevDrought = false;
  private warned = false; // já avisou a seca que vem aí?
  private rx: number[] = []; // x esquerdo do leito por linha
  private readonly rng: Rng;

  constructor(public readonly seed: number) {
    this.rng = mulberry32(seed);
    this.generate();
  }

  // ---------- salvar e carregar ----------
  serialize(): SaveData {
    return {
      version: SAVE_VERSION, seed: this.seed, tick: this.tick, stock: { ...this.stock },
      supportUntil: this.supportUntil, nextId: this.nextId, rngState: this.rng.getState(), prevDrought: this.prevDrought, warned: this.warned, autonomy: this.autonomy, era: this.era,
      road: Array.from(this.road), zone: Array.from(this.zone), springs: [...this.springs], canals: this.canals, drains: this.drains, autoDemolished: this.autoDemolished, mine: Array.from(this.mine), axes: this.axes, picks: this.picks, leaders: { ...this.leaders }, event: this.event ? { ...this.event } : null, cardQueue: this.cardQueue.map((q) => ({ ...q })), cardAuto: this.cardAuto, cardCooldown: { ...this.cardCooldown }, cardHistory: [...this.cardHistory], eventsSeen: this.eventsSeen, achievements: [...this.achievements], waitlistOn: this.waitlistOn, waitlist: this.waitlist.map((q) => ({ ...q })),
      // Infinity (construtor trabalhando) não existe em JSON: vira null e volta como Infinity
      villagers: this.villagers.map((v) => ({ ...v, path: v.path ? [...v.path] : null, workLeft: Number.isFinite(v.workLeft) ? v.workLeft : null })),
      buildings: this.buildings.map((b) => ({ ...b })),
      nodes: this.nodes.map((n) => ({ ...n })),
      height: Array.from(this.height), water: Array.from(this.water), moisture: Array.from(this.moisture),
      dam: Array.from(this.dam), irrigated: Array.from(this.irrigated),
    };
  }

  /** Reconstrói a vila a partir de um save; lança erro se o dado não for válido. */
  static fromSave(data: SaveData): World {
    const num = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n);
    const okArr = (a: unknown): boolean => Array.isArray(a) && a.length === N && a.every(num);
    if (!data || data.version !== SAVE_VERSION) throw new Error('versão de save não suportada');
    if (!num(data.seed) || !num(data.tick) || !num(data.nextId) || !num(data.rngState)) throw new Error('save inválido');
    if (!data.stock || RESOURCES.some((r) => !num(data.stock[r]))) throw new Error('save inválido: estoque');
    if (![data.height, data.water, data.moisture, data.dam, data.irrigated].every(okArr)) throw new Error('save inválido: mapa');
    if (!Array.isArray(data.villagers) || !Array.isArray(data.buildings) || !Array.isArray(data.nodes)) throw new Error('save inválido: listas');
    if (!data.buildings.length || data.buildings[0].kind !== 'townhall') throw new Error('save inválido: sem prefeitura');

    const w = new World(data.seed); // refaz o terreno base (rio e nascentes) a partir da seed
    w.applySave(data);
    return w;
  }

  /**
   * Copia um save já validado para este mundo, no lugar (usado por fromSave e pelo overlay do OBS,
   * que espelha a vila de outro navegador sem rodar a simulação).
   */
  applySave(data: SaveData): void {
    this.tick = data.tick;
    this.era = Math.min(Math.max(0, data.era ?? 0), ERAS.length - 1);
    this.leaders = { ...(data.leaders ?? {}) };
    this.event = data.event ? { ...data.event } : null;
    this.cardQueue = (data.cardQueue ?? []).map((q) => ({ ...q }));
    this.cardSeq = this.cardQueue.reduce((m, q) => Math.max(m, q.id + 1), 1);
    this.cardAuto = data.cardAuto ?? true;
    this.cardCooldown = { ...(data.cardCooldown ?? {}) };
    this.cardHistory = [...(data.cardHistory ?? [])];
    this.eventsSeen = data.eventsSeen ?? 0;
    this.achievements = [...(data.achievements ?? [])];
    this.stock = { ...data.stock };
    this.supportUntil = data.supportUntil;
    this.nextId = data.nextId;
    this.prevDrought = data.prevDrought;
    this.warned = data.warned ?? false;
    this.autonomy = data.autonomy ?? true;
    this.rng.setState(data.rngState);
    this.villagers = data.villagers.map((v) => ({ ...v, workLeft: v.workLeft ?? Infinity }));
    this.buildings = data.buildings.map((b) => ({ ...b }));
    this.nodes = data.nodes.map((n) => ({ ...n }));
    const reliefChanged = data.height.some((h, i) => h !== this.height[i]);
    this.height.set(data.height); this.water.set(data.water); this.moisture.set(data.moisture);
    this.dam.set(data.dam); this.irrigated.set(data.irrigated);
    this.sources.length = this.baseSources; this.sourceRates.length = this.baseSources; // nascentes do mapa; as do streamer voltam do save
    this.springs = [];
    for (const t of data.springs ?? []) this.pushSpring(t);
    this.canals = data.canals ?? 0;
    this.drains = data.drains ?? 0;
    this.autoDemolished = data.autoDemolished ?? 0;
    this.floodRounds = 0;
    this.waitlistOn = data.waitlistOn ?? true;
    this.waitlist = (data.waitlist ?? []).map((q) => ({ ...q }));
    if (data.mine) this.mine.set(data.mine); else this.placeMines(); // save antigo: jazidas sorteadas da seed, sem mexer na vila
    this.axes = data.axes ?? 0;
    this.picks = data.picks ?? 0;
    this.road.fill(0); this.zone.fill(0);
    if (data.road?.length === N) this.road.set(data.road);
    if (data.zone?.length === N) this.zone.set(data.zone);
    this.occ.fill(0); this.blocked.fill(0);
    this.forest.fill(0);
    for (const n of this.nodes) { this.occ[this.idx(n.x, n.y)] = 1; if (n.kind === 'tree') this.forest[this.idx(n.x, n.y)] = 1; }
    for (const b of this.buildings) { this.markRect(b.x, b.y, b.w, b.h, 1); if (b.kind !== 'bridge') this.markRect(b.x, b.y, b.w, b.h, 1, this.blocked); }
    this.rebuildBridges();
    this.wet.length = 0;
    for (let i = 0; i < N; i++) if (this.water[i] >= WET_DEPTH) this.wet.push(i);
    this.events = [];
    if (reliefChanged) this.terrainVersion++; // o visual 3D refaz o terreno só se o relevo mudou
  }

  // ---------- consulta ----------
  get day(): number { return Math.floor(this.tick / TICKS_PER_DAY) + 1; }
  get popCap(): number { return BASE_POP_CAP + this.working('house') * (HOUSE_POP + eraHousePop(this.era)); }
  get storageCap(): number { return Math.round((BASE_STORAGE + this.working('warehouse') * WAREHOUSE_STORAGE) * eraStorage(this.era)); }
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
  /** Prédios prontos e não alagados. */
  working(kind: BuildingKind): number { return this.buildings.filter((b) => b.kind === kind && b.done && !b.flooded).length; }
  findVillager(userId: string): Villager | undefined { return this.villagers.find((v) => v.userId === userId); }
  /** Aldeão parado porque não há recurso ou obra alcançável para a profissão dele. */
  isStuck(v: Villager): boolean { return v.state === 'idle' && v.wait > 0; }
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
    const h = (a: number, b: number): number => { const t = this.idx(a, b); return this.bridge[t] ? this.deck[t] : this.height[t]; };
    return (h(x0, y0) * (1 - tx) + h(x0 + 1, y0) * tx) * (1 - ty) + (h(x0, y0 + 1) * (1 - tx) + h(x0 + 1, y0 + 1) * tx) * ty;
  }

  // ---------- terreno ----------
  private terraformCheck(x: number, y: number): boolean {
    if (x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1) return false;
    const t = this.idx(x, y);
    return !((this.occ[t] && !this.forest[t]) || this.dam[t] || this.bridge[t]);
  }

  private lacks(cost: Partial<Record<Resource, number>>, n = 1): Partial<Stock> | null {
    const missing: Partial<Stock> = {};
    for (const r of RESOURCES) { const need = (cost[r] ?? 0) * n; if (this.stock[r] < need) missing[r] = need - this.stock[r]; }
    return Object.keys(missing).length ? missing : null;
  }

  /** Cava (baixa 1 nível) ou eleva (sobe 1 nível) o terreno do tile; derruba a árvore que estiver nele. */
  terraform(x: number, y: number, mode: 'dig' | 'raise'): PlaceCheck {
    if (!this.terraformCheck(x, y)) return { ok: false, reason: 'space' };
    const t = this.idx(x, y);
    const nh = this.height[t] + (mode === 'dig' ? -1 : 1);
    if (nh < 0 || nh > MAX_HEIGHT) return { ok: false, reason: 'space' };
    const missing = this.lacks(mode === 'dig' ? DIG_COST : RAISE_COST);
    if (missing) return { ok: false, reason: 'cost', missing };
    for (const r of RESOURCES) this.stock[r] -= (mode === 'dig' ? DIG_COST : RAISE_COST)[r] ?? 0;
    this.clearTrees(x, y, 1, 1);
    this.height[t] = nh;
    this.terrainVersion++;
    return { ok: true };
  }

  private pushSpring(t: number): void { this.sources.push(t); this.sourceRates.push(SPRING_RATE); this.springs.push(t); }

  /** Abre uma nascente: a água brota ali (só na estação temperada) e enche o que estiver cavado em volta. */
  addSpring(x: number, y: number): PlaceCheck {
    if (!this.terraformCheck(x, y) || this.springs.length >= MAX_SPRINGS) return { ok: false, reason: 'space' };
    const t = this.idx(x, y);
    if (this.sources.includes(t)) return { ok: false, reason: 'space' };
    const missing = this.lacks(SPRING_COST);
    if (missing) return { ok: false, reason: 'cost', missing };
    for (const r of RESOURCES) this.stock[r] -= SPRING_COST[r] ?? 0;
    this.clearTrees(x, y, 1, 1);
    this.pushSpring(t);
    this.water[t] += 0.5;
    this.terrainVersion++; // redesenha (o marcador da nascente)
    return { ok: true };
  }

  springTiles(): readonly number[] { return this.springs; }

  isSpring(x: number, y: number): boolean { return this.springs.includes(this.idx(x, y)); }

  /**
   * Os aldeões cavam um canal da água mais próxima até terra que ainda não é irrigada perto da prefeitura.
   * A água corre pelo canal (o fundo fica na altura do leito de onde ela vem) e irriga em volta.
   */
  private autoCanal(): boolean {
    if (this.canals >= AUTO_CANAL_MAX) return false;
    const hall = this.townHall();
    const hx = hall.x + hall.w / 2, hy = hall.y + hall.h / 2;
    const landFree = (t: number): boolean => !((this.occ[t] && !this.forest[t]) || this.dam[t] || this.bridge[t] || this.road[t] || this.channel[t]) && this.water[t] < 0.05;
    const prev = new Int32Array(N).fill(-2);
    const lvl = new Int32Array(N); // altura do leito de origem
    const len = new Int32Array(N);
    const queue: number[] = [];
    for (let t = 0; t < N; t++) if (this.water[t] >= 0.25 && !this.dam[t]) { prev[t] = -1; lvl[t] = this.height[t]; queue.push(t); }
    let end = -1;
    for (let qi = 0; qi < queue.length && end < 0; qi++) {
      const t = queue[qi];
      const x = t % GRID_W, y = (t - x) / GRID_W;
      if (prev[t] !== -1) {
        const d = Math.hypot(x + 0.5 - hx, y + 0.5 - hy);
        if (d >= 3 && d <= 13 && !this.irrigated[t]) { end = t; break; }
      }
      if (len[t] >= AUTO_CANAL_MAX_LEN) continue;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 1 || ny < 1 || nx >= GRID_W - 1 || ny >= GRID_H - 1) continue;
        const u = this.idx(nx, ny);
        if (prev[u] !== -2 || !landFree(u) || this.height[u] - lvl[t] > AUTO_CANAL_MAX_DEPTH) continue;
        prev[u] = t; lvl[u] = lvl[t]; len[u] = len[t] + 1; queue.push(u);
      }
    }
    if (end < 0) return false;
    const path: number[] = [];
    for (let t = end; prev[t] !== -1; t = prev[t]) path.push(t);
    let levels = 0;
    for (const t of path) levels += Math.max(0, this.height[t] - lvl[end]);
    levels = Math.max(levels, path.length);
    if (this.lacks(DIG_COST, levels)) return false;
    for (const r of RESOURCES) this.stock[r] -= (DIG_COST[r] ?? 0) * levels;
    for (const t of path) {
      this.clearTrees(t % GRID_W, Math.floor(t / GRID_W), 1, 1);
      this.height[t] = Math.min(this.height[t], lvl[end]);
    }
    this.canals++;
    this.terrainVersion++;
    this.events.push('⛏ Os aldeões cavaram um canal para levar água a terra seca e irrigar novas lavouras.');
    return true;
  }

  /**
   * Prédio alagado por um tempo: os aldeões cavam um canal da água ao lado dele até terra mais baixa
   * (ou o ralo da borda sul), longe de qualquer construção, para levar a água embora.
   */
  private autoDrain(): boolean {
    if (this.drains >= AUTO_DRAIN_MAX) return false;
    const stuck = this.buildings.filter((b) => b.done && b.flooded && b.kind !== 'townhall' && b.kind !== 'dam' && b.kind !== 'bridge');
    if (!stuck.length) return false;
    const landFree = (t: number): boolean => !((this.occ[t] && !this.forest[t]) || this.dam[t] || this.bridge[t] || this.road[t] || this.channel[t]) && this.water[t] < 0.05;
    const nearBuilding = (x: number, y: number): boolean =>
      this.buildings.some((b) => x >= b.x - 3 && x < b.x + b.w + 3 && y >= b.y - 3 && y < b.y + b.h + 3);
    for (const target of stuck) {
      const prev = new Int32Array(N).fill(-2);
      const lvl = new Int32Array(N);
      const len = new Int32Array(N);
      const queue: number[] = [];
      for (let y = target.y - 3; y < target.y + target.h + 3; y++) {
        for (let x = target.x - 3; x < target.x + target.w + 3; x++) {
          if (x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1) continue;
          const t = this.idx(x, y);
          if (this.water[t] >= 0.25 && !this.dam[t] && prev[t] === -2) { prev[t] = -1; lvl[t] = this.height[t]; queue.push(t); }
        }
      }
      let end = -1;
      for (let qi = 0; qi < queue.length && end < 0; qi++) {
        const t = queue[qi];
        const x = t % GRID_W, y = (t - x) / GRID_W;
        if (prev[t] !== -1 && (y >= GRID_H - 2 || (this.height[t] < lvl[t] && !nearBuilding(x, y)))) { end = t; break; }
        if (len[t] >= AUTO_DRAIN_LEN) continue;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (nx < 1 || ny < 1 || nx >= GRID_W - 1 || ny >= GRID_H - 1) continue;
          const u = this.idx(nx, ny);
          if (prev[u] !== -2 || !landFree(u) || this.height[u] - lvl[t] > AUTO_CANAL_MAX_DEPTH) continue;
          prev[u] = t; lvl[u] = Math.min(lvl[t], this.height[u]); len[u] = len[t] + 1; queue.push(u);
        }
      }
      if (end < 0) continue;
      const path: number[] = [];
      for (let t = end; prev[t] !== -1; t = prev[t]) path.push(t);
      path.reverse(); // da água até o escoadouro
      const start = lvl[prev[path[0]]];
      const beds: number[] = [];
      let levels = 0;
      path.forEach((t, i) => {
        // o fundo desce 1 nível a cada 6 tiles, para a água correr mesmo em terreno plano
        const bed = Math.max(0, Math.min(start - Math.floor(i / 6), this.height[t]));
        beds.push(bed);
        levels += Math.max(1, this.height[t] - bed);
      });
      if (this.lacks(DIG_COST, levels)) return false; // junta madeira antes
      for (const r of RESOURCES) this.stock[r] -= (DIG_COST[r] ?? 0) * levels;
      path.forEach((t, i) => {
        this.clearTrees(t % GRID_W, Math.floor(t / GRID_W), 1, 1);
        this.height[t] = beds[i];
      });
      this.drains++;
      this.terrainVersion++;
      this.events.push('⛏ A vila alagou: os aldeões cavaram um canal para levar a água embora.');
      return true;
    }
    return false;
  }

  /**
   * Prédio que continua alagado: depois de tentar drenar, os aldeões aterram o terreno dele (sobe 1 nível,
   * gasta pedra) e, se ainda assim não adianta, demolem para reconstruir em terreno melhor.
   */
  private autoFillOrDemolish(): void {
    const stuck = this.buildings
      .filter((b) => b.done && b.flooded && b.kind !== 'townhall' && b.kind !== 'dam' && b.kind !== 'bridge')
      .sort((a, b) => (b.floodAge ?? 0) - (a.floodAge ?? 0))[0];
    if (!stuck) return;
    const age = stuck.floodAge ?? 0;
    const label = (BUILDINGS[stuck.kind as PlaceableKind]?.label ?? stuck.kind).toLowerCase();
    if (age >= AUTO_FILL_ROUNDS && !stuck.filled) {
      stuck.filled = true; // uma tentativa só, dê certo ou não
      let top = 0;
      const tiles: number[] = [];
      for (let j = 0; j < stuck.h; j++) for (let i = 0; i < stuck.w; i++) { const t = this.idx(stuck.x + i, stuck.y + j); tiles.push(t); top = Math.max(top, this.height[t]); }
      const nh = top + 1;
      let ok = nh <= MAX_HEIGHT;
      for (let j = -1; j <= stuck.h && ok; j++) for (let i = -1; i <= stuck.w; i++) {
        const x = stuck.x + i, y = stuck.y + j;
        if (i >= 0 && i < stuck.w && j >= 0 && j < stuck.h) continue;
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        if (nh - this.height[this.idx(x, y)] > 2 * MAX_STEP) { ok = false; break; } // viraria um penhasco
      }
      const levels = tiles.reduce((a, t) => a + Math.max(0, nh - this.height[t]), 0);
      if (ok && !this.lacks(RAISE_COST, levels)) {
        for (const r of RESOURCES) this.stock[r] -= (RAISE_COST[r] ?? 0) * levels;
        for (const t of tiles) { this.height[t] = nh; this.water[t] = 0; }
        this.terrainVersion++;
        this.events.push(`🧱 Os aldeões aterraram o terreno d${stuck.kind === 'house' || stuck.kind === 'farm' || stuck.kind === 'waterwheel' ? 'a' : 'o'} ${label} alagad${stuck.kind === 'house' || stuck.kind === 'farm' || stuck.kind === 'waterwheel' ? 'a' : 'o'} para tirá-lo da água.`);
        return;
      }
    }
    if (age >= AUTO_DEMOLISH_ROUNDS && stuck.filled && this.autoDemolished < AUTO_DEMOLISH_MAX) {
      if (this.demolish(stuck.id)) {
        this.autoDemolished++;
        this.events.push(`🔨 Os aldeões demoliram ${stuck.kind === 'house' || stuck.kind === 'farm' || stuck.kind === 'waterwheel' ? 'a' : 'o'} ${label} que não saía da água e vão reconstruir em terreno melhor.`);
      }
    }
  }

  /** Terreno quase plano (desnível de 1) perto da prefeitura: os aldeões aplainam para caber o prédio. */
  private autoLevel(kind: PlaceableKind): { x: number; y: number } | null {
    const { w, h } = BUILDINGS[kind];
    const hall = this.townHall();
    const cx = hall.x + hall.w / 2, cy = hall.y + hall.h / 2;
    let best: { x: number; y: number; lo: number; cost: number } | null = null;
    let bd = Infinity;
    for (let y = 1; y < GRID_H - h; y++) {
      for (let x = 1; x < GRID_W - w; x++) {
        const d = (x + w / 2 - cx) ** 2 + (y + h / 2 - cy) ** 2;
        if (d >= bd || d > AUTO_BUILD_MAX_DIST ** 2 || d < 9) continue;
        let lo = Infinity, hi = -Infinity, ok = true;
        for (let j = 0; j < h && ok; j++) for (let i = 0; i < w; i++) {
          const t = this.idx(x + i, y + j);
          if ((this.occ[t] && !this.forest[t]) || this.dam[t] || this.road[t] || this.channel[t] || this.zone[t] || this.water[t] > 0.05) { ok = false; break; }
          lo = Math.min(lo, this.height[t]); hi = Math.max(hi, this.height[t]);
        }
        if (!ok || hi - lo !== 1 || !this.roomAround(x, y, w, h)) continue;
        let cost = 0;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.height[this.idx(x + i, y + j)] > lo) cost++;
        best = { x, y, lo, cost }; bd = d;
      }
    }
    if (!best || this.lacks(DIG_COST, best.cost)) return null;
    for (const r of RESOURCES) this.stock[r] -= (DIG_COST[r] ?? 0) * best.cost;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const t = this.idx(best.x + i, best.y + j);
      this.clearTrees(best.x + i, best.y + j, 1, 1);
      this.height[t] = best.lo;
    }
    this.terrainVersion++;
    return { x: best.x, y: best.y };
  }

  // ---------- estradas e zonas ----------
  /** Dá para fazer estrada neste tile? (terra livre, sem água, sem prédio) */
  canRoad(x: number, y: number): PlaceCheck {
    if (x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1) return { ok: false, reason: 'space' };
    const t = this.idx(x, y);
    if (this.road[t] || (this.occ[t] && !this.forest[t]) || this.dam[t] || this.channel[t] || this.water[t] > 0.05) return { ok: false, reason: 'space' };
    const missing: Partial<Stock> = {};
    for (const r of RESOURCES) { const need = ROAD_COST[r] ?? 0; if (this.stock[r] < need) missing[r] = need - this.stock[r]; }
    return Object.keys(missing).length ? { ok: false, reason: 'cost', missing } : { ok: true };
  }

  /** Asfalta um tile na hora, gastando do estoque. */
  paintRoad(x: number, y: number): PlaceCheck {
    const c = this.canRoad(x, y);
    if (!c.ok) return c;
    for (const r of RESOURCES) this.stock[r] -= ROAD_COST[r] ?? 0;
    this.clearTrees(x, y, 1, 1);
    this.road[this.idx(x, y)] = 1;
    return { ok: true };
  }

  /** Tira a estrada do tile; devolve metade do custo. */
  removeRoad(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H || !this.road[this.idx(x, y)]) return false;
    this.road[this.idx(x, y)] = 0;
    for (const r of RESOURCES) this.stock[r] = Math.min(this.storageCap, this.stock[r] + Math.floor((ROAD_COST[r] ?? 0) * DEMOLISH_REFUND));
    return true;
  }

  /** Pinta (ou limpa, com 0) a zona de um tile. Não vale sobre o rio. */
  paintZone(x: number, y: number, kind: ZoneKind): boolean {
    if (x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1) return false;
    const t = this.idx(x, y);
    if (this.channel[t] || this.zone[t] === kind) return false;
    this.zone[t] = kind;
    return true;
  }

  /** Há algum tile desta zona pintado? */
  hasZone(kind: ZoneKind): boolean { return this.zone.includes(kind); }

  /** Tipo de zona onde cada prédio nasce sozinho (os que não estão aqui seguem o terreno). */
  private zoneFor(kind: PlaceableKind): ZoneKind {
    if (kind === 'house') return 1;
    if (kind === 'market') return 2;
    if (kind === 'sawmill' || kind === 'quarry' || kind === 'warehouse') return 3;
    return 0;
  }

  /** Lote livre numa zona, colado a uma estrada, o mais perto da prefeitura. */
  private zoneSite(kind: PlaceableKind, z: ZoneKind): { x: number; y: number } | null {
    const { w, h } = BUILDINGS[kind];
    const hall = this.townHall();
    const cx = hall.x + hall.w / 2, cy = hall.y + hall.h / 2;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let y = 1; y < GRID_H - h; y++) {
      for (let x = 1; x < GRID_W - w; x++) {
        const d = (x + w / 2 - cx) ** 2 + (y + h / 2 - cy) ** 2;
        if (d >= bd) continue;
        let inZone = true;
        for (let j = 0; j < h && inZone; j++) for (let i = 0; i < w; i++) if (this.zone[this.idx(x + i, y + j)] !== z) { inZone = false; break; }
        if (!inZone || !this.spotOk(kind, x, y) || !this.roadTouches(x, y, w, h)) continue;
        best = { x, y }; bd = d;
      }
    }
    return best;
  }

  /** Algum tile de estrada encosta (lado a lado) no retângulo? */
  private roadTouches(x: number, y: number, w: number, h: number): boolean {
    for (let i = 0; i < w; i++) {
      if (y > 0 && this.road[this.idx(x + i, y - 1)]) return true;
      if (y + h < GRID_H && this.road[this.idx(x + i, y + h)]) return true;
    }
    for (let j = 0; j < h; j++) {
      if (x > 0 && this.road[this.idx(x - 1, y + j)]) return true;
      if (x + w < GRID_W && this.road[this.idx(x + w, y + j)]) return true;
    }
    return false;
  }

  /** Tile de zona sem estrada por perto (a 2 tiles)? */
  private zoneUnserved(t: number): boolean {
    const x = t % GRID_W, y = (t - x) / GRID_W;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const nx = x + i, ny = y + j;
      if (nx >= 0 && ny >= 0 && nx < GRID_W && ny < GRID_H && this.road[this.idx(nx, ny)]) return false;
    }
    return true;
  }

  /**
   * Os aldeões abrem uma estrada da prefeitura (ou da rede que já existe) até a zona pintada mais
   * próxima que ainda está sem estrada por perto, gastando o estoque.
   */
  private autoRoad(): void {
    const hall = this.townHall();
    // destinos sem estrada por perto: zonas pintadas (2, pedido do streamer) e prédios (1)
    const goal = new Uint8Array(N);
    let any = false;
    for (let t = 0; t < N; t++) if (this.zone[t] && this.zoneUnserved(t)) { goal[t] = 2; any = true; }
    for (const b of this.buildings) {
      if (b.kind === 'townhall' || b.kind === 'bridge' || b.kind === 'dam') continue;
      if (!this.zoneUnserved(this.idx(b.x, b.y))) continue;
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) { const t = this.idx(b.x + i, b.y + j); if (!goal[t]) goal[t] = 1; }
      any = true;
    }
    if (!any) return;
    const free = (t: number): boolean => (!this.occ[t] || this.forest[t] === 1) && !this.dam[t] && !this.channel[t] && this.water[t] <= 0.05 && !this.bridge[t];
    const prev = new Int32Array(N).fill(-2); // -2 não visitado, -1 origem
    const queue: number[] = [];
    const seed = (t: number): void => { if (prev[t] === -2 && (this.road[t] || free(t))) { prev[t] = -1; queue.push(t); } };
    for (let t = 0; t < N; t++) if (this.road[t]) seed(t);
    for (let j = hall.y - 1; j <= hall.y + hall.h; j++) for (let i = hall.x - 1; i <= hall.x + hall.w; i++) {
      if (i < 1 || j < 1 || i >= GRID_W - 1 || j >= GRID_H - 1) continue;
      const inside = i >= hall.x && i < hall.x + hall.w && j >= hall.y && j < hall.y + hall.h;
      if (!inside) seed(this.idx(i, j));
    }
    let end = -1, endGoal = 1;
    const len = new Int32Array(N);
    for (let qi = 0; qi < queue.length && end < 0; qi++) {
      const t = queue[qi];
      const x = t % GRID_W, y = (t - x) / GRID_W;
      let hit = 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx >= 0 && ny >= 0 && nx < GRID_W && ny < GRID_H) hit = Math.max(hit, goal[this.idx(nx, ny)]);
      }
      if (hit) { end = t; endGoal = hit; break; }
      if (len[t] >= AUTO_ROAD_MAX_LEN) continue;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 1 || ny < 1 || nx >= GRID_W - 1 || ny >= GRID_H - 1) continue;
        const u = this.idx(nx, ny);
        if (prev[u] !== -2 || !free(u) || Math.abs(this.height[u] - this.height[t]) > 1) continue;
        prev[u] = t; len[u] = len[t] + 1; queue.push(u);
      }
    }
    if (end < 0) return;
    const path: number[] = [];
    for (let t = end; t >= 0; t = prev[t]) path.push(t);
    path.reverse(); // da rede/prefeitura até a zona
    let laid = 0;
    for (const t of path) {
      if (this.road[t]) continue;
      if (laid >= AUTO_ROAD_PER_PASS) break;
      const x = t % GRID_W, y = (t - x) / GRID_W;
      const c = this.canRoad(x, y);
      // zona pedida pelo streamer tem prioridade; estrada para prédios só com folga de madeira (não rouba das obras)
      if (!c.ok || this.stock.wood < (ROAD_COST.wood ?? 0) + (endGoal === 2 ? AUTO_HOUSE_RESERVE : AUTO_ROAD_RESERVE)) break;
      this.paintRoad(x, y);
      laid++;
    }
    if (laid > 0 && !this.roadAnnounced) { this.roadAnnounced = true; this.events.push('🛣 Os aldeões começaram a abrir estradas até os prédios e zonas.'); }
  }

  // ---------- ações dos viewers ----------
  /** Perfis dos viewers (XP e função) vindos da nuvem: quem volta numa vila nova mantém o progresso. */
  profiles = new Map<string, Profile>();

  /** Perfis conhecidos mais o estado atual dos aldeões (o maior XP vence). */
  collectProfiles(): Map<string, Profile> {
    const out = new Map(this.profiles);
    for (const v of this.villagers) {
      const old = out.get(v.userId);
      out.set(v.userId, { name: v.name, xp: Math.max(v.xp, old?.xp ?? 0), job: v.job, coins: v.coins ?? old?.coins ?? 0 });
    }
    return out;
  }

  addVillager(userId: string, name: string, color: string): AddResult {
    if (this.findVillager(userId)) return { ok: false, reason: 'exists' };
    if (this.villagers.length >= this.popCap && !this.makeRoomForViewer()) return { ok: false, reason: 'full' };
    const hall = this.townHall();
    const prof = this.profiles.get(userId);
    // nasce perto da prefeitura, mas fora de prédios e fora d'água funda (a vila cresce em volta dela)
    let sx = 0, sy = 0;
    for (let k = 0; k < 24; k++) {
      const a = this.rng() * Math.PI * 2, r = 2.3 + Math.floor(k / 4) * 0.7;
      sx = hall.x + hall.w / 2 + Math.cos(a) * r;
      sy = hall.y + hall.h / 2 + Math.sin(a) * r;
      const tx = Math.floor(sx), ty = Math.floor(sy);
      if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
      if (!this.buildingAt(tx, ty) && this.walkable(this.idx(tx, ty))) break;
    }
    const v: Villager = {
      id: this.nextId++, userId, name, color,
      x: sx,
      y: sy,
      job: prof?.job ?? this.neediestResource(), state: 'idle', targetId: null,
      carry: 0, carryRes: null, workLeft: 0, xp: prof?.xp ?? 0, coins: prof?.coins ?? 0, path: null, pi: 0, wait: 0,
    };
    this.villagers.push(v);
    return { ok: true, villager: v };
  }

  /** Põe o viewer na fila de espera (vila cheia). A posição começa em 1. */
  enqueue(userId: string, name: string, color: string): QueueResult {
    if (!this.waitlistOn) return { ok: false, reason: 'off' };
    const i = this.waitlist.findIndex((q) => q.userId === userId);
    if (i >= 0) return { ok: true, position: i + 1, already: true };
    if (this.waitlist.length >= WAITLIST_MAX) return { ok: false, reason: 'full' };
    this.waitlist.push({ userId, name, color });
    return { ok: true, position: this.waitlist.length, already: false };
  }

  leaveQueue(userId: string): boolean {
    const i = this.waitlist.findIndex((q) => q.userId === userId);
    if (i < 0) return false;
    this.waitlist.splice(i, 1);
    return true;
  }

  /** Chama quem está na fila enquanto houver vaga. */
  private admitWaiting(): void {
    let n = 0;
    while (this.waitlist.length && (this.villagers.length < this.popCap || this.makeRoomForViewer())) {
      const q = this.waitlist.shift()!;
      if (this.addVillager(q.userId, q.name, q.color).ok) n++;
    }
    if (n > 0) this.events.push(`🏠 ${n} ${n === 1 ? 'viewer saiu' : 'viewers saíram'} da fila e ${n === 1 ? 'entrou' : 'entraram'} na vila.`);
  }

  /** Remove um aldeão (streamer ou moderador). Ele pode voltar com !entrar. */
  /** Viewer tem prioridade: com a vila cheia, um morador NPC dá lugar a ele. */
  private makeRoomForViewer(): boolean {
    // primeiro NPC adulto; criança só se não houver outro jeito
    for (const kid of [false, true]) {
      for (let i = this.villagers.length - 1; i >= 0; i--) {
        const v = this.villagers[i];
        if (!v.npc || !!v.kid !== kid) continue;
        for (const b of this.buildings) if (b.owner === v.userId) delete b.owner;
        this.villagers.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  get npcCount(): number { return this.villagers.filter((v) => v.npc && !v.kid).length; }

  /**
   * Moradores NPC "se preciso": quando falta gente para a meta de população da próxima era, há casa livre,
   * ninguém espera na fila e a vila se sustenta, chega um NPC. Nunca mais NPCs do que viewers (mínimo NPC_MIN).
   */
  private autoNpc(): void {
    if (!this.npcsOn || (this.tick / AUTONOMY_EVERY) % NPC_EVERY !== 0) return;
    const next = ERAS[this.era + 1];
    const popGoal = next?.goals.find((g) => g.label === 'aldeões')?.need;
    if (!popGoal || this.waitlist.length || this.villagers.length >= this.popCap || this.villagers.length >= popGoal) return;
    const viewers = this.villagers.length - this.npcCount;
    if (this.npcCount >= Math.max(NPC_MIN, viewers)) return;
    const cap = this.storageCap;
    if (this.stock.food / cap < 0.3 || this.stock.water / cap < 0.3) return;
    const id = this.nextId;
    const r = this.addVillager(`npc:${id}`, NPC_NAMES[id % NPC_NAMES.length], World.colorFor(`npc:${id}`));
    if (r.ok) r.villager.npc = true;
  }

  removeVillager(userId: string): boolean {
    const i = this.villagers.findIndex((v) => v.userId === userId);
    if (i < 0) return false;
    this.villagers.splice(i, 1);
    return true;
  }

  setJob(userId: string, job: Job): boolean {
    const v = this.findVillager(userId);
    if (!v) return false;
    v.job = job;
    v.ordered = true;
    this.resetTask(v);
    return true;
  }

  /** O viewer devolve a decisão ao aldeão (!livre). */
  setFree(userId: string): boolean {
    const v = this.findVillager(userId);
    if (!v) return false;
    v.ordered = false;
    return true;
  }

  support(): void {
    this.supportUntil = Math.min(Math.max(this.supportUntil, this.tick) + SUPPORT_TICKS, this.tick + SUPPORT_MAX_TICKS);
  }

  // ---------- ações do streamer ----------
  /** Valida a posição e o custo; usada pela prévia (fantasma) do painel. */
  canPlace(kind: PlaceableKind, x: number, y: number): PlaceCheck {
    const spec = BUILDINGS[kind];
    if (!this.spotOk(kind, x, y)) return { ok: false, reason: kind === 'quarry' && !this.mineUnder(x, y, spec.w, spec.h) ? 'mine' : 'space' };
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
    this.clearTrees(x, y, spec.w, spec.h);
    const b = this.placeBuilding(kind, x, y, spec.w, spec.h, spec.work, false);
    if (kind !== 'bridge') this.evict(b);
    return { ok: true, building: b };
  }

  /** Cancela uma obra em andamento e devolve os recursos. */
  cancelBuild(id: number): boolean {
    const b = this.buildings.find((x) => x.id === id);
    if (!b || b.done || b.kind === 'townhall') return false;
    const spec = BUILDINGS[b.kind];
    for (const r of RESOURCES) this.stock[r] = Math.min(this.storageCap, this.stock[r] + (spec.cost[r] ?? 0));
    this.buildings.splice(this.buildings.indexOf(b), 1);
    this.markRect(b.x, b.y, b.w, b.h, 0);
    for (const v of this.villagers) if (v.targetId === id) this.resetTask(v);
    this.markRect(b.x, b.y, b.w, b.h, 0, this.blocked);
    return true;
  }

  /** Demole um prédio pronto e devolve parte do custo. Represa demolida baixa o terreno de volta. */
  demolish(id: number): boolean {
    const b = this.buildings.find((x) => x.id === id);
    if (!b || !b.done || b.kind === 'townhall') return false;
    const spec = BUILDINGS[b.kind];
    for (const r of RESOURCES) this.stock[r] = Math.min(this.storageCap, this.stock[r] + Math.floor((spec.cost[r] ?? 0) * DEMOLISH_REFUND));
    this.buildings.splice(this.buildings.indexOf(b), 1);
    this.markRect(b.x, b.y, b.w, b.h, 0);
    this.markRect(b.x, b.y, b.w, b.h, 0, this.blocked);
    if (b.kind === 'bridge') this.rebuildBridges();
    if (b.kind === 'dam') {
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
        const t = this.idx(b.x + i, b.y + j);
        this.height[t] -= DAM_RAISE;
        this.dam[t] = 0;
      }
      this.terrainVersion++;
    }
    for (const v of this.villagers) if (v.targetId === id) this.resetTask(v);
    this.events.push(`${spec.label} demolida.`);
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

  /** Empurra para fora da obra os aldeões que estavam no terreno, para ninguém ficar preso dentro do prédio. */
  private evict(b: Building): void {
    for (const v of this.villagers) {
      const tx = Math.floor(v.x), ty = Math.floor(v.y);
      if (tx < b.x || tx >= b.x + b.w || ty < b.y || ty >= b.y + b.h) continue;
      let best = -1, bd = Infinity;
      for (let y = b.y - 1; y <= b.y + b.h; y++) {
        for (let x = b.x - 1; x <= b.x + b.w; x++) {
          if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
          if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) continue;
          const t = this.idx(x, y);
          if (!this.walkable(t)) continue;
          const d = (x + 0.5 - v.x) ** 2 + (y + 0.5 - v.y) ** 2;
          if (d < bd) { bd = d; best = t; }
        }
      }
      if (best < 0) continue;
      v.x = (best % GRID_W) + 0.5;
      v.y = Math.floor(best / GRID_W) + 0.5;
      if (v.state === 'toStore') v.path = null;
      else this.resetTask(v);
    }
  }

  // ---------- simulação ----------
  /** Foto do que vale para as metas das eras. */
  eraSnapshot(): EraSnapshot {
    const done: Partial<Record<BuildingKind, number>> = {};
    for (const b of this.buildings) if (b.done && !b.flooded) done[b.kind] = (done[b.kind] ?? 0) + 1;
    return { pop: this.villagers.length, done };
  }

  /** As eras são automáticas: cumpridas as metas, a vila sobe sozinha (pode pular se já cumpriu as seguintes). */
  private checkEra(): void {
    const snap = this.eraSnapshot();
    while (this.era < ERAS.length - 1 && goalsMet(this.era + 1, snap)) {
      this.era++;
      this.events.push(`🏛 ${ERAS[this.era].icon} A vila entrou na ${ERAS[this.era].name}! ${ERAS[this.era].tagline}`);
    }
  }

  /** Uma vez por dia: encerra o evento vencido e, às vezes, sorteia outro (determinístico por seed + dia, sem mexer no rng principal). */
  private dailyEvent(): void {
    if (this.event && this.tick >= this.event.until) {
      this.events.push(`${EVENTS[this.event.kind].icon} ${EVENTS[this.event.kind].label} terminou.`);
      this.event = null;
    }
    if (this.event || this.day < EVENT_FIRST_DAY) return;
    const r = mulberry32((this.seed ^ Math.imul(this.day, 0x9e3779b1)) >>> 0);
    if (r() >= EVENT_CHANCE) return;
    const kind = pickEvent(r(), this.villagers.length);
    if (kind) this.startEvent(kind, r);
  }

  /** Começa um evento (sorteado ou resgatado por um viewer, que aparece no aviso). */
  private startEvent(kind: EventKind, roll: () => number, by?: string): void {
    const def = EVENTS[kind];
    if (def.days > 0) this.event = { kind, until: this.tick + def.days * TICKS_PER_DAY, ...(by ? { by } : {}) };
    this.eventsSeen++;
    const delta = eventStockDelta(kind, this.stock, roll);
    const gains: string[] = [];
    for (const res of RESOURCES) {
      const d = delta[res] ?? 0;
      if (!d) continue;
      this.stock[res] = Math.min(this.storageCap, Math.max(0, this.stock[res] + d));
      gains.push(`${d > 0 ? '+' : ''}${d} ${res}`);
    }
    if (kind === 'arrival') {
      let n = 0;
      for (let i = 0; i < ARRIVAL_COUNT && this.villagers.length < this.popCap; i++) {
        const id = this.nextId;
        const r = this.addVillager(`npc:${id}`, NPC_NAMES[id % NPC_NAMES.length], World.colorFor(`npc:${id}`));
        if (r.ok) { r.villager.npc = true; n++; }
      }
      gains.push(`+${n} moradores`);
    }
    this.events.push(`${def.icon} ${by ? `${by} ativou: ` : ''}${def.text}${gains.length ? ` (${gains.join(', ')})` : ''}`);
  }

  // ---------- cartas de evento (moedas da vila) ----------
  /** O viewer pede uma carta: as moedas ficam reservadas até o streamer aprovar (ou recusar e devolver). */
  requestCard(userId: string, name: string): CardResult {
    const v = this.findVillager(userId);
    const card = CARDS.find((c) => c.alias.includes(name) || c.kind === name);
    if (!v || v.npc) return { ok: false, reason: 'villager' };
    if (!card) return { ok: false, reason: 'unknown' };
    if ((v.coins ?? 0) < card.cost) return { ok: false, reason: 'coins', need: card.cost - (v.coins ?? 0) };
    if (this.cardQueue.some((q) => q.userId === userId)) return { ok: false, reason: 'pending' };
    if (this.cardQueue.length >= CARD_QUEUE_MAX) return { ok: false, reason: 'full' };
    const failure = this.cardBlock(card.kind);
    if (failure) return failure;
    v.coins = (v.coins ?? 0) - card.cost;
    this.cardQueue.push({ id: this.cardSeq++, kind: card.kind, userId, name: v.name, cost: card.cost });
    if (this.cardAuto) { this.approveCard(this.cardQueue[this.cardQueue.length - 1].id); return { ok: true, queued: false }; }
    return { ok: true, queued: true };
  }

  private cardBlock(kind: EventKind): CardResult | null {
    if (EVENTS[kind].days > 0 && this.event) return { ok: false, reason: 'busy' };
    const left = (this.cardCooldown[kind] ?? 0) - this.tick;
    if (left > 0) return { ok: false, reason: 'cooldown', days: Math.ceil(left / TICKS_PER_DAY) };
    this.cardHistory = this.cardHistory.filter((t) => this.tick - t < CARD_HOUR_TICKS);
    if (this.cardHistory.length >= CARD_HOUR_MAX) return { ok: false, reason: 'limit' };
    return null;
  }

  private refund(q: CardRequest): void {
    const v = this.findVillager(q.userId);
    if (v) v.coins = (v.coins ?? 0) + q.cost;
    else { const p = this.profiles.get(q.userId); if (p) p.coins = (p.coins ?? 0) + q.cost; }
  }

  approveCard(id: number): boolean {
    const i = this.cardQueue.findIndex((q) => q.id === id);
    if (i < 0) return false;
    const q = this.cardQueue[i];
    if (this.cardBlock(q.kind)) { this.refuseCard(id); return false; } // a situação mudou enquanto esperava: devolve as moedas
    this.cardQueue.splice(i, 1);
    const card = CARDS.find((c) => c.kind === q.kind)!;
    this.cardCooldown[q.kind] = this.tick + card.cooldownDays * TICKS_PER_DAY;
    this.cardHistory.push(this.tick);
    this.startEvent(q.kind, mulberry32((this.seed ^ Math.imul(this.tick + 1, 0x85ebca6b)) >>> 0), q.name);
    return true;
  }

  refuseCard(id: number): boolean {
    const i = this.cardQueue.findIndex((q) => q.id === id);
    if (i < 0) return false;
    this.refund(this.cardQueue[i]);
    this.cardQueue.splice(i, 1);
    return true;
  }

  achievementStats(): AchStats {
    const done = this.buildings.filter((b) => b.done);
    return {
      pop: this.villagers.length, era: this.era, day: this.day, built: done.length - 1,
      kinds: new Set(done.map((b) => b.kind)).size,
      couples: this.villagers.filter((v) => v.partner).length / 2,
      kids: this.villagers.filter((v) => v.kid).length,
      drains: this.drains, demolished: this.autoDemolished,
      maxXp: this.villagers.reduce((m, v) => Math.max(m, v.xp), 0),
      events: this.eventsSeen, professions: Object.keys(this.leaders).length,
    };
  }

  private checkAchievements(): void {
    const s = this.achievementStats();
    for (const a of ACHIEVEMENTS) {
      if (this.achievements.includes(a.id) || !a.test(s)) continue;
      this.achievements.push(a.id);
      this.events.push(`🏆 Conquista: ${a.icon} ${a.label}! (${a.desc})`);
    }
  }

  step(): void {
    this.tick++;
    if (this.tick % 50 === 0) { this.checkEra(); this.checkAchievements(); }
    if (this.tick % TICKS_PER_DAY === 0) this.dailyEvent();
    if (this.tick % 5 === 0) {
      this.crowd.fill(0);
      for (const v of this.villagers) { const t = this.tileOf(v.x, v.y); if (this.crowd[t] < 255) this.crowd[t]++; }
    }
    if (this.tick % 10 === 0) { this.updatePower(); this.updateProfessions(); }
    if (this.tick % BOND_EVERY === 0) this.updateBonds();
    if (this.waitlist.length && this.tick % 20 === 0) this.admitWaiting();
    if (this.autonomy && this.tick % AUTONOMY_EVERY === 0) this.autonomyStep();
    for (const v of this.villagers) {
      if (v.state !== 'toTarget' && v.state !== 'toStore') continue;
      const t = this.tileOf(v.x, v.y);
      if (this.water[t] >= WADE_SLOW_DEPTH && !this.bridge[t]) this.wadeTraffic[t]++;
    }
    const drought = this.season.drought;
    const se = this.season;
    if (!drought && !this.warned && se.daysLeft <= DROUGHT_WARNING_DAYS) {
      this.warned = true;
      this.events.push('⚠ A seca chega em 1 dia! Encham o estoque de água e comida, ou façam uma represa.');
    }
    if (drought) this.warned = false;
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
    const relief = Math.min(MARKET_RELIEF_MAX, this.working('market') * MARKET_RELIEF * (1 + POWER_BONUS * this.power.ratio)); // o comércio abastece melhor
    const n = Math.ceil(this.villagers.length * (1 - relief));
    this.stock.food = Math.max(0, this.stock.food - n);
    this.stock.water = Math.max(0, this.stock.water - n);
  }

  private regrowCount = 0;

  private regrow(): void {
    this.regrowCount++;
    for (const n of this.nodes) {
      if (n.kind === 'rock' || n.amount >= NODE_MAX[n.kind]) continue;
      if (this.irrigated[this.idx(n.x, n.y)]) n.amount += 1;
      else if (n.kind === 'tree' && this.regrowCount % SAPLING_GROW_EVERY === 0) n.amount += 1; // a floresta se refaz devagar
    }
    // a floresta se espalha: uma muda nasce ao lado de uma árvore, longe de prédios, estradas e zonas
    const trees = this.nodes.filter((n) => n.kind === 'tree' && n.amount >= MIN_HARVEST);
    if (trees.length && this.rng() < SAPLING_CHANCE) {
      const t = trees[Math.floor(this.rng() * trees.length)];
      const x = t.x + Math.floor(this.rng() * 3) - 1, y = t.y + Math.floor(this.rng() * 3) - 1;
      if (x >= 1 && y >= 1 && x < GRID_W - 1 && y < GRID_H - 1 && this.saplingOk(x, y)) {
        this.nodes.push({ id: this.nextId++, kind: 'tree', x, y, amount: 0 });
        this.occ[this.idx(x, y)] = 1; this.forest[this.idx(x, y)] = 1;
      }
    }
  }

  private saplingOk(x: number, y: number): boolean {
    const i = this.idx(x, y);
    if (this.occ[i] || this.channel[i] || this.water[i] > 0.02 || this.road[i] || this.zone[i] || this.dam[i]) return false;
    for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
      const nx = x + k, ny = y + j;
      if (nx >= 0 && ny >= 0 && nx < GRID_W && ny < GRID_H && (this.blocked[this.idx(nx, ny)] || this.road[this.idx(nx, ny)])) return false;
    }
    return true;
  }

  // ---------- água ----------
  private flowStep(sourcesOn: boolean): void {
    const w = this.water, h = this.height, d = this.delta, f = this.flows;
    if (sourcesOn) for (let k = 0; k < this.sources.length; k++) w[this.sources[k]] += this.sourceRates[k];

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

    // 5) alagamento: água alta sobre o prédio o desliga até secar
    for (const b of this.buildings) {
      if (b.kind === 'townhall' || b.kind === 'dam' || b.kind === 'bridge') continue;
      let deep = 0;
      for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) deep = Math.max(deep, w[this.idx(b.x + i, b.y + j)]);
      const flooded = deep >= FLOOD_DEPTH;
      if (flooded === b.flooded) continue;
      b.flooded = flooded;
      if (b.done) {
        const label = BUILDINGS[b.kind as PlaceableKind].label;
        this.events.push(flooded ? `🌊 ${label} alagou e parou de funcionar!` : `✅ ${label} secou e voltou a funcionar.`);
      }
    }
  }

  // ---------- aldeões ----------
  private speedFactor(): number {
    let f = 1;
    if (this.starving) f *= STARVING_SLOWDOWN;
    if (this.supportActive) f *= SUPPORT_BONUS;
    if (this.event) f *= EVENTS[this.event.kind].speed;
    return f;
  }

  private tileOf(x: number, y: number): number {
    return Math.min(GRID_H - 1, Math.max(0, Math.floor(y))) * GRID_W + Math.min(GRID_W - 1, Math.max(0, Math.floor(x)));
  }

  private resetTask(v: Villager): void {
    v.state = 'idle';
    v.targetId = null;
    v.path = null;
    v.pi = 0;
  }

  /** O tile pode ser pisado? (prédio, represa e água funda fecham o caminho) */
  private walkable(t: number): boolean {
    return !this.blocked[t] && !this.dam[t] && (this.water[t] < MAX_WADE || this.bridge[t] === 1);
  }

  /** Custo de andar entre tiles vizinhos; Infinity = bloqueado (penhasco, prédio, água funda). */
  private stepCost(from: number, to: number): number {
    if (!this.walkable(to)) return Infinity;
    if (this.bridge[from] || this.bridge[to]) return 1; // ponte: sem degrau, sem vau
    if (Math.abs(this.height[from] - this.height[to]) > MAX_STEP) return Infinity;
    const jam = Math.min(this.crowd[to], CROWD_MAX) * CROWD_COST;
    if (this.water[to] >= WADE_SLOW_DEPTH) return 2 + jam;
    return (this.road[to] ? ROAD_STEP_COST : 1) + jam;
  }

  /** Tiles livres cujo centro está a `reach` do ponto (cx, cy). */
  private tilesNear(cx: number, cy: number, reach: number): number[] {
    const out: number[] = [];
    const r = Math.ceil(reach);
    for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) {
      for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= reach * reach && this.walkable(y * GRID_W + x)) out.push(y * GRID_W + x);
      }
    }
    return out;
  }

  /** Procura a rota mais curta até algum dos alvos; devolve o id do alvo alcançado e define v.path. */
  private route(v: Villager, cands: { id: number; x: number; y: number; reach: number }[]): number | undefined {
    const goal = new Map<number, number>();
    for (const c of cands) for (const t of this.tilesNear(c.x, c.y, c.reach)) if (!goal.has(t)) goal.set(t, c.id);
    if (!goal.size) return undefined;
    const path = findPath(this.tileOf(v.x, v.y), (t) => goal.has(t), (a, b) => this.stepCost(a, b));
    if (!path) return undefined;
    v.path = path;
    v.pi = 0;
    return goal.get(path.length ? path[path.length - 1] : this.tileOf(v.x, v.y));
  }

  /** Anda um passo ao longo da rota. */
  private follow(v: Villager): 'arrived' | 'moving' | 'blocked' {
    const path = v.path!;
    if (v.pi >= path.length) return 'arrived';
    const t = path[v.pi];
    if (!this.walkable(t)) return 'blocked'; // a água subiu ou algo foi construído no caminho
    const tx = (t % GRID_W) + 0.5, ty = Math.floor(t / GRID_W) + 0.5;
    const dx = tx - v.x, dy = ty - v.y;
    const d = Math.hypot(dx, dy);
    const wading = this.water[this.tileOf(v.x, v.y)] >= WADE_SLOW_DEPTH;
    const step = MOVE_SPEED * (wading ? WATER_SLOWDOWN : this.road[this.tileOf(v.x, v.y)] ? ROAD_SPEED : 1);
    if (d <= step) { v.x = tx; v.y = ty; v.pi++; return v.pi >= path.length ? 'arrived' : 'moving'; }
    v.x += (dx / d) * step;
    v.y += (dy / d) * step;
    return 'moving';
  }

  private stepVillager(v: Villager): void {
    if (v.wait > 0) { v.wait--; return; }
    switch (v.state) {
      case 'idle': return this.decide(v);
      case 'toTarget': {
        if (!this.targetValid(v)) { this.resetTask(v); return; }
        const r = this.follow(v);
        if (r === 'blocked') { this.resetTask(v); v.wait = RETRY_TICKS; return; }
        if (r === 'arrived') {
          v.state = 'working';
          v.workLeft = v.job === 'build' ? Infinity : GATHER_TICKS;
        }
        return;
      }
      case 'working': return this.work(v);
      case 'toStore': {
        if (!v.path) {
          const stores = this.buildings.filter((b) => b.done && !b.flooded && (b.kind === 'townhall' || b.kind === 'warehouse'));
          const id = this.route(v, stores.map((b) => ({ id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2, reach: Math.max(b.w, b.h) / 2 + 0.7 })));
          if (id === undefined) { this.storeFailed(v); return; }
        }
        const r = this.follow(v);
        if (r === 'blocked') { v.path = null; this.storeFailed(v); return; }
        if (r === 'arrived') {
          if (v.carryRes) {
            this.stock[v.carryRes] = Math.min(this.storageCap, this.stock[v.carryRes] + v.carry);
            const before = Math.floor(v.xp / COIN_XP);
            v.xp += v.carry;
            v.coins = (v.coins ?? 0) + Math.floor(v.xp / COIN_XP) - before;
            this.addSkill(v, v.carryRes, v.carry);
          }
          v.carry = 0;
          v.carryRes = null;
          v.storeFails = 0;
          this.resetTask(v);
        }
        return;
      }
    }
  }

  /** Sem caminho até um depósito: tenta mais algumas vezes e, se não der, desiste e larga a carga. */
  private storeFailed(v: Villager): void {
    v.wait = RETRY_TICKS;
    v.storeFails = (v.storeFails ?? 0) + 1;
    if (v.storeFails >= STORE_GIVE_UP) {
      v.carry = 0; v.carryRes = null; v.storeFails = 0;
      this.resetTask(v);
    }
  }

  private decide(v: Villager): void {
    // sobrou carga de outra função (trocou de profissão no meio do caminho): guarda antes de procurar trabalho
    if (v.carry > 0 && v.carryRes) {
      if (this.stock[v.carryRes] >= this.storageCap) { v.carry = 0; v.carryRes = null; return; } // estoque cheio: larga a carga e procura outra coisa
      v.state = 'toStore'; v.path = null; return;
    }
    const cands = this.candidates(v.job);
    const id = cands.length ? this.route(v, cands) : undefined;
    if (id === undefined) { v.wait = RETRY_TICKS; return; } // sem alvo ou sem caminho: tenta de novo em instantes
    v.targetId = id;
    v.state = 'toTarget';
  }

  /** Alvos possíveis para a profissão: nós, prédios produtores e margem do rio. */
  private candidates(job: Job): { id: number; x: number; y: number; reach: number }[] {
    const c: { id: number; x: number; y: number; reach: number }[] = [];
    const bReach = (b: Building): number => Math.max(b.w, b.h) / 2 + 0.7;
    // estoque cheio: não gasta recurso finito à toa (o streamer vê "sem trabalho" e constrói armazém)
    if (job !== 'build' && this.stock[job] >= this.storageCap) return c;
    if (job === 'build') {
      const sites = this.buildings.filter((b) => !b.done);
      const pri = sites.filter((b) => b.priority);
      for (const b of pri.length ? pri : sites) c.push({ id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2, reach: bReach(b) });
      return c;
    }
    if (job === 'wood' || job === 'stone' || job === 'food') {
      const kind: NodeKind = job === 'wood' ? 'tree' : job === 'stone' ? 'rock' : 'bush';
      for (const n of this.nodes) if (n.kind === kind && this.nodeHarvestable(n)) c.push({ id: n.id, x: n.x + 0.5, y: n.y + 0.5, reach: REACH });
    }
    if (job === 'food' || job === 'water' || job === 'stone') {
      const kind: BuildingKind = job === 'food' ? 'farm' : job === 'water' ? 'well' : 'quarry';
      for (const b of this.buildings) {
        if (b.kind === kind && b.done && this.buildingWorks(b) && this.slotsFree(b)) c.push({ id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2, reach: bReach(b) });
      }
    }
    if (job === 'water') {
      for (const i of this.wet) c.push({ id: -(i + 1), x: (i % GRID_W) + 0.5, y: Math.floor(i / GRID_W) + 0.5, reach: REACH });
    }
    return c;
  }

  private work(v: Villager): void {
    if (v.job === 'build') {
      const b = this.buildings.find((x) => x.id === v.targetId);
      if (!b || b.done) { this.resetTask(v); return; }
      b.progress += this.speedFactor();
      this.addSkill(v, 'build', 0.1);
      if (b.progress >= b.workNeeded) this.finish(b);
      return;
    }
    if (!this.targetValid(v)) { this.resetTask(v); return; }
    v.workLeft -= this.speedFactor();
    if (v.workLeft > 0) return;
    const res = v.job as Resource;
    let amt = CARRY_CAPACITY;
    if (res === 'wood' || res === 'stone') amt *= eraGather(this.era);
    if (res === 'wood') amt *= 1 + TOOL_BONUS * this.toolCoverage(this.axes);
    if (res === 'stone') amt *= 1 + TOOL_BONUS * this.toolCoverage(this.picks);
    const boost = 1 + POWER_BONUS * this.power.ratio; // energia das rodas d'água
    if (res === 'wood' && this.working('sawmill') > 0) amt *= SAWMILL_BONUS * boost;
    if (res === 'stone' && this.working('quarry') > 0) amt *= QUARRY_BONUS * boost;
    if (this.event) amt *= EVENTS[this.event.kind].gather;
    amt = Math.round(amt);
    const node = this.nodes.find((n) => n.id === v.targetId);
    if (node) {
      amt = Math.min(amt, node.amount);
      node.amount -= amt;
      if (node.kind === 'rock' && node.amount <= 0) this.removeNode(node);
      else if (node.kind === 'tree' && node.amount < MIN_HARVEST) this.removeNode(node); // árvore derrubada: o tile fica livre (clareira)
    }
    v.carry = amt;
    v.carryRes = res;
    v.state = 'toStore';
    v.targetId = null;
    v.path = null;
    v.pi = 0;
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
      this.terrainVersion++;
    }
    if (b.kind === 'bridge') this.rebuildBridges();
    this.events.push(`${BUILDINGS[b.kind as PlaceableKind].label} concluída!`);
    for (const o of this.villagers) {
      if (o.job === 'build' && o.targetId === b.id) this.resetTask(o);
    }
  }

  /** O alvo ainda serve? (a seca pode ter secado o poço, a fazenda ou a margem) */
  private targetValid(v: Villager): boolean {
    const id = v.targetId;
    if (id === null) return false;
    if (v.job === 'build') return this.buildings.some((b) => b.id === id && !b.done);
    if (id < 0) return this.water[-id - 1] >= WET_DEPTH * 0.6;
    const b = this.buildings.find((x) => x.id === id);
    if (b) return b.done && this.buildingWorks(b);
    const n = this.nodes.find((x) => x.id === id);
    return !!n && this.nodeHarvestable(n);
  }

  private nodeHarvestable(n: ResourceNode): boolean {
    return n.kind === 'rock' ? n.amount > 0 : n.amount >= MIN_HARVEST;
  }

  buildingWorks(b: Building): boolean {
    if (b.flooded) return false;
    if (b.kind === 'quarry') return true; // pedra natural acaba; a pedreira é a fonte sustentável
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

  /** Quantos aldeões estão indo ou trabalhando neste prédio. */
  workersAt(b: Building): number {
    let used = 0;
    for (const v of this.villagers) {
      if (v.targetId === b.id && (v.state === 'toTarget' || v.state === 'working')) used++;
    }
    return used;
  }

  private slotsFree(b: Building): boolean {
    const slots = BUILDINGS[b.kind as PlaceableKind]?.slots;
    return !slots || this.workersAt(b) < slots;
  }

  /** Quão urgente é coletar `r`: cresce com a falta, comida e água pesam o dobro, estoque cheio não pede nada. */
  private urgency(r: Resource): number {
    const frac = this.stock[r] / this.storageCap;
    if (frac >= 1) return 0;
    return (1 - frac) ** 2 * (r === 'food' || r === 'water' ? 2 : 1) + 0.02;
  }

  /** Quantos coletores a mais cada recurso pede (positivo = faltam braços), sem contar `except`. */
  private deficits(except?: Villager): Record<Resource, number> {
    const gatherers = this.villagers.filter((v) => v.job !== 'build').length;
    const urg = {} as Record<Resource, number>;
    let total = 0;
    for (const r of RESOURCES) { urg[r] = this.urgency(r); total += urg[r]; }
    const out = {} as Record<Resource, number>;
    for (const r of RESOURCES) {
      const have = this.villagers.filter((v) => v !== except && v.job === r).length;
      out[r] = (total > 0 ? (urg[r] / total) * gatherers : 0) - have;
    }
    return out;
  }

  /** Profissão para quem precisa de uma: o recurso com mais falta de braços. */
  private neediestResource(except?: Villager): Resource {
    const d = this.deficits(except);
    const open = RESOURCES.filter((r) => this.stock[r] < this.storageCap); // recurso com estoque cheio não tem o que fazer
    const pool = open.length ? open : RESOURCES;
    let best: Resource = pool[0];
    for (const r of pool) if (d[r] > d[best] + 1e-9) best = r;
    return best;
  }

  // ---------- pontes ----------
  /** Altura do tabuleiro no tile (x, y): a maior das margens da mesma linha. */
  deckHeight(x: number, y: number): number {
    let best = -Infinity;
    for (const dir of [-1, 1]) {
      for (let k = 1; k <= 8; k++) {
        const nx = x + dir * k;
        if (nx < 0 || nx >= GRID_W) break;
        const t = this.idx(nx, y);
        if (!this.channel[t]) { best = Math.max(best, this.height[t]); break; }
      }
    }
    return Number.isFinite(best) ? best : this.height[this.idx(x, y)];
  }

  /** Recalcula as pontes concluídas (depois de carregar um save ou de obra/demolição). */
  rebuildBridges(): void {
    this.bridge.fill(0);
    for (const b of this.buildings) {
      if (b.kind !== 'bridge' || !b.done) continue;
      const t = this.idx(b.x, b.y);
      this.bridge[t] = 1;
      this.deck[t] = this.deckHeight(b.x, b.y);
    }
  }

  /** Tiles que se alcança a pé a partir de `start`, andando de lado (conservador). */
  private reachableFrom(start: number): Uint8Array {
    const seen = new Uint8Array(N);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const t = stack.pop()!;
      const x = t % GRID_W, y = (t - x) / GRID_W;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const u = ny * GRID_W + nx;
        if (!seen[u] && this.stepCost(t, u) < Infinity) { seen[u] = 1; stack.push(u); }
      }
    }
    return seen;
  }

  /**
   * Se há recursos de que a vila precisa do outro lado do rio, os aldeões constroem uma ponte no ponto
   * mais perto da prefeitura onde o rio é estreito.
   */
  private autoBridge(): void {
    if (this.buildings.some((b) => b.kind === 'bridge' && !b.done)) return;
    const hall = this.townHall();
    const near = this.tilesNear(hall.x + hall.w / 2, hall.y + hall.h / 2, hall.w / 2 + 2);
    if (!near.length) return;
    const reach = this.reachableFrom(near[0]);
    const strandedAll = this.nodes.filter((n) => this.nodeHarvestable(n) && !this.tilesNear(n.x + 0.5, n.y + 0.5, 1.4).some((t) => reach[t]));
    const strandedNodes = strandedAll.length >= AUTO_BRIDGE_MIN_STRANDED ? strandedAll : []; // poucos isolados não valem uma ponte
    const land = (t: number): boolean => !this.channel[t] && this.walkable(t) && !this.occ[t];
    const cost = BUILDINGS.bridge.cost.wood ?? 0;
    type Cand = { y: number; x0: number; x1: number; score: number };
    let best: Cand | null = null;
    for (let y = 1; y < GRID_H - 1; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        if (!this.channel[this.idx(x, y)] || this.channel[this.idx(x - 1, y)]) continue; // começo de um trecho de rio
        let x1 = x;
        while (x1 + 1 < GRID_W - 1 && this.channel[this.idx(x1 + 1, y)]) x1++;
        if (x1 - x + 1 > AUTO_BRIDGE_MAX_SPAN || x1 + 1 >= GRID_W) continue;
        const L = this.idx(x - 1, y), R = this.idx(x1 + 1, y);
        if (!land(L) || !land(R)) continue;
        const tiles: number[] = [];
        for (let i = x; i <= x1; i++) tiles.push(this.idx(i, y));
        if (!tiles.every((t) => this.spotOk('bridge', t % GRID_W, y))) continue;
        if (this.buildings.some((o) => o.kind === 'bridge' && Math.abs(o.y - y) < 3)) continue; // já há travessia por perto
        // por que ali? (1) o rio fecha o caminho até recursos úteis; (2) aldeões vivem atravessando a vau
        let score = 0;
        if (reach[L] !== reach[R]) {
          const far = reach[L] ? R : L;
          const fx = far % GRID_W, fy = (far - fx) / GRID_W;
          if (strandedNodes.some((n) => (n.x - fx) ** 2 + (n.y - fy) ** 2 <= 100)) score += 1000;
        }
        const traffic = tiles.reduce((a, t) => a + this.wadeTraffic[t], 0);
        if (traffic >= AUTO_BRIDGE_WADE_MIN) score += traffic;
        if (score <= 0) continue;
        score -= Math.abs(y - hall.y) * 0.01; // desempate: perto da prefeitura
        if (!best || score > best.score) best = { y, x0: x, x1, score };
      }
    }
    if (!best) return;
    const n = best.x1 - best.x0 + 1;
    if (this.stock.wood < cost * n + AUTO_HOUSE_RESERVE) return;
    for (let i = best.x0; i <= best.x1; i++) this.requestBuild('bridge', i, best.y);
    this.events.push('🌉 Os aldeões decidiram construir uma ponte: viviam atravessando o rio.');
  }

  // ---------- autonomia ----------
  /** Decisões dos aldeões sem ordem: profissão e casas. Determinístico (sem sorteio). */
  private toolCoverage(n: number): number { return this.villagers.length ? Math.min(1, n / this.villagers.length) : 0; }

  /** Fabrica um machado ou uma picareta por vez, o que estiver mais atrasado, se o estoque aguentar. */
  private autoCraft(): void {
    const pop = this.villagers.length;
    if (!pop) return;
    const kind = this.axes <= this.picks ? 'axe' : 'pick';
    const have = kind === 'axe' ? this.axes : this.picks;
    if (have >= pop) return;
    const cost = kind === 'axe' ? AXE_COST : PICK_COST;
    if (this.stock.wood < (cost.wood ?? 0) + TOOL_RESERVE.wood || this.stock.stone < (cost.stone ?? 0) + TOOL_RESERVE.stone) return;
    this.stock.wood -= cost.wood ?? 0;
    this.stock.stone -= cost.stone ?? 0;
    if (kind === 'axe') this.axes++; else this.picks++;
    if (have === 0) this.events.push(kind === 'axe' ? '🪓 Os aldeões fabricaram os primeiros machados de pedra.' : '⛏ Os aldeões fabricaram as primeiras picaretas.');
  }

  private autonomyStep(): void {
    for (let i = 0; i < N; i++) if (this.wadeTraffic[i] > 0) this.wadeTraffic[i] *= 0.92; // o trânsito antigo vai sendo esquecido
    this.autoJobs();
    this.autoPlan();
    this.autoCraft();
    this.autoNpc();
    for (const b of this.buildings) {
      if (b.done && b.flooded) b.floodAge = (b.floodAge ?? 0) + 1;
      else if (b.floodAge) b.floodAge = 0;
    }
    if (this.buildings.some((b) => b.done && b.flooded && b.kind !== 'townhall' && b.kind !== 'dam' && b.kind !== 'bridge')) {
      this.autoFillOrDemolish();
      if (++this.floodRounds >= AUTO_DRAIN_ROUNDS && this.autoDrain()) this.floodRounds = 0;
    } else this.floodRounds = 0;
    if ((this.tick / AUTONOMY_EVERY) % 5 === 0 && this.needIrrigation) { this.needIrrigation = false; this.autoCanal(); }
    if ((this.tick / AUTONOMY_EVERY) % 3 === 0) { this.autoBridge(); this.autoRoad(); } // procuram mais raramente: é um cálculo maior
  }

  private autoJobs(): void {
    const builders = (): number => this.villagers.filter((v) => v.job === 'build').length;
    const open = this.buildings.filter((b) => !b.done);
    const critical = open.filter((b) => b.kind === 'farm' || b.kind === 'well').length;
    const stable = this.stock.food / this.storageCap > 0.15 && this.stock.water / this.storageCap > 0.15;
    // com fome ou sede só se constrói o que resolve isso; o resto espera a vila se firmar
    let wantBuilders = Math.min((critical + (stable ? open.length - critical : 0)) * 2, Math.ceil(this.villagers.length / 4));
    if (critical > 0) wantBuilders = Math.max(wantBuilders, 1);
    const helperRoom = this.villagers.some((v) => v.job !== 'build' && this.isStuck(v)) || RESOURCES.some((r) => this.stock[r] >= this.storageCap) ? open.length * 3 : 0;
    for (const v of this.villagers) {
      if (v.ordered) continue;
      if ((this.tick / AUTONOMY_EVERY + v.id) % 3 !== 0) continue; // cada aldeão reavalia a cada ~30 s, em turnos
      const stuck = this.isStuck(v);
      let best: Job = v.job;
      // sem trabalho na função: ajuda nas obras abertas (até 3 ajudantes por obra além dos construtores normais)
      if (stuck && v.job !== 'build' && open.length > 0 && builders() < wantBuilders + helperRoom) best = 'build';
      else if (v.job !== 'build' && builders() < wantBuilders) best = 'build';
      else if (v.job === 'build' && (open.length === 0 || builders() > wantBuilders + helperRoom)) best = this.neediestResource();
      else if (v.job !== 'build') {
        const d = this.deficits(v);
        const cand = this.neediestResource(v);
        if (stuck ? cand !== v.job : d[cand] - d[v.job as Resource] > AUTO_JOB_MARGIN) best = cand;
      }
      if (best !== v.job) { v.job = best; this.resetTask(v); }
    }
  }

  private countKind(kind: BuildingKind): number { return this.buildings.filter((b) => b.kind === kind).length; }

  /** Terreno bom para `kind` perto da prefeitura: ponto válido, com corredor livre e sem tomar terra de fazenda. */
  private findSite(kind: PlaceableKind): { x: number; y: number } | null {
    const z = this.zoneFor(kind);
    if (z && this.hasZone(z)) return this.zoneSite(kind, z); // há zona pintada: só constroem nela, colados à estrada
    const hall = this.townHall();
    const cx = hall.x + hall.w / 2, cy = hall.y + hall.h / 2;
    const { w, h } = BUILDINGS[kind];
    const maxD = kind === 'quarry' || kind === 'waterwheel' ? QUARRY_MAX_DIST : kind === 'farm' || kind === 'well' ? 22 : AUTO_BUILD_MAX_DIST;
    const rocks = kind === 'quarry' ? this.nodes.filter((n) => n.kind === 'rock' && this.nodeHarvestable(n)) : [];
    let best: { x: number; y: number } | null = null;
    let bs = Infinity;
    for (let y = 1; y < GRID_H - 1; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        const d = (x + w / 2 - cx) ** 2 + (y + h / 2 - cy) ** 2;
        if (d > maxD ** 2 || d < 9) continue;
        let score = d;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.forest[this.idx(x + i, y + j)]) score += 5; // prefere clareira: cada árvore a derrubar pesa
        if (rocks.length) score = Math.min(...rocks.map((n) => (n.x - x) ** 2 + (n.y - y) ** 2)) * 4 + d * 0.1;
        if (score >= bs) continue;
        if (!this.spotOk(kind, x, y) || !this.roomAround(x, y, w, h)) continue;
        if (this.zoned(x, y, w, h)) continue; // terra zoneada é reservada para o tipo certo
        if (kind !== 'farm' && kind !== 'well' && kind !== 'waterwheel' && this.irrigated[this.idx(x, y)] === 1) continue; // terra irrigada fica para fazendas
        best = { x, y }; bs = score;
      }
    }
    return best;
  }

  /**
   * Os aldeões decidem o que a vila precisa e constroem com o estoque: comida e água primeiro,
   * depois moradia, armazém e produção. Uma necessidade por vez, e só se a vila se sustenta.
   */
  private autoPlan(): void {
    const pop = this.villagers.length;
    if (this.buildings.filter((b) => !b.done && b.kind !== 'bridge').length >= 2 + Math.floor(pop / 10)) return; // vila maior, mais obras ao mesmo tempo
    const cap = this.storageCap;
    const fr = (r: Resource): number => this.stock[r] / cap;
    const farms = this.countKind('farm'), wells = this.countKind('well'), houses = this.countKind('house');
    type Need = { kind: PlaceableKind; why: string; art: string; name: string };
    const needs: Need[] = [];
    if (farms < Math.ceil(pop / 5) && (farms === 0 || fr('food') < 0.6)) needs.push({ kind: 'farm', art: 'uma', name: 'fazenda', why: 'faltava comida' });
    if (wells < Math.ceil(pop / 6) && (wells === 0 || fr('water') < 0.6)) needs.push({ kind: 'well', art: 'um', name: 'poço', why: 'faltava água' });
    const openHouses = this.buildings.filter((b) => b.kind === 'house' && !b.done).length;
    if (openHouses < 1 + Math.ceil(this.waitlist.length / HOUSE_POP) && (pop + this.waitlist.length >= this.popCap - Math.max(1, Math.ceil(pop * 0.15))) && fr('food') > 0.25 && fr('water') > 0.25) needs.push({ kind: 'house', art: 'uma', name: 'casa', why: 'faltava moradia' });
    if (RESOURCES.some((r) => fr(r) >= 0.9) && this.countKind('warehouse') < Math.ceil(houses / 3) + Math.floor(this.villagers.filter((v) => this.isStuck(v)).length / 10)) needs.push({ kind: 'warehouse', art: 'um', name: 'armazém', why: 'o estoque estava cheio' });
    if (houses >= 4 && this.countKind('market') < Math.floor(houses / 4)) needs.push({ kind: 'market', art: 'um', name: 'mercado', why: 'a cidade pedia comércio' });
    if (pop >= 8 && this.stock.wood < 30 && this.countKind('sawmill') === 0) needs.push({ kind: 'sawmill', art: 'uma', name: 'serraria', why: 'faltava madeira' });
    if (this.power.demand > 0 && this.power.supply < this.power.demand && this.countKind('waterwheel') < 1 + Math.floor(houses / 8) && !this.buildings.some((b) => b.kind === 'waterwheel' && !b.done)) {
      needs.push({ kind: 'waterwheel', art: 'uma', name: "roda d'água", why: 'as máquinas precisavam de energia' });
    }
    if (this.stock.stone < 20 && this.countKind('quarry') === 0) needs.push({ kind: 'quarry', art: 'uma', name: 'pedreira', why: 'faltava pedra' });
    // metas da próxima era que pedem prédios de apoio: constroem quando a população já está perto da meta
    const nextEra = ERAS[this.era + 1];
    const popGoal = nextEra?.goals.find((g) => g.label === 'aldeões')?.need ?? Infinity;
    if (nextEra && pop >= popGoal * 0.7) {
      for (const g of nextEra.goals) {
        const kind = g.kind ?? GOAL_KIND[g.label];
        if (!kind || needs.some((n) => n.kind === kind)) continue;
        if (this.countKind(kind) < g.need && fr('food') > 0.25 && fr('water') > 0.25) {
          const name = BUILDINGS[kind as PlaceableKind].label.toLowerCase();
          needs.push({ kind: kind as PlaceableKind, art: kind === 'sawmill' || kind === 'quarry' || kind === 'farm' ? 'uma' : 'um', name, why: `a ${nextEra.name} pedia isso` });
        }
      }
    }
    for (const n of needs) {
      let site = this.findSite(n.kind);
      if (!site && n.kind === 'farm') this.needIrrigation = true; // sem terra irrigada livre: cavam um canal
      if (!site && !(this.zoneFor(n.kind) && this.hasZone(this.zoneFor(n.kind))) && n.kind !== 'farm' && n.kind !== 'well' && n.kind !== 'quarry' && n.kind !== 'waterwheel') {
        site = this.autoLevel(n.kind); // sem lugar plano: aplainam um terreno
        if (site) { this.events.push(`⛏ Os aldeões aplainaram um terreno para ${n.art} ${n.name}.`); return; } // constroem na próxima rodada
      }
      if (!site) continue;
      const cost = BUILDINGS[n.kind].cost;
      const afford = RESOURCES.every((r) => this.stock[r] >= (cost[r] ?? 0) + (r === 'wood' ? AUTO_HOUSE_RESERVE : 0));
      if (!afford) { if (n.kind === 'farm' || n.kind === 'well') return; continue; } // juntam material antes de seguir
      if (this.requestBuild(n.kind, site.x, site.y).ok) this.events.push(`🛠 Os aldeões decidiram construir ${n.art} ${n.name}: ${n.why}.`);
      return;
    }
  }

  private zoned(x: number, y: number, w: number, h: number): boolean {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.zone[this.idx(x + i, y + j)]) return true;
    return false;
  }

  /** Sem outro prédio colado: deixa um corredor livre para andar. */
  private roomAround(x: number, y: number, w: number, h: number): boolean {
    for (let j = y - 1; j <= y + h; j++) {
      for (let i = x - 1; i <= x + w; i++) {
        if (i < 0 || j < 0 || i >= GRID_W || j >= GRID_H) continue;
        if (this.blocked[this.idx(i, j)]) return false;
      }
    }
    return true;
  }

  // ---------- colocação ----------
  private inBounds(x: number, y: number, w: number, h: number): boolean {
    return x >= 1 && y >= 1 && x + w <= GRID_W - 1 && y + h <= GRID_H - 1;
  }

  private markRect(x: number, y: number, w: number, h: number, val: number, grid: Uint8Array = this.occ): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid[this.idx(x + i, y + j)] = val;
  }

  private spotOk(kind: PlaceableKind, x: number, y: number): boolean {
    const { w, h } = BUILDINGS[kind];
    if (!this.inBounds(x, y, w, h)) return false;
    const h0 = this.height[this.idx(x, y)];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const t = this.idx(x + i, y + j);
        if ((this.occ[t] && !this.forest[t]) || this.dam[t] || this.road[t]) return false; // árvore não impede: a obra limpa o terreno
        if (kind === 'dam' || kind === 'bridge') { if (!this.channel[t]) return false; continue; }
        if (kind !== 'quarry' && this.mine[t]) return false; // a jazida é reservada para a pedreira
        if (this.channel[t] || this.water[t] > 0.05 || this.height[t] !== h0) return false;
      }
    }
    if (kind === 'waterwheel') { // na margem: pelo menos 3 tiles de água encostados nela
      let wet = 0;
      for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
        if (i >= 0 && i < w && j >= 0 && j < h) continue;
        const tx = x + i, ty = y + j;
        if (tx >= 0 && ty >= 0 && tx < GRID_W && ty < GRID_H && this.water[this.idx(tx, ty)] > 0.3) wet++;
      }
      if (wet < 3) return false;
    }
    if (kind === 'quarry') {
      let onMine = 0;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.mine[this.idx(x + i, y + j)]) onMine++;
      if (onMine < 2) return false; // pedreira só em mina de pedra
    }
    if (kind === 'dam') {
      // uma represa por trecho: sem outra a menos de 3 linhas
      if (this.buildings.some((b) => b.kind === 'dam' && Math.abs(b.y - y) < 3)) return false;
    }
    if (kind === 'house' || kind === 'warehouse' || kind === 'market' || kind === 'sawmill' || kind === 'quarry') {
      // beira d'água não: o telhado e a base ficariam por cima do lago (um tile de folga)
      for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
        const tx = x + i, ty = y + j;
        if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
        const t = this.idx(tx, ty);
        if (this.channel[t] || this.water[t] > 0.05) return false;
      }
    }
    if (kind === 'farm') return this.irrigated[this.idx(x, y)] === 1;
    if (kind === 'well') return this.waterNear(x + w / 2, y + h / 2, WELL_RANGE);
    return true;
  }

  private placeBuilding(kind: BuildingKind, x: number, y: number, w: number, h: number, work: number, done: boolean): Building {
    const b: Building = { id: this.nextId++, kind, x, y, w, h, progress: done ? work : 0, workNeeded: work, done, priority: false, flooded: false };
    this.buildings.push(b);
    this.markRect(x, y, w, h, 1);
    if (kind !== 'bridge') this.markRect(x, y, w, h, 1, this.blocked); // ponte não fecha o caminho
    return b;
  }

  /** Derruba as árvores do retângulo (a obra abre espaço na floresta). */
  private clearTrees(x: number, y: number, w: number, h: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!this.forest[this.idx(x + i, y + j)]) continue;
      const n = this.nodes.find((q) => q.kind === 'tree' && q.x === x + i && q.y === y + j);
      if (n) this.removeNode(n);
    }
  }

  private removeNode(n: ResourceNode): void {
    this.nodes.splice(this.nodes.indexOf(n), 1);
    this.occ[this.idx(n.x, n.y)] = 0;
    this.forest[this.idx(n.x, n.y)] = 0;
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

    // o rio muda de mapa para mapa: posição, curvas mais ou menos fortes
    const riverBase = Math.round(GRID_W * 0.62) + Math.floor(this.rng() * 4), riverAmp = 2 + this.rng() * 2.2, riverFreq = 0.24 + this.rng() * 0.22;
    for (let y = 0; y < GRID_H; y++) this.rx[y] = riverBase + Math.round(Math.sin(y * riverFreq + phase) * riverAmp);
    // biomas: campo de fertilidade suave (floresta onde alto, terra pedregosa onde baixo)
    const bw = 7, bh = 6;
    const bcoarse = Array.from({ length: bw * bh }, () => this.rng());
    const bnoise = (x: number, y: number): number => {
      const fx = (x / (GRID_W - 1)) * (bw - 1), fy = (y / (GRID_H - 1)) * (bh - 1);
      const x0 = Math.min(bw - 2, Math.floor(fx)), y0 = Math.min(bh - 2, Math.floor(fy));
      const tx = fx - x0, ty = fy - y0;
      const c = (a: number, b: number): number => bcoarse[b * bw + a];
      return (c(x0, y0) * (1 - tx) + c(x0 + 1, y0) * tx) * (1 - ty) + (c(x0, y0 + 1) * (1 - tx) + c(x0 + 1, y0 + 1) * tx) * ty;
    };

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const n = noise(x, y);
        this.height[this.idx(x, y)] = this.baseHeight(y) + (n > 0.68 ? 1 : 0) + (n > 0.88 ? 1 : 0);
      }
    }

    // vila no terraço do meio, em um platô plano perto do rio
    const hx = Math.round(GRID_W * 0.44), hy = Math.round(GRID_H * 0.45);
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
    this.sourceRates = [SOURCE_RATE, SOURCE_RATE];
    this.carveLakes(hx + 1, hy + 1);
    this.baseSources = this.sources.length;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const b = bnoise(x, y);
        this.biome[this.idx(x, y)] = b > 0.6 ? BIOME_FOREST : b < 0.3 ? BIOME_ROCKY : BIOME_MEADOW;
      }
    }

    this.placeBuilding('townhall', hx, hy, 3, 3, 0, true);

    for (let s = 0; s < 160; s++) this.flowStep(true); // assenta o rio
    for (let i = 0; i < N; i++) this.moisture[i] = this.irrigated[i];

    // cada bioma favorece um recurso: floresta, árvores; terra pedregosa, pedras; campo, arbustos
    const likes: Record<NodeKind, [number, number, number]> = { tree: [0.45, 1, 0.12], rock: [0.3, 0.12, 1], bush: [1, 0.35, 0.2] }; // [campo, floresta, pedregosa]
    const scatter = (kind: NodeKind, count: number, minDist: number, needWater: boolean): void => {
      let tries = 0;
      while (count > 0 && tries++ < 12000) {
        const x = 1 + Math.floor(this.rng() * (GRID_W - 2));
        const y = 1 + Math.floor(this.rng() * (GRID_H - 2));
        const i = this.idx(x, y);
        if (this.occ[i] || this.channel[i] || this.water[i] > 0.02) continue;
        if (Math.hypot(x - hx - 1, y - hy - 1) < minDist) continue;
        if (needWater && !this.irrigated[i]) continue;
        if (this.rng() > likes[kind][this.biome[i]]) continue;
        this.nodes.push({ id: this.nextId++, kind, x, y, amount: NODE_MAX[kind] });
        this.occ[i] = 1;
        count--;
      }
    };
    // floresta fechada perto do acampamento que vai rareando com a distância, mais cheia no bioma de floresta
    for (let y = 1; y < GRID_H - 1; y++) {
      for (let x = 1; x < GRID_W - 1; x++) {
        const i = this.idx(x, y);
        if (this.occ[i] || this.channel[i] || this.water[i] > 0.02) continue;
        const d = Math.hypot(x - hx - 1, y - hy - 1);
        if (d < CLEARING_RADIUS) continue;
        const fade = Math.min(1, Math.max(0, (d - FOREST_FADE_START) / FOREST_FADE_LEN));
        const biome = this.biome[i] === BIOME_FOREST ? 1.25 : this.biome[i] === BIOME_ROCKY ? 0.4 : 0.9;
        if (this.rng() >= (FOREST_NEAR + (FOREST_FAR - FOREST_NEAR) * fade) * biome) continue;
        this.nodes.push({ id: this.nextId++, kind: 'tree', x, y, amount: NODE_MAX.tree });
        this.occ[i] = 1; this.forest[i] = 1;
      }
    }
    scatter('bush', Math.round((12 + Math.floor(this.rng() * 8)) * MAP_SCALE), 4, true);
    scatter('rock', Math.round((16 + Math.floor(this.rng() * 12)) * MAP_SCALE), 6, false);
    this.placeMines();
  }

  /** Jazidas de pedra: manchas de terra firme longe da vila e da água, de preferência em terreno pedregoso. Usa um sorteio próprio (a seed do mapa não muda). */
  private placeMines(): void {
    const rng = mulberry32((this.seed ^ 0x6d696e65) >>> 0);
    const hall = this.townHall();
    const cx = hall.x + hall.w / 2, cy = hall.y + hall.h / 2;
    const want = Math.max(2, Math.round(MINE_VEINS * Math.sqrt(MAP_SCALE)));
    const centers: Array<{ x: number; y: number }> = [];
    for (let tries = 0; centers.length < want && tries < 4000; tries++) {
      const x = 4 + Math.floor(rng() * (GRID_W - 8)), y = 4 + Math.floor(rng() * (GRID_H - 8));
      const i = this.idx(x, y);
      if (Math.hypot(x - cx, y - cy) < MINE_MIN_DIST || centers.some((c) => Math.hypot(c.x - x, c.y - y) < 12)) continue;
      if (this.water[i] > 0.02 || this.channel[i]) continue;
      if (this.biome[i] !== BIOME_ROCKY && rng() > 0.25) continue; // quase sempre em terra pedregosa
      centers.push({ x, y });
    }
    for (const c of centers) {
      const r = 2.1 + rng() * 0.9;
      for (let y = Math.floor(c.y - r - 1); y <= Math.ceil(c.y + r + 1); y++) {
        for (let x = Math.floor(c.x - r - 1); x <= Math.ceil(c.x + r + 1); x++) {
          if (x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1) continue;
          const i = this.idx(x, y);
          if (Math.hypot(x - c.x, y - c.y) > r * (0.85 + 0.3 * rng()) || this.water[i] > 0.02 || this.channel[i] || this.dam[i]) continue;
          this.mine[i] = 1;
        }
      }
    }
  }

  /** Quanto a roda rende agora (0 a 1): depende da água em volta (some na seca). */
  wheelFlow(b: Building): number {
    let wet = 0;
    for (let j = -1; j <= b.h; j++) for (let i = -1; i <= b.w; i++) {
      if (i >= 0 && i < b.w && j >= 0 && j < b.h) continue;
      const x = b.x + i, y = b.y + j;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
      wet += Math.min(1, this.water[this.idx(x, y)]);
    }
    return Math.min(1, wet / POWER_WATER_FULL);
  }

  // ---------- profissões, líderes e donos ----------
  private addSkill(v: Villager, job: Job, amount: number): void {
    v.skill ??= JOBS.map(() => 0);
    v.skill[JOBS.indexOf(job)] += amount;
  }

  /** Profissão do viewer: onde ele mais trabalhou (ou a função atual, se ainda não trabalhou). */
  professionOf(v: Villager): Job {
    const s = v.skill;
    if (!s) return v.job;
    let best = -1;
    for (let i = 0; i < JOBS.length; i++) if (s[i] > 0 && (best < 0 || s[i] > s[best])) best = i;
    return best < 0 ? v.job : JOBS[best];
  }

  isLeader(v: Villager): boolean { return this.leaders[this.professionOf(v)] === v.userId; }

  /** Quem é o dono do estabelecimento, se houver. */
  ownerOf(b: Building): Villager | undefined { return b.owner ? this.findVillager(b.owner) : undefined; }

  /** Nome do estabelecimento: tipo + viewer dono (ex.: "Fazenda de Ana", "Shopping Ana"). */
  establishmentName(b: Building): string | undefined {
    const o = this.ownerOf(b);
    if (!o || b.kind === 'townhall') return undefined;
    if (b.kind === 'market') return this.era >= 6 ? `Shopping ${o.name}` : this.era >= 4 ? `Galeria ${o.name}` : `Mercado de ${o.name}`;
    const base: Record<string, string> = { house: 'Casa', farm: 'Fazenda', well: 'Poço', sawmill: 'Serraria', quarry: 'Pedreira', warehouse: 'Armazém', waterwheel: "Roda d'água", dam: 'Represa' };
    return `${base[b.kind] ?? BUILDINGS[b.kind as PlaceableKind].label} de ${o.name}`;
  }

  private static readonly OWNER_JOB: Partial<Record<BuildingKind, Job>> = { farm: 'food', well: 'water', sawmill: 'wood', quarry: 'stone' };

  /** Mantém líderes e donos em dia (a cada 1 s): determinístico, sem sorteio. */
  private updateProfessions(): void {
    const byId = (a: Villager, b: Villager): number => a.id - b.id;
    const vs = this.villagers.filter((v) => !v.npc).sort(byId);
    for (const job of JOBS) {
      const cur = this.leaders[job] ? this.findVillager(this.leaders[job]!) : undefined;
      if (cur && this.professionOf(cur) === job) continue;
      const next = vs.find((v) => this.professionOf(v) === job && (v.skill?.[JOBS.indexOf(job)] ?? 0) > 0);
      if (next) this.leaders[job] = next.userId; else delete this.leaders[job];
    }
    const top = (): Villager | undefined => vs.reduce<Villager | undefined>((m, v) => (!m || v.xp > m.xp ? v : m), undefined);
    const houseOwners = new Set(this.buildings.filter((b) => b.kind === 'house' && b.owner && this.findVillager(b.owner)).map((b) => b.owner!));
    for (const b of this.buildings) {
      if (!b.done || b.kind === 'townhall' || b.kind === 'dam' || (b.owner && this.findVillager(b.owner))) continue;
      let owner: Villager | undefined;
      if (b.kind === 'house') owner = vs.find((v) => !houseOwners.has(v.userId));
      else {
        const lead = this.leaders[World.OWNER_JOB[b.kind] ?? 'build'];
        owner = (lead ? this.findVillager(lead) : undefined) ?? top();
      }
      if (!owner) { delete b.owner; continue; }
      b.owner = owner.userId;
      if (b.kind === 'house') houseOwners.add(owner.userId);
    }
  }

  // ---------- amizades e famílias ----------
  /** Convivência: quem fica perto ganha afinidade; amigos viram casal; casais têm filhos NPC. Determinístico. */
  private updateBonds(): void {
    const alive = new Map(this.villagers.map((v) => [v.userId, v]));
    // limpa vínculos com quem saiu da vila
    for (const v of this.villagers) {
      if (v.friends) v.friends = v.friends.filter((id) => alive.has(id));
      if (v.partner && !alive.has(v.partner)) delete v.partner;
      if (v.bond) for (const id of Object.keys(v.bond)) if (!alive.has(id)) delete v.bond[id];
    }
    // quem está perto de quem (grade por tile)
    const grid = new Map<number, Villager[]>();
    for (const v of this.villagers) {
      const t = this.tileOf(v.x, v.y);
      const l = grid.get(t);
      if (l) l.push(v); else grid.set(t, [v]);
    }
    for (const v of this.villagers) {
      if (v.kid) continue;
      const tx = Math.floor(v.x), ty = Math.floor(v.y);
      for (let dy = -BOND_RADIUS; dy <= BOND_RADIUS; dy++) for (let dx = -BOND_RADIUS; dx <= BOND_RADIUS; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        for (const o of grid.get(this.idx(nx, ny)) ?? []) {
          if (o.id <= v.id || o.kid) continue; // cada par uma vez
          this.addBond(v, o);
        }
      }
    }
    // nascimentos
    if (this.tick % BIRTH_EVERY === 0) this.maybeBirths(alive);
    // crianças crescem
    for (const v of this.villagers) {
      if (v.kid && this.tick - (v.born ?? 0) >= KID_GROW_TICKS) {
        delete v.kid;
        this.events.push(`🎓 ${v.name} cresceu e virou adulto.`);
      }
    }
  }

  private addBond(a: Villager, b: Villager): void {
    for (const [x, y] of [[a, b], [b, a]] as [Villager, Villager][]) {
      x.bond ??= {};
      x.bond[y.userId] = (x.bond[y.userId] ?? 0) + 1;
      const keys = Object.keys(x.bond);
      if (keys.length > 8) { // guarda só os 8 mais fortes
        keys.sort((p, q) => x.bond![q] - x.bond![p]);
        for (const k of keys.slice(8)) delete x.bond[k];
      }
    }
    const ab = a.bond![b.userId];
    if (ab >= FRIEND_AT && !(a.friends ?? []).includes(b.userId) && (a.friends?.length ?? 0) < FRIENDS_MAX && (b.friends?.length ?? 0) < FRIENDS_MAX) {
      (a.friends ??= []).push(b.userId);
      (b.friends ??= []).push(a.userId);
      this.events.push(`🤝 ${a.name} e ${b.name} viraram amigos.`);
    }
    if (ab >= COUPLE_AT && !a.partner && !b.partner && (a.friends ?? []).includes(b.userId)) {
      a.partner = b.userId;
      b.partner = a.userId;
      this.events.push(`💞 ${a.name} e ${b.name} começaram a namorar.`);
    }
  }

  private maybeBirths(alive: Map<string, Villager>): void {
    if (this.waitlist.length) return;
    for (const v of [...this.villagers].sort((x, y) => x.id - y.id)) {
      if (!v.partner || v.kid || this.villagers.length >= this.popCap) continue;
      const p = alive.get(v.partner);
      if (!p || p.id < v.id) continue; // cada casal uma vez
      const kids = this.villagers.filter((k) => k.kid && k.parents && k.parents.includes(v.userId)).length;
      if (kids >= KIDS_MAX || this.rng() >= BIRTH_CHANCE) continue;
      const nid = this.nextId;
      const r = this.addVillager(`npc:${nid}`, `${NPC_NAMES[nid % NPC_NAMES.length]} ${v.name.slice(0, 1).toUpperCase()}.`, World.colorFor(`npc:${nid}`));
      if (!r.ok) continue;
      Object.assign(r.villager, { npc: true, kid: true, parents: [v.userId, p.userId], born: this.tick, x: v.x, y: v.y });
      this.events.push(`👶 ${v.name} e ${p.name} tiveram um filho: ${r.villager.name}!`);
    }
  }

  /** Resumo das relações de um viewer (para !amigos). */
  relationsOf(userId: string): { friends: string[]; partner?: string; kids: string[]; parents?: string[] } {
    const v = this.findVillager(userId);
    const name = (id: string): string => this.findVillager(id)?.name ?? '?';
    if (!v) return { friends: [], kids: [] };
    return {
      friends: (v.friends ?? []).map(name),
      partner: v.partner ? name(v.partner) : undefined,
      kids: this.villagers.filter((k) => k.parents?.includes(userId)).map((k) => k.name),
      parents: v.parents?.map(name),
    };
  }

  /** Estabelecimentos de um viewer (para o !meus). */
  establishmentsOf(userId: string): string[] {
    return this.buildings.filter((b) => b.owner === userId && b.done).map((b) => this.establishmentName(b)!).filter(Boolean);
  }

  private updatePower(): void {
    let supply = 0, demand = 0;
    for (const b of this.buildings) {
      if (!b.done || b.flooded) continue;
      if (b.kind === 'waterwheel') supply += POWER_SUPPLY[Math.min(this.era, POWER_SUPPLY.length - 1)] * this.wheelFlow(b);
      else if (b.kind === 'sawmill' || b.kind === 'quarry' || b.kind === 'market') demand += POWER_DEMAND[b.kind] ?? 0;
    }
    this.power = { supply: Math.round(supply * 10) / 10, demand, ratio: demand > 0 ? Math.min(1, supply / demand) : 0 };
  }

  private mineUnder(x: number, y: number, w: number, h: number): boolean {
    let n = 0;
    if (!this.inBounds(x, y, w, h)) return false;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.mine[this.idx(x + i, y + j)]) n++;
    return n >= 2;
  }

  /** Tiles de jazida (para o visual). */
  mineTiles(): number[] {
    const out: number[] = [];
    for (let i = 0; i < N; i++) if (this.mine[i]) out.push(i);
    return out;
  }

  /** Lagos de formas e tamanhos variados, cada um com sua nascente; nunca perto da vila, do rio ou de degraus. */
  private carveLakes(cx0: number, cy0: number): void {
    const count = Math.round((1 + Math.floor(this.rng() * 3) + (this.rng() < 0.3 ? 1 : 0)) * Math.sqrt(MAP_SCALE)); // mais lagos em mapa maior
    const placed: Array<{ x: number; y: number; r: number }> = [];
    for (let n = 0; n < count; n++) {
      for (let attempt = 0; attempt < 120; attempt++) {
        const r = 2.2 + this.rng() * 2.3, aspect = 0.6 + this.rng() * 1.0, rot = this.rng() * Math.PI;
        const wob = [this.rng() * 6.28, this.rng() * 6.28, 0.12 + this.rng() * 0.2];
        const x = Math.floor(3 + this.rng() * (GRID_W - 6)), y = Math.floor(3 + this.rng() * (GRID_H - 6));
        if (Math.hypot(x - cx0, y - cy0) < r * 1.6 + 7) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r * 1.6 + r * 1.6 + 3)) continue;
        // forma: elipse girada com a borda ondulada
        const tiles: number[] = [];
        const reach = Math.ceil(r * 1.7) + 1;
        for (let j = y - reach; j <= y + reach; j++) {
          for (let i = x - reach; i <= x + reach; i++) {
            if (i < 2 || j < 2 || i >= GRID_W - 2 || j >= GRID_H - 2) continue;
            const dx = i - x, dy = j - y;
            const u = dx * Math.cos(rot) + dy * Math.sin(rot), v = (-dx * Math.sin(rot) + dy * Math.cos(rot)) / aspect;
            const ang = Math.atan2(v, u);
            const edge = r * (1 + wob[2] * Math.sin(ang * 3 + wob[0]) + wob[2] * 0.6 * Math.sin(ang * 5 + wob[1]));
            if (Math.hypot(u, v) <= edge) tiles.push(this.idx(i, j));
          }
        }
        if (tiles.length < 6) continue;
        const ring = new Set<number>(tiles);
        for (const t of tiles) {
          const tx = t % GRID_W, ty = (t - tx) / GRID_W;
          for (let k = 0; k < 4; k++) ring.add(this.idx(Math.max(0, Math.min(GRID_W - 1, tx + DX[k])), Math.max(0, Math.min(GRID_H - 1, ty + DY[k]))));
        }
        let lo = Infinity, hi = -Infinity, bad = false;
        for (const t of ring) {
          if (this.channel[t] || this.occ[t]) { bad = true; break; }
          const tx = t % GRID_W;
          if (Math.abs(tx - this.rx[(t - tx) / GRID_W]) < 4) { bad = true; break; } // longe do leito do rio
          lo = Math.min(lo, this.height[t]); hi = Math.max(hi, this.height[t]);
        }
        if (bad || hi - lo > 0 || lo < 1) continue; // só em terreno plano (sem degrau no meio)
        for (const t of tiles) { this.height[t] = lo - 1; this.water[t] = 0.9; }
        // nascente no tile mais central; vazão proporcional à área, para o lago encher sem transbordar demais
        let c = tiles[0], cd = Infinity;
        for (const t of tiles) { const tx = t % GRID_W, ty = (t - tx) / GRID_W; const d = (tx - x) ** 2 + (ty - y) ** 2; if (d < cd) { cd = d; c = t; } }
        this.sources.push(c);
        this.sourceRates.push(tiles.length * LAKE_RATE_PER_TILE);
        placed.push({ x, y, r });
        break;
      }
    }
  }

  /** Cor estável por viewer, usada quando não há cor da Twitch. */
  static colorFor(userId: string): string {
    return `hsl(${hashString(userId) % 360}, 70%, 55%)`;
  }
}
