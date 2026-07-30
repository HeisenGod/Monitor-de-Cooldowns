-- Execute este arquivo uma vez no SQL Editor do projeto Supabase.
-- Ele não altera o sistema de login existente.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'ranking_user_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.ranking_user_type as enum (
      'normal',
      'vip_tier_1',
      'vip_tier_2',
      'vip_tier_3',
      'el_patrono'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'ranking_reset_category'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.ranking_reset_category as enum (
      'helicoptero',
      'tanque',
      'invasao'
    );
  end if;
end
$$;

create table if not exists public.ranking_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_name text not null,
  discord_avatar text,
  user_type public.ranking_user_type not null default 'normal',
  updated_at timestamptz not null default now()
);

create table if not exists public.ranking_resets (
  user_id uuid not null references public.ranking_profiles(user_id) on delete cascade,
  category public.ranking_reset_category not null,
  reset_count bigint not null default 0 check (reset_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create index if not exists ranking_resets_category_count_idx
on public.ranking_resets (category, reset_count desc);

alter table public.ranking_profiles enable row level security;
alter table public.ranking_resets enable row level security;

drop policy if exists "Ranking profiles public read" on public.ranking_profiles;
create policy "Ranking profiles public read"
on public.ranking_profiles
for select
to anon, authenticated
using (true);

drop policy if exists "Ranking resets public read" on public.ranking_resets;
create policy "Ranking resets public read"
on public.ranking_resets
for select
to anon, authenticated
using (true);

revoke all on table public.ranking_profiles from anon, authenticated;
revoke all on table public.ranking_resets from anon, authenticated;
grant select on table public.ranking_profiles to anon, authenticated;
grant select on table public.ranking_resets to anon, authenticated;

create or replace function public.register_ranking_reset(
  p_category public.ranking_reset_category
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_metadata jsonb;
  v_discord_name text;
  v_discord_avatar text;
begin
  if v_user_id is null then
    raise exception 'Login necessário para registrar resets';
  end if;

  select raw_user_meta_data
  into v_metadata
  from auth.users
  where id = v_user_id;

  v_discord_name := coalesce(
    nullif(v_metadata ->> 'full_name', ''),
    nullif(v_metadata ->> 'name', ''),
    nullif(v_metadata ->> 'preferred_username', ''),
    nullif(v_metadata ->> 'user_name', ''),
    'Usuário do Discord'
  );

  v_discord_avatar := coalesce(
    nullif(v_metadata ->> 'avatar_url', ''),
    nullif(v_metadata ->> 'picture', '')
  );

  insert into public.ranking_profiles (
    user_id,
    discord_name,
    discord_avatar
  )
  values (
    v_user_id,
    v_discord_name,
    v_discord_avatar
  )
  on conflict (user_id) do update
  set
    discord_name = excluded.discord_name,
    discord_avatar = excluded.discord_avatar,
    updated_at = now();

  insert into public.ranking_resets (
    user_id,
    category,
    reset_count
  )
  values (
    v_user_id,
    p_category,
    1
  )
  on conflict (user_id, category) do update
  set
    reset_count = public.ranking_resets.reset_count + 1,
    updated_at = now();
end;
$$;

revoke all on function public.register_ranking_reset(public.ranking_reset_category)
from public;

grant execute
on function public.register_ranking_reset(public.ranking_reset_category)
to authenticated;
