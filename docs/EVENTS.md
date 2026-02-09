# Socket Event Catalog

This is a practical catalog of Socket.IO events. Source of truth is [server/socket-handlers.js](server/socket-handlers.js).

## Conventions
- Direction: C->S means client to server, S->C means server to client.
- Payload shapes and rate limits live in the server handler file.
- If you add or change an event, update this file.

## Lobby and rooms
C->S
- register-player
- get-lobbies
- create-room
- join-room
- start-game
- leave-room

S->C (common)
- online-players
- lobbies-update
- room-created
- room-joined
- room-update
- player-left
- game-started
- turn-start

## Maexchen gameplay
C->S
- roll
- announce
- challenge
- believe-maexchen
- emote
- chat-message
- drawing-note

S->C (common)
- dice-rolled
- roll-result
- player-announced
- player-challenged
- challenge-result
- player-disconnected
- game-over
- chat-broadcast
- drawing-note
- reaction

## Watchparty
C->S
- watchparty-load
- watchparty-playpause
- watchparty-seek
- watchparty-request-sync

S->C (common)
- watchparty-load
- watchparty-playpause
- watchparty-seek
- watchparty-sync
- game-started

## Pictochat (lobby)
C->S
- picto-join
- picto-cursor
- picto-cursor-hide
- picto-stroke-segment
- picto-stroke-end
- picto-shape
- picto-undo
- picto-redo
- picto-clear
- picto-message

S->C
- picto-state
- picto-cursor
- picto-cursor-hide
- picto-stroke-segment
- picto-stroke-commit
- picto-shape
- picto-undo
- picto-redo
- picto-clear
- picto-message

## Soundboard (lobby)
C->S
- soundboard-join
- soundboard-play

S->C
- soundboard-played

## Notes
- Some events are reused across games; check payloads in [server/socket-handlers.js](server/socket-handlers.js).
- Client listeners live under [shared/js](shared/js) and game-specific JS in [games](games).
