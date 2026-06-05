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
    VERSION, PIECE_RADIUS
} from './constants.js';
import { AudioManager } from './audio.js';
import { ParticleSystem } from './particles.js';
import { Board } from './board.js';
import { Physics } from './physics.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { AI } from './ai.js';
import { ModalManager } from './modals.js';
import { ChatManager } from './chat.js';
import { DiceManager } from './dice.js';
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
        this.modals = new ModalManager(this);
        this.chat = new ChatManager(this);
        this.dice = new DiceManager(this);

        this.piecesA = [];
        this.piecesB = [];
        this.piecesN = [];
        
        this.timeoutsA = 0;
        this.timeoutsB = 0;
        
        this.waitingForRestart = false;
        this.opponentWantsRestart = false;
        this.opponentLeft = false;
        this.isDestroyed = false;

        // 延迟胜利状态
        this.pendingWin = false;      // 是否有待展示的胜利
        this.pendingWinReason = null;  // 'surrender' | 'runner' | 'timeout' | 'allUsed'
        this.pendingWinTime = 0;      // 提示语开始显示的时间

        // 保存绑定引用，方便后续移除（修复内存泄漏）
        this._boundHandleClick = this.handleClick.bind(this);
        this.canvas.addEventListener('click', this._boundHandleClick);
    }

    init(mode, difficulty) {
        this.isDestroyed = false;
        this.gameMode = mode;
        this.perspective = 'bottom';
        if (mode === 'bot') {
            this.ai = new AI(difficulty);
        }
        this.dice.startPhase();
        this.initPieces();
        this.input.init();
        this.gameLoop();
    }

    get chatMessages() { return this.chat ? this.chat.chatMessages : []; }

    initOnlineGame(network, playerIndex, opponentName) {
        this.isDestroyed = false;
        this.gameMode = 'online';
        this.network = network;
        this.currentPlayer = playerIndex;
        this.opponentName = opponentName;
        this.perspective = playerIndex === 'A' ? 'bottom' : 'top';

        this.network.onPieceLaunch = (message) => {
            this.handleRemotePieceLaunch(message.piece);
        };
        
        this.network.onSliderSync = (value, player) => {
            if (!this.isMyTurn()) {
                const piece = this.getCurrentPiece();
                if (!piece || piece.isLaunched) {
                    return;
                }
                const minX = (CANVAS_WIDTH / 2) - 100 + piece.radius;
                const maxX = (CANVAS_WIDTH / 2) + 100 - piece.radius;
                
                const opPerspective = this.perspective === 'bottom' ? 'top' : 'bottom';
                if (opPerspective === 'top') {
                    piece.x = maxX - value * (maxX - minX);
                } else {
                    piece.x = minX + value * (maxX - minX);
                }
            }
        };

        this.network.onGameStartSync = () => {
            if (this.gameMode === 'online') {
                this.dice.phase = false;
                if (!this.dice.results) {
                    console.error('Missing dice results! Fallback applied.');
                    this.dice.results = { first: 'A' }; // fallback
                }
                const myFirst = this.dice.results.first === this.network.playerIndex;
                this.perspective = myFirst ? 'bottom' : 'top'; // 赢家在下方(蓝色)
            }
            this.currentPlayer = 'A'; // 先手总是A(蓝色)
            this.roundNumber = 1;
            this.turnStartTime = Date.now();
            this.turnTimeLeft = 60;
            this.initPieces();
            this.input.sliderValue = 0.5;
            this.input.applySliderToPiece();
            if (this.gameMode === 'online') {
                this.chat.setVisibility(true);
            }
        };

        this.network.onDiceResult = (results) => {
            this.dice.applyResults(results);
        };

        this.network.onDiceTie = () => {
            const now = Date.now();
            const myLeft = Math.max(0, (this.dice.rollAnimEndTime || 0) - now);
            const opLeft = Math.max(0, (this.dice.opRollAnimEndTime || 0) - now);
            setTimeout(() => {
                this.dice.tieResult = true;
                this.dice.rolling = false;
                this.dice.opponentRolling = false;
                this.dice.val = this.dice.targetVal;
                this.dice.opVal = this.dice.opTargetVal;
                setTimeout(() => {
                    this.dice.tieResult = false;
                    this.dice.startPhase();
                }, 2000);
            }, Math.max(myLeft, opLeft));
        };
        
        this.network.onSurrender = () => {
            this.winner = this.gameMode === 'online' ? this.network.playerIndex : (this.perspective === 'bottom' ? 'A' : 'B');
            this.pendingWin = true;
            this.pendingWinReason = 'surrender';
            this.pendingWinTime = Date.now();
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
            this.opponentTemporarilyDisconnected = false;
            this.dice.phase = false; // Abort dice phase
            if (!this.gameOver) {
                this.winner = this.gameMode === 'online' ? this.network.playerIndex : (this.perspective === 'bottom' ? 'A' : 'B');
                this.gameOver = true;
                this.audio.play('win');
            }
        };

        this.network.onPlayerRolled = (playerIndex, val) => {
            if (playerIndex === this.network.playerIndex) {
                this.dice.rolling = true;
                this.dice.rollAnimEndTime = Date.now() + 2000;
                this.dice.targetVal = val;
            } else {
                this.dice.opponentRolling = true;
                this.dice.opRollAnimEndTime = Date.now() + 2000;
                this.dice.opTargetVal = val;
            }
        };

        this.network.onOpponentDisconnected = () => {
            this.opponentTemporarilyDisconnected = true;
        };

        this.network.onOpponentReconnected = () => {
            this.opponentTemporarilyDisconnected = false;
        };

        this.network.onRequestSync = (targetPlayerId) => {
            this.network.send({ type: 'full_sync', targetPlayerId, state: this.getState() });
        };

        this.network.onGameState = (state) => {
            // 防抖：丢弃延迟的旧网络包
            if (state.piecesLeftA !== undefined && state.piecesLeftB !== undefined) {
                const currentTotal = this.piecesLeftA + this.piecesLeftB;
                const stateTotal = state.piecesLeftA + state.piecesLeftB;
                if (stateTotal > currentTotal) {
                    console.log('Dropped stale network packet');
                    return; 
                }
            }

            // 只在对手回合结束时，强行停止本地物理动画以同步状态
            // 避免在自己的回合因网络延迟包导致回合被强行打断
            if (!this.isMyTurn()) {
                this.isAnimating = false;
            }
            this.network.onFullSync(state);
        };

        this.network.onFullSync = (state) => {
            this.scoreA = state.scoreA;
            this.scoreB = state.scoreB;
            this.roundNumber = state.roundNumber;
            this.currentPlayer = state.currentPlayer;
            this.turnStartTime = state.turnStartTime;
            this.turnTimeLeft = state.turnTimeLeft;
            this.dice.phase = state.dicePhase;
            this.dice.results = state.diceResults;
            this.dice.tieResult = state.diceTieResult;
            this.dice.rolling = state.diceRolling;
            this.dice.opponentRolling = state.opponentRolling;
            this.dice.targetVal = state.diceTargetVal;
            this.dice.opTargetVal = state.opDiceTargetVal;
            this.dice.rollAnimEndTime = state.diceRollAnimEndTime;
            this.dice.opRollAnimEndTime = state.opDiceRollAnimEndTime;
            this.piecesLeftA = state.piecesLeftA !== undefined ? state.piecesLeftA : this.piecesLeftA;
            this.piecesLeftB = state.piecesLeftB !== undefined ? state.piecesLeftB : this.piecesLeftB;
            
            if (state.pendingWin !== undefined) this.pendingWin = state.pendingWin;
            if (state.pendingWinReason !== undefined) this.pendingWinReason = state.pendingWinReason;
            if (state.winner !== undefined) this.winner = state.winner;
            // 注意：isAnimating 是本地物理状态，不应被远端覆盖
            
            if (state.runnerPosition !== undefined && this.runnerPosition !== state.runnerPosition) {
                this.runnerPosition = state.runnerPosition;
                this.runnerAnimating = true; // 始终触发小人动画
            }
            
            if (this.gameMode === 'online' && this.dice.results && this.dice.results.first) {
                const myFirst = this.dice.results.first === this.network.playerIndex;
                this.perspective = myFirst ? 'bottom' : 'top';
            }
            
            // Adjust pieces array length to match state (for overtime support)
            if (state.piecesA.length !== this.piecesA.length) {
                this.piecesA = [];
                for (let i = 0; i < state.piecesA.length; i++) {
                    const piece = new Piece(state.piecesA[i].x, state.piecesA[i].y, 'A');
                    this.piecesA.push(piece);
                }
                this.physics.clearPieces();
                this.piecesA.forEach(p => this.physics.addPiece(p));
                this.piecesB.forEach(p => this.physics.addPiece(p));
            }
            if (state.piecesB.length !== this.piecesB.length) {
                this.piecesB = [];
                for (let i = 0; i < state.piecesB.length; i++) {
                    const piece = new Piece(state.piecesB[i].x, state.piecesB[i].y, 'B');
                    this.piecesB.push(piece);
                }
                this.physics.clearPieces();
                this.piecesA.forEach(p => this.physics.addPiece(p));
                this.piecesB.forEach(p => this.physics.addPiece(p));
                this.piecesN.forEach(p => this.physics.addPiece(p));
            }
            if (state.piecesN && state.piecesN.length !== this.piecesN.length) {
                this.piecesN = [];
                for (let i = 0; i < state.piecesN.length; i++) {
                    const piece = new Piece(state.piecesN[i].x, state.piecesN[i].y, 'N');
                    piece.isActive = true;
                    piece.isLaunched = true;
                    piece.hasEnteredBoard = true;
                    this.piecesN.push(piece);
                }
                this.physics.clearPieces();
                this.piecesA.forEach(p => this.physics.addPiece(p));
                this.piecesB.forEach(p => this.physics.addPiece(p));
                this.piecesN.forEach(p => this.physics.addPiece(p));
            }

            for (let i = 0; i < this.piecesA.length; i++) {
                if (state.piecesA[i]) {
                    this.piecesA[i].x = state.piecesA[i].x;
                    this.piecesA[i].y = state.piecesA[i].y;
                    this.piecesA[i].vx = 0;
                    this.piecesA[i].vy = 0;
                    this.piecesA[i].isLaunched = state.piecesA[i].isLaunched;
                    if (state.piecesA[i].isDiscarded !== undefined) this.piecesA[i].isDiscarded = state.piecesA[i].isDiscarded;
                    if (state.piecesA[i].isActive !== undefined) this.piecesA[i].isActive = state.piecesA[i].isActive;
                    if (state.piecesA[i].hasEnteredBoard !== undefined) this.piecesA[i].hasEnteredBoard = state.piecesA[i].hasEnteredBoard;
                }
            }
            for (let i = 0; i < this.piecesB.length; i++) {
                if (state.piecesB[i]) {
                    this.piecesB[i].x = state.piecesB[i].x;
                    this.piecesB[i].y = state.piecesB[i].y;
                    this.piecesB[i].vx = 0;
                    this.piecesB[i].vy = 0;
                    this.piecesB[i].isLaunched = state.piecesB[i].isLaunched;
                    if (state.piecesB[i].isDiscarded !== undefined) this.piecesB[i].isDiscarded = state.piecesB[i].isDiscarded;
                    if (state.piecesB[i].isActive !== undefined) this.piecesB[i].isActive = state.piecesB[i].isActive;
                    if (state.piecesB[i].hasEnteredBoard !== undefined) this.piecesB[i].hasEnteredBoard = state.piecesB[i].hasEnteredBoard;
                }
            }
            for (let i = 0; i < this.piecesN.length; i++) {
                if (state.piecesN && state.piecesN[i]) {
                    this.piecesN[i].x = state.piecesN[i].x;
                    this.piecesN[i].y = state.piecesN[i].y;
                    this.piecesN[i].vx = 0;
                    this.piecesN[i].vy = 0;
                }
            }
            
            if (this.gameMode === 'online') {
                this.chat.setVisibility(!this.dice.phase);
            }
            
            this.opponentTemporarilyDisconnected = false;
        };

        this.network.onChat = (playerId, text) => {
            const senderIndex = (playerId === this.network.playerId) ? this.network.playerIndex : (this.network.playerIndex === 'A' ? 'B' : 'A');
            this.chat.addMessage(text, senderIndex);
        };

        if (this.gameMode === 'online') {
            this.chat.initDOM();
        } else {
            this.chat.setVisibility(false);
        }

        this.dice.startPhase();
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

    initNeutralPieces() {
        this.piecesN = [];
        const r = PIECE_RADIUS;
        const spacing = r * 2 + 2; 
        const h = spacing * 0.866;
        const coords = [
            { x: CENTER_X - spacing/2, y: CENTER_Y - h },
            { x: CENTER_X + spacing/2, y: CENTER_Y - h },
            { x: CENTER_X - spacing, y: CENTER_Y },
            { x: CENTER_X, y: CENTER_Y },
            { x: CENTER_X + spacing, y: CENTER_Y },
            { x: CENTER_X - spacing/2, y: CENTER_Y + h },
            { x: CENTER_X + spacing/2, y: CENTER_Y + h }
        ];
        
        coords.forEach(c => {
            let p = new Piece(c.x, c.y, 'N');
            p.isActive = true;
            p.isLaunched = true;
            p.hasEnteredBoard = true;
            this.piecesN.push(p);
        });
    }

    initPieces() {
        this.piecesA = [];
        this.piecesB = [];
        this.physics.clearPieces();
        
        const zoneWidth = LAUNCH_ZONE_WIDTH * 4;
        const bottomZoneY = BOARD_Y + BOARD_HEIGHT + 25 + LAUNCH_ZONE_HEIGHT / 2;
        const topZoneY = BOARD_Y - 25 - LAUNCH_ZONE_HEIGHT / 2;
        for (let i = 0; i < PIECES_PER_PLAYER; i++) {
            const x = CENTER_X - zoneWidth / 2 + (i + 0.5) * zoneWidth / PIECES_PER_PLAYER;
            this.piecesA.push(new Piece(x, bottomZoneY, 'A'));
            this.piecesB.push(new Piece(x, topZoneY, 'B'));
        }
        this.initNeutralPieces();
        this.piecesA.concat(this.piecesB).concat(this.piecesN).forEach(p => this.physics.addPiece(p));
    }

    getCurrentPiece() {
        if (this.currentPlayer === 'A') {
            const index = this.piecesA.length - this.piecesLeftA;
            return index < this.piecesA.length ? this.piecesA[index] : null;
        } else {
            const index = this.piecesB.length - this.piecesLeftB;
            return index < this.piecesB.length ? this.piecesB[index] : null;
        }
    }

    isBotTurn() {
        return this.gameMode === 'bot' && this.currentPlayer === 'B';
    }

    isOnlineGame() {
        return this.gameMode === 'online';
    }

    handleRemotePieceLaunch(pieceData) {
        const pieceArray = pieceData.player === 'A' ? this.piecesA : this.piecesB;
        const piece = pieceArray.find(p => !p.isLaunched && !p.isDiscarded);
        if (piece) {
            piece.x = pieceData.x;
            piece.y = pieceData.y;
            piece.vx = pieceData.vx;
            piece.vy = pieceData.vy;
            piece.isLaunched = true;
            piece.isActive = true;
            this.currentPlayer = pieceData.player; // Fix potential state desync
            this.isAnimating = true;
            this.audio.play('launch');
        }
    }

    update() {
        // 延迟胜利：等待小人动画播完、提示语展示完毕后再进入 gameOver
        if (this.pendingWin) {
            // 继续播放小人移动动画
            if (this.runnerAnimating) {
                const diff = this.runnerPosition - this.runnerDisplayPosition;
                if (Math.abs(diff) < RUNNER_SNAP_THRESHOLD) {
                    this.runnerDisplayPosition = this.runnerPosition;
                    this.runnerAnimating = false;
                } else {
                    this.runnerDisplayPosition += diff * RUNNER_SMOOTH_FACTOR;
                }
            }
            this.particles.update();
            // 小人动画结束后，展示提示语至少 1.5 秒，然后进入 gameOver
            if (!this.runnerAnimating) {
                if (!this.pendingWinTime) this.pendingWinTime = Date.now();
                if (Date.now() - this.pendingWinTime >= 1500) {
                    if (this.pendingWinReason === 'overtime') {
                        this.startOvertime();
                    } else {
                        this.pendingWin = false;
                        this.gameOver = true;
                        this.particles.emitWin(CENTER_X, CENTER_Y);
                        this.audio.play('win');
                    }
                }
            }
            return;
        }

        if (this.gameOver) return;
        
        const now = Date.now();
        if (this.dice.phase) {
            this.dice.update();
            return;
        }

        this.physics.update();
        this.particles.update();
        this.chat.update();

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
            if (this.gameMode === 'online') {
                const wasMyTurn = this.isMyTurn();
                if (wasMyTurn) {
                    // 只有主动方（出手的人）才进行回合结算和计分
                    // 被动方等待网络同步，避免双端重复计算导致累计得分
                    this.checkRoundEnd();
                    this.network.updateGameState(this.getState());
                }
            } else {
                // 本地模式：正常结算
                this.checkRoundEnd();
            }
        }

        // 如果在动画中，或者游戏结束，不更新倒计时逻辑
        if (!this.isAnimating && !this.dice.phase && !this.gameOver) {
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
                        this.pendingWin = true;
                        this.pendingWinReason = 'timeout';
                        this.pendingWinTime = Date.now();
                    }
                } else {
                    this.timeoutsB++;
                    if (this.timeoutsB >= 3) {
                        this.winner = 'A';
                        this.pendingWin = true;
                        this.pendingWinReason = 'timeout';
                        this.pendingWinTime = Date.now();
                    }
                }
                if (!this.pendingWin && !this.gameOver) {
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
            if (!piece.hasEnteredBoard) {
                piece.isLaunched = true;
                piece.isActive = false;
                piece.isDiscarded = true;
                piece.vx = 0;
                piece.vy = 0;
                
                const msg = '无效发球，棋子报废';
                if (this.ui.showTemporaryMessage) {
                    this.ui.showTemporaryMessage(msg, 1500);
                } else {
                    this.scorePopup = { text: msg, color: '#f44336', timer: 60, x: piece.x, y: piece.y };
                }
                this.isAnimating = false;
                
                // 扣除棋子并换人
                this.switchPlayer();

                const postWinReason = this.checkWinner();
                if (postWinReason) {
                    this.pendingWin = true;
                    this.pendingWinReason = postWinReason;
                    this.pendingWinTime = 0;
                }
                return;
            }

            this.currentScore = this.board.calculateScore(piece);
            this.updateRunnerPosition(this.currentScore);

            if (this.currentScore > 0) {
                const isTop = this.perspective === 'top';
                const sx = isTop ? this.tx(piece.x) : piece.x;
                const sy = isTop ? this.ty(piece.y) : piece.y;
                this.ui.addScoreAnimation(sx, sy - 30, this.currentScore);
                this.particles.emitScore(sx, sy);
                this.audio.play('score');
            }

            const winReason = this.checkWinner();
            if (winReason) {
                this.pendingWin = true;
                this.pendingWinReason = winReason;
                this.pendingWinTime = 0; // 等小人动画结束后才开始计时
                return;
            }
        }

        this.switchPlayer();

        // 切换玩家（扣除棋子）后，再检查一次是否所有棋子都用完了
        const postWinReason = this.checkWinner();
        if (postWinReason) {
            this.pendingWin = true;
            this.pendingWinReason = postWinReason;
            this.pendingWinTime = 0;
        }
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
        if (this.runnerPosition <= -WIN_THRESHOLD) { this.winner = 'A'; return 'runner'; }
        if (this.runnerPosition >= WIN_THRESHOLD) { this.winner = 'B'; return 'runner'; }

        if (this.piecesLeftA === 0 && this.piecesLeftB === 0) {
            if (this.runnerPosition < 0) {
                this.winner = 'A';
                return 'allUsed';
            } else if (this.runnerPosition > 0) {
                this.winner = 'B';
                return 'allUsed';
            } else {
                this.winner = null;
                return 'overtime';
            }
        }

        return false;
    }

    startOvertime() {
        this.pendingWin = false;
        this.pendingWinReason = null;
        this.pendingWinTime = null;
        this.winner = null;

        // 清空当前棋盘上的所有双方棋子，保留中立球
        this.piecesA = [];
        this.piecesB = [];
        this.physics.clearPieces();
        this.piecesN.forEach(p => this.physics.addPiece(p));
        
        // 各分配 3 颗新棋子
        const PIECES_IN_OVERTIME = 3;
        const spacing = 40; // 避免重叠
        const startX = BOARD_X + BOARD_WIDTH/2 - spacing;
        
        for (let i = 0; i < PIECES_IN_OVERTIME; i++) {
            // A队（下方）
            let ax = startX + i * spacing;
            // Y坐标必须和普通开局一样，才能被正常识别发球
            let ay = BOARD_Y + BOARD_HEIGHT + 25 + LAUNCH_ZONE_HEIGHT/2;
            let pieceA = new Piece(ax, ay, 'A');
            this.piecesA.push(pieceA);
            this.physics.addPiece(pieceA);

            // B队（上方）
            let bx = startX + i * spacing;
            let by = BOARD_Y - 25 - LAUNCH_ZONE_HEIGHT/2;
            let pieceB = new Piece(bx, by, 'B');
            this.piecesB.push(pieceB);
            this.physics.addPiece(pieceB);
        }
        
        this.piecesLeftA = PIECES_IN_OVERTIME;
        this.piecesLeftB = PIECES_IN_OVERTIME;

        // 交换球权（如果是上一轮最后出手的，就换人先手）
        this.currentPlayer = this.currentPlayer === 'A' ? 'B' : 'A';
        this.turnStartTime = Date.now();
        this.turnTimeLeft = 60;
        
        // 提示加时赛
        this.overtimePromptEndTime = Date.now() + 3000;
        
        // 把滑块拉回默认位置
        this.input.sliderValue = 0.5;
        this.input.applySliderToPiece();
        
        if (this.gameMode === 'online') {
            this.network.send({ type: 'game_state', state: this.getState() });
        }
    }

    getState() {
        return {
            scoreA: this.scoreA,
            scoreB: this.scoreB,
            roundNumber: this.roundNumber,
            currentPlayer: this.currentPlayer,
            turnStartTime: this.turnStartTime,
            turnTimeLeft: this.turnTimeLeft,
            dicePhase: this.dice.phase,
            diceResults: this.dice.results,
            diceTieResult: this.dice.tieResult,
            diceRolling: this.dice.opponentRolling,
            opponentRolling: this.dice.rolling,
            diceTargetVal: this.dice.opTargetVal,
            opDiceTargetVal: this.dice.targetVal,
            diceRollAnimEndTime: Date.now() + 2000,
            opDiceRollAnimEndTime: Date.now() + 2000,
            piecesLeftA: this.piecesLeftA,
            piecesLeftB: this.piecesLeftB,
            runnerPosition: this.runnerPosition,
            pendingWin: this.pendingWin,
            pendingWinReason: this.pendingWinReason,
            winner: this.winner,
            piecesA: this.piecesA.map(p => ({ x: p.x, y: p.y, isLaunched: p.isLaunched, isDiscarded: p.isDiscarded, isActive: p.isActive, hasEnteredBoard: p.hasEnteredBoard })),
            piecesB: this.piecesB.map(p => ({ x: p.x, y: p.y, isLaunched: p.isLaunched, isDiscarded: p.isDiscarded, isActive: p.isActive, hasEnteredBoard: p.hasEnteredBoard })),
            piecesN: this.piecesN.map(p => ({ x: p.x, y: p.y, isLaunched: p.isLaunched, isDiscarded: p.isDiscarded, isActive: p.isActive, hasEnteredBoard: p.hasEnteredBoard }))
        };
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
        
        if (!this.gameOver && !this.dice.phase && this.surrenderBtn) {
            const btn = this.surrenderBtn;
            if (mouseX >= btn.x && mouseX <= btn.x + btn.w &&
                mouseY >= btn.y && mouseY <= btn.y + btn.h) {
                this.modals.showSurrenderConfirm();
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

        // 清空上一局继承的AB（红蓝/上下）状态，恢复初始身份
        if (this.isOnlineGame()) {
            this.perspective = this.network.playerIndex === 'A' ? 'bottom' : 'top';
        } else {
            this.perspective = 'bottom';
        }

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
        this.turnStartTime = 0;
        this.turnTimeLeft = 60;
        this.timeoutsA = 0;
        this.timeoutsB = 0;

        this.particles.clear();
        this.physics.reset();
        this.piecesA = [];
        this.piecesB = [];
        this.piecesN = [];
        this.dice.startPhase();
        this.initPieces();
    }

    draw() {
        const ctx = this.ctx;

        ctx.fillStyle = '#0f0f1a';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        if (this.dice.phase) {
            this.dice.draw(ctx);
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
        // 当没有处于物理动画（处于瞄准状态）时，显示当前准备击发的棋子（不管是自己的还是对手的）
        const shouldShowCurrentPiece = cp && !cp.isLaunched && !this.isAnimating;
        if (shouldShowCurrentPiece) {
            const sx = isTop ? this.tx(cp.x) : cp.x;
            const sy = isTop ? this.ty(cp.y) : cp.y;
            cp.drawAt(ctx, sx, sy, true, p);
        }

        this.input.drawAimingLine(ctx);
        this.input.drawSlider(ctx);
        this.particles.draw(ctx);
        this.ui.draw(ctx);
    }

    gameLoop(timestamp = performance.now()) {
        if (this.isDestroyed) return;

        if (!this.lastTime) this.lastTime = timestamp;
        let dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Cap dt to prevent spiral of death if tab was inactive
        if (dt > 100) dt = 100;

        if (!this.accumulator) this.accumulator = 0;
        this.accumulator += dt;

        const fixedTimeStep = 1000 / 60; // 60Hz fixed update

        // Update logic in fixed steps to ensure deterministic physics across different monitor refresh rates (e.g. 60Hz vs 144Hz)
        while (this.accumulator >= fixedTimeStep) {
            this.update();
            this.accumulator -= fixedTimeStep;
        }

        this.draw();
        requestAnimationFrame((ts) => this.gameLoop(ts));
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
