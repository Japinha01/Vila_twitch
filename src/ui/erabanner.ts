import { ERAS, nextEraSummary } from '../sim/eras';
import type { World } from '../sim/world';

const COLORS = ['#ffd43b', '#ff8787', '#74c0fc', '#8ce99a', '#da77f2', '#ffa94d'];

/**
 * Celebração quando a vila sobe de era: faixa grande com chuva de confete por cima do mapa.
 * Funciona no jogo e no overlay do OBS (só olha `world.era`).
 */
export class EraBanner {
  private shown: number;
  private el: HTMLDivElement;
  private timer = 0;

  constructor(private readonly world: World, host: HTMLElement) {
    this.shown = world.era;
    this.el = document.createElement('div');
    this.el.id = 'erabanner';
    this.el.hidden = true;
    host.appendChild(this.el);
  }

  /** Chame a cada quadro: dispara a celebração quando a era muda. */
  update(): void {
    const era = this.world.era;
    if (era > this.shown) this.celebrate(era);
    this.shown = era;
  }

  private celebrate(era: number): void {
    const e = ERAS[era];
    if (!e) return;
    const confetti = Array.from({ length: 70 }, () => {
      const left = Math.random() * 100, delay = Math.random() * 1.2, dur = 2.4 + Math.random() * 2, size = 6 + Math.random() * 8;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      return `<i style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s;width:${size}px;height:${size * 1.6}px;background:${color}"></i>`;
    }).join('');
    this.el.innerHTML = `<div class="confetti">${confetti}</div><div class="erabox"><div class="eraicon">${e.icon}</div><small>NOVA ERA</small><b>${e.name}</b><span>${e.tagline}</span></div>`;
    this.el.hidden = false;
    this.el.classList.remove('show');
    void this.el.offsetWidth; // reinicia a animação
    this.el.classList.add('show');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.el.hidden = true; }, 6500);
  }
}

/** Linha de status da era: "🪨 Era da Pedra · próxima: 🏺 Era do Bronze: 👥 5/8 · …". */
export function eraLine(world: World): string {
  const e = ERAS[world.era];
  const next = nextEraSummary(world.era, world.eraSnapshot());
  return `${e.icon} ${e.name}${next ? ` · próxima: ${next}` : ' · era mais avançada por enquanto'}`;
}
