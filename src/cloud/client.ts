import type { SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** A nuvem só liga se as duas variáveis de ambiente existirem (a chave anon é pública por desenho). */
export const cloudConfigured = (): boolean => !!URL && !!ANON;

let client: Promise<SupabaseClient | null> | null = null;

/** Um único cliente Supabase para o login, a vila na nuvem e o overlay. Carregado só quando preciso. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!URL || !ANON) return Promise.resolve(null);
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL, ANON, { auth: { persistSession: true, detectSessionInUrl: true } }));
  return client;
}
