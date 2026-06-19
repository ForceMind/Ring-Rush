import './app-config.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, VERSION } from './constants.js';
import { Game } from './game.js';
import { BotGame } from './game-bot.js';
import { LocalGame } from './game-local.js';
import { OnlineStartScreen } from './online-startscreen.js';
import { App as CapacitorApp } from '@capacitor/app';
import { installCanvasLocalization, locale, t } from './i18n.js';

let appBooted = false;

function installHiDpiCanvas(canvas) {
    const maxDpr = 3;
    const apply = () => {
        const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, maxDpr));
        const width = Math.round(CANVAS_WIDTH * dpr);
        const height = Math.round(CANVAS_HEIGHT * dpr);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx.setTransform) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        ctx.imageSmoothingEnabled = true;
        canvas.dataset.pixelRatio = String(dpr);
    };

    canvas.__pelloApplyHiDpi = apply;
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
}

function bootApp() {
    if (appBooted) return;
    appBooted = true;

    installCanvasLocalization();
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';

    const canvas = document.getElementById('gameCanvas');
    installHiDpiCanvas(canvas);
    let game = null;
    let startScreen = null;

    document.getElementById('version').textContent = `v${VERSION}`;

    function handleBackNavigation() {
        if (game && !game.isDestroyed) {
            if (game.gameOver) {
                game.exitGame();
                return true;
            }
            if (game.modals) {
                game.modals.showSurrenderConfirm();
                return true;
            }
            return true;
        }

        if (startScreen && startScreen.handleBack()) {
            return true;
        }

        return false;
    }

    try {
        CapacitorApp.addListener('backButton', () => {
            const handled = handleBackNavigation();
            if (!handled) {
                CapacitorApp.exitApp();
            }
        });
    } catch (error) {
        console.warn('Capacitor back button unavailable', error);
    }

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && handleBackNavigation()) {
            event.preventDefault();
        }
    });

    function attachHomeScreen(network = null) {
            startScreen = new OnlineStartScreen(canvas, startCompetitiveGame, network);
        startScreen.currentScreen = 'home';

        if (startScreen.network.isConnected) {
            startScreen.bindNetworkHandlers();
            startScreen.statusMessage = t('connected');
            startScreen.network.requestCompetitiveProfile();
            startScreen.draw();
            return Promise.resolve();
        }

        return startScreen.connectToServer().then(() => {
            startScreen.draw();
        });
    }

    function returnToHome(network) {
        if (game) {
            game.cleanup();
            game = null;
        }

        attachHomeScreen(network);
    }

    function bindGameConnectionStatus(activeGame, network) {
        activeGame.connectionStatus = network.connectionStatus || (network.isConnected ? 'connected' : 'offline');
        network.onConnectionStatus = (status) => {
            if (game === activeGame) {
                activeGame.connectionStatus = status;
            }
        };
    }

    function startCompetitiveGame(mode, startMessage) {
        const sourceScreen = startScreen;
        const network = sourceScreen.network;

        const msg = startMessage || sourceScreen.gameStartMessage;
        startScreen = null;

        if (mode === 'practice_ai') {
            game = new BotGame(canvas);
            game.init(startMessage?.difficulty || 'medium');
        } else if (mode === 'practice_local') {
            game = new LocalGame(canvas);
            game.init();
        } else if (mode === 'competitive_ai') {
            const aiParticipant = msg.match?.participants?.find(p => p.profile?.isAi);
            const difficulty = aiParticipant?.profile?.difficulty || 'medium';
            game = new BotGame(canvas);
            game.network = network;
            game.competitiveMatch = msg.match;
            game.competitiveEntryWallet = msg.wallet;
            game.competitiveWallet = msg.wallet;
            bindGameConnectionStatus(game, network);
            game.init(difficulty);
        } else {
            game = new Game(canvas);
            if (msg) {
                game.competitiveMatch = msg.match;
                game.competitiveEntryWallet = msg.wallet;
                game.competitiveWallet = msg.wallet;
                game.initOnlineGame(network, msg.playerIndex, msg.opponentName || 'Opponent');
                sourceScreen.gameStartMessage = null;
            } else {
                network.onGameStart = (message) => {
                    game.competitiveMatch = network.activeMatch;
                    game.initOnlineGame(network, message.playerIndex, message.opponentName);
                };
            }
        }

        if (game.competitiveMatch) {
            network.onCompetitiveSettlement = (message) => {
                if (!game) return;
                game.competitiveSettlement = message;
                game.competitiveSettlementReceivedAt = Date.now();
                game.competitiveSettlementError = null;
                game.competitiveWallet = message.wallet;
            };

            network.onCompetitiveError = (message) => {
                if (!game) return;
                game.competitiveSettlementError = message.message || t('settlementFailed');
                game.competitiveSettlementReceivedAt = Date.now();
            };

            game.onGameOver = ({ winner, reason, state }) => {
                if (!game.competitiveMatch || game._competitiveResultSubmitted) return;
                game._competitiveResultSubmitted = true;

                let winnerRef = winner;
                if (game.competitiveMatch.mode === 'ai') {
                    winnerRef = winner === 'A' ? 'player' : 'ai';
                }

                network.submitCompetitiveResult(
                    game.competitiveMatch.id,
                    winnerRef,
                    reason || state?.pendingWinReason || 'normal',
                    state || game.getState()
                );
            };
        }

        game.onExit = () => {
            returnToHome(network);
        };
    }

    attachHomeScreen();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp, { once: true });
} else {
    bootApp();
}
