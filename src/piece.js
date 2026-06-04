/**
 * Ring Rush - Piece
 * 棋子类 - 弹棋游戏中的棋子定义与绘制
 */

import { PIECE_RADIUS } from './constants.js';

export class Piece {
    constructor(x, y, player) {
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
        this.color = player === 'A' ? '#4a90d9' : '#d94a4a';
        this.innerColor = player === 'A' ? '#3a7bc8' : '#c83a3a';
        this.glowIntensity = 0;
    }

    draw(ctx, highlight = false, perspective = 'bottom') {
        this.drawAt(ctx, this.x, this.y, highlight, perspective);
    }

    drawAt(ctx, sx, sy, highlight = false, perspective = 'bottom') {
        const showColor = this.color;
        const showInner = this.innerColor;

        if (this.isActive || highlight) {
            this.glowIntensity = Math.min(1, this.glowIntensity + 0.1);
        } else {
            this.glowIntensity = Math.max(0, this.glowIntensity - 0.05);
        }

        if (this.glowIntensity > 0) {
            ctx.save(); ctx.shadowColor = showColor; ctx.shadowBlur = 15 * this.glowIntensity;
            ctx.beginPath(); ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = showColor; ctx.fill(); ctx.restore();
        }

        ctx.beginPath(); ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = showColor; ctx.fill();
        ctx.strokeStyle = highlight ? '#fff' : 'rgba(0,0,0,0.4)';
        ctx.lineWidth = highlight ? 3 : 2; ctx.stroke();

        ctx.beginPath(); ctx.arc(sx, sy, this.radius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = showInner; ctx.fill();

        ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
    }
}
