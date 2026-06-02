/**
 * Ring Rush v0.4.0 - 局域网对战服务器
 *
 * 功能：
 * - 房间管理（创建/加入/离开）
 * - 玩家匹配
 * - 游戏状态同步
 * - 断线处理
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 服务器配置
const PORT = 3000;
const HOST = '0.0.0.0';

// 创建 HTTP 服务器（用于提供静态文件）
const server = http.createServer((req, res) => {
    // 提供 index.html
    if (req.url === '/' || req.url === '/index.html') {
        const indexPath = path.join(__dirname, '..', 'index.html');
        fs.readFile(indexPath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

// 房间管理
const rooms = new Map();
let roomIdCounter = 1;

// 玩家管理
const players = new Map();

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
        this.state = 'playing';
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
        const players = [];
        if (this.host) players.push(this.host);
        if (this.guest) players.push(this.guest);
        return players;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            state: this.state,
            playerCount: this.getPlayers().length,
            maxPlayers: this.maxPlayers,
            hostName: this.host ? this.host.name : null
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
        try {
            const message = JSON.parse(data);
            handleMessage(player, message);
        } catch (e) {
            console.error('消息解析错误:', e);
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

        default:
            console.log('未知消息类型:', message.type);
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

    // 开始游戏
    startGame(room);

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

// 开始游戏
function startGame(room) {
    room.state = 'playing';

    const players = room.getPlayers();
    players.forEach(p => {
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
        if (room.state === 'waiting') {
            roomList.push(room.toJSON());
        }
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
        if (room.state === 'waiting') {
            roomList.push(room.toJSON());
        }
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
    return Math.random().toString(36).substr(2, 9);
}

// 启动服务器
server.listen(PORT, HOST, () => {
    console.log(`Ring Rush 服务器启动`);
    console.log(`HTTP: http://${HOST}:${PORT}`);
    console.log(`WebSocket: ws://${HOST}:${PORT}`);
    console.log(`局域网访问: http://[你的IP]:${PORT}`);
});
