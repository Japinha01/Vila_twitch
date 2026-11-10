-- Vila do Chat (M4): ranking na nuvem. Rode este arquivo uma vez no SQL Editor do Supabase
-- (depois do schema.sql). A leitura é pública (qualquer um vê o ranking); só o dono grava a própria linha.
-- Só dados leves e não secretos: nome do streamer, números da vila e os melhores viewers por XP.

create table if not exists public.ranking_villages (
  owner uuid primary key references auth.users (id) on delete cascade,
  streamer text not null check (char_length(streamer) between 1 and 40),
  pop integer not null check (pop between 0 and 100000),
  era integer not null check (era between 0 and 20),
  day integer not null check (day between 1 and 1000000),
  buildings integer not null check (buildings between 0 and 100000),
  achievements integer not null default 0 check (achievements between 0 and 1000),
  score integer not null check (score between 0 and 100000000),
  updated_at timestamptz not null default now()
);

create table if not exists public.ranking_viewers (
  owner uuid not null references auth.users (id) on delete cascade,
  twitch_id text not null check (twitch_id ~ '^[0-9]{1,20}$'),
  name text not null check (char_length(name) between 1 and 40),
  streamer text not null check (char_length(streamer) between 1 and 40),
  xp integer not null check (xp between 0 and 100000000),
  updated_at timestamptz not null default now(),
  primary key (owner, twitch_id)
);

create index if not exists ranking_villages_score on public.ranking_villages (score desc);
create index if not exists ranking_viewers_xp on public.ranking_viewers (xp desc);

alter table public.ranking_villages enable row level security;
alter table public.ranking_viewers enable row level security;

drop policy if exists "ranking_villages: leitura publica" on public.ranking_villages;
create policy "ranking_villages: leitura publica" on public.ranking_villages
  for select to anon, authenticated using (true);
drop policy if exists "ranking_villages: dono grava" on public.ranking_villages;
create policy "ranking_villages: dono grava" on public.ranking_villages
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "ranking_viewers: leitura publica" on public.ranking_viewers;
create policy "ranking_viewers: leitura publica" on public.ranking_viewers
  for select to anon, authenticated using (true);
drop policy if exists "ranking_viewers: dono grava" on public.ranking_viewers;
create policy "ranking_viewers: dono grava" on public.ranking_viewers
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
