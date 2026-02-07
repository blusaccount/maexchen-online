import { existsSync, chmodSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Gehe zum Hauptverzeichnis (stricthotel/)
const rootDir = join(__dirname, '..', '..');
const isWindows = process.platform === 'win32';

async function setup() {
    // Skip yt-dlp download in CI or when SKIP_YT_DLP is set
    if (process.env.CI || process.env.SKIP_YT_DLP) {
        console.log('Setup: Skipping yt-dlp download (CI or SKIP_YT_DLP set)');
        return;
    }

    const ytDlpPath = join(rootDir, isWindows ? 'yt-dlp.exe' : 'yt-dlp');

    console.log('Setup: Checking for yt-dlp at', ytDlpPath);

    if (!existsSync(ytDlpPath)) {
        console.log('Downloading yt-dlp...');

        try {
            if (isWindows) {
                execSync(`curl -L -o "${ytDlpPath}" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"`, { stdio: 'inherit' });
            } else {
                execSync(`curl -L -o "${ytDlpPath}" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"`, { stdio: 'inherit' });
                chmodSync(ytDlpPath, '755');
            }
            console.log('✓ yt-dlp downloaded to', ytDlpPath);
        } catch (err) {
            console.error('Failed to download yt-dlp:', err.message);
        }
    } else {
        console.log('✓ yt-dlp already exists');
    }
}

setup().catch(console.error);
