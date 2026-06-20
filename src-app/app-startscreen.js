import { CANVAS_HEIGHT, CANVAS_WIDTH, CENTER_X } from '../src-online/constants.js';
import { OnlineStartScreen } from '../src-online/online-startscreen.js';
import { locale, t } from '../src-online/i18n.js';
import { canUseVibration, loadSettings, updateSetting } from '../src-online/settings.js';
import { drawAppButton, drawAppEffectFrame, drawAppPanel, drawAppSprite, loadAppAtlas, preloadAppAtlas } from './app-assets.js';

export class AppStartScreen extends OnlineStartScreen {
    constructor(canvas, onStart, network = null) {
        super(canvas, onStart, network);
        preloadAppAtlas();
        loadAppAtlas().then(() => {
            if (this.isActive) this.draw();
        }).catch(() => {});
    }

    drawBackground(ctx) {
        if (drawAppSprite(ctx, 'background', 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)) return;
        super.drawBackground(ctx);
    }

    drawTopBar(ctx) {
        this.drawCard(ctx, 16, 20, CANVAS_WIDTH - 32, 70, '#fff', 'topbar');
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#123842';
        ctx.font = '900 28px sans-serif';
        ctx.fillText('PELLO', 36, 49);
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 11px sans-serif';
        ctx.fillText(t('appSubtitle'), 38, 70);
        const balance = this.wallet ? this.wallet.available : '--';
        this.drawCoinBalance(ctx, CANVAS_WIDTH - 174, 32, 138, 46, String(balance));
        ctx.restore();
    }

    drawCoinBalance(ctx, x, y, w, h, label) {
        ctx.save();
        if (!drawAppPanel(ctx, 'coinPill', x, y, w, h)) {
            super.drawCoinBalance(ctx, x, y, w, h, label);
            ctx.restore();
            return;
        }
        drawAppSprite(ctx, 'coin', x + 8, y + 4, h - 8, h - 8);
        ctx.fillStyle = '#7b4a00';
        ctx.font = '900 18px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + w - 16, y + h / 2 + 1, w - 58);
        ctx.restore();
    }

    drawHome(ctx) {
        const table = this.selectedTable;
        this.drawTopBar(ctx);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#123842';
        ctx.font = '900 35px sans-serif';
        ctx.fillText(t('play1v1'), CENTER_X, 132);
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 15px sans-serif';
        ctx.fillText(t('homeSubtitle'), CENTER_X, 162, CANVAS_WIDTH - 56);
        ctx.restore();

        this.drawCard(ctx, 30, 190, 390, 226, '#fff', 'modal');
        drawAppSprite(ctx, 'boardSkin', 76, 216, 180, 200);
        drawAppSprite(ctx, 'puckBlue', 260, 254, 58, 58);
        drawAppSprite(ctx, 'puckRed', 308, 306, 58, 58);
        drawAppSprite(ctx, 'coin', 324, 230, 52, 52);

        ctx.save();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#123842';
        ctx.font = '900 19px sans-serif';
        ctx.fillText(this.formatTableLabel(table), 52, 448);
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 13px sans-serif';
        ctx.fillText(t('entryWinShort', { stake: table.stake, win: table.winnerPayout }), 52, 472);
        ctx.restore();

        const entryState = this.getEntryButtonState(table);
        this.drawButton(ctx, 32, 500, 386, 66, entryState.label, '#ff8758', 'quick_match', entryState.disabled);
        this.drawButton(ctx, 32, 584, 186, 54, t('aiMatch'), '#30b976', 'paid_ai_match', entryState.disabled);
        this.drawButton(ctx, 232, 584, 186, 54, t('practiceAi'), '#25a9e7', 'practice_ai');
        this.drawButton(ctx, 32, 656, 186, 52, t('local2p'), '#7c68d9', 'practice_local');
        this.drawButton(ctx, 232, 656, 186, 52, t('details'), '#767d87', 'profile', !this.network.accountId);

        this.drawCard(ctx, 28, 742, 394, 84, '#fff', 'panel');
        const profileName = this.profile ? this.profile.displayName : t('guestPlayer');
        const rating = this.profile ? this.profile.rating : '--';
        const record = this.profile ? t('record', { wins: this.profile.wins, losses: this.profile.losses }) : this.statusMessage;
        ctx.save();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#123842';
        ctx.font = '900 16px sans-serif';
        ctx.fillText(profileName, 54, 778);
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 12px sans-serif';
        ctx.fillText(t('rating', { rating }), 54, 804);
        ctx.textAlign = 'right';
        ctx.fillText(record, 398, 804);
        ctx.restore();

        this.drawButton(ctx, 32, 852, 386, 54, t('settings'), '#767d87', 'settings');
    }

    drawAiDifficulty(ctx) {
        this.drawTopBar(ctx);
        this.drawButton(ctx, 28, 110, 96, 42, t('back'), '#767d87', 'back_home');

        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#123842';
        ctx.font = '900 29px sans-serif';
        ctx.fillText(t('chooseAiDifficulty'), CENTER_X, 164);
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 14px sans-serif';
        ctx.fillText(t('skillMatchedAi'), CENTER_X, 191);
        ctx.restore();

        this.drawCard(ctx, 38, 222, 374, 444, '#fff', 'modal');
        const robotY = 252 + Math.sin(this.animPhase * 3) * 4;
        drawAppSprite(ctx, 'robot', CENTER_X - 86, robotY, 172, 172);
        drawAppEffectFrame(ctx, 'scorePulse', (Date.now() % 1000) / 1000, CENTER_X - 88, robotY + 8, 176, 176, { alpha: 0.18 });

        this.drawDifficultyRow(ctx, 66, 438, 'easy', t('easy'), '#30b976', t('aiEasyDesc'));
        this.drawDifficultyRow(ctx, 66, 512, 'medium', t('medium'), '#25a9e7', t('aiMediumDesc'));
        this.drawDifficultyRow(ctx, 66, 586, 'hard', t('hard'), '#ff8758', t('aiHardDesc'));
    }

    drawDifficultyRow(ctx, x, y, id, label, color, desc) {
        this.drawButton(ctx, x, y, 318, 56, label, color, `practice_ai_${id}`);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 11px sans-serif';
        ctx.fillText(desc, CENTER_X, y + 72, 320);
        ctx.restore();
    }

    drawSettings(ctx) {
        this.drawTopBar(ctx);
        this.drawButton(ctx, 28, 110, 96, 42, t('back'), '#767d87', 'back_home');
        this.drawCard(ctx, 34, 176, 382, 386, '#fff', 'modal');

        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#123842';
        ctx.font = '900 30px sans-serif';
        ctx.fillText(t('settingsTitle'), CENTER_X, 228);
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 13px sans-serif';
        ctx.fillText(t('settingsSavedAutomatically'), CENTER_X, 258);
        ctx.restore();

        this.settings = loadSettings();
        this.drawToggleRow(ctx, 64, 306, t('sound'), 'audioEnabled');
        this.drawToggleRow(ctx, 64, 376, t('music'), 'musicEnabled');
        if (canUseVibration()) {
            this.drawToggleRow(ctx, 64, 446, t('vibration'), 'vibrationEnabled');
        }
    }

    drawToggleRow(ctx, x, y, label, key) {
        const enabled = Boolean(this.settings[key]);
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#123842';
        ctx.font = '900 17px sans-serif';
        ctx.fillText(label, x, y + 24);
        ctx.restore();
        this.drawButton(ctx, x + 214, y, 104, 48, enabled ? t('on') : t('off'), enabled ? '#30b976' : '#767d87', `toggle_${key}`);
    }

    drawMatchmaking(ctx) {
        const elapsedSeconds = this.queuedAt ? Math.floor((Date.now() - this.queuedAt) / 1000) : 0;
        const table = this.queueTable || this.selectedTable;
        const aiDelay = Math.ceil((table.matchmakingTimeoutMs || 15000) / 1000);
        const remaining = Math.max(0, aiDelay - elapsedSeconds);

        this.drawTopBar(ctx);
        this.drawCard(ctx, 36, 178, 378, 388, '#fff', 'modal');
        drawAppSprite(ctx, 'robot', CENTER_X - 76, 210 + Math.sin(this.animPhase * 4) * 5, 152, 152);
        drawAppEffectFrame(ctx, 'scorePulse', (Date.now() % 900) / 900, CENTER_X - 90, 198, 180, 180, { alpha: 0.2 });

        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#123842';
        ctx.font = '900 30px sans-serif';
        ctx.fillText(t('findingRival'), CENTER_X, 398);
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 14px sans-serif';
        ctx.fillText(t('searchingSeconds', { seconds: elapsedSeconds }), CENTER_X, 430);
        ctx.fillText(remaining > 0 ? t('aiUnlocks', { seconds: remaining }) : t('aiReady'), CENTER_X, 460, 322);
        ctx.restore();

        this.drawButton(ctx, 46, 600, 358, 58, t('keepWaiting'), '#25a9e7', 'keep_waiting', true);
        this.drawButton(ctx, 46, 676, 358, 58, remaining > 0 ? t('aiIn', { seconds: remaining }) : t('playAiNow'), '#30b976', 'ai_match', remaining > 0);
        this.drawButton(ctx, 46, 752, 358, 54, t('cancel'), '#767d87', 'cancel_matchmaking');
    }

    drawCoinConfirm(ctx) {
        const action = this.pendingPaidAction;
        const table = action?.table || this.selectedTable;
        this.drawTopBar(ctx);
        this.drawButton(ctx, 28, 110, 96, 42, t('back'), '#767d87', 'back_home');
        this.drawCard(ctx, 34, 190, 382, 402, '#fff', 'modal');
        drawAppSprite(ctx, 'coin', CENTER_X - 42, 222, 84, 84);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#123842';
        ctx.font = '900 26px sans-serif';
        ctx.fillText(action?.mode === 'paid_ai_match' ? t('confirmAiMatch') : t('confirm1v1Entry'), CENTER_X, 332, 330);
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 14px sans-serif';
        ctx.fillText(action?.mode === 'paid_ai_match' ? t('skillMatchedAi') : t('realPlayerMatchmaking'), CENTER_X, 366, 330);
        this.drawSettlementPreview(ctx, 72, 420, t('entryFee'), `-${table.stake}`, '#d9480f');
        this.drawSettlementPreview(ctx, 72, 460, t('winnerReward'), `+${table.winnerPayout}`, '#178b53');
        ctx.restore();

        this.drawButton(ctx, 56, 624, 338, 60, t('confirmEntry'), '#ff8758', 'confirm_paid_entry');
        this.drawButton(ctx, 56, 702, 338, 52, t('cancel'), '#767d87', 'cancel_paid_entry');
    }

    drawVersus(ctx) {
        this.drawTopBar(ctx);
        this.drawCard(ctx, 34, 210, 382, 360, '#fff', 'modal');
        drawAppSprite(ctx, 'puckBlue', 92, 292, 86, 86);
        drawAppSprite(ctx, 'puckRed', 272, 292, 86, 86);
        drawAppSprite(ctx, 'badgeWin', CENTER_X - 45, 248, 90, 90);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#123842';
        ctx.font = '900 31px sans-serif';
        ctx.fillText(this.gameStartMessage?.match?.mode === 'ai' ? t('aiChallenge') : t('rivalFound'), CENTER_X, 420);
        ctx.fillStyle = '#4e7780';
        ctx.font = '800 14px sans-serif';
        ctx.fillText(t('starting'), CENTER_X, 454);
        ctx.restore();
    }

    drawCard(ctx, x, y, w, h, color, assetName = null) {
        const box = this.normalizeBox(x, y, w, h);
        const name = assetName || (box.h > 240 ? 'modal' : 'panel');
        if (drawAppPanel(ctx, name, box.x, box.y, box.w, box.h)) return;
        super.drawCard(ctx, box.x, box.y, box.w, box.h, color, false);
    }

    drawButton(ctx, x, y, w, h, text, color, id, disabled = false) {
        const box = this.normalizeBox(x, y, w, h);
        this.buttons.push({ x: box.x, y: box.y, w: box.w, h: box.h, id, disabled });
        const sprite = this.resolveButtonSprite(color);
        ctx.save();
        ctx.globalAlpha = disabled ? 0.45 : 1;
        if (!drawAppButton(ctx, sprite, box.x, box.y, box.w, box.h)) {
            super.drawButton(ctx, box.x, box.y, box.w, box.h, text, color, id, disabled);
            ctx.restore();
            return;
        }
        ctx.fillStyle = '#ffffff';
        let fontSize = box.w < 130 ? 13 : 18;
        ctx.font = `900 ${fontSize}px sans-serif`;
        while (fontSize > 10 && ctx.measureText(text).width > box.w - 28) {
            fontSize -= 1;
            ctx.font = `900 ${fontSize}px sans-serif`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 1);
        ctx.restore();
    }

    resolveButtonSprite(color) {
        const normalized = String(color || '').toLowerCase();
        if (normalized.includes('30') || normalized.includes('35') || normalized.includes('green')) return 'buttonGreen';
        if (normalized.includes('ef') || normalized.includes('d9') || normalized.includes('red')) return 'buttonRed';
        if (normalized.includes('767') || normalized.includes('gray') || normalized.includes('grey')) return 'buttonGray';
        if (normalized.includes('7c') || normalized.includes('purple')) return 'buttonPurple';
        if (normalized.includes('25') || normalized.includes('2d') || normalized.includes('blue')) return 'buttonBlue';
        return 'buttonPrimary';
    }

    async handleClick(e) {
        const before = { ...this.settings };
        await super.handleClick(e);
        if (before.musicEnabled !== this.settings.musicEnabled || before.audioEnabled !== this.settings.audioEnabled || before.vibrationEnabled !== this.settings.vibrationEnabled) {
            this.settings = updateSetting('musicEnabled', this.settings.musicEnabled);
            this.settings = loadSettings();
        }
    }

    formatTableLabel(table = this.selectedTable) {
        const label = table.label || 'Bronze 1v1';
        if (locale === 'zh' && (table.id === 'bronze_12' || /^bronze\b/i.test(label))) return '青铜 1v1';
        return label;
    }
}
