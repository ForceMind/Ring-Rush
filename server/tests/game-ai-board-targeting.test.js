const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..', '..');

function readSource(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function stripImports(source) {
    return source.replace(/import\s*{[\s\S]*?}\s*from\s*['"][^'"]+['"];\s*/g, '');
}

function loadFrontendGameModules() {
    const context = {
        console,
        setTimeout,
        clearTimeout,
        Math
    };
    vm.createContext(context);

    const constantsSource = readSource('src-online/constants.js')
        .replace(/export const /g, 'const ')
        + `
Object.assign(globalThis, {
    VERSION,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    PIECE_RADIUS,
    RUNNER_RADIUS,
    PIECES_PER_PLAYER,
    BOARD_X,
    BOARD_Y,
    BOARD_REFERENCE_WIDTH,
    BOARD_REFERENCE_HEIGHT,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    BOARD_SCALE,
    LAUNCH_ZONE_WIDTH,
    LAUNCH_ZONE_HEIGHT,
    LAUNCH_ZONE_OFFSET,
    LAUNCH_LANE_WIDTH,
    LAUNCH_LANE_HALF_WIDTH,
    LAUNCH_LANE_GAP,
    TOP_LAUNCH_LANE_Y,
    BOTTOM_LAUNCH_LANE_Y,
    TOP_LAUNCH_Y,
    BOTTOM_LAUNCH_Y,
    FRICTION,
    RESTITUTION,
    MAX_SPEED,
    SPEED_THRESHOLD,
    LAUNCH_MULTIPLIER,
    MAX_DRAG_DISTANCE,
    POWER_RANDOM_RANGE,
    MIN_POWER_JITTER,
    MAX_POWER_JITTER,
    CLICK_RADIUS,
    RUNNER_SMOOTH_FACTOR,
    RUNNER_SNAP_THRESHOLD,
    WIN_THRESHOLD,
    SCORING_ZONES,
    CENTER_X,
    CENTER_Y,
    TRACK_X,
    TRACK_Y,
    TRACK_WIDTH,
    TRACK_HEIGHT,
    TRACK_STEPS,
    AI_DIFFICULTY
});
`;

    const boardSource = stripImports(readSource('src-online/board.js'))
        .replace('export class Board', 'class Board')
        + '\nglobalThis.Board = Board;\n';

    const aiSource = stripImports(readSource('src-online/ai.js'))
        .replace('export class AI', 'class AI')
        + '\nglobalThis.AI = AI;\n';

    vm.runInContext(constantsSource, context, { filename: 'constants.js' });
    vm.runInContext(boardSource, context, { filename: 'board.js' });
    vm.runInContext(aiSource, context, { filename: 'ai.js' });

    return context;
}

function createGame(context) {
    const game = {
        getPlayerColor(player) {
            return player === 'A' ? '#4A90E2' : '#D94A4A';
        },
        physics: {
            pieces: []
        }
    };
    game.board = new context.Board(game);
    return game;
}

function withRandom(context, values, fn) {
    const sequence = Array.isArray(values) ? values : [values];
    const originalRandom = context.Math.random;
    let index = 0;
    context.Math.random = () => sequence[Math.min(index++, sequence.length - 1)];
    try {
        return fn();
    } finally {
        context.Math.random = originalRandom;
    }
}

function testBoardScoresUseRealGeometry(context) {
    const game = createGame(context);
    const { CENTER_X, CENTER_Y, SCORING_ZONES } = context;

    assert.strictEqual(game.board.calculateScore({ x: CENTER_X, y: CENTER_Y, player: 'A' }), 5);
    assert.strictEqual(game.board.calculateScore({ x: CENTER_X, y: CENTER_Y - SCORING_ZONES.hexagon.radius + 10, player: 'A' }), 4);
    assert.strictEqual(game.board.calculateScore({ x: CENTER_X, y: CENTER_Y - SCORING_ZONES.pentagon.radius + 10, player: 'A' }), 3);
    assert.strictEqual(game.board.calculateScore({ x: CENTER_X + SCORING_ZONES.square.radius - 1, y: CENTER_Y, player: 'A' }), 2);
}

function testMobileBoardKeepsRealGameAspect(context) {
    const {
        BOARD_X,
        BOARD_Y,
        BOARD_REFERENCE_WIDTH,
        BOARD_REFERENCE_HEIGHT,
        BOARD_WIDTH,
        BOARD_HEIGHT,
        BOARD_SCALE,
        PIECE_RADIUS,
        SCORING_ZONES
    } = context;
    const aspect = BOARD_WIDTH / BOARD_HEIGHT;
    const referenceAspect = BOARD_REFERENCE_WIDTH / BOARD_REFERENCE_HEIGHT;
    const scoringSquareRatio = (SCORING_ZONES.square.radius * 2) / BOARD_WIDTH;
    const referenceSquareRatio = 320 / BOARD_REFERENCE_WIDTH;

    assert(Math.abs(aspect - referenceAspect) < 0.02, 'Mobile board should preserve the real game board aspect ratio');
    assert.strictEqual(BOARD_SCALE, BOARD_WIDTH / BOARD_REFERENCE_WIDTH);
    assert.strictEqual(PIECE_RADIUS, Math.round(18 * BOARD_SCALE), 'Piece radius should scale with the mobile board');
    assert(
        Math.abs(scoringSquareRatio - referenceSquareRatio) < 0.03,
        'Outer scoring square should keep the real board scoring ratio on mobile'
    );
    assert(BOARD_WIDTH >= SCORING_ZONES.square.radius * 2 + 36, 'Outer scoring square should fit horizontally inside the board');
    assert(BOARD_HEIGHT >= SCORING_ZONES.square.radius * 2 + 70, 'Outer scoring square should fit vertically inside the board');
    assert(BOARD_X >= 40 && BOARD_Y >= 240, 'Mobile board should leave room for the race track and top match UI');
}

function testLaunchLanesStayAttachedToRealBoard(context) {
    const {
        BOARD_Y,
        BOARD_HEIGHT,
        CENTER_X,
        PIECE_RADIUS,
        LAUNCH_ZONE_HEIGHT,
        LAUNCH_LANE_WIDTH,
        LAUNCH_LANE_HALF_WIDTH,
        TOP_LAUNCH_LANE_Y,
        BOTTOM_LAUNCH_LANE_Y,
        TOP_LAUNCH_Y,
        BOTTOM_LAUNCH_Y
    } = context;

    assert.strictEqual(LAUNCH_LANE_WIDTH, LAUNCH_LANE_HALF_WIDTH * 2);
    assert.strictEqual(TOP_LAUNCH_LANE_Y + LAUNCH_ZONE_HEIGHT / 2, TOP_LAUNCH_Y);
    assert.strictEqual(BOTTOM_LAUNCH_LANE_Y + LAUNCH_ZONE_HEIGHT / 2, BOTTOM_LAUNCH_Y);
    assert(TOP_LAUNCH_Y < BOARD_Y, 'Top launch piece should start above the board');
    assert(BOTTOM_LAUNCH_Y > BOARD_Y + BOARD_HEIGHT, 'Bottom launch piece should start below the board');
    assert(CENTER_X - LAUNCH_LANE_HALF_WIDTH + PIECE_RADIUS < CENTER_X);
    assert(CENTER_X + LAUNCH_LANE_HALF_WIDTH - PIECE_RADIUS > CENTER_X);
}

function testAiScansOuterSquareScoringZone(context) {
    const game = createGame(context);
    const ai = new context.AI('hard');
    const targets = ai.getScoringCandidateTargets(game, 'A');

    assert(targets.some((target) => target.score === 5), 'AI should target the center scoring zone');
    assert(targets.some((target) => target.score === 4), 'AI should target the hexagon scoring zone');
    assert(targets.some((target) => target.score === 3), 'AI should target the circle scoring zone');
    assert(targets.some((target) => target.score === 2), 'AI should target the outer square scoring zone');
}

function testAiLaunchChoosesScoringTarget(context) {
    const game = createGame(context);
    const ai = new context.AI('hard');
    const piece = {
        x: context.CENTER_X,
        y: context.BOARD_Y + context.BOARD_HEIGHT + context.LAUNCH_ZONE_HEIGHT,
        player: 'A',
        isLaunched: false,
        isDiscarded: false
    };
    game.physics.pieces = [piece];

    const launch = ai.calculateLaunch(piece, game);
    assert(launch.target, 'AI should return a target');
    assert(game.board.calculateScore({ ...launch.target, player: 'A' }) > 0, 'AI target should be inside a real scoring zone');
}

function testAiLaunchChoosesScoringTargetFromTopLane(context) {
    const game = createGame(context);
    const ai = new context.AI('hard');
    const piece = {
        x: context.CENTER_X,
        y: context.TOP_LAUNCH_Y,
        player: 'B',
        isLaunched: false,
        isDiscarded: false
    };
    game.physics.pieces = [piece];

    const launch = ai.calculateLaunch(piece, game);
    assert(launch.target, 'Top-lane AI should return a target');
    assert(game.board.calculateScore({ ...launch.target, player: 'B' }) > 0, 'Top-lane AI target should be inside a real scoring zone');
}

function getSettledCurrentPiece(ai, game, piece, launch) {
    const outcome = ai.simulateShot(piece, game, launch.vx, launch.vy);
    return outcome.pieces.find((candidate) => candidate.isCurrent);
}

function testAiHardLaunchActuallyLandsOnScoringTargetFromBottom(context) {
    const game = createGame(context);
    const ai = new context.AI('hard');
    const piece = {
        x: context.CENTER_X,
        y: context.BOTTOM_LAUNCH_Y,
        radius: context.PIECE_RADIUS,
        player: 'A',
        isLaunched: false,
        isDiscarded: false,
        isActive: false,
        hasEnteredBoard: false
    };
    game.physics.pieces = [piece];

    const launch = withRandom(context, [0.5, 0.5], () => ai.calculateLaunch(piece, game));
    const settled = getSettledCurrentPiece(ai, game, piece, launch);

    assert(settled.hasEnteredBoard, 'Hard AI shot from bottom should enter the board');
    assert(game.board.calculateScore(settled) >= 4, 'Hard AI shot from bottom should settle in a high-value scoring zone');
    assert(
        Math.hypot(settled.x - launch.target.x, settled.y - launch.target.y) < context.PIECE_RADIUS * 1.4,
        'Hard AI shot from bottom should settle close to its selected target'
    );
}

function testAiHardLaunchActuallyLandsOnScoringTargetFromTop(context) {
    const game = createGame(context);
    const ai = new context.AI('hard');
    const piece = {
        x: context.CENTER_X,
        y: context.TOP_LAUNCH_Y,
        radius: context.PIECE_RADIUS,
        player: 'B',
        isLaunched: false,
        isDiscarded: false,
        isActive: false,
        hasEnteredBoard: false
    };
    game.physics.pieces = [piece];

    const launch = withRandom(context, [0.5, 0.5], () => ai.calculateLaunch(piece, game));
    const settled = getSettledCurrentPiece(ai, game, piece, launch);

    assert(settled.hasEnteredBoard, 'Hard AI shot from top should enter the board');
    assert(game.board.calculateScore(settled) >= 4, 'Hard AI shot from top should settle in a high-value scoring zone');
    assert(
        Math.hypot(settled.x - launch.target.x, settled.y - launch.target.y) < context.PIECE_RADIUS * 1.4,
        'Hard AI shot from top should settle close to its selected target'
    );
}

function testAiDifficultyProfilesHaveDistinctAccuracy(context) {
    const makeLaunch = (difficulty) => {
        const game = createGame(context);
        const ai = new context.AI(difficulty);
        const piece = {
            x: context.CENTER_X,
            y: context.BOTTOM_LAUNCH_Y,
            player: 'A',
            isLaunched: false,
            isDiscarded: false
        };
        game.physics.pieces = [piece];

        return withRandom(context, 1, () => ai.calculateLaunch(piece, game));
    };

    const angleDelta = (launch) => {
        const base = Math.atan2(launch.target.y - context.BOTTOM_LAUNCH_Y, launch.target.x - context.CENTER_X);
        const actual = Math.atan2(launch.vy, launch.vx);
        return Math.abs(actual - base);
    };

    const easy = angleDelta(makeLaunch('easy'));
    const medium = angleDelta(makeLaunch('medium'));
    const hard = angleDelta(makeLaunch('hard'));

    assert(easy > medium, 'Easy AI should have more aim variance than medium AI');
    assert(medium > hard, 'Medium AI should have more aim variance than hard AI');
}

function testAiAvoidsFriendlyOccupiedScoringTarget(context) {
    const game = createGame(context);
    const ai = new context.AI('hard');
    const piece = {
        x: context.CENTER_X,
        y: context.BOTTOM_LAUNCH_Y,
        player: 'A',
        isLaunched: false,
        isDiscarded: false
    };
    const friend = {
        x: context.CENTER_X,
        y: context.CENTER_Y,
        player: 'A',
        isLaunched: true,
        isDiscarded: false
    };
    game.physics.pieces = [piece, friend];

    const launch = withRandom(context, 0.5, () => ai.calculateLaunch(piece, game));
    const distanceToFriend = Math.hypot(launch.target.x - friend.x, launch.target.y - friend.y);

    assert(distanceToFriend >= context.PIECE_RADIUS * 1.2, 'AI should not target a scoring cell already occupied by a friendly piece');
    assert(game.board.calculateScore({ ...launch.target, player: 'A' }) > 0, 'AI should still pick a valid scoring target');
}

function testAiCanKnockHighValueEnemy(context) {
    const game = createGame(context);
    const ai = new context.AI('hard');
    const piece = {
        x: context.CENTER_X,
        y: context.BOTTOM_LAUNCH_Y,
        player: 'A',
        isLaunched: false,
        isDiscarded: false
    };
    const enemy = {
        x: context.CENTER_X,
        y: context.CENTER_Y,
        player: 'B',
        isLaunched: true,
        isDiscarded: false
    };
    game.physics.pieces = [piece, enemy];

    const originalScore = game.board.calculateScore.bind(game.board);
    game.board.calculateScore = (target) => target === enemy ? 5 : 0;
    const launch = withRandom(context, 0, () => ai.calculateLaunch(piece, game));
    game.board.calculateScore = originalScore;

    assert.strictEqual(launch.tactic, 'knockout', 'AI should choose knockout when an enemy is the only high-value target');
    assert(Math.hypot(launch.target.x - enemy.x, launch.target.y - enemy.y) < 1, 'AI knockout target should be the high-value enemy');
}

function testAiKnockoutShotActuallyMovesHighValueEnemy(context) {
    const game = createGame(context);
    const ai = new context.AI('hard');
    const piece = {
        x: context.CENTER_X,
        y: context.BOTTOM_LAUNCH_Y,
        radius: context.PIECE_RADIUS,
        player: 'A',
        isLaunched: false,
        isDiscarded: false,
        isActive: false,
        hasEnteredBoard: false
    };
    const enemy = {
        x: context.CENTER_X,
        y: context.CENTER_Y,
        radius: context.PIECE_RADIUS,
        player: 'B',
        isLaunched: true,
        isDiscarded: false,
        isActive: false,
        hasEnteredBoard: true
    };
    game.physics.pieces = [piece, enemy];

    const originalScore = game.board.calculateScore.bind(game.board);
    game.board.calculateScore = (target) => target === enemy ? 5 : originalScore(target);
    const launch = withRandom(context, [0, 0.5, 0.5], () => ai.calculateLaunch(piece, game));
    game.board.calculateScore = originalScore;

    const outcome = ai.simulateShot(piece, game, launch.vx, launch.vy);
    const movedEnemy = outcome.pieces.find((candidate) => candidate.sourceIndex === 1);
    const enemyMovedDistance = Math.hypot(movedEnemy.x - enemy.x, movedEnemy.y - enemy.y);

    assert.strictEqual(launch.tactic, 'knockout', 'Hard AI should still choose a high-value knockout shot');
    assert(enemyMovedDistance > context.PIECE_RADIUS * 1.25, 'Hard AI knockout shot should physically move the high-value enemy');
    assert(originalScore(movedEnemy) < originalScore(enemy), 'Hard AI knockout should reduce the enemy scoring value');
}

const context = loadFrontendGameModules();
testBoardScoresUseRealGeometry(context);
testMobileBoardKeepsRealGameAspect(context);
testLaunchLanesStayAttachedToRealBoard(context);
testAiScansOuterSquareScoringZone(context);
testAiLaunchChoosesScoringTarget(context);
testAiLaunchChoosesScoringTargetFromTopLane(context);
testAiHardLaunchActuallyLandsOnScoringTargetFromBottom(context);
testAiHardLaunchActuallyLandsOnScoringTargetFromTop(context);
testAiDifficultyProfilesHaveDistinctAccuracy(context);
testAiAvoidsFriendlyOccupiedScoringTarget(context);
testAiCanKnockHighValueEnemy(context);
testAiKnockoutShotActuallyMovesHighValueEnemy(context);

console.log('game AI board targeting tests passed');
