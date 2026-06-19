import { CANVAS_WIDTH, CANVAS_HEIGHT, CENTER_X } from './constants.js';
import { NetworkManager } from './network.js';
import { locale, t } from './i18n.js';
import { drawUIAsset, getButtonAsset } from './ui-assets.js';
import { canUseVibration, loadSettings, updateSetting } from './settings.js';

const TABLE_ID = 'bronze_12';

export class OnlineStartScreen {
    constructor(canvas, onStart, network = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onStart = onStart;
        this.buttons = [];
        this.rooms = [];
        this.network = network || new NetworkManager();
        this.isConnecting = false;
        this.errorMessage = null;
        this.statusMessage = t('connecting');
        this.animPhase = 0;
        this.currentScreen = 'home';
        this.currentRoom = null;
        this.isReady = false;
        this.canStartGame = false;
        this.queuedAt = null;
        this.queueTable = null;
        this.profile = this.network.profile || null;
        this.wallet = this.network.wallet || null;
        this.tables = this.network.competitiveTables || [];
        this.dashboard = null;
        this.dashboardLoading = false;
        this.dashboardError = null;
        this.gameStartMessage = null;
        this.pendingPaidAction = null;
        this.settings = loadSettings();
        this.isActive = true;
        this.serverBaseUrl = this.network.getDisplayServerBaseUrl();
        this.handleClick = this.handleClick.bind(this);
        this.handleTouch = this.handleTouch.bind(this);
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('touchstart', this.handleTouch, { passive: false });
        this.animationTimer = setInterval(() => this.draw(), 1000 / 30);
    }

    get selectedTable() {
        return this.tables.find(table => table.id === TABLE_ID) || {
            id: TABLE_ID,
            label: 'Bronze 1v1',
            stake: 12,
            prizePool: 24,
            winnerPayout: 20,
            systemSink: 4,
            matchmakingTimeoutMs: 15000
        };
    }

    getCurrentTableId() {
        return (this.queueTable || this.selectedTable)?.id || TABLE_ID;
    }

    handleTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.handleClick({ clientX: touch.clientX, clientY: touch.clientY });
    }

    async connectToServer() {
        if (this.network.isConnected) {
            this.bindNetworkHandlers();
            this.statusMessage = t('connected');
            this.errorMessage = null;
            this.network.requestCompetitiveProfile();
            this.draw();
            return;
        }
        if (this.isConnecting) return;
        this.isConnecting = true;
        this.errorMessage = null;
        this.statusMessage = t('connecting');
        this.bindNetworkHandlers();
        this.draw();

        try {
            await this.network.connect();
            this.isConnecting = false;
            this.statusMessage = t('connected');
            this.network.requestCompetitiveProfile();
            this.draw();
        } catch (error) {
            this.isConnecting = false;
            this.errorMessage = t('cannotConnect');
            this.statusMessage = t('offline');
            this.draw();
        }
    }

    bindNetworkHandlers() {
        if (this._networkBound) return;
        this._networkBound = true;

        this.network.onConnectionStatus = (status, message) => {
            if (status === 'connected') {
                this.statusMessage = t('connected');
                this.errorMessage = null;
                this.network.requestCompetitiveProfile();
            } else if (status === 'reconnecting') {
                this.statusMessage = t('reconnecting');
            } else if (status === 'offline') {
                this.statusMessage = t('offline');
            } else {
                this.statusMessage = message || status;
            }
            this.draw();
        };

        this.network.onRoomList = (rooms) => {
            this.rooms = rooms;
            if (this.currentScreen === 'legacy_rooms') this.draw();
        };

        this.network.onCompetitiveProfile = (message) => {
            this.profile = message.profile;
            this.wallet = message.wallet;
            this.tables = message.tables || [];
            this.errorMessage = null;
            this.statusMessage = t('profileUpdated');
            this.draw();
        };

        this.network.onMatchmakingQueued = (message) => {
            this.currentScreen = 'matchmaking';
            this.queuedAt = message.queuedAt || Date.now();
            this.queueTable = message.table || this.selectedTable;
            this.wallet = message.wallet || this.wallet;
            this.statusMessage = t('findingRival');
            this.draw();
        };

        this.network.onMatchmakingCanceled = (message) => {
            this.currentScreen = 'home';
            this.queuedAt = null;
            this.wallet = message.wallet || this.wallet;
            this.statusMessage = t('matchmakingCanceled');
            this.draw();
        };

        this.network.onCompetitiveMatch = (message) => {
            this.gameStartMessage = message;
            this.currentScreen = 'versus';
            this.wallet = message.wallet || this.wallet;
            this.statusMessage = message.match.mode === 'ai' ? t('aiMatchReady') : t('rivalFound');
            this.draw();
            setTimeout(() => this.startCompetitiveMatch(), 900);
        };

        this.network.onCompetitiveSettlement = (message) => {
            this.wallet = message.wallet || this.wallet;
            this.statusMessage = message.status === 'settled' ? t('settlementConfirmed') : t('waitingResultConfirmation');
            this.draw();
        };

        this.network.onCompetitiveError = (message) => {
            this.errorMessage = message.message;
            this.statusMessage = t('actionFailed');
            this.draw();
        };

        this.network.onError = (message) => {
            if (this.isIgnorableServerError(message)) {
                this.errorMessage = null;
                return;
            }
            this.errorMessage = message;
            this.draw();
        };

        this.network.onMessage = (message) => {
            this.handleNetworkMessage(message);
        };
    }

    isIgnorableServerError(message) {
        const text = String(message || '');
        return /competitive_profile/i.test(text) && /(unknown|未知)/i.test(text);
    }

    handleNetworkMessage(message) {
        switch (message.type) {
            case 'reconnect_success':
                if (message.room && message.room.state === 'playing') {
                    this.gameStartMessage = {
                        mode: 'human',
                        playerIndex: message.playerIndex,
                        opponentName: message.opponentName,
                        match: this.network.activeMatch
                    };
                    this.startCompetitiveMatch();
                } else if (message.room) {
                    this.currentRoom = message.room;
                    this.currentScreen = 'in_room';
                    this.isReady = false;
                    this.draw();
                }
                break;
            case 'room_created':
            case 'room_joined':
                this.currentRoom = message.room;
                this.currentScreen = 'in_room';
                this.isReady = false;
                this.draw();
                break;
            case 'player_joined':
                if (this.currentRoom) {
                    this.currentRoom.guestName = message.player.name;
                    this.currentRoom.playerCount = 2;
                    this.draw();
                }
                break;
            case 'player_left':
                if (this.currentRoom) {
                    this.currentRoom.playerCount = 1;
                    this.currentRoom.guestName = null;
                    this.currentRoom.guestReady = false;
                    this.isReady = false;
                    this.draw();
                }
                break;
            case 'host_transferred':
                this.currentRoom = message.room;
                this.network.playerIndex = message.playerIndex;
                this.isReady = false;
                this.draw();
                break;
            case 'player_ready':
                if (!this.currentRoom) return;
                if (message.playerIndex === 'A') this.currentRoom.hostReady = true;
                if (message.playerIndex === 'B') this.currentRoom.guestReady = true;
                this.draw();
                break;
            case 'cancel_ready':
                if (!this.currentRoom) return;
                if (message.playerIndex === 'A') this.currentRoom.hostReady = false;
                if (message.playerIndex === 'B') this.currentRoom.guestReady = false;
                this.draw();
                break;
            case 'game_start':
                this.gameStartMessage = {
                    mode: 'human',
                    playerIndex: message.playerIndex,
                    opponentName: message.opponentName,
                    match: this.network.activeMatch
                };
                this.startCompetitiveMatch();
                break;
            case 'can_start_game':
                this.canStartGame = true;
                this.draw();
                break;
        }
    }

    startCompetitiveMatch() {
        if (!this.onStart || !this.gameStartMessage) return;
        const cb = this.onStart;
        this.onStart = null;
        this.cleanup();

        const message = this.gameStartMessage;
        const mode = message.match?.mode === 'ai' ? 'competitive_ai' : 'competitive_online';
        cb(mode, message);
    }

    async loadDashboard() {
        if (this.dashboardLoading) return;

        this.dashboardLoading = true;
        this.dashboardError = null;
        this.draw();

        try {
            const dashboard = await this.network.fetchCompetitiveDashboard(12);
            this.dashboard = dashboard;
            this.profile = dashboard.profile || this.profile;
            this.wallet = dashboard.wallet || this.wallet;
            this.tables = dashboard.tables || this.tables;
            this.statusMessage = t('profileUpdated');
        } catch (error) {
            this.dashboardError = error.message || t('profileUnavailable');
            this.statusMessage = t('profileUnavailable');
        } finally {
            this.dashboardLoading = false;
            this.draw();
        }
    }

    draw() {
        if (!this.isActive) return;
        const ctx = this.ctx;
        if (this.canvas.__pelloApplyHiDpi) this.canvas.__pelloApplyHiDpi();
        this.animPhase += 0.03;
        this.buttons = [];
        this.drawBackground(ctx);

        if (this.currentScreen === 'home') this.drawHome(ctx);
        if (this.currentScreen === 'coin_confirm') this.drawCoinConfirm(ctx);
        if (this.currentScreen === 'matchmaking') this.drawMatchmaking(ctx);
        if (this.currentScreen === 'versus') this.drawVersus(ctx);
        if (this.currentScreen === 'profile') this.drawProfile(ctx);
        if (this.currentScreen === 'settings') this.drawSettings(ctx);
        if (this.currentScreen === 'practice_ai_select') this.drawAiDifficulty(ctx);
        if (this.currentScreen === 'legacy_rooms') this.drawLegacyRooms(ctx);
        if (this.currentScreen === 'in_room') this.drawInRoom(ctx);

        if (this.errorMessage) {
            ctx.fillStyle = '#d9480f';
            ctx.font = 'bold 15px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.errorMessage, CENTER_X, CANVAS_HEIGHT - 28);
        }
    }

    drawBackground(ctx) {
        if (drawUIAsset(ctx, 'background', 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)) {
            return;
        }

        const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        sky.addColorStop(0, '#9ee7ff');
        sky.addColorStop(0.48, '#fff3b0');
        sky.addColorStop(1, '#7ddf9a');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        for (let i = 0; i < 16; i++) {
            const x = (i * 73 + Math.sin(this.animPhase + i) * 12) % CANVAS_WIDTH;
            const y = 90 + (i % 5) * 110 + Math.cos(this.animPhase * 0.8 + i) * 5;
            ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.42)' : 'rgba(255,247,204,0.5)';
            ctx.beginPath();
            ctx.arc(x, y, 22 + (i % 3) * 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawTopBar(ctx) {
        if (!drawUIAsset(ctx, 'topbar', 10, 18, CANVAS_WIDTH - 20, 58)) {
            this.drawPill(ctx, 10, 22, 122, 50, '#ffffffcc', '#ffffff');
        }
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 21px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('PELLO', 24, 54);

        if (!drawUIAsset(ctx, 'coinPill', 202, 22, 238, 50)) {
            this.drawPill(ctx, 202, 22, 238, 50, '#fff7cc', '#ffffff');
        }
        ctx.fillStyle = '#8a5a00';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'right';
        const balance = this.wallet ? this.wallet.available : '--';
        ctx.fillText(t('coins', { value: balance }), 420, 54);
    }

    drawHome(ctx) {
        const table = this.selectedTable;
        this.drawTopBar(ctx);

        ctx.fillStyle = '#143642';
        ctx.font = 'bold 38px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('play1v1'), CENTER_X, 135);
        ctx.fillStyle = '#2d6775';
        ctx.font = '18px sans-serif';
        ctx.fillText(t('homeSubtitle'), CENTER_X, 166);

        this.drawCard(ctx, 24, 204, 402, 190, '#ffffffdd');
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(this.formatTableLabel(table), 54, 247);
        ctx.font = '15px sans-serif';
        ctx.fillStyle = '#47707c';
        ctx.fillText(t('entryCoins', { stake: table.stake }), 54, 281);
        ctx.fillText(t('winnerGetsCoins', { coins: table.winnerPayout }), 54, 311);
        ctx.fillText(t('poolSink', { pool: table.prizePool, sink: table.systemSink }), 54, 341);

        this.drawPuckPreview(ctx, 348, 293);

        const entryState = this.getEntryButtonState(table);
        this.drawButton(ctx, 30, 414, 390, 68, entryState.label, '#ff8a3d', 'quick_match', entryState.disabled);
        this.drawButton(ctx, 30, 502, 185, 52, t('aiMatch'), '#35b779', 'paid_ai_match', entryState.disabled);
        this.drawButton(ctx, 235, 502, 185, 52, t('practiceAi'), '#2d9cdb', 'practice_ai');
        this.drawButton(ctx, 30, 572, 185, 52, t('local2p'), '#7c68d9', 'practice_local');
        this.drawButton(ctx, 235, 572, 185, 52, t('rooms'), '#767d87', 'legacy_rooms', !this.network.isConnected);

        this.drawCard(ctx, 24, 666, 402, 112, '#ffffffc8');
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        const profileName = this.profile ? this.profile.displayName : t('guestPlayer');
        const rating = this.profile ? this.profile.rating : '--';
        const record = this.profile ? t('record', { wins: this.profile.wins, losses: this.profile.losses }) : '--';
        ctx.fillText(profileName, 54, 704);
        ctx.fillStyle = '#47707c';
        ctx.font = '15px sans-serif';
        ctx.fillText(t('rating', { rating }), 54, 734);
        ctx.fillText(record, 54, 758);
        ctx.textAlign = 'right';
        ctx.fillText(this.statusMessage, 404, 758);
        this.drawButton(ctx, 302, 694, 104, 42, t('details'), '#2d9cdb', 'profile', !this.network.accountId);
        this.drawButton(ctx, 30, 812, 390, 54, t('settings'), '#767d87', 'settings');
    }

    getEntryButtonState(table) {
        if (!this.network.isConnected) {
            return {
                label: this.isConnecting || this.network.connectionStatus === 'connecting' ? t('connecting') : t('connect'),
                disabled: true
            };
        }
        if (!this.wallet) {
            return { label: t('loadingCoins'), disabled: true };
        }
        if (this.wallet.available < table.stake) {
            return { label: t('notEnoughCoins'), disabled: true };
        }
        return { label: t('playButton'), disabled: false };
    }

    drawCoinConfirm(ctx) {
        const action = this.pendingPaidAction || { mode: 'quick_match', table: this.selectedTable };
        const table = action.table || this.selectedTable;
        const isAi = action.mode === 'paid_ai_match';
        const available = this.wallet?.available ?? 0;
        const afterEntry = Math.max(0, available - table.stake);
        const left = 54;

        this.drawTopBar(ctx);

        ctx.fillStyle = '#143642';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isAi ? t('confirmAiMatch') : t('confirm1v1Entry'), CENTER_X, 142);

        this.drawCard(ctx, 24, 190, 402, 330, '#ffffffdd', 'panel');
        ctx.textAlign = 'left';
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(this.formatTableLabel(table), left, 238);

        ctx.fillStyle = '#47707c';
        ctx.font = '16px sans-serif';
        ctx.fillText(isAi ? t('skillMatchedAi') : t('realPlayerMatchmaking'), left, 276);

        this.drawSettlementPreview(ctx, left, 330, t('entryReserved'), `-${table.stake}`, '#d9480f');
        this.drawSettlementPreview(ctx, left, 378, t('winnerPayout'), `+${table.winnerPayout}`, '#16884d');
        this.drawSettlementPreview(ctx, left, 426, t('systemSink'), `${table.systemSink}`, '#767d87');
        this.drawSettlementPreview(ctx, left, 474, t('balanceAfterEntry'), `${afterEntry}`, '#8a5a00');

        this.drawButton(ctx, 24, 574, 402, 68, t('confirmEntry'), '#ff8a3d', 'confirm_paid_entry');
        this.drawButton(ctx, 30, 660, 185, 56, t('cancel'), '#767d87', 'cancel_paid_entry');
        this.drawButton(ctx, 235, 660, 185, 56, t('practiceAi'), '#2d9cdb', 'practice_ai');
    }

    drawProfile(ctx) {
        this.drawTopBar(ctx);
        this.drawButton(ctx, 24, 92, 96, 42, t('back'), '#767d87', 'back_home');
        this.drawButton(ctx, 330, 92, 96, 42, t('refresh'), '#2d9cdb', 'refresh_profile', this.dashboardLoading);

        ctx.fillStyle = '#143642';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('walletRecord'), CENTER_X, 130);

        if (this.dashboardLoading && !this.dashboard) {
            this.drawCard(ctx, 24, 260, 402, 220, '#ffffffd8');
            ctx.fillStyle = '#143642';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(t('loading'), CENTER_X, 360);
            return;
        }

        if (this.dashboardError && !this.dashboard) {
            this.drawCard(ctx, 24, 240, 402, 250, '#ffffffd8', 'panel');
            ctx.fillStyle = '#d9480f';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(this.dashboardError, CENTER_X, 350);
            return;
        }

        const profile = this.dashboard?.profile || this.profile || {};
        const wallet = this.dashboard?.wallet || this.wallet || {};
        const matches = this.dashboard?.matches || [];
        const ledger = this.dashboard?.ledger || [];

        this.drawCard(ctx, 24, 160, 402, 158, '#ffffffdd');
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(profile.displayName || t('guestPlayer'), 54, 202);
        ctx.fillStyle = '#8a5a00';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(t('walletCoins', { value: wallet.balance ?? '--' }), CANVAS_WIDTH - 44, 204);

        ctx.fillStyle = '#47707c';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(t('availableReserved', { available: wallet.available ?? '--', reserved: wallet.reserved ?? 0 }), 54, 244);
        ctx.fillText(t('ratingStreak', { rating: profile.rating ?? '--', streak: profile.streak ?? 0 }), 54, 274);
        ctx.textAlign = 'right';
        ctx.fillText(t('record', { wins: profile.wins ?? 0, losses: profile.losses ?? 0 }), CANVAS_WIDTH - 44, 274);

        this.drawCard(ctx, 24, 344, 402, 176, '#ffffffd8');
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(t('recentMatches'), 54, 382);

        if (matches.length === 0) {
            ctx.fillStyle = '#47707c';
            ctx.font = '15px sans-serif';
            ctx.fillText(t('noMatches'), 54, 430);
        } else {
            for (let i = 0; i < Math.min(matches.length, 3); i++) {
                this.drawMatchRow(ctx, matches[i], 54, 418 + i * 34);
            }
        }

        this.drawCard(ctx, 24, 546, 402, 254, '#ffffffd8', 'panel');
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(t('walletLedger'), 54, 584);

        if (ledger.length === 0) {
            ctx.fillStyle = '#47707c';
            ctx.font = '15px sans-serif';
            ctx.fillText(t('noCoinActivity'), 54, 640);
        } else {
            for (let i = 0; i < Math.min(ledger.length, 5); i++) {
                this.drawLedgerRow(ctx, ledger[i], 54, 620 + i * 32);
            }
        }

        if (this.dashboardError) {
            ctx.fillStyle = '#d9480f';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.dashboardError, CENTER_X, 824);
        }
    }

    drawSettings(ctx) {
        this.drawTopBar(ctx);
        this.drawButton(ctx, 24, 92, 96, 42, t('back'), '#767d87', 'back_home');

        ctx.fillStyle = '#143642';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('settingsTitle'), CENTER_X, 138);

        const rows = [
            ['audioEnabled', t('sound'), this.settings.audioEnabled],
            ['musicEnabled', t('music'), this.settings.musicEnabled]
        ];
        if (canUseVibration()) {
            rows.push(['vibrationEnabled', t('vibration'), this.settings.vibrationEnabled]);
        }

        this.drawCard(ctx, 24, 190, 402, canUseVibration() ? 252 : 190, '#ffffffdd', 'panel');
        rows.forEach((row, index) => {
            this.drawToggleRow(ctx, 54, 250 + index * 66, row[1], row[0], row[2]);
        });

        ctx.fillStyle = '#47707c';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('settingsSavedAutomatically'), CENTER_X, 520);
    }

    drawToggleRow(ctx, x, y, label, key, enabled) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(label, x, y);

        const pillW = 86;
        const pillH = 38;
        const pillX = CANVAS_WIDTH - 54 - pillW;
        const color = enabled ? '#35b779' : '#767d87';
        this.drawButton(ctx, pillX, y - pillH / 2, pillW, pillH, enabled ? t('on') : t('off'), color, `toggle_${key}`);
    }

    drawAiDifficulty(ctx) {
        this.drawTopBar(ctx);
        this.drawButton(ctx, 24, 92, 96, 42, t('back'), '#767d87', 'back_home');

        ctx.fillStyle = '#143642';
        ctx.font = 'bold 31px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('chooseAiDifficulty'), CENTER_X, 160);

        this.drawCard(ctx, 24, 222, 402, 360, '#ffffffdd', 'panel');
        this.drawPuckPreview(ctx, CENTER_X, 310, true);
        this.drawButton(ctx, 52, 398, 346, 58, t('easy'), '#35b779', 'practice_ai_easy');
        this.drawButton(ctx, 52, 474, 346, 58, t('medium'), '#ff8a3d', 'practice_ai_medium');
        this.drawButton(ctx, 52, 550, 346, 58, t('hard'), '#d9480f', 'practice_ai_hard');
    }

    drawTextBackplate(ctx, x, y, w, h) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 8);
        ctx.fill();
        ctx.restore();
    }

    drawServerText(ctx, text, x, y, maxWidth) {
        let display = text || '--';
        ctx.font = '14px sans-serif';
        while (ctx.measureText(display).width > maxWidth && display.length > 12) {
            display = `${display.slice(0, -4)}...`;
        }
        ctx.fillStyle = '#143642';
        ctx.textAlign = 'left';
        ctx.fillText(display, x, y);
    }

    drawMatchRow(ctx, match, x, y) {
        const resultColor = match.result === 'win' ? '#16884d' : match.result === 'loss' ? '#d9480f' : '#47707c';
        const resultLabel = this.formatMatchState(match);
        const opponent = match.opponent?.profile?.displayName || (match.mode === 'ai' ? 'Pello AI' : t('opponent'));

        ctx.fillStyle = resultColor;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(resultLabel, x, y);
        ctx.fillStyle = '#143642';
        ctx.font = '14px sans-serif';
        ctx.fillText(opponent.slice(0, 14), x + 58, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#47707c';
        ctx.fillText(this.formatMatchCoins(match), CANVAS_WIDTH - 44, y);
    }

    drawLedgerRow(ctx, row, x, y) {
        this.drawTextBackplate(ctx, x - 8, y - 20, CANVAS_WIDTH - 88, 27);
        const label = this.ledgerLabel(row.type);
        const amount = row.amount === 0 ? this.formatReserveDelta(row.reservedDelta) : this.formatSignedCoins(row.amount);

        ctx.fillStyle = row.amount > 0 ? '#16884d' : row.amount < 0 ? '#d9480f' : '#47707c';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(amount, x, y);
        ctx.fillStyle = '#143642';
        ctx.font = '14px sans-serif';
        ctx.fillText(label, x + 86, y);
        ctx.fillStyle = '#47707c';
        ctx.textAlign = 'right';
        const balance = row.balanceAfter === null ? '' : t('balance', { balance: row.balanceAfter });
        ctx.fillText(balance, CANVAS_WIDTH - 44, y);
    }

    drawMatchmaking(ctx) {
        const table = this.queueTable || this.selectedTable;
        this.drawTopBar(ctx);
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('findingRival'), CENTER_X, 138);

        const elapsed = this.queuedAt ? Math.floor((Date.now() - this.queuedAt) / 1000) : 0;
        const timeout = Math.ceil((table.matchmakingTimeoutMs || 15000) / 1000);
        const aiReady = elapsed >= timeout;
        const aiRemaining = Math.max(0, timeout - elapsed);
        const progress = Math.min(1, elapsed / Math.max(1, timeout));

        this.drawCard(ctx, 24, 178, 402, 392, '#ffffffdd', 'panel');

        const pulse = 1 + Math.sin(this.animPhase * 4) * 0.08;
        ctx.save();
        ctx.translate(CENTER_X, 292);
        ctx.scale(pulse, pulse);
        this.drawPuckPreview(ctx, 0, 0, true);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.roundRect(56, 390, 338, 18, 9);
        ctx.fill();
        const bar = ctx.createLinearGradient(56, 390, 394, 390);
        bar.addColorStop(0, '#35b779');
        bar.addColorStop(1, '#2d9cdb');
        ctx.fillStyle = bar;
        ctx.beginPath();
        ctx.roundRect(56, 390, Math.max(18, 338 * progress), 18, 9);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#2d6775';
        ctx.font = '20px sans-serif';
        ctx.fillText(t('searchingSeconds', { seconds: elapsed }), CENTER_X, 446);
        ctx.font = '16px sans-serif';
        ctx.fillText(t('entryWin', { stake: table.stake, win: table.winnerPayout }), CENTER_X, 480);
        ctx.fillStyle = aiReady ? '#16884d' : '#47707c';
        ctx.font = '15px sans-serif';
        ctx.fillText(aiReady ? t('aiReady') : t('aiUnlocks', { seconds: aiRemaining }), CENTER_X, 516);

        this.drawButton(ctx, 24, 612, 402, 64, t('keepWaiting'), '#ff8a3d', 'noop', true);
        this.drawButton(ctx, 30, 698, 185, 58, aiReady ? t('playAiNow') : t('aiIn', { seconds: aiRemaining }), '#35b779', 'ai_match', !aiReady);
        this.drawButton(ctx, 235, 698, 185, 58, t('cancel'), '#767d87', 'cancel_matchmaking');
    }

    drawVersus(ctx) {
        const match = this.gameStartMessage?.match;
        const me = match?.participants?.find(p => p.playerId === this.network.playerId);
        const opponent = match?.participants?.find(p => p.playerId !== this.network.playerId) || match?.participants?.find(p => p.profile?.isAi);
        const aiProfile = opponent?.profile?.isAi ? opponent.profile : null;
        this.drawTopBar(ctx);

        ctx.fillStyle = '#143642';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(match?.mode === 'ai' ? t('aiChallenge') : t('rivalFound'), CENTER_X, 134);

        this.drawCard(ctx, 24, 184, 402, 386, '#ffffffdd', 'panel');
        this.drawAvatar(ctx, CENTER_X - 92, 310, '#2d9cdb', me?.profile?.displayName || t('you'));
        this.drawAvatar(ctx, CENTER_X + 92, 310, '#ff6b6b', opponent?.profile?.displayName || t('opponent'));

        ctx.fillStyle = '#143642';
        ctx.font = 'bold 42px sans-serif';
        ctx.fillText('VS', CENTER_X, 326);
        ctx.font = '18px sans-serif';
        ctx.fillText(t('winnerGets', { coins: match?.winnerPayout || this.selectedTable.winnerPayout }), CENTER_X, 472);
        ctx.fillStyle = '#47707c';
        ctx.font = '15px sans-serif';
        if (aiProfile) {
            const difficulty = this.formatAiDifficulty(aiProfile.difficulty);
            ctx.fillText(t('challengeMatched', { difficulty, score: aiProfile.skillScore || aiProfile.rating || '--' }), CENTER_X, 512);
            ctx.fillText(t('starting'), CENTER_X, 540);
        } else {
            ctx.fillText(t('starting'), CENTER_X, 512);
        }
    }

    formatAiDifficulty(difficulty) {
        const labels = {
            easy: t('easy'),
            medium: t('medium'),
            hard: t('hard')
        };
        return labels[difficulty] || t('balanced');
    }

    formatMatchState(match = {}) {
        if (match.result === 'win') return t('matchWin');
        if (match.result === 'loss') return t('matchLoss');

        const labels = {
            pending: t('matchPending'),
            queued: t('matchQueued'),
            active: t('matchActive'),
            settled: t('matchSettled'),
            abandoned: t('matchAbandoned')
        };
        return labels[match.state] || (match.state ? match.state.toUpperCase() : t('matchPending'));
    }

    formatRoomState(state) {
        const labels = {
            waiting: t('roomWaiting'),
            playing: t('roomPlaying'),
            finished: t('roomFinished')
        };
        return labels[state] || String(state || '').toUpperCase();
    }

    formatRoomName(room = {}) {
        const rawName = String(room.name || '').trim();
        const normalized = rawName.toLowerCase();
        if (normalized === 'casual table') return t('casualRoom');
        if (normalized === 'fast match') return t('fastRoom');
        if (/^room\s+\d+$/i.test(rawName) || /^房间\s*\d+$/u.test(rawName)) {
            const id = rawName.match(/\d+/)?.[0] || room.id || '';
            return t('roomFallback', { id });
        }
        return rawName || t('roomFallback', { id: room.id || '--' });
    }

    drawLegacyRooms(ctx) {
        this.drawTopBar(ctx);
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('legacyRooms'), CENTER_X, 116);
        this.drawButton(ctx, 24, 92, 96, 42, t('back'), '#767d87', 'back_home');

        this.drawCard(ctx, 24, 158, 402, 516, '#ffffffd8', 'panel');
        if (this.rooms.length === 0) {
            ctx.fillStyle = '#47707c';
            ctx.font = '17px sans-serif';
            ctx.fillText(t('noRoomsYet'), CENTER_X, 400);
        } else {
            for (let i = 0; i < Math.min(this.rooms.length, 6); i++) {
                const room = this.rooms[i];
                const y = 186 + i * 72;
                ctx.fillStyle = '#f6fbff';
                ctx.beginPath();
                ctx.roundRect(44, y, 362, 56, 10);
                ctx.fill();
                ctx.fillStyle = '#143642';
                ctx.font = 'bold 16px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(this.formatRoomName(room), 64, y + 24);
                ctx.fillStyle = '#47707c';
                ctx.font = '13px sans-serif';
                const playerCount = room.playerCount ?? 0;
                const maxPlayers = room.maxPlayers ?? 2;
                ctx.fillText(t('roomPlayers', {
                    count: playerCount,
                    max: maxPlayers,
                    state: this.formatRoomState(room.state)
                }), 64, y + 44);
                if (room.state === 'waiting' && room.playerCount < room.maxPlayers) {
                    this.drawButton(ctx, CANVAS_WIDTH - 128, y + 10, 84, 36, t('join'), '#35b779', `room_${room.id}`);
                }
            }
        }
        this.drawButton(ctx, 24, 710, 402, 58, t('createRoom'), '#2d9cdb', 'create_room');
    }

    drawInRoom(ctx) {
        if (!this.currentRoom) return;
        this.drawTopBar(ctx);
        this.drawButton(ctx, 24, 92, 96, 42, t('leave'), '#d9480f', 'leave_room');
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.formatRoomName(this.currentRoom), CENTER_X, 150);

        this.drawCard(ctx, 24, 210, 402, 250, '#ffffffd8', 'panel');
        this.drawRoomPlayer(ctx, 54, 270, t('host'), this.currentRoom.hostName, this.currentRoom.hostReady);
        this.drawRoomPlayer(ctx, 54, 360, t('guest'), this.currentRoom.guestName || t('waiting'), this.currentRoom.guestReady);

        const isHost = this.network.playerIndex === 'A';
        const bothReady = this.currentRoom.hostReady && this.currentRoom.guestReady;
        if (isHost && bothReady && this.canStartGame) {
            this.drawButton(ctx, 24, 520, 402, 64, t('startGame'), '#35b779', 'start_game');
        } else if (this.isReady) {
            this.drawButton(ctx, 24, 520, 402, 64, t('cancelReady'), '#ff8a3d', 'cancel_ready');
        } else {
            this.drawButton(ctx, 24, 520, 402, 64, t('ready'), '#35b779', 'ready');
        }
    }

    drawRoomPlayer(ctx, x, y, label, name, ready) {
        const rowW = CANVAS_WIDTH - x - 44;
        ctx.fillStyle = ready ? '#e4fff0' : '#f6fbff';
        ctx.beginPath();
        ctx.roundRect(x, y - 34, rowW, 62, 10);
        ctx.fill();
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${label}: ${name}`, x + 20, y - 4);
        ctx.fillStyle = ready ? '#16884d' : '#767d87';
        ctx.textAlign = 'right';
        ctx.fillText(ready ? t('ready') : t('wait'), x + rowW - 20, y - 4);
    }

    drawSettlementPreview(ctx, x, y, label, value, color) {
        ctx.fillStyle = '#47707c';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, x, y);

        ctx.fillStyle = color;
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(t('coins', { value }), CANVAS_WIDTH - 44, y);
    }

    drawPuckPreview(ctx, x, y, centered = false) {
        const cx = centered ? x : x;
        const cy = centered ? y : y;
        ctx.save();
        ctx.shadowColor = 'rgba(255, 122, 24, 0.46)';
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, 48, 0, Math.PI * 2);
        const outer = ctx.createRadialGradient(cx - 16, cy - 18, 4, cx, cy, 54);
        outer.addColorStop(0, '#fff2d6');
        outer.addColorStop(0.24, '#ffb342');
        outer.addColorStop(1, '#ff7a18');
        ctx.fillStyle = outer;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = '#ffe5b8';
        ctx.beginPath();
        ctx.arc(cx, cy, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,54,66,0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 17, cy - 17, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawAvatar(ctx, x, y, color, name) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 58, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y - 16, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x - 32, y + 10, 64, 32, 16);
        ctx.fill();
        ctx.fillStyle = '#143642';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(name.slice(0, 12), x, y + 94);
        ctx.restore();
    }

    drawCard(ctx, x, y, w, h, color, assetName = null) {
        const box = this.normalizeBox(x, y, w, h);
        x = box.x; y = box.y; w = box.w; h = box.h;
        const resolvedAsset = assetName === false ? null : (assetName || (h > 240 ? 'modal' : 'panel'));
        if (resolvedAsset && drawUIAsset(ctx, resolvedAsset, x, y, w, h)) {
            return;
        }

        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 16);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    drawPill(ctx, x, y, w, h, color, stroke) {
        const isCoin = String(color || '').includes('fff') || String(color || '').includes('f6c');
        if (isCoin && drawUIAsset(ctx, 'coinPill', x, y, w, h)) {
            return;
        }

        ctx.fillStyle = color;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, h / 2);
        ctx.fill();
        ctx.stroke();
    }

    drawButton(ctx, x, y, w, h, text, color, id, disabled = false) {
        const box = this.normalizeBox(x, y, w, h);
        x = box.x; y = box.y; w = box.w; h = box.h;
        this.buttons.push({ x, y, w, h, id, disabled });
        ctx.save();
        ctx.globalAlpha = disabled ? 0.45 : 1;
        if (!drawUIAsset(ctx, getButtonAsset(color), x, y, w, h)) {
            const gradient = ctx.createLinearGradient(x, y, x, y + h);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, this.darkenColor(color, 0.18));
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        let fontSize = w < 100 ? 12 : w < 150 ? 14 : 17;
        ctx.font = `bold ${fontSize}px sans-serif`;
        while (fontSize > 10 && ctx.measureText(text).width > w - 22) {
            fontSize -= 1;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2);
        ctx.restore();
    }

    normalizeBox(x, y, w, h) {
        const margin = 24;
        const maxW = CANVAS_WIDTH - margin * 2;
        if (w > maxW) {
            return { x: margin, y, w: maxW, h };
        }
        if (w >= 210 && w < 300) {
            const colW = (CANVAS_WIDTH - 60 - 20) / 2;
            if (x > CANVAS_WIDTH / 2) return { x: 30 + colW + 20, y, w: colW, h };
            if (x < 100) return { x: 30, y, w: colW, h };
        }
        if (x + w > CANVAS_WIDTH - margin) {
            return { x: Math.max(margin, CANVAS_WIDTH - margin - w), y, w: Math.min(w, maxW), h };
        }
        return { x, y, w, h };
    }

    darkenColor(hex, factor) {
        const clean = hex.replace('#', '');
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        return `rgb(${Math.floor(r * (1 - factor))}, ${Math.floor(g * (1 - factor))}, ${Math.floor(b * (1 - factor))})`;
    }

    formatMatchCoins(match) {
        const stake = this.resolveMatchStake(match);
        if (!match.settlement) {
            if (match.state === 'abandoned') return t('released');
            return t('stake', { stake });
        }

        if (match.result === 'win') {
            const net = (match.settlement.winnerPayout || 0) - stake;
            return this.formatSignedCoins(net);
        }
        return this.formatSignedCoins(-stake);
    }

    resolveMatchStake(match = {}) {
        return match.stake
            ?? match.table?.stake
            ?? match.settlement?.stake
            ?? match.settlement?.entryFee
            ?? this.selectedTable.stake;
    }

    formatTableLabel(table = this.selectedTable) {
        const label = table.label || 'Bronze 1v1';
        if (locale === 'zh' && (table.id === TABLE_ID || /^bronze\b/i.test(label))) {
            return '青铜 1v1';
        }
        return label;
    }

    formatSignedCoins(amount) {
        if (amount > 0) return `+${amount}`;
        if (amount < 0) return `${amount}`;
        return '0';
    }

    formatReserveDelta(amount) {
        if (amount > 0) return t('hold', { amount });
        if (amount < 0) return t('free', { amount: Math.abs(amount) });
        return '0';
    }

    ledgerLabel(type) {
        const labels = {
            'grant.initial': t('ledgerGrant'),
            'match.stake.reserve': t('ledgerReserve'),
            'match.stake.release': t('ledgerRelease'),
            'match.stake.consume': t('ledgerConsume'),
            'match.payout': t('ledgerPayout'),
            'match.ai_reward': t('ledgerAiReward')
        };
        return labels[type] || type;
    }

    async setServerUrl() {
        if (this.network.isServerBaseUrlLocked()) {
            this.statusMessage = t('serverLocked');
            this.errorMessage = null;
            this.draw();
            return;
        }

        const current = this.network.getConfiguredServerBaseUrl() || '';
        const promptValue = typeof window !== 'undefined' && typeof window.prompt === 'function'
            ? window.prompt(t('backendUrl'), current || 'http://192.168.1.23:3000')
            : current;
        if (promptValue === null) return;

        const normalized = this.network.setServerBaseUrl(promptValue);
        if (promptValue.trim() && !normalized) {
            this.errorMessage = t('invalidServerUrl');
            this.statusMessage = t('serverUnchanged');
            this.draw();
            return;
        }

        this.settings = updateSetting('serverUrl', normalized || '');
        this.network.disconnect();
        this.profile = null;
        this.wallet = null;
        this.serverBaseUrl = this.network.getDisplayServerBaseUrl();
        this.statusMessage = normalized ? t('serverSaved') : t('serverReset');
        this.errorMessage = null;
        this.draw();
    }

    handleBack() {
        if (this.currentScreen === 'coin_confirm') {
            this.pendingPaidAction = null;
            this.currentScreen = 'home';
            this.draw();
            return true;
        }

        if (this.currentScreen === 'matchmaking') {
            this.network.cancelMatchmaking();
            return true;
        }

        if (this.currentScreen === 'in_room') {
            this.network.leaveRoom();
            this.currentScreen = 'legacy_rooms';
            this.currentRoom = null;
            this.isReady = false;
            this.canStartGame = false;
            this.draw();
            return true;
        }

        if (this.currentScreen !== 'home') {
            this.currentScreen = 'home';
            this.draw();
            return true;
        }

        return false;
    }

    async handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        for (const btn of this.buttons) {
            if (btn.disabled) continue;
            if (mouseX < btn.x || mouseX > btn.x + btn.w || mouseY < btn.y || mouseY > btn.y + btn.h) continue;

            if (btn.id === 'quick_match') {
                this.openPaidConfirm('quick_match');
            } else if (btn.id === 'cancel_matchmaking') {
                this.network.cancelMatchmaking();
            } else if (btn.id === 'paid_ai_match') {
                this.openPaidConfirm('paid_ai_match');
            } else if (btn.id === 'ai_match') {
                this.errorMessage = null;
                this.statusMessage = this.currentScreen === 'matchmaking' ? t('switchingToAi') : t('preparingAiMatch');
                this.draw();
                this.network.startAiMatch(this.getCurrentTableId());
            } else if (btn.id === 'confirm_paid_entry') {
                this.confirmPaidEntry();
            } else if (btn.id === 'cancel_paid_entry') {
                this.pendingPaidAction = null;
                this.currentScreen = 'home';
                this.draw();
            } else if (btn.id === 'practice_ai') {
                this.currentScreen = 'practice_ai_select';
                this.draw();
            } else if (btn.id.startsWith('practice_ai_')) {
                const difficulty = btn.id.replace('practice_ai_', '');
                const cb = this.onStart;
                this.onStart = null;
                this.cleanup();
                cb('practice_ai', { difficulty });
                return;
            } else if (btn.id === 'practice_local') {
                const cb = this.onStart;
                this.onStart = null;
                this.cleanup();
                cb('practice_local');
                return;
            } else if (btn.id === 'legacy_rooms') {
                this.currentScreen = 'legacy_rooms';
                this.draw();
            } else if (btn.id === 'profile') {
                this.currentScreen = 'profile';
                await this.loadDashboard();
            } else if (btn.id === 'settings') {
                this.currentScreen = 'settings';
                this.draw();
            } else if (btn.id.startsWith('toggle_')) {
                const key = btn.id.replace('toggle_', '');
                this.settings = updateSetting(key, !this.settings[key]);
                this.draw();
            } else if (btn.id === 'refresh_profile') {
                await this.loadDashboard();
            } else if (btn.id === 'back_home') {
                this.currentScreen = 'home';
                this.draw();
            } else if (btn.id === 'create_room') {
                this.network.createRoom();
            } else if (btn.id.startsWith('room_')) {
                this.network.joinRoom(parseInt(btn.id.replace('room_', ''), 10));
            } else if (btn.id === 'leave_room') {
                this.network.leaveRoom();
                this.currentScreen = 'legacy_rooms';
                this.currentRoom = null;
                this.isReady = false;
                this.canStartGame = false;
                this.draw();
            } else if (btn.id === 'ready') {
                this.network.sendReady();
                this.isReady = true;
                this.draw();
            } else if (btn.id === 'cancel_ready') {
                this.network.sendCancelReady();
                this.isReady = false;
                this.canStartGame = false;
                this.draw();
            } else if (btn.id === 'start_game') {
                this.canStartGame = false;
                this.draw();
                this.network.sendStartGame();
            }
            return;
        }
    }

    openPaidConfirm(mode) {
        this.pendingPaidAction = {
            mode,
            table: this.selectedTable
        };
        this.currentScreen = 'coin_confirm';
        this.statusMessage = t('confirmEntryStatus');
        this.draw();
    }

    confirmPaidEntry() {
        const action = this.pendingPaidAction;
        if (!action) return;

        const tableId = action.table?.id || this.getCurrentTableId();
        this.pendingPaidAction = null;
        this.errorMessage = null;

        if (action.mode === 'paid_ai_match') {
            this.statusMessage = t('preparingAiMatch');
            this.currentScreen = 'home';
            this.draw();
            this.network.startAiMatch(tableId);
            return;
        }

        this.statusMessage = t('joiningQueue');
        this.currentScreen = 'home';
        this.draw();
        this.network.quickMatch(tableId);
    }

    cleanup() {
        this.isActive = false;
        clearInterval(this.animationTimer);
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('touchstart', this.handleTouch);
    }
}
