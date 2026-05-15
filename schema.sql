-- Site Review: Supabase セットアップSQL
-- Supabase の SQL Editor で実行してください

create table sr_sessions (
  id uuid default gen_random_uuid() primary key,
  site_url text not null,
  created_at timestamptz default now()
);

create table sr_comments (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references sr_sessions(id) on delete cascade not null,
  x_percent float not null,
  y_percent float not null,
  text text not null,
  author text not null,
  status text default 'open' check (status in ('open', 'fixed', 'verified', 'rejected')),
  parent_id uuid references sr_comments(id) on delete cascade,
  created_at timestamptz default now()
);

alter table sr_sessions enable row level security;
alter table sr_comments enable row level security;

create policy "Public select sessions"  on sr_sessions for select using (true);
create policy "Public insert sessions"  on sr_sessions for insert with check (true);
create policy "Public select comments"  on sr_comments for select using (true);
create policy "Public insert comments"  on sr_comments for insert with check (true);
create policy "Public update comments"  on sr_comments for update using (true);
create policy "Public delete comments"  on sr_comments for delete using (true);
