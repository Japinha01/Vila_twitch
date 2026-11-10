import type { SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** A nuvem só liga se as duas variáveis de ambiente existirem (a chave anon é pública por desenho). */
export const cloudConfigured = (): boolean => !!URL && !!ANON;

let client: Promise<SupabaseClient | null> | null = null;

/** Um único cliente Supabase para o login, a vila na nuvem e o overlay. Carregado só quando preciso. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!URL || !ANON) return Promise.resolve(null);
  // realtime.worker: o batimento da conexão roda num Worker e não é freado em aba escondida
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL, ANON, { auth: { persistSession: true, detectSessionInUrl: true }, realtime: { worker: true, params: { eventsPerSecond: 40 } } })); // 40/s: a câmera do overlay vai a ~20 quadros por segundo
  return client;
}
