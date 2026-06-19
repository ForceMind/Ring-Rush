/**
 * Ring Rush - Network Manager
 * 网络管理类 - WebSocket 多人对战通信
 */

export class NetworkManager {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.playerName = null;
        this.accountId = null;
        this.sessionToken = null;
        this.profile = null;
        this.wallet = null;
        this.competitiveTables = [];
        this.activeMatch = null;
        this.roomId = null;
        this.playerIndex = null;
        this.isConnected = false;
        this.connectionStatus = 'offline';
        this.onMessage = null;
        this.onRoomList = null;
        this.onGameStart = null;
        this.onGameState = null;
        this.onPieceLaunch = null;
        this.onError = null;
        this.onCompetitiveProfile = null;
        this.onMatchmakingQueued = null;
        this.onMatchmakingCanceled = null;
        this.onCompetitiveMatch = null;
        this.onCompetitiveSettlement = null;
        this.onCompetitiveError = null;
        this.onConnectionStatus = null;
        this._manualDisconnect = false;
        this._reconnectTimer = null;
        this.pendingCompetitiveResults = new Map();
    }

    // 自动检测服务器地址
    getServerUrl() {
        const configuredBaseUrl = this.getConfiguredServerBaseUrl();
        if (configuredBaseUrl) {
            const url = new URL(configuredBaseUrl);
            const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${url.host}`;
        }

        const host = window.location.hostname || 'localhost';
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let portStr = '';
        if (host === 'localhost' || host === '127.0.0.1') {
            portStr = ':3000'; // 本地前后端分离开发回退
        } else if (window.location.port) {
            portStr = ':' + window.location.port;
        }
        return `${protocol}//${host}${portStr}`;
    }

    getHttpBaseUrl() {
        const configuredBaseUrl = this.getConfiguredServerBaseUrl();
        if (configuredBaseUrl) {
            return configuredBaseUrl;
        }

        const host = window.location.hostname || 'localhost';
        if (host === 'localhost' || host === '127.0.0.1') {
            return `http://${host}:3000`;
        }

        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
            return window.location.origin;
        }

        const port = window.location.port || (host === 'localhost' || host === '127.0.0.1' ? '3000' : '');
        const portStr = port ? `:${port}` : '';
        return `http://${host}${portStr}`;
    }

    getConfiguredServerBaseUrl() {
        const bundledUrl = this.getBundledServerBaseUrl();
        if (this.isServerBaseUrlLocked()) {
            return bundledUrl;
        }

        return this.getStoredServerBaseUrl() || bundledUrl;
    }

    getBundledServerBaseUrl() {
        const runtimeUrl = typeof window !== 'undefined' ? window.PELLO_SERVER_URL : null;
        return this.normalizeServerBaseUrl(runtimeUrl);
    }

    getStoredServerBaseUrl() {
        return this.normalizeServerBaseUrl(this.getStoredValue('pelloServerBaseUrl'));
    }

    isServerBaseUrlLocked() {
        if (typeof window === 'undefined') return false;
        const value = window.PELLO_SERVER_LOCKED;
        return value === true || value === 'true' || value === '1';
    }

    getDisplayServerBaseUrl() {
        return this.getConfiguredServerBaseUrl() || this.getHttpBaseUrl();
    }

    setServerBaseUrl(value) {
        if (this.isServerBaseUrlLocked()) {
            return this.getBundledServerBaseUrl();
        }

        const normalized = this.normalizeServerBaseUrl(value);
        if (!normalized) {
            this.removeStoredValue('pelloServerBaseUrl');
            return null;
        }
        this.saveStoredValue('pelloServerBaseUrl', normalized);
        return normalized;
    }

    normalizeServerBaseUrl(value) {
        if (!value || typeof value !== 'string') return null;
        let raw = value.trim();
        if (!raw) return null;

        if (raw.startsWith('ws://')) raw = `http://${raw.slice(5)}`;
        if (raw.startsWith('wss://')) raw = `https://${raw.slice(6)}`;
        if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;

        try {
            const url = new URL(raw);
            return url.origin;
        } catch (_) {
            return null;
        }
    }

    getStoredValue(key) {
        try {
            return sessionStorage.getItem(key) || localStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    saveStoredValue(key, value) {
        if (!value) return;
        try {
            sessionStorage.setItem(key, value);
        } catch (_) {}
        try {
            localStorage.setItem(key, value);
        } catch (_) {}
    }

    removeStoredValue(key) {
        try {
            sessionStorage.removeItem(key);
        } catch (_) {}
        try {
            localStorage.removeItem(key);
        } catch (_) {}
    }

    setConnectionStatus(status, message = status) {
        this.connectionStatus = status;
        if (this.onConnectionStatus) {
            this.onConnectionStatus(status, message);
        }
    }

    connect() {
        return new Promise((resolve, reject) => {
            this._connectResolve = resolve;
            this._connectReject = reject;
            this._resolved = false;
            this._manualDisconnect = false;
            this.setConnectionStatus('connecting', 'Connecting...');
            this._setupSocket();
            this._setupVisibilityListener();
        });
    }

    _setupSocket() {
        try {
            const serverUrl = this.getServerUrl();
            console.log('连接服务器:', serverUrl);
            const socket = new WebSocket(serverUrl);
            this.ws = socket;

            socket.onopen = () => {
                if (this.ws !== socket) return;
                this.isConnected = true;
                this._reconnecting = false;
                this._manualDisconnect = false;
                if (this._reconnectTimer) {
                    clearTimeout(this._reconnectTimer);
                    this._reconnectTimer = null;
                }
                this.setConnectionStatus('connected', 'Connected');
                console.log('已连接到服务器');
                
                // 尝试用保存的 ID 重连身份
                const savedId = this.getStoredValue('ringRushPlayerId');
                const savedAccountId = this.getStoredValue('pelloAccountId');
                const savedSessionToken = this.getStoredValue('pelloSessionToken');
                if (savedId || savedAccountId) {
                    this.send({
                        type: 'reconnect',
                        playerId: savedId,
                        accountId: savedAccountId,
                        sessionToken: savedSessionToken
                    });
                }
                this.flushPendingCompetitiveResults();
                
                if (this._connectResolve && !this._resolved) {
                    this._resolved = true;
                    this._connectResolve();
                }

                // 启动心跳检测
                this._startHeartbeat();
            };

            socket.onmessage = (event) => {
                if (this.ws !== socket) return;
                try {
                    const msg = JSON.parse(event.data);
                    
                    if (msg.type === 'welcome') {
                        this.playerId = msg.playerId;
                        this.accountId = msg.accountId || this.accountId;
                    }
                    
                    this.handleMessage(msg);
                    this._lastPong = Date.now();
                } catch (e) {
                    console.error('消息解析错误:', e);
                }
            };

            socket.onclose = () => {
                if (this.ws !== socket) return;
                this.isConnected = false;
                this._stopHeartbeat();
                if (this._manualDisconnect) {
                    this.setConnectionStatus('offline', 'Offline');
                    console.log('与服务器断开连接');
                    return;
                }
                this._reconnecting = true;
                this.setConnectionStatus('reconnecting', 'Reconnecting...');
                this._scheduleReconnect();
                console.log('与服务器断开连接');
            };

            socket.onerror = (error) => {
                if (this.ws !== socket) return;
                console.error('WebSocket 错误:', error);
                if (!this.isConnected && !this._manualDisconnect) {
                    this.setConnectionStatus('reconnecting', 'Reconnecting...');
                }
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

    _scheduleReconnect(delayMs = 1500) {
        if (this._manualDisconnect || this._reconnectTimer) return;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (this._manualDisconnect || this.isConnected) return;
            this._reconnecting = true;
            this.setConnectionStatus('reconnecting', 'Reconnecting...');
            this._setupSocket();
        }, delayMs);
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
                this.setConnectionStatus('reconnecting', 'Reconnecting...');
                this._scheduleReconnect(300);
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
                this.accountId = message.accountId || this.accountId;
                if (!this.getStoredValue('ringRushPlayerId')) {
                    this.saveStoredValue('ringRushPlayerId', this.playerId);
                }
                if (this.accountId) {
                    this.saveStoredValue('pelloAccountId', this.accountId);
                }
                break;
            case 'reconnect_success':
                this.playerId = this.getStoredValue('ringRushPlayerId');
                this.playerIndex = message.playerIndex;
                this.accountId = message.accountId || this.accountId;
                this.sessionToken = message.sessionToken || this.sessionToken;
                if (this.accountId) {
                    this.saveStoredValue('pelloAccountId', this.accountId);
                }
                if (this.sessionToken) {
                    this.saveStoredValue('pelloSessionToken', this.sessionToken);
                }
                if (this.onMessage) this.onMessage(message);
                break;
            case 'reconnect_failed':
                if (message.code) {
                    this.accountId = null;
                    this.sessionToken = null;
                    this.removeStoredValue('pelloAccountId');
                    this.removeStoredValue('pelloSessionToken');
                    this.removeStoredValue('ringRushPlayerId');
                    this.requestCompetitiveProfile();
                    break;
                }

                this.accountId = message.accountId || this.accountId;
                this.sessionToken = message.sessionToken || this.sessionToken;
                this.saveStoredValue('ringRushPlayerId', this.playerId);
                if (this.accountId) {
                    this.saveStoredValue('pelloAccountId', this.accountId);
                }
                if (this.sessionToken) {
                    this.saveStoredValue('pelloSessionToken', this.sessionToken);
                }
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
                if (this.onGameState) this.onGameState(message.state);
                else if (this.onMessage) this.onMessage(message);
                break;
            case 'competitive_profile':
                this.accountId = message.profile?.id || this.accountId;
                this.sessionToken = message.sessionToken || this.sessionToken;
                this.profile = message.profile;
                this.wallet = message.wallet;
                this.competitiveTables = message.tables || [];
                if (this.accountId) {
                    this.saveStoredValue('pelloAccountId', this.accountId);
                }
                if (this.sessionToken) {
                    this.saveStoredValue('pelloSessionToken', this.sessionToken);
                }
                if (this.onCompetitiveProfile) this.onCompetitiveProfile(message);
                break;
            case 'matchmaking_queued':
                this.wallet = message.wallet || this.wallet;
                if (this.onMatchmakingQueued) this.onMatchmakingQueued(message);
                if (this.onMessage) this.onMessage(message);
                break;
            case 'matchmaking_canceled':
                this.wallet = message.wallet || this.wallet;
                if (this.onMatchmakingCanceled) this.onMatchmakingCanceled(message);
                if (this.onMessage) this.onMessage(message);
                break;
            case 'competitive_match_found':
                this.activeMatch = message.match;
                this.wallet = message.wallet || this.wallet;
                this.playerIndex = message.playerIndex || this.playerIndex;
                if (message.room) this.roomId = message.room.id;
                if (this.onCompetitiveMatch) this.onCompetitiveMatch(message);
                if (this.onMessage) this.onMessage(message);
                break;
            case 'competitive_settlement':
                this.activeMatch = message.match;
                this.wallet = message.wallet || this.wallet;
                if (message.match?.id) {
                    this.pendingCompetitiveResults.delete(message.match.id);
                }
                if (this.onCompetitiveSettlement) this.onCompetitiveSettlement(message);
                if (this.onMessage) this.onMessage(message);
                break;
            case 'competitive_error':
                if (this.onCompetitiveError) this.onCompetitiveError(message);
                if (this.onError) this.onError(message.message);
                break;
            case 'error':
                if (this.onError) this.onError(message.message);
                break;
            default:
                if (this.onMessage) this.onMessage(message);
        }
    }

    send(message) {
        if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            return true;
        }
        return false;
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

    requestCompetitiveProfile() {
        this.send({ type: 'competitive_profile' });
    }

    quickMatch(tableId = 'bronze_12') {
        this.send({ type: 'quick_match', tableId });
    }

    cancelMatchmaking() {
        this.send({ type: 'cancel_matchmaking' });
    }

    startAiMatch(tableId = 'bronze_12') {
        this.send({ type: 'ai_match', tableId });
    }

    submitCompetitiveResult(matchId, winner, reason = 'normal', state = null) {
        const message = {
            type: 'competitive_result',
            matchId,
            winner,
            reason,
            state
        };
        this.pendingCompetitiveResults.set(matchId, message);
        this.send(message);
    }

    flushPendingCompetitiveResults() {
        if (!this.pendingCompetitiveResults.size) return;
        for (const [matchId, message] of this.pendingCompetitiveResults.entries()) {
            if (this.send(message)) {
                this.pendingCompetitiveResults.delete(matchId);
            }
        }
    }

    async fetchCompetitiveDashboard(limit = 12) {
        const accountId = this.accountId || this.getStoredValue('pelloAccountId');
        if (!accountId) {
            throw new Error('Account is not ready');
        }
        const sessionToken = this.sessionToken || this.getStoredValue('pelloSessionToken');
        if (!sessionToken) {
            throw new Error('Account session is not ready');
        }

        const params = new URLSearchParams({
            accountId,
            limit: String(limit)
        });
        const response = await fetch(`${this.getHttpBaseUrl()}/api/competitive/dashboard?${params.toString()}`, {
            cache: 'no-store',
            headers: {
                'X-Pello-Session': sessionToken
            }
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
            throw new Error(payload.message || 'Cannot load account dashboard');
        }
        return payload.dashboard;
    }

    disconnect() {
        this._manualDisconnect = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
        }
        this.ws = null;
        this.isConnected = false;
        this._reconnecting = false;
        this._stopHeartbeat();
        this.setConnectionStatus('offline', 'Offline');
    }
}
