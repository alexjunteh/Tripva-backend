-- Run this once in Supabase Dashboard > SQL Editor
-- https://supabase.com/dashboard/project/alnzqqlwqwxknxaxtawh/sql/new

create table if not exists public.profiles (
  id uuid references auth.users(id) primary key,
  email text,
  plan text default 'free',
  trips_generated integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.trips (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  destination text,
  start_date text,
  end_date text,
  plan_data jsonb,
  gist_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;

create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can view own trips" on public.trips for select using (auth.uid() = user_id);
create policy "Users can insert own trips" on public.trips for insert with check (auth.uid() = user_id);
create policy "Users can update own trips" on public.trips for update using (auth.uid() = user_id);
create policy "Users can delete own trips" on public.trips for delete using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
