/**
 * Ring Rush - Dice Manager
 * 游戏开局掷骰子阶段管理器
 */

import { CENTER_X, CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

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
        this.hasRolled = false;
        
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
        } else if (this.game.gameMode === 'bot') {
            if (!this.rolling && !this.results && !this.tieResult && now > this.countdownEndTime) {
                this.handleClick(0, 0, true);
            }
        } else if (this.game.gameMode === 'local') {
            if (!this.localRolledA && !this.localRolledB && !this.results && !this.tieResult && now > this.countdownEndTime) {
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

        let myVal = this.val, opVal = this.opVal;
        let myColor = '#888';
        let opColor = '#888';
        let myLabel = '你';
        let opLabel = '对手';
        
        if (this.game.gameMode === 'local') {
            myLabel = '玩家 1';
            opLabel = '玩家 2';
        } else if (this.game.gameMode === 'bot') {
            myLabel = '你';
            opLabel = 'Bot';
        }

        if (this.results) {
            let myFirst;
            
            if (this.game.gameMode === 'online') {
                myFirst = this.results.first === this.game.network.playerIndex;
                myVal = this.game.network.playerIndex === 'A' ? this.results.a : this.results.b;
                opVal = this.game.network.playerIndex === 'A' ? this.results.b : this.results.a;
            } else {
                myFirst = this.results.first === (this.game.perspective === 'bottom' ? 'A' : 'B');
                myVal = this.game.perspective === 'bottom' ? this.results.a : this.results.b;
                opVal = this.game.perspective === 'bottom' ? this.results.b : this.results.a;
            }
            
            myColor = myFirst ? '#4a90d9' : '#d94a4a';
            opColor = myFirst ? '#d94a4a' : '#4a90d9';
            
            if (this.game.gameMode === 'online') {
                myLabel = myFirst ? '你先手' : '你后手';
                opLabel = myFirst ? '对手后手' : '对手先手';
            } else if (this.game.gameMode === 'bot') {
                myLabel = myFirst ? '你先手' : '你后手';
                opLabel = myFirst ? 'Bot后手' : 'Bot先手';
            } else if (this.game.gameMode === 'local') {
                const bottomIsFirst = (this.game.perspective === 'bottom' && myFirst) || (this.game.perspective === 'top' && !myFirst);
                if (this.game.perspective === 'bottom') {
                    myLabel = myFirst ? '下方先手' : '下方后手';
                    opLabel = myFirst ? '上方后手' : '上方先手';
                } else {
                    myLabel = myFirst ? '上方先手' : '上方后手';
                    opLabel = myFirst ? '下方后手' : '下方先手';
                }
            }
        } else {
            myVal = this.val;
            opVal = this.opVal;
        }

        if (this.game.gameMode === 'local') {
            this.drawLocalLayout(ctx, myVal, opVal, myColor, opColor, myLabel, opLabel);
        } else {
            this.drawNormalLayout(ctx, myVal, opVal, myColor, opColor, myLabel, opLabel);
        }
    }

    drawNormalLayout(ctx, myVal, opVal, myColor, opColor, myLabel, opLabel) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('开局掷骰子决定先手', CENTER_X, 200);

        this.drawDie(ctx, CENTER_X - 120, 320, myVal, myColor, myLabel);
        this.drawDie(ctx, CENTER_X + 120, 320, opVal, opColor, opLabel);

        ctx.fillStyle = '#f0e68c'; ctx.font = 'bold 28px sans-serif';
        ctx.fillText('VS', CENTER_X, 340);

        this.drawNormalResults(ctx);
    }

    drawNormalResults(ctx) {
        if (this.results) {
            const myOriginalId = this.game.gameMode === 'online' ? this.game.network.playerIndex : (this.game.perspective === 'bottom' ? 'A' : 'B');
            const first = this.results.first;
            let firstLabel = first === myOriginalId ? '你先手！' : '对手先手！';
            if (this.game.gameMode === 'local') {
                firstLabel = first === 'A' ? '下方先手！' : '上方先手！';
            } else if (this.game.gameMode === 'bot') {
                firstLabel = first === 'A' ? '你先手！' : 'Bot先手！';
            }
            ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 36px sans-serif';
            ctx.fillText(firstLabel, CENTER_X, 420);
        } else if (this.tieResult) {
            ctx.fillStyle = 'rgba(244, 67, 54, 0.2)';
            ctx.fillRect(0, 400 - 40, CANVAS_WIDTH, 80);
            ctx.fillStyle = '#f44336'; ctx.font = 'bold 36px sans-serif';
            ctx.fillText('双方点数相同，平局重掷！', CENTER_X, 400);
        } else {
            const bx = CENTER_X - 80, by = 500, bw = 160, bh = 50;
            if (!this.hasRolled) {
                ctx.fillStyle = '#ddd'; ctx.font = '16px sans-serif';
                ctx.fillText('点击按钮随机生成点数', CENTER_X, 390);

                const left = Math.ceil(Math.max(0, this.countdownEndTime - Date.now()) / 1000);
                ctx.fillText(`${left}秒后自动摇号...`, CENTER_X, 580);

                const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
                grad.addColorStop(0, '#4CAF50'); grad.addColorStop(1, '#45a049');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
                ctx.strokeStyle = '#81c784'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
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
                    ctx.fillText('等待出结果...', CENTER_X, 500);
                }
            }
        }
    }

    drawLocalLayout(ctx, myVal, opVal, myColor, opColor, myLabel, opLabel) {
        if (!this.localBtns) this.localBtns = [];

        // Draw A's side (Bottom)
        ctx.save();
        this.drawLocalHalf(ctx, myVal, myColor, myLabel, false, this.localRolledA);
        ctx.restore();

        // Draw B's side (Top)
        ctx.save();
        ctx.translate(CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.rotate(Math.PI);
        this.drawLocalHalf(ctx, opVal, opColor, opLabel, true, this.localRolledB);
        ctx.restore();

        ctx.fillStyle = '#f0e68c'; ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('VS', CENTER_X, CANVAS_HEIGHT / 2);
    }

    drawLocalHalf(ctx, val, color, label, isTop, playerRolled) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('开局掷骰子决定先手', CENTER_X, CANVAS_HEIGHT - 120);

        this.drawDie(ctx, CENTER_X, CANVAS_HEIGHT - 240, val, color, label);

        if (this.results) {
            const first = this.results.first;
            const firstLabel = first === 'A' ? '下方先手！' : '上方先手！';
            ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 28px sans-serif';
            ctx.fillText(firstLabel, CENTER_X, CANVAS_HEIGHT - 350);
        } else if (this.tieResult) {
            ctx.fillStyle = '#f44336'; ctx.font = 'bold 24px sans-serif';
            ctx.fillText('点数相同，平局重掷！', CENTER_X, CANVAS_HEIGHT - 350);
        } else {
            const bx = CENTER_X - 80, by = CANVAS_HEIGHT - 400, bw = 160, bh = 50;
            if (!playerRolled) {
                const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
                grad.addColorStop(0, '#4CAF50'); grad.addColorStop(1, '#45a049');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
                ctx.strokeStyle = '#81c784'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
                ctx.fillText('掷骰子', CENTER_X, by + 28);
                
                // Store actual screen coordinates
                if (isTop) {
                    this.localBtns.push({
                        id: 'B',
                        x: CANVAS_WIDTH - (bx + bw),
                        y: CANVAS_HEIGHT - (by + bh),
                        w: bw, h: bh
                    });
                } else {
                    this.localBtns.push({ id: 'A', x: bx, y: by, w: bw, h: bh });
                }
            } else {
                ctx.fillStyle = '#aaa'; ctx.font = '20px sans-serif';
                ctx.fillText('已掷骰，等待对方...', CENTER_X, CANVAS_HEIGHT - 380);
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
        if (!this.phase || this.results || this.tieResult) return false;

        if (this.game.gameMode === 'local') {
            if (this.localRolledA && this.localRolledB) return false;

            let clickedA = force, clickedB = force;
            if (!force && this.localBtns) {
                for (const b of this.localBtns) {
                    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
                        if (b.id === 'A') clickedA = true;
                        if (b.id === 'B') clickedB = true;
                    }
                }
            }

            if (clickedA && !this.localRolledA) {
                this.localRolledA = true;
                this.rolling = true;
                this.rollAnimEndTime = Date.now() + 3000;
            }
            if (clickedB && !this.localRolledB) {
                this.localRolledB = true;
                this.opponentRolling = true;
                this.opRollAnimEndTime = Date.now() + 3000;
            }
            
            if (this.localRolledA && this.localRolledB && !this.localBothRolled) {
                this.localBothRolled = true;
                this.hasRolled = true;
                this.localBtns = [];
                setTimeout(() => this.rollLocalDice(), 0);
            }
            
            if (clickedA || clickedB) this.localBtns = []; // 重置按钮以防重复点击
            return clickedA || clickedB;
        }

        // Online or Bot mode
        if (this.hasRolled) return false;
        
        let clicked = force;
        if (!clicked && this.btn) {
            clicked = mx >= this.btn.x && mx <= this.btn.x + this.btn.w && my >= this.btn.y && my <= this.btn.y + this.btn.h;
        }

        if (clicked) {
            this.rolling = true;
            this.hasRolled = true;
            this.rollAnimEndTime = Date.now() + 2000;
            if (this.game.gameMode === 'bot') {
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
        this.rollAnimEndTime = Date.now() + 2500;
        if (this.game.gameMode !== 'online') {
            this.opponentRolling = true;
            this.opRollAnimEndTime = Date.now() + 2500;
        }
        
        const a = Math.floor(Math.random() * 6) + 1;
        const b = Math.floor(Math.random() * 6) + 1;
        
        this.targetVal = this.game.perspective === 'bottom' ? a : b;
        this.opTargetVal = this.game.perspective === 'bottom' ? b : a;
        
        setTimeout(() => {
            if (a === b) {
                this.tieResult = true;
                this.rolling = false;
                this.opponentRolling = false;
                this.val = this.targetVal;
                this.opVal = this.opTargetVal;
                setTimeout(() => {
                    this.tieResult = false;
                    this.localRolledA = false;
                    this.localRolledB = false;
                    this.localBothRolled = false;
                    this.hasRolled = false;
                    this.targetVal = null;
                    this.opTargetVal = null;
                    this.startPhase();
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
                const myId = this.game.network.playerIndex.toLowerCase();
                const opId = myId === 'a' ? 'b' : 'a';
                this.val = results[myId];
                this.opVal = results[opId];
            } else {
                this.val = this.game.perspective === 'bottom' ? results.a : results.b;
                this.opVal = this.game.perspective === 'bottom' ? results.b : results.a;
            }
            
            if (this.game.gameMode === 'online') {
                setTimeout(() => {
                    this.game.network.send({ type: 'dice_ack' });
                }, 2000);
            } else {
                setTimeout(() => {
                    this.phase = false;
                    this.game.currentPlayer = results.first; // 根据摇号结果决定先手
                    this.game.roundNumber = 1;
                    this.game.turnStartTime = Date.now();
                    this.game.turnTimeLeft = 60;
                    this.game.initPieces(); // 重新生成棋子，使其能正确获取到先手玩家对应的颜色
                    this.game.input.sliderValue = 0.5;
                    this.game.input.applySliderToPiece();
                    if (this.game.chat) this.game.chat.setVisibility(true);
                }, 2000);
            }
        }, timeLeft);
    }
}
