import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let Pool = null;

try {
    ({ Pool } = require('pg'));
} catch (err) {
    console.warn('pg module not installed; DATABASE_URL persistence disabled in this environment.');
}

const connectionString = process.env.DATABASE_URL || '';
const hasDatabase = Boolean(connectionString) && Boolean(Pool);
const sslEnabled = String(process.env.DATABASE_SSL ?? 'true').toLowerCase() !== 'false';
const sslRejectUnauthorized = String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? 'true')
    .toLowerCase() !== 'false';

let pool = null;

if (hasDatabase) {
    pool = new Pool({
        connectionString,
        ssl: sslEnabled ? { rejectUnauthorized: sslRejectUnauthorized } : false,
        max: Number(process.env.DATABASE_POOL_MAX) || 10,
        idleTimeoutMillis: Number(process.env.DATABASE_POOL_IDLE_MS) || 30000,
        connectionTimeoutMillis: Number(process.env.DATABASE_POOL_CONN_MS) || 5000
    });

    pool.on('error', (err) => {
        console.error('Postgres pool error:', err.message);
    });
}

export function isDatabaseEnabled() {
    return hasDatabase;
}

export async function query(text, params = []) {
    if (!pool) {
        throw new Error('DATABASE_URL is not configured or pg is unavailable');
    }
    return pool.query(text, params);
}

export async function withTransaction(callback) {
    if (!pool) {
        throw new Error('DATABASE_URL is not configured or pg is unavailable');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
