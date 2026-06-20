/**
 * Pello v0.11.0 online game server.
 * Serves the website, Android APK, competitive API, admin API, and WebSocket game rooms.
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    CompetitiveService,
    FileCompetitiveStore,
    handleCompetitiveApi,
    handleAdminApi,
    createCompetitiveLiveController
} = require('./src/competitive');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PROJECT_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.apk': 'application/vnd.android.package-archive'
};

const DEFAULT_APK_DOWNLOAD_PATH = path.resolve(PROJECT_ROOT, 'public/download/Pello.apk');
const ANDROID_DEBUG_APK_PATH = path.resolve(PROJECT_ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
const APK_DOWNLOAD_PATH = process.env.PELLO_APK_PATH
    ? path.resolve(process.env.PELLO_APK_PATH)
    : (fs.existsSync(DEFAULT_APK_DOWNLOAD_PATH) ? DEFAULT_APK_DOWNLOAD_PATH : ANDROID_DEBUG_APK_PATH);
const APK_DOWNLOAD_NAME = process.env.PELLO_APK_NAME || 'Pello.apk';
const ADMIN_SOURCE_PATH = '/admin.html';
const ADMIN_PUBLIC_PATH = normalizeAdminPath(process.env.PELLO_ADMIN_PATH);

class Room {
    constructor(id, hostPlayer) {
        this.id = id;
        this.name = `Room ${id}`;
        this.host = hostPlayer;
        this.guest = null;
        this.state = 'waiting';
        this.gameState = null;
        this.maxPlayers = 2;
        this.diceRolls = {};
        this.diceAcks = new Set();
        this.restartRequests = new Set();
    }

    addPlayer(player) {
        if (this.guest) return false;
        this.guest = player;
        return true;
    }

    removePlayer(playerId) {
        if (this.host && this.host.id === playerId) {
            this.host = this.guest;
            this.guest = null;
            if (this.host) this.host.playerIndex = 'A';
        } else if (this.guest && this.guest.id === playerId) {
            this.guest = null;
        }

        this.state = this.host || this.guest ? 'waiting' : 'finished';
    }

    getPlayers() {
        return [this.host, this.guest].filter(Boolean);
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
            guestReady: this.guest ? this.guest.ready : false,
            competitiveMatchId: this.competitiveMatchId || null,
            stake: this.stake || null
        };
    }
}

class Player {
    constructor(id, ws, name) {
        this.id = id;
        this.ws = ws;
        this.name = name;
        this.accountId = null;
        this.activeMatchId = null;
        this.roomId = null;
        this.playerIndex = null;
        this.ready = false;
        this.disconnectTimeout = null;
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
}

const rooms = new Map();
const players = new Map();
let roomIdCounter = 1;
const competitiveService = new CompetitiveService({
    store: new FileCompetitiveStore(process.env.PELLO_COMPETITIVE_STORE)
});
const competitiveLive = createCompetitiveLiveController({
    service: competitiveService,
    players,
    rooms,
    Room,
    allocateRoomId: () => roomIdCounter++,
    startGame,
    broadcastRoomListUpdate
});

const server = http.createServer((req, res) => {
    if (handleAdminApi(req, res, competitiveService, { adminToken: process.env.PELLO_ADMIN_TOKEN })) {
        return;
    }

    if (handleCompetitiveApi(req, res, competitiveService)) {
        return;
    }

    const requestUrl = new URL(req.url, 'http://localhost');
    if (requestUrl.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && requestUrl.pathname === '/download/Pello.apk') {
        sendApk(req, res);
        return;
    }

    if (ADMIN_PUBLIC_PATH && requestUrl.pathname === ADMIN_PUBLIC_PATH) {
        serveStaticFile(req, res, ADMIN_SOURCE_PATH, { privateCache: true, allowAdminSource: true });
        return;
    }

    if (process.env.NODE_ENV === 'production' && requestUrl.pathname === ADMIN_SOURCE_PATH) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    serveStaticFile(req, res, requestUrl.pathname);
});

const wss = new WebSocket.Server({ server });
const HEARTBEAT_INTERVAL = 30000;
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW = 1000;

const heartbeatTimer = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
    clearInterval(heartbeatTimer);
});

wss.on('connection', ws => {
    const playerId = generateId();
    let player = new Player(playerId, ws, `Player ${playerId.slice(0, 4)}`);
    players.set(playerId, player);

    ws.isAlive = true;
    ws.messageCount = 0;
    ws.messageWindowStart = Date.now();
    ws.on('pong', () => { ws.isAlive = true; });

    player.send({
        type: 'welcome',
        playerId,
        playerName: player.name
    });
    sendRoomList(player);

    ws.on('message', data => {
        if (!checkRateLimit(ws, player)) return;

        let message;
        try {
            message = JSON.parse(data);
        } catch (err) {
            player.send({ type: 'error', message: 'Invalid message payload' });
            return;
        }

        if (message.type === 'reconnect') {
            player = handleReconnect(ws, player, message);
            return;
        }

        try {
            handleMessage(player, message);
        } catch (err) {
            console.error('Message handling failed:', err);
            player.send({ type: 'error', message: 'Message handling failed' });
        }
    });

    ws.on('close', () => {
        handleSocketClose(player);
    });
});

function sendApk(req, res) {
    fs.stat(APK_DOWNLOAD_PATH, (statErr, stat) => {
        if (statErr || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('APK not found. Add public/download/Pello.apk, build the Android APK, or set PELLO_APK_PATH.');
            return;
        }

        res.writeHead(200, {
            'Content-Type': MIME_TYPES['.apk'],
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="${APK_DOWNLOAD_NAME}"`,
            'Cache-Control': 'no-store'
        });

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        fs.createReadStream(APK_DOWNLOAD_PATH).pipe(res);
    });
}

function normalizeAdminPath(rawPath) {
    const fallback = process.env.NODE_ENV === 'production' ? '' : ADMIN_SOURCE_PATH;
    const raw = String(rawPath || fallback).trim();
    if (!raw) return '';

    const pathname = (raw.startsWith('/') ? raw : `/${raw}`).split(/[?#]/)[0];
    if (!/^\/[A-Za-z0-9/_-]+(?:\.html)?$/.test(pathname)) {
        console.warn(`Ignoring invalid PELLO_ADMIN_PATH: ${raw}`);
        return fallback;
    }
    return pathname;
}

function serveStaticFile(req, res, pathname, options = {}) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method not allowed');
        return;
    }

    let urlPath = pathname === '/' ? '/index.html' : pathname;
    try {
        urlPath = decodeURIComponent(urlPath);
    } catch (_) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad request');
        return;
    }

    if (process.env.NODE_ENV === 'production' && urlPath === ADMIN_SOURCE_PATH && !options.allowAdminSource) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    const serveDir = process.env.NODE_ENV === 'production'
        ? path.resolve(PROJECT_ROOT, 'dist')
        : PROJECT_ROOT;
    const filePath = path.resolve(serveDir, `.${urlPath}`);
    if (filePath !== serveDir && !filePath.startsWith(serveDir + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext];
    if (!mimeType) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        res.writeHead(200, {
            'Content-Type': `${mimeType}; charset=utf-8`,
            'Cache-Control': options.privateCache
                ? 'no-store'
                : (process.env.NODE_ENV === 'production' ? 'public, max-age=300' : 'no-store')
        });
        if (req.method === 'HEAD') {
            res.end();
            return;
        }
        res.end(data);
    });
}

function checkRateLimit(ws, player) {
    const now = Date.now();
    if (now - ws.messageWindowStart > RATE_LIMIT_WINDOW) {
        ws.messageCount = 0;
        ws.messageWindowStart = now;
    }

    ws.messageCount += 1;
    if (ws.messageCount <= RATE_LIMIT_MAX) {
        return true;
    }

    player.send({ type: 'error', message: 'Too many messages. Please wait.' });
    return false;
}

function handleReconnect(ws, tempPlayer, message) {
    const oldPlayer = players.get(message.playerId);
    if (oldPlayer && oldPlayer.disconnectTimeout) {
        clearTimeout(oldPlayer.disconnectTimeout);
        oldPlayer.disconnectTimeout = null;
        oldPlayer.ws = ws;
        players.delete(tempPlayer.id);

        if (message.accountId && oldPlayer.accountId !== message.accountId) {
            try {
                competitiveService.restoreAccount(oldPlayer, message.accountId, message.sessionToken);
            } catch (err) {
                competitiveLive.sendError(oldPlayer, err);
                return oldPlayer;
            }
        }

        const room = oldPlayer.roomId ? rooms.get(oldPlayer.roomId) : null;
        let opponentName = 'Opponent';
        let opponentAlive = false;
        if (room) {
            const opponent = room.getPlayers().find(p => p.id !== oldPlayer.id);
            opponentName = opponent ? opponent.name : opponentName;
            opponentAlive = Boolean(opponent && opponent.ws && opponent.ws.readyState === WebSocket.OPEN);

            if (room.state === 'playing' && !room.lastGameState && !opponentAlive) {
                room.state = 'waiting';
                room.diceRolls = {};
                room.diceAcks = new Set();
                room.restartRequests = new Set();
            }
        }

        oldPlayer.send({
            type: 'reconnect_success',
            room: room ? room.toJSON() : null,
            playerIndex: oldPlayer.playerIndex,
            opponentName,
            accountId: oldPlayer.accountId
        });
        competitiveLive.sendSnapshot(oldPlayer);

        if (oldPlayer.roomId) {
            broadcastToRoom(oldPlayer.roomId, {
                type: 'opponent_reconnected',
                playerId: oldPlayer.id
            }, oldPlayer.id);
        }

        if (room && room.state === 'playing') {
            if (room.lastGameState) {
                oldPlayer.send({ type: 'full_sync', state: room.lastGameState });
            } else if (opponentAlive) {
                broadcastToRoom(oldPlayer.roomId, {
                    type: 'request_sync',
                    targetPlayerId: oldPlayer.id
                }, oldPlayer.id);
            }
        }

        return oldPlayer;
    }

    if (message.accountId) {
        try {
            competitiveService.restoreAccount(tempPlayer, message.accountId, message.sessionToken);
        } catch (err) {
            tempPlayer.send({
                type: 'reconnect_failed',
                code: err.code || 'RECONNECT_FAILED',
                message: err.message || 'Cannot restore account'
            });
            competitiveLive.sendError(tempPlayer, err);
            return tempPlayer;
        }
    }

    tempPlayer.send({
        type: 'reconnect_failed',
        accountId: tempPlayer.accountId
    });
    competitiveLive.sendSnapshot(tempPlayer);
    return tempPlayer;
}

function handleSocketClose(player) {
    const room = player.roomId ? rooms.get(player.roomId) : null;
    const shouldWaitForReconnect = Boolean((room && room.state === 'playing') || player.activeMatchId);
    if (shouldWaitForReconnect) {
        player.disconnectTimeout = setTimeout(() => {
            competitiveLive.handleDisconnectTimeout(player);
            competitiveService.unlinkPlayer(player.id);
            handleDisconnect(player);
            players.delete(player.id);
        }, 60000);

        if (player.roomId) {
            broadcastToRoom(player.roomId, {
                type: 'opponent_disconnected',
                playerId: player.id
            }, player.id);
        }
        return;
    }

    competitiveService.unlinkPlayer(player.id);
    handleDisconnect(player);
    players.delete(player.id);
}

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
            handleDiceRoll(player);
            break;
        case 'dice_ack':
            handleDiceAck(player);
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
        case 'slider_sync':
            broadcastToRoom(player.roomId, {
                type: 'slider_sync',
                value: message.value,
                player: message.player
            }, player.id);
            break;
        case 'full_sync':
            forwardFullSync(player, message);
            break;
        case 'chat':
            broadcastToRoom(player.roomId, {
                type: 'chat',
                playerId: player.id,
                playerName: player.name,
                text: message.text
            });
            break;
        case 'surrender':
            competitiveLive.handleSurrender(player);
            broadcastToRoom(player.roomId, {
                type: 'surrender',
                playerId: player.id
            }, player.id);
            break;
        case 'restart_request':
            handleRestartRequest(player);
            break;
        case 'competitive_profile':
            competitiveLive.sendSnapshot(player);
            break;
        case 'quick_match':
            competitiveLive.handleQuickMatch(player, message);
            break;
        case 'cancel_matchmaking':
            competitiveLive.handleCancelMatchmaking(player);
            break;
        case 'ai_match':
            competitiveLive.handleAiMatch(player, message);
            break;
        case 'competitive_result':
            competitiveLive.handleResult(player, message);
            break;
        case 'ping':
            player.send({ type: 'pong' });
            break;
        default:
            player.send({ type: 'error', message: `Unknown message: ${message.type}` });
    }
}

function createRoom(player, roomName) {
    if (player.roomId) {
        player.send({ type: 'error', message: 'You are already in a room.' });
        return;
    }

    const roomId = roomIdCounter++;
    const room = new Room(roomId, player);
    if (roomName) room.name = String(roomName).slice(0, 40);
    rooms.set(roomId, room);

    player.roomId = roomId;
    player.playerIndex = 'A';

    player.send({
        type: 'room_created',
        room: room.toJSON(),
        playerIndex: 'A'
    });
    broadcastRoomListUpdate();
}

function joinRoom(player, roomId) {
    if (player.roomId) {
        player.send({ type: 'error', message: 'You are already in a room.' });
        return;
    }

    const numericRoomId = Number(roomId);
    const room = rooms.get(numericRoomId);
    if (!room) {
        player.send({ type: 'error', message: 'Room not found.' });
        return;
    }
    if (room.state !== 'waiting' || !room.addPlayer(player)) {
        player.send({ type: 'error', message: 'Room is not available.' });
        return;
    }

    player.roomId = numericRoomId;
    player.playerIndex = 'B';

    player.send({
        type: 'room_joined',
        room: room.toJSON(),
        playerIndex: 'B'
    });
    if (room.host) {
        room.host.send({
            type: 'player_joined',
            player: { id: player.id, name: player.name }
        });
    }
    broadcastRoomListUpdate();
}

function leaveRoom(player) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;

    const wasHost = Boolean(room.host && room.host.id === player.id);
    broadcastToRoom(player.roomId, {
        type: 'player_left',
        playerId: player.id,
        playerName: player.name
    }, player.id);

    room.removePlayer(player.id);
    player.roomId = null;
    player.playerIndex = null;
    player.ready = false;

    if (room.getPlayers().length === 0) {
        rooms.delete(room.id);
    } else if (wasHost && room.host) {
        room.host.send({
            type: 'host_transferred',
            room: room.toJSON(),
            playerIndex: room.host.playerIndex
        });
    }

    player.send({ type: 'room_left' });
    broadcastRoomListUpdate();
}

function handlePlayerReady(player) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;

    player.ready = true;
    broadcastToRoom(player.roomId, {
        type: 'player_ready',
        playerId: player.id,
        playerIndex: player.playerIndex
    });

    if (room.host && room.guest && room.host.ready && room.guest.ready) {
        room.host.send({
            type: 'can_start_game',
            roomId: room.id
        });
    }
}

function handleCancelReady(player) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;

    player.ready = false;
    room.restartRequests = new Set();
    broadcastToRoom(player.roomId, {
        type: 'cancel_ready',
        playerId: player.id,
        playerIndex: player.playerIndex
    });
}

function handleRestartRequest(player) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;

    if (!room.restartRequests) room.restartRequests = new Set();
    room.restartRequests.add(player.id);

    broadcastToRoom(player.roomId, {
        type: 'opponent_restart_request',
        playerId: player.id
    }, player.id);

    if (room.host && room.guest
        && room.restartRequests.has(room.host.id)
        && room.restartRequests.has(room.guest.id)) {
        room.restartRequests.clear();
        room.diceRolls = {};
        room.diceAcks = new Set();
        room.state = 'playing';
        broadcastToRoom(player.roomId, { type: 'restart_game' });
    }
}

function handleStartGame(player) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room || !room.host || !room.guest) return;

    if (room.host.id !== player.id) {
        player.send({ type: 'error', message: 'Only the host can start.' });
        return;
    }
    if (!room.host.ready || !room.guest.ready) {
        player.send({ type: 'error', message: 'Both players must be ready.' });
        return;
    }

    startGame(room);
}

function handleDiceRoll(player) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room || room.state !== 'playing') return;

    if (!room.diceRolls) room.diceRolls = {};
    if (room.diceRolls[player.playerIndex]) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    room.diceRolls[player.playerIndex] = roll;
    broadcastToRoom(room.id, {
        type: 'player_rolled',
        playerIndex: player.playerIndex,
        val: roll
    });

    if (room.diceRolls.A && room.diceRolls.B) {
        const aVal = room.diceRolls.A;
        const bVal = room.diceRolls.B;
        const first = aVal > bVal ? 'A' : (bVal > aVal ? 'B' : null);

        if (!first) {
            room.diceRolls = {};
            setTimeout(() => {
                broadcastToRoom(room.id, { type: 'dice_tie' });
            }, 100);
            return;
        }

        setTimeout(() => {
            broadcastToRoom(room.id, {
                type: 'dice_result',
                results: { a: aVal, b: bVal, first }
            });
        }, 100);
    }
}

function handleDiceAck(player) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room || room.state !== 'playing') return;

    if (!room.diceAcks) room.diceAcks = new Set();
    room.diceAcks.add(player.id);

    if (room.host && room.guest
        && room.diceAcks.has(room.host.id)
        && room.diceAcks.has(room.guest.id)) {
        room.diceAcks.clear();
        room.diceRolls = {};
        broadcastToRoom(room.id, { type: 'game_start_sync' });
    }
}

function startGame(room) {
    room.state = 'playing';
    room.diceRolls = {};
    room.diceAcks = new Set();
    room.restartRequests = new Set();

    const roomPlayers = room.getPlayers();
    roomPlayers.forEach(player => {
        player.send({
            type: 'game_start',
            roomId: room.id,
            playerIndex: player.playerIndex,
            opponentName: player.playerIndex === 'A' ? room.guest?.name : room.host?.name,
            competitiveMatchId: room.competitiveMatchId || null
        });
    });
}

function broadcastGameState(player, state) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (room) room.lastGameState = state;

    broadcastToRoom(player.roomId, {
        type: 'game_state',
        playerId: player.id,
        state
    }, player.id);
}

function forwardFullSync(player, message) {
    if (!player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;

    const targetPlayer = room.getPlayers().find(p => p.id === message.targetPlayerId);
    if (targetPlayer) {
        targetPlayer.send({
            type: 'full_sync',
            state: message.state
        });
    }
}

function handleDisconnect(player) {
    if (player.roomId) {
        leaveRoom(player);
    }
}

function sendRoomList(player) {
    player.send({
        type: 'room_list',
        rooms: [...rooms.values()].map(room => room.toJSON())
    });
}

function broadcastRoomListUpdate() {
    const roomList = [...rooms.values()].map(room => room.toJSON());
    players.forEach(player => {
        if (!player.roomId) {
            player.send({
                type: 'room_list',
                rooms: roomList
            });
        }
    });
}

function broadcastToRoom(roomId, message, excludePlayerId = null) {
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.getPlayers().forEach(player => {
        if (player.id !== excludePlayerId) {
            player.send(message);
        }
    });
}

function generateId() {
    return crypto.randomUUID().slice(0, 9);
}

server.listen(PORT, HOST, () => {
    console.log(`Pello server started`);
    console.log(`HTTP: http://${HOST}:${PORT}`);
    console.log(`WebSocket: ws://${HOST}:${PORT}`);
    console.log(`Website: http://localhost:${PORT}`);
});
