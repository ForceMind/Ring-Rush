/**
 * Ring Rush - Piece
 * 棋子类 - 弹棋游戏中的棋子定义与绘制
 */

import { PIECE_RADIUS } from './constants.js';

export class Piece {
    constructor(game, x, y, player) {
        this.game = game;
        this.reset(x, y, player);
    }

    reset(x, y, player) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = PIECE_RADIUS;
        this.player = player;
        this.isLaunched = false;
        this.isActive = false;
        this.hasEnteredBoard = false;
        this.glowIntensity = 0;
        this.hitFlash = 0;
        this.launchFlash = 0;
    }

    draw(ctx, highlight = false, perspective = 'bottom') {
        this.drawAt(ctx, this.x, this.y, highlight, perspective);
    }

    drawAt(ctx, sx, sy, highlight = false, perspective = 'bottom') {
        if (this.game?.drawAppPiece?.(ctx, this, sx, sy, highlight, perspective)) {
            return;
        }

        const showColor = this.game.getPlayerColor(this.player);
        const showInner = this.game.getPlayerInnerColor(this.player);

        if (this.isActive || highlight) {
            this.glowIntensity = Math.min(1, this.glowIntensity + 0.1);
        } else {
            this.glowIntensity = Math.max(0, this.glowIntensity - 0.05);
        }

        if (this.glowIntensity > 0) {
            ctx.save();
            ctx.globalAlpha = 0.08 + this.glowIntensity * 0.08;
            ctx.shadowColor = showColor;
            ctx.shadowBlur = 7 * this.glowIntensity;
            ctx.beginPath();
            ctx.arc(sx, sy, this.radius + 2.5 * this.glowIntensity, 0, Math.PI * 2);
            ctx.fillStyle = showColor;
            ctx.fill();
            ctx.restore();
        }

        if (this.launchFlash > 0) {
            const alpha = this.launchFlash;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(sx, sy, this.radius + (1 - alpha) * 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            this.launchFlash = Math.max(0, this.launchFlash - 0.08);
        }

        ctx.save();
        ctx.shadowColor = 'rgba(20,54,66,0.24)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
        const outer = ctx.createRadialGradient(sx - 7, sy - 8, 3, sx, sy, this.radius + 4);
        outer.addColorStop(0, 'rgba(255,255,255,0.38)');
        outer.addColorStop(0.16, showColor);
        outer.addColorStop(0.62, showColor);
        outer.addColorStop(1, showInner);
        ctx.fillStyle = outer;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = highlight ? 'rgba(255,255,255,0.72)' : 'rgba(20,54,66,0.38)';
        ctx.lineWidth = highlight ? 2.2 : 1.6;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = showInner;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.32)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sx - this.radius * 0.36, sy - this.radius * 0.36, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.56)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.34)';
        ctx.fill();
        ctx.restore();

        if (this.hitFlash > 0) {
            ctx.save();
            ctx.globalAlpha = this.hitFlash * 0.75;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(sx, sy, this.radius + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            this.hitFlash = Math.max(0, this.hitFlash - 0.12);
        }
    }
}
