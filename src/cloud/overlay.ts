import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { SaveData } from '../sim/world';
import type { World } from '../sim/world';
import { startTicker } from '../ticker';
import { getSupabase } from './client';
import { makeLight, packKeyframe, unpackKeyframe, type LightExtras, type LightFrame } from './frames';

const LIGHT_MS = 166; // ~6 quadros leves por segundo (o visual interpola entre eles)
const WATER_EVERY = 6; // água e prédios vão a cada 6 quadros leves (~1 por segundo)
const KEYFRAME_MS = 5000;
const CAM_MS = 50; // a câmera vai à parte, só quando muda: mover e girar ficam fluidos no overlay

/** Token do link do overlay: 192 bits aleatórios. Quem tem o link vê a vila; não há listagem pública. */
export function newOverlayToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const isValidToken = (t: string): boolean => /^[A-Za-z0-9_-]{16,64}$/.test(t);
const channelName = (token: string): string => `vila-overlay-${token}`;

const countOverlays = (ch: RealtimeChannel): number =>
  Object.values(ch.presenceState<{ role?: string }>()).flat().filter((p) => p.role === 'overlay').length;

/** Lado do jogo do streamer: transmite a vila para os overlays conectados (só enquanto houver algum). */
export class OverlayHost {
  private db: SupabaseClient | null = null;
  private ch: RealtimeChannel | null = null;
  private stopTimer: (() => void) | null = null;
  private stopCam: (() => void) | null = null;
  private lastCam: number[] | null = null;
  private lastCamAt = 0;
  private n = 0;
  private lastKey = 0;
  private wantKey = true;
  private packing = false;
  viewers = 0;

  constructor(
    private world: World,
    private token: string,
    private onChange: (viewers: number, error?: string) => void,
    private extras: () => LightExtras = () => ({}),
  ) {}

  async start(): Promise<boolean> {
    this.db = await getSupabase();
    if (!this.db) { this.onChange(0, 'Nuvem não configurada.'); return false; }
    const ch = this.db.channel(channelName(this.token), { config: { broadcast: { self: false } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => {
      const v = countOverlays(ch);
      if (v > this.viewers) this.wantKey = true; // overlay novo: manda a vila inteira já
      this.viewers = v;
      this.onChange(v);
    });
    ch.on('broadcast', { event: 'hello' }, () => { this.wantKey = true; });
    const ok = await new Promise<boolean>((resolve) => {
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve(true);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { this.onChange(0, 'Não foi possível abrir o canal do overlay.'); resolve(false); }
      });
    });
    if (ok) {
      this.stopTimer = startTicker(LIGHT_MS, () => { void this.pump(); }); // Worker: transmite mesmo com a aba escondida
      this.stopCam = startTicker(CAM_MS, () => this.pumpCamera());
    }
    return ok;
  }

  async stop(): Promise<void> {
    this.stopTimer?.();
    this.stopTimer = null;
    this.stopCam?.();
    this.stopCam = null;
    const ch = this.ch;
    this.ch = null;
    if (ch && this.db) await this.db.removeChannel(ch);
    this.viewers = 0;
  }

  /** Manda só a câmera, até ~20 vezes por segundo e só se ela mexeu (mais um sinal por segundo parada). */
  private pumpCamera(): void {
    const ch = this.ch;
    if (!ch || this.viewers === 0) return;
    const c = this.extras().c;
    if (!c) return;
    const now = performance.now();
    const moved = !this.lastCam || c.some((n, i) => Math.abs(n - this.lastCam![i]) > 0.0005);
    if (!moved && now - this.lastCamAt < 1000) return;
    this.lastCam = c;
    this.lastCamAt = now;
    void ch.send({ type: 'broadcast', event: 'cam', payload: { c: c.map((n) => Math.round(n * 1000) / 1000) } });
  }

  private async pump(): Promise<void> {
    const ch = this.ch;
    if (!ch || this.viewers === 0) return;
    const now = performance.now();
    if ((this.wantKey || now - this.lastKey > KEYFRAME_MS) && !this.packing) {
      this.packing = true;
      this.wantKey = false;
      this.lastKey = now;
      try { await ch.send({ type: 'broadcast', event: 'key', payload: { k: await packKeyframe(this.world) } }); }
      catch { /* o próximo ciclo tenta de novo */ }
      this.packing = false;
    }
    void ch.send({ type: 'broadcast', event: 'light', payload: makeLight(this.world, this.n++ % WATER_EVERY === 0, this.extras()) });
  }
}

export interface ViewerHandlers {
  onKey(save: SaveData): void;
  onLight(f: LightFrame): void;
  onCam?(c: number[]): void;
  onStatus(s: 'connecting' | 'waiting' | 'live' | 'error', detail?: string): void;
}

/** Lado do OBS: entra no canal, avisa que chegou e entrega os quadros recebidos. */
export class OverlayViewer {
  private ch: RealtimeChannel | null = null;
  private hello: ReturnType<typeof setInterval> | null = null;
  private gotKey = false;

  constructor(private token: string, private h: ViewerHandlers) {}

  async start(): Promise<void> {
    this.h.onStatus('connecting');
    const db = await getSupabase();
    if (!db) { this.h.onStatus('error', 'Nuvem não configurada neste site.'); return; }
    const ch = db.channel(channelName(this.token), { config: { broadcast: { self: false } } });
    this.ch = ch;
    ch.on('broadcast', { event: 'key' }, async ({ payload }) => {
      try { this.h.onKey(await unpackKeyframe(String(payload.k))); this.gotKey = true; this.h.onStatus('live'); } catch { /* quadro corrompido: espera o próximo */ }
    });
    ch.on('broadcast', { event: 'light' }, ({ payload }) => { if (this.gotKey) this.h.onLight(payload as LightFrame); });
    ch.on('broadcast', { event: 'cam' }, ({ payload }) => {
      const c = (payload as { c?: unknown }).c;
      if (this.gotKey && Array.isArray(c) && c.length === 6 && c.every((n) => typeof n === 'number' && Number.isFinite(n))) this.h.onCam?.(c as number[]);
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ role: 'overlay' });
        this.h.onStatus('waiting');
        const ask = (): void => { void ch.send({ type: 'broadcast', event: 'hello', payload: {} }); };
        ask();
        this.hello = setInterval(() => { if (!this.gotKey) ask(); }, 2000);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.h.onStatus('error', 'Falha ao conectar ao canal.');
    });
  }

  stop(): void { if (this.hello) clearInterval(this.hello); void this.ch?.unsubscribe(); }
}
