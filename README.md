# Pello / Ring Rush

Pello is a mobile-first casual board-flick game. Players launch pieces onto scoring zones, push the race marker, and play 1v1 matches with a coin entry and winner payout.

Current focus: Android internal testing, online 1v1 matchmaking, AI fallback matches, and a single deployment for `https://pello.xincreates.com` that serves the website, web game, API, WebSocket backend, and APK download.

## Entry Points

- Website: `/`
- Web game: `/online.html`
- Android APK download: `/download/Pello.apk`
- Competitive health API: `/api/competitive/health`
- WebSocket game server: same host and port as the website

Capacitor is configured with `server.appStartPath=/online.html`, so the Android app opens the game UI even though the public website uses `index.html`.

## Features

- Real-time 1v1 online play.
- Coin table economy: default table uses 12 coins entry, 24 coins pool, 20 coins winner payout, 4 coins platform fee.
- AI training with Easy / Medium / Hard difficulty.
- Paid AI fallback controlled by matchmaking and player record, not by manual difficulty selection.
- Mobile-safe UI with status bar/cutout spacing.
- Local settings for server URL, sound, music, and vibration.
- Website landing page with gameplay explanation, screenshots, live web preview, APK download, and online play link.

## Local Development

```bash
npm install
npm run dev
```

Open:

- Website: `http://127.0.0.1:5173/`
- Web game: `http://127.0.0.1:5173/online.html`

Run the backend separately when testing matchmaking:

```bash
cd server
npm install
npm start
```

Default backend URL: `http://127.0.0.1:3000`.

## Tests

```bash
npm run test:game-ai
npm run test:competitive
npm run build
```

Build Android internal-test APK:

```powershell
npm run android:build:debug:local
```

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Production Deployment

One Node service can host everything. The default public domain is `https://pello.xincreates.com`.

From the server, pull this branch and run:

```bash
sudo bash deploy.sh
```

The script installs dependencies, builds the website/game with `VITE_PELLO_SERVER_URL=https://pello.xincreates.com`, writes a systemd service, and configures an nginx reverse proxy for `pello.xincreates.com`.

If this server also manages HTTPS certificates, run it with an email address:

```bash
sudo SSL_EMAIL=admin@example.com bash deploy.sh
```

The APK route first serves `public/download/Pello.apk`, then falls back to `android/app/build/outputs/apk/debug/app-debug.apk`. Replace `public/download/Pello.apk` when you generate a newer internal-test build.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP/WebSocket port. Default `3000`. |
| `HOST` | Bind host. Default `0.0.0.0`. |
| `PUBLIC_BASE_URL` | Public website/backend URL compiled into the web app. Default `https://pello.xincreates.com`. |
| `DOMAIN_NAME` | nginx server name. Default `pello.xincreates.com`. |
| `SSL_EMAIL` | Enables certbot HTTPS setup when provided. |
| `PELLO_COMPETITIVE_STORE` | Competitive account/match JSON store path. |
| `PELLO_APK_PATH` | APK file served by `/download/Pello.apk`. |
| `PELLO_APK_NAME` | Download filename. Default `Pello.apk`. |
| `VITE_PELLO_SERVER_URL` | Backend URL compiled into website/app. |
| `VITE_PELLO_SERVER_LOCKED` | Locks server editing in app when `true`. |

## Project Structure

```text
index.html                 Website landing page
online.html                Web game entry
src-site/                  Website CSS and small browser script
src-online/                Mobile/web game client
public/site/               Website images and screenshots
public/assets/ui/          Game UI sliced assets
server/server.js           Static site, API, WebSocket, APK download
server/src/competitive/    Coin economy and matchmaking services
server/tests/              Backend and game behavior tests
scripts/                   Android, asset, and server deployment helpers
docs/                      Design, development, deployment notes
android/                   Capacitor Android project
```

## Documentation

- [Development](docs/DEVELOPMENT.md)
- [Design](docs/DESIGN.md)
- [Changelog](docs/CHANGELOG.md)
- [App redesign plan](docs/APP_REDESIGN_PLAN.md)
