/**
 * Ring Rush - Bot Game
 * 人机对战模式逻辑
 */
import { LocalGame } from './game-local.js';
import { AI } from './ai.js';

export class BotGame extends LocalGame {
    constructor(canvas) {
        super(canvas);
        this.gameMode = 'bot';
        this.ai = null;
    }

    init(difficulty) {
        this.ai = new AI(difficulty);
        super.init(difficulty);
    }

    isBotTurn() {
        return this.currentPlayer === 'B';
    }

    postUpdate() {
        if (this.isBotTurn() && !this.isAnimating && !this.ai.isThinking) {
            this.ai.executeTurn(this);
        }
    }
}
