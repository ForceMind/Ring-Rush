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
    const [{ Physics }, constants] = await Promise.all([
        import('../../src-online/physics.js'),
        import('../../src-online/constants.js')
    ]);

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
    const pieces = [moving, target];
    Physics.simulateStep(pieces);
    const targetMoved = Math.hypot(target.x - constants.CENTER_X, target.y - constants.CENTER_Y);

    assert(targetMoved > constants.PIECE_RADIUS, 'AI simulation should model the same collision the real physics will apply');
}

async function testAppPracticeMediumButtonStartsMediumAi() {
    const { AppStartScreen } = await import('../../src-app/app-startscreen.js');
    let started = null;
    const screen = Object.create(AppStartScreen.prototype);
    screen.canvas = {
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 450, height: 960 };
        },
        removeEventListener() {}
    };
    screen.buttons = [{ x: 66, y: 512, w: 318, h: 56, id: 'practice_ai_medium', disabled: false }];
    screen.settings = { audioEnabled: true, musicEnabled: true, vibrationEnabled: true };
    screen.cleanup = function cleanup() {
        this.cleaned = true;
    };
    screen.onStart = (mode, payload) => {
        started = { mode, payload };
    };

    await screen.handleClick({ clientX: 225, clientY: 540 });

    assert.strictEqual(screen.cleaned, true, 'Practice AI click should clean up the start screen');
    assert.deepStrictEqual(started, {
        mode: 'practice_ai',
        payload: { difficulty: 'medium' }
    }, 'Medium practice AI button should start a medium AI game');
}

async function main() {
    await testAppAimLineUsesSlingshotDirection();
    await testPhysicsSweptCollisionPreventsTunneling();
    await testAiSimulationUsesSweptCollision();
    await testAppPracticeMediumButtonStartsMediumAi();
    console.log('app regression tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
