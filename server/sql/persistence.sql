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

create table if not exists turkish_streaks (
  player_id bigint primary key references players(id) on delete cascade,
  current_streak integer not null default 0,
  max_streak integer not null default 0,
  last_completed_day integer
);

create index if not exists turkish_streaks_current_idx
  on turkish_streaks (current_streak desc, max_streak desc);

create table if not exists brain_leaderboards (
  player_id bigint primary key references players(id) on delete cascade,
  best_brain_age integer not null,
  updated_at timestamptz not null default now()
);

create index if not exists brain_leaderboards_age_idx
  on brain_leaderboards (best_brain_age asc, updated_at desc);

create table if not exists brain_game_leaderboards (
  player_id bigint not null references players(id) on delete cascade,
  game_id text not null,
  best_score integer not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, game_id)
);

create index if not exists brain_game_leaderboards_game_idx
  on brain_game_leaderboards (game_id, best_score, updated_at desc);

create table if not exists lol_bets (
  id bigserial primary key,
  player_id bigint not null references players(id) on delete cascade,
  player_name text not null,
  lol_username text not null,
  bet_amount numeric(14,2) not null,
  bet_on_win boolean not null,
  status text not null default 'pending',
  game_id text,
  result boolean,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists lol_bets_status_idx
  on lol_bets (status, created_at desc);

create index if not exists lol_bets_player_idx
  on lol_bets (player_id, created_at desc);
