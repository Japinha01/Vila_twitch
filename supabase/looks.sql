-- Vila do Chat (M6): visual escolhido pelo viewer (cor, cabelo, pele, chapéu, moldura) guardado no perfil.
-- Rode uma vez no SQL Editor do Supabase. Sem isto o jogo funciona, mas o visual não volta em outro navegador.
alter table public.profiles add column if not exists look jsonb;
