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
        let portStr = '';
        if (window.location.port) {
            portStr = ':' + window.location.port;
        } else if (host === 'localhost' || host === '127.0.0.1') {
            portStr = ':3000'; // 本地开发回退
        }
        return `${protocol}//${host}${portStr}`;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this._connectResolve = resolve;
            this._connectReject = reject;
            this._resolved = false;
            this._setupSocket();
            this._setupVisibilityListener();
        });
    }

    _setupSocket() {
        try {
            const serverUrl = this.getServerUrl();
            console.log('连接服务器:', serverUrl);
            this.ws = new WebSocket(serverUrl);

            this.ws.onopen = () => {
                this.isConnected = true;
                this._reconnecting = false;
                console.log('已连接到服务器');
                
                // 尝试用保存的 ID 重连身份
                const savedId = sessionStorage.getItem('ringRushPlayerId');
                if (savedId) {
                    this.send({ type: 'reconnect', playerId: savedId });
                }
                
                if (this._connectResolve && !this._resolved) {
                    this._resolved = true;
                    this._connectResolve();
                }

                // 启动心跳检测
                this._startHeartbeat();
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this._lastPong = Date.now();
                    this.handleMessage(message);
                } catch (e) {
                    console.error('消息解析错误:', e);
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this._stopHeartbeat();
                console.log('与服务器断开连接');
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket 错误:', error);
                if (this._connectReject && !this._resolved) {
                    this._resolved = true;
                    this._connectReject(error);
                }
            };
        } catch (error) {
            if (this._connectReject && !this._resolved) {
                this._resolved = true;
                this._connectReject(error);
            }
        }
    }

    /**
     * 页面获得焦点/可见时自动检测并重连
     * 解决手机切后台、锁屏后 WebSocket 静默断开的问题
     */
    _setupVisibilityListener() {
        if (this._visibilityBound) return; // 防止重复绑定
        this._visibilityBound = true;

        const checkAndReconnect = () => {
            if (this._reconnecting) return;
            // WebSocket 已经不是 OPEN 状态，需要重连
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.log('[网络] 检测到连接已断开，自动重连...');
                this._reconnecting = true;
                this.isConnected = false;
                this._stopHeartbeat();
                this._setupSocket();
            }
        };

        // 页面可见性变化（切后台/切回来）
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // 短暂延迟，等待网络恢复
                setTimeout(checkAndReconnect, 300);
            }
        });

        // 窗口获得焦点
        window.addEventListener('focus', () => {
            setTimeout(checkAndReconnect, 300);
        });

        // 网络恢复
        window.addEventListener('online', () => {
            setTimeout(checkAndReconnect, 500);
        });
    }

    /**
     * 心跳检测：定期发 ping，若服务端长时间无响应则判定断线
     */
    _startHeartbeat() {
        this._stopHeartbeat();
        this._lastPong = Date.now();
        this._heartbeatTimer = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this._stopHeartbeat();
                return;
            }
            // 超过 15 秒没收到任何消息，判定连接已死
            if (Date.now() - this._lastPong > 15000) {
                console.log('[网络] 心跳超时，关闭连接触发重连');
                this.ws.close();
                return;
            }
            this.send({ type: 'ping' });
        }, 5000);
    }

    _stopHeartbeat() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'welcome':
                this.playerId = message.playerId;
                this.playerName = message.playerName;
                if (!sessionStorage.getItem('ringRushPlayerId')) {
                    sessionStorage.setItem('ringRushPlayerId', this.playerId);
                }
                break;
            case 'reconnect_success':
                this.playerId = sessionStorage.getItem('ringRushPlayerId');
                if (this.onMessage) this.onMessage(message);
                break;
            case 'reconnect_failed':
                sessionStorage.setItem('ringRushPlayerId', this.playerId);
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
                if (this.onSliderSync) this.onSliderSync(message.value, message.player);
                break;
            case 'player_rolled':
                if (this.onPlayerRolled) this.onPlayerRolled(message.playerIndex, message.val);
                break;
            case 'game_start_sync':
                if (this.onGameStartSync) this.onGameStartSync();
                break;
            case 'chat':
                if (this.onChat) this.onChat(message.playerId, message.text);
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
            case 'host_transferred':
                if (this.onMessage) this.onMessage(message);
                break;
            case 'opponent_disconnected':
                if (this.onOpponentDisconnected) this.onOpponentDisconnected();
                break;
            case 'opponent_reconnected':
                if (this.onOpponentReconnected) this.onOpponentReconnected();
                break;
            case 'request_sync':
                if (this.onRequestSync) this.onRequestSync(message.targetPlayerId);
                break;
            case 'full_sync':
                if (this.onFullSync) this.onFullSync(message.state);
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
