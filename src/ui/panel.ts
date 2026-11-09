import { CommandProcessor } from '../chat/commands';
import { RESOURCE_LABEL } from '../sim/config';
import { RESOURCES, type Resource } from '../sim/types';
import type { World } from '../sim/world';

const ICON: Record<Resource, string> = { wood: '🪵', stone: '🪨', food: '🍎', water: '💧' };
const COLOR: Record<Resource, string> = { wood: '#c58b4e', stone: '#adb5bd', food: '#ff6b6b', water: '#4dabf7' };

const QUICK = [
  '!entrar', '!status', '!vila', '!apoiar',
  '!trabalhar madeira', '!trabalhar pedra', '!trabalhar comida', '!trabalhar água', '!trabalhar construir',
  '!construir casa', '!construir fazenda', '!construir poço', '!construir serraria', '!construir pedreira', '!construir armazém',
];

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Painel lateral: recursos, velocidade e chat simulado (fonte de mensagens falsa). */
export class Panel {
  speed = 1;
  private log = $('log');
  private resEl = $('res');
  private botN = 0;

  constructor(private world: World, private chat: CommandProcessor) {
    chat.onReply = (to, t) => this.addLog(`@${to} ${t}`, 'bot');

    document.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) =>
      b.addEventListener('click', () => this.setSpeed(Number(b.dataset.speed))));
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); this.setSpeed(this.speed === 0 ? 1 : 0); }
      if (e.key === '1') this.setSpeed(1);
      if (e.key === '2') this.setSpeed(2);
      if (e.key === '3') this.setSpeed(4);
    });

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

  private setSpeed(s: number): void {
    this.speed = s;
    document.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) =>
      b.classList.toggle('on', Number(b.dataset.speed) === s));
  }

  addLog(text: string, cls: 'me' | 'bot' | 'ev'): void {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    this.log.appendChild(d);
    while (this.log.childElementCount > 150) this.log.firstElementChild!.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  update(): void {
    const w = this.world;
    for (const e of w.drainEvents()) this.addLog(`🏗 ${e}`, 'ev');
    $('clock').textContent = `Dia ${w.day}${w.supportActive ? ' · apoio ativo ✨' : ''}${w.starving ? ' · fome/sede!' : ''}`;
    $('pop').textContent = `Aldeões ${w.villagers.length}/${w.popCap} · Armazenamento ${w.storageCap} · Prédios ${w.buildings.filter((b) => b.done).length - 1}/${w.buildings.length - 1}`;
    $('queueinfo').textContent = `Fila do chat: ${this.chat.queued} · descartadas: ${this.chat.dropped}`;
    this.resEl.innerHTML = RESOURCES.map((r) => {
      const pct = Math.min(100, (w.stock[r] / w.storageCap) * 100);
      return `<div class="res"><span>${ICON[r]}</span><div class="bar" title="${RESOURCE_LABEL[r]}"><i style="width:${pct}%;background:${COLOR[r]}"></i></div><b>${Math.floor(w.stock[r])}</b></div>`;
    }).join('');
  }
}
