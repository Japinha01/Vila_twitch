import { hashString } from '../sim/rng';

// Lista inicial e curta; ampliar conforme necessário (CLAUDE.md: nomes passam por blocklist).
const BLOCKLIST = ['merda', 'porra', 'caralho', 'puta', 'fdp', 'nazi', 'hitler'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '@': 'a', $: 's' };

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function isBlocked(name: string): boolean {
  const flat = normalize(name)
    .split('')
    .map((c) => LEET[c] ?? c)
    .join('')
    .replace(/[^a-z]/g, '');
  return BLOCKLIST.some((w) => flat.includes(w));
}

/** Limpa o nome do viewer; se vier vazio ou bloqueado, devolve um nome neutro estável. */
export function sanitizeName(raw: string, userId: string): string {
  const cleaned = raw.replace(/[^\p{L}\p{N}_ -]/gu, '').trim().slice(0, 16);
  if (!cleaned || isBlocked(cleaned)) return `Aldeão${hashString(userId) % 1000}`;
  return cleaned;
}
