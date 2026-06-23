const assert = require('assert');

async function loadFrontendGameModules() {
    const [constants, { Board }, { AI }] = await Promise.all([
        import('../../src-online/constants.js'),
        import('../../src-online/board.js'),
        import('../../src-online/ai.js')
    ]);
    return { constants, Board, AI };
}

function createGame(modules) {
    const game = {
        perspective: 'bottom',
        runnerPosition: 0,
        piecesLeftA: 10,
        piecesLeftB: 10,
        physics: { pieces: [] },
        getPlayerColor(player) {
            return player === 'A' ? '#4A90E2' : '#D94A4A';
        }
    };
    game.board = new modules.Board(game);
    return game;
}

function createPiece(constants, overrides = {}) {
    return {
        x: constants.CENTER_X,
        y: constants.BOTTOM_LAUNCH_Y,
        vx: 0,
        vy: 0,
        radius: constants.PIECE_RADIUS,
        player: 'A',
        isLaunched: false,
        isActive: false,
        isDiscarded: false,
        hasEnteredBoard: false,
        ...overrides
    };
}

function withRandom(value, fn) {
    const originalRandom = Math.random;
    Math.random = () => value;
    try {
        return fn();
    } finally {
        Math.random = originalRandom;
    }
}

function candidateFromLaunch(launch) {
    const speed = Math.hypot(launch.vx, launch.vy);
    return {
        angle: Math.atan2(launch.vy, launch.vx),
        speed,
        startX: launch.startX ?? launch.launchX,
        sliderValue: launch.sliderValue ?? 0.5,
        targetKind: launch.targetKind || 'test',
        targetPriority: launch.targetPriority || 0,
        bank: false
    };
}

function testBoardScoresUseRealGeometry(modules) {
    const game = createGame(modules);
    const { CENTER_X, CENTER_Y, SCORING_ZONES } = modules.constants;

    assert.strictEqual(game.board.calculateScore({ x: CENTER_X, y: CENTER_Y, player: 'A' }), 5);
    assert.strictEqual(game.board.calculateScore({ x: CENTER_X, y: CENTER_Y - SCORING_ZONES.hexagon.radius + 10, player: 'A' }), 4);
    assert.strictEqual(game.board.calculateScore({ x: CENTER_X, y: CENTER_Y - SCORING_ZONES.pentagon.radius + 10, player: 'A' }), 3);
    assert.strictEqual(game.board.calculateScore({ x: CENTER_X + SCORING_ZONES.square.radius - 1, y: CENTER_Y, player: 'A' }), 2);
}

function testMobileBoardKeepsRealGameAspect(modules) {
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
    } = modules.constants;
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

function testLaunchLanesStayAttachedToRealBoard(modules) {
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
    } = modules.constants;

    assert.strictEqual(LAUNCH_LANE_WIDTH, LAUNCH_LANE_HALF_WIDTH * 2);
    assert.strictEqual(TOP_LAUNCH_LANE_Y + LAUNCH_ZONE_HEIGHT / 2, TOP_LAUNCH_Y);
    assert.strictEqual(BOTTOM_LAUNCH_LANE_Y + LAUNCH_ZONE_HEIGHT / 2, BOTTOM_LAUNCH_Y);
    assert(TOP_LAUNCH_Y < BOARD_Y, 'Top launch piece should start above the board');
    assert(BOTTOM_LAUNCH_Y > BOARD_Y + BOARD_HEIGHT, 'Bottom launch piece should start below the board');
    assert(CENTER_X - LAUNCH_LANE_HALF_WIDTH + PIECE_RADIUS < CENTER_X);
    assert(CENTER_X + LAUNCH_LANE_HALF_WIDTH - PIECE_RADIUS > CENTER_X);
}

function testAiCollectsRealScoringAndPieceTargets(modules) {
    const game = createGame(modules);
    const ai = new modules.AI('hard');
    const piece = createPiece(modules.constants);
    const enemy = createPiece(modules.constants, {
        x: modules.constants.CENTER_X,
        y: modules.constants.CENTER_Y,
        player: 'B',
        isLaunched: true,
        hasEnteredBoard: true
    });
    const friend = createPiece(modules.constants, {
        x: modules.constants.CENTER_X + 45,
        y: modules.constants.CENTER_Y,
        player: 'A',
        isLaunched: true,
        hasEnteredBoard: true
    });
    game.physics.pieces = [piece, enemy, friend];

    const targets = ai.collectTargets(game, piece, ai.getSearchConfig());
    assert(targets.some((target) => target.kind === 'score' && target.priority === 5), 'AI should scan the center scoring zone');
    assert(targets.some((target) => target.kind === 'score' && target.priority === 4), 'AI should scan high-value scoring zones');
    assert(targets.some((target) => target.kind === 'score' && target.priority === 2), 'AI should scan the outer scoring zone');
    assert(targets.some((target) => target.kind === 'enemy'), 'AI should include enemy pieces as tactical targets');
    assert(targets.some((target) => target.kind === 'friend'), 'AI should know where friendly pieces are');
}

function testAiSearchesMultipleLaunchPositions(modules) {
    const game = createGame(modules);
    const ai = new modules.AI('hard');
    const piece = createPiece(modules.constants);
    game.physics.pieces = [piece];

    const starts = new Set(ai.buildCandidates(game, piece).map((candidate) => Math.round(candidate.startX)));
    assert(starts.size >= 9, 'Hard AI should search many launch positions instead of always firing from center');
}

async function testAiHardLaunchActuallyLandsOnScoringTargetFromBottom(modules) {
    const game = createGame(modules);
    const ai = new modules.AI('hard');
    const piece = createPiece(modules.constants);
    game.physics.pieces = [piece];

    const launch = await withRandom(0.5, () => ai.calculateLaunch(piece, game));
    assert(launch.validShot, 'Hard AI should choose a valid shot');
    assert(launch.predictedStop, 'Hard AI should expose a predicted final stop');
    assert(launch.predictedScore >= 4, `Hard bottom-lane AI should seek high score, got ${launch.predictedScore}`);
}

async function testAiHardLaunchActuallyLandsOnScoringTargetFromTop(modules) {
    const game = createGame(modules);
    const ai = new modules.AI('hard');
    const piece = createPiece(modules.constants, {
        y: modules.constants.TOP_LAUNCH_Y,
        player: 'B'
    });
    game.physics.pieces = [piece];

    const launch = await withRandom(0.5, () => ai.calculateLaunch(piece, game));
    assert(launch.validShot, 'Top-lane hard AI should choose a valid shot');
    assert(launch.predictedScore >= 4, `Top-lane hard AI should seek high score, got ${launch.predictedScore}`);
}

async function testAiPredictionMatchesRealPhysicsSimulation(modules) {
    const game = createGame(modules);
    const ai = new modules.AI('hard');
    const piece = createPiece(modules.constants);
    game.physics.pieces = [piece];

    const launch = await withRandom(0.5, () => ai.calculateLaunch(piece, game));
    const simulation = ai.simulateCandidate(piece, game, candidateFromLaunch(launch));

    assert(simulation?.simShooter, 'AI should be able to re-simulate its selected launch');
    assert(
        Math.hypot(simulation.simShooter.x - launch.predictedStop.x, simulation.simShooter.y - launch.predictedStop.y) < modules.constants.PIECE_RADIUS * 0.2,
        'Hard AI prediction should match the actual headless physics result'
    );
    assert.strictEqual(game.board.calculateScore(simulation.simShooter), launch.predictedScore, 'Predicted score should match the simulated final score');
}

function testDifficultyProfilesHaveDistinctAccuracy(modules) {
    const easy = new modules.AI('easy').getDecisionConfig();
    const medium = new modules.AI('medium').getDecisionConfig();
    const hard = new modules.AI('hard').getDecisionConfig();

    assert.strictEqual(hard.angleError, 0, 'Hard AI should not add random angle error after prediction');
    assert.strictEqual(hard.powerError, 0, 'Hard AI should not add random power error after prediction');
    assert(medium.angleError > hard.angleError, 'Medium AI should add a small angle error');
    assert(easy.angleError > medium.angleError, 'Easy AI should add more angle error than medium');
    assert(easy.powerError > medium.powerError && medium.powerError > hard.powerError, 'Difficulty should control launch power error');
}

async function testAiCanKnockHighValueEnemy(modules) {
    const game = createGame(modules);
    const ai = new modules.AI('hard');
    const piece = createPiece(modules.constants);
    const enemy = createPiece(modules.constants, {
        x: modules.constants.CENTER_X,
        y: modules.constants.CENTER_Y,
        player: 'B',
        isLaunched: true,
        hasEnteredBoard: true
    });
    game.physics.pieces = [piece, enemy];

    const beforeScore = game.board.calculateScore(enemy);
    const launch = await withRandom(0.5, () => ai.calculateLaunch(piece, game));
    const simulation = ai.simulateCandidate(piece, game, candidateFromLaunch(launch));
    const simulatedEnemy = simulation.simPieces.find((candidate) => candidate.originalRef === enemy);
    const moved = Math.hypot(simulatedEnemy.x - enemy.x, simulatedEnemy.y - enemy.y);
    const afterScore = game.board.calculateScore(simulatedEnemy);

    assert(beforeScore >= 4, 'Test setup should place the enemy in a high-value zone');
    assert(moved > modules.constants.PIECE_RADIUS * 0.5, 'Hard AI should be able to move a high-value enemy piece');
    assert(afterScore <= beforeScore, 'Knockout simulation should not improve the enemy score');
}

async function main() {
    const modules = await loadFrontendGameModules();
    testBoardScoresUseRealGeometry(modules);
    testMobileBoardKeepsRealGameAspect(modules);
    testLaunchLanesStayAttachedToRealBoard(modules);
    testAiCollectsRealScoringAndPieceTargets(modules);
    testAiSearchesMultipleLaunchPositions(modules);
    await testAiHardLaunchActuallyLandsOnScoringTargetFromBottom(modules);
    await testAiHardLaunchActuallyLandsOnScoringTargetFromTop(modules);
    await testAiPredictionMatchesRealPhysicsSimulation(modules);
    testDifficultyProfilesHaveDistinctAccuracy(modules);
    await testAiCanKnockHighValueEnemy(modules);
    console.log('game AI board targeting tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
