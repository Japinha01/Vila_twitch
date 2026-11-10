import type { Resource } from './types';

export type EventKind = 'harvest' | 'storm' | 'caravan' | 'fire' | 'plague';

export interface EventDef {
  kind: EventKind;
  icon: string;
  label: string;
  /** peso no sorteio */
  weight: number;
  /** duração em dias de jogo */
  days: number;
  /** população mínima para poder acontecer */
  minPop: number;
  /** multiplicador na coleta de recursos */
  gather: number;
  /** multiplicador na velocidade de trabalho */
  speed: number;
  /** aviso no log */
  text: string;
}

export const EVENTS: Record<EventKind, EventDef> = {
  harvest: { kind: 'harvest', icon: '🌾', label: 'Dia da colheita', weight: 3, days: 1, minPop: 0, gather: 1.5, speed: 1, text: 'Dia da colheita! A coleta rende 50% a mais hoje.' },
  storm: { kind: 'storm', icon: '⛈', label: 'Tempestade', weight: 2, days: 1, minPop: 0, gather: 1, speed: 0.8, text: 'Tempestade! Todo mundo trabalha mais devagar, mas a chuva enche os poços.' },
  caravan: { kind: 'caravan', icon: '🐪', label: 'Caravana', weight: 2, days: 1, minPop: 4, gather: 1, speed: 1, text: 'Uma caravana chegou e deixou suprimentos na vila!' },
  fire: { kind: 'fire', icon: '🔥', label: 'Incêndio', weight: 1, days: 1, minPop: 8, gather: 1, speed: 0.9, text: 'Incêndio no depósito! Parte da madeira e da comida queimou.' },
  plague: { kind: 'plague', icon: '🤒', label: 'Praga', weight: 1, days: 2, minPop: 10, gather: 1, speed: 0.75, text: 'Uma praga se espalha: o trabalho rende menos por 2 dias.' },
};

/** Chance de um evento começar a cada novo dia, quando não há nenhum ativo. */
export const EVENT_CHANCE = 0.35;
export const EVENT_FIRST_DAY = 3;

/** Efeito imediato sobre o estoque ao começar (retorna o delta por recurso; negativo = perda). */
export function eventStockDelta(kind: EventKind, stock: Record<Resource, number>, roll: () => number): Partial<Record<Resource, number>> {
  if (kind === 'caravan') {
    const pick = (): number => 25 + Math.floor(roll() * 40);
    return { wood: pick(), stone: pick(), food: pick(), water: pick() };
  }
  if (kind === 'fire') return { wood: -Math.floor(stock.wood * 0.2), food: -Math.floor(stock.food * 0.2) };
  if (kind === 'storm') return { water: 40 };
  return {};
}

/** Sorteia o evento do dia (determinístico: depende só do número `roll` em [0,1) e da população). */
export function pickEvent(roll: number, pop: number): EventKind | null {
  const pool = Object.values(EVENTS).filter((e) => pop >= e.minPop);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = roll * total;
  for (const e of pool) { r -= e.weight; if (r < 0) return e.kind; }
  return pool[pool.length - 1]?.kind ?? null;
}
