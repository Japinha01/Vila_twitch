import { CommandProcessor } from '../chat/commands';
import { BUILDINGS, RESOURCE_LABEL } from '../sim/config';
import { RESOURCES, type Resource } from '../sim/types';
import type { PlaceableKind, World } from '../sim/world';
import type { GameView } from '../render/view';
import { describeTile, JOB_LABEL } from './info';

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
  onSave: () => void = () => {};
  onNew: () => void = () => {};
  private tool: Tool = { type: 'none' };
  private log = $('log');
  private resEl = $('res');
  private botN = 0;
  private paletteBtns = new Map<PlaceableKind, HTMLButtonElement>();
  private tip = $('tip');
  private lastPeople = 0;
  private selected: number | null = null;

  constructor(private world: World, private chat: CommandProcessor, private view: GameView) {
    chat.onReply = (to, t) => this.addLog(`@${to} ${t}`, 'bot');
    this.initSpeed();
    this.initPalette();
    this.initChat();
    $('unfollow').addEventListener('click', () => this.selectVillager(null));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (e.target as HTMLElement).tagName !== 'INPUT') this.selectVillager(null); });
    const seedEl = $('seedinfo');
    seedEl.textContent = `🗺 Seed do mapa: ${world.seed} (clique para copiar)`;
    seedEl.addEventListener('click', () => {
      void navigator.clipboard?.writeText(String(world.seed)).then(() => this.addLog(`🗺 Seed ${world.seed} copiada. Use em "Nova vila" ou na URL com ?seed=${world.seed}`, 'ev'), () => { /* sem permissão */ });
    });
    const auto = $<HTMLInputElement>('autonomy');
    auto.checked = world.autonomy;
    auto.addEventListener('change', () => { world.autonomy = auto.checked; this.addLog(auto.checked ? '🧑‍🤝‍🧑 Aldeões autônomos: ligado.' : '🧑‍🤝‍🧑 Aldeões autônomos: desligado.', 'ev'); });
    this.initMap();
    $('save').addEventListener('click', () => this.onSave());
    $('newgame').addEventListener('click', () => this.onNew());
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
      if (e.key === 'q' || e.key === 'Q') this.view.rotateBy?.(-130);
      if (e.key === 'e' || e.key === 'E') this.view.rotateBy?.(130);
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
        if (e.buttons & 4 && this.view.rotateBy) this.view.rotateBy(dx); // botão do meio gira (só no 3D)
        else if (drag.moved > 6) this.view.panBy(dx, dy);
      }
      const tile = this.view.pickTile(p.x, p.y);
      this.hover(tile);
      this.showTip(tile, e.clientX, e.clientY);
    });
    cv.addEventListener('pointerup', (e) => {
      const wasClick = drag && drag.moved <= 6 && drag.button === 0;
      drag = null;
      if (!wasClick) return;
      const p = local(e);
      this.click(this.view.pickTile(p.x, p.y));
    });
    cv.addEventListener('pointerleave', () => { this.view.hoverTile = null; this.view.ghost = null; this.tip.hidden = true; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      this.view.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    }, { passive: false });
    cv.addEventListener('dblclick', () => this.view.resetCamera());
  }

  private showTip(t: { x: number; y: number } | null, cx: number, cy: number): void {
    if (!t || this.tool.type === 'build') { this.tip.hidden = true; return; }
    this.tip.textContent = describeTile(this.world, t.x, t.y).join('\n');
    this.tip.hidden = false;
    const w = this.tip.offsetWidth, h = this.tip.offsetHeight;
    this.tip.style.left = `${Math.min(window.innerWidth - w - 8, cx + 14)}px`;
    this.tip.style.top = `${Math.min(window.innerHeight - h - 8, cy + 14)}px`;
  }

  private hover(t: { x: number; y: number } | null): void {
    this.view.hoverTile = t;
    if (this.tool.type === 'build' && t) {
      this.view.ghost = { kind: this.tool.kind, x: t.x, y: t.y, ok: this.world.canPlace(this.tool.kind, t.x, t.y).ok };
    } else this.view.ghost = null;
  }

  /** Seleciona o aldeão e a câmera passa a acompanhá-lo (no 3D); no 2D só centraliza. */
  private selectVillager(id: number | null): void {
    this.selected = id;
    this.view.selectedId = id;
    const v = id === null ? undefined : this.world.villagers.find((q) => q.id === id);
    if (v && 'followId' in this.view) this.view.followId = id;
    else if (v) this.view.centerOn(v.x, v.y);
    else this.view.followId = null;
    $('unfollow').hidden = !(v && 'followId' in this.view);
  }

  private click(t: { x: number; y: number } | null): void {
    if (!t) return;
    const w = this.world;
    if (this.tool.type === 'none') { // clicar perto de um aldeão seleciona e segue
      const near = w.villagers.filter((v) => Math.hypot(v.x - (t.x + 0.5), v.y - (t.y + 0.5)) < 1.1).sort((a, b) => Math.hypot(a.x - t.x - 0.5, a.y - t.y - 0.5) - Math.hypot(b.x - t.x - 0.5, b.y - t.y - 0.5))[0];
      if (near) { this.selectVillager(near.id); return; }
    }
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
      if (!b.done) { if (w.cancelBuild(b.id)) this.addLog('Obra cancelada, recursos devolvidos.', 'ev'); }
      else if (w.demolish(b.id)) this.addLog('Prédio demolido, metade dos recursos devolvida.', 'ev');
      else this.addLog('A prefeitura não pode ser demolida.', 'ev');
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
    if (this.selected !== null && 'followId' in this.view && this.view.followId === null) $('unfollow').hidden = true; // a câmera foi solta mexendo nela
    for (const e of w.drainEvents()) this.addLog(/^[🔥🌧🌊✅⚠]/u.test(e) ? e : `🏗 ${e}`, 'ev');
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
    this.updatePeople();
    if (this.view.ghost) {
      const g = this.view.ghost;
      g.ok = w.canPlace(g.kind, g.x, g.y).ok;
    }
  }

  /** Lista de aldeões (atualizada a cada meio segundo para não pesar). */
  private updatePeople(): void {
    const now = performance.now();
    if (now - this.lastPeople < 500) return;
    this.lastPeople = now;
    const w = this.world;
    const counts: Record<string, number> = {};
    for (const v of w.villagers) counts[v.job] = (counts[v.job] ?? 0) + 1;
    const icon: Record<string, string> = { wood: '🪵', stone: '🪨', food: '🍎', water: '💧', build: '🔨' };
    const stuck = w.villagers.filter((v) => w.isStuck(v)).length;
    $('peoplesummary').textContent = Object.entries(counts).map(([j, n]) => `${icon[j]}${n}`).join(' ') + (stuck ? ` · 😴${stuck} sem trabalho` : '');
    const list = $('peoplelist');
    list.replaceChildren();
    const sorted = [...w.villagers].sort((a, b) => b.xp - a.xp || a.id - b.id);
    for (const v of sorted) {
      const row = document.createElement('div');
      row.className = `person${v.id === this.selected ? ' sel' : ''}`;
      const name = document.createElement('b');
      name.textContent = v.name;
      const job = document.createElement('span');
      job.textContent = `${JOB_LABEL[v.job]}${v.ordered ? '' : ' (livre)'}${w.isStuck(v) ? ' 😴' : ''} · ${v.xp} XP`;
      const rm = document.createElement('button');
      rm.textContent = '✖';
      rm.title = 'Remover aldeão';
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        if (w.removeVillager(v.userId)) this.addLog(`${v.name} foi removido da vila.`, 'ev');
      });
      row.addEventListener('click', () => this.selectVillager(v.id));
      row.append(name, job, rm);
      list.appendChild(row);
    }
  }
}
