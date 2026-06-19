# Changelog

All notable changes are tracked here.

## [Unreleased]

### Added

- Added a public website at `/` with game introduction, rule summary, screenshots, live web preview, APK download, and online play link.
- Added website assets under `public/site`.
- Added `src-site/site.css` and `src-site/site.js` for the website surface.
- Added `/download/Pello.apk` server route for Android APK downloads, while keeping `/download/pello-debug.apk` as a legacy alias.
- Added repository APK artifact path `public/download/Pello.apk` for simple server pull-and-deploy testing.
- Added static MIME support for JSON, WebP, JPEG, and APK files.

### Changed

- Kept `online.html` as the web game entry and changed `index.html` into the public website.
- Configured Capacitor `server.appStartPath` to `/online.html` so the Android app still opens the game UI.
- Configured deployment defaults for `https://pello.xincreates.com`.
- Changed `deploy.sh` to Cloudflare Tunnel mode by default: preferred port `3003`, no default nginx setup, previous same-project Pello process cleanup, and one printed tunnel target port.
- Removed deployment and debug-build wording from the public website.
- Rewrote core documentation to describe the current website, backend, Android, deployment, economy, AI, and testing flow.

### Fixed

- Prevented `competitive_profile` wallet messages from being shown as unknown lobby messages.
- Clarified wallet loading state on the home screen instead of showing a permanent connecting label.
- Removed server URL controls from the in-app settings page.
- Hid vibration settings and vibration feedback on the web build while keeping them available in the Android app.
- Removed the duplicate version label next to the top title and moved settings access to the lower home screen.
- Prevented the new website entry from breaking Android startup.
- Clarified combined deployment: one Node service hosts website, web game, HTTP API, WebSocket backend, and APK download.

## [0.10.5] - 2026-06-10

### Fixed

- Tightened Hard Bot score-pressure logic so it locks the best high-score shot when trailing, in late turns, or when the opponent can win on the next shot.
- Prevented Hard Bot variety selection from intentionally dropping from available 5/4-point near-optimal shots to 3/2-point shots.
- Removed Hard Bot execution error; Hard difficulty now varies tactically only in safe positions rather than missing mechanically.

## [0.10.4] - 2026-06-10

### Changed

- Bot difficulty now combines search depth, near-optimal move selection, score-variety weighting, and execution error instead of only changing search density.
- Hard Bot keeps deterministic best-play behavior for critical shots, immediate wins, and comeback situations, but uses weighted near-optimal choices in ordinary positions.

## [0.10.3] - 2026-06-10

### Fixed

- Centered the dice-tie message vertically inside its red banner in both normal and isolated online source trees.

## [0.10.2] - 2026-06-10

### Changed

- Bot AI decision scoring predicts shot score, runner-position impact, immediate win opportunities, opponent counterplay risk, endgame value, and friendly-collision risk.

### Fixed

- Fixed the AI candidate loop crash caused by a malformed comment.
- Fixed Bot slider animation cancellation caused by checking a non-existent `game.state` field.
