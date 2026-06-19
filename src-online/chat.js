/**
 * Ring Rush - Chat
 * In-game quick chat menu.
 */

import { t } from './i18n.js';

const CHAT_OPTIONS = [
    ['1', 'chatHello'],
    ['2', 'chatNice'],
    ['3', 'chatShot'],
    ['4', 'chatOops'],
    ['5', 'chatYourMove'],
    ['6', 'chatAgain']
];

export class ChatManager {
    constructor(game) {
        this.game = game;
        this.chatMessages = [];
        this.closeMenu = null;
    }

    initDOM() {
        const existing = document.getElementById('ringRushChatContainer');

        if (this.game.gameMode !== 'online') {
            if (existing) existing.style.display = 'none';
            return;
        }

        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'ringRushChatContainer';
        container.innerHTML = `
            <style>
                #ringRushChatContainer {
                    position: absolute;
                    right: max(14px, env(safe-area-inset-right, 0px));
                    bottom: max(142px, calc(env(safe-area-inset-bottom, 0px) + 142px));
                    z-index: 120;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 8px;
                    font-family: "Segoe UI", Arial, sans-serif;
                    pointer-events: auto;
                    -webkit-tap-highlight-color: transparent;
                }
                #chatMenu {
                    display: none;
                    width: min(232px, calc(100vw - 32px));
                    padding: 10px;
                    border-radius: 18px;
                    background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(239,255,253,0.92));
                    border: 2px solid rgba(255,255,255,0.9);
                    box-shadow: 0 10px 22px rgba(20,54,66,0.22), inset 0 -4px 0 rgba(120,220,160,0.2);
                    color: #143642;
                    transform-origin: bottom right;
                }
                #chatMenu.active {
                    display: block;
                    animation: chatPop 140ms ease-out;
                }
                .chat-menu-title {
                    padding: 2px 8px 8px;
                    color: #2d6775;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0;
                }
                .chat-option {
                    width: 100%;
                    min-height: 38px;
                    margin-top: 6px;
                    padding: 8px 10px;
                    border: 0;
                    border-radius: 10px;
                    background: rgba(237, 251, 255, 0.9);
                    color: #143642;
                    box-shadow: inset 0 -2px 0 rgba(45, 156, 219, 0.08);
                    text-align: left;
                    font-size: 13px;
                    font-weight: 800;
                    line-height: 1.25;
                    cursor: pointer;
                    white-space: normal;
                }
                .chat-option:active {
                    transform: translateY(1px);
                    background: rgba(209, 247, 232, 0.96);
                }
                .chat-btn {
                    width: 50px;
                    height: 50px;
                    border: 0;
                    border-radius: 16px;
                    background: linear-gradient(180deg, #42b8ee, #1f86d4);
                    box-shadow: 0 8px 16px rgba(20,54,66,0.26), inset 0 -4px 0 rgba(20,54,66,0.12);
                    display: grid;
                    place-items: center;
                    cursor: pointer;
                }
                .chat-btn:active {
                    transform: translateY(1px) scale(0.98);
                }
                .chat-icon {
                    width: 25px;
                    height: 18px;
                    border-radius: 8px;
                    background: #ffffff;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 3px;
                }
                .chat-icon:after {
                    content: "";
                    position: absolute;
                    right: 4px;
                    bottom: -5px;
                    border-width: 6px 0 0 8px;
                    border-style: solid;
                    border-color: transparent transparent transparent #ffffff;
                }
                .chat-dot {
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: #1f86d4;
                }
                @keyframes chatPop {
                    from { opacity: 0; transform: translateY(8px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            </style>
            <div id="chatMenu" aria-label="${t('chatMenuLabel')}">
                <div class="chat-menu-title">${t('chatMenuLabel')}</div>
                ${CHAT_OPTIONS.map(([id, key]) => `<button class="chat-option" data-id="${id}">${t(key)}</button>`).join('')}
            </div>
            <button class="chat-btn" type="button" aria-label="${t('chatOpen')}">
                <span class="chat-icon" aria-hidden="true">
                    <span class="chat-dot"></span>
                    <span class="chat-dot"></span>
                    <span class="chat-dot"></span>
                </span>
            </button>
        `;
        document.getElementById('gameContainer').appendChild(container);

        const btn = container.querySelector('.chat-btn');
        const menu = container.querySelector('#chatMenu');
        const options = container.querySelectorAll('.chat-option');

        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            menu.classList.toggle('active');
        });

        options.forEach((option) => {
            option.addEventListener('click', (event) => {
                event.stopPropagation();
                this.sendChat(option.dataset.id);
                menu.classList.remove('active');
            });
        });

        this.closeMenu = () => menu.classList.remove('active');
        document.addEventListener('click', this.closeMenu);
    }

    sendChat(text) {
        if (!this.game.isOnlineGame()) return;
        this.game.network.send({ type: 'chat', text });
    }

    addMessage(textOrId, playerIndex) {
        const text = this.resolveChatText(textOrId);
        this.chatMessages.push({ text, playerIndex, timestamp: Date.now() });
    }

    resolveChatText(textOrId) {
        const option = CHAT_OPTIONS.find(([id]) => id === textOrId);
        return option ? t(option[1]) : textOrId;
    }

    update() {
        const now = Date.now();
        this.chatMessages = this.chatMessages.filter((msg) => now - msg.timestamp < 3500);
    }

    setVisibility(visible) {
        const chatEl = document.getElementById('ringRushChatContainer');
        if (chatEl) chatEl.style.display = visible ? 'flex' : 'none';
    }

    draw(ctx) {
        // Chat bubbles are rendered by UI so they share the canvas camera and player positions.
    }
}
