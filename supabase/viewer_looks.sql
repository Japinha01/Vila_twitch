-- Vila do Chat (M6): visual global do viewer, escolhido na página ?conta (login com a Twitch).
-- Rode uma vez no SQL Editor do Supabase. Leitura pública (o jogo de qualquer streamer busca pelo ID da Twitch);
-- só o dono grava, e só no próprio ID da Twitch (conferido contra a identidade de login, que o usuário não consegue editar).

create table if not exists public.viewer_looks (
  twitch_id text primary key check (twitch_id ~ '^[0-9]{1,20}$'),
  owner uuid not null unique references auth.users (id) on delete cascade,
  look jsonb not null check (jsonb_typeof(look) = 'object' and pg_column_size(look) < 600),
  updated_at timestamptz not null default now()
);

create or replace function public.is_my_twitch_id(tid text)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1 from auth.identities i
    where i.user_id = auth.uid() and i.provider = 'twitch' and i.provider_id = tid
  );
$$;
grant execute on function public.is_my_twitch_id(text) to authenticated;

alter table public.viewer_looks enable row level security;

drop policy if exists "viewer_looks: leitura publica" on public.viewer_looks;
create policy "viewer_looks: leitura publica" on public.viewer_looks
  for select to anon, authenticated using (true);

drop policy if exists "viewer_looks: dono grava" on public.viewer_looks;
create policy "viewer_looks: dono grava" on public.viewer_looks
  for all to authenticated
  using (owner = auth.uid() and public.is_my_twitch_id(twitch_id))
  with check (owner = auth.uid() and public.is_my_twitch_id(twitch_id));
