/**
 * Ring Rush - 弹棋
 * 应用入口文件
 */
import { CANVAS_WIDTH, CANVAS_HEIGHT, VERSION } from './constants.js';
import { Game } from './game.js';
import { LocalGame } from './game-local.js';
import { BotGame } from './game-bot.js';
import { StartScreen } from './startscreen.js';

window.onload = function() {
    const canvas = document.getElementById('gameCanvas');
    let game = null;

    // 显示版本号
    document.getElementById('version').textContent = `v${VERSION}`;

    // 自适应 Canvas 大小
    function resizeCanvas() {
        const maxWidth = window.innerWidth - 20;
        const maxHeight = window.innerHeight - 20;
        const aspectRatio = CANVAS_WIDTH / CANVAS_HEIGHT;

        let width = maxWidth;
        let height = width / aspectRatio;

        if (height > maxHeight) {
            height = maxHeight;
            width = height * aspectRatio;
        }

        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let startScreen;

    function createStartScreen(existingNetwork = null) {
        const screen = new StartScreen(canvas, (mode, difficulty) => {
            if (game) {
                game.cleanup();
            }
            
            if (mode === 'online') {
                game = new Game(canvas);
                const network = screen.network;
                screen.cleanup();

                const msg = screen.gameStartMessage;
                if (msg) {
                    game.initOnlineGame(network, msg.playerIndex, msg.opponentName);
                    screen.gameStartMessage = null;
                } else {
                    network.onGameStart = (message) => {
                        game.initOnlineGame(network, message.playerIndex, message.opponentName);
                    };
                }
                
                game.onExit = () => {
                    if (game) game.cleanup();
                    network.leaveRoom();
                    startScreen = createStartScreen(network);
                    startScreen.currentScreen = 'online_lobby';
                    startScreen.network.send({ type: 'get_rooms' });
                    startScreen.draw();
                };
            } else {
                if (mode === 'local') {
                    game = new LocalGame(canvas);
                } else {
                    game = new BotGame(canvas);
                }
                
                screen.cleanup();
                game.init(difficulty);
                
                game.onExit = () => {
                    if (game) game.cleanup();
                    startScreen = createStartScreen();
                    startScreen.draw();
                };
            }
        });
        
        if (existingNetwork) {
            screen.network = existingNetwork;
            screen.isConnecting = false;
            screen.network.onRoomList = (rooms) => {
                screen.rooms = rooms;
                screen.draw();
            };
            screen.network.onMessage = (message) => {
                screen.handleNetworkMessage(message);
            };
        }
        
        return screen;
    }

    startScreen = createStartScreen();
    startScreen.draw();
};
