// ============== RIOT GAMES API ==============

const RIOT_API_KEY = process.env.RIOT_API_KEY || '';
const RIOT_REGION = process.env.RIOT_REGION || 'europe';

const VALID_REGIONS = ['americas', 'europe', 'asia', 'esports'];

/**
 * Parse a Riot ID string (e.g. "Player#EUW") into gameName and tagLine.
 * Returns null if the format is invalid.
 */
export function parseRiotId(riotId) {
    if (typeof riotId !== 'string') return null;
    const trimmed = riotId.trim();
    const hashIndex = trimmed.lastIndexOf('#');
    if (hashIndex < 1) return null;

    const gameName = trimmed.slice(0, hashIndex).trim();
    const tagLine = trimmed.slice(hashIndex + 1).trim();

    if (gameName.length < 3 || gameName.length > 16) return null;
    if (tagLine.length < 2 || tagLine.length > 5) return null;

    return { gameName, tagLine };
}

/**
 * Check whether the Riot API integration is configured.
 */
export function isRiotApiEnabled() {
    return RIOT_API_KEY.length > 0;
}

/**
 * Look up a Riot account by Riot ID (gameName#tagLine).
 * Returns { puuid, gameName, tagLine } on success, or null if not found.
 * Throws on network/server errors.
 */
export async function lookupRiotAccount(gameName, tagLine) {
    const region = VALID_REGIONS.includes(RIOT_REGION) ? RIOT_REGION : 'europe';
    const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

    const res = await fetch(url, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

    if (res.status === 404) return null;
    if (res.status === 429) throw new Error('Riot API rate limit exceeded, try again later');
    if (!res.ok) throw new Error(`Riot API error (${res.status})`);

    const data = await res.json();
    return {
        puuid: data.puuid,
        gameName: data.gameName,
        tagLine: data.tagLine
    };
}

/**
 * Validate a Riot ID string end-to-end: parse it and look it up via the API.
 * Returns { valid: true, gameName, tagLine, puuid } or { valid: false, reason }.
 */
export async function validateRiotId(riotId) {
    const parsed = parseRiotId(riotId);
    if (!parsed) {
        return { valid: false, reason: 'Invalid format. Use Name#Tag (e.g. Player#EUW)' };
    }

    if (!isRiotApiEnabled()) {
        // Graceful degradation: accept any well-formatted ID when API key is missing
        return { valid: true, gameName: parsed.gameName, tagLine: parsed.tagLine, puuid: null };
    }

    try {
        const account = await lookupRiotAccount(parsed.gameName, parsed.tagLine);
        if (!account) {
            return { valid: false, reason: 'Riot account not found' };
        }
        return { valid: true, gameName: account.gameName, tagLine: account.tagLine, puuid: account.puuid };
    } catch (err) {
        throw err;
    }
}
