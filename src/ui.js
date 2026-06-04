/**
 * @file ui.js
 * @description UI模块 - 绘制游戏界面元素：背景、标题、跑道、玩家信息和结算画面
 * Ring Rush - 弹棋
 */

import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    CENTER_X,
    CENTER_Y,
    BOARD_X,
    BOARD_Y,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    TRACK_X,
    TRACK_Y,
    TRACK_WIDTH,
    TRACK_HEIGHT,
    TRACK_STEPS,
    AI_DIFFICULTY,
    VERSION
} from './constants.js';

/**
 * UI类，负责所有非棋盘的界面绘制
 */
export class UI {
    /**
     * @param {object} game - 游戏主实例引用
     */
    constructor(game) {
        this.game = game;
        this.scoreAnimations = [];
    }

    /**
     * 绘制所有UI元素
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        this.drawBackground(ctx);
        this.drawTitle(ctx);
        this.drawTrack(ctx);
        this.drawPlayerInfo(ctx);
        this.drawNetworkStatus(ctx);
        this.drawSurrenderButton(ctx);
        this.drawScoreAnimations(ctx);
        this.drawChatBubbles(ctx);


        if (this.game.pendingWin) {
            this.drawPendingWin(ctx);
        }

        if (this.game.gameOver) {
            this.drawGameOver(ctx);
        } else if (this.game.opponentTemporarilyDisconnected) {
            this.drawDisconnectOverlay(ctx);
        }
    }

    /**
     * 绘制星空背景动画
     * @param {CanvasRenderingContext2D} ctx
     */
    drawBackground(ctx) {
        // 星空背景
        const time = Date.now() * 0.001;
        for (let i = 0; i < 50; i++) {
            const x = (Math.sin(i * 0.3 + time * 0.5) + 1) * CANVAS_WIDTH / 2;
            const y = (Math.cos(i * 0.5 + time * 0.3) + 1) * CANVAS_HEIGHT / 2;
            const size = Math.sin(i + time) * 0.5 + 1;
            const alpha = Math.sin(i * 0.7 + time) * 0.3 + 0.3;

            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * 绘制标题栏（游戏名、版本、回合数、模式标签）
     * @param {CanvasRenderingContext2D} ctx
     */
    drawTitle(ctx) {
        // 左上角：游戏名 + 版本
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#f0e68c';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('RING RUSH', 15, 10);
        ctx.fillStyle = '#555';
        ctx.font = '11px sans-serif';
        ctx.fillText(`弹棋 ${VERSION}`, 15, 32);

        // 顶部居中：模式标签
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px sans-serif';
        if (this.game.gameMode === 'bot') {
            ctx.fillStyle = AI_DIFFICULTY[this.game.ai.difficulty].color;
            ctx.fillText(`Bot (${AI_DIFFICULTY[this.game.ai.difficulty].name})`, CENTER_X, 15);
        } else if (this.game.gameMode === 'online') {
            ctx.fillStyle = '#4CAF50';
            ctx.fillText('在线对战', CENTER_X, 15);
        }
        
        // 模式标签正下方：回合
        ctx.fillStyle = '#f0e68c';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`回合 ${this.game.roundNumber}`, CENTER_X, 35);
    }

    /**
     * 绘制跑道（得分追踪条）
     * @param {CanvasRenderingContext2D} ctx
     */
    drawTrack(ctx) {
        const stepHeight = TRACK_HEIGHT / TRACK_STEPS;
        const isBottom = this.game.perspective === 'bottom';
        const halfSteps = (TRACK_STEPS - 1) / 2; // 6
        const labels = isBottom
            ? ['A胜', '5', '4', '3', '2', '1', '0', '1', '2', '3', '4', '5', 'B胜']
            : ['B胜', '5', '4', '3', '2', '1', '0', '1', '2', '3', '4', '5', 'A胜'];

        ctx.fillStyle = '#f0e68c';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('跑', TRACK_X + TRACK_WIDTH / 2, TRACK_Y - 30);
        ctx.fillText('道', TRACK_X + TRACK_WIDTH / 2, TRACK_Y - 15);

        for (let i = 0; i < TRACK_STEPS; i++) {
            const y = TRACK_Y + i * stepHeight;
            const position = halfSteps - i; // 3, 2, 1, 0, -1, -2, -3

            let fillColor;
            if (isBottom) {
                fillColor = position > 0 ? 'rgba(217,74,74,0.4)' : position < 0 ? 'rgba(74,144,217,0.4)' : 'rgba(200,200,200,0.3)';
            } else {
                fillColor = position > 0 ? 'rgba(74,144,217,0.4)' : position < 0 ? 'rgba(217,74,74,0.4)' : 'rgba(200,200,200,0.3)';
            }

            ctx.fillStyle = fillColor;
            ctx.beginPath(); ctx.roundRect(TRACK_X, y, TRACK_WIDTH, stepHeight - 2, 4); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();

            ctx.fillStyle = '#ccc'; ctx.font = '13px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(labels[i], TRACK_X + TRACK_WIDTH / 2, y + stepHeight / 2);
        }

        const visualPosition = isBottom ? this.game.runnerDisplayPosition : -this.game.runnerDisplayPosition;
        const runnerIndex = halfSteps - visualPosition;
        const runnerY = TRACK_Y + runnerIndex * stepHeight + stepHeight / 2;
        const runnerX = TRACK_X + TRACK_WIDTH / 2;

        // 小人发光
        ctx.save();
        ctx.shadowColor = '#f0e68c';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(runnerX, runnerY, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#f0e68c';
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(runnerX - 4, runnerY - 3, 2, 0, Math.PI * 2);
        ctx.arc(runnerX + 4, runnerY - 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(runnerX, runnerY + 3, 4, 0, Math.PI);
        ctx.stroke();
    }

    /**
     * 绘制玩家信息（名字和剩余棋子数）
     * @param {CanvasRenderingContext2D} ctx
     */
    drawPlayerInfo(ctx) {
        const isBottom = this.game.perspective === 'bottom';
        const myIsTurn = this.game.isMyTurn();
        
        // 自己在下方
        const myColor = isBottom ? '#4a90d9' : '#d94a4a';
        const myLeft = isBottom ? this.game.piecesLeftA : this.game.piecesLeftB;
        const myName = isBottom ? '你 (A)' : '你 (B)';

        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = myColor; ctx.font = 'bold 16px sans-serif';
        ctx.fillText(myName, 30, CANVAS_HEIGHT - 45); // 移到底部，在滑杆下方
        ctx.fillStyle = '#aaa'; ctx.font = '14px sans-serif';
        ctx.fillText(`剩余: ${myLeft}`, 30, CANVAS_HEIGHT - 25);
        
        if (myIsTurn && !this.game.gameOver && !this.game.dice.phase) {
            ctx.textAlign = 'right';
            ctx.fillStyle = this.game.turnTimeLeft <= 10 ? '#f44336' : '#FF9800'; 
            ctx.font = 'bold 16px sans-serif';
            // 思考时间固定在右侧上方
            ctx.fillText(`思考时间: ${this.game.turnTimeLeft}s`, CANVAS_WIDTH - 30, BOARD_Y - 55);
        }

        // 对手在上方
        const opColor = isBottom ? '#d94a4a' : '#4a90d9';
        const opLeft = isBottom ? this.game.piecesLeftB : this.game.piecesLeftA;
        let opName = isBottom ? '对手 (B)' : '对手 (A)';
        if (this.game.gameMode === 'online' && this.game.opponentName) opName = this.game.opponentName;
        const opIsTurn = !myIsTurn;

        ctx.textAlign = 'left';
        ctx.fillStyle = opColor; ctx.font = 'bold 16px sans-serif';
        ctx.fillText(opName, 30, BOARD_Y - 55);
        ctx.fillStyle = '#aaa'; ctx.font = '14px sans-serif';
        ctx.fillText(`剩余: ${opLeft}`, 30, BOARD_Y - 35);
        
        if (opIsTurn && !this.game.gameOver && !this.game.dice.phase) {
            ctx.textAlign = 'right';
            ctx.fillStyle = this.game.turnTimeLeft <= 10 ? '#f44336' : '#FF9800';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(`思考时间: ${this.game.turnTimeLeft}s`, CANVAS_WIDTH - 30, BOARD_Y - 55);
        }
    }

    /**
     * 绘制网络/AI状态提示
     * @param {CanvasRenderingContext2D} ctx
     */
    drawNetworkStatus(ctx) {
        if (this.game.gameMode === 'bot' && this.game.ai.isThinking) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);
            ctx.fillText(`AI 思考中${dots}`, CENTER_X, CANVAS_HEIGHT - 25);
        }

        if (this.game.isOnlineGame()) {
            ctx.fillStyle = '#4CAF50';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('已连接', CENTER_X, CANVAS_HEIGHT - 25);
        }
    }

    /**
     * 绘制投降按钮
     * @param {CanvasRenderingContext2D} ctx
     */
    drawSurrenderButton(ctx) {
        if (this.game.gameOver || this.game.dice.phase) return;
        
        let isTop = false;
        if (this.game.gameMode === 'local' && this.game.currentPlayer === 'B') {
            isTop = true;
        } else if (this.game.gameMode === 'bot' && this.game.currentPlayer === 'B') {
            return; // Bot doesn't surrender
        }
        
        const btnW = 60;
        const btnH = 28;
        let btnX, btnY;

        if (isTop) {
            // Local Player B (screen flipped): their top-right is bottom-left
            btnX = 20;
            btnY = CANVAS_HEIGHT - 12 - btnH;
        } else {
            // Local Player A or Online Player: top-right
            btnX = CANVAS_WIDTH - 20 - btnW;
            btnY = 12;
        }

        ctx.fillStyle = 'rgba(244, 67, 54, 0.2)';
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 5);
        ctx.fill();
        ctx.strokeStyle = '#f44336';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#f44336';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.save();
        if (isTop) {
            ctx.translate(btnX + btnW / 2, btnY + btnH / 2);
            ctx.rotate(Math.PI);
            ctx.fillText('投降', 0, 0);
        } else {
            ctx.fillText('投降', btnX + btnW / 2, btnY + btnH / 2);
        }
        ctx.restore();

        this.game.surrenderBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
    }

    /**
     * 添加得分浮动动画
     * @param {number} x
     * @param {number} y
     * @param {number} score
     */
    addScoreAnimation(x, y, score) {
        this.scoreAnimations.push({
            x, y,
            score,
            timer: 100,
            startY: y
        });
    }

    /**
     * 绘制并更新得分浮动动画
     * @param {CanvasRenderingContext2D} ctx
     */
    drawScoreAnimations(ctx) {
        this.scoreAnimations = this.scoreAnimations.filter(anim => {
            anim.timer -= 2;
            anim.y = anim.startY - (100 - anim.timer) * 0.8;

            const alpha = anim.timer / 100;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 36px sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 10;
            ctx.fillText(`+${anim.score}`, anim.x, anim.y);
            ctx.restore();

            return anim.timer > 0;
        });
    }

    /**
     * 绘制聊天气泡
     * @param {CanvasRenderingContext2D} ctx
     */
    drawChatBubbles(ctx) {
        if (!this.game.chat || !this.game.chat.chatMessages) return;

        ctx.font = 'bold 16px sans-serif';
        this.game.chat.chatMessages.forEach(msg => {
            const isMe = msg.playerIndex === this.game.network.playerIndex;
            // 名字的位置和视角翻转无关，自己的名字永远在屏幕下方，对手永远在屏幕上方
            const drawAtBottom = isMe;

            const text = msg.text;
            const metrics = ctx.measureText(text);
            const w = metrics.width + 30;
            const h = 40;
            let x, y;

            if (drawAtBottom) {
                // 出现在自己滑杆（y=830）的上方
                x = 30;
                y = CANVAS_HEIGHT - 120;
            } else {
                // 出现在对手滑杆（y=70）的下方
                x = 30;
                y = 100;
            }

            ctx.fillStyle = 'rgba(40, 40, 40, 0.85)';
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 12);
            ctx.fill();
            ctx.stroke();

            // 小尾巴指向名字
            ctx.beginPath();
            if (drawAtBottom) {
                // 尾巴在左下角，指向名字上方
                ctx.moveTo(x + 15, y + h);
                ctx.lineTo(x + 5, y + h + 10);
                ctx.lineTo(x + 25, y + h);
            } else {
                // 尾巴在左上角，指向名字下方
                ctx.moveTo(x + 15, y);
                ctx.lineTo(x + 5, y - 10);
                ctx.lineTo(x + 25, y);
            }
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x + w / 2, y + h / 2);
        });
    }

    drawPendingWin(ctx) {
        if (!this.game.pendingWinReason) return;
        
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, CANVAS_HEIGHT / 2 - 60, CANVAS_WIDTH, 120);
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px sans-serif';
        
        let msg = '';
        const isWinner = this.game.winner === (this.game.perspective === 'bottom' ? 'A' : 'B');
        const isLocal = this.game.gameMode === 'local';

        let winText = '';
        let loseText = '';
        if (isLocal) {
            winText = this.game.winner === 'A' ? '蓝方' : '红方';
            loseText = this.game.winner === 'A' ? '红方' : '蓝方';
        } else {
            winText = isWinner ? '你' : '对手';
            loseText = isWinner ? '对手' : '你';
        }

        if (this.game.pendingWinReason === 'surrender') {
            msg = `${loseText}投降了！`;
        } else if (this.game.pendingWinReason === 'runner') {
            msg = `${winText}到达终点！`;
        } else if (this.game.pendingWinReason === 'timeout') {
            msg = `${loseText}超时判负！`;
        } else if (this.game.pendingWinReason === 'allUsed') {
            msg = '棋子用尽！';
        } else if (this.game.pendingWinReason === 'overtime') {
            msg = '平局！进入加时赛 (+3子)';
        }
        
        ctx.fillText(msg, CENTER_X, CENTER_Y);
        ctx.restore();
    }

    /**
     * 绘制游戏结束画面（胜利/平局 + 重新开始按钮）
     * @param {CanvasRenderingContext2D} ctx
     */
    drawGameOver(ctx) {
        // 半透明覆盖层
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 胜利/平局信息
        ctx.save();
        ctx.textAlign = 'center';
        
        if (this.game.winner) {
            if (this.game.gameMode === 'local') {
                const isBlueWin = this.game.winner === 'A';
                ctx.shadowColor = isBlueWin ? '#4a90d9' : '#f44336';
                ctx.shadowBlur = 20;
                ctx.fillStyle = isBlueWin ? '#4a90d9' : '#f44336';
                ctx.font = 'bold 64px sans-serif';
                ctx.fillText(isBlueWin ? '蓝方胜利！' : '红方胜利！', CENTER_X, CENTER_Y - 80);
                
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff';
                ctx.font = '24px sans-serif';
                const sa = this.game.scoreA || 0;
                const sb = this.game.scoreB || 0;
                ctx.fillText(`得分比 ${sa} : ${sb}`, CENTER_X, CENTER_Y - 20);
            } else {
                const isWinner = this.game.winner === (this.game.perspective === 'bottom' ? 'A' : 'B');
                ctx.shadowColor = isWinner ? '#ffd700' : '#f44336';
                ctx.shadowBlur = 20;
                ctx.fillStyle = isWinner ? '#ffd700' : '#f44336';
                ctx.font = 'bold 64px sans-serif';
                ctx.fillText(isWinner ? 'VICTORY' : 'DEFEAT', CENTER_X, CENTER_Y - 80);
                
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff';
                ctx.font = '24px sans-serif';
                ctx.fillText(isWinner ? '恭喜！你赢得了比赛！' : '很遗憾，你输了比赛。', CENTER_X, CENTER_Y - 20);
            }
        } else {
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 20;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 64px sans-serif';
            ctx.fillText('DRAW', CENTER_X, CENTER_Y - 80);
            ctx.shadowBlur = 0;
            ctx.font = '24px sans-serif';
            ctx.fillText('平局！', CENTER_X, CENTER_Y - 20);
        }
        ctx.restore();

        // 重新开始按钮
        const btnX = CENTER_X - 100;
        const btnY = CENTER_Y + 60;
        const btnW = 200;
        const btnH = 60;

        if (this.game.showRestartAgreed) {
            ctx.fillStyle = '#4CAF50';
            ctx.textAlign = 'center';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText('双方已同意，即将开始...', CENTER_X, btnY + 30);
            this.game.restartBtn = null;
        } else if (this.game.waitingForRestart) {
            ctx.fillStyle = '#aaa';
            ctx.textAlign = 'center';
            ctx.font = '20px sans-serif';
            ctx.fillText('等待对方同意...', CENTER_X, btnY + 30);
            this.game.restartBtn = null;
        } else if (this.game.opponentLeft) {
            ctx.fillStyle = '#f44336';
            ctx.textAlign = 'center';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText('对方已经退出房间', CENTER_X, btnY - 20);

            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.roundRect(btnX, btnY, btnW, btnH, 12);
            ctx.fill();

            ctx.fillStyle = '#aaa';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText('再来一局', CENTER_X, btnY + 30);
            
            this.game.restartBtn = null;
        } else {
            if (this.game.opponentWantsRestart) {
                ctx.fillStyle = '#4CAF50';
                ctx.textAlign = 'center';
                ctx.font = 'bold 20px sans-serif';
                ctx.fillText('对方邀请再来一局', CENTER_X, btnY - 20);
            }

            const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
            grad.addColorStop(0, '#4a90d9');
            grad.addColorStop(1, '#3266a8');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(btnX, btnY, btnW, btnH, 12);
            ctx.fill();
            ctx.strokeStyle = '#8bbdff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText(this.game.opponentWantsRestart ? '同意并开始' : '再来一局', CENTER_X, btnY + 30);

            this.game.restartBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
        }

        // 退出游戏按钮
        const exitBtnY = btnY + btnH + 20;
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.roundRect(btnX, exitBtnY, btnW, 40, 8);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('退出游戏', CENTER_X, exitBtnY + 20);

        this.game.exitBtn = { x: btnX, y: exitBtnY, w: btnW, h: 40 };
    }

    /**
     * 绘制对方断线等待遮罩
     * @param {CanvasRenderingContext2D} ctx
     */
    drawDisconnectOverlay(ctx) {
        const bannerW = 300;
        const bannerH = 80;
        const bannerX = CENTER_X - bannerW / 2;
        const bannerY = 80;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.beginPath();
        ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 10);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        
        // 简单的闪烁动画
        const alpha = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 300));
        ctx.globalAlpha = alpha;
        ctx.fillText('对方已断线，等待重连中...', CENTER_X, bannerY + 30);
        
        ctx.globalAlpha = 1.0;
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.fillText('（60秒内未重连将自动判负）', CENTER_X, bannerY + 55);
    }


}
