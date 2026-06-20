# Development

## Goal

Pello is being prepared for small Android internal testing. The product has three surfaces:

- Public website at `/`.
- Web game at `/online.html`.
- User admin page at local `/admin.html`; production uses the random path printed by deploy.
- Android app built with Capacitor, starting at `/online.html`.

The backend is a Node HTTP/WebSocket service. In production it serves the built website, the online game, the competitive API, WebSocket messages, and the APK download route.

## Required Tooling

- Node.js 18+.
- npm.
- JDK 21 for Android builds.
- Android SDK platform `android-36`.

The local Android script reads `JAVA_HOME` / `ANDROID_HOME`, or falls back to `.tools/jdk21` and `.tools/android-sdk`.

## Common Commands

```bash
npm run dev
npm run build
npm run test:game-ai
npm run test:competitive
npm run test:apk-size
```

```powershell
npm run android:build:debug:local
npm run app-server:write-env
npm run app-server:deploy:local
```

## Architecture

### Frontend

`index.html` is the public website. It imports `src-site/site.css` and `src-site/site.js`.

`online.html` is the game app. It imports `src-online/online-main.js`, which starts the online start screen and switches into real-player, AI, or local game modes.

`admin.html` is a token-protected management page. In production the server exposes it only through `PELLO_ADMIN_PATH`, a random path printed by deploy. It imports `src-admin/admin.js` and calls `/api/admin/*` with `X-Pello-Admin-Token`.

The game keeps a fixed logical canvas size of `450x960`. HiDPI rendering only changes the backing store; game coordinates and input mapping remain in logical coordinates.

### Android

`capacitor.config.json` uses:

```json
{
  "server": {
    "appStartPath": "/online.html"
  }
}
```

This prevents the APK from opening the website landing page.

### Backend

`server/server.js` owns:

- Static `dist` hosting in production.
- Static source hosting in development.
- `/api/competitive/*` HTTP API.
- `/api/admin/*` token-protected management API.
- WebSocket room and live match messages.
- `/download/Pello.apk` APK streaming.

Competitive account and match state lives in `server/src/competitive`.

## Deployment Flow

1. Pull the deployment branch on the server.

2. Run the one-step script:

```bash
sudo bash deploy.sh
```

The script defaults to `https://pello.xincreates.com` and preferred port `3003`. It builds the website/game/admin pages with the locked server URL, stops old Pello service/processes from this project, chooses one safe Node port, generates or reuses `server/data/admin-token.txt` and `server/data/admin-path.txt`, and installs a systemd service.

For Cloudflare Tunnel, point the tunnel to the printed local target, for example:

```bash
http://127.0.0.1:3003
```

If this server should use nginx and issue the HTTPS certificate itself:

```bash
sudo SETUP_NGINX=1 SSL_EMAIL=admin@example.com bash deploy.sh
```

The downloadable internal-test APK is expected at `public/download/Pello.apk`; the route falls back to the Android debug build output if that file is missing.

## Release Checklist

- `npm run test:game-ai`
- `npm run test:competitive`
- `npm run build`
- `npm run android:build:debug:local`
- Website loads `/`.
- Web game loads `/online.html`.
- `/api/competitive/health` returns `ok: true`.
- `/download/Pello.apk` downloads the expected APK.
- The printed random Admin URL accepts the printed admin token and can list users.
- Android app starts directly in the game UI.

## Known Boundaries

- Current APK route serves the debug build. Release signing and Play Store AAB are separate work.
- The default competitive store is a JSON file. Use a managed database before larger public traffic.
- Paid AI difficulty is server/matchmaking controlled; only local practice exposes manual difficulty.
