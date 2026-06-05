/**
 * Ring Rush - Dice Manager
 * 游戏开局掷骰子阶段管理器
 */

import { CENTER_X } from './constants.js';

export class DiceManager {
    constructor(game) {
        this.game = game;
        
        this.phase = false;
        this.rolling = false;
        this.opponentRolling = false;
        this.results = null;
        this.tieResult = false;
        
        this.val = null;
        this.opVal = null;
        this.targetVal = null;
        this.opTargetVal = null;
        
        this.rollAnimEndTime = 0;
        this.opRollAnimEndTime = 0;
        this.countdownEndTime = 0;
        this.btn = null;
    }

    startPhase() {
        this.phase = true;
        this.rolling = false;
        this.opponentRolling = false;
        this.results = null;
        this.btn = null;
        this.countdownEndTime = Date.now() + 5000;
        this.rollAnimEndTime = 0;
        this.opRollAnimEndTime = 0;
        this.val = null;
        this.opVal = null;
        this.targetVal = null;
        this.opTargetVal = null;
        this.tieResult = false;
        
        if (this.game.chat) {
            this.game.chat.setVisibility(false);
        }
    }

    update() {
        if (!this.phase) return;

        const now = Date.now();
        if (this.game.isOnlineGame()) {
            if (!this.rolling && !this.opponentRolling && !this.results && !this.tieResult && now > this.countdownEndTime) {
                this.handleClick(0, 0, true);
            }
        } else if (this.game.gameMode === 'ai' || this.game.gameMode === 'local') {
            if (!this.rolling && !this.results && !this.tieResult && now > this.countdownEndTime) {
                this.handleClick(0, 0, true);
            }
        }

        if (this.rolling) {
            this.val = Math.floor(Math.random() * 6) + 1;
            if (now >= this.rollAnimEndTime) {
                this.rolling = false;
                if (this.targetVal !== null) this.val = this.targetVal;
            }
        }
        if (this.opponentRolling) {
            this.opVal = Math.floor(Math.random() * 6) + 1;
            if (now >= this.opRollAnimEndTime) {
                this.opponentRolling = false;
                if (this.opTargetVal !== null) this.opVal = this.opTargetVal;
            }
        }
    }

    draw(ctx) {
        if (!this.phase) return;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('开局掷骰子决定先手', CENTER_X, 200);

        let myVal, opVal, myColor = '#fff', opColor = '#fff';
        let myLabel = this.game.gameMode === 'online' ? '你' : '蓝方 (A)';
        let opLabel = this.game.gameMode === 'online' ? '对手' : '红方 (B)';
        
        if (this.results) {
            const myOriginalId = this.game.gameMode === 'online' ? this.game.network.playerIndex : (this.game.perspective === 'bottom' ? 'A' : 'B');
            myVal = this.game.perspective === 'bottom' ? this.results.a : this.results.b;
            opVal = this.game.perspective === 'bottom' ? this.results.b : this.results.a;
            
            const myFirst = this.results.first === myOriginalId;
            myColor = myFirst ? '#4a90d9' : '#d94a4a';
            opColor = myFirst ? '#d94a4a' : '#4a90d9';
            myLabel = myFirst ? '你先手 (蓝)' : '你后手 (红)';
            opLabel = myFirst ? '对手后手 (红)' : '对手先手 (蓝)';
            
            if (this.game.gameMode !== 'online') {
                myLabel = myFirst ? '蓝方先手' : '红方先手';
                opLabel = myFirst ? '红方后手' : '蓝方后手';
            }
        } else {
            myVal = this.val;
            opVal = this.opVal;
        }

        this.drawDie(ctx, CENTER_X - 120, 320, myVal, myColor, myLabel);
        this.drawDie(ctx, CENTER_X + 120, 320, opVal, opColor, opLabel);

        // VS
        ctx.fillStyle = '#f0e68c'; ctx.font = 'bold 28px sans-serif';
        ctx.fillText('VS', CENTER_X, 340);

        // 结果或按钮
        if (this.results) {
            const myOriginalId = this.game.gameMode === 'online' ? this.game.network.playerIndex : (this.game.perspective === 'bottom' ? 'A' : 'B');
            const first = this.results.first;
            let firstLabel = first === myOriginalId ? '你先手！' : '对手先手';
            if (this.game.gameMode !== 'online') {
                firstLabel = first === 'A' ? '蓝方先手！' : '红方先手！';
            }
            ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 36px sans-serif';
            ctx.fillText(firstLabel, CENTER_X, 420);
        } else if (this.tieResult) {
            ctx.fillStyle = '#f44336'; ctx.font = 'bold 36px sans-serif';
            ctx.fillText('平局，重掷！', CENTER_X, 420);
        } else {
            if (!this.rolling) {
                ctx.fillStyle = '#ddd'; ctx.font = '16px sans-serif';
                const left = Math.ceil(Math.max(0, this.countdownEndTime - Date.now()) / 1000);
                ctx.fillText(`${left}秒后自动摇号...`, CENTER_X, 580);
                
                const bx = CENTER_X - 80, by = 500, bw = 160, bh = 50;
                const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
                grad.addColorStop(0, '#4CAF50'); grad.addColorStop(1, '#388E3C');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
                ctx.strokeStyle = '#66BB6A'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
                ctx.fillText('掷骰子', CENTER_X, by + 28);
                this.btn = { x: bx, y: by, w: bw, h: bh };

                if (this.opponentRolling) {
                    ctx.fillStyle = '#ff9800'; ctx.font = 'bold 20px sans-serif';
                    ctx.fillText('对手已掷，请你掷骰子', CENTER_X, 450);
                }
            } else {
                this.btn = null;
                if (!this.opponentRolling && this.game.gameMode === 'online') {
                    ctx.fillStyle = '#aaa'; ctx.font = '20px sans-serif';
                    ctx.fillText('等待对手掷骰子...', CENTER_X, 500);
                } else {
                    ctx.fillStyle = '#aaa'; ctx.font = '20px sans-serif';
                    ctx.fillText('双方掷骰子中...', CENTER_X, 500);
                }
            }
        }
    }

    drawDie(ctx, x, y, value, color, label) {
        const s = 80;
        // 标签
        ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y - s / 2 - 20);

        // 骰子底
        const grad = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
        grad.addColorStop(0, '#2a2a4a'); grad.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = grad; ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(x - s / 2, y - s / 2, s, s, 12); ctx.fill(); ctx.stroke();

        if (value === null) {
            ctx.fillStyle = '#fff'; ctx.font = 'bold 40px sans-serif';
            ctx.fillText('?', x, y);
            return;
        }
        
        // 点
        ctx.fillStyle = '#fff';
        const d = 8, p = s * 0.3;
        const dots = {
            1: [[0, 0]], 2: [[-p, -p], [p, p]], 3: [[-p, -p], [0, 0], [p, p]],
            4: [[-p, -p], [p, -p], [-p, p], [p, p]],
            5: [[-p, -p], [p, -p], [0, 0], [-p, p], [p, p]],
            6: [[-p, -p], [p, -p], [-p, 0], [p, 0], [-p, p], [p, p]]
        };
        (dots[value] || []).forEach(([dx, dy]) => {
            ctx.beginPath(); ctx.arc(x + dx, y + dy, d, 0, Math.PI * 2); ctx.fill();
        });
    }

    handleClick(mx, my, force = false) {
        if (!this.phase || this.rolling || this.results || this.tieResult) return false;
        const btn = this.btn;
        if (force || (btn && mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h)) {
            this.rolling = true;
            this.rollAnimEndTime = Date.now() + 2000;
            if (this.game.gameMode !== 'online') {
                this.opponentRolling = true;
                this.opRollAnimEndTime = Date.now() + 2000;
            }
            if (this.game.gameMode === 'online') {
                this.game.network.send({ type: 'dice_roll' });
            } else {
                setTimeout(() => this.rollLocalDice(), 0);
            }
            return true;
        }
        return false;
    }

    rollLocalDice() {
        this.rolling = true;
        this.rollAnimEndTime = Date.now() + 3000;
        if (this.game.gameMode !== 'online') {
            this.opponentRolling = true;
            this.opRollAnimEndTime = Date.now() + 3000;
        }
        
        setTimeout(() => {
            const a = Math.floor(Math.random() * 6) + 1;
            const b = Math.floor(Math.random() * 6) + 1;
            
            if (a === b) {
                this.tieResult = true;
                this.rolling = false;
                this.opponentRolling = false;
                this.val = a;
                this.opVal = b;
                setTimeout(() => {
                    this.tieResult = false;
                    this.startPhase();
                    this.rollLocalDice();
                }, 2000);
            } else {
                const first = a > b ? 'A' : 'B';
                this.applyResults({ a, b, first });
            }
        }, 3000);
    }

    applyResults(results) {
        const now = Date.now();
        const myLeft = Math.max(0, (this.rollAnimEndTime || 0) - now);
        const opLeft = Math.max(0, (this.opRollAnimEndTime || 0) - now);
        const timeLeft = Math.max(myLeft, opLeft);

        setTimeout(() => {
            this.results = results;
            this.rolling = false;
            this.opponentRolling = false;
            
            if (this.game.gameMode === 'online') {
                setTimeout(() => {
                    this.game.network.send({ type: 'dice_ack' });
                }, 2000);
            } else {
                setTimeout(() => {
                    this.phase = false;
                    this.game.currentPlayer = 'A'; // 先手总是A(蓝色)
                    this.game.roundNumber = 1;
                    this.game.turnStartTime = Date.now();
                    this.game.turnTimeLeft = 60;
                    this.game.input.sliderValue = 0.5;
                    this.game.input.applySliderToPiece();
                    if (this.game.chat) this.game.chat.setVisibility(true);
                }, 2000);
            }
        }, timeLeft);
    }
}
