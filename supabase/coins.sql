-- Vila do Chat (M5): moedas da vila guardadas junto do XP de cada viewer.
-- Rode uma vez no SQL Editor do Supabase. Sem isto o jogo funciona, mas as moedas não voltam em outro navegador.
alter table public.profiles add column if not exists coins integer not null default 0 check (coins >= 0);
