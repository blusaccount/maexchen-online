import { Router } from 'express';

const NOSTALGIA_VIDEOS = {
    ps1: process.env.NOSTALGIA_PS1_YOUTUBE_ID || '',
    ps2: process.env.NOSTALGIA_PS2_YOUTUBE_ID || '',
    gamecube: process.env.NOSTALGIA_GAMECUBE_YOUTUBE_ID || '',
    wiissbb: process.env.NOSTALGIA_WIISSBB_YOUTUBE_ID || '',
};

const router = Router();

router.get('/api/nostalgia-config', (req, res) => {
    res.json(NOSTALGIA_VIDEOS);
});

export default router;
