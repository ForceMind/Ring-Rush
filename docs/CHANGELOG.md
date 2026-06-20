# Changelog

All notable changes are tracked here.

## [Unreleased]

### Added

- Added a dedicated Android app entry at `/app.html`, backed by `src-app`.
- Added Android app PNG sprite atlas generation with `npm run app:ui-assets`.
- Added app UI atlas assets under `public/assets/app-ui` and app mockups under `design/app-ui/mockups`.
- Added `admin.html` and `/api/admin/*` for token-protected user management.
- Added deploy-generated random admin paths so production does not expose fixed `/admin.html`.
- Added admin actions to list users, inspect ledger/matches, add coins, set/reset wallet balance, reset user stats, and delete users.
- Added admin pagination, category filters, and conservative bulk deletion for users with no record.
- Added a public website at `/` with game introduction, rule summary, screenshots, static game preview, APK download, and online play link.
- Added website assets under `public/site`.
- Added `src-site/site.css` and `src-site/site.js` for the website surface.
- Added `/download/Pello.apk` server route for Android APK downloads.
- Added repository APK artifact path `public/download/Pello.apk` for simple server pull-and-deploy testing.
- Added static MIME support for JSON, WebP, JPEG, and APK files.
- Added physics-backed AI regression tests that verify real landing positions and high-value enemy knockouts, not only selected targets.
- Added clean public website screenshot artwork for home, AI difficulty, player turn, and game-over states.
- Added APK size validation to fail builds that contain nested APK files or exceed the internal-test size target.

### Changed

- Changed Capacitor startup from `/online.html` to `/app.html`.
- Redesigned the Android app home, AI difficulty, game HUD, board skin, player cards, slider, coin display, and result panels with atlas-backed raster UI.
- Updated app and website version to `0.12.0`.
- Redesigned the public website from a visual mockup into a gameplay-only sharing page, focused on drag shooting, collision positioning, AI practice, screenshots, online play, and APK download.
- Reworked practice AI decision-making to evaluate candidate shots with the real board physics before choosing a target.
- Reworked the app top-bar coin display into a round coin plus balance pill so it no longer stretches flat.
- Replaced the AI difficulty puck preview with an animated robot presentation and kept difficulty buttons inside the panel.
- Kept `online.html` as the web game entry and changed `index.html` into the public website.
- Kept `/online.html` as the browser web game while Android now uses the dedicated app UI entry.
- Configured deployment defaults for `https://pello.xincreates.com`.
- Changed `deploy.sh` to Cloudflare Tunnel mode by default: preferred port `3003`, no default nginx setup, previous same-project Pello process cleanup, and one printed tunnel target port.
- Removed economy, deployment, server, and debug-build wording from the public website.
- Rewrote core documentation to describe the current website, backend, Android, deployment, economy, AI, and testing flow.
- Replaced the website auto-running game preview with a static image link so the homepage no longer starts the full game client automatically.
- Changed Android debug packaging to exclude `public/download/Pello.apk` during Capacitor sync, then copy the newly built APK back to the download path.
- Changed deployment output to print the random Admin URL and persist it in `server/data/admin-path.txt`.

### Fixed

- Fixed an async start-screen lifecycle race when the app switches into a game before the server connection attempt resolves.
- Fixed common Chinese UI strings by overriding the broken legacy mojibake entries with normal UTF-8 text.
- Prevented `competitive_profile` wallet messages from being shown as unknown lobby messages.
- Clarified wallet loading state on the home screen instead of showing a permanent connecting label.
- Removed server URL controls from the in-app settings page.
- Hid vibration settings and vibration feedback on the web build while keeping them available in the Android app.
- Removed the duplicate version label next to the top title and moved settings access to the lower home screen.
- Prevented the new website entry from breaking Android startup.
- Clarified combined deployment: one Node service hosts website, web game, HTTP API, WebSocket backend, and APK download.
- Reduced oversized puck highlights and slowed score popups so scoring feedback stays readable.
- Reduced idle web CPU usage by pausing hidden-page game updates and lowering the start screen render loop.
- Reduced end-of-shot stutter by shortening settle pause, capping fixed physics catch-up steps, and limiting particle count.
- Reduced the active puck white outline and glow thickness in launch zones.
- Isolated competitive wallet updates by current account and match so stale settlement/profile messages cannot update the wrong user.
- Fixed competitive result submission to resolve winners from match participants instead of hardcoded slots.
- Removed user-facing internal-fee wording and duplicate waiting controls from the game UI.
- Reduced the rebuilt debug APK to 5.2 MB by removing nested APK packaging and unused PNG screenshots.

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
