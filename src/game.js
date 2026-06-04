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
        this.chatMessages = [];

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
        
        this.network.onSliderSync = (value) => {
            if (!this.isMyTurn()) {
                const piece = this.getCurrentPiece();
                if (!piece || piece.isLaunched) return;
                const minX = (this.canvas.width / 2) - 100 + piece.radius;
                const maxX = (this.canvas.width / 2) + 100 - piece.radius;
                
                const opPerspective = this.perspective === 'bottom' ? 'top' : 'bottom';
                if (opPerspective === 'top') {
                    piece.x = maxX - value * (maxX - minX);
                } else {
                    piece.x = minX + value * (maxX - minX);
                }
            }
        };

        this.network.onPlayerRolled = (playerIndex, val) => {
            if (this.perspective === 'bottom') {
                if (playerIndex === 'A') { this.diceRolling = true; this.diceRollAnimEndTime = Date.now() + 2000; this.diceTargetVal = val; }
                if (playerIndex === 'B') { this.opponentRolling = true; this.opDiceRollAnimEndTime = Date.now() + 2000; this.opDiceTargetVal = val; }
            } else {
                if (playerIndex === 'B') { this.diceRolling = true; this.diceRollAnimEndTime = Date.now() + 2000; this.diceTargetVal = val; }
                if (playerIndex === 'A') { this.opponentRolling = true; this.opDiceRollAnimEndTime = Date.now() + 2000; this.opDiceTargetVal = val; }
            }
        };

        this.network.onGameStartSync = () => {
            this.dicePhase = false;
            let myFirst = false;
            if (this.gameMode === 'online') {
                myFirst = this.diceResults.first === this.network.playerIndex;
                this.perspective = myFirst ? 'bottom' : 'top'; // 赢家在下方(蓝色)
            }
            this.currentPlayer = 'A'; // 先手总是A(蓝色)
            this.roundNumber = 1;
            this.turnStartTime = Date.now();
            this.turnTimeLeft = 60;
            this.input.sliderValue = 0.5;
            this.input.applySliderToPiece();
            
            if (this.gameMode === 'online') {
                const chatEl = document.getElementById('ringRushChatContainer');
                if (chatEl) chatEl.style.display = 'flex';
            }
        };

        this.network.onDiceResult = (results) => {
            this.applyDiceResults(results);
        };

        this.network.onDiceTie = () => {
            const now = Date.now();
            const myLeft = Math.max(0, (this.diceRollAnimEndTime || 0) - now);
            const opLeft = Math.max(0, (this.opDiceRollAnimEndTime || 0) - now);
            setTimeout(() => {
                this.diceTieResult = true;
                this.diceRolling = false;
                this.opponentRolling = false;
                setTimeout(() => {
                    this.diceTieResult = false;
                    this.startDicePhase();
                }, 2000);
            }, Math.max(myLeft, opLeft));
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
            this.showRestartAgreed = true;
            setTimeout(() => {
                this.showRestartAgreed = false;
                this.performRestart();
            }, 1500);
        };

        this.network.onPlayerLeft = () => {
            this.opponentLeft = true;
            this.dicePhase = false; // Abort dice phase
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

        this.network.onOpponentDisconnected = () => {
            this.opponentTemporarilyDisconnected = true;
        };

        this.network.onOpponentReconnected = () => {
            this.opponentTemporarilyDisconnected = false;
        };

        this.network.onRequestSync = (targetPlayerId) => {
            const state = {
                scoreA: this.scoreA,
                scoreB: this.scoreB,
                roundNumber: this.roundNumber,
                currentPlayer: this.currentPlayer,
                turnStartTime: this.turnStartTime,
                turnTimeLeft: this.turnTimeLeft,
                dicePhase: this.dicePhase,
                diceResults: this.diceResults,
                diceTieResult: this.diceTieResult,
                diceRolling: this.opponentRolling,
                opponentRolling: this.diceRolling,
                diceTargetVal: this.opDiceTargetVal,
                opDiceTargetVal: this.diceTargetVal,
                diceRollAnimEndTime: Date.now() + 2000,
                opDiceRollAnimEndTime: Date.now() + 2000,
                piecesA: this.piecesA.map(p => ({ x: p.x, y: p.y, isLaunched: p.isLaunched })),
                piecesB: this.piecesB.map(p => ({ x: p.x, y: p.y, isLaunched: p.isLaunched }))
            };
            this.network.send({ type: 'full_sync', targetPlayerId, state });
        };

        this.network.onFullSync = (state) => {
            this.scoreA = state.scoreA;
            this.scoreB = state.scoreB;
            this.roundNumber = state.roundNumber;
            this.currentPlayer = state.currentPlayer;
            this.turnStartTime = state.turnStartTime;
            this.turnTimeLeft = state.turnTimeLeft;
            this.dicePhase = state.dicePhase;
            this.diceResults = state.diceResults;
            this.diceTieResult = state.diceTieResult;
            this.diceRolling = state.diceRolling;
            this.opponentRolling = state.opponentRolling;
            this.diceTargetVal = state.diceTargetVal;
            this.opDiceTargetVal = state.opDiceTargetVal;
            this.diceRollAnimEndTime = state.diceRollAnimEndTime;
            this.opDiceRollAnimEndTime = state.opDiceRollAnimEndTime;
            
            for (let i = 0; i < this.piecesA.length; i++) {
                if (state.piecesA[i]) {
                    this.piecesA[i].x = state.piecesA[i].x;
                    this.piecesA[i].y = state.piecesA[i].y;
                    this.piecesA[i].isLaunched = state.piecesA[i].isLaunched;
                }
            }
            for (let i = 0; i < this.piecesB.length; i++) {
                if (state.piecesB[i]) {
                    this.piecesB[i].x = state.piecesB[i].x;
                    this.piecesB[i].y = state.piecesB[i].y;
                    this.piecesB[i].isLaunched = state.piecesB[i].isLaunched;
                }
            }
            
            if (this.gameMode === 'online') {
                const chatEl = document.getElementById('ringRushChatContainer');
                if (chatEl) chatEl.style.display = this.dicePhase ? 'none' : 'flex';
            }
            
            this.opponentTemporarilyDisconnected = false;
        };

        this.network.onChat = (playerId, text) => {
            const senderIndex = (playerId === this.network.playerId) ? this.playerIndex : (this.playerIndex === 'A' ? 'B' : 'A');
            this.chatMessages.push({ text, playerIndex: senderIndex, timestamp: Date.now() });
        };

        // 注入聊天UI
        if (this.gameMode === 'online') {
            if (!document.getElementById('ringRushChatContainer')) {
                const container = document.createElement('div');
                container.id = 'ringRushChatContainer';
                container.innerHTML = `
                    <style>
                        #ringRushChatContainer {
                            position: absolute;
                            bottom: 20px;
                            right: 20px;
                            z-index: 100;
                            display: flex;
                            flex-direction: column;
                            align-items: flex-end;
                        }
                        #chatMenu {
                            display: none;
                            flex-direction: column;
                            background: rgba(0, 0, 0, 0.8);
                            border-radius: 8px;
                            padding: 8px;
                            margin-bottom: 10px;
                        }
                        #chatMenu.active {
                            display: flex;
                        }
                        .chat-btn {
                        background: rgba(100, 100, 100, 0.8);
                        color: white;
                        border: 1px solid #777;
                        border-radius: 20px;
                            width: 50px;
                            height: 50px;
                            font-size: 24px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                            transition: all 0.2s;
                        }
                        .chat-btn:active {
                            transform: scale(0.95);
                        }
                        .chat-option {
                            background: transparent;
                            color: #fff;
                            border: none;
                            padding: 8px 12px;
                            text-align: right;
                            font-size: 14px;
                            cursor: pointer;
                            white-space: nowrap;
                        }
                        .chat-option:hover {
                            background: rgba(255, 255, 255, 0.2);
                            border-radius: 4px;
                        }
                    </style>
                    <div id="chatMenu">
                        <button class="chat-option">你好，祝你好运！ 👋</button>
                        <button class="chat-option">打得不错！ 👍</button>
                        <button class="chat-option">漂亮的一击！ 🎯</button>
                        <button class="chat-option">哎呀，失误了... 💦</button>
                        <button class="chat-option">快点吧，我等得花儿都谢了！ ⏰</button>
                        <button class="chat-option">谢谢指教，再来一局？ 🤝</button>
                    </div>
                    <button class="chat-btn">💬</button>
                `;
                document.getElementById('gameContainer').appendChild(container);
                
                const btn = container.querySelector('.chat-btn');
                const menu = container.querySelector('#chatMenu');
                const options = container.querySelectorAll('.chat-option');

                btn.onclick = () => {
                    menu.classList.toggle('active');
                };

                options.forEach(opt => {
                    opt.onclick = () => {
                        this.sendChat(opt.textContent.trim());
                        menu.classList.remove('active');
                    };
                });
            } else {
                document.getElementById('ringRushChatContainer').style.display = 'flex';
            }
        } else {
            const chatEl = document.getElementById('ringRushChatContainer');
            if (chatEl) chatEl.style.display = 'none';
        }

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
        if (this.gameOver) return;
        
        const now = Date.now();
        if (this.dicePhase) {
            if (!this.diceRolling && !this.diceResults && !this.diceTieResult) {
                if (now >= this.diceCountdownEndTime) {
                    this.handleDiceClick(0, 0, true);
                }
            }

            if (this.diceRolling) {
                const timeLeft = Math.max(0, this.diceRollAnimEndTime - now);
                if (timeLeft > 0 || (this.gameMode === 'online' && !this.diceTargetVal)) {
                    let progress = 0;
                    if (this.gameMode !== 'online' || this.diceTargetVal) {
                        progress = timeLeft > 0 ? 1 - (timeLeft / 2000) : 1;
                    }
                    const interval = 50 + progress * progress * progress * 400; // 50ms 到 450ms
                    if (!this.lastDiceUpdate || now - this.lastDiceUpdate > interval) {
                        this.diceVal = Math.floor(Math.random() * 6) + 1;
                        this.lastDiceUpdate = now;
                    }
                } else if (this.diceTargetVal || this.gameMode !== 'online') {
                    if (this.diceTargetVal) this.diceVal = this.diceTargetVal;
                }
            }
            if (this.opponentRolling) {
                const timeLeft = Math.max(0, this.opDiceRollAnimEndTime - now);
                if (timeLeft > 0 || (this.gameMode === 'online' && !this.opDiceTargetVal)) {
                    let progress = 0;
                    if (this.gameMode !== 'online' || this.opDiceTargetVal) {
                        progress = timeLeft > 0 ? 1 - (timeLeft / 2000) : 1;
                    }
                    const interval = 50 + progress * progress * progress * 400;
                    if (!this.lastOpDiceUpdate || now - this.lastOpDiceUpdate > interval) {
                        this.opDiceVal = Math.floor(Math.random() * 6) + 1;
                        this.lastOpDiceUpdate = now;
                    }
                } else if (this.opDiceTargetVal || this.gameMode !== 'online') {
                    if (this.opDiceTargetVal) this.opDiceVal = this.opDiceTargetVal;
                }
            }
            return;
        }

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

        // 清理过期的聊天消息
        const now2 = Date.now();
        this.chatMessages = this.chatMessages.filter(msg => now2 - msg.timestamp < 3500);

        // 如果在动画中，或者游戏结束，不更新倒计时逻辑
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
                const isTop = this.perspective === 'top';
                const sx = isTop ? this.tx(piece.x) : piece.x;
                const sy = isTop ? this.ty(piece.y) : piece.y;
                this.ui.addScoreAnimation(sx, sy - 30, this.currentScore);
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
            myVal = this.diceVal;
            opVal = this.opDiceVal;
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
        } else if (this.diceTieResult) {
            ctx.fillStyle = '#f44336'; ctx.font = 'bold 36px sans-serif';
            ctx.fillText('平局，重掷！', CENTER_X, 420);
        } else {
            if (!this.diceRolling) {
                ctx.fillStyle = '#ddd'; ctx.font = '16px sans-serif';
                const left = Math.ceil(Math.max(0, this.diceCountdownEndTime - Date.now()) / 1000);
                ctx.fillText(`${left}秒后自动摇号...`, CENTER_X, 580);
                
                const bx = CENTER_X - 80, by = 500, bw = 160, bh = 50;
                const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
                grad.addColorStop(0, '#4CAF50'); grad.addColorStop(1, '#388E3C');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
                ctx.strokeStyle = '#66BB6A'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
                ctx.fillText('掷骰子', CENTER_X, by + 28);
                this.diceBtn = { x: bx, y: by, w: bw, h: bh };

                if (this.opponentRolling) {
                    ctx.fillStyle = '#ff9800'; ctx.font = 'bold 20px sans-serif';
                    ctx.fillText('对手已掷，请你掷骰子', CENTER_X, 450);
                }
            } else {
                this.diceBtn = null;
                if (!this.opponentRolling) {
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

    startDicePhase() {
        this.dicePhase = true;
        this.diceRolling = false;
        this.opponentRolling = false;
        this.diceResults = null;
        this.diceBtn = null;
        this.diceStartTime = Date.now();
        this.diceCountdownEndTime = Date.now() + 5000;
        this.diceRollAnimEndTime = 0;
        this.opDiceRollAnimEndTime = 0;
        this.diceVal = null;
        this.opDiceVal = null;
        this.diceTargetVal = null;
        this.opDiceTargetVal = null;

        const chatEl = document.getElementById('ringRushChatContainer');
        if (chatEl) chatEl.style.display = 'none';
    }

    handleDiceClick(mx, my, force = false) {
        if (!this.dicePhase || this.diceRolling || this.diceResults) return false;
        const btn = this.diceBtn;
        if (force || (btn && mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h)) {
            this.diceRolling = true;
            this.diceRollAnimEndTime = Date.now() + 2000;
            if (this.gameMode !== 'online') {
                this.opponentRolling = true;
                this.opDiceRollAnimEndTime = Date.now() + 2000;
            }
            if (this.gameMode === 'online') {
                this.network.send({ type: 'dice_roll' });
            } else {
                setTimeout(() => this.rollLocalDice(), 0);
            }
            return true;
        }
        return false;
    }

    applyDiceResults(results) {
        const now = Date.now();
        const myLeft = Math.max(0, (this.diceRollAnimEndTime || 0) - now);
        const opLeft = Math.max(0, (this.opDiceRollAnimEndTime || 0) - now);
        const timeLeft = Math.max(myLeft, opLeft);

        setTimeout(() => {
            this.diceResults = results;
            this.diceRolling = false;
            this.opponentRolling = false;
            
            if (this.gameMode === 'online') {
                setTimeout(() => {
                    this.network.send({ type: 'dice_ack' });
                }, 2000); // 显示结果2秒后发送ACK
            } else {
                setTimeout(() => {
                    this.dicePhase = false;
                    this.currentPlayer = 'A'; // 先手总是A(蓝色)
                    this.roundNumber = 1;
                    this.turnStartTime = Date.now();
                    this.turnTimeLeft = 60;
                    this.input.sliderValue = 0.5;
                    this.input.applySliderToPiece();
                }, 2000);
            }
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

    sendChat(text) {
        if (!this.isOnlineGame() || this.dicePhase) return;
        this.network.send({ type: 'chat', text });
        this.chatMessages.push({ text, playerIndex: this.playerIndex, timestamp: Date.now() });
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

        if (this.opponentTemporarilyDisconnected) return;

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
                this.showSurrenderConfirm();
            }
        }
    }

    showSurrenderConfirm() {
        let modal = document.getElementById('ringRushSurrenderModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ringRushSurrenderModal';
            modal.innerHTML = `
                <style>
                    #ringRushSurrenderModal {
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.7);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 200;
                    }
                    #ringRushSurrenderModal .modal-content {
                        background: #2a2a2a;
                        padding: 24px;
                        border-radius: 12px;
                        text-align: center;
                        color: white;
                        border: 2px solid #f44336;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                        font-family: sans-serif;
                        min-width: 250px;
                    }
                    #ringRushSurrenderModal .modal-title {
                        font-size: 20px;
                        font-weight: bold;
                        margin-bottom: 12px;
                        color: #f44336;
                    }
                    #ringRushSurrenderModal .modal-body {
                        font-size: 16px;
                        margin-bottom: 24px;
                        color: #ccc;
                    }
                    #ringRushSurrenderModal .modal-buttons {
                        display: flex;
                        justify-content: space-around;
                    }
                    #ringRushSurrenderModal .btn {
                        padding: 8px 24px;
                        border: none;
                        border-radius: 6px;
                        font-size: 16px;
                        cursor: pointer;
                        font-weight: bold;
                        transition: opacity 0.2s;
                    }
                    #ringRushSurrenderModal .btn-yes { background: #f44336; color: white; }
                    #ringRushSurrenderModal .btn-no { background: #555; color: white; }
                    #ringRushSurrenderModal .btn:hover { opacity: 0.8; }
                </style>
                <div class="modal-content">
                    <div class="modal-title">确认投降</div>
                    <div class="modal-body">投降后将被判负，确定要投降吗？</div>
                    <div class="modal-buttons">
                        <button class="btn btn-no" id="btnSurrenderNo">取消</button>
                        <button class="btn btn-yes" id="btnSurrenderYes">确认投降</button>
                    </div>
                </div>
            `;
            document.getElementById('gameContainer').appendChild(modal);
            
            document.getElementById('btnSurrenderNo').onclick = () => {
                modal.style.display = 'none';
            };
            document.getElementById('btnSurrenderYes').onclick = () => {
                modal.style.display = 'none';
                if (this.gameMode === 'local') {
                    this.winner = this.currentPlayer === 'A' ? 'B' : 'A';
                } else if (this.gameMode === 'online') {
                    this.winner = this.playerIndex === 'A' ? 'B' : 'A';
                } else {
                    this.winner = 'B'; // Bot wins
                }
                this.gameOver = true;
                if (this.isOnlineGame()) {
                    this.network.send({ type: 'surrender' });
                }
            };
        } else {
            modal.style.display = 'flex';
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
        this.isDestroyed = true;
        if (this.isOnlineGame()) {
            this.network.send({ type: 'leave_room' });
        }
        
        const chatContainer = document.getElementById('ringRushChatContainer');
        if (chatContainer) chatContainer.style.display = 'none';

        if (this.onExit) this.onExit();
    }

    cleanup() {
        this.isDestroyed = true;
        this.canvas.removeEventListener('click', this._boundHandleClick);
        this.canvas.removeEventListener('touchstart', this._boundHandleTouch);
        if (this.input) this.input.cleanup();
    }
}
