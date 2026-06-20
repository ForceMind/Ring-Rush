const assert = require('assert');
const { Readable } = require('stream');
const { CompetitiveService, handleAdminApi } = require('../src/competitive');

function player(id) {
    return { id, name: id };
}

function mockRes(resolve) {
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
            resolve(this);
        },
        json() {
            return JSON.parse(this.body);
        }
    };
}

function mockReq(url, method = 'GET', headers = {}, body = '') {
    const req = new Readable({
        read() {
            this.push(body || null);
            this.push(null);
        }
    });
    req.url = url;
    req.method = method;
    req.headers = headers;
    return req;
}

function callAdminApi(service, url, method = 'GET', headers = {}, body = '', options = { adminToken: 'secret' }) {
    return new Promise(resolve => {
        const res = mockRes(resolve);
        const handled = handleAdminApi(mockReq(url, method, headers, body), res, service, options);
        assert.strictEqual(handled, true);
    });
}

async function testAdminAuth() {
    const service = new CompetitiveService();
    let res = await callAdminApi(service, '/api/admin/users', 'GET', {}, '', { adminToken: '' });
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.json().code, 'ADMIN_DISABLED');

    res = await callAdminApi(service, '/api/admin/users');
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json().code, 'ADMIN_AUTH_REQUIRED');

    res = await callAdminApi(service, '/api/admin/users', 'GET', { 'x-pello-admin-token': 'bad' });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.json().code, 'ADMIN_AUTH_INVALID');
}

async function testAdminUserLifecycle() {
    const service = new CompetitiveService();
    const alice = player('admin-alice');
    const bob = player('admin-bob');
    const aliceSnapshot = service.ensureAccountForPlayer(alice);
    service.ensureAccountForPlayer(bob);

    let res = await callAdminApi(service, '/api/admin/users', 'GET', { 'x-pello-admin-token': 'secret' });
    let payload = res.json();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(payload.users.length, 2);
    assert.strictEqual(payload.stats.totalUsers, 2);

    res = await callAdminApi(
        service,
        `/api/admin/users/${aliceSnapshot.profile.id}/wallet`,
        'POST',
        { 'x-pello-admin-token': 'secret' },
        JSON.stringify({ action: 'add', amount: 30 })
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().result.wallet.balance, 150);

    res = await callAdminApi(
        service,
        `/api/admin/users/${aliceSnapshot.profile.id}/wallet`,
        'POST',
        { 'x-pello-admin-token': 'secret' },
        JSON.stringify({ action: 'reset' })
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().result.wallet.balance, 120);

    service.joinQuickMatch(alice, 'bronze_12');
    assert.strictEqual(service.getSnapshot(aliceSnapshot.profile.id).wallet.reserved, 12);

    res = await callAdminApi(
        service,
        `/api/admin/users/${aliceSnapshot.profile.id}/reset`,
        'POST',
        { 'x-pello-admin-token': 'secret' },
        '{}'
    );
    payload = res.json();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(payload.result.wallet.balance, 120);
    assert.strictEqual(payload.result.wallet.reserved, 0);
    assert.strictEqual(payload.result.games, 0);

    res = await callAdminApi(
        service,
        `/api/admin/users/${aliceSnapshot.profile.id}/delete`,
        'POST',
        { 'x-pello-admin-token': 'secret' },
        '{}'
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json().result.deleted, true);
    assert.throws(() => service.getSnapshot(aliceSnapshot.profile.id), /Account not found/);
}

async function run() {
    await testAdminAuth();
    await testAdminUserLifecycle();
    console.log('competitive admin api tests passed');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
