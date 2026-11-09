import { TICKS_PER_SECOND } from '../sim/config';
import type { Job, Resource } from '../sim/types';
import { World } from '../sim/world';
import { normalize, sanitizeName } from './names';

export interface ChatMessage {
  userId: string;
  user: string;
  text: string;
}

export type Command =
  | { name: 'entrar' }
  | { name: 'trabalhar'; job: Job }
  | { name: 'status' }
  | { name: 'vila' }
  | { name: 'apoiar' };

type ParseResult = { ok: true; cmd: Command } | { ok: false; error?: string };

const RES_ALIAS: Record<string, Job> = {
  madeira: 'wood', pedra: 'stone', comida: 'food', agua: 'water', construir: 'build', construtor: 'build',
};

/** Cooldown por viewer e por comando, em ms de relógio real. */
export const COOLDOWN_MS: Record<Command['name'], number> = {
  entrar: 5000, trabalhar: 5000, status: 5000, vila: 10000, apoiar: 60000,
};

/** Etapa 1 do pipeline: validação (sintaxe e argumentos). */
export function parseCommand(text: string): ParseResult {
  const t = text.trim();
  if (!t.startsWith('!')) return { ok: false };
  const [head, ...args] = normalize(t.slice(1)).split(/\s+/);
  const arg = args[0] ?? '';
  switch (head) {
    case 'entrar': return { ok: true, cmd: { name: 'entrar' } };
    case 'status': return { ok: true, cmd: { name: 'status' } };
    case 'vila': return { ok: true, cmd: { name: 'vila' } };
    case 'apoiar': return { ok: true, cmd: { name: 'apoiar' } };
    case 'trabalhar': {
      const job = RES_ALIAS[arg];
      return job ? { ok: true, cmd: { name: 'trabalhar', job } } : { ok: false, error: 'use !trabalhar madeira, pedra, comida, água ou construir' };
    }
    default: return { ok: false };
  }
}

export interface ProcessorOptions {
  now: () => number; // relógio injetável (testes usam um falso)
  queueLimit?: number; // tamanho máximo da fila
  perCall?: number; // quantos comandos executar por chamada de process()
}

interface Queued { msg: ChatMessage; cmd: Command }

/**
 * Pipeline: validação → cooldown → fila com limite → efeito.
 * É o adaptador entre qualquer fonte de chat (simulada ou tmi.js) e o mundo.
 */
export class CommandProcessor {
  private queue: Queued[] = [];
  private lastUse = new Map<string, number>();
  private readonly queueLimit: number;
  private readonly perCall: number;
  dropped = 0;

  constructor(
    private world: World,
    private opts: ProcessorOptions,
    public onReply: (to: string, text: string) => void = () => {},
  ) {
    this.queueLimit = opts.queueLimit ?? 50;
    this.perCall = opts.perCall ?? 10;
  }

  get queued(): number { return this.queue.length; }

  submit(msg: ChatMessage): void {
    const parsed = parseCommand(msg.text);
    if (!parsed.ok) {
      if (parsed.error) this.onReply(msg.user, parsed.error);
      return;
    }
    const key = `${msg.userId}:${parsed.cmd.name}`;
    const now = this.opts.now();
    const last = this.lastUse.get(key);
    if (last !== undefined && now - last < COOLDOWN_MS[parsed.cmd.name]) return; // silencioso: não vira spam no chat
    if (this.queue.length >= this.queueLimit) { this.dropped++; return; }
    this.lastUse.set(key, now);
    this.queue.push({ msg, cmd: parsed.cmd });
  }

  /** Executa até `perCall` comandos da fila; chamar uma vez por frame. */
  process(): void {
    for (let i = 0; i < this.perCall && this.queue.length; i++) {
      const { msg, cmd } = this.queue.shift()!;
      this.execute(msg, cmd);
    }
  }

  private execute(msg: ChatMessage, cmd: Command): void {
    const w = this.world;
    const reply = (t: string): void => this.onReply(msg.user, t);
    const v = w.findVillager(msg.userId);
    if (cmd.name === 'entrar') {
      const r = w.addVillager(msg.userId, sanitizeName(msg.user, msg.userId), World.colorFor(msg.userId));
      if (r.ok) reply(`bem-vindo à vila! Você começou como ${labelJob(r.villager.job)}.`);
      else reply(r.reason === 'exists' ? 'você já está na vila.' : 'a vila está cheia! Construam casas.');
      return;
    }
    if (!v) { reply('use !entrar primeiro.'); return; }
    switch (cmd.name) {
      case 'trabalhar':
        w.setJob(msg.userId, cmd.job);
        reply(`agora você é ${labelJob(cmd.job)}.`);
        break;
      case 'status':
        reply(`${labelJob(v.job)} · carregando ${v.carry} · XP ${v.xp}.${w.isStuck(v) ? ' Sem trabalho disponível agora (estoque cheio ou sem recurso): troque de função com !trabalhar.' : ''}`);
        break;
      case 'vila': {
        const s = w.stock;
        const se = w.season;
        reply(`dia ${w.day} · ${se.drought ? '🔥 seca' : '☀ temperada'} (${Math.ceil(se.daysLeft)}d) · ${w.villagers.length}/${w.popCap} aldeões · 🪵${s.wood} 🪨${s.stone} 🍎${s.food} 💧${s.water}.`);
        break;
      }
      case 'apoiar':
        w.support();
        reply(`obrigado! A vila trabalha mais rápido por ${Math.round(((w.supportUntil - w.tick) / TICKS_PER_SECOND))}s.`);
        break;
    }
  }
}

export function labelJob(j: Job): string {
  return j === 'build' ? 'construtor' : ({ wood: 'lenhador', stone: 'pedreiro', food: 'fazendeiro', water: 'aguadeiro' } as Record<Resource, string>)[j];
}

