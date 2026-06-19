const assert = require('assert');
const { CompetitiveService, createCompetitiveLiveController } = require('../src/competitive');

function player(id) {
    return {
        id,
        name: id,
        roomId: null,
        playerIndex: null,
        ready: false,
        activeMatchId: null,
        messages: [],
        send(message) {
            this.messages.push(message);
        }
    };
}

class Room {
    constructor(id, host) {
        this.id = id;
        this.name = `Room ${id}`;
        this.host = host;
        this.guest = null;
        this.state = 'waiting';
        this.maxPlayers = 2;
    }

    addPlayer(guest) {
        this.guest = guest;
        return true;
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
            maxPlayers: this.maxPlayers
        };
    }
}

function createControllerHarness(serviceOptions = {}) {
    const service = new CompetitiveService(serviceOptions);
    const players = new Map();
    const rooms = new Map();
    let nextRoomId = 1;
    let startedRoomId = null;
    let roomListBroadcasts = 0;

    const controller = createCompetitiveLiveController({
        service,
        players,
        rooms,
        Room,
        allocateRoomId: () => nextRoomId++,
        startGame(room) {
            startedRoomId = room.id;
            room.state = 'playing';
        },
        broadcastRoomListUpdate() {
            roomListBroadcasts++;
        }
    });

    return {
        service,
        players,
        rooms,
        controller,
        get startedRoomId() {
            return startedRoomId;
        },
        get roomListBroadcasts() {
            return roomListBroadcasts;
        }
    };
}

function testHumanQuickMatchCreatesCompetitiveRoom() {
    const harness = createControllerHarness();
    const alice = player('alice');
    const bob = player('bob');
    harness.players.set(alice.id, alice);
    harness.players.set(bob.id, bob);

    harness.service.ensureAccountForPlayer(alice);
    harness.service.ensureAccountForPlayer(bob);

    harness.controller.handleQuickMatch(alice, { tableId: 'bronze_12' });
    const queued = alice.messages.find(message => message.type === 'matchmaking_queued');
    assert.ok(queued);
    assert.strictEqual(queued.wallet.balance, 120);
    assert.strictEqual(queued.wallet.reserved, 12);

    harness.controller.handleQuickMatch(bob, { tableId: 'bronze_12' });
    assert.strictEqual(harness.rooms.size, 1);
    assert.strictEqual(harness.startedRoomId, 1);
    assert.strictEqual(harness.roomListBroadcasts, 1);

    const room = harness.rooms.get(1);
    assert.strictEqual(room.state, 'playing');
    assert.ok(room.competitiveMatchId);
    assert.strictEqual(alice.roomId, 1);
    assert.strictEqual(bob.roomId, 1);
    assert.strictEqual(alice.playerIndex, 'A');
    assert.strictEqual(bob.playerIndex, 'B');
    assert.strictEqual(alice.activeMatchId, room.competitiveMatchId);
    assert.strictEqual(bob.activeMatchId, room.competitiveMatchId);

    const aliceMatch = alice.messages.find(message => message.type === 'competitive_match_found');
    const bobMatch = bob.messages.find(message => message.type === 'competitive_match_found');
    assert.ok(aliceMatch);
    assert.ok(bobMatch);
    assert.strictEqual(aliceMatch.room.id, 1);
    assert.strictEqual(bobMatch.room.id, 1);
    assert.strictEqual(aliceMatch.wallet.reserved, 12);
    assert.strictEqual(bobMatch.wallet.reserved, 12);
}

function testAiFallbackRequiresMatchmakingTimeout() {
    let currentTime = 200000;
    const harness = createControllerHarness({ now: () => currentTime });
    const alice = player('alice-ai-fallback');
    harness.players.set(alice.id, alice);
    harness.service.ensureAccountForPlayer(alice);

    harness.controller.handleQuickMatch(alice, { tableId: 'bronze_12' });
    const queued = alice.messages.find(message => message.type === 'matchmaking_queued');
    assert.ok(queued);
    assert.strictEqual(queued.wallet.reserved, 12);

    harness.controller.handleAiMatch(alice, { tableId: 'bronze_12' });
    const earlyError = alice.messages.find(message => message.type === 'competitive_error');
    assert.ok(earlyError);
    assert.strictEqual(earlyError.code, 'AI_FALLBACK_NOT_READY');
    assert.strictEqual(harness.service.getSnapshot(alice.accountId).wallet.reserved, 12);

    currentTime += 15000;
    harness.controller.handleAiMatch(alice, { tableId: 'bronze_12' });
    const aiMatch = alice.messages.find(message => message.type === 'competitive_match_found');
    assert.ok(aiMatch);
    assert.strictEqual(aiMatch.match.mode, 'ai');
    assert.strictEqual(aiMatch.wallet.reserved, 12);
}

function testDisconnectTimeoutSettlesHumanMatchForOpponent() {
    const harness = createControllerHarness();
    const alice = player('alice-disconnect');
    const bob = player('bob-disconnect');
    harness.players.set(alice.id, alice);
    harness.players.set(bob.id, bob);

    harness.service.ensureAccountForPlayer(alice);
    harness.service.ensureAccountForPlayer(bob);
    harness.controller.handleQuickMatch(alice, { tableId: 'bronze_12' });
    harness.controller.handleQuickMatch(bob, { tableId: 'bronze_12' });

    const result = harness.controller.handleDisconnectTimeout(alice);
    const bobSettlement = bob.messages.find(message => {
        return message.type === 'competitive_settlement' && message.match.id === result.match.id;
    });

    assert.strictEqual(result.status, 'settled');
    assert.ok(bobSettlement);
    assert.strictEqual(bobSettlement.status, 'settled');
    assert.strictEqual(bobSettlement.wallet.balance, 128);
    assert.strictEqual(bobSettlement.wallet.reserved, 0);
    assert.strictEqual(bob.activeMatchId, null);
}

function testDisconnectTimeoutSettlesAiMatchLoss() {
    const harness = createControllerHarness();
    const alice = player('alice-ai-disconnect');
    harness.players.set(alice.id, alice);
    harness.service.ensureAccountForPlayer(alice);
    harness.controller.handleAiMatch(alice, { tableId: 'bronze_12' });

    const result = harness.controller.handleDisconnectTimeout(alice);
    const settlement = alice.messages.find(message => {
        return message.type === 'competitive_settlement' && message.match.id === result.match.id;
    });

    assert.strictEqual(result.status, 'settled');
    assert.ok(settlement);
    assert.strictEqual(settlement.wallet.balance, 108);
    assert.strictEqual(settlement.wallet.reserved, 0);
    assert.strictEqual(alice.activeMatchId, null);
}

testHumanQuickMatchCreatesCompetitiveRoom();
testAiFallbackRequiresMatchmakingTimeout();
testDisconnectTimeoutSettlesHumanMatchForOpponent();
testDisconnectTimeoutSettlesAiMatchLoss();

console.log('competitive live controller tests passed');
