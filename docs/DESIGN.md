# Game Design

## Product Shape

Pello is a quick casual 1v1 flick-board game for mobile. It should feel light, readable, and competitive without becoming a complex simulation UI.

Primary modes:

- Online 1v1 coin match.
- Paid AI fallback when matchmaking has no human opponent.
- Local practice AI with Easy / Medium / Hard difficulty.
- Local 2P practice.

## Core Rules

1. Players roll dice to decide first turn.
2. Each player launches one piece per turn.
3. Pieces slide, collide, bounce, and settle.
4. A settled piece scores according to its final zone.
5. Score moves the race marker toward the opponent side.
6. A player wins by reaching the opponent finish line, timeout, surrender, or final piece comparison.

## Scoring Zones

The mobile board preserves the real board ratio. Logical canvas coordinates stay `450x960`.

| Zone | Shape | Score |
| --- | --- | --- |
| Center | Circle | 5 |
| Inner | Hexagon | 4 |
| Middle | Pentagon/circle area | 3 |
| Outer | Square | 2 |
| Outside | None | 0 |

## Economy

Default table:

- Entry fee: 12 coins per player.
- Pool: 24 coins.
- Winner payout: 20 coins.

The remaining pool difference is internal settlement data and must not be shown to players. UI should only show entry cost and winner reward.

## AI

Local practice exposes manual difficulty:

- Easy: larger aim and power variance.
- Medium: balanced target selection and execution variance.
- Hard: tighter execution, stronger target priority, still not perfectly deterministic.

Paid AI fallback does not expose manual difficulty. It should be selected by player record/server matchmaking so coin matches remain fair.

AI target priority:

1. Open scoring targets, with high-value zones preferred.
2. Knock high-value enemy pieces when scoring is blocked or tactically useful.
3. Avoid friendly occupied targets and blocked paths.
4. Use mobile-scaled board dimensions when computing shots.

## Mobile UI Principles

- Keep the real game board recognizable; do not redraw the board into a different game.
- Leave safe-area space for status bars and cutout cameras.
- Keep player cards, race track, surrender, slider, and turn text readable at phone width.
- The drag hint must live between the board and slider, not under cards.
- End dialogs must leave at least 24 px between the bottom button and the panel edge.

## Feedback Effects

Effects must clarify game state rather than hide the board.

- Launch: short ring pulse and vibration.
- Collision: sharp sparks and brief shake.
- Score: readable `+N` text with slower upward movement.
- Zone pulse: visible but low-opacity.
- Win: short sound/vibration and clean result dialog.

Background music is generated with Web Audio and starts after the first user interaction.

## Website Design

The website is not a marketing-only placeholder. It provides:

- Game explanation.
- APK download.
- Online play link.
- Real screenshots.
- Static game preview that links to `/online.html`.
- No deployment, backend, or internal economy wording on the public page.

## Admin Design

The admin page is an operations tool, not a public game surface:

- It is built from `admin.html`, served in production through the random `PELLO_ADMIN_PATH`, and requires `PELLO_ADMIN_TOKEN`.
- It shows user wallet, reserved coins, rating, record, queue state, recent ledger, and recent matches.
- Destructive actions require confirmation.
- It should stay dense, readable, and low-animation so it does not add avoidable CPU load.
