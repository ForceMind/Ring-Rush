import {
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    CENTER_X,
    MAX_DRAG_DISTANCE
} from '../src-online/constants.js';
import { Input } from '../src-online/input.js';
import { t } from '../src-online/i18n.js';
import { drawAppPanel, drawAppSprite } from './app-assets.js';

export class AppInput extends Input {
    isAppUiButtonHit(mouseX, mouseY) {
        const buttons = [
            this.game.surrenderBtn,
            this.game.restartBtn,
            this.game.exitBtn
        ].filter(Boolean);
        return buttons.some((btn) => {
            return mouseX >= btn.x
                && mouseX <= btn.x + btn.w
                && mouseY >= btn.y
                && mouseY <= btn.y + btn.h;
        });
    }

    handleMouseDown(e) {
        const rect = this.game.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
        const mouseY = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
        if (this.isAppUiButtonHit(mouseX, mouseY)) {
            this.isDragging = false;
            this.sliderDragging = false;
            this.currentPiece = null;
            return;
        }
        super.handleMouseDown(e);
    }

    drawAimingLine(ctx) {
        if (!this.isDragging || !this.currentPiece) return;

        const piece = this.currentPiece;
        const playerColor = this.game.getPlayerColor?.(piece.player || this.game.currentPlayer) || '#4a90d9';
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

        ctx.strokeStyle = power > 0.72 ? '#ff6f54' : playerColor;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        this.drawColoredArrow(ctx, endX, endY, angle, playerColor);
        ctx.restore();
    }

    drawColoredArrow(ctx, x, y, angle, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(255,255,255,0.88)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(-12, -13);
        ctx.lineTo(-7, 0);
        ctx.lineTo(-12, 13);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.restore();
    }

    drawColoredThumb(ctx, x, y, color) {
        const gradient = ctx.createRadialGradient(x - 7, y - 9, 2, x, y, 25);
        gradient.addColorStop(0, 'rgba(255,255,255,0.92)');
        gradient.addColorStop(0.28, color);
        gradient.addColorStop(1, 'rgba(20,54,66,0.34)');
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = gradient;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 23, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
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
        const piecePlayer = currentPiece.player || this.game.currentPlayer;
        const myColor = this.game.getPlayerColor(piecePlayer);

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

        this.drawColoredThumb(ctx, hx, ty, myColor);

        ctx.fillStyle = 'rgba(18,56,66,0.58)';
        ctx.font = '700 11px sans-serif';
        ctx.fillText(t('aimHint'), CANVAS_WIDTH / 2, ty + 44);
        ctx.restore();
    }
}
