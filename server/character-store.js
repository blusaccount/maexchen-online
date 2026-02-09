// ============== CHARACTER PORTRAIT PERSISTENCE ==============

import { isDatabaseEnabled, query } from './db.js';

// Fallback in-memory storage for local development without DATABASE_URL
const characters = new Map(); // playerName -> character object

/**
 * Save a character portrait for a player.
 * @param {string} playerName
 * @param {object|null} character - validated character object ({ pixels, dataURL })
 */
export async function saveCharacter(playerName, character) {
    if (!character) return;

    if (!isDatabaseEnabled()) {
        characters.set(playerName, character);
        return;
    }

    try {
        await query(
            `update players set character_data = $1, updated_at = now()
             where name = $2`,
            [JSON.stringify(character), playerName]
        );
    } catch (err) {
        console.error('saveCharacter error:', err.message);
    }
}

/**
 * Get a character portrait for a single player.
 * @param {string} playerName
 * @returns {Promise<object|null>}
 */
export async function getCharacter(playerName) {
    if (!isDatabaseEnabled()) {
        return characters.get(playerName) || null;
    }

    try {
        const result = await query(
            'select character_data from players where name = $1',
            [playerName]
        );
        return result.rows[0]?.character_data || null;
    } catch (err) {
        console.error('getCharacter error:', err.message);
        return null;
    }
}

/**
 * Get character portraits for multiple players in a single query.
 * @param {string[]} names
 * @returns {Promise<Map<string, object>>} name -> character
 */
export async function getCharactersByNames(names) {
    const result = new Map();
    if (!names || names.length === 0) return result;

    if (!isDatabaseEnabled()) {
        for (const name of names) {
            const ch = characters.get(name);
            if (ch) result.set(name, ch);
        }
        return result;
    }

    try {
        const dbResult = await query(
            'select name, character_data from players where name = any($1) and character_data is not null',
            [names]
        );
        for (const row of dbResult.rows) {
            if (row.character_data) result.set(row.name, row.character_data);
        }
    } catch (err) {
        console.error('getCharactersByNames error:', err.message);
    }
    return result;
}
