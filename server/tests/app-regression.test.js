const assert = require('assert');

function createFakeContext() {
    const calls = [];
    const ctx = new Proxy({ calls }, {
        get(target, prop) {
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
                return () => ({ addColorStop() {} });
            }
            if (prop === 'lineTo') {
                return (x, y) => calls.push({ type: 'lineTo', x, y });
            }
            if (!(prop in target)) target[prop] = () => {};
            return target[prop];
        },
        set(target, prop, value) {
            target[prop] = value;
            return true;
        }
    });
    return ctx;
}

async function testAppAimLineUsesSlingshotDirection() {
    globalThis.Image = class {
        set src(value) {
            this.complete = false;
            this.naturalWidth = 0;
            if (this.onerror) this.onerror(new Error(`blocked image load: ${value}`));
        }
    };

    const [{ AppInput }, constants] = await Promise.all([
        import('../../src-app/app-input.js'),
        import('../../src-online/constants.js')
    ]);

    const piece = {
        x: constants.CENTER_X,
        y: constants.BOTTOM_LAUNCH_Y,
        radius: constants.PIECE_RADIUS
    };
    const input = new AppInput({
        perspective: 'bottom',
        tx: (x) => x,
        ty: (y) => y
    });
    input.isDragging = true;
    input.currentPiece = piece;
    input.dragStart = { x: piece.x, y: piece.y };
    input.mouse = { x: piece.x, y: piece.y + 90 };

    const ctx = createFakeContext();
    input.drawAimingLine(ctx);
    const firstLine = ctx.calls.find((call) => call.type === 'lineTo');

    assert(firstLine, 'APP aiming line should draw a launch direction');
    assert(firstLine.y < piece.y, 'Dragging downward should aim upward, opposite the finger pull');
}

async function testPhysicsSweptCollisionPreventsTunneling() {
    const [{ Physics }, constants] = await Promise.all([
        import('../../src-online/physics.js'),
        import('../../src-online/constants.js')
    ]);

    const game = {
        perspective: 'bottom',
        tx: (x) => x,
        ty: (y) => y,
        ui: { addWallBounce() {} },
        audio: { play() {} },
        particles: { emitCollision() {} },
        triggerFeedback() {},
        getPlayerColor: () => '#ffffff'
    };
    const physics = new Physics(game);
    const moving = {
        x: constants.CENTER_X,
        y: constants.CENTER_Y + 62,
        vx: 0,
        vy: -42,
        radius: constants.PIECE_RADIUS,
        player: 'A',
        isLaunched: true,
        isActive: true,
        hasEnteredBoard: true
    };
    const target = {
        x: constants.CENTER_X,
        y: constants.CENTER_Y,
        vx: 0,
        vy: 0,
        radius: constants.PIECE_RADIUS,
        player: 'B',
        isLaunched: true,
        isActive: false,
        hasEnteredBoard: true
    };

    physics.addPiece(moving);
    physics.addPiece(target);
    physics.update();

    assert(target.isActive, 'Swept collision should activate the hit piece');
    assert(Math.abs(target.vy) > 0.1, 'Swept collision should transfer velocity instead of passing through');
}

async function testAiSimulationUsesSweptCollision() {
    const [{ AI }, constants] = await Promise.all([
        import('../../src-online/ai.js'),
        import('../../src-online/constants.js')
    ]);

    const ai = new AI('hard');
    const moving = {
        x: constants.CENTER_X,
        y: constants.CENTER_Y + 62,
        radius: constants.PIECE_RADIUS,
        player: 'A',
        isLaunched: false,
        isActive: false,
        hasEnteredBoard: true
    };
    const target = {
        x: constants.CENTER_X,
        y: constants.CENTER_Y,
        radius: constants.PIECE_RADIUS,
        player: 'B',
        isLaunched: true,
        isActive: false,
        hasEnteredBoard: true
    };
    const game = { physics: { pieces: [moving, target] } };
    const outcome = ai.simulateShot(moving, game, 0, -42);
    const simulatedTarget = outcome.pieces.find((piece) => piece.sourceIndex === 1);
    const targetMoved = Math.hypot(simulatedTarget.x - target.x, simulatedTarget.y - target.y);

    assert(targetMoved > constants.PIECE_RADIUS, 'AI simulation should model the same collision the real physics will apply');
}

async function main() {
    await testAppAimLineUsesSlingshotDirection();
    await testPhysicsSweptCollisionPreventsTunneling();
    await testAiSimulationUsesSweptCollision();
    console.log('app regression tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
