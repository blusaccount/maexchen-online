import { Router } from 'express';
import { getDailyLesson, buildQuiz, getDailySeed } from '../turkish-lessons.js';
import { recordDailyCompletion, getTurkishLeaderboard } from '../turkish-streaks.js';
import { sanitizePlayerName } from './auth.js';

const router = Router();

router.get('/api/turkish/daily', (req, res) => {
    const lesson = getDailyLesson();
    const quiz = buildQuiz(lesson, getDailySeed());
    const day = new Date().toISOString().slice(0, 10);
    res.json({ id: lesson.id, topic: lesson.topic, words: lesson.words, quiz, day });
});

router.post('/api/turkish/complete', async (req, res) => {
    try {
        const name = sanitizePlayerName(req.body?.playerName);
        if (!name) {
            return res.status(400).json({ ok: false, error: 'Invalid player name' });
        }

        const result = await recordDailyCompletion(name);
        if (!result.ok) {
            return res.status(500).json({ ok: false, error: 'Failed to record completion' });
        }

        res.json(result);
    } catch (err) {
        console.error('[Turkish] completion error:', err.message);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
});

router.get('/api/turkish/leaderboard', async (req, res) => {
    try {
        const leaderboard = await getTurkishLeaderboard();
        res.json({ ok: true, leaderboard });
    } catch (err) {
        console.error('[Turkish] leaderboard error:', err.message);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
});

export default router;
