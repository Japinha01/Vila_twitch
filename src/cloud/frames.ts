import { GRID_H, GRID_W } from '../sim/config';
import type { Building, BuildingKind, Resource, Stock, Villager, VillagerState } from '../sim/types';
import { RESOURCES } from '../sim/types';
import { World, type SaveData } from '../sim/world';

/**
 * Quadros que o jogo do streamer manda para o overlay do OBS.
 *  - keyframe: a vila inteira (sem rotas), compactada; sai de tempos em tempos e quando um overlay entra.
 *  - light: só o que muda a cada instante (aldeões, prédios, estoque e, de vez em quando, a água).
 */
/**
 * ATENÇÃO (segredos): o quadro leve é uma lista branca do que é público na live. Informação secreta
 * (ex.: objetivos da Guerra de Objetivos) nunca entra aqui nem no keyframe: fica só no servidor.
 */
export interface OverlayOptions { names: boolean; hud: boolean }
export type CameraArr = [number, number, number, number, number, number]; // yaw, pitch, dist, tx, ty, tz
export interface LightExtras { c?: CameraArr; o?: OverlayOptions }

export interface LightFrame {
  t: number; // tick
  su: number; // até quando o apoio ✨ vale
  c?: CameraArr; // câmera do streamer
  o?: [number, number]; // opções do overlay: nomes, status
  s: Stock;
  v: Array<[number, number, number, number, number]>; // id, x, y, estado, recurso carregado (-1 = nenhum)
  b: Array<[number, number, number, number, number, number, number, number, number, number]>; // id, tipo, x, y, w, h, progresso, trabalho, pronto, alagado
  w?: string; // água quantizada (1/32) em base64
}

const STATES: VillagerState[] = ['idle', 'toTarget', 'working', 'toStore'];
const KINDS: BuildingKind[] = ['townhall', 'house', 'farm', 'well', 'sawmill', 'quarry', 'warehouse', 'dam'];
const WATER_SCALE = 32;
const N = GRID_W * GRID_H;

// ---------- compactação (gzip + base64) ----------
const toB64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b: string): Uint8Array => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function packKeyframe(world: World): Promise<string> {
  const save = world.serialize();
  save.villagers = save.villagers.map((v) => ({ ...v, path: null })); // rotas não vão para o overlay
  return toB64(await pipe(new TextEncoder().encode(JSON.stringify(save)), new CompressionStream('gzip')));
}

export async function unpackKeyframe(b64: string): Promise<SaveData> {
  const raw = await pipe(fromB64(b64), new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(raw)) as SaveData;
}

// ---------- quadro leve ----------
export function makeLight(world: World, withWater: boolean, extras: LightExtras = {}): LightFrame {
  const f: LightFrame = {
    t: world.tick,
    su: world.supportUntil,
    s: { ...world.stock },
    v: world.villagers.map((v) => [v.id, round2(v.x), round2(v.y), STATES.indexOf(v.state), v.carryRes ? RESOURCES.indexOf(v.carryRes) : -1]),
    b: world.buildings.map((b) => [b.id, KINDS.indexOf(b.kind), b.x, b.y, b.w, b.h, round2(b.progress), b.workNeeded, b.done ? 1 : 0, b.flooded ? 1 : 0]),
  };
  if (extras.c) f.c = extras.c.map((n) => Math.round(n * 1000) / 1000) as CameraArr;
  if (extras.o) f.o = [extras.o.names ? 1 : 0, extras.o.hud ? 1 : 0];
  if (withWater) {
    const q = new Uint8Array(N);
    for (let i = 0; i < N; i++) q[i] = Math.min(255, Math.round(world.water[i] * WATER_SCALE));
    f.w = toB64(q);
  }
  return f;
}
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Lado do overlay: mantém um World espelhado e suaviza o movimento entre os quadros
 * (a simulação do overlay nunca roda; ele só mostra o que o jogo mandou).
 */
export class OverlayMirror {
  readonly world: World | null;
  private target = new Map<number, { x: number; y: number }>();
  /** câmera do streamer e opções do overlay, vindas do último quadro leve */
  camera: CameraArr | null = null;
  options: OverlayOptions = { names: true, hud: true };

  constructor(world: World | null = null) { this.world = world; }

  /** Cria o espelho a partir do primeiro keyframe. */
  static fromKeyframe(save: SaveData): OverlayMirror {
    return new OverlayMirror(World.fromSave(save));
  }

  applyKeyframe(save: SaveData): void {
    const w = this.world!;
    w.applySave(save);
    this.target.clear();
    for (const v of w.villagers) this.target.set(v.id, { x: v.x, y: v.y });
  }

  applyLight(f: LightFrame): void {
    const w = this.world!;
    w.tick = f.t;
    w.stock = { ...f.s };
    w.supportUntil = f.su;
    if (f.c) this.camera = f.c;
    if (f.o) this.options = { names: !!f.o[0], hud: !!f.o[1] };
    const known = new Map(w.villagers.map((v) => [v.id, v]));
    const next: Villager[] = [];
    this.target.clear();
    for (const [id, x, y, st, cr] of f.v) {
      const v = known.get(id);
      if (!v) continue; // chegou depois do último keyframe: aparece no próximo
      v.state = STATES[st] ?? 'idle';
      v.carryRes = cr >= 0 ? (RESOURCES[cr] as Resource) : null;
      this.target.set(id, { x, y });
      next.push(v);
    }
    w.villagers = next;
    w.buildings = f.b.map(([id, k, x, y, bw, bh, progress, workNeeded, done, flooded]): Building => ({
      id, kind: KINDS[k] ?? 'house', x, y, w: bw, h: bh, progress, workNeeded, done: !!done, priority: false, flooded: !!flooded,
    }));
    if (f.w) {
      const q = fromB64(f.w);
      if (q.length === N) for (let i = 0; i < N; i++) w.water[i] = q[i] / WATER_SCALE;
    }
  }

  /** Anda os aldeões em direção ao último ponto recebido; chamar a cada quadro de vídeo. */
  smooth(dtSeconds: number): void {
    const k = 1 - Math.exp(-dtSeconds * 10);
    for (const v of this.world!.villagers) {
      const t = this.target.get(v.id);
      if (!t) continue;
      if (Math.abs(t.x - v.x) + Math.abs(t.y - v.y) > 4) { v.x = t.x; v.y = t.y; continue; } // teleporte (ex.: expulso de prédio)
      v.x += (t.x - v.x) * k;
      v.y += (t.y - v.y) * k;
    }
  }
}
