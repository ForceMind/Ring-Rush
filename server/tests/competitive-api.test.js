const assert = require('assert');
const { CompetitiveService, handleCompetitiveApi } = require('../src/competitive');

function player(id) {
    return { id, name: id };
}

function finalRunnerState(winnerSlot) {
    return {
        runnerPosition: winnerSlot === 'A' ? -6 : 6,
        piecesLeftA: 4,
        piecesLeftB: 4,
        timeoutsA: 0,
        timeoutsB: 0,
        pendingWinReason: 'runner',
        winner: winnerSlot,
        gameOver: true
    };
}

function mockRes() {
    return {
        statusCode: null,
        headers: null,
        body: null,
        writeHead(statusCode, headers) {
            this.statusCode = statusCode;
            this.headers = headers;
        },
        end(body) {
            this.body = body;
        },
        json() {
            return JSON.parse(this.body);
        }
    };
}

function callApi(service, url, method = 'GET', headers = {}) {
    const res = mockRes();
    const handled = handleCompetitiveApi({ method, url, headers }, res, service);
    assert.strictEqual(handled, true);
    return res;
}

function createSettledAccount() {
    const service = new CompetitiveService();
    const user = player('api-user');
    const snapshot = service.ensureAccountForPlayer(user);
    const profile = snapshot.profile;
    const match = service.startAiMatch(user, 'bronze_12').match;

    service.submitResult(user, match.id, {
        winner: 'player',
        reason: 'runner',
        state: finalRunnerState('A')
    });

    return { service, accountId: profile.id, sessionToken: snapshot.sessionToken };
}

function testHealth() {
    const service = new CompetitiveService();
    const res = callApi(service, '/api/competitive/health');
    const payload = res.json();

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.currency, 'coins');
    assert.strictEqual(payload.tables[0].id, 'bronze_12');
}

function testDashboard() {
    const { service, accountId, sessionToken } = createSettledAccount();
    const res = callApi(service, `/api/competitive/dashboard?accountId=${accountId}&limit=5`, 'GET', {
        'x-pello-session': sessionToken
    });
    const payload = res.json();

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['Access-Control-Allow-Origin'], '*');
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.dashboard.profile.id, accountId);
    assert.strictEqual(payload.dashboard.wallet.balance, 128);
    assert.ok(payload.dashboard.ledger.length > 0);
    assert.strictEqual(payload.dashboard.matches[0].result, 'win');
}

function testCorsPreflight() {
    const service = new CompetitiveService();
    const res = callApi(service, '/api/competitive/dashboard', 'OPTIONS');

    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.headers['Access-Control-Allow-Origin'], '*');
    assert.strictEqual(res.headers['Access-Control-Allow-Methods'], 'GET, OPTIONS');
    assert.strictEqual(res.headers['Access-Control-Allow-Headers'], 'Content-Type, X-Pello-Session');
    assert.strictEqual(res.body, undefined);
}

function testLedgerAndMatches() {
    const { service, accountId, sessionToken } = createSettledAccount();
    const headers = { 'x-pello-session': sessionToken };
    const ledgerRes = callApi(service, `/api/competitive/ledger?accountId=${accountId}`, 'GET', headers);
    const matchesRes = callApi(service, `/api/competitive/matches?accountId=${accountId}`, 'GET', headers);

    assert.strictEqual(ledgerRes.statusCode, 200);
    assert.ok(ledgerRes.json().ledger.some(row => row.type === 'match.ai_reward'));

    assert.strictEqual(matchesRes.statusCode, 200);
    const match = matchesRes.json().matches[0];
    assert.strictEqual(match.mode, 'ai');
    assert.strictEqual(match.settlement.wallet.balance, 128);
}

function testErrorsAndPassThrough() {
    const service = new CompetitiveService();
    let res = callApi(service, '/api/competitive/dashboard');
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.json().code, 'ACCOUNT_ID_REQUIRED');

    const snapshot = service.ensureAccountForPlayer(player('api-protected'));
    res = callApi(service, `/api/competitive/dashboard?accountId=${snapshot.profile.id}`);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json().code, 'ACCOUNT_AUTH_REQUIRED');

    res = callApi(service, `/api/competitive/dashboard?accountId=${snapshot.profile.id}`, 'GET', {
        'x-pello-session': 'bad-token'
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json().code, 'ACCOUNT_AUTH_INVALID');

    res = callApi(service, '/api/competitive/dashboard?accountId=missing', 'GET', {
        'x-pello-session': 'dummy-token'
    });
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.json().code, 'ACCOUNT_NOT_FOUND');

    res = callApi(service, '/api/competitive/health', 'POST');
    assert.strictEqual(res.statusCode, 405);

    const staticRes = mockRes();
    assert.strictEqual(handleCompetitiveApi({ method: 'GET', url: '/online.html' }, staticRes, service), false);
}

testHealth();
testDashboard();
testCorsPreflight();
testLedgerAndMatches();
testErrorsAndPassThrough();

console.log('competitive api tests passed');
