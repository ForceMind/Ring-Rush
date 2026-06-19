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
    VERSION,
    SCORING_ZONES
} from './constants.js';
import { t } from './i18n.js';
import { drawUIAsset, getButtonAsset } from './ui-assets.js';

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
        this.missAnimations = [];
        this.launchCues = [];
        this.wallBounces = [];
        this.settleCues = [];
        this.zonePulses = [];
        this.runnerImpacts = [];
        this.palette = {
            ink: '#143642',
            muted: '#57717d',
            panel: 'rgba(255, 255, 255, 0.9)',
            panelStrong: 'rgba(255, 255, 255, 0.96)',
            line: 'rgba(255, 255, 255, 0.72)',
            orange: '#ff8a3d',
            green: '#35b779',
            blue: '#2d9cdb',
            danger: '#ef5350',
            gold: '#f6c945'
        };
    }

    getScreenSlot(position) {
        const bottomSlot = this.game.perspective === 'bottom' ? 'A' : 'B';
        const topSlot = bottomSlot === 'A' ? 'B' : 'A';
        return position === 'bottom' ? bottomSlot : topSlot;
    }

    getMySlot() {
        return this.getScreenSlot('bottom');
    }

    getOpponentSlot() {
        return this.getScreenSlot('top');
    }

    isSlotTurn(slot) {
        return this.game.currentPlayer === slot;
    }

    getModeLabel() {
        if (this.game.competitiveMatch?.mode === 'ai') return t('modeAi');
        if (this.game.competitiveMatch) return t('modeOnline');
        if (this.game.gameMode === 'bot') return t('modePractice');
        if (this.game.gameMode === 'local') return t('modeLocal');
        if (this.game.gameMode === 'online') return t('modeOnline');
        return t('modePractice');
    }

    getEconomyLabel() {
        const match = this.game.competitiveMatch;
        if (!match) return t('noStake');
        return t('stakePayout', { stake: match.stake, payout: match.winnerPayout });
    }

    getSlotName(slot, position) {
        if (position === 'bottom') return t('you');
        if (this.game.gameMode === 'bot' && slot === 'B') return 'Pello AI';
        if (this.game.gameMode === 'local') return slot === 'A' ? t('player1') : t('player2');
        if (this.game.gameMode === 'online' && this.game.opponentName) return this.game.opponentName;
        return t('opponent');
    }

    getTurnText(slot, position) {
        if (!this.isSlotTurn(slot)) {
            return position === 'bottom' ? t('waitTurnHint') : t('wait');
        }
        if (position === 'bottom') return t('yourTurn');
        if (this.game.gameMode === 'bot' && slot === 'B') return t('botTurn');
        return t('rivalTurn');
    }

    getPiecesLeft(slot) {
        return slot === 'A' ? this.game.piecesLeftA : this.game.piecesLeftB;
    }

    hexToRgb(hex) {
        return `${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}`;
    }

    drawRoundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
    }

    drawSoftPanel(ctx, x, y, w, h, radius = 12, fill = this.palette.panel, assetName = undefined) {
        const resolvedAsset = assetName === false ? null : (assetName || (h > 230 ? 'modal' : 'panel'));
        if (resolvedAsset && drawUIAsset(ctx, resolvedAsset, x, y, w, h)) {
            return;
        }

        ctx.save();
        ctx.fillStyle = fill;
        ctx.strokeStyle = this.palette.line;
        ctx.lineWidth = 2;
        this.drawRoundRect(ctx, x, y, w, h, radius);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    drawImageButton(ctx, x, y, w, h, label, color, fontSize = 20) {
        ctx.save();
        if (!drawUIAsset(ctx, getButtonAsset(color), x, y, w, h)) {
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, color);
            grad.addColorStop(1, '#1d7f52');
            ctx.fillStyle = grad;
            this.drawRoundRect(ctx, x, y, w, h, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.68)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillText(label, x + w / 2, y + h / 2, w - 24);
        ctx.restore();
    }

    /**
     * 绘制所有UI元素
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        this.drawTitle(ctx);
        this.drawTrack(ctx);
        this.drawPlayerInfo(ctx);
        this.drawNetworkStatus(ctx);
        this.drawSurrenderButton(ctx);
        this.drawFeedbackEffects(ctx);
        this.drawScoreAnimations(ctx);
        this.drawChatBubbles(ctx);

        if (this.game.overtimePromptEndTime && Date.now() < this.game.overtimePromptEndTime) {
            ctx.save();
            ctx.fillStyle = '#ffdf00';
            ctx.font = 'bold 36px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            const alpha = Math.max(0, (this.game.overtimePromptEndTime - Date.now()) / 1000);
            ctx.globalAlpha = Math.min(1, alpha);
            
            ctx.fillText(t('overtimeBonus'), CENTER_X, CENTER_Y - 50);
            ctx.restore();
        }

        if (this.game.pendingWin) {
            this.drawPendingWin(ctx);
        }

        if (this.game.gameOver) {
            this.drawGameOver(ctx);
        } else {
            if (this.game.opponentTemporarilyDisconnected) {
                this.drawDisconnectOverlay(ctx);
            }
            if (this.game.isServerSettledGame() && this.game.connectionStatus && this.game.connectionStatus !== 'connected') {
                this.drawConnectionOverlay(ctx);
            }
        }
    }

    /**
     * 绘制星空背景动画
     * @param {CanvasRenderingContext2D} ctx
     */
    drawBackground(ctx) {
        if (drawUIAsset(ctx, 'background', 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)) {
            return;
        }

        const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        bg.addColorStop(0, '#8fe4ff');
        bg.addColorStop(0.44, '#fff3a9');
        bg.addColorStop(1, '#73df9f');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const time = Date.now() * 0.001;
        ctx.save();
        for (let i = 0; i < 18; i++) {
            const x = ((i * 97 + Math.sin(time * 0.55 + i) * 18) % (CANVAS_WIDTH + 90)) - 45;
            const y = 120 + ((i * 71 + Math.cos(time * 0.42 + i) * 12) % 700);
            const w = 38 + (i % 4) * 12;
            const h = 82 + (i % 3) * 18;
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#fff8bc';
            this.drawRoundRect(ctx, x, y, w, h, w / 2);
            ctx.fill();
        }
        ctx.restore();

        const ground = ctx.createLinearGradient(0, BOARD_Y + BOARD_HEIGHT - 20, 0, CANVAS_HEIGHT);
        ground.addColorStop(0, 'rgba(69, 164, 112, 0)');
        ground.addColorStop(1, 'rgba(35, 123, 74, 0.26)');
        ctx.fillStyle = ground;
        ctx.fillRect(0, BOARD_Y + BOARD_HEIGHT - 20, CANVAS_WIDTH, CANVAS_HEIGHT - BOARD_Y - BOARD_HEIGHT + 20);
    }

    /**
     * 绘制标题栏（游戏名、版本、回合数、模式标签）
     * @param {CanvasRenderingContext2D} ctx
     */
    drawTitle(ctx) {
        const x = 14;
        const y = 16;
        const w = CANVAS_WIDTH - 28;
        const h = 58;
        if (!drawUIAsset(ctx, 'topbar', x, y, w, h)) {
            this.drawSoftPanel(ctx, x, y, w, h, 18, 'rgba(255,255,255,0.84)');
        }

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = this.palette.ink;
        ctx.font = '900 23px sans-serif';
        ctx.fillText('PELLO', x + 14, y + 26);
        ctx.fillStyle = this.palette.muted;
        ctx.font = '10px sans-serif';
        ctx.fillText(`v${VERSION}`, x + 88, y + 29);

        const mode = this.getModeLabel();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        const pillX = CENTER_X - 68;
        const pillY = y + 10;
        const pillW = 136;
        const pillH = 38;
        if (!drawUIAsset(ctx, 'buttonBlue', pillX, pillY - 2, pillW, pillH + 8)) {
            const modeGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
            modeGrad.addColorStop(0, this.palette.blue);
            modeGrad.addColorStop(1, '#1977b7');
            ctx.fillStyle = modeGrad;
            this.drawRoundRect(ctx, pillX, pillY, pillW, pillH, 12);
            ctx.fill();
        }
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(mode, CENTER_X, pillY + pillH / 2);

        ctx.textAlign = 'right';
        ctx.fillStyle = this.palette.ink;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(t('roundLabel', { round: this.game.roundNumber }), x + w - 22, y + 20);
        ctx.fillStyle = this.palette.muted;
        ctx.font = '10px sans-serif';
        ctx.fillText(this.getEconomyLabel(), x + w - 22, y + 42);
    }

    /**
     * 绘制跑道（得分追踪条）
     * @param {CanvasRenderingContext2D} ctx
     */
    drawTrack(ctx) {
        const stepHeight = TRACK_HEIGHT / TRACK_STEPS;
        const isBottom = this.game.perspective === 'bottom';
        const halfSteps = (TRACK_STEPS - 1) / 2; // 6
        const topSlot = this.getScreenSlot('top');
        const bottomSlot = this.getScreenSlot('bottom');

        const topStroke = this.game.getPlayerColor(topSlot);
        const bottomStroke = this.game.getPlayerColor(bottomSlot);

        const panelX = 5;
        const panelY = TRACK_Y - 54;
        const panelW = 42;
        const panelH = TRACK_HEIGHT + 104;
        this.drawSoftPanel(ctx, panelX, panelY, panelW, panelH, 16, 'rgba(255,255,255,0.78)', 'panel');

        ctx.save();
        ctx.fillStyle = this.palette.ink;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('raceTitle'), TRACK_X + TRACK_WIDTH / 2, TRACK_Y - 38);
        ctx.restore();

        for (let i = 0; i < TRACK_STEPS; i++) {
            const y = TRACK_Y + i * stepHeight;
            const position = halfSteps - i; // 3, 2, 1, 0, -1, -2, -3

            let fillColor;
            if (position > 0) {
                fillColor = `rgba(${this.hexToRgb(topStroke)}, 0.34)`;
            } else if (position < 0) {
                fillColor = `rgba(${this.hexToRgb(bottomStroke)}, 0.34)`;
            } else {
                fillColor = 'rgba(255,255,255,0.46)';
            }

            ctx.fillStyle = fillColor;
            this.drawRoundRect(ctx, TRACK_X, y, TRACK_WIDTH, stepHeight - 3, 9);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.46)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = position === 0 ? this.palette.ink : 'rgba(20,54,66,0.66)';
            ctx.font = position === 0 ? 'bold 12px sans-serif' : '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = position === 0 ? '0' : String(Math.abs(position));
            ctx.fillText(label, TRACK_X + TRACK_WIDTH / 2, y + stepHeight / 2);
        }

        const visualPosition = isBottom ? this.game.runnerDisplayPosition : -this.game.runnerDisplayPosition;
        const runnerIndex = halfSteps - visualPosition;
        const runnerY = TRACK_Y + runnerIndex * stepHeight + stepHeight / 2;
        const runnerX = TRACK_X + TRACK_WIDTH / 2;

        ctx.save();
        ctx.shadowColor = this.palette.gold;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(runnerX, runnerY, 13, 0, Math.PI * 2);
        ctx.fillStyle = this.palette.gold;
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = '#143642';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#143642';
        ctx.beginPath();
        ctx.arc(runnerX - 4, runnerY - 3, 2, 0, Math.PI * 2);
        ctx.arc(runnerX + 4, runnerY - 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(runnerX, runnerY + 3, 4, 0, Math.PI);
        ctx.stroke();

        this.runnerImpacts = this.runnerImpacts.filter(impact => {
            impact.timer--;
            const alpha = impact.timer / impact.max;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(runnerX, runnerY, 16 + (1 - alpha) * 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return impact.timer > 0;
        });

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = topStroke;
        ctx.fillText(t('finishTop'), TRACK_X + TRACK_WIDTH / 2, TRACK_Y - 20);
        ctx.fillStyle = bottomStroke;
        ctx.fillText(t('finishBottom'), TRACK_X + TRACK_WIDTH / 2, TRACK_Y + TRACK_HEIGHT + 28);
        ctx.restore();
    }

    /**
     * 绘制玩家信息（名字和剩余棋子数）
     * @param {CanvasRenderingContext2D} ctx
     */
    drawPlayerInfo(ctx) {
        this.drawPlayerCard(ctx, 'top', 84);
        this.drawPlayerCard(ctx, 'bottom', CANVAS_HEIGHT - 122);
    }

    drawPlayerCard(ctx, position, y) {
        const slot = this.getScreenSlot(position);
        const color = this.game.getPlayerColor(slot);
        const active = this.isSlotTurn(slot) && !this.game.gameOver && !this.game.dice.phase;
        const x = 58;
        const w = 334;
        const h = position === 'top' ? 50 : 60;
        const rgb = this.hexToRgb(color);

        ctx.save();
        ctx.shadowColor = active ? `rgba(${rgb}, 0.5)` : 'rgba(20,54,66,0.12)';
        ctx.shadowBlur = active ? 14 : 6;
        if (!drawUIAsset(ctx, 'playerCard', x, y, w, h)) {
            this.drawSoftPanel(ctx, x, y, w, h, 16, active ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.82)');
        }

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = active ? 10 : 5;
        ctx.fillStyle = color;
        this.drawRoundRect(ctx, x + 12, y + 10, 32, 32, 11);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.82)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.beginPath();
        ctx.arc(x + 22, y + 19, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slot, x + 28, y + 26);

        ctx.textAlign = 'left';
        ctx.fillStyle = this.palette.ink;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(this.getSlotName(slot, position), x + 56, y + 19);

        ctx.fillStyle = this.palette.muted;
        ctx.font = '12px sans-serif';
        ctx.fillText(t('piecesShort', { count: this.getPiecesLeft(slot) }), x + 56, y + 36);

        ctx.textAlign = 'right';
        ctx.fillStyle = active ? color : this.palette.muted;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(this.getTurnText(slot, position), x + w - 18, y + 18);

        if (active) {
            const timerColor = this.game.turnTimeLeft <= 10 ? this.palette.danger : this.palette.orange;
            ctx.fillStyle = timerColor;
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(t('timerShort', { seconds: this.game.turnTimeLeft }), x + w - 18, y + 38);
        } else if (position === 'bottom' && !this.game.gameOver && !this.game.dice.phase) {
            ctx.fillStyle = this.palette.muted;
            ctx.font = '12px sans-serif';
            ctx.fillText(t('waitTurnHint'), x + w - 18, y + 42);
        }

        if (position === 'bottom' && active && !this.game.isAnimating) {
            ctx.textAlign = 'center';
            ctx.fillStyle = `rgba(${rgb}, 0.86)`;
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(t('aimHint'), CENTER_X, BOARD_Y + BOARD_HEIGHT + 86);
        }
        ctx.restore();
    }

    /**
     * 绘制网络/AI状态提示
     * @param {CanvasRenderingContext2D} ctx
     */
    drawNetworkStatus(ctx) {
        if (this.game.gameMode === 'bot' && this.game.ai.isThinking) {
            const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);
            const y = 140;
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            this.drawRoundRect(ctx, CENTER_X - 94, y, 188, 30, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 107, 107, 0.45)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#d9480f';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t('aiThinking', { dots }), CENTER_X, y + 15);
            ctx.restore();
        }

        if (this.game.isServerSettledGame()) {
            const status = this.game.connectionStatus || 'connected';
            const connected = status === 'connected';
            const label = connected ? t('connected') : t('reconnecting');
            const color = connected ? this.palette.green : '#ffb020';
            ctx.save();
            ctx.fillStyle = `rgba(${this.hexToRgb(color)}, 0.16)`;
            this.drawRoundRect(ctx, CENTER_X - 80, CANVAS_HEIGHT - 26, 160, 18, 9);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, CENTER_X, CANVAS_HEIGHT - 17);
            ctx.restore();
        }
    }

    /**
     * 绘制投降按钮
     * @param {CanvasRenderingContext2D} ctx
     */
    drawSurrenderButton(ctx) {
        if (this.game.gameOver || this.game.dice.phase) return;
        
        if (this.game.gameMode === 'local') {
            this.game.surrenderBtn = null;
            return; // Hide surrender in local mode
        } else if (this.game.gameMode === 'bot' && this.game.isBotTurn()) {
            this.game.surrenderBtn = null;
            return; // Bot doesn't surrender
        }
        
        const btnW = 86;
        const btnH = 34;
        const btnX = CANVAS_WIDTH - 100;
        const btnY = 188;

        ctx.save();
        ctx.fillStyle = 'rgba(239, 83, 80, 0.14)';
        this.drawRoundRect(ctx, btnX, btnY, btnW, btnH, 13);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 83, 80, 0.65)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = this.palette.danger;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('surrender'), btnX + btnW / 2, btnY + btnH / 2);
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
            timer: 170,
            max: 170,
            startY: y
        });
    }

    addMissAnimation(x, y) {
        this.missAnimations.push({ x, y, timer: 72, max: 72, startY: y });
    }

    addLaunchCue(x, y, power) {
        this.launchCues.push({
            x,
            y,
            power: Math.max(0, Math.min(1, power)),
            timer: 28,
            max: 28
        });
    }

    addWallBounce(x, y, intensity = 1) {
        this.wallBounces.push({
            x,
            y,
            intensity: Math.max(0.5, Math.min(2.2, intensity)),
            timer: 24,
            max: 24
        });
    }

    addSettleCue(x, y) {
        this.settleCues.push({ x, y, timer: 32, max: 32 });
    }

    addScoreZonePulse(score) {
        if (score <= 0) return;
        const radius = {
            2: SCORING_ZONES.square.radius,
            3: SCORING_ZONES.pentagon.radius,
            4: SCORING_ZONES.hexagon.radius,
            5: SCORING_ZONES.center.radius
        }[score] || SCORING_ZONES.square.radius;
        this.zonePulses.push({
            radius,
            score,
            timer: score === 5 ? 52 : 38,
            max: score === 5 ? 52 : 38
        });
    }

    addRunnerImpact(score) {
        if (score <= 0) return;
        this.runnerImpacts.push({
            score,
            timer: 28 + score * 3,
            max: 28 + score * 3
        });
    }

    drawFeedbackEffects(ctx) {
        this.drawScoreZonePulses(ctx);
        this.drawLaunchCues(ctx);
        this.drawWallBounces(ctx);
        this.drawSettleCues(ctx);
        this.drawMissAnimations(ctx);
    }

    drawScoreZonePulses(ctx) {
        this.zonePulses = this.zonePulses.filter(pulse => {
            pulse.timer--;
            const t = 1 - pulse.timer / pulse.max;
            const alpha = pulse.timer / pulse.max;
            ctx.save();
            ctx.globalAlpha = alpha * 0.66;
            ctx.strokeStyle = pulse.score === 5 ? '#ffd700' : '#ffffff';
            ctx.fillStyle = pulse.score === 5
                ? `rgba(255, 215, 0, ${0.1 * alpha})`
                : `rgba(255, 255, 255, ${0.07 * alpha})`;
            ctx.lineWidth = pulse.score === 5 ? 3.5 : 2.5;
            ctx.shadowColor = pulse.score === 5 ? '#ffd700' : '#ffffff';
            ctx.shadowBlur = pulse.score === 5 ? 12 : 7;
            this.drawScorePulseShape(ctx, pulse.score, pulse.radius + t * 10);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            return pulse.timer > 0;
        });
    }

    drawScorePulseShape(ctx, score, radius) {
        if (score === 2) {
            ctx.beginPath();
            ctx.roundRect(CENTER_X - radius, CENTER_Y - radius, radius * 2, radius * 2, 10);
            return;
        }

        if (score === 4) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 6;
                const x = CENTER_X + Math.cos(angle) * radius;
                const y = CENTER_Y + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            return;
        }

        ctx.beginPath();
        ctx.arc(CENTER_X, CENTER_Y, radius, 0, Math.PI * 2);
    }

    drawLaunchCues(ctx) {
        this.launchCues = this.launchCues.filter(cue => {
            cue.timer--;
            const t = 1 - cue.timer / cue.max;
            const alpha = cue.timer / cue.max;
            ctx.save();
            ctx.globalAlpha = alpha * 0.72;
            const hot = cue.power > 0.7;
            ctx.fillStyle = hot ? `rgba(255, 138, 61, ${0.07 * alpha})` : `rgba(255, 255, 255, ${0.08 * alpha})`;
            ctx.strokeStyle = hot ? '#ff8a3d' : '#ffffff';
            ctx.lineWidth = 1.8 + cue.power * 2;
            ctx.shadowColor = hot ? '#ff8a3d' : '#8fe4ff';
            ctx.shadowBlur = hot ? 10 : 7;
            ctx.beginPath();
            ctx.arc(cue.x, cue.y, 20 + t * (20 + cue.power * 12), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.globalAlpha = alpha * 0.54;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cue.x, cue.y, 10 + t * 12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            return cue.timer > 0;
        });
    }

    drawWallBounces(ctx) {
        this.wallBounces = this.wallBounces.filter(bounce => {
            bounce.timer--;
            const t = 1 - bounce.timer / bounce.max;
            const alpha = bounce.timer / bounce.max;
            ctx.save();
            ctx.globalAlpha = alpha * 0.72;
            ctx.strokeStyle = '#9ee7ff';
            ctx.fillStyle = `rgba(158, 231, 255, ${0.12 * alpha})`;
            ctx.shadowColor = '#9ee7ff';
            ctx.shadowBlur = 8;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(bounce.x, bounce.y, 10 + t * 22 * bounce.intensity, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
                const angle = (Math.PI / 2) * i + t * 0.8;
                const inner = 8 + t * 8;
                const outer = 16 + t * 13 * bounce.intensity;
                ctx.beginPath();
                ctx.moveTo(bounce.x + Math.cos(angle) * inner, bounce.y + Math.sin(angle) * inner);
                ctx.lineTo(bounce.x + Math.cos(angle) * outer, bounce.y + Math.sin(angle) * outer);
                ctx.stroke();
            }
            ctx.restore();
            return bounce.timer > 0;
        });
    }

    drawSettleCues(ctx) {
        this.settleCues = this.settleCues.filter(cue => {
            cue.timer--;
            const progress = 1 - cue.timer / cue.max;
            const alpha = cue.timer / cue.max;
            ctx.save();
            ctx.globalAlpha = alpha * 0.72;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.08 * alpha})`;
            ctx.strokeStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 7;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(cue.x, cue.y, 26 + progress * 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#143642';
            ctx.strokeStyle = 'rgba(255,255,255,0.82)';
            ctx.lineWidth = 4;
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeText(t('settled'), cue.x, cue.y - 36);
            ctx.fillText(t('settled'), cue.x, cue.y - 36);
            ctx.restore();
            return cue.timer > 0;
        });
    }

    drawMissAnimations(ctx) {
        this.missAnimations = this.missAnimations.filter(anim => {
            anim.timer--;
            const alpha = anim.timer / anim.max;
            const y = anim.startY - (1 - alpha) * 36;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(20,54,66,0.24)';
            ctx.lineWidth = 4;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 12;
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeText(t('miss'), anim.x, y);
            ctx.fillText(t('miss'), anim.x, y);
            ctx.restore();
            return anim.timer > 0;
        });
    }

    /**
     * 绘制并更新得分浮动动画
     * @param {CanvasRenderingContext2D} ctx
     */
    drawScoreAnimations(ctx) {
        this.scoreAnimations = this.scoreAnimations.filter(anim => {
            anim.timer -= 1;
            anim.y = anim.startY - (anim.max - anim.timer) * 0.28;

            const alpha = Math.max(0, anim.timer / anim.max);
            const pop = 1 + Math.sin((1 - alpha) * Math.PI) * 0.16;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 10;

            ctx.fillStyle = 'rgba(255, 215, 0, 0.88)';
            ctx.beginPath();
            ctx.arc(anim.x, anim.y, 22 * pop, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.84)';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${Math.round(24 * pop)}px sans-serif`;
            ctx.strokeStyle = 'rgba(143, 90, 0, 0.42)';
            ctx.lineWidth = 4;
            const label = `+${anim.score}`;
            ctx.strokeText(label, anim.x, anim.y + 1);
            ctx.fillText(label, anim.x, anim.y + 1);
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

        this.game.chat.chatMessages.forEach(msg => {
            const isMe = msg.playerIndex === this.game.network.playerIndex;
            const text = msg.text;
            ctx.save();
            ctx.font = 'bold 14px sans-serif';
            const metrics = ctx.measureText(text);
            const w = Math.min(264, Math.max(112, metrics.width + 34));
            const h = 38;
            const x = isMe ? CANVAS_WIDTH - w - 58 : 58;
            const y = isMe ? CANVAS_HEIGHT - 178 : 142;
            const color = isMe ? this.game.getPlayerColor(this.getMySlot()) : this.game.getPlayerColor(this.getOpponentSlot());
            const rgb = this.hexToRgb(color);

            ctx.shadowColor = `rgba(${rgb}, 0.24)`;
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 5;
            const bubble = ctx.createLinearGradient(x, y, x, y + h);
            bubble.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
            bubble.addColorStop(1, 'rgba(235, 255, 249, 0.92)');
            ctx.fillStyle = bubble;
            ctx.strokeStyle = `rgba(${rgb}, 0.46)`;
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 13);
            ctx.fill();
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.beginPath();
            if (isMe) {
                ctx.moveTo(x + w - 28, y + h);
                ctx.lineTo(x + w - 14, y + h + 10);
                ctx.lineTo(x + w - 46, y + h);
            } else {
                ctx.moveTo(x + 28, y);
                ctx.lineTo(x + 14, y - 10);
                ctx.lineTo(x + 46, y);
            }
            ctx.fillStyle = isMe ? 'rgba(235, 255, 249, 0.94)' : 'rgba(255, 255, 255, 0.96)';
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = this.palette.ink;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x + w / 2, y + h / 2, w - 22);
            ctx.restore();
        });
        return;

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

    getPendingWinText() {
        const mySlot = this.getMySlot();
        const isWinner = this.game.winner === mySlot;
        const winText = this.game.gameMode === 'local'
            ? (this.game.winner === 'A' ? t('blueSide') : t('redSide'))
            : (isWinner ? t('you') : t('opponent'));
        const loseText = this.game.gameMode === 'local'
            ? (this.game.winner === 'A' ? t('redSide') : t('blueSide'))
            : (isWinner ? t('opponent') : t('you'));

        if (this.game.pendingWinReason === 'surrender') return t('pendingSurrender', { loser: loseText });
        if (this.game.pendingWinReason === 'runner') return t('pendingRunner', { winner: winText });
        if (this.game.pendingWinReason === 'timeout') return t('pendingTimeout', { loser: loseText });
        if (this.game.pendingWinReason === 'allUsed') return t('pendingAllUsed');
        if (this.game.pendingWinReason === 'overtime') return t('pendingOvertime');
        return '';
    }

    drawPendingWinRedesigned(ctx) {
        if (!this.game.pendingWinReason) return;

        const isWinner = this.game.winner === this.getMySlot();
        ctx.save();
        ctx.fillStyle = 'rgba(20, 54, 66, 0.68)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const panelX = 24;
        const panelY = CENTER_Y - 66;
        const panelW = CANVAS_WIDTH - 48;
        this.drawSoftPanel(ctx, panelX, panelY, panelW, 144, 22, 'rgba(255,255,255,0.95)', false);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = isWinner ? this.palette.gold : '#ffffff';
        ctx.shadowBlur = 14;
        ctx.fillStyle = isWinner ? '#a46a00' : this.palette.ink;
        ctx.font = '900 30px sans-serif';
        ctx.fillText(this.getPendingWinText(), CENTER_X, CENTER_Y - 8);

        ctx.shadowBlur = 0;
        ctx.fillStyle = this.palette.muted;
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(this.game.competitiveMatch ? t('serverConfirming') : t('gameEnded'), CENTER_X, CENTER_Y + 36);
        ctx.restore();
    }

    drawGameOverRedesigned(ctx) {
        const winner = this.game.winner;
        const mySlot = this.getMySlot();
        const isWinner = winner && winner === mySlot;
        const resultColor = winner ? (isWinner ? this.palette.gold : this.palette.danger) : '#ffffff';
        const title = winner ? (isWinner ? t('victory') : t('defeat')) : t('draw');
        const subtitle = winner
            ? (isWinner ? t('winMessage') : t('loseMessage'))
            : t('drawMessage');

        ctx.save();
        ctx.fillStyle = 'rgba(15, 26, 34, 0.78)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const panelX = 44;
        const panelY = this.game.competitiveMatch ? 188 : 210;
        const panelW = CANVAS_WIDTH - 88;
        const panelH = this.game.competitiveMatch ? 250 : 350;
        this.drawSoftPanel(ctx, panelX, panelY, panelW, panelH, 24, 'rgba(255,255,255,0.95)', false);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = resultColor;
        ctx.shadowBlur = winner ? 18 : 10;
        ctx.fillStyle = resultColor;
        ctx.font = '900 56px sans-serif';
        ctx.fillText(title, CENTER_X, panelY + 70);

        ctx.shadowBlur = 0;
        ctx.fillStyle = this.palette.ink;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(subtitle, CENTER_X, panelY + 124);

        ctx.fillStyle = this.palette.muted;
        ctx.font = '14px sans-serif';
        ctx.fillText(t('scoreLine', { a: this.game.scoreA || 0, b: this.game.scoreB || 0 }), CENTER_X, panelY + 156);
        ctx.fillText(this.getEconomyLabel(), CENTER_X, panelY + 184);

        ctx.restore();

        this.drawCompetitiveSettlement(ctx);

        if (this.game.competitiveMatch) {
            this.drawCompetitiveExitButton(ctx);
            return;
        }

        const btnX = CENTER_X - 112;
        const btnY = panelY + 208;
        const btnW = 224;
        const btnH = 56;

        ctx.save();
        if (this.game.showRestartAgreed) {
            ctx.fillStyle = this.palette.green;
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t('bothRestarting'), CENTER_X, btnY + 28);
            this.game.restartBtn = null;
        } else if (this.game.waitingForRestart) {
            ctx.fillStyle = this.palette.muted;
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t('waitingOpponentRestart'), CENTER_X, btnY + 28);
            this.game.restartBtn = null;
        } else if (this.game.opponentLeft) {
            ctx.fillStyle = this.palette.danger;
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t('opponentLeft'), CENTER_X, btnY + 28);
            this.game.restartBtn = null;
        } else {
            const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
            grad.addColorStop(0, this.palette.orange);
            grad.addColorStop(1, '#e76b1d');
            ctx.fillStyle = grad;
            this.drawRoundRect(ctx, btnX, btnY, btnW, btnH, 16);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.72)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.game.opponentWantsRestart ? t('agreeStart') : t('playAgain'), CENTER_X, btnY + btnH / 2);
            this.game.restartBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
        }

        const exitY = btnY + btnH + 16;
        ctx.fillStyle = 'rgba(20,54,66,0.82)';
        this.drawRoundRect(ctx, btnX, exitY, btnW, 42, 14);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('exitGame'), CENTER_X, exitY + 21);
        this.game.exitBtn = { x: btnX, y: exitY, w: btnW, h: 42 };
        ctx.restore();
    }

    drawPendingWin(ctx) {
        this.drawPendingWinRedesigned(ctx);
    }

    drawGameOver(ctx) {
        this.drawGameOverRedesigned(ctx);
    }

    drawCompetitiveSettlement(ctx) {
        if (!this.game.competitiveMatch) return;

        const match = this.game.competitiveMatch;
        const settlementMessage = this.game.competitiveSettlement;
        const settlement = settlementMessage?.settlement;
        const beforeWallet = this.game.competitiveEntryWallet;
        const wallet = settlementMessage?.wallet || this.game.competitiveWallet || beforeWallet;
        const error = this.game.competitiveSettlementError;
        const confirmed = settlementMessage?.status === 'settled' && settlement;
        const myParticipant = this.getMyCompetitiveParticipant(match);
        const myAccountId = myParticipant?.accountId;
        const fallbackWinner = this.game.winner === (this.game.perspective === 'bottom' ? 'A' : 'B');
        const isWinner = confirmed && myAccountId
            ? settlement.winnerAccountId === myAccountId
            : fallbackWinner;

        const beforeBalance = beforeWallet?.balance ?? wallet?.balance ?? 0;
        const finalBalance = wallet?.balance ?? beforeBalance;
        const netChange = confirmed
            ? finalBalance - beforeBalance
            : (isWinner ? match.winnerPayout - match.stake : -match.stake);
        const reward = confirmed && isWinner ? settlement.winnerPayout : 0;
        const displayBalance = confirmed
            ? this.getAnimatedSettlementBalance(beforeBalance, finalBalance)
            : finalBalance;

        const panelX = 24;
        const panelY = CENTER_Y + 4;
        const panelW = CANVAS_WIDTH - 48;
        const panelH = 224;

        ctx.save();
        this.drawSoftPanel(ctx, panelX, panelY, panelW, panelH, 22, 'rgba(255,255,255,0.96)', false);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = confirmed ? '#8a5a00' : error ? '#d9480f' : '#2d6775';
        const status = confirmed ? t('serverConfirmed') : error ? t('settlementFailed') : t('serverConfirming');
        ctx.fillText(status, CENTER_X, panelY + 26);

        ctx.font = 'bold 38px sans-serif';
        ctx.fillStyle = confirmed
            ? (netChange >= 0 ? '#16884d' : '#d9480f')
            : '#143642';
        const headline = confirmed ? this.formatCoinAmount(netChange) : t('pending');
        ctx.fillText(headline, CENTER_X, panelY + 72, panelW - 40);

        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#143642';
        const balanceText = confirmed
            ? t('balance', { balance: displayBalance })
            : t('entryWinShort', { stake: match.stake, win: match.winnerPayout });
        ctx.fillText(balanceText, CENTER_X, panelY + 106, panelW - 40);

        const rewardText = isWinner ? `+${confirmed ? reward : match.winnerPayout}` : '+0';
        this.drawSettlementLine(ctx, panelX + 36, panelY + 142, t('entryFee'), `-${match.stake}`, '#d9480f');
        this.drawSettlementLine(ctx, panelX + 36, panelY + 172, t('winnerReward'), rewardText, isWinner ? '#16884d' : '#767d87');
        this.drawSettlementLine(ctx, panelX + 36, panelY + 202, t('systemSink'), `${settlement?.systemSink ?? match.systemSink}`, '#767d87');

        if (error) {
            ctx.fillStyle = '#d9480f';
            ctx.font = '12px sans-serif';
            ctx.fillText(error.slice(0, 44), CENTER_X, panelY + panelH - 10);
        }

        ctx.restore();
    }

    drawCompetitiveExitButton(ctx) {
        const btnX = CENTER_X - 118;
        const btnY = CENTER_Y + 252;
        const btnW = 236;
        const btnH = 54;

        this.drawImageButton(ctx, btnX, btnY, btnW, btnH, t('backHome'), '#35b779', 20);

        this.game.restartBtn = null;
        this.game.exitBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
    }

    drawSettlementLine(ctx, x, y, label, value, valueColor) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#47707c';
        ctx.font = '14px sans-serif';
        ctx.fillText(label, x, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = valueColor;
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(value, CANVAS_WIDTH - 62, y);
    }

    getMyCompetitiveParticipant(match) {
        const playerId = this.game.network?.playerId;
        return match.participants?.find(participant => participant.playerId === playerId)
            || match.participants?.find(participant => !participant.profile?.isAi)
            || match.participants?.find(participant => participant.slot === (this.game.perspective === 'bottom' ? 'A' : 'B'))
            || null;
    }

    getAnimatedSettlementBalance(from, to) {
        const startedAt = this.game.competitiveSettlementReceivedAt || Date.now();
        const elapsed = Math.max(0, Date.now() - startedAt);
        const t = Math.min(1, elapsed / 900);
        const eased = 1 - Math.pow(1 - t, 3);
        return Math.round(from + (to - from) * eased);
    }

    formatCoinDelta(amount) {
        if (amount > 0) return `+${amount}`;
        if (amount < 0) return `${amount}`;
        return '0';
    }

    formatCoinAmount(amount) {
        return t('coins', { value: this.formatCoinDelta(amount) });
    }

    /**
     * 绘制对方断线等待遮罩
     * @param {CanvasRenderingContext2D} ctx
     */
    drawDisconnectOverlay(ctx) {
        const bannerW = 330;
        const bannerH = 96;
        const bannerX = CENTER_X - bannerW / 2;
        const bannerY = 92;

        ctx.save();
        this.drawSoftPanel(ctx, bannerX, bannerY, bannerW, bannerH, 18, 'rgba(255,255,255,0.96)');
        const alpha = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 300));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#d9480f';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('reconnecting'), CENTER_X, bannerY + 34);

        ctx.globalAlpha = 1;
        ctx.fillStyle = '#47707c';
        ctx.font = '13px sans-serif';
        ctx.fillText(t('waitingResultConfirmation'), CENTER_X, bannerY + 66);
        ctx.restore();
    }

    drawConnectionOverlay(ctx) {
        const bannerW = 320;
        const bannerH = 74;
        const bannerX = CENTER_X - bannerW / 2;
        const bannerY = CANVAS_HEIGHT - 118;
        const status = this.game.connectionStatus || 'offline';
        const title = status === 'offline' ? t('offline') : t('reconnecting');

        ctx.save();
        this.drawSoftPanel(ctx, bannerX, bannerY, bannerW, bannerH, 16, 'rgba(255,255,255,0.96)');
        const alpha = 0.65 + 0.35 * Math.abs(Math.sin(Date.now() / 280));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = status === 'offline' ? '#d9480f' : '#8a5a00';
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, CENTER_X, bannerY + 28);

        ctx.globalAlpha = 1;
        ctx.fillStyle = '#47707c';
        ctx.font = '12px sans-serif';
        ctx.fillText(t('waitingResultConfirmation'), CENTER_X, bannerY + 52);
        ctx.restore();
    }

}
