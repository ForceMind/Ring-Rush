/**
 * Ring Rush v0.6.0 - 在线对战服务器
 *
 * 功能：
 * - 房间管理（创建/加入/离开）
 * - 玩家匹配
 * - 游戏状态同步
 * - 断线处理
 * - 支持任意部署环境（本地/公网）
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 服务器配置
const PORT = 3000;
const HOST = '0.0.0.0';

// 静态文件 MIME 类型映射
const MIME_TYPES = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon'
};

// 项目根目录（server 的上级目录）
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 创建 HTTP 服务器（用于提供静态文件）
const server = http.createServer((req, res) => {
    if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 解析请求路径，默认 / 映射到 /index.html
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    // 使用 path.resolve 防止目录遍历攻击
    const filePath = path.resolve(PROJECT_ROOT, '.' + urlPath);
    if (!filePath.startsWith(PROJECT_ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext];

    if (!mimeType) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
});

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

// WebSocket 心跳检测（30 秒间隔）
const HEARTBEAT_INTERVAL = 30000;
const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_INTERVAL);

// 服务器关闭时清理心跳定时器
wss.on('close', () => {
    clearInterval(heartbeatTimer);
});

// 房间管理
const rooms = new Map();
let roomIdCounter = 1;

// 玩家管理
const players = new Map();

// 速率限制配置
const RATE_LIMIT_MAX = 30;       // 每秒最大消息数
const RATE_LIMIT_WINDOW = 1000;  // 窗口大小（毫秒）

// ===== 房间类 =====
class Room {
    constructor(id, hostPlayer) {
        this.id = id;
        this.name = `房间 ${id}`;
        this.host = hostPlayer;
        this.guest = null;
        this.state = 'waiting';  // waiting, playing, finished
        this.gameState = null;
        this.maxPlayers = 2;
    }

    addPlayer(player) {
        if (this.guest) {
            return false;
        }
        this.guest = player;
        return true;
    }

    removePlayer(playerId) {
        if (this.host && this.host.id === playerId) {
            this.host = this.guest;
            this.guest = null;
        } else if (this.guest && this.guest.id === playerId) {
            this.guest = null;
        }

        if (!this.host && !this.guest) {
            this.state = 'finished';
        } else {
            this.state = 'waiting';
        }
    }

    getPlayers() {
        const result = [];
        if (this.host) result.push(this.host);
        if (this.guest) result.push(this.guest);
        return result;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            state: this.state,
            playerCount: this.getPlayers().length,
            maxPlayers: this.maxPlayers,
            hostName: this.host ? this.host.name : null,
            hostReady: this.host ? this.host.ready : false,
            guestName: this.guest ? this.guest.name : null,
            guestReady: this.guest ? this.guest.ready : false
        };
    }
}

// ===== 玩家类 =====
class Player {
    constructor(id, ws, name) {
        this.id = id;
        this.ws = ws;
        this.name = name;
        this.roomId = null;
        this.playerIndex = null;  // 'A' 或 'B'
        this.ready = false;
    }

    send(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
}

// ===== 消息处理 =====
wss.on('connection', (ws) => {
    const playerId = generateId();
    const player = new Player(playerId, ws, `玩家 ${playerId.slice(0, 4)}`);
    players.set(playerId, player);

    // 心跳追踪
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // 速率限制追踪
    ws.messageCount = 0;
    ws.messageWindowStart = Date.now();

    console.log(`玩家连接: ${player.name} (${playerId})`);

    // 发送欢迎消息
    player.send({
        type: 'welcome',
        playerId: playerId,
        playerName: player.name
    });

    // 发送房间列表
    sendRoomList(player);

    // 处理消息
    ws.on('message', (data) => {
        // 速率限制检查
        const now = Date.now();
        if (now - ws.messageWindowStart > RATE_LIMIT_WINDOW) {
            ws.messageCount = 0;
            ws.messageWindowStart = now;
        }
        ws.messageCount++;
        if (ws.messageCount > RATE_LIMIT_MAX) {
            player.send({ type: 'error', message: '消息发送过于频繁，请稍后再试' });
            return;
        }

        try {
            const message = JSON.parse(data);
            handleMessage(player, message);
        } catch (e) {
            console.error('消息解析错误:', e, player.name);
        }
    });

    // 断线处理
    ws.on('close', () => {
        console.log(`玩家断线: ${player.name}`);
        handleDisconnect(player);
        players.delete(playerId);
    });
});

// 处理消息
function handleMessage(player, message) {
    switch (message.type) {
        case 'create_room':
            createRoom(player, message.roomName);
            break;

        case 'join_room':
            joinRoom(player, message.roomId);
            break;

        case 'leave_room':
            leaveRoom(player);
            break;

        case 'player_ready':
            handlePlayerReady(player);
            break;

        case 'cancel_ready':
            handleCancelReady(player);
            break;

        case 'start_game':
            handleStartGame(player);
            break;

        case 'dice_roll':
            broadcastToRoom(player.roomId, {
                type: 'player_rolling',
                playerIndex: player.playerIndex
            }, player.id);
            handleDiceRoll(player);
            break;

        case 'list_rooms':
            sendRoomList(player);
            break;

        case 'game_update':
            broadcastGameState(player, message.state);
            break;

        case 'piece_launch':
            broadcastToRoom(player.roomId, {
                type: 'piece_launch',
                playerId: player.id,
                piece: message.piece
            }, player.id);
            break;

        case 'chat':
            broadcastToRoom(player.roomId, {
                type: 'chat',
                playerId: player.id,
                playerName: player.name,
                message: message.message
            });
            break;

        case 'surrender':
            broadcastToRoom(player.roomId, {
                type: 'surrender',
                playerId: player.id
            }, player.id);
            break;

        case 'restart_request':
            handleRestartRequest(player);
            break;

        default:
            console.log('未知消息类型:', message.type, '来自:', player.name);
            player.send({ type: 'error', message: `未知消息: ${message.type}` });
    }
}

// 创建房间
function createRoom(player, roomName) {
    if (player.roomId) {
        player.send({ type: 'error', message: '你已经在房间中' });
        return;
    }

    const roomId = roomIdCounter++;
    const room = new Room(roomId, player);
    if (roomName) room.name = roomName;
    rooms.set(roomId, room);

    player.roomId = roomId;
    player.playerIndex = 'A';

    player.send({
        type: 'room_created',
        room: room.toJSON(),
        playerIndex: 'A'
    });

    console.log(`房间创建: ${room.name} (${roomId})`);

    // 广播房间列表更新
    broadcastRoomListUpdate();
}

// 加入房间
function joinRoom(player, roomId) {
    if (player.roomId) {
        player.send({ type: 'error', message: '你已经在房间中' });
        return;
    }

    const room = rooms.get(roomId);
    if (!room) {
        player.send({ type: 'error', message: '房间不存在' });
        return;
    }

    if (room.state !== 'waiting') {
        player.send({ type: 'error', message: '房间已满或游戏已开始' });
        return;
    }

    if (!room.addPlayer(player)) {
        player.send({ type: 'error', message: '无法加入房间' });
        return;
    }

    player.roomId = roomId;
    player.playerIndex = 'B';

    // 通知加入成功
    player.send({
        type: 'room_joined',
        room: room.toJSON(),
        playerIndex: 'B'
    });

    // 通知房主
    room.host.send({
        type: 'player_joined',
        player: { id: player.id, name: player.name }
    });

    console.log(`玩家 ${player.name} 加入房间 ${room.name}`);

    // 广播房间列表更新
    broadcastRoomListUpdate();
}

// 离开房间
function leaveRoom(player) {
    if (!player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;

    // 通知其他玩家
    broadcastToRoom(player.roomId, {
        type: 'player_left',
        playerId: player.id,
        playerName: player.name
    });

    room.removePlayer(player.id);
    player.roomId = null;
    player.playerIndex = null;

    // 如果房间空了，删除房间
    if (room.getPlayers().length === 0) {
        rooms.delete(room.id);
    }

    player.send({ type: 'room_left' });

    // 广播房间列表更新
    broadcastRoomListUpdate();
}

// 玩家准备
function handlePlayerReady(player) {
    if (!player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;

    // 设置玩家准备状态
    player.ready = true;

    // 通知房间内其他玩家
    broadcastToRoom(player.roomId, {
        type: 'player_ready',
        playerId: player.id,
        playerIndex: player.playerIndex
    });

    // 检查是否双方都准备好了，通知房主可以开始
    if (room.host && room.guest) {
        const hostReady = room.host.ready;
        const guestReady = room.guest.ready;

        if (hostReady && guestReady) {
            // 通知房主可以开始游戏
            room.host.send({
                type: 'can_start_game',
                roomId: room.id
            });
        }
    }
}

// 取消准备
function handleCancelReady(player) {
    if (!player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;

    // 设置玩家未准备状态
    player.ready = false;
    room.restartRequests = new Set(); // 取消准备时也清空重开请求

    // 通知房间内其他玩家
    broadcastToRoom(player.roomId, {
        type: 'cancel_ready',
        playerId: player.id,
        playerIndex: player.playerIndex
    });
}

// 请求重新开始游戏
function handleRestartRequest(player) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;

    if (!room.restartRequests) {
        room.restartRequests = new Set();
    }

    room.restartRequests.add(player.id);
    console.log(`玩家 ${player.name} 请求重新开始。当前同意人数: ${room.restartRequests.size}`);

    // 通知对方该玩家已请求重开
    broadcastToRoom(player.roomId, {
        type: 'opponent_restart_request',
        playerId: player.id
    }, player.id);

    // 如果双方都同意
    if (room.host && room.guest && 
        room.restartRequests.has(room.host.id) && 
        room.restartRequests.has(room.guest.id)) {
        
        room.restartRequests.clear();
        console.log(`房间 ${room.id} 双方同意重新开始`);
        
        broadcastToRoom(player.roomId, {
            type: 'restart_game'
        });
        
        startGame(room);
    }
}

// 房主开始游戏
function handleStartGame(player) {
    console.log('收到 start_game 消息，玩家:', player.name);
    if (!player.roomId) {
        console.log('玩家不在房间中');
        return;
    }

    const room = rooms.get(player.roomId);
    if (!room) {
        console.log('房间不存在');
        return;
    }

    console.log('房间状态:', room.state, '房主:', room.host.name, '客人:', room.guest ? room.guest.name : '无');

    // 只有房主可以开始游戏
    if (room.host.id !== player.id) {
        console.log('不是房主，无法开始游戏');
        player.send({ type: 'error', message: '只有房主可以开始游戏' });
        return;
    }

    // 检查双方是否都准备好了
    if (!room.host.ready || !room.guest || !room.guest.ready) {
        console.log('双方未都准备，房主ready:', room.host.ready, '客ready:', room.guest ? room.guest.ready : '无');
        player.send({ type: 'error', message: '双方都需要准备才能开始' });
        return;
    }

    console.log('开始游戏');
    // 开始游戏
    startGame(room);
}

// 掷骰子
function handleDiceRoll(player) {
    console.log(`[dice] ${player.name} 掷骰子, roomId: ${player.roomId}`);
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room || room.state !== 'playing') {
        console.log(`[dice] 房间无效或状态不对: ${room ? room.state : 'null'}`);
        return;
    }

    if (!room.diceRolls) room.diceRolls = {};
    if (room.diceRolls[player.playerIndex]) return; // 已掷过

    const roll = Math.floor(Math.random() * 6) + 1;
    room.diceRolls[player.playerIndex] = roll;
    console.log(`[dice] ${player.name} 掷了 ${roll}`);

    if (room.diceRolls['A'] && room.diceRolls['B']) {
        const aVal = room.diceRolls['A'], bVal = room.diceRolls['B'];
        let first = aVal > bVal ? 'A' : bVal > aVal ? 'B' : null;
        console.log(`[dice] 结果: A=${aVal}, B=${bVal}, first=${first}`);
        if (!first) {
            room.diceRolls = {};
            room.getPlayers().forEach(p => p.send({ type: 'dice_tie' }));
            return;
        }
        const results = { a: aVal, b: bVal, first };
        room.getPlayers().forEach(p => p.send({ type: 'dice_result', results }));
    }
}

// 开始游戏
function startGame(room) {
    room.state = 'playing';

    const roomPlayers = room.getPlayers();
    roomPlayers.forEach(p => {
        p.send({
            type: 'game_start',
            roomId: room.id,
            playerIndex: p.playerIndex,
            opponentName: p.playerIndex === 'A' ? room.guest.name : room.host.name
        });
    });
}

// 广播游戏状态
function broadcastGameState(player, state) {
    if (!player.roomId) return;

    broadcastToRoom(player.roomId, {
        type: 'game_state',
        playerId: player.id,
        state: state
    }, player.id);
}

// 处理断线
function handleDisconnect(player) {
    if (player.roomId) {
        leaveRoom(player);
    }
}

// 发送房间列表
function sendRoomList(player) {
    const roomList = [];
    rooms.forEach(room => {
        roomList.push(room.toJSON());
    });

    player.send({
        type: 'room_list',
        rooms: roomList
    });
}

// 广播房间列表更新
function broadcastRoomListUpdate() {
    const roomList = [];
    rooms.forEach(room => {
        roomList.push(room.toJSON());
    });

    players.forEach(player => {
        if (!player.roomId) {
            player.send({
                type: 'room_list',
                rooms: roomList
            });
        }
    });
}

// 广播消息到房间
function broadcastToRoom(roomId, message, excludePlayerId = null) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.getPlayers().forEach(player => {
        if (player.id !== excludePlayerId) {
            player.send(message);
        }
    });
}

// 生成唯一 ID
function generateId() {
    return crypto.randomUUID().slice(0, 9);
}

// 启动服务器
server.listen(PORT, HOST, () => {
    console.log(`Ring Rush 服务器启动`);
    console.log(`HTTP: http://${HOST}:${PORT}`);
    console.log(`WebSocket: ws://${HOST}:${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);
});
