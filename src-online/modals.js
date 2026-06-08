/**
 * Ring Rush - Modals
 * 游戏内的各种浮动弹窗管理器
 */

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
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.7);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 200;
                    }
                    #ringRushSurrenderModal .modal-content {
                        background: #2a2a2a;
                        padding: 24px;
                        border-radius: 12px;
                        text-align: center;
                        color: white;
                        border: 2px solid #f44336;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                        font-family: sans-serif;
                        min-width: 250px;
                    }
                    #ringRushSurrenderModal .modal-title {
                        font-size: 20px;
                        font-weight: bold;
                        margin-bottom: 12px;
                        color: #f44336;
                    }
                    #ringRushSurrenderModal .modal-body {
                        font-size: 16px;
                        margin-bottom: 24px;
                        color: #ccc;
                    }
                    #ringRushSurrenderModal .modal-buttons {
                        display: flex;
                        justify-content: space-around;
                    }
                    #ringRushSurrenderModal .btn {
                        padding: 8px 24px;
                        border: none;
                        border-radius: 6px;
                        font-size: 16px;
                        cursor: pointer;
                        font-weight: bold;
                        transition: opacity 0.2s;
                    }
                    #ringRushSurrenderModal .btn-yes { background: #f44336; color: white; }
                    #ringRushSurrenderModal .btn-no { background: #555; color: white; }
                    #ringRushSurrenderModal .btn:hover { opacity: 0.8; }
                </style>
                <div class="modal-content">
                    <div class="modal-title">确认投降</div>
                    <div class="modal-body">投降后将被判负，确定要投降吗？</div>
                    <div class="modal-buttons">
                        <button class="btn btn-no" id="btnSurrenderNo">取消</button>
                        <button class="btn btn-yes" id="btnSurrenderYes">确认投降</button>
                    </div>
                </div>
            `;
            document.getElementById('gameContainer').appendChild(modal);
            
            document.getElementById('btnSurrenderNo').onclick = () => {
                modal.style.display = 'none';
            };
            document.getElementById('btnSurrenderYes').onclick = () => {
                modal.style.display = 'none';
                if (this.game.gameMode === 'local') {
                    this.game.winner = this.game.currentPlayer === 'A' ? 'B' : 'A';
                } else if (this.game.gameMode === 'online') {
                    this.game.winner = this.game.network.playerIndex === 'A' ? 'B' : 'A';
                } else {
                    this.game.winner = 'B'; // Bot wins
                }
                this.game.gameOver = true;
                if (this.game.isOnlineGame()) {
                    this.game.network.send({ type: 'surrender' });
                }
            };
        } else {
            modal.style.display = 'flex';
        }
    }
}
