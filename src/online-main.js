/**
 * Ring Rush - 弹棋
 * 在线对战入口文件
 */
import { CANVAS_WIDTH, CANVAS_HEIGHT, VERSION } from './constants.js';
import { Game } from './game.js';
import { OnlineStartScreen } from './online-startscreen.js';

window.onload = function() {
    const canvas = document.getElementById('gameCanvas');
    const game = new Game(canvas);

    // 显示版本号
    document.getElementById('version').textContent = `v${VERSION}`;

    // 自适应 Canvas 大小
    function resizeCanvas() {
        const maxWidth = window.innerWidth - 20;
        const maxHeight = window.innerHeight - 20;
        const aspectRatio = CANVAS_WIDTH / CANVAS_HEIGHT;

        if (maxWidth / maxHeight > aspectRatio) {
            canvas.style.height = `${maxHeight}px`;
            canvas.style.width = `${maxHeight * aspectRatio}px`;
        } else {
            canvas.style.width = `${maxWidth}px`;
            canvas.style.height = `${maxWidth / aspectRatio}px`;
        }
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const startScreen = new OnlineStartScreen(canvas, (mode, difficulty) => {
        const network = startScreen.network;
        startScreen.cleanup();
        
        const msg = startScreen.gameStartMessage;
        if (msg) {
            game.initOnlineGame(network, msg.playerIndex, msg.opponentName);
            startScreen.gameStartMessage = null;
        } else {
            network.onGameStart = (message) => {
                game.initOnlineGame(network, message.playerIndex, message.opponentName);
            };
        }

        game.onExit = () => {
            network.disconnect();
            window.location.reload();
        };
    });

    // 跳过主菜单，直接进入在线大厅
    startScreen.currentScreen = 'online_lobby';
    startScreen.connectToServer().then(() => {
        startScreen.draw();
    });
};
