create table if not exists players (
  id bigserial primary key,
  name text not null unique,
  balance numeric(14,2) not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_positions (
  player_id bigint not null references players(id) on delete cascade,
  symbol text not null,
  shares numeric(20,8) not null,
  avg_cost numeric(14,4) not null,
  primary key (player_id, symbol)
);

create table if not exists wallet_ledger (
  id bigserial primary key,
  player_id bigint not null references players(id) on delete cascade,
  delta numeric(14,2) not null,
  reason text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists picto_strokes (
  id bigserial primary key,
  stroke_id text not null unique,
  author_name text not null,
  tool text not null,
  color text not null,
  size integer not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists picto_messages (
  id bigserial primary key,
  author_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists brain_test_history (
  player_name varchar(20) primary key,
  last_daily_test_at timestamptz not null default now()
);
