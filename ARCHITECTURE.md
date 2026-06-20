# Architecture

Pello has one repository and four runtime surfaces:

- Website landing page.
- Web game client.
- Android app client.
- Token-protected admin page.
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
        |-- dist/app.html            Android app UI
        |-- dist/admin.html          User admin, exposed through random PELLO_ADMIN_PATH in production
        |-- /download/Pello.apk
        |-- /api/competitive/*
        |-- /api/admin/*
        |-- WebSocket room and match messages
```

## Frontend Entries

| Entry | Purpose |
| --- | --- |
| `index.html` | Website with intro, screenshots, static preview, APK download, and online play link. |
| `online.html` | Browser-oriented web game. |
| `app.html` | Android app game UI opened by Capacitor. |
| `admin.html` | Token-protected user admin page. |
| `src-site/` | Website-only CSS and browser script. |
| `src-admin/` | Admin-only CSS and browser script. |
| `src-online/` | Game client, matchmaking UI, Canvas game, AI, audio, input, network. |
| `src-app/` | Android-only app shell, app start screen, app HUD, app board skin, atlas loader. |
| `public/assets/app-ui/` | Android app PNG sprite atlas and manifest. |

Vite builds `index.html`, `online.html`, `app.html`, and `admin.html` into `dist`.
Vite also builds `admin.html` into `dist`; it is not linked from the public website. In production, `server/server.js` serves it only through `PELLO_ADMIN_PATH`, so fixed `/admin.html` is not exposed.

## Android

Capacitor packages the Vite `dist` output. `server.appStartPath` is set to `/app.html`, so the APK opens the dedicated app UI instead of the website or browser web game.

## Backend

`server/server.js` is intentionally a single Node process for the current internal-test phase:

- Serves static files from `dist` in production, with the admin page gated behind `PELLO_ADMIN_PATH`.
- Serves project files in development.
- Streams the debug APK from `PELLO_APK_PATH` or Android build output.
- Handles `/api/competitive/*`.
- Handles token-protected `/api/admin/*`.
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
