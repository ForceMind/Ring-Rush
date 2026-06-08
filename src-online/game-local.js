/**
 * Ring Rush - Local Game
 * 本地双人模式逻辑
 */
import { Game } from './game.js';

export class LocalGame extends Game {
    constructor(canvas) {
        super(canvas);
        this.gameMode = 'local';
    }

    init(difficulty) {
        this.isDestroyed = false;
        this.perspective = 'bottom';
        this.dice.startPhase();
        this.initPieces();
        this.input.init();
        this.gameLoop();
    }

    // 后续的单机视角反转等特有逻辑可以在此重写
}
