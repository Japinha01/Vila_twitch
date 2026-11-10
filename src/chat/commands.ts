import { TICKS_PER_SECOND } from '../sim/config';
import { CARDS, COIN_XP, EVENTS } from '../sim/events';
import { FRAMES, HAIRS, HATS, SHIRTS, SKINS, unlockedFor, type LookPart } from '../sim/looks';
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
  | { name: 'fila' }
  | { name: 'trabalhar'; job: Job }
  | { name: 'status' }
  | { name: 'vila' }
  | { name: 'livre' }
  | { name: 'profissao' }
  | { name: 'meus' }
  | { name: 'amigos' }
  | { name: 'moedas' }
  | { name: 'visual'; part?: LookPart; value: string }
  | { name: 'evento'; card: string }
  | { name: 'apoiar' };

type ParseResult = { ok: true; cmd: Command } | { ok: false; error?: string };

const RES_ALIAS: Record<string, Job> = {
  madeira: 'wood', pedra: 'stone', comida: 'food', agua: 'water', construir: 'build', construtor: 'build',
};

/** Cooldown por viewer e por comando, em ms de relógio real. */
export const COOLDOWN_MS: Record<Command['name'], number> = {
  entrar: 5000, fila: 5000, trabalhar: 5000, livre: 5000, status: 5000, profissao: 5000, meus: 5000, amigos: 5000, vila: 10000, apoiar: 60000, moedas: 5000, evento: 10000, visual: 4000,
};

/** Etapa 1 do pipeline: validação (sintaxe e argumentos). */
export function parseCommand(text: string): ParseResult {
  const t = text.trim();
  if (!t.startsWith('!')) return { ok: false };
  const [head, ...args] = normalize(t.slice(1)).split(/\s+/);
  const arg = args[0] ?? '';
  switch (head) {
    case 'entrar': return { ok: true, cmd: { name: 'entrar' } };
    case 'fila': case 'sair': return { ok: true, cmd: { name: 'fila' } };
    case 'status': return { ok: true, cmd: { name: 'status' } };
    case 'profissao': return { ok: true, cmd: { name: 'profissao' } };
    case 'meus': case 'estabelecimentos': return { ok: true, cmd: { name: 'meus' } };
    case 'amigos': case 'amigo': case 'familia': return { ok: true, cmd: { name: 'amigos' } };
    case 'vila': return { ok: true, cmd: { name: 'vila' } };
    case 'apoiar': return { ok: true, cmd: { name: 'apoiar' } };
    case 'visual': return { ok: true, cmd: { name: 'visual', value: '' } };
    case 'pele': case 'cabelo': case 'cor': case 'moldura': return { ok: true, cmd: { name: 'visual', part: head, value: args.join(' ') } };
    case 'chapeu': return { ok: true, cmd: { name: 'visual', part: 'chapeu', value: args.join(' ') } };
    case 'moedas': case 'moeda': return { ok: true, cmd: { name: 'moedas' } };
    case 'evento': case 'eventos': return { ok: true, cmd: { name: 'evento', card: arg } };
    case 'livre': case 'autonomo': return { ok: true, cmd: { name: 'livre' } };
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
      if (r.ok) { w.leaveQueue(msg.userId); reply(`bem-vindo à vila! Você começou como ${labelJob(r.villager.job)}.`); return; }
      if (r.reason === 'exists') { reply('você já está na vila.'); return; }
      const q = w.enqueue(msg.userId, sanitizeName(msg.user, msg.userId), World.colorFor(msg.userId));
      if (q.ok) reply(q.already ? `você já está na fila: posição ${q.position}.` : `a vila está cheia! Você entrou na fila de espera: posição ${q.position}. Entra sozinho quando sair uma vaga (os aldeões constroem casas).`);
      else reply(q.reason === 'full' ? 'a vila e a fila estão cheias.' : 'a vila está cheia! Construam casas.');
      return;
    }
    if (cmd.name === 'fila') {
      // quem está na fila pode sair com !fila; quem já mora na vila vê o tamanho da fila
      if (w.leaveQueue(msg.userId)) reply('você saiu da fila de espera.');
      else reply(w.waitlist.length ? `${w.waitlist.length} viewers na fila de espera.` : 'a fila de espera está vazia.');
      return;
    }
    if (!v) { reply('use !entrar primeiro.'); return; }
    switch (cmd.name) {
      case 'trabalhar':
        w.setJob(msg.userId, cmd.job);
        reply(`agora você é ${labelJob(cmd.job)}.`);
        break;
      case 'livre':
        w.setFree(msg.userId);
        reply('você voltou a decidir sozinho: vai para onde a vila mais precisa.');
        break;
      case 'status':
        reply(`${labelJob(v.job)} · carregando ${v.carry} · XP ${v.xp}.${w.isStuck(v) ? ' Sem trabalho disponível agora (estoque cheio ou sem recurso): troque de função com !trabalhar.' : ''}`);
        break;
      case 'profissao': {
        const p = w.professionOf(v);
        reply(`sua profissão é ${labelJob(p)}${w.isLeader(v) ? ' 👑 (você é o líder da profissão!)' : w.leaders[p] ? ` (líder: ${w.findVillager(w.leaders[p]!)?.name ?? '—'})` : ''}.`);
        break;
      }
      case 'meus': {
        const mine = w.establishmentsOf(msg.userId);
        reply(mine.length ? `seus estabelecimentos: ${mine.slice(0, 6).join(', ')}${mine.length > 6 ? ` e mais ${mine.length - 6}` : ''}.` : 'você ainda não é dono de nada. Líderes de profissão ganham os estabelecimentos da área.');
        break;
      }
      case 'amigos': {
        const r = w.relationsOf(msg.userId);
        const parts: string[] = [];
        if (r.partner) parts.push(`💞 namorando ${r.partner}`);
        if (r.kids.length) parts.push(`👶 filhos: ${r.kids.join(', ')}`);
        if (r.friends.length) parts.push(`🤝 amigos: ${r.friends.join(', ')}`);
        reply(parts.length ? parts.join(' · ') + '.' : 'você ainda não fez amigos. Trabalhe perto dos outros aldeões!');
        break;
      }
      case 'vila': {
        const s = w.stock;
        const se = w.season;
        reply(`dia ${w.day} · ${se.drought ? '🔥 seca' : '☀ temperada'} (${Math.ceil(se.daysLeft)}d) · ${w.villagers.length}/${w.popCap} aldeões${w.waitlist.length ? ` (+${w.waitlist.length} na fila)` : ''} · 🪵${s.wood} 🪨${s.stone} 🍎${s.food} 💧${s.water}.`);
        break;
      }
      case 'visual': {
        if (!cmd.part || !cmd.value) {
          const xp = Math.max(v.xp, w.profiles.get(msg.userId)?.xp ?? 0);
          const u = unlockedFor(xp);
          reply(cmd.part
            ? `use !${cmd.part} <nome>. Opções: ${({ pele: SKINS, cabelo: HAIRS, cor: SHIRTS, chapeu: HATS, moldura: FRAMES } as Record<LookPart, { label: string }[]>)[cmd.part].map((o) => o.label).join(', ')}.`
            : `personalize com !cor, !cabelo, !pele, !chapeu e !moldura (e "nenhum" tira). Liberados por XP (você tem ${xp}): chapéus: ${u.hats.join(', ') || 'nenhum ainda'}; molduras: ${u.frames.join(', ') || 'nenhuma ainda'}.`);
          break;
        }
        const r = w.setLook(msg.userId, cmd.part, cmd.value);
        if (r.ok) reply('visual atualizado!');
        else if (r.reason === 'locked') reply(`ainda bloqueado: faltam ${r.need} de XP.`);
        else reply(r.reason === 'unknown' ? `não conheço essa opção. Use !${cmd.part} sem nada para ver a lista.` : 'só viewers moradores podem mudar o visual.');
        break;
      }
      case 'moedas':
        reply(`você tem ${v.coins ?? 0} 🪙 moedas da vila (1 a cada ${COIN_XP} de XP). Gaste com !evento.`);
        break;
      case 'evento': {
        if (!cmd.card) { reply(`cartas: ${CARDS.map((c) => `${EVENTS[c.kind].icon} ${c.alias[0]} (${c.cost}🪙)`).join(' · ')}. Use !evento <nome>.`); break; }
        const r = w.requestCard(msg.userId, cmd.card);
        if (r.ok) { reply(r.queued ? 'pedido enviado! Espera o streamer aprovar (as moedas voltam se recusar).' : 'carta ativada! Obrigado!'); break; }
        const why: Record<string, string> = {
          villager: 'só viewers moradores da vila podem resgatar.', unknown: `não conheço essa carta. Use !evento para ver a lista.`,
          coins: `faltam ${r.need} 🪙 moedas.`, busy: 'já há um evento acontecendo; tente depois.', cooldown: `essa carta está em espera por mais ${r.days} dia(s).`,
          limit: 'muitas cartas na última hora; tente mais tarde.', pending: 'você já tem um pedido esperando.', full: 'a fila de pedidos está cheia.',
        };
        reply(why[r.reason]);
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

