# HANDOFF - Nostalgiabait Video Player

## Was wurde gemacht

### Shared Player-Modul
- `public/nostalgiabait/shared/player.css` — Fullscreen-Player-Styles: schwarzer Hintergrund, fixed Video mit `object-fit: contain`, pulsierendes "CLICK TO START" Overlay, Back/Replay-Buttons (initial hidden, `.visible` zeigt sie), responsive bis 400px, Mobile Touch-Fixes.
- `public/nostalgiabait/shared/player.js` — IIFE-Player-Logik: Click/Touch-to-Start, ended → Buttons zeigen, Replay (currentTime=0 + play), Back → /nostalgiabait/, Keyboard (Space=Start/Replay, Escape=Back), Contextmenu unterdrückt, Error-Handler mit "VIDEO NOT AVAILABLE" Fallback.

### Konsolen-Seiten (Video-Player)
- `public/nostalgiabait/ps2/index.html` — "Playsphere 2 - Nostalgiabait", Akzentfarbe `#4488ff`, lädt `boot.mp4` aus gleichem Verzeichnis.
- `public/nostalgiabait/gamecube/index.html` — "Cubesystem 2001 - Nostalgiabait", Akzentfarbe `#7b68ee`, lädt `boot.mp4` aus gleichem Verzeichnis.

### Geänderte Dateien
- `public/nostalgiabait/index.html` — Links zeigen jetzt auf `/nostalgiabait/ps2/` und `/nostalgiabait/gamecube/` (statt ps2.html / gamecube.html).
- `public/index.html` — Nostalgiabait-Beschreibung geändert zu "Erinnerungen an Startup-Screens vergangener Konsolen-Ären."
- `.gitignore` — `userinput/` hinzugefügt.

### Nicht geändert (wie angewiesen)
- `ps2/ps2.html`, `ps2.css`, `ps2.js` (Canvas-Version bleibt erhalten)
- `gamecube/gamecube.html`, `gamecube.css`, `gamecube.js` (Canvas-Version bleibt erhalten)
- `server.js`

## Was funktioniert
- Shared Player-Modul ist vollständig und wiederverwendbar
- Konsolen-Seiten laden korrekt mit Error-Fallback wenn kein Video vorhanden
- Navigation: Hauptseite → Nostalgiabait-Übersicht → Konsolen-Video-Player
- Keyboard-Steuerung (Space, Escape)
- Mobile/Touch-Support
- Canvas-Versionen weiterhin direkt erreichbar über ps2.html / gamecube.html

## Was ist offen

### MP4-Dateien fehlen!
Es wurden **keine MP4-Dateien** in `userinput/` gefunden — nur MP3s (Audio) und PNGs. Die Boot-Videos müssen noch beschafft und platziert werden:
- `public/nostalgiabait/ps2/boot.mp4`
- `public/nostalgiabait/gamecube/boot.mp4`

Sobald die MP4s dort liegen, funktioniert der Player sofort. Ohne sie wird der "VIDEO NOT AVAILABLE" Fallback angezeigt.

### Optional: Komprimierung
Falls die MP4s >50MB sind, vor dem Commit komprimieren:
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -c:a aac -b:a 128k output.mp4
```
GitHub-Limit: 100MB pro Datei.
