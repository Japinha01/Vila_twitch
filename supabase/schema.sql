-- Vila do Chat (M2): rode este arquivo uma vez no SQL Editor do Supabase.
-- Cada streamer (usuário logado com a Twitch) só enxerga e grava os próprios dados.

create table if not exists public.villages (
  owner uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  day integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  owner uuid not null references auth.users (id) on delete cascade,
  twitch_id text not null,
  name text not null,
  xp integer not null default 0 check (xp >= 0),
  job text not null check (job in ('wood', 'stone', 'food', 'water', 'build')),
  updated_at timestamptz not null default now(),
  primary key (owner, twitch_id)
);

alter table public.villages enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "villages: dono" on public.villages;
create policy "villages: dono" on public.villages
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "profiles: dono" on public.profiles;
create policy "profiles: dono" on public.profiles
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
