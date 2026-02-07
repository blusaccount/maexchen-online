# HANDOFF - Server Modularisierung & Health-Check

## Was wurde gemacht

### Server in Module aufgeteilt
- `server.js` (Root) → Importiert `server/index.js` und startet den Server
- `server/index.js` → Express + Socket.IO Setup, Static Files, Health-Check, Periodic Cleanup, Server Start
- `server/game-logic.js` → ROLL_ORDER, STARTING_LIVES, rollDice, rollRank, rollName, isMaexchen, getAlivePlayers, nextAlivePlayerIndex
- `server/room-manager.js` → rooms/onlinePlayers Maps, create/join/leave Room Logik, Broadcast-Funktionen, sendTurnStart
- `server/socket-handlers.js` → Alle socket.on() Event Handler, Input-Validierung, Rate Limiting
- `server/discord-bot.js` → Komplette Discord Bot Logik (startDiscordBot)

### .env Setup
- `dotenv` war bereits in package.json - wird jetzt in `server/index.js` via `import 'dotenv/config'` geladen
- `.env.example` erstellt mit PORT und DISCORD_TOKEN
- `.env` war bereits in `.gitignore`

### Health-Check Endpoint
- `GET /health` → JSON mit `{ status: "ok", uptime, players: onlinePlayers.size, rooms: rooms.size }`

### Bisherige Security (aus vorherigem Sprint, unverändert übernommen)
- Input-Validierung: sanitizeName, validateCharacter, validateRoomCode, validateGameType
- Rate Limiting: Token-Bucket pro Socket-ID, strengere Limits für Chat/Emotes/Drawings
- Error Handling: Alle Handler in try-catch
- Periodischer Cleanup alle 5 Min

## Geänderte Dateien
- `server.js` → Nur noch Import von `server/index.js`
- `server/index.js` → Express/Socket.IO Setup, Health-Check, Cleanup, Start (neu)
- `server/game-logic.js` → Spiellogik-Funktionen (neu)
- `server/room-manager.js` → Room-Verwaltung (neu)
- `server/socket-handlers.js` → Socket Event Handler (neu)
- `server/discord-bot.js` → Discord Bot (neu)
- `.env.example` → Template für Umgebungsvariablen (neu)

## Was nicht geändert wurde
- Client-Code (public/, shared/, games/)
- Spiellogik (nur verschoben, nicht umgeschrieben)
- Discord Bot Logik (nur verschoben)
- Frontend-Dateien, Nostalgiabait

## Was funktioniert
- Server startet korrekt über `node server.js`
- Alle statischen Dateien werden korrekt ausgeliefert
- Health-Check Endpoint liefert JSON mit Status, Uptime, Spieler- und Raum-Anzahl
- Discord Bot startet wenn DISCORD_TOKEN gesetzt ist
- Mäxchen-Spiellogik unverändert
- Character-System unverändert
- Nostalgiabait unverändert

## Was ist offen
- Client-seitige Validierung (optional, Server validiert bereits alles)
- CORS-Konfiguration für Socket.IO (aktuell offen)
- Authentifizierung/Sessions (aktuell anonym)
