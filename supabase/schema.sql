-- Supabase SQL Editor?? ?????.

create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  birth_date date,
  created_at timestamptz not null default now()
);

create unique index if not exists signups_email_unique on public.signups (email);

alter table public.signups enable row level security;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.signups to postgres, service_role;

-- ??(Vercel API)? service_role ??? ?????.
-- anon/authenticated ????? ?? ?? ??? ???? ????.
