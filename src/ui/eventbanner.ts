import { EVENTS } from '../sim/events';
import type { World } from '../sim/world';

/**
 * Aviso dos eventos locais: um cartaz que aparece por alguns segundos quando o evento começa
 * e uma etiqueta fixa enquanto ele dura (com o nome de quem resgatou a carta). Funciona no jogo e no overlay.
 */
export class EventBanner {
  private key = '';
  private toast: HTMLDivElement;
  private chip: HTMLDivElement;
  private timer = 0;

  constructor(private readonly world: World, host: HTMLElement) {
    this.toast = document.createElement('div');
    this.toast.id = 'eventtoast';
    this.toast.hidden = true;
    this.chip = document.createElement('div');
    this.chip.id = 'eventchip';
    this.chip.hidden = true;
    host.append(this.toast, this.chip);
    const e = world.event;
    if (e && world.tick < e.until) this.key = `${e.kind}:${e.until}`; // já em andamento ao abrir: sem cartaz
  }

  update(): void {
    const e = this.world.event;
    const active = e && this.world.tick < e.until ? e : null;
    const key = active ? `${active.kind}:${active.until}` : '';
    if (key === this.key) return;
    this.key = key;
    if (!active) { this.chip.hidden = true; return; }
    const d = EVENTS[active.kind];
    const by = active.by ? `<span>ativado por <b>${active.by.replace(/[<>&"']/g, '')}</b></span>` : '';
    this.toast.innerHTML = `<div class="evicon">${d.icon}</div><b>${d.label}</b><span>${d.text}</span>${by}`;
    this.toast.hidden = false;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.toast.hidden = true; }, 6000);
    this.chip.textContent = `${d.icon} ${d.label}${active.by ? ` · ${active.by.replace(/[<>&"']/g, '')}` : ''}`;
    this.chip.hidden = d.days === 0;
  }
}
