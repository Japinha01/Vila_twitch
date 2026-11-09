import { CommandProcessor } from '../chat/commands';
import { BUILDINGS, RESOURCE_LABEL } from '../sim/config';
import { RESOURCES, type Resource } from '../sim/types';
import type { PlaceableKind, World } from '../sim/world';
import type { Renderer } from '../render/renderer';

const ICON: Record<Resource, string> = { wood: '🪵', stone: '🪨', food: '🍎', water: '💧' };
const COLOR: Record<Resource, string> = { wood: '#c58b4e', stone: '#adb5bd', food: '#ff6b6b', water: '#4dabf7' };

const QUICK = [
  '!entrar', '!status', '!vila', '!apoiar',
  '!trabalhar madeira', '!trabalhar pedra', '!trabalhar comida', '!trabalhar água', '!trabalhar construir',
];

type Tool = { type: 'none' } | { type: 'build'; kind: PlaceableKind } | { type: 'priority' } | { type: 'cancel' };

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Painel lateral: construção do streamer, recursos, velocidade e chat simulado. */
export class Panel {
  speed = 1;
  private tool: Tool = { type: 'none' };
  private log = $('log');
  private resEl = $('res');
  private botN = 0;
  private paletteBtns = new Map<PlaceableKind, HTMLButtonElement>();

  constructor(private world: World, private chat: CommandProcessor, private view: Renderer) {
    chat.onReply = (to, t) => this.addLog(`@${to} ${t}`, 'bot');
    this.initSpeed();
    this.initPalette();
    this.initChat();
    this.initMap();
  }

  // ---------- velocidade ----------
  private initSpeed(): void {
    document.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) =>
      b.addEventListener('click', () => this.setSpeed(Number(b.dataset.speed))));
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); this.setSpeed(this.speed === 0 ? 1 : 0); }
      if (e.key === '1') this.setSpeed(1);
      if (e.key === '2') this.setSpeed(2);
      if (e.key === '3') this.setSpeed(4);
      if (e.key === 'Escape') this.setTool({ type: 'none' });
    });
  }

  private setSpeed(s: number): void {
    this.speed = s;
    document.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) =>
      b.classList.toggle('on', Number(b.dataset.speed) === s));
  }

  // ---------- construção ----------
  private initPalette(): void {
    const pal = $('palette');
    for (const kind of Object.keys(BUILDINGS) as PlaceableKind[]) {
      const spec = BUILDINGS[kind];
      const cost = Object.entries(spec.cost).map(([r, n]) => `${ICON[r as Resource]}${n}`).join(' ');
      const b = document.createElement('button');
      b.innerHTML = `${spec.label}<small>${cost}</small>`;
      b.addEventListener('click', () => this.setTool({ type: 'build', kind }));
      pal.appendChild(b);
      this.paletteBtns.set(kind, b);
    }
    $('tool-priority').addEventListener('click', () => this.setTool({ type: 'priority' }));
    $('tool-cancel').addEventListener('click', () => this.setTool({ type: 'cancel' }));
  }

  private setTool(t: Tool): void {
    const same = JSON.stringify(t) === JSON.stringify(this.tool);
    this.tool = same ? { type: 'none' } : t;
    this.view.ghost = null;
    this.paletteBtns.forEach((b, k) => b.classList.toggle('on', this.tool.type === 'build' && this.tool.kind === k));
    $('tool-priority').classList.toggle('on', this.tool.type === 'priority');
    $('tool-cancel').classList.toggle('on', this.tool.type === 'cancel');
  }

  // ---------- mapa: mouse, câmera e colocação ----------
  private initMap(): void {
    const cv = $('game');
    let drag: { x: number; y: number; moved: number; button: number } | null = null;
    const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.setTool({ type: 'none' }); });
    cv.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = local(e);
      if (drag && (e.buttons & 1 || e.buttons & 4)) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.moved > 6) this.view.panBy(dx, dy);
      }
      this.hover(this.view.pickTile(p.x, p.y));
    });
    cv.addEventListener('pointerup', (e) => {
      const wasClick = drag && drag.moved <= 6 && drag.button === 0;
      drag = null;
      if (!wasClick) return;
      const p = local(e);
      this.click(this.view.pickTile(p.x, p.y));
    });
    cv.addEventListener('pointerleave', () => { this.view.hoverTile = null; this.view.ghost = null; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      this.view.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    }, { passive: false });
    cv.addEventListener('dblclick', () => this.view.resetCamera());
  }

  private hover(t: { x: number; y: number } | null): void {
    this.view.hoverTile = t;
    if (this.tool.type === 'build' && t) {
      this.view.ghost = { kind: this.tool.kind, x: t.x, y: t.y, ok: this.world.canPlace(this.tool.kind, t.x, t.y).ok };
    } else this.view.ghost = null;
  }

  private click(t: { x: number; y: number } | null): void {
    if (!t) return;
    const w = this.world;
    if (this.tool.type === 'build') {
      const kind = this.tool.kind;
      const label = BUILDINGS[kind].label;
      const r = w.requestBuild(kind, t.x, t.y);
      if (r.ok) this.addLog(`🏗 ${label} marcada! Construtores (!trabalhar construir) fazem a obra.`, 'ev');
      else if (r.reason === 'cost') this.addLog(`Faltam recursos para ${label}: ${Object.entries(r.missing ?? {}).map(([k, n]) => `${n} ${RESOURCE_LABEL[k as Resource]}`).join(', ')}.`, 'ev');
      else this.addLog(`Não dá para construir ${label} aí${kind === 'farm' ? ' (precisa de solo irrigado)' : kind === 'well' ? ' (precisa de água perto)' : kind === 'dam' ? ' (só sobre o rio)' : ''}.`, 'ev');
      return;
    }
    const b = w.buildingAt(t.x, t.y);
    if (!b) return;
    if (this.tool.type === 'priority') {
      if (w.togglePriority(b.id)) this.addLog(`${b.priority ? '★ Obra priorizada' : 'Prioridade removida'}.`, 'ev');
    } else if (this.tool.type === 'cancel') {
      if (w.cancelBuild(b.id)) this.addLog('Obra cancelada, recursos devolvidos.', 'ev');
    }
  }

  // ---------- chat simulado ----------
  private initChat(): void {
    const who = $<HTMLInputElement>('who'), msg = $<HTMLInputElement>('msg');
    const send = (): void => this.say(who.value.trim() || 'viewer', msg.value);
    $('send').addEventListener('click', send);
    msg.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

    const quick = $('quick');
    for (const q of QUICK) {
      const b = document.createElement('button');
      b.textContent = q;
      b.addEventListener('click', () => { msg.value = q; send(); });
      quick.appendChild(b);
    }
    $('bots').addEventListener('click', () => {
      for (let i = 0; i < 10; i++) this.say(`bot${++this.botN}`, '!entrar');
    });
    $('spam').addEventListener('click', () => {
      const cmds = ['!entrar', '!status', '!vila', '!trabalhar madeira', '!trabalhar pedra', '!trabalhar comida'];
      for (let i = 0; i < 200; i++) this.say(`spam${i % 40}`, cmds[i % cmds.length], false);
      this.addLog('200 mensagens enviadas de uma vez: a fila e os cooldowns seguram.', 'ev');
    });
  }

  private say(user: string, text: string, echo = true): void {
    if (echo) this.addLog(`${user}: ${text}`, 'me');
    this.chat.submit({ userId: user.toLowerCase(), user, text });
  }

  addLog(text: string, cls: 'me' | 'bot' | 'ev'): void {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    this.log.appendChild(d);
    while (this.log.childElementCount > 150) this.log.firstElementChild!.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  // ---------- atualização por frame ----------
  update(): void {
    const w = this.world;
    for (const e of w.drainEvents()) this.addLog(e.startsWith('🔥') || e.startsWith('🌧') ? e : `🏗 ${e}`, 'ev');
    const se = w.season;
    const days = Math.max(1, Math.ceil(se.daysLeft));
    const seasonEl = $('season');
    seasonEl.className = se.drought ? 'drought' : '';
    seasonEl.textContent = se.drought ? `🔥 SECA · o rio volta em ${days} dia${days > 1 ? 's' : ''}` : `☀ Temperada · seca em ${days} dia${days > 1 ? 's' : ''}`;
    $('clock').textContent = `Dia ${w.day}${w.supportActive ? ' · apoio ✨' : ''}${w.starving ? ' · fome/sede!' : ''}`;
    $('pop').textContent = `Aldeões ${w.villagers.length}/${w.popCap} · Estoque máx. ${w.storageCap} · Obras ${w.buildings.filter((b) => !b.done).length}`;
    $('queueinfo').textContent = `Fila do chat: ${this.chat.queued} · descartadas: ${this.chat.dropped}`;
    this.resEl.innerHTML = RESOURCES.map((r) => {
      const pct = Math.min(100, (w.stock[r] / w.storageCap) * 100);
      return `<div class="res"><span>${ICON[r]}</span><div class="bar" title="${RESOURCE_LABEL[r]}"><i style="width:${pct}%;background:${COLOR[r]}"></i></div><b>${Math.floor(w.stock[r])}</b></div>`;
    }).join('');
    // habilita/escurece botões conforme o custo
    this.paletteBtns.forEach((b, k) => {
      const cost = BUILDINGS[k].cost;
      b.classList.toggle('off', RESOURCES.some((r) => w.stock[r] < (cost[r] ?? 0)));
    });
    if (this.view.ghost) {
      const g = this.view.ghost;
      g.ok = w.canPlace(g.kind, g.x, g.y).ok;
    }
  }
}
