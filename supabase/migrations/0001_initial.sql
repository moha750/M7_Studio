-- M7_Studio — initial schema.
-- Tables: profiles, qr_codes, qr_scans, url_history
-- Plus RLS, triggers, and a storage bucket for QR logos.

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique,
  display_name text,
  avatar_url text,
  locale text default 'ar' check (locale in ('ar','en')),
  created_at timestamptz default now()
);

-- ============================================================
-- qr_codes
-- ============================================================
create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  short_code text unique not null,
  name text not null,
  target_url text not null,
  is_active boolean not null default true,
  design_config jsonb not null default '{}'::jsonb,
  logo_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index qr_codes_short_code_idx on public.qr_codes (short_code);
create index qr_codes_user_id_idx on public.qr_codes (user_id);

-- ============================================================
-- qr_scans
-- ============================================================
create table public.qr_scans (
  id bigserial primary key,
  qr_code_id uuid not null references public.qr_codes on delete cascade,
  scanned_at timestamptz not null default now(),
  ip_hash text,
  country text,
  city text,
  user_agent text,
  device_type text,
  browser text,
  os text,
  referrer text,
  is_unique boolean not null default false
);
create index qr_scans_qr_id_time_idx on public.qr_scans (qr_code_id, scanned_at desc);
create index qr_scans_country_idx on public.qr_scans (qr_code_id, country);

-- ============================================================
-- url_history
-- ============================================================
create table public.url_history (
  id bigserial primary key,
  qr_code_id uuid not null references public.qr_codes on delete cascade,
  old_url text,
  new_url text not null,
  changed_at timestamptz not null default now()
);
create index url_history_qr_id_idx on public.url_history (qr_code_id, changed_at desc);

-- ============================================================
-- Trigger: log URL changes + bump updated_at
-- ============================================================
create or replace function public.log_url_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.target_url is distinct from old.target_url then
    insert into public.url_history (qr_code_id, old_url, new_url)
    values (new.id, old.target_url, new.target_url);
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger qr_codes_url_change
  before update on public.qr_codes
  for each row execute function public.log_url_change();

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS policies (owner-only access)
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.qr_codes      enable row level security;
alter table public.qr_scans      enable row level security;
alter table public.url_history   enable row level security;

create policy "owner reads profile" on public.profiles
  for select using (auth.uid() = id);
create policy "owner updates profile" on public.profiles
  for update using (auth.uid() = id);

create policy "owner all qr_codes" on public.qr_codes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner reads scans" on public.qr_scans
  for select using (
    exists (
      select 1 from public.qr_codes c
      where c.id = qr_scans.qr_code_id and c.user_id = auth.uid()
    )
  );

create policy "owner reads url_history" on public.url_history
  for select using (
    exists (
      select 1 from public.qr_codes c
      where c.id = url_history.qr_code_id and c.user_id = auth.uid()
    )
  );

-- ============================================================
-- Storage bucket for QR logos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('qr-logos', 'qr-logos', true)
on conflict (id) do nothing;

create policy "owner uploads logos" on storage.objects
  for insert with check (
    bucket_id = 'qr-logos' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "public reads logos" on storage.objects
  for select using (bucket_id = 'qr-logos');
create policy "owner deletes logos" on storage.objects
  for delete using (
    bucket_id = 'qr-logos' and auth.uid()::text = (storage.foldername(name))[1]
  );
