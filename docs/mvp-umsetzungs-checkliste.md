# MVP Umsetzungs-Checkliste (Self-Hosted Stock-Game)

Ziel: In kleinen, risikoarmen Schritten von der aktuellen Codebase zu einem verkaufbaren v1-MVP kommen (Self-hosted first, Conversion zu zahlend als Haupt-KPI).

## Scope (v1)

- Enthalten: Setup in ~10 Minuten, Stock-Commands, Leaderboard/Net-Worth, Feature-Toggles, einfacher Lizenz-Check.
- Nicht enthalten: Plugin-System, Seasons, große Admin-UI.

---

## Schritt 1 - Self-hosting-Baseline auf 10-Minuten-Ziel bringen

### Dateien
- `Dockerfile` (neu)
- `docker-compose.yml` (neu)
- `.env.example` (neu)
- `README.md`

### To-do
- Node Runtime + Start Command in Docker sauber definieren.
- `docker compose up -d` als Standardpfad dokumentieren.
- Pflicht-Variablen in `.env.example` mit Kommentaren bereitstellen:
  - `DISCORD_BOT_TOKEN`, `DATABASE_URL`, `PORT`
  - `GAME_ENABLED`, `GAME_START_BALANCE`, `GAME_PRICE_TICK_SECONDS`
  - `LICENSE_KEY`, `LICENSE_MODE`
- Troubleshooting-Miniblock in `README.md` (Bot offline, DB nicht erreichbar, Port belegt).

### DoD
- Ein neuer Owner kann mit Copy/Paste-Schritten lokal starten.

### Checks
- `docker compose config`
- `docker compose up -d`
- `docker compose logs --tail=100`

---

## Schritt 2 - Stock-Commands serverseitig haerten

### Dateien
- `server/socket-handlers.js`
- `server/stock-game.js`
- Optional: `games/stocks/js/game.js` (nur falls Fehlermeldungen/UI-States fehlen)

### To-do
- Fuer Buy/Sell nur positive Ganzzahlen akzeptieren.
- Balance/Holdings niemals negativ werden lassen.
- Fehlerpfade vereinheitlichen (konsistente Error-Events/Message-Shape).
- Cooldown oder leichtes Rate-Limit fuer Trade-Spam pruefen (falls noch nicht vorhanden).

### DoD
- Ungueltige Inputs und Grenzfaelle werden sauber geblockt.

### Checks
- `npm test`
- Manueller Socket-Flow: buy/sell mit validen und invaliden Werten

---

## Schritt 3 - Leaderboard und Net-Worth als Kern-Hook absichern

### Dateien
- `server/stock-game.js`
- `server/socket-handlers.js`
- Optional Anzeige: `games/stocks/js/game.js`

### To-do
- Net-Worth einheitlich berechnen: `cash + sum(position_qty * current_price)`.
- `/top` bzw. leaderboard-Event auf stabile Sortierung trimmen.
- Leere Datensaetze/Null-Portfolios robust behandeln.

### DoD
- Top-Liste ist nachvollziehbar und konsistent mit Portfolio-Werten.

### Checks
- `npm test`
- Manuell mit 2-3 Testaccounts: unterschiedliche Portfolios handeln und Reihenfolge verifizieren

---

## Schritt 4 - Feature-Toggles sauber ueber ENV

### Dateien
- `server.js`
- `server/socket-handlers.js`
- `.env.example`
- `README.md`

### To-do
- `GAME_ENABLED` zentral auslesen und weiterreichen.
- Wenn deaktiviert: klare Serverantwort statt stiller Fehler.
- README-Doku: welche Features per ENV schaltbar sind.

### DoD
- Stock-Feature kann ohne Codeaenderung an/aus geschaltet werden.

### Checks
- `GAME_ENABLED=false npm start`
- Trade-Events pruefen (korrekte deaktiviert-Meldung)

---

## Schritt 5 - Lizenz-Key MVP (leichtgewichtig)

### Dateien
- `server.js`
- Optional neu: `server/license.js`
- `.env.example`
- `README.md`

### To-do
- `LICENSE_MODE`: `required | trial | off`.
- Bei `required` Start verweigern, falls `LICENSE_KEY` fehlt/ungueltig.
- Bei `trial` klare Start-Logmeldung inkl. Ablaufhinweis.
- Simple erste Validierung (zunaechst lokal-konfigurierbar), spaeter externe Verifikation.

### DoD
- Kauf-/Key-Flow ist technisch abbildbar ohne manuelle Codeeingriffe beim Owner.

### Checks
- `LICENSE_MODE=required` ohne Key -> erwarteter Startfehler
- `LICENSE_MODE=off` -> normaler Start

---

## Schritt 6 - Conversion-Messpunkte (minimal)

### Dateien
- `server/socket-handlers.js`
- Optional neu: `server/metrics.js`
- `HANDOFF.md` (Verifikationsnotizen pro Release)

### To-do
- Drei Kernereignisse loggen (zunaechst serverseitig):
  - Installation/Start
  - First trade pro Guild
  - Aktiver Server pro Tag
- Logs so strukturieren, dass spaetere Auswertung einfach bleibt.

### DoD
- Conversion-Trichter ist mit minimalem Logging nachvollziehbar.

### Checks
- Start + 1 Trade ausloesen und Logs auf erwartete Eventstruktur pruefen

---

## Reihenfolge-Empfehlung fuer PRs

1. PR #1: Setup (Docker + `.env.example` + README)
2. PR #2: Stock-Validierung + Error-Shapes
3. PR #3: Leaderboard/Net-Worth Konsistenz
4. PR #4: Feature-Toggles
5. PR #5: Lizenz-Key MVP
6. PR #6: Conversion-Logging

Jede PR klein halten, mit klarer Verifikation in `HANDOFF.md` dokumentieren.
