// ============== PICTOCHAT PERSISTENCE ==============

import { isDatabaseEnabled, query } from './db.js';

export const PICTO_MAX_STROKES_DB = 400;
export const PICTO_MAX_MESSAGES = 200;

// ============== STROKE PERSISTENCE ==============

export async function loadStrokes() {
    if (!isDatabaseEnabled()) return [];

    try {
        const result = await query(
            `select stroke_id, author_name, tool, color, size, data
             from picto_strokes
             order by id asc
             limit $1`,
            [PICTO_MAX_STROKES_DB]
        );
        return result.rows.map(row => {
            const base = {
                strokeId: row.stroke_id,
                authorId: null,
                authorName: row.author_name,
                tool: row.tool,
                color: row.color,
                size: row.size
            };
            const data = row.data || {};
            if (data.points) base.points = data.points;
            if (data.start) base.start = data.start;
            if (data.end) base.end = data.end;
            return base;
        });
    } catch (err) {
        console.error('loadStrokes error:', err.message);
        return [];
    }
}

export async function saveStroke(stroke) {
    if (!isDatabaseEnabled()) return;

    try {
        const data = {};
        if (stroke.points) data.points = stroke.points;
        if (stroke.start) data.start = stroke.start;
        if (stroke.end) data.end = stroke.end;

        await query(
            `insert into picto_strokes (stroke_id, author_name, tool, color, size, data)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (stroke_id) do nothing`,
            [stroke.strokeId, stroke.authorName || 'Anon', stroke.tool, stroke.color, stroke.size, JSON.stringify(data)]
        );

        // Trim old strokes beyond the limit
        await query(
            `delete from picto_strokes
             where id not in (
               select id from picto_strokes order by id desc limit $1
             )`,
            [PICTO_MAX_STROKES_DB]
        );
    } catch (err) {
        console.error('saveStroke error:', err.message);
    }
}

export async function deleteStroke(strokeId) {
    if (!isDatabaseEnabled()) return;

    try {
        await query('delete from picto_strokes where stroke_id = $1', [strokeId]);
    } catch (err) {
        console.error('deleteStroke error:', err.message);
    }
}

export async function clearStrokes() {
    if (!isDatabaseEnabled()) return;

    try {
        await query('delete from picto_strokes');
    } catch (err) {
        console.error('clearStrokes error:', err.message);
    }
}

// ============== MESSAGE PERSISTENCE ==============

export async function loadMessages() {
    if (!isDatabaseEnabled()) return [];

    try {
        const result = await query(
            `select author_name, message, created_at
             from picto_messages
             order by id desc
             limit $1`,
            [PICTO_MAX_MESSAGES]
        );
        // Reverse so oldest first
        return result.rows.reverse().map(row => ({
            name: row.author_name,
            text: row.message,
            timestamp: new Date(row.created_at).getTime()
        }));
    } catch (err) {
        console.error('loadMessages error:', err.message);
        return [];
    }
}

export async function saveMessage(name, text) {
    if (!isDatabaseEnabled()) return;

    try {
        await query(
            'insert into picto_messages (author_name, message) values ($1, $2)',
            [name, text]
        );

        // Trim old messages beyond the limit
        await query(
            `delete from picto_messages
             where id not in (
               select id from picto_messages order by id desc limit $1
             )`,
            [PICTO_MAX_MESSAGES]
        );
    } catch (err) {
        console.error('saveMessage error:', err.message);
    }
}

export async function clearMessages() {
    if (!isDatabaseEnabled()) return;

    try {
        await query('delete from picto_messages');
    } catch (err) {
        console.error('clearMessages error:', err.message);
    }
}
