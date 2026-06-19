# Architecture

Pello has one repository and three runtime surfaces:

- Website landing page.
- Web/Android game client.
- Node backend for static hosting, competitive API, and WebSocket matches.

## Request Flow

```text
Browser / Android WebView
        |
        | HTTP
        v
Node server/server.js
        |
        |-- dist/index.html          Website
        |-- dist/online.html         Web game
        |-- /download/pello-debug.apk
        |-- /api/competitive/*
        |-- WebSocket room and match messages
```

## Frontend Entries

| Entry | Purpose |
| --- | --- |
| `index.html` | Website with intro, screenshots, live preview, APK download, and online play link. |
| `online.html` | Actual game app. |
| `src-site/` | Website-only CSS and browser script. |
| `src-online/` | Game client, matchmaking UI, Canvas game, AI, audio, input, network. |

Vite builds both `index.html` and `online.html` into `dist`.

## Android

Capacitor packages the Vite `dist` output. `server.appStartPath` is set to `/online.html`, so the APK opens the game instead of the website.

## Backend

`server/server.js` is intentionally a single Node process for the current internal-test phase:

- Serves static files from `dist` in production.
- Serves project files in development.
- Streams the debug APK from `PELLO_APK_PATH` or Android build output.
- Handles `/api/competitive/*`.
- Owns the WebSocket server.

`server/src/competitive` contains account, wallet, ledger, matchmaking, AI fallback, and settlement services.

## Data

The current store is JSON-file based and configured with `PELLO_COMPETITIVE_STORE`. This is acceptable for internal testing. A database-backed store should replace it before larger public traffic.

## Build Outputs

```text
dist/                                           Website and web game
android/app/build/outputs/apk/debug/app-debug.apk  Android debug APK
```

## Deployment Unit

Deploy the repository to a server, run `npm run build`, then start `node server/server.js` with `NODE_ENV=production`. A reverse proxy should terminate HTTPS and pass WebSocket upgrades to the same Node port.
