# Persistence Plan for Wallet + Leaderboards (Render Free Tier)

## Why this is needed

Render free-tier services can restart/sleep, so process memory is not durable.
The current wallet and stock portfolio state is stored in in-memory Maps, which resets on restart.

## Fresh-start advantage

Because there are no users yet, we can do a hard cutover without any migration tooling:
- define the new canonical schema
- deploy with empty tables
- start all users from the same initial balance in DB

## Recommended architecture

- **Primary store:** managed Postgres (Neon/Supabase/Render Postgres)
- **App host:** Render free web service
- **Optional later:** Redis for session/cache acceleration

## Cost: can this be done for free?

Yes, this is possible without spending money (with typical free-tier limits).

Practical no-cost setup:
- Render free web service for the app
- Neon or Supabase free Postgres for durable wallet + portfolio data
- Optional: Upstash free Redis only if you later want shared session/cache behavior

Notes:
- Free tiers can have sleep/throughput/storage caps, but they still preserve data.
- For current expected scale (new project, no existing users), free tiers are usually enough.
- If limits are hit later, you can scale up without changing the data model.

## Minimal schema

```sql
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
```

## App integration plan

1. Keep existing socket API unchanged (`get-balance`, `stock-buy`, `stock-sell`, `stock-get-leaderboard`).
2. Replace in-memory reads/writes with DB helpers:
   - `getBalance`, `addBalance`, `deductBalance`
   - stock position read/write helpers
3. Use player name as identity key initially (simple + matches current app behavior).
4. Make writes transactional for stock buy/sell to keep cash/positions consistent.
5. Keep in-memory fallback only for local development if `DATABASE_URL` is missing.

## Rollout checklist

- [ ] Provision Postgres and set `DATABASE_URL` in Render
- [ ] Apply schema SQL once
- [ ] Deploy app with DB-backed wallet/positions
- [ ] Verify: restart service and confirm balances/leaderboard remain

## Verification after deployment

- Create two users and perform buys/sells.
- Restart Render service.
- Confirm balances and leaderboard values are unchanged.
- Confirm newly created users start at 1000 coins.
