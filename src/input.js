/**
 * @file input.js
 * @description 输入处理模块 - 处理鼠标和触摸交互，包括棋子拖拽发射和位置滑块
 * Ring Rush - 弹棋
 */

import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    BOARD_X,
    BOARD_WIDTH,
    LAUNCH_MULTIPLIER,
    MAX_SPEED,
    MAX_DRAG_DISTANCE,
    POWER_RANDOM_RANGE,
    PIECE_RADIUS,
    TRACK_STEPS
} from './constants.js';

/**
 * 输入处理类，管理鼠标/触摸事件与棋子交互
 */
export class Input {
    /**
     * @param {object} game - 游戏主实例引用
     */
    constructor(game) {
        this.game = game;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.mouse = { x: 0, y: 0 };
        this.currentPiece = null;

        // 发球位置滑块
        this.sliderDragging = false;
        this.sliderValue = 0.5; // 0=最左, 1=最右
        this.sliderHandleR = 12;

        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }

    cleanup() {
        this.game.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.game.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.game.canvas.removeEventListener('mouseup', this.handleMouseUp);
    }

    /**
     * 初始化事件监听器（鼠标 + 触摸）
     */
    getSliderMetrics() {
        const isLocalRed = this.game.gameMode === 'local' && this.game.currentPlayer === 'B';
        return {
            x: 50,
            y: isLocalRed ? 70 : CANVAS_HEIGHT - 70,
            w: CANVAS_WIDTH - 100
        };
    }

    init() {
        this.game.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.game.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.game.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.game.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.sliderDragging = false;
            this.currentPiece = null;
        });

        let touchStartX = 0, touchStartY = 0, touchHasMoved = false;

        // Touch support
        this.game.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchHasMoved = false;
            this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
        }, { passive: false });
        
        this.game.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            if (Math.abs(touch.clientX - touchStartX) > 5 || Math.abs(touch.clientY - touchStartY) > 5) {
                touchHasMoved = true;
            }
            this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }, { passive: false });
        
        this.game.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const touch = e.changedTouches ? e.changedTouches[0] : (e.touches ? e.touches[0] : null);
            if (touch) {
                this.handleMouseUp({ clientX: touch.clientX, clientY: touch.clientY });
                if (!touchHasMoved) {
                    this.game.handleClick({ clientX: touch.clientX, clientY: touch.clientY });
                }
            } else {
                this.handleMouseUp({});
            }
        }, { passive: false });
    }

    /**
     * 处理鼠标/触摸按下事件
     * @param {object} e - 事件对象（或包含 clientX/clientY 的模拟对象）
     */
    handleMouseDown(e) {
        if (this.game.gameOver || this.game.isAnimating || this.game.isBotTurn() || this.game.opponentTemporarilyDisconnected) return;
        
        if (this.game.dice.phase) {
            const rect = this.game.canvas.getBoundingClientRect();
            const sx = CANVAS_WIDTH / rect.width, sy = CANVAS_HEIGHT / rect.height;
            this.game.dice.handleClick((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
            return;
        }

        if (this.game.isOnlineGame() && !this.game.isMyTurn()) return;

        this.game.audio.resume();

        const rect = this.game.canvas.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        // 滑块点击
        const metrics = this.getSliderMetrics();
        const handleX = metrics.x + this.sliderValue * metrics.w;
        const handleY = metrics.y;
        if (Math.sqrt((mouseX - handleX) ** 2 + (mouseY - handleY) ** 2) < this.sliderHandleR + 8) {
            this.sliderDragging = true;
            return;
        }

        // 棋子点击（转换到游戏坐标检测）
        const piece = this.game.getCurrentPiece();
        if (!piece) return;
        const gmx = this.game.gx(mouseX), gmy = this.game.gy(mouseY);
        if (Math.sqrt((gmx - piece.x) ** 2 + (gmy - piece.y) ** 2) < 40) {
            this.isDragging = true;
            this.dragStart = { x: mouseX, y: mouseY };
            this.currentPiece = piece;
        }
    }

    /**
     * 处理鼠标/触摸移动事件
     * @param {object} e - 事件对象（或包含 clientX/clientY 的模拟对象）
     */
    handleMouseMove(e) {
        const rect = this.game.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
        const mouseY = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
        this.mouse = { x: mouseX, y: mouseY };

        if (this.sliderDragging) {
            const metrics = this.getSliderMetrics();
            let newValue = (mouseX - metrics.x) / metrics.w;
            // Mirror logic for top player: if dragging from their perspective, left/right is inverted physically.
            if (metrics.y === 70) {
                newValue = 1 - newValue;
            }
            this.sliderValue = Math.max(0, Math.min(1, newValue));
            this.applySliderToPiece();
            
            if (this.game.isOnlineGame()) {
                if (this.sliderSyncTimer) clearTimeout(this.sliderSyncTimer);
                this.sliderSyncTimer = setTimeout(() => {
                    this.game.network.send({
                        type: 'slider_sync',
                        value: this.sliderValue,
                        player: this.game.currentPlayer
                    });
                }, 2000);
            }
            return;
        }
    }

    /**
     * 将滑块值应用到当前棋子的X坐标
     * 映射到发球区宽度内 (CENTER_X ± 100)，滑杆更长从而实现精细调节
     */
    applySliderToPiece() {
        const piece = this.game.getCurrentPiece();
        if (!piece || piece.isLaunched) return;
        
        // 发球区范围限制
        const minX = (CANVAS_WIDTH / 2) - 100 + piece.radius;
        const maxX = (CANVAS_WIDTH / 2) + 100 - piece.radius;
        
        if (this.game.perspective === 'top') {
            piece.x = maxX - this.sliderValue * (maxX - minX);
        } else {
            piece.x = minX + this.sliderValue * (maxX - minX);
        }
    }

    /**
     * 处理鼠标/触摸松开事件 - 计算发射方向和力度
     * @param {object} e - 事件对象
     */
    handleMouseUp(e) {
        if (this.sliderDragging) {
            this.sliderDragging = false;
            return;
        }

        if (!this.isDragging || !this.currentPiece) {
            this.isDragging = false;
            return;
        }

        const dx = this.dragStart.x - this.mouse.x;
        const dy = this.dragStart.y - this.mouse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 25) {
            let speed = Math.min(distance * LAUNCH_MULTIPLIER, MAX_SPEED);
            speed *= 1 + (Math.random() * 2 - 1) * POWER_RANDOM_RANGE;
            speed = Math.min(speed, MAX_SPEED);

            // 屏幕方向（瞄准线用的同一个 dx/dy，所以视觉一致）
            // 如果视角是顶部（红方），游戏坐标系和屏幕坐标系是180度反转的，所以要取反
            if (this.game.perspective === 'top') {
                this.currentPiece.vx = -(dx / distance) * speed;
                this.currentPiece.vy = -(dy / distance) * speed;
            } else {
                this.currentPiece.vx = (dx / distance) * speed;
                this.currentPiece.vy = (dy / distance) * speed;
            }
            this.currentPiece.isLaunched = true;
            this.currentPiece.isActive = true;
            this.game.isAnimating = true;
            this.game.audio.play('launch');

            if (this.game.isOnlineGame()) {
                this.game.network.launchPiece({
                    x: this.currentPiece.x,
                    y: this.currentPiece.y,
                    vx: this.currentPiece.vx,
                    vy: this.currentPiece.vy,
                    player: this.currentPiece.player
                });
            }
        }

        this.isDragging = false;
        this.currentPiece = null;
    }

    /**
     * 绘制瞄准线和力度条
     * @param {CanvasRenderingContext2D} ctx
     */
    drawAimingLine(ctx) {
        if (!this.isDragging || !this.currentPiece) return;

        const piece = this.currentPiece;
        // 棋子在屏幕上的位置（可能被翻转）
        const px = this.game.perspective === 'top' ? this.game.tx(piece.x) : piece.x;
        const py = this.game.perspective === 'top' ? this.game.ty(piece.y) : piece.y;

        const dx = this.dragStart.x - this.mouse.x;
        const dy = this.dragStart.y - this.mouse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 5) return;

        const dirX = dx / distance;
        const dirY = dy / distance;
        const lineLength = Math.min(distance * 1.5, 200);
        const tipX = px + dirX * lineLength;
        const tipY = py + dirY * lineLength;

        const power = Math.min(distance / MAX_DRAG_DISTANCE, 1);
        const r = Math.floor(255 * power);
        const g = Math.floor(255 * (1 - power));
        const powerColor = `rgb(${r}, ${g}, 0)`;

        // 瞄准线（带发光）
        ctx.save();
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.setLineDash([8, 4]);
        ctx.moveTo(px, py);
        ctx.lineTo(tipX, tipY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 力度条
        const barWidth = 60;
        const barHeight = 6;
        const barX = px - barWidth / 2;
        const barY = py + piece.radius + 10;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, 3);
        ctx.fill();

        const powerGradient = ctx.createLinearGradient(barX, barY, barX + barWidth * power, barY);
        powerGradient.addColorStop(0, '#4CAF50');
        powerGradient.addColorStop(0.5, '#FF9800');
        powerGradient.addColorStop(1, '#f44336');
        ctx.fillStyle = powerGradient;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth * power, barHeight, 3);
        ctx.fill();

        // 目标点
        ctx.save();
        ctx.shadowColor = powerColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 8, 0, Math.PI * 2);
        ctx.strokeStyle = powerColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
        ctx.fillStyle = powerColor;
        ctx.fill();
        ctx.restore();
    }

    /**
     * 绘制发球位置滑块
     * @param {CanvasRenderingContext2D} ctx
     */
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
        const hr = this.sliderHandleR;

        // 标签
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        if (ty === 70) {
            ctx.translate(tx + tw / 2, ty + 15);
            ctx.rotate(Math.PI);
            ctx.fillText('发球位置', 0, 0);
        } else {
            ctx.fillText('发球位置', tx + tw / 2, ty - 8);
        }
        ctx.restore();

        // 轨道背景
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.roundRect(tx, ty - 3, tw, 6, 3);
        ctx.fill();

        const isBottom = this.game.perspective === 'bottom';
        const myColorRGB = isBottom ? '74, 144, 217' : '217, 74, 74';
        const myColorHex = isBottom ? '#4a90d9' : '#d94a4a';
        const myColorDrag = isBottom ? '#6ab0ff' : '#ff6b6b';

        // 已选范围
        const drawValue = ty === 70 ? 1 - this.sliderValue : this.sliderValue;
        
        ctx.fillStyle = this.game.currentPlayer === 'A' ? 'rgba(52, 152, 219, 0.5)' : 'rgba(231, 76, 60, 0.5)';
        ctx.beginPath();
        ctx.roundRect(tx, ty - 3, tw * drawValue, 6, 3);
        ctx.fill();

        // 绘制滑块把手
        const hx = tx + drawValue * tw;
        const hy = ty;
        const handleWidth = 24;
        const handleHeight = 32;

        ctx.save();
        ctx.shadowColor = myColorHex;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(hx - handleWidth / 2, ty - handleHeight / 2, handleWidth, handleHeight, 6);
        ctx.fillStyle = this.sliderDragging ? myColorDrag : myColorHex;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 绘制防滑纹理 (3条竖线)
        ctx.beginPath();
        ctx.moveTo(hx - 4, ty - 6);
        ctx.lineTo(hx - 4, ty + 6);
        ctx.moveTo(hx, ty - 6);
        ctx.lineTo(hx, ty + 6);
        ctx.moveTo(hx + 4, ty - 6);
        ctx.lineTo(hx + 4, ty + 6);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // 把手中心点
        ctx.beginPath();
        ctx.arc(hx, ty, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    }
}
