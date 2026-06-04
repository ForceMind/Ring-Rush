/**
 * Ring Rush - Chat
 * 游戏内快捷聊天系统管理器
 */

export class ChatManager {
    constructor(game) {
        this.game = game;
        this.chatMessages = [];
    }

    initDOM() {
        if (this.game.gameMode === 'online') {
            if (!document.getElementById('ringRushChatContainer')) {
                const container = document.createElement('div');
                container.id = 'ringRushChatContainer';
                container.innerHTML = `
                    <style>
                        #ringRushChatContainer {
                            position: absolute;
                            bottom: 20px;
                            left: 20px; /* 改到左边避免挡住右侧的倒计时 */
                            z-index: 100;
                            display: flex;
                            flex-direction: column;
                            align-items: flex-start; /* 菜单向左对齐 */
                            font-family: sans-serif;
                        }
                        #chatMenu {
                            display: none;
                            flex-direction: column;
                            background: rgba(40, 40, 40, 0.95);
                            border-radius: 8px;
                            padding: 8px 0;
                            margin-bottom: 10px;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                            border: 1px solid #555;
                        }
                        #chatMenu.active {
                            display: flex;
                        }
                        .chat-btn {
                            width: 50px;
                            height: 50px;
                            border-radius: 25px;
                            background: #444; /* 中性背景色 */
                            color: white;
                            border: none;
                            font-size: 24px;
                            cursor: pointer;
                            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            transition: transform 0.2s, background 0.2s;
                        }
                        .chat-btn:active {
                            transform: scale(0.95);
                        }
                        .chat-option {
                            background: transparent;
                            border: none;
                            color: white;
                            padding: 10px 20px;
                            text-align: left;
                            cursor: pointer;
                            font-size: 14px;
                            transition: background 0.2s;
                            white-space: nowrap;
                        }
                        .chat-option:hover {
                            background: rgba(255, 255, 255, 0.1);
                        }
                    </style>
                    <div id="chatMenu">
                        <button class="chat-option" data-id="1">你好，祝你好运！ 👋</button>
                        <button class="chat-option" data-id="2">打得不错！ 👍</button>
                        <button class="chat-option" data-id="3">漂亮的一击！ 🎯</button>
                        <button class="chat-option" data-id="4">哎呀，失误了... 💦</button>
                        <button class="chat-option" data-id="5">快点吧，我等得花儿都谢了！ ⏰</button>
                        <button class="chat-option" data-id="6">谢谢指教，再来一局？ 🤝</button>
                    </div>
                    <button class="chat-btn">💬</button>
                `;
                document.getElementById('gameContainer').appendChild(container);

                const btn = container.querySelector('.chat-btn');
                const menu = container.querySelector('#chatMenu');
                const options = container.querySelectorAll('.chat-option');

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.classList.toggle('active');
                });

                options.forEach(opt => {
                    opt.addEventListener('click', () => {
                        this.sendChat(opt.dataset.id);
                        menu.classList.remove('active');
                    });
                });

                document.addEventListener('click', () => {
                    menu.classList.remove('active');
                });
            } else {
                document.getElementById('ringRushChatContainer').style.display = 'flex';
            }
        } else {
            const chatEl = document.getElementById('ringRushChatContainer');
            if (chatEl) chatEl.style.display = 'none';
        }
    }

    sendChat(text) {
        if (!this.game.isOnlineGame()) return;
        this.game.network.send({ type: 'chat', text });
        this.addMessage(text, this.game.network.playerIndex);
    }

    addMessage(textOrId, playerIndex) {
        const CHAT_MAP = {
            '1': '你好，祝你好运！ 👋',
            '2': '打得不错！ 👍',
            '3': '漂亮的一击！ 🎯',
            '4': '哎呀，失误了... 💦',
            '5': '快点吧，我等得花儿都谢了！ ⏰',
            '6': '谢谢指教，再来一局？ 🤝'
        };
        const text = CHAT_MAP[textOrId] || textOrId;
        this.chatMessages.push({ text, playerIndex, timestamp: Date.now() });
    }

    update() {
        const now = Date.now();
        this.chatMessages = this.chatMessages.filter(msg => now - msg.timestamp < 3500);
    }

    setVisibility(visible) {
        const chatEl = document.getElementById('ringRushChatContainer');
        if (chatEl) chatEl.style.display = visible ? 'flex' : 'none';
    }

    draw(ctx) {
        // Draw chat bubbles logic previously inside UI or Game
        // But the actual rendering of bubbles is in ui.js! 
        // We will just expose the messages for ui.js to draw.
    }
}
