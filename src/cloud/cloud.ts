import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Profile, SaveData } from '../sim/world';
import { fromProfileRows, toProfileRows } from './rows';

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
    const { data, error } = await this.db.from('profiles').select('twitch_id, name, xp, job').eq('owner', owner);
    if (error) throw error;
    return fromProfileRows(data);
  }

  async saveProfiles(profiles: Map<string, Profile>): Promise<void> {
    const owner = this.userId;
    if (!owner) throw new Error('não está logado');
    const rows = toProfileRows(owner, profiles).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    if (!rows.length) return;
    const { error } = await this.db.from('profiles').upsert(rows, { onConflict: 'owner,twitch_id' });
    if (error) throw error;
  }
}
