import type { Job } from '../sim/types';
import type { Profile } from '../sim/world';
import { sanitizeName } from '../chat/names';

const JOBS: readonly string[] = ['wood', 'stone', 'food', 'water', 'build'];
/** Limite por envio: a vila tem poucas centenas de aldeões, nunca milhares. */
export const MAX_PROFILES = 2000;

export interface ProfileRow { owner: string; twitch_id: string; name: string; xp: number; job: Job; coins?: number }

/** Perfis em memória → linhas da tabela `profiles`. */
export function toProfileRows(owner: string, profiles: Map<string, Profile>): ProfileRow[] {
  const rows: ProfileRow[] = [];
  for (const [twitch_id, p] of profiles) {
    if (!/^\d+$/.test(twitch_id)) continue; // só IDs reais da Twitch; viewers do chat simulado ficam de fora
    rows.push({ owner, twitch_id, name: p.name, xp: Math.max(0, Math.floor(p.xp)), job: p.job, coins: Math.max(0, Math.floor(p.coins ?? 0)) });
    if (rows.length >= MAX_PROFILES) break;
  }
  return rows;
}

/** Linhas da nuvem → perfis. Dado inválido é descartado; o nome passa de novo pelo filtro de blocklist. */
export function fromProfileRows(rows: unknown): Map<string, Profile> {
  const out = new Map<string, Profile>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r || typeof r.twitch_id !== 'string' || typeof r.xp !== 'number' || !Number.isFinite(r.xp) || !JOBS.includes(r.job)) continue;
    out.set(r.twitch_id, { name: sanitizeName(String(r.name ?? ''), r.twitch_id), xp: Math.max(0, Math.floor(r.xp)), job: r.job as Job, coins: isFinite(Number(r.coins)) ? Math.max(0, Math.floor(Number(r.coins))) : 0 });
  }
  return out;
}
