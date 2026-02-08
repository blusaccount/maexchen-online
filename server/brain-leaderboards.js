import { isDatabaseEnabled, query, withTransaction } from './db.js';

const brainLeaderboardMemory = new Map(); // name -> best brainAge (lower is better)
const gameLeaderboardsMemory = {
    math: new Map(),
    stroop: new Map(),
    chimp: new Map(),
    reaction: new Map(),
    scramble: new Map()
};

const VALID_BRAIN_GAME_IDS = ['math', 'stroop', 'chimp', 'reaction', 'scramble'];
const MEMORY_LIMIT = 100;

function isReaction(gameId) {
    return gameId === 'reaction';
}

function pruneMemoryBoard(board, gameId = null) {
    if (board.size <= MEMORY_LIMIT) return;
    const entries = [];
    for (const [name, score] of board) {
        entries.push({ name, score });
    }
    if (gameId && isReaction(gameId)) {
        entries.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    } else if (gameId) {
        entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    } else {
        entries.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    }
    const keep = new Set(entries.slice(0, MEMORY_LIMIT).map(e => e.name));
    for (const name of board.keys()) {
        if (!keep.has(name)) board.delete(name);
    }
}

async function getOrCreatePlayerId(playerName, client = null) {
    const runner = client || { query };

    await runner.query(
        `insert into players (name, balance)
         values ($1, $2)
         on conflict (name) do nothing`,
        [playerName, 1000]
    );

    const result = await runner.query(
        'select id from players where name = $1',
        [playerName]
    );

    return result.rows[0]?.id || null;
}

export async function updateBrainAgeLeaderboard(playerName, brainAge) {
    if (typeof playerName !== 'string' || !playerName) return;
    if (!Number.isFinite(brainAge)) return;

    if (!isDatabaseEnabled()) {
        const current = brainLeaderboardMemory.get(playerName);
        if (current === undefined || brainAge < current) {
            brainLeaderboardMemory.set(playerName, brainAge);
        }
        pruneMemoryBoard(brainLeaderboardMemory);
        return;
    }

    await withTransaction(async (client) => {
        const playerId = await getOrCreatePlayerId(playerName, client);
        if (!playerId) return;

        await client.query(
            `insert into brain_leaderboards (player_id, best_brain_age)
             values ($1, $2)
             on conflict (player_id) do update
             set best_brain_age = least(brain_leaderboards.best_brain_age, excluded.best_brain_age),
                 updated_at = now()`,
            [playerId, brainAge]
        );
    });
}

export async function updateGameLeaderboard(gameId, playerName, score) {
    if (!VALID_BRAIN_GAME_IDS.includes(gameId)) return;
    if (typeof playerName !== 'string' || !playerName) return;
    if (!Number.isFinite(score)) return;

    if (!isDatabaseEnabled()) {
        const board = gameLeaderboardsMemory[gameId];
        const current = board.get(playerName);
        if (current === undefined) {
            board.set(playerName, score);
            pruneMemoryBoard(board, gameId);
            return;
        }
        if (isReaction(gameId)) {
            if (score < current) board.set(playerName, score);
        } else if (score > current) {
            board.set(playerName, score);
        }
        pruneMemoryBoard(board, gameId);
        return;
    }

    await withTransaction(async (client) => {
        const playerId = await getOrCreatePlayerId(playerName, client);
        if (!playerId) return;

        if (isReaction(gameId)) {
            await client.query(
                `insert into brain_game_leaderboards (player_id, game_id, best_score)
                 values ($1, $2, $3)
                 on conflict (player_id, game_id) do update
                 set best_score = least(brain_game_leaderboards.best_score, excluded.best_score),
                     updated_at = now()`,
                [playerId, gameId, score]
            );
        } else {
            await client.query(
                `insert into brain_game_leaderboards (player_id, game_id, best_score)
                 values ($1, $2, $3)
                 on conflict (player_id, game_id) do update
                 set best_score = greatest(brain_game_leaderboards.best_score, excluded.best_score),
                     updated_at = now()`,
                [playerId, gameId, score]
            );
        }
    });
}

export async function getBrainLeaderboard(limit = 10) {
    if (!isDatabaseEnabled()) {
        const entries = [];
        for (const [name, brainAge] of brainLeaderboardMemory) {
            entries.push({ name, brainAge });
        }
        entries.sort((a, b) => a.brainAge - b.brainAge || a.name.localeCompare(b.name));
        return entries.slice(0, limit);
    }

    const result = await query(
        `select p.name, bl.best_brain_age
         from brain_leaderboards bl
         join players p on p.id = bl.player_id
         order by bl.best_brain_age asc, p.name asc
         limit $1`,
        [limit]
    );

    return result.rows.map(r => ({ name: r.name, brainAge: Number(r.best_brain_age) }));
}

export async function getGameLeaderboards(limit = 10) {
    if (!isDatabaseEnabled()) {
        const out = {};
        for (const gameId of VALID_BRAIN_GAME_IDS) {
            const board = gameLeaderboardsMemory[gameId];
            const entries = [];
            for (const [name, score] of board) {
                entries.push({ name, score });
            }
            if (isReaction(gameId)) {
                entries.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
            } else {
                entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
            }
            out[gameId] = entries.slice(0, limit);
        }
        return out;
    }

    const result = await query(
        `select name, game_id, best_score
         from (
           select p.name,
                  bgl.game_id,
                  bgl.best_score,
                  row_number() over (
                    partition by bgl.game_id
                    order by
                      case when bgl.game_id = 'reaction' then bgl.best_score end asc,
                      case when bgl.game_id <> 'reaction' then bgl.best_score end desc,
                      p.name asc
                  ) as rn
           from brain_game_leaderboards bgl
           join players p on p.id = bgl.player_id
         ) ranked
         where rn <= $1
         order by game_id, rn`,
        [limit]
    );

    const out = {};
    for (const gameId of VALID_BRAIN_GAME_IDS) {
        out[gameId] = [];
    }
    for (const row of result.rows) {
        if (!out[row.game_id]) out[row.game_id] = [];
        out[row.game_id].push({ name: row.name, score: Number(row.best_score) });
    }
    return out;
}

export { VALID_BRAIN_GAME_IDS };
