import {
    CANVAS_WIDTH,
    CENTER_X,
    MAX_DRAG_DISTANCE
} from '../src-online/constants.js';
import { Input } from '../src-online/input.js';
import { t } from '../src-online/i18n.js';
import { drawAppPanel, drawAppSprite } from './app-assets.js';

export class AppInput extends Input {
    drawAimingLine(ctx) {
        if (!this.isDragging || !this.currentPiece) return;

        const piece = this.currentPiece;
        const px = this.game.perspective === 'top' ? this.game.tx(piece.x) : piece.x;
        const py = this.game.perspective === 'top' ? this.game.ty(piece.y) : piece.y;
        const dx = this.dragStart.x - this.mouse.x;
        const dy = this.dragStart.y - this.mouse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 5) return;

        const dist = Math.min(distance, MAX_DRAG_DISTANCE);
        const dirX = dx / distance;
        const dirY = dy / distance;
        const angle = Math.atan2(dirY, dirX);
        const endX = px + dirX * dist;
        const endY = py + dirY * dist;
        const power = dist / MAX_DRAG_DISTANCE;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.86)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.strokeStyle = power > 0.72 ? '#ff6f54' : '#26b7ff';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        drawAppSprite(ctx, 'aimArrow', endX - 20, endY - 20, 40, 40, { rotation: angle });
        ctx.restore();
    }

    drawSlider(ctx) {
        if (this.game.gameOver || this.game.isAnimating) return;
        if (this.game.isBotTurn && this.game.isBotTurn()) return;
        if (this.game.isOnlineGame && this.game.isOnlineGame() && !this.game.isMyTurn()) return;
        const currentPiece = this.game.getCurrentPiece();
        if (!currentPiece || currentPiece.isLaunched) return;

        const metrics = this.getSliderMetrics();
        const tx = metrics.x;
        const ty = metrics.y;
        const tw = metrics.w;
        const hx = tx + this.sliderValue * tw;
        const myColor = this.game.getPlayerColor(this.game.currentPlayer);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 12px sans-serif';
        ctx.fillStyle = 'rgba(18,56,66,0.72)';
        ctx.fillText(t('launchPosition'), CENTER_X, ty - 28);

        if (!drawAppPanel(ctx, 'sliderTrack', tx - 10, ty - 16, tw + 20, 32)) {
            ctx.fillStyle = 'rgba(255,255,255,0.78)';
            ctx.beginPath();
            ctx.roundRect(tx - 10, ty - 16, tw + 20, 32, 16);
            ctx.fill();
        }

        ctx.fillStyle = myColor;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.roundRect(tx, ty - 5, Math.max(4, tw * this.sliderValue), 10, 5);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (!drawAppSprite(ctx, 'sliderThumb', hx - 28, ty - 28, 56, 56)) {
            ctx.fillStyle = myColor;
            ctx.beginPath();
            ctx.arc(hx, ty, 18, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(18,56,66,0.58)';
        ctx.font = '700 11px sans-serif';
        ctx.fillText(t('aimHint'), CANVAS_WIDTH / 2, ty + 44);
        ctx.restore();
    }
}
