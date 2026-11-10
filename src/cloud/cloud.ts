import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Profile, SaveData } from '../sim/world';
import { fromProfileRows, toProfileRows } from './rows';
import { parseVillageRanks, parseViewerRanks, RANK_LIST_SIZE, toVillageRankRow, toViewerRankRows, type ViewerRank, type VillageRank } from './ranking';
import type { AchStats } from '../sim/achievements';

import { getSupabase } from './client';

export interface CloudVillage { data: SaveData; day: number; updatedAt: string }

/** Supabase: login com a Twitch + vila e perfis dos viewers por streamer (regras RLS no schema.sql). */
export class Cloud {
  private constructor(private db: SupabaseClient, public session: Session | null) {}

  static async create(): Promise<Cloud | null> {
    const db = await getSupabase();
    if (!db) return null;
    const { data } = await db.auth.getSession();
    const cloud = new Cloud(db, data.session);
    db.auth.onAuthStateChange((_e, s) => { cloud.session = s; });
    return cloud;
  }

  get userId(): string | null { return this.session?.user.id ?? null; }
  get displayName(): string {
    const m = this.session?.user.user_metadata ?? {};
    return String(m.preferred_username ?? m.name ?? m.user_name ?? 'streamer');
  }

  async signIn(): Promise<void> {
    const { error } = await this.db.auth.signInWithOAuth({ provider: 'twitch', options: { redirectTo: location.origin + location.pathname } });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  async loadVillage(): Promise<CloudVillage | null> {
    const owner = this.userId;
    if (!owner) return null;
    const { data, error } = await this.db.from('villages').select('data, day, updated_at').eq('owner', owner).maybeSingle();
    if (error) throw error;
    return data ? { data: data.data as SaveData, day: data.day as number, updatedAt: data.updated_at as string } : null;
  }

  async saveVillage(save: SaveData, day: number): Promise<void> {
    const owner = this.userId;
    if (!owner) throw new Error('não está logado');
    const { error } = await this.db.from('villages').upsert({ owner, data: save, day, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async loadProfiles(): Promise<Map<string, Profile>> {
    const owner = this.userId;
    if (!owner) return new Map();
    const { data, error } = await this.db.from('profiles').select('*').eq('owner', owner);
    if (error) throw error;
    return fromProfileRows(data);
  }

  async saveProfiles(profiles: Map<string, Profile>): Promise<void> {
    const owner = this.userId;
    if (!owner) throw new Error('não está logado');
    const rows = toProfileRows(owner, profiles).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    if (!rows.length) return;
    let { error } = await this.db.from('profiles').upsert(rows, { onConflict: 'owner,twitch_id' });
    if (error && /coins/i.test(error.message)) { // coluna nova ainda não criada (supabase/coins.sql): salva sem as moedas
      ({ error } = await this.db.from('profiles').upsert(rows.map(({ coins: _c, ...r }) => r), { onConflict: 'owner,twitch_id' }));
    }
    if (error) throw error;
  }

  /** Publica a vila e os melhores viewers no ranking público. Lança erro se as tabelas (supabase/ranking.sql) não existirem. */
  async uploadRanking(stats: AchStats, achievements: number, profiles: Map<string, Profile>): Promise<void> {
    const owner = this.userId;
    if (!owner) throw new Error('não está logado');
    const now = new Date().toISOString();
    const v = await this.db.from('ranking_villages').upsert({ ...toVillageRankRow(owner, this.displayName, stats, achievements), updated_at: now });
    if (v.error) throw v.error;
    const rows = toViewerRankRows(owner, this.displayName, profiles).map((r) => ({ ...r, updated_at: now }));
    if (!rows.length) return;
    const p = await this.db.from('ranking_viewers').upsert(rows, { onConflict: 'owner,twitch_id' });
    if (p.error) throw p.error;
  }

  async loadRanking(): Promise<{ villages: VillageRank[]; viewers: ViewerRank[] }> {
    const [v, p] = await Promise.all([
      this.db.from('ranking_villages').select('owner, streamer, pop, era, day, score').order('score', { ascending: false }).limit(RANK_LIST_SIZE),
      this.db.from('ranking_viewers').select('twitch_id, name, streamer, xp').order('xp', { ascending: false }).limit(RANK_LIST_SIZE),
    ]);
    if (v.error) throw v.error;
    if (p.error) throw p.error;
    return { villages: parseVillageRanks(v.data), viewers: parseViewerRanks(p.data) };
  }
}
