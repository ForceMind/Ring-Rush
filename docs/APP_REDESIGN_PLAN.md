# Pello Android App, Game UI, and Server Deployment Plan

## 1. Final Goal

Pello should become an Android-first casual competitive game:

- Players can start a paid 1v1 match quickly.
- Each player pays 12 coins to enter the default table.
- The winner receives 20 coins from the 24 coin pool.
- The server keeps the remaining 4 coins as the system sink.
- If no player is matched in time, the player can switch to a skill-matched AI.
- Practice AI and local 2P stay available, but they are not confused with paid coin matches.
- The app UI is fullscreen, bilingual, readable on phones, and visually closer to a casual mobile game than a desktop prototype.

## 2. Problems Found

Current risks from earlier iterations:

- Some UI changes affected gameplay identity. The clearest bug is bot/AI red-blue display: pieces cached their colors before dice decided first turn, so the visual color could disagree with the actual turn owner.
- The home screen was redesigned, but the in-game screen was still mostly the old UI.
- Effects such as collision, bounce, score, stop, and runner movement were added and should be preserved, not removed during UI redesign.
- The Android app needs a backend URL that is independent from browser local development.
- Deployment should print the exact values the app needs, so those values can be pasted back into the app configuration.

## Current Website and Deployment Addendum

The project now also has a public website goal:

- `/` is the website with game introduction, rule explanation, screenshots, live preview, APK download, and online play entry.
- `/online.html` remains the actual web game.
- Android starts from `/online.html` through Capacitor `server.appStartPath`.
- The production Node service should serve the website, web game, HTTP API, WebSocket backend, and `/download/Pello.apk` from the same deployment.
- Website documentation lives in `README.md`, `ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and `docs/DESIGN.md`.

## 3. Non-Negotiable Gameplay Rules

Do not change these while redesigning UI:

- A and B remain the authoritative game slots.
- Dice result decides first turn.
- Color is a visual identity and must follow the dice/slot rules consistently.
- Bot/AI player remains slot B in bot mode unless the game model is intentionally changed later.
- Online perspective must stay fixed by player slot.
- Score calculation stays server-verifiable and independent of visual effects.
- Paid match settlement must use the server-confirmed result, not a client-only estimate.

## 4. UI Redesign Target

The game screen must be redesigned as one coherent mobile game view:

- Top compact match bar: mode, round, connection or AI status, stake/payout when paid.
- Player cards: opponent card at the top, player card at the bottom, with color, remaining pieces, turn state, and timer.
- Central board stays dominant and readable.
- Runner/tug-of-war is styled as an in-game race/progress meter, not a debug track.
- Surrender button is visible only when valid and not close to the aiming area.
- Score, collision, bounce, stop, and win effects stay visible but must not obscure pieces.
- Result panel shows win/loss, coin delta, entry fee, payout, system sink, and server confirmation.

## 5. Bilingual Rule

The app chooses language from device/browser language:

- `zh*` means Chinese UI.
- Everything else means English UI.
- Canvas text and DOM modal text must use the same language source.
- New UI text must be added through `src-online/i18n.js`, not hardcoded repeatedly.

## 6. Server Deployment Target

The Android app should talk to a separately deployed backend.

Backend deployment must provide:

- HTTP base URL for REST APIs.
- WebSocket URL for live matchmaking/game messages.
- Health endpoint.
- Competitive table config.
- Currency name.
- Default stake, winner payout, and system sink.
- A copy-paste block for app setup.
- A Vite env block for Android builds:
  - `VITE_PELLO_SERVER_URL`
  - `VITE_PELLO_SERVER_LOCKED`

Recommended deployment shape:

- `NODE_ENV=production`
- `PORT=3000` or platform-provided port.
- Reverse proxy or platform HTTPS in front of Node.
- Persistent `server/data` volume for guest accounts, wallets, ledgers, and matches.
- Public HTTPS URL for production Android builds.
- LAN HTTP URL allowed only for debug builds.

## 7. Deployment Script Requirements

Add a script that:

- Builds the frontend.
- Verifies the backend starts locally.
- Checks `/api/competitive/health`.
- Prints APP-facing config:
  - `APP_SERVER_HTTP`
  - `APP_SERVER_WS`
  - `APP_HEALTH_URL`
  - `VITE_PELLO_SERVER_URL`
  - `VITE_PELLO_SERVER_LOCKED`
  - table id
  - stake
  - payout
  - sink
  - AI fallback timeout
- Can write `.env.production.local` for Android builds.
- Prints Android debug notes for LAN testing.
- Prints a short checklist for production deployment.

## 8. Effects Requirements

Keep and improve the current effects:

- Launch: aim line, power ramp, launch ring.
- Collision: spark burst and hit flash scaled by impact.
- Wall bounce: edge pulse and lighter feedback.
- Stop/rest: settling ring before scoring.
- Score: zone pulse, `+score`, score particles.
- Runner movement: impact pulse on movement.
- Win/loss: result overlay followed by settlement panel.

Next phase should split this into explicit game visual states:

- `waitingForTurn`
- `aiming`
- `launched`
- `moving`
- `settling`
- `scoring`
- `runnerAdvancing`
- `turnSwitch`
- `matchEnding`
- `settlementPending`
- `settled`

## 9. Current Implementation Scope

This implementation pass will complete:

- Fix cached red-blue piece color in bot/AI and all modes.
- Redesign the in-game UI layer while preserving board, physics, input, and effects.
- Keep game text bilingual through the existing i18n layer.
- Add an APP backend deployment/config print script.
- Add build-time APP backend config and production server URL lock.
- Add package scripts for server deployment/config inspection.
- Build and test the Android/debug path.

This pass will not fully complete:

- Full backend production hardening.
- Real login beyond guest/session token.
- Store release signing.
- Admin review dashboard.
- A full replay/anti-cheat pipeline.

## 10. Future Additions

After this pass, the important optimizations are:

- Real production backend deployment with HTTPS and persistent storage.
- Release/preview environment separation.
- Tutorial mode for first-time users.
- Daily reward and daily missions.
- Match replay or result evidence viewer.
- More table tiers after the 12 coin economy is stable.
- Better fraud controls for AI coin rewards.
- Real device performance profiling.
- Store-ready icon/splash/adaptive icon polish.

## 11. Acceptance Checklist

This pass is acceptable when:

- `npm run build` passes.
- `npm run test:competitive` passes.
- Android internal-test APK builds.
- Bot/AI color after dice agrees with current turn and piece colors.
- In-game UI is visibly redesigned, not just home screen.
- APP server config script prints copy-paste values.
- No Android fullscreen regression is introduced.
