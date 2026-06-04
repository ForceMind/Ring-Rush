/**
 * Ring Rush - Network Manager
 * 网络管理类 - WebSocket 多人对战通信
 */

export class NetworkManager {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.playerName = null;
        this.roomId = null;
        this.playerIndex = null;
        this.isConnected = false;
        this.onMessage = null;
        this.onRoomList = null;
        this.onGameStart = null;
        this.onPieceLaunch = null;
        this.onError = null;
    }

    // 自动检测服务器地址
    getServerUrl() {
        const host = window.location.hostname || 'localhost';
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const port = window.location.port || '3000';
        return `${protocol}//${host}:${port}`;
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                const serverUrl = this.getServerUrl();
                console.log('连接服务器:', serverUrl);
                this.ws = new WebSocket(serverUrl);
                let resolved = false;

                this.ws.onopen = () => {
                    this.isConnected = true;
                    console.log('已连接到服务器');
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (e) {
                        console.error('消息解析错误:', e);
                    }
                };

                this.ws.onclose = () => {
                    this.isConnected = false;
                    console.log('与服务器断开连接');
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket 错误:', error);
                    if (!resolved) {
                        resolved = true;
                        reject(error);
                    }
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    handleMessage(message) {
        switch (message.type) {
            case 'welcome':
                this.playerId = message.playerId;
                this.playerName = message.playerName;
                break;
            case 'room_list':
                if (this.onRoomList) this.onRoomList(message.rooms);
                break;
            case 'room_created':
                this.roomId = message.room.id;
                this.playerIndex = message.playerIndex;
                if (this.onMessage) this.onMessage(message);
                break;
            case 'room_joined':
                this.roomId = message.room.id;
                this.playerIndex = message.playerIndex;
                if (this.onMessage) this.onMessage(message);
                break;
            case 'player_joined':
                if (this.onMessage) this.onMessage(message);
                break;
            case 'game_start':
                this.playerIndex = message.playerIndex;
                if (this.onGameStart) this.onGameStart(message);
                if (this.onMessage) this.onMessage(message);
                break;
            case 'dice_result':
                console.log('[dice] 收到结果:', message.results);
                if (this.onDiceResult) this.onDiceResult(message.results);
                break;
            case 'dice_tie':
                console.log('[dice] 平局，重掷');
                if (this.onDiceTie) this.onDiceTie();
                break;
            case 'piece_launch':
                if (this.onPieceLaunch) this.onPieceLaunch(message);
                break;
            case 'slider_sync':
                if (this.onSliderSync) this.onSliderSync(message.value);
                break;
            case 'player_rolled':
                if (this.onPlayerRolled) this.onPlayerRolled(message.playerIndex, message.val);
                break;
            case 'game_start_sync':
                if (this.onGameStartSync) this.onGameStartSync();
                break;
            case 'surrender':
                if (this.onSurrender) this.onSurrender();
                break;
            case 'opponent_restart_request':
                if (this.onOpponentRestartRequest) this.onOpponentRestartRequest();
                break;
            case 'player_left':
                if (this.onPlayerLeft) this.onPlayerLeft(message);
                if (this.onMessage) this.onMessage(message);
                break;
            case 'restart_game':
                if (this.onRestartGame) this.onRestartGame();
                break;
            case 'game_state':
                if (this.onMessage) this.onMessage(message);
                break;
            case 'error':
                if (this.onError) this.onError(message.message);
                break;
            default:
                if (this.onMessage) this.onMessage(message);
        }
    }

    send(message) {
        if (this.ws && this.isConnected) {
            this.ws.send(JSON.stringify(message));
        }
    }

    createRoom(roomName) {
        this.send({ type: 'create_room', roomName });
    }

    joinRoom(roomId) {
        this.send({ type: 'join_room', roomId });
    }

    leaveRoom() {
        this.send({ type: 'leave_room' });
        this.roomId = null;
        this.playerIndex = null;
    }

    sendReady() {
        this.send({ type: 'player_ready' });
    }

    sendCancelReady() {
        this.send({ type: 'cancel_ready' });
    }

    sendStartGame() {
        console.log('发送 start_game 消息');
        this.send({ type: 'start_game' });
    }

    launchPiece(pieceData) {
        this.send({ type: 'piece_launch', piece: pieceData });
    }

    updateGameState(state) {
        this.send({ type: 'game_update', state });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
