import {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    NoSubscriberBehavior,
    StreamType
} from '@discordjs/voice';
import YTDlpWrapModule from 'yt-dlp-wrap';
const YTDlpWrap = YTDlpWrapModule.default || YTDlpWrapModule;
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
// Pfad zum Hauptverzeichnis (stricthotel/)
const ytDlpPath = join(__dirname, isWindows ? '../../../yt-dlp.exe' : '../../../yt-dlp');

let ytDlp = null;

// yt-dlp initialisieren
async function initYtDlp() {
    if (ytDlp) return ytDlp;

    if (!existsSync(ytDlpPath)) {
        throw new Error('yt-dlp.exe nicht gefunden!');
    }

    ytDlp = new YTDlpWrap(ytDlpPath);
    console.log('✓ yt-dlp initialisiert');
    return ytDlp;
}

// Queue pro Server
const queues = new Map();

export function getQueue(guildId) {
    return queues.get(guildId);
}

export function createQueue(guildId) {
    const queue = {
        songs: [],
        player: createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        }),
        connection: null,
        playing: false,
        loop: false
    };
    queues.set(guildId, queue);
    return queue;
}

export function deleteQueue(guildId) {
    const queue = queues.get(guildId);
    if (queue) {
        queue.player.stop();
        queue.connection?.destroy();
        queues.delete(guildId);
    }
}

export async function joinChannel(channel) {
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
    });

    // Reconnect bei Verbindungsabbruch
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch (error) {
            connection.destroy();
        }
    });

    connection.on('error', error => {
        console.error('Voice Connection Error:', error.message);
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        console.log('✓ Voice verbunden');
        return connection;
    } catch (error) {
        connection.destroy();
        throw error;
    }
}

export async function searchYouTube(query) {
    try {
        await initYtDlp();

        // Prüfen ob es eine URL ist
        const isUrl = query.includes('youtube.com') || query.includes('youtu.be');
        const searchQuery = isUrl ? query : `ytsearch1:${query}`;

        console.log('Suche nach:', searchQuery);

        // Verwende execPromise statt getVideoInfo für bessere Kontrolle
        const output = await ytDlp.execPromise([
            searchQuery,
            '--print', '%(title)s',
            '--print', '%(webpage_url)s',
            '--print', '%(duration)s',
            '--print', '%(thumbnail)s',
            '--no-download',
            '--no-playlist'
        ]);

        const lines = output.trim().split('\n');
        if (lines.length < 2) return null;

        const title = lines[0];
        const url = lines[1];
        const duration = parseInt(lines[2]) || 0;
        const thumbnail = lines[3] || null;

        console.log('Gefunden:', title, url);

        return [{
            title,
            url,
            duration: formatDuration(duration),
            thumbnail
        }];

    } catch (error) {
        console.error('Search error:', error.message);
        return null;
    }
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function playSong(queue, song) {
    try {
        if (!song || !song.url) {
            console.error('Ungültiger Song:', song);
            return false;
        }

        console.log('Starte Stream für:', song.title);
        await initYtDlp();

        // Hole direkte Audio-URL von yt-dlp
        const audioUrl = await ytDlp.execPromise([
            song.url,
            '-f', 'bestaudio/best',
            '--get-url',
            '--no-playlist'
        ]);

        const directUrl = audioUrl.trim();
        console.log('Audio-URL erhalten');

        // ffmpeg streamt direkt von der URL
        const ffmpeg = spawn(ffmpegPath, [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-i', directUrl,
            '-analyzeduration', '0',
            '-loglevel', '0',
            '-acodec', 'pcm_s16le',
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1'
        ], { stdio: ['ignore', 'pipe', 'ignore'] });

        ffmpeg.on('error', (err) => {
            console.error('ffmpeg error:', err.message);
        });

        const resource = createAudioResource(ffmpeg.stdout, {
            inputType: StreamType.Raw
        });

        queue.player.play(resource);
        queue.playing = true;

        console.log('Playback gestartet!');
        return true;
    } catch (error) {
        console.error('Fehler beim Abspielen:', error);
        return false;
    }
}

export function setupPlayerEvents(queue, guildId, textChannel) {
    queue.player.on(AudioPlayerStatus.Idle, async () => {
        if (queue.loop && queue.songs.length > 0) {
            queue.songs.push(queue.songs.shift());
        } else {
            queue.songs.shift();
        }

        if (queue.songs.length > 0) {
            const success = await playSong(queue, queue.songs[0]);
            if (success) {
                textChannel.send(`🎵 Spiele jetzt: **${queue.songs[0].title}**`).catch(() => {});
            }
        } else {
            queue.playing = false;
            setTimeout(() => {
                const currentQueue = getQueue(guildId);
                if (currentQueue && !currentQueue.playing && currentQueue.songs.length === 0) {
                    deleteQueue(guildId);
                    textChannel.send('👋 Queue leer - verlasse den Channel.').catch(() => {});
                }
            }, 5 * 60 * 1000);
        }
    });

    queue.player.on('error', error => {
        console.error('Player Error:', error.message);
        textChannel.send('❌ Fehler beim Abspielen. Überspringe...').catch(() => {});
        queue.songs.shift();
        if (queue.songs.length > 0) {
            playSong(queue, queue.songs[0]);
        }
    });
}
