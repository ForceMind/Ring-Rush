/**
 * Ring Rush - AI
 * AI 对手逻辑 - 支持多难度等级的电脑玩家
 */

import { AI_DIFFICULTY, MAX_SPEED, CENTER_X, CENTER_Y } from './constants.js';

export class AI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.config = AI_DIFFICULTY[difficulty];
        this.isThinking = false;
        this.thinkTimer = null;
    }

    calculateLaunch(piece, board) {
        const targetX = CENTER_X;
        const targetY = CENTER_Y;
        const dx = targetX - piece.x;
        const dy = targetY - piece.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const baseAngle = Math.atan2(dy, dx);
        const angleError = (1 - this.config.accuracy) * Math.PI / 4;
        const actualAngle = baseAngle + (Math.random() * 2 - 1) * angleError;

        let basePower;
        if (distance < 150) basePower = 0.3 + Math.random() * 0.2;
        else if (distance < 300) basePower = 0.5 + Math.random() * 0.2;
        else basePower = 0.7 + Math.random() * 0.2;

        const powerError = (1 - this.config.powerControl) * 0.3;
        const actualPower = Math.max(0.2, Math.min(1, basePower + (Math.random() * 2 - 1) * powerError));
        const speed = MAX_SPEED * actualPower;

        return { vx: Math.cos(actualAngle) * speed, vy: Math.sin(actualAngle) * speed };
    }

    async executeTurn(game) {
        this.isThinking = true;
        await this.think();
        const piece = game.getCurrentPiece();
        if (!piece) return;

        const launch = this.calculateLaunch(piece, game.board);
        piece.vx = launch.vx;
        piece.vy = launch.vy;
        piece.isLaunched = true;
        piece.isActive = true;
        game.isAnimating = true;
        game.audio.play('launch');
        this.isThinking = false;
    }

    think() {
        return new Promise(resolve => {
            const jitter = Math.random() * 500 - 250;
            this.thinkTimer = setTimeout(resolve, this.config.thinkTime + jitter);
        });
    }

    cancel() {
        if (this.thinkTimer) clearTimeout(this.thinkTimer);
        this.thinkTimer = null;
        this.isThinking = false;
    }
}
