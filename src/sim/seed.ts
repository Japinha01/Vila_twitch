import { hashString } from './rng';

/**
 * Seed do mapa digitada pelo streamer: número ("12345") ou texto ("vila-do-japa").
 * Texto vira número por hash estável, então o mesmo texto gera sempre o mesmo mapa.
 * Vazio = sem seed (o jogo sorteia).
 */
export function parseSeed(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d{1,10}$/.test(t) && Number(t) <= 0xffffffff) return Number(t);
  return hashString(t.toLowerCase());
}

export const randomSeed = (): number => Math.floor(Math.random() * 1e9);
