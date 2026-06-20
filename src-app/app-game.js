import { Game } from '../src-online/game.js';
import { BotGame } from '../src-online/game-bot.js';
import { LocalGame } from '../src-online/game-local.js';
import { AppBoard } from './app-board.js';
import { AppDiceManager } from './app-dice.js';
import { AppInput } from './app-input.js';
import { AppUI } from './app-ui.js';
import { drawAppPiece, loadAppAtlas, preloadAppAtlas } from './app-assets.js';

function installAppSkin(game) {
    game.appSkin = true;
    game.board = new AppBoard(game);
    game.dice = new AppDiceManager(game);
    game.input = new AppInput(game);
    game.ui = new AppUI(game);
    game.drawAppPiece = (ctx, piece, x, y, highlight) => drawAppPiece(ctx, piece, x, y, highlight);
    preloadAppAtlas();
    loadAppAtlas().then(() => {
        if (game && !game.isDestroyed) game.draw();
    }).catch(() => {});
}

export class AppGame extends Game {
    constructor(canvas) {
        super(canvas);
        installAppSkin(this);
    }
}

export class AppBotGame extends BotGame {
    constructor(canvas) {
        super(canvas);
        installAppSkin(this);
    }
}

export class AppLocalGame extends LocalGame {
    constructor(canvas) {
        super(canvas);
        installAppSkin(this);
    }
}
