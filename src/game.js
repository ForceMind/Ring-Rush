/**
 * Ring Rush - 游戏主类
 * 核心游戏逻辑、状态管理、渲染循环
 */
import {
    CANVAS_WIDTH, CANVAS_HEIGHT, CENTER_X, CENTER_Y,
    BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT,
    LAUNCH_ZONE_WIDTH, LAUNCH_ZONE_HEIGHT,
    MAX_SPEED, PIECES_PER_PLAYER, WIN_THRESHOLD,
    RUNNER_SMOOTH_FACTOR, RUNNER_SNAP_THRESHOLD, SCORING_ZONES,
    VERSION
} from './constants.js';
import { AudioManager } from './audio.js';
import { ParticleSystem } from './particles.js';
import { Board } from './board.js';
import { Physics } from './physics.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { AI } from './ai.js';
import { Piece } from './piece.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.gameMode = null;
        this.ai = null;
        this.network = null;
        this.opponentName = null;

        // 视角和骰子
        this.perspective = 'bottom'; // 'bottom'=A视角, 'top'=B视角
        this.dicePhase = false;
        this.diceRolling = false;
        this.diceResults = null;
        this.diceFirstPlayer = null;
        this.diceTimer = 0;

        this.currentPlayer = 'A';
        this.piecesLeftA = PIECES_PER_PLAYER;
        this.piecesLeftB = PIECES_PER_PLAYER;
        this.runnerPosition = 0;          // 目标位置（整数）
        this.runnerDisplayPosition = 0;   // 显示位置（可为小数，用于动画）
        this.runnerAnimating = false;     // 小人是否在移动中
        this.currentScore = 0;
        this.gameOver = false;
        this.winner = null;
        this.isAnimating = false;
        this.scorePopup = null;
        this.restartBtn = null;
        this.roundNumber = 1;
        this.turnStartTime = 0;
        this.turnTimeLeft = 60;

        this.audio = new AudioManager();
        this.particles = new ParticleSystem();
        this.board = new Board();
        this.physics = new Physics(this);
        this.input = new Input(this);
        this.ui = new UI(this);

        this.piecesA = [];
        this.piecesB = [];
        
        this.timeoutsA = 0;
        this.timeoutsB = 0;
        
        this.waitingForRestart = false;
        this.opponentWantsRestart = false;
        this.opponentLeft = false;
        this.isDestroyed = false;

        // 保存绑定引用，方便后续移除（修复内存泄漏）
        this._boundHandleClick = this.handleClick.bind(this);
        this.canvas.addEventListener('click', this._boundHandleClick);
    }

    init(mode, difficulty) {
        this.gameMode = mode;
        this.perspective = 'bottom';
        if (mode === 'bot') {
            this.ai = new AI(difficulty);
        }
        this.startDicePhase();
        this.initPieces();
        this.input.init();
        this.gameLoop();
    }

    rollLocalDice() {
        this.diceRolling = true;
        this.diceRollAnimEndTime = Date.now() + 3000;
        setTimeout(() => {
            const a = Math.floor(Math.random() * 6) + 1;
            const b = Math.floor(Math.random() * 6) + 1;
            let first = a > b ? 'bottom' : b > a ? 'top' : null;
            if (!first) return this.rollLocalDice(); // 平局重掷
            this.applyDiceResults({ a, b, first });
        }, 1500);
    }

    initOnlineGame(network, playerIndex, opponentName) {
        this.gameMode = 'online';
        this.network = network;
        this.currentPlayer = playerIndex;
        this.opponentName = opponentName;
        this.perspective = playerIndex === 'A' ? 'bottom' : 'top';

        this.network.onPieceLaunch = (message) => {
            this.handleRemotePieceLaunch(message.piece);
        };

        this.network.onDiceResult = (results) => {
            this.applyDiceResults(results);
        };

        this.network.onDiceTie = () => {
            this.diceRolling = false;
            this.diceResults = null;
        };
        
        this.network.onSurrender = () => {
            this.winner = this.perspective === 'bottom' ? 'A' : 'B';
            this.gameOver = true;
            this.audio.play('win');
        };

        this.network.onOpponentRestartRequest = () => {
            this.opponentWantsRestart = true;
        };

        this.network.onRestartGame = () => {
            this.performRestart();
        };

        this.network.onPlayerLeft = () => {
            this.opponentLeft = true;
            if (!this.gameOver) {
                this.winner = this.perspective === 'bottom' ? 'A' : 'B';
                this.gameOver = true;
                this.audio.play('win');
            }
        };

        this.network.onPlayerRolling = (playerIndex) => {
            if (this.perspective === 'bottom') {
                if (playerIndex === 'B') { this.opponentRolling = true; this.opDiceRollAnimEndTime = Date.now() + 1500; }
            } else {
                if (playerIndex === 'A') { this.opponentRolling = true; this.opDiceRollAnimEndTime = Date.now() + 1500; }
            }
        };

        this.startDicePhase();
        this.initPieces();
        this.input.init();
        this.gameLoop();
    }

    // 坐标变换：游戏坐标 → 屏幕坐标
    tx(x) { return this.perspective === 'top' ? BOARD_X + BOARD_WIDTH - (x - BOARD_X) : x; }
    ty(y) { return this.perspective === 'top' ? BOARD_Y + BOARD_HEIGHT - (y - BOARD_Y) : y; }
    // 屏幕坐标 → 游戏坐标
    gx(x) { return this.perspective === 'top' ? BOARD_X + BOARD_WIDTH - (x - BOARD_X) : x; }
    gy(y) { return this.perspective === 'top' ? BOARD_Y + BOARD_HEIGHT - (y - BOARD_Y) : y; }

    initPieces() {
        const zoneWidth = LAUNCH_ZONE_WIDTH * 4;
        const bottomZoneY = BOARD_Y + BOARD_HEIGHT + 25 + LAUNCH_ZONE_HEIGHT / 2;
        const topZoneY = BOARD_Y - 25 - LAUNCH_ZONE_HEIGHT / 2;
        for (let i = 0; i < PIECES_PER_PLAYER; i++) {
            const x = CENTER_X - zoneWidth / 2 + (i + 0.5) * zoneWidth / PIECES_PER_PLAYER;
            this.piecesA.push(new Piece(x, bottomZoneY, 'A'));
            this.piecesB.push(new Piece(x, topZoneY, 'B'));
        }
        this.piecesA.concat(this.piecesB).forEach(p => this.physics.addPiece(p));
    }

    getCurrentPiece() {
        if (this.currentPlayer === 'A') {
            const index = PIECES_PER_PLAYER - this.piecesLeftA;
            return index < PIECES_PER_PLAYER ? this.piecesA[index] : null;
        } else {
            const index = PIECES_PER_PLAYER - this.piecesLeftB;
            return index < PIECES_PER_PLAYER ? this.piecesB[index] : null;
        }
    }

    isBotTurn() {
        return this.gameMode === 'bot' && this.currentPlayer === 'B';
    }

    isOnlineGame() {
        return this.gameMode === 'online';
    }

    handleRemotePieceLaunch(pieceData) {
        const piece = this.getCurrentPiece();
        if (piece) {
            piece.x = pieceData.x;
            piece.y = pieceData.y;
            piece.vx = pieceData.vx;
            piece.vy = pieceData.vy;
            piece.isLaunched = true;
            piece.isActive = true;
            this.isAnimating = true;
            this.audio.play('launch');
        }
    }

    update() {
        if (this.gameOver || this.dicePhase) return;

        this.physics.update();
        this.particles.update();

        // 小人移动动画
        if (this.runnerAnimating) {
            const diff = this.runnerPosition - this.runnerDisplayPosition;
            if (Math.abs(diff) < RUNNER_SNAP_THRESHOLD) {
                this.runnerDisplayPosition = this.runnerPosition;
                this.runnerAnimating = false;
            } else {
                this.runnerDisplayPosition += diff * RUNNER_SMOOTH_FACTOR;
            }
        }

        if (this.isAnimating && this.physics.allStopped()) {
            this.checkRoundEnd();
        }

        // 倒计时逻辑
        if (!this.isAnimating && !this.dicePhase && !this.gameOver) {
            const elapsed = Date.now() - this.turnStartTime;
            this.turnTimeLeft = Math.max(0, 60 - Math.floor(elapsed / 1000));
            
            if (this.turnTimeLeft === 0) {
                // 超时，消耗当前棋子
                const piece = this.getCurrentPiece();
                if (piece) {
                    piece.isActive = false;
                    piece.isLaunched = true; 
                    piece.isDiscarded = true;
                    this.audio.play('collision');
                }
                // 记录超时次数
                if (this.currentPlayer === 'A') {
                    this.timeoutsA++;
                    if (this.timeoutsA >= 3) {
                        this.winner = 'B';
                        this.gameOver = true;
                    }
                } else {
                    this.timeoutsB++;
                    if (this.timeoutsB >= 3) {
                        this.winner = 'A';
                        this.gameOver = true;
                    }
                }
                if (!this.gameOver) {
                    this.switchPlayer();
                }
            }
        }

        if (this.isBotTurn() && !this.isAnimating && !this.ai.isThinking) {
            this.ai.executeTurn(this);
        }
    }

    checkRoundEnd() {
        const piece = this.getCurrentPiece();
        if (piece && piece.isLaunched) {
            this.currentScore = this.board.calculateScore(piece);
            this.updateRunnerPosition(this.currentScore);

            if (this.currentScore > 0) {
                this.ui.addScoreAnimation(piece.x, piece.y - 30, this.currentScore);
                this.particles.emitScore(piece.x, piece.y);
                this.audio.play('score');
            }

            if (this.checkWinner()) {
                this.gameOver = true;
                this.particles.emitWin(CENTER_X, CENTER_Y);
                this.audio.play('win');
                return;
            }
        }

        this.switchPlayer();
    }

    updateRunnerPosition(score) {
        const oldPosition = this.runnerPosition;
        if (this.currentPlayer === 'A') {
            this.runnerPosition = Math.max(-WIN_THRESHOLD, this.runnerPosition - score);
        } else {
            this.runnerPosition = Math.min(WIN_THRESHOLD, this.runnerPosition + score);
        }
        // 如果位置改变，启动动画
        if (oldPosition !== this.runnerPosition) {
            this.runnerAnimating = true;
        }
    }

    checkWinner() {
        if (this.runnerPosition <= -WIN_THRESHOLD) { this.winner = 'A'; return true; }
        if (this.runnerPosition >= WIN_THRESHOLD) { this.winner = 'B'; return true; }

        if (this.piecesLeftA === 0 && this.piecesLeftB === 0) {
            if (this.runnerPosition < 0) this.winner = 'A';
            else if (this.runnerPosition > 0) this.winner = 'B';
            else this.winner = null;
            return true;
        }

        return false;
    }

    drawDiceScreen(ctx) {
        // 背景
        ctx.fillStyle = '#0f0f1a';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 浮动粒子
        const t = Date.now() * 0.001;
        for (let i = 0; i < 20; i++) {
            const x = (Math.sin(i * 0.7 + t) + 1) * CANVAS_WIDTH / 2;
            const y = (Math.cos(i * 0.5 + t * 0.6) + 1) * CANVAS_HEIGHT / 2;
            ctx.fillStyle = `rgba(74,144,217,${0.1 + Math.sin(i + t) * 0.1})`;
            ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        }

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        // 标题
        ctx.save(); ctx.shadowColor = '#f0e68c'; ctx.shadowBlur = 15;
        ctx.fillStyle = '#f0e68c'; ctx.font = 'bold 36px sans-serif';
        ctx.fillText('掷骰子决定先手', CENTER_X, 135); ctx.restore();

        // 提示文字
        ctx.fillStyle = '#bbb'; ctx.font = '16px sans-serif';
        ctx.fillText('点数大者先发球，先手为蓝色，后手为红色', CENTER_X, 175);

        // 对手
        ctx.fillStyle = '#aaa'; ctx.font = '16px sans-serif';
        ctx.fillText(`对手: ${this.opponentName || '等待中'}`, CENTER_X, 215);

        // 骰子区域
        let myColor = '#666';
        let opColor = '#666';
        let myLabel = '你的点数';
        let opLabel = '对手点数';
        let myVal = null, opVal = null;
        
        // 骰子显示逻辑：一旦有结果（此时动画必定已结束），就显示
        const now = Date.now();
        
        if (this.diceResults) {
            const myOriginalId = this.gameMode === 'online' ? this.network.playerIndex : (this.perspective === 'bottom' ? 'A' : 'B');
            myVal = this.perspective === 'bottom' ? this.diceResults.a : this.diceResults.b;
            opVal = this.perspective === 'bottom' ? this.diceResults.b : this.diceResults.a;
            
            const myFirst = this.diceResults.first === myOriginalId;
            myColor = myFirst ? '#4a90d9' : '#d94a4a';
            opColor = myFirst ? '#d94a4a' : '#4a90d9';
            myLabel = myFirst ? '你先手 (蓝)' : '你后手 (红)';
            opLabel = myFirst ? '对手后手 (红)' : '对手先手 (蓝)';
        } else {
            if (this.diceRolling) myVal = Math.floor(Math.random() * 6) + 1;
            if (this.opponentRolling || this.diceRolling && this.gameMode !== 'online') opVal = Math.floor(Math.random() * 6) + 1;
        }

        this.drawDie(ctx, CENTER_X - 120, 320, myVal, myColor, myLabel);
        this.drawDie(ctx, CENTER_X + 120, 320, opVal, opColor, opLabel);

        // VS
        ctx.fillStyle = '#f0e68c'; ctx.font = 'bold 28px sans-serif';
        ctx.fillText('VS', CENTER_X, 340);

        // 结果或按钮
        if (this.diceResults) {
            // ... wait 1s logic handled in update
            const myOriginalId = this.gameMode === 'online' ? this.network.playerIndex : (this.perspective === 'bottom' ? 'A' : 'B');
            const first = this.diceResults.first;
            const firstLabel = first === myOriginalId ? '你先手！' : '对手先手';
            ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 36px sans-serif';
            ctx.fillText(firstLabel, CENTER_X, 420);
        } else if (this.diceRolling) {
            ctx.fillStyle = '#aaa'; ctx.font = '16px sans-serif';
            ctx.fillText('掷骰子中...', CENTER_X, 530);
        } else {
            // 倒计时
            const timeLeft = Math.max(0, 5 - Math.floor((now - this.diceStartTime) / 1000));
            if (timeLeft === 0 && !this.diceRolling) {
                this.handleDiceClick(CENTER_X, 500, true);
            }
            
            // 掷骰子按钮
            const bx = CENTER_X - 80, by = 500, bw = 160, bh = 50;
            const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
            grad.addColorStop(0, '#4CAF50'); grad.addColorStop(1, '#388E3C');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
            ctx.strokeStyle = '#66BB6A'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
            ctx.fillText(`掷骰子 (${timeLeft}s)`, CENTER_X, by + 28);
            this.diceBtn = { x: bx, y: by, w: bw, h: bh };
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

    startDicePhase() {
        this.dicePhase = true;
        this.diceRolling = false;
        this.opponentRolling = false;
        this.diceResults = null;
        this.diceBtn = null;
        this.diceStartTime = Date.now();
        this.diceRollAnimEndTime = 0;
        this.opDiceRollAnimEndTime = 0;
    }

    handleDiceClick(mx, my, force = false) {
        if (!this.dicePhase || this.diceRolling || this.diceResults) return false;
        const btn = this.diceBtn;
        if (force || (btn && mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h)) {
            this.diceRolling = true;
            this.diceRollAnimEndTime = Date.now() + 1500;
            if (this.gameMode !== 'online') {
                this.opponentRolling = true;
                this.opDiceRollAnimEndTime = Date.now() + 1500;
            }
            if (this.gameMode === 'online') {
                this.network.send({ type: 'dice_roll' });
                // 超时回退：5秒没响应则本地掷骰子
                this._diceTimeout = setTimeout(() => {
                    if (this.dicePhase && this.diceRolling && !this.diceResults) {
                        console.warn('骰子服务器无响应，使用本地掷骰子');
                        this.rollLocalDice();
                    }
                }, 5000);
            } else {
                setTimeout(() => this.rollLocalDice(), 0);
            }
            return true;
        }
        return false;
    }

    applyDiceResults(results) {
        if (this._diceTimeout) { clearTimeout(this._diceTimeout); this._diceTimeout = null; }
        
        // 等待双方动画都结束再显示结果并切换
        const myLeft = this.diceRollAnimEndTime ? Math.max(0, this.diceRollAnimEndTime - Date.now()) : 0;
        const opLeft = this.opDiceRollAnimEndTime ? Math.max(0, this.opDiceRollAnimEndTime - Date.now()) : 0;
        const timeLeft = Math.max(myLeft, opLeft);

        setTimeout(() => {
            this.diceResults = results;
            this.diceRolling = false;
            this.opponentRolling = false;

            setTimeout(() => {
                this.dicePhase = false;
                
                // 根据点数重新分配红蓝方和视角
                let myFirst = false;
                if (this.gameMode === 'online') {
                    myFirst = results.first === this.network.playerIndex;
                    this.perspective = myFirst ? 'bottom' : 'top'; // 赢家在下方(蓝色)
                } else {
                    myFirst = results.first === this.perspective;
                }
                this.currentPlayer = 'A'; // 先手总是A(蓝色)

                this.roundNumber = 1;
                this.turnStartTime = Date.now();
                this.turnTimeLeft = 60;
                this.input.sliderValue = 0.5;
                this.input.applySliderToPiece();
            }, 1000); // 显示结果后停顿1秒
        }, timeLeft);
    }

    switchPlayer() {
        if (this.currentPlayer === 'A') this.piecesLeftA--;
        else this.piecesLeftB--;

        this.currentPlayer = this.currentPlayer === 'A' ? 'B' : 'A';
        this.currentScore = 0;
        this.isAnimating = false;
        this.roundNumber++;
        this.input.sliderValue = 0.5;
        this.input.applySliderToPiece(); // 切换回合时重置到中心
        this.turnStartTime = Date.now();
        this.turnTimeLeft = 60;
    }

    isMyTurn() {
        if (!this.isOnlineGame()) return true;
        return this.currentPlayer === (this.perspective === 'bottom' ? 'A' : 'B');
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        if (this.gameOver && this.restartBtn) {
            const btn = this.restartBtn;
            if (mouseX >= btn.x && mouseX <= btn.x + btn.w &&
                mouseY >= btn.y && mouseY <= btn.y + btn.h) {
                this.restart();
            }
        }
        
        if (this.gameOver && this.exitBtn) {
            const btn = this.exitBtn;
            if (mouseX >= btn.x && mouseX <= btn.x + btn.w &&
                mouseY >= btn.y && mouseY <= btn.y + btn.h) {
                this.exitGame();
                return;
            }
        }

        if (this.gameOver) {
            return;
        }
        
        if (!this.gameOver && !this.dicePhase && this.surrenderBtn) {
            const btn = this.surrenderBtn;
            if (mouseX >= btn.x && mouseX <= btn.x + btn.w &&
                mouseY >= btn.y && mouseY <= btn.y + btn.h) {
                if (confirm('确定要投降吗？')) {
                    this.winner = this.perspective === 'bottom' ? 'B' : 'A';
                    this.gameOver = true;
                    if (this.isOnlineGame()) {
                        this.network.send({ type: 'surrender' });
                    }
                }
            }
        }
    }

    restart() {
        if (this.isOnlineGame()) {
            if (!this.waitingForRestart) {
                this.waitingForRestart = true;
                this.network.send({ type: 'restart_request' });
            }
            return;
        }
        this.performRestart();
    }

    performRestart() {
        if (this.ai) this.ai.cancel();

        this.waitingForRestart = false;
        this.opponentWantsRestart = false;
        this.opponentLeft = false;

        this.currentPlayer = 'A';
        this.piecesLeftA = PIECES_PER_PLAYER;
        this.piecesLeftB = PIECES_PER_PLAYER;
        this.runnerPosition = 0;
        this.runnerDisplayPosition = 0;
        this.runnerAnimating = false;
        this.currentScore = 0;
        this.gameOver = false;
        this.winner = null;
        this.isAnimating = false;
        this.scorePopup = null;
        this.restartBtn = null;
        this.roundNumber = 1;
        this.dicePhase = false;
        this.diceRolling = false;
        this.diceResults = null;
        this.diceFirstPlayer = null;
        this.opponentRolling = false;
        this.turnStartTime = 0;
        this.turnTimeLeft = 60;
        this.timeoutsA = 0;
        this.timeoutsB = 0;

        this.particles.clear();
        this.physics.reset();
        this.piecesA = [];
        this.piecesB = [];
        this.startDicePhase();
        this.initPieces();
    }

    draw() {
        const ctx = this.ctx;

        ctx.fillStyle = '#0f0f1a';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        if (this.dicePhase) {
            this.drawDiceScreen(ctx);
            return;
        }

        const isTop = this.perspective === 'top';

        // 棋盘图形（B视角翻转位置，但不翻转画布）
        this.board.draw(ctx, isTop);

        // 棋子（变换位置）
        const p = this.perspective;
        this.physics.pieces.forEach(piece => {
            if (piece.isLaunched && !piece.isDiscarded) {
                const sx = isTop ? this.tx(piece.x) : piece.x;
                const sy = isTop ? this.ty(piece.y) : piece.y;
                piece.drawAt(ctx, sx, sy, false, p);
            }
        });
        const cp = this.getCurrentPiece();
        if (cp && !cp.isLaunched) {
            const sx = isTop ? this.tx(cp.x) : cp.x;
            const sy = isTop ? this.ty(cp.y) : cp.y;
            cp.drawAt(ctx, sx, sy, true, p);
        }

        this.input.drawAimingLine(ctx);
        this.input.drawSlider(ctx);
        this.particles.draw(ctx);
        this.ui.draw(ctx);
    }

    gameLoop() {
        if (this.isDestroyed) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }

    exitGame() {
        if (this.isOnlineGame()) {
            this.network.send({ type: 'leave_room' });
        }
        if (this.onExit) this.onExit();
    }

    cleanup() {
        this.isDestroyed = true;
        this.canvas.removeEventListener('click', this._boundHandleClick);
        this.canvas.removeEventListener('touchstart', this._boundHandleTouch);
        if (this.input) this.input.cleanup();
    }
}
