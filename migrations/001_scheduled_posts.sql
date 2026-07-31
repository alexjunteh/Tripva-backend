-- Scheduled posts table for FB/IG content scheduling
create table if not exists scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  platforms text[] not null,
  message text,
  caption text,
  image_url text,
  link text,
  scheduled_at timestamptz not null,
  status text not null default 'pending',
  result jsonb,
  error text,
  created_at timestamptz default now(),
  published_at timestamptz,
  created_by text
);

create index if not exists idx_scheduled_posts_due
  on scheduled_posts (scheduled_at) where status = 'pending';

alter table scheduled_posts enable row level security;
