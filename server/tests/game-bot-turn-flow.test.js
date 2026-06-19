const assert = require('assert');

let fakeNow = 1000000;
const RealDate = Date;

global.Date = class extends RealDate {
    constructor(...args) {
        return args.length ? new RealDate(...args) : new RealDate(fakeNow);
    }

    static now() {
        return fakeNow;
    }

    static parse = RealDate.parse;
    static UTC = RealDate.UTC;
};

Object.defineProperty(globalThis, 'navigator', {
    value: {
        vibrate() {},
        languages: ['zh-CN'],
        language: 'zh-CN'
    },
    configurable: true
});

globalThis.window = {};
globalThis.document = {
    getElementById() {
        return null;
    },
    createElement() {
        return {
            style: {},
            appendChild() {},
            remove() {},
            addEventListener() {},
            removeEventListener() {},
            classList: { add() {}, remove() {} }
        };
    },
    body: { appendChild() {} }
};
globalThis.requestAnimationFrame = () => 0;
globalThis.performance = { now: () => fakeNow };

function createFakeCanvas() {
    const fakeCtx = new Proxy({}, {
        get(target, prop) {
            if (prop === 'canvas') return { width: 450, height: 960 };
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
                return () => ({ addColorStop() {} });
            }
            if (!(prop in target)) target[prop] = () => {};
            return target[prop];
        },
        set(target, prop, value) {
            target[prop] = value;
            return true;
        }
    });

    return {
        getContext() {
            return fakeCtx;
        },
        addEventListener() {},
        removeEventListener() {},
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 450, height: 960 };
        }
    };
}

async function main() {
    Math.random = () => 0.5;

    const [{ BotGame }, { AI }] = await Promise.all([
        import('../../src-online/game-bot.js'),
        import('../../src-online/ai.js')
    ]);

    const game = new BotGame(createFakeCanvas());
    game.audio.play = () => {};
    game.audio.resume = () => {};
    game.ai = new AI('medium');
    game.gameMode = 'bot';
    game.perspective = 'bottom';
    game.dice.results = { first: 'B', a: 3, b: 5 };
    game.dice.phase = false;
    game.initPieces();
    game.currentPlayer = 'B';
    game.turnStartTime = fakeNow;

    const botPiece = game.getCurrentPiece();
    const launch = game.ai.calculateLaunch(botPiece, game);
    botPiece.vx = launch.vx;
    botPiece.vy = launch.vy;
    botPiece.isLaunched = true;
    botPiece.isActive = true;
    game.isAnimating = true;

    for (let frame = 0; frame < 1000 && game.currentPlayer !== 'A'; frame++) {
        fakeNow += 1000 / 60;
        game.update();
    }

    assert.strictEqual(game.currentPlayer, 'A', 'Bot turn should settle and switch back to the player');
    assert.strictEqual(game.isAnimating, false, 'Bot turn should not leave the game in an animating state');
    assert.strictEqual(game.piecesLeftB, 9, 'Bot turn should consume exactly one bot piece');
    assert.strictEqual(game.getPlayerColor('B'), '#4a90d9', 'Bot remains blue when it won the opening dice roll');
    assert.strictEqual(game.getPlayerColor('A'), '#d94a4a', 'Player remains red when going second after bot wins dice');

    console.log('game bot turn flow tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
