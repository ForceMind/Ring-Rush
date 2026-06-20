import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    CENTER_X,
    CENTER_Y,
    TRACK_X,
    TRACK_Y,
    TRACK_WIDTH,
    TRACK_HEIGHT,
    TRACK_STEPS,
    SCORING_ZONES
} from '../src-online/constants.js';
import { UI } from '../src-online/ui.js';
import { t } from '../src-online/i18n.js';
import { drawAppButton, drawAppEffectFrame, drawAppPanel, drawAppSprite } from './app-assets.js';

export class AppUI extends UI {
    constructor(game) {
        super(game);
        this.palette = {
            ink: '#123842',
            muted: '#4e7780',
            panel: 'rgba(255, 255, 255, 0.92)',
            panelStrong: 'rgba(255, 255, 255, 0.98)',
            line: 'rgba(255, 255, 255, 0.72)',
            orange: '#ff8758',
            green: '#30b976',
            blue: '#25a9e7',
            danger: '#ef5b55',
            gold: '#ffc936'
        };
    }

    drawBackground(ctx) {
        if (drawAppSprite(ctx, 'background', 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)) return;
        super.drawBackground(ctx);
    }

    drawSoftPanel(ctx, x, y, w, h, radius = 12, fill = this.palette.panel, assetName = undefined) {
        const sprite = assetName === false ? null : (assetName || (h > 230 ? 'modal' : 'panel'));
        if (sprite && drawAppPanel(ctx, sprite, x, y, w, h)) return;
        super.drawSoftPanel(ctx, x, y, w, h, radius, fill, false);
    }

    drawImageButton(ctx, x, y, w, h, label, color, fontSize = 20) {
        const sprite = this.resolveButtonSprite(color);
        ctx.save();
        if (!drawAppButton(ctx, sprite, x, y, w, h)) {
            super.drawImageButton(ctx, x, y, w, h, label, color, fontSize);
            ctx.restore();
            return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${fontSize}px sans-serif`;
        ctx.fillText(label, x + w / 2, y + h / 2 + 1, w - 26);
        ctx.restore();
    }

    resolveButtonSprite(color) {
        const normalized = String(color || '').toLowerCase();
        if (normalized.includes('35') || normalized.includes('30') || normalized.includes('green')) return 'buttonGreen';
        if (normalized.includes('ef') || normalized.includes('d9') || normalized.includes('red')) return 'buttonRed';
        if (normalized.includes('767') || normalized.includes('gray') || normalized.includes('grey')) return 'buttonGray';
        if (normalized.includes('7c') || normalized.includes('purple')) return 'buttonPurple';
        if (normalized.includes('2d') || normalized.includes('25') || normalized.includes('blue')) return 'buttonBlue';
        return 'buttonPrimary';
    }

    drawTitle(ctx) {
        const x = 16;
        const y = 18;
        const w = CANVAS_WIDTH - 32;
        const h = 66;
        this.drawSoftPanel(ctx, x, y, w, h, 24, this.palette.panelStrong, 'topbar');

        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = this.palette.ink;
        ctx.font = '900 25px sans-serif';
        ctx.fillText('PELLO', x + 18, y + 31);
        ctx.fillStyle = this.palette.muted;
        ctx.font = '800 11px sans-serif';
        ctx.fillText(this.getModeLabel(), x + 20, y + 51);

        ctx.textAlign = 'right';
        ctx.fillStyle = this.palette.ink;
        ctx.font = '900 16px sans-serif';
        ctx.fillText(t('roundLabel', { round: this.game.roundNumber }), x + w - 18, y + 25);
        ctx.fillStyle = this.palette.muted;
        ctx.font = '800 11px sans-serif';
        ctx.fillText(this.getEconomyLabel(), x + w - 18, y + 48);
        ctx.restore();
    }

    drawTrack(ctx) {
        const stepHeight = TRACK_HEIGHT / TRACK_STEPS;
        const halfSteps = (TRACK_STEPS - 1) / 2;
        const isBottom = this.game.perspective === 'bottom';
        const topSlot = this.getScreenSlot('top');
        const bottomSlot = this.getScreenSlot('bottom');
        const topStroke = this.game.getPlayerColor(topSlot);
        const bottomStroke = this.game.getPlayerColor(bottomSlot);

        this.drawSoftPanel(ctx, 5, TRACK_Y - 50, 42, TRACK_HEIGHT + 100, 16, this.palette.panel, 'panel');
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 10px sans-serif';
        ctx.fillStyle = this.palette.ink;
        ctx.fillText(t('raceTitle'), TRACK_X + TRACK_WIDTH / 2, TRACK_Y - 34);

        for (let i = 0; i < TRACK_STEPS; i++) {
            const y = TRACK_Y + i * stepHeight;
            const position = halfSteps - i;
            ctx.fillStyle = position > 0
                ? `rgba(${this.hexToRgb(topStroke)}, 0.34)`
                : position < 0
                    ? `rgba(${this.hexToRgb(bottomStroke)}, 0.34)`
                    : 'rgba(255,255,255,0.58)';
            this.drawRoundRect(ctx, TRACK_X, y, TRACK_WIDTH, stepHeight - 3, 10);
            ctx.fill();
            ctx.fillStyle = position === 0 ? this.palette.ink : 'rgba(18,56,66,0.72)';
            ctx.font = position === 0 ? '900 12px sans-serif' : '800 11px sans-serif';
            ctx.fillText(position === 0 ? '0' : String(Math.abs(position)), TRACK_X + TRACK_WIDTH / 2, y + stepHeight / 2);
        }

        const visualPosition = isBottom ? this.game.runnerDisplayPosition : -this.game.runnerDisplayPosition;
        const runnerY = TRACK_Y + (halfSteps - visualPosition) * stepHeight + stepHeight / 2;
        drawAppSprite(ctx, 'runner', TRACK_X + TRACK_WIDTH / 2 - 18, runnerY - 18, 36, 36);
        ctx.fillStyle = topStroke;
        ctx.font = '900 9px sans-serif';
        ctx.fillText(t('finishTop'), TRACK_X + TRACK_WIDTH / 2, TRACK_Y - 17);
        ctx.fillStyle = bottomStroke;
        ctx.fillText(t('finishBottom'), TRACK_X + TRACK_WIDTH / 2, TRACK_Y + TRACK_HEIGHT + 24);
        ctx.restore();
    }

    drawPlayerCard(ctx, position, y) {
        const slot = this.getScreenSlot(position);
        const color = this.game.getPlayerColor(slot);
        const active = this.isSlotTurn(slot) && !this.game.gameOver && !this.game.dice.phase;
        const x = 58;
        const w = 334;
        const h = position === 'top' ? 52 : 62;

        ctx.save();
        ctx.shadowColor = active ? `${color}66` : 'rgba(18,56,66,0.14)';
        ctx.shadowBlur = active ? 15 : 8;
        this.drawSoftPanel(ctx, x, y, w, h, 18, this.palette.panel, 'playerCard');
        ctx.shadowBlur = 0;

        drawAppSprite(ctx, color.includes('d94a') ? 'puckRed' : 'puckBlue', x + 12, y + h / 2 - 18, 36, 36);
        ctx.fillStyle = this.palette.ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '900 16px sans-serif';
        ctx.fillText(this.getSlotName(slot, position), x + 60, y + h / 2 - 10);
        ctx.fillStyle = this.palette.muted;
        ctx.font = '800 12px sans-serif';
        ctx.fillText(t('piecesShort', { count: this.getPiecesLeft(slot) }), x + 60, y + h / 2 + 10);

        ctx.textAlign = 'right';
        ctx.fillStyle = active ? color : this.palette.muted;
        ctx.font = '900 13px sans-serif';
        ctx.fillText(this.getTurnText(slot, position), x + w - 18, y + h / 2 - 8);
        if (active) {
            ctx.fillStyle = this.game.turnTimeLeft <= 10 ? this.palette.danger : this.palette.orange;
            ctx.font = '900 17px sans-serif';
            ctx.fillText(t('timerShort', { seconds: this.game.turnTimeLeft }), x + w - 18, y + h / 2 + 13);
        }
        ctx.restore();
    }

    drawSurrenderButton(ctx) {
        if (this.game.gameOver || this.game.dice.phase) return;
        if (this.game.gameMode === 'local' || (this.game.gameMode === 'bot' && this.game.isBotTurn())) {
            this.game.surrenderBtn = null;
            return;
        }
        const btnW = 86;
        const btnH = 36;
        const btnX = CANVAS_WIDTH - 104;
        const btnY = 190;
        this.drawImageButton(ctx, btnX, btnY, btnW, btnH, t('surrender'), '#ef5350', 12);
        this.game.surrenderBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
    }

    drawScoreAnimations(ctx) {
        this.scoreAnimations = this.scoreAnimations.filter((anim) => {
            anim.timer -= 1;
            anim.y = anim.startY - (anim.max - anim.timer) * 0.18;
            const alpha = Math.max(0, anim.timer / anim.max);
            const pop = 1 + Math.sin((1 - alpha) * Math.PI) * 0.12;
            ctx.save();
            ctx.globalAlpha = alpha;
            drawAppEffectFrame(ctx, 'scorePulse', 1 - alpha, anim.x - 40 * pop, anim.y - 40 * pop, 80 * pop, 80 * pop);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${Math.round(25 * pop)}px sans-serif`;
            ctx.strokeStyle = 'rgba(118, 77, 0, 0.55)';
            ctx.lineWidth = 5;
            ctx.fillStyle = '#ffffff';
            const label = `+${anim.score}`;
            ctx.strokeText(label, anim.x, anim.y + 1);
            ctx.fillText(label, anim.x, anim.y + 1);
            ctx.restore();
            return anim.timer > 0;
        });
    }

    drawScoreZonePulses(ctx) {
        this.zonePulses = this.zonePulses.filter((pulse) => {
            pulse.timer--;
            const alpha = Math.max(0, pulse.timer / pulse.max);
            const radius = pulse.radius * (1.05 + (1 - alpha) * 0.18);
            drawAppEffectFrame(ctx, 'scorePulse', 1 - alpha, CENTER_X - radius, CENTER_Y - radius, radius * 2, radius * 2, { alpha: alpha * 0.45 });
            return pulse.timer > 0;
        });
    }

    drawPendingWinRedesigned(ctx) {
        if (!this.game.pendingWinReason) return;
        ctx.save();
        ctx.fillStyle = 'rgba(13, 38, 47, 0.68)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        this.drawSoftPanel(ctx, 32, CENTER_Y - 62, CANVAS_WIDTH - 64, 136, 24, this.palette.panelStrong, 'modal');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.palette.ink;
        ctx.font = '900 27px sans-serif';
        ctx.fillText(this.getPendingWinText(), CENTER_X, CENTER_Y - 9, CANVAS_WIDTH - 90);
        ctx.fillStyle = this.palette.muted;
        ctx.font = '800 13px sans-serif';
        ctx.fillText(this.game.competitiveMatch ? t('serverConfirming') : t('gameEnded'), CENTER_X, CENTER_Y + 34);
        ctx.restore();
    }

    drawGameOverRedesigned(ctx) {
        const winner = this.game.winner;
        const mySlot = this.getMySlot();
        const isWinner = winner && winner === mySlot;
        const title = winner ? (isWinner ? t('victory') : t('defeat')) : t('draw');
        const subtitle = winner ? (isWinner ? t('winMessage') : t('loseMessage')) : t('drawMessage');

        ctx.save();
        ctx.fillStyle = 'rgba(10, 28, 36, 0.75)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const panelY = this.game.competitiveMatch ? 178 : 202;
        const panelH = this.game.competitiveMatch ? 270 : 338;
        this.drawSoftPanel(ctx, 38, panelY, CANVAS_WIDTH - 76, panelH, 28, this.palette.panelStrong, 'modal');
        drawAppSprite(ctx, isWinner ? 'badgeWin' : 'badgeLose', CENTER_X - 48, panelY + 22, 96, 96);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isWinner ? '#9b6400' : this.palette.danger;
        ctx.font = '900 42px sans-serif';
        ctx.fillText(title, CENTER_X, panelY + 132);
        ctx.fillStyle = this.palette.ink;
        ctx.font = '900 17px sans-serif';
        ctx.fillText(subtitle, CENTER_X, panelY + 172, CANVAS_WIDTH - 116);
        ctx.fillStyle = this.palette.muted;
        ctx.font = '800 13px sans-serif';
        ctx.fillText(t('scoreLine', { a: this.game.scoreA || 0, b: this.game.scoreB || 0 }), CENTER_X, panelY + 202);
        ctx.restore();

        this.drawCompetitiveSettlement(ctx);

        if (this.game.competitiveMatch) {
            this.drawCompetitiveExitButton(ctx);
            return;
        }

        const btnX = CENTER_X - 116;
        const btnY = panelY + 230;
        this.drawImageButton(ctx, btnX, btnY, 232, 56, this.game.opponentWantsRestart ? t('agreeStart') : t('playAgain'), '#35b779', 19);
        this.game.restartBtn = { x: btnX, y: btnY, w: 232, h: 56 };

        const exitY = btnY + 70;
        this.drawImageButton(ctx, btnX, exitY, 232, 46, t('exitGame'), '#767d87', 16);
        this.game.exitBtn = { x: btnX, y: exitY, w: 232, h: 46 };
    }

    drawCompetitiveSettlement(ctx) {
        if (!this.game.competitiveMatch) return;
        const match = this.game.competitiveMatch;
        const settlementMessage = this.game.competitiveSettlement;
        const settlement = settlementMessage?.settlement;
        const beforeWallet = this.game.competitiveEntryWallet;
        const wallet = settlementMessage?.wallet || this.game.competitiveWallet || beforeWallet;
        const confirmed = settlementMessage?.status === 'settled' && settlement;
        const myParticipant = this.getMyCompetitiveParticipant(match);
        const myAccountId = myParticipant?.accountId;
        const fallbackWinner = this.game.winner === (this.game.perspective === 'bottom' ? 'A' : 'B');
        const isWinner = confirmed && myAccountId ? settlement.winnerAccountId === myAccountId : fallbackWinner;
        const beforeBalance = beforeWallet?.balance ?? wallet?.balance ?? 0;
        const finalBalance = wallet?.balance ?? beforeBalance;
        const netChange = confirmed ? finalBalance - beforeBalance : (isWinner ? match.winnerPayout - match.stake : -match.stake);

        const panelX = 34;
        const panelY = CENTER_Y + 4;
        const panelW = CANVAS_WIDTH - 68;
        const panelH = 206;
        this.drawSoftPanel(ctx, panelX, panelY, panelW, panelH, 24, this.palette.panelStrong, 'panel');

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = confirmed ? '#8a5a00' : '#4e7780';
        ctx.font = '900 14px sans-serif';
        ctx.fillText(confirmed ? t('serverConfirmed') : t('serverConfirming'), CENTER_X, panelY + 28);
        drawAppSprite(ctx, 'coin', CENTER_X - 30, panelY + 44, 60, 60);
        ctx.fillStyle = confirmed ? (netChange >= 0 ? '#178b53' : '#d9480f') : this.palette.ink;
        ctx.font = '900 35px sans-serif';
        ctx.fillText(confirmed ? this.formatCoinAmount(netChange) : t('pending'), CENTER_X, panelY + 122, panelW - 40);
        ctx.fillStyle = this.palette.muted;
        ctx.font = '800 14px sans-serif';
        ctx.fillText(confirmed ? t('balance', { balance: this.getAnimatedSettlementBalance(beforeBalance, finalBalance) }) : t('entryWinShort', { stake: match.stake, win: match.winnerPayout }), CENTER_X, panelY + 158, panelW - 40);
        ctx.restore();
    }

    drawCompetitiveExitButton(ctx) {
        const btnX = CENTER_X - 118;
        const btnY = CENTER_Y + 228;
        this.drawImageButton(ctx, btnX, btnY, 236, 56, t('backHome'), '#35b779', 20);
        this.game.restartBtn = null;
        this.game.exitBtn = { x: btnX, y: btnY, w: 236, h: 56 };
    }
}
