import { t } from './i18n.js';

export class ModalManager {
    constructor(game) {
        this.game = game;
    }

    showSurrenderConfirm() {
        let modal = document.getElementById('ringRushSurrenderModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ringRushSurrenderModal';
            modal.innerHTML = `
                <style>
                    #ringRushSurrenderModal {
                        position: absolute;
                        inset: 0;
                        background: rgba(20,54,66,0.62);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 200;
                        padding: 24px;
                        -webkit-tap-highlight-color: transparent;
                    }
                    #ringRushSurrenderModal .modal-content {
                        width: min(372px, 100%);
                        background: linear-gradient(180deg, rgba(255,255,255,0.97), rgba(240,255,252,0.94));
                        padding: 24px 22px 22px;
                        border-radius: 24px;
                        text-align: center;
                        color: #143642;
                        border: 2px solid rgba(255,255,255,0.95);
                        box-shadow: 0 18px 34px rgba(20,54,66,0.28), inset 0 -5px 0 rgba(117,224,160,0.24);
                        font-family: "Segoe UI", Arial, sans-serif;
                    }
                    #ringRushSurrenderModal .modal-title {
                        font-size: 24px;
                        font-weight: 900;
                        margin-bottom: 12px;
                        color: #d9480f;
                        letter-spacing: 0;
                    }
                    #ringRushSurrenderModal .modal-body {
                        font-size: 16px;
                        margin-bottom: 22px;
                        color: #47707c;
                        line-height: 1.45;
                        font-weight: 700;
                    }
                    #ringRushSurrenderModal .modal-buttons {
                        display: flex;
                        gap: 12px;
                        justify-content: center;
                    }
                    #ringRushSurrenderModal .btn {
                        min-width: 126px;
                        min-height: 48px;
                        padding: 10px 16px;
                        border: none;
                        border-radius: 14px;
                        font-size: 16px;
                        cursor: pointer;
                        font-weight: 900;
                        color: white;
                        box-shadow: inset 0 -4px 0 rgba(20,54,66,0.13), 0 8px 14px rgba(20,54,66,0.16);
                        transition: transform 0.12s;
                    }
                    #ringRushSurrenderModal .btn-yes {
                        background: linear-gradient(180deg, #ff8f68, #d9480f);
                    }
                    #ringRushSurrenderModal .btn-no {
                        background: linear-gradient(180deg, #49d987, #1aa95a);
                    }
                    #ringRushSurrenderModal .btn:active { transform: translateY(1px) scale(0.99); }
                </style>
                <div class="modal-content">
                    <div class="modal-title">${t('confirmSurrenderTitle')}</div>
                    <div class="modal-body">${t('confirmSurrenderBody')}</div>
                    <div class="modal-buttons">
                        <button class="btn btn-no" id="btnSurrenderNo">${t('cancel')}</button>
                        <button class="btn btn-yes" id="btnSurrenderYes">${t('confirmSurrender')}</button>
                    </div>
                </div>
            `;
            const container = document.getElementById('gameContainer')
                || document.getElementById('appGameContainer')
                || document.body;
            container.appendChild(modal);

            document.getElementById('btnSurrenderNo').onclick = () => {
                modal.style.display = 'none';
            };
            document.getElementById('btnSurrenderYes').onclick = () => {
                modal.style.display = 'none';
                this.game.surrender();
            };
        } else {
            modal.style.display = 'flex';
        }
    }
}
