import { sanitizeName } from '../chat/names';
import type { AchStats } from '../sim/achievements';
import type { Profile } from '../sim/world';

/** Quantos viewers cada vila envia (os de maior XP). */
export const RANK_VIEWERS_PER_VILLAGE = 20;
export const RANK_LIST_SIZE = 10;

export interface VillageRankRow {
  owner: string; streamer: string; pop: number; era: number; day: number; buildings: number; achievements: number; score: number;
}
export interface ViewerRankRow { owner: string; twitch_id: string; name: string; streamer: string; xp: number }

/** Pontuação da vila: população pesa mais, depois era, prédios e dias vividos. */
export function villageScore(s: Pick<AchStats, 'pop' | 'era' | 'built' | 'day'>): number {
  return Math.max(0, Math.floor(s.pop * 10 + s.era * 200 + s.built * 5 + s.day));
}

export function toVillageRankRow(owner: string, streamer: string, s: AchStats, achievements: number): VillageRankRow {
  return {
    owner, streamer: sanitizeName(streamer, owner), pop: s.pop, era: s.era, day: s.day, buildings: s.built, achievements,
    score: villageScore(s),
  };
}

/** Só IDs reais da Twitch (o chat simulado fica de fora), os de maior XP, sem XP zero. */
export function toViewerRankRows(owner: string, streamer: string, profiles: Map<string, Profile>): ViewerRankRow[] {
  const name = sanitizeName(streamer, owner);
  return [...profiles]
    .filter(([id, p]) => /^\d{1,20}$/.test(id) && p.xp > 0)
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, RANK_VIEWERS_PER_VILLAGE)
    .map(([twitch_id, p]) => ({ owner, twitch_id, name: p.name, streamer: name, xp: Math.floor(p.xp) }));
}

export interface VillageRank { streamer: string; pop: number; era: number; day: number; score: number }
export interface ViewerRank { name: string; streamer: string; xp: number }

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Linhas vindas da nuvem: descarta dado inválido e passa os nomes de novo pela blocklist. */
export function parseVillageRanks(rows: unknown): VillageRank[] {
  if (!Array.isArray(rows)) return [];
  const out: VillageRank[] = [];
  for (const r of rows) {
    if (!r || !isNum(r.score) || !isNum(r.pop) || !isNum(r.era) || !isNum(r.day)) continue;
    out.push({ streamer: sanitizeName(String(r.streamer ?? ''), String(r.owner ?? r.streamer ?? '')), pop: r.pop, era: r.era, day: r.day, score: r.score });
  }
  return out.slice(0, RANK_LIST_SIZE);
}

export function parseViewerRanks(rows: unknown): ViewerRank[] {
  if (!Array.isArray(rows)) return [];
  const out: ViewerRank[] = [];
  for (const r of rows) {
    if (!r || !isNum(r.xp) || typeof r.twitch_id !== 'string') continue;
    out.push({ name: sanitizeName(String(r.name ?? ''), r.twitch_id), streamer: sanitizeName(String(r.streamer ?? ''), r.twitch_id), xp: r.xp });
  }
  return out.slice(0, RANK_LIST_SIZE);
}
