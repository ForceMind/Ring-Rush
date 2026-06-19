const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CompetitiveService } = require('../src/competitive');
const { FileCompetitiveStore } = require('../src/competitive/file-store');
const { deriveWinnerFromState, validateSubmittedResult } = require('../../shared/game-result');

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

function timeoutState(losingSlot) {
    return {
        runnerPosition: 0,
        piecesLeftA: 4,
        piecesLeftB: 4,
        timeoutsA: losingSlot === 'A' ? 3 : 0,
        timeoutsB: losingSlot === 'B' ? 3 : 0,
        pendingWinReason: 'timeout',
        winner: losingSlot === 'A' ? 'B' : 'A',
        gameOver: true
    };
}

function testResultValidator() {
    const runner = deriveWinnerFromState(finalRunnerState('A'));
    assert.strictEqual(runner.valid, true);
    assert.strictEqual(runner.winnerSlot, 'A');
    assert.strictEqual(runner.reason, 'runner');

    const timeout = validateSubmittedResult({
        submittedWinnerSlot: 'B',
        reason: 'timeout',
        state: timeoutState('A')
    });
    assert.strictEqual(timeout.valid, true);
    assert.strictEqual(timeout.reason, 'timeout');

    const mismatch = validateSubmittedResult({
        submittedWinnerSlot: 'B',
        reason: 'runner',
        state: finalRunnerState('A')
    });
    assert.strictEqual(mismatch.valid, false);
    assert.strictEqual(mismatch.code, 'RESULT_WINNER_MISMATCH');
}

function testHumanSettlementRequiresMatchingFinalState() {
    const service = new CompetitiveService();
    const alice = player('alice');
    const bob = player('bob');
    const aliceProfile = service.ensureAccountForPlayer(alice).profile;
    const bobProfile = service.ensureAccountForPlayer(bob).profile;

    service.joinQuickMatch(alice, 'bronze_12');
    const matched = service.joinQuickMatch(bob, 'bronze_12');

    assert.throws(() => {
        service.submitResult(alice, matched.match.id, {
            winner: 'B',
            reason: 'runner',
            state: finalRunnerState('A')
        });
    }, /Submitted winner does not match final game state/);

    const pending = service.submitResult(alice, matched.match.id, {
        winner: 'A',
        reason: 'runner',
        state: finalRunnerState('A')
    });
    assert.strictEqual(pending.status, 'pending_confirmation');

    const settled = service.submitResult(bob, matched.match.id, {
        winner: aliceProfile.id,
        reason: 'runner',
        state: finalRunnerState('A')
    });
    assert.strictEqual(settled.status, 'settled');
    assert.strictEqual(service.getSnapshot(aliceProfile.id).wallet.balance, 128);
    assert.strictEqual(service.getSnapshot(bobProfile.id).wallet.balance, 108);
}

function testAiSettlementAndActiveGuard() {
    const service = new CompetitiveService();
    const user = player('cara');
    const profile = service.ensureAccountForPlayer(user).profile;
    const aiMatch = service.startAiMatch(user, 'bronze_12').match;

    assert.throws(() => {
        service.startAiMatch(user, 'bronze_12');
    }, /A match is already active/);

    assert.throws(() => {
        service.submitResult(user, aiMatch.id, {
            winner: 'player',
            reason: 'normal'
        });
    }, /Final game state is required/);

    assert.throws(() => {
        service.submitResult(user, aiMatch.id, {
            winner: 'player',
            reason: 'surrender'
        });
    }, /Surrender must award the opponent/);

    const settled = service.submitResult(user, aiMatch.id, {
        winner: 'player',
        reason: 'runner',
        state: finalRunnerState('A')
    });
    assert.strictEqual(settled.status, 'settled');
    assert.strictEqual(service.getSnapshot(profile.id).wallet.balance, 128);
}

function testAiSurrenderSettlesLossAndReleasesReserve() {
    const service = new CompetitiveService();
    const user = player('surrender-ai');
    const profile = service.ensureAccountForPlayer(user).profile;
    const aiMatch = service.startAiMatch(user, 'bronze_12').match;

    const settled = service.submitResult(user, aiMatch.id, {
        winner: 'ai',
        reason: 'surrender'
    });
    const snapshot = service.getSnapshot(profile.id);

    assert.strictEqual(settled.status, 'settled');
    assert.strictEqual(snapshot.wallet.balance, 108);
    assert.strictEqual(snapshot.wallet.reserved, 0);
    assert.strictEqual(snapshot.profile.losses, 1);
}

function testAiDisconnectForfeitSettlesLossAndReleasesReserve() {
    const service = new CompetitiveService();
    const user = player('disconnect-ai');
    const profile = service.ensureAccountForPlayer(user).profile;
    service.startAiMatch(user, 'bronze_12');

    const result = service.forfeitActiveMatchByPlayerId(user.id);
    const snapshot = service.getSnapshot(profile.id);

    assert.strictEqual(result.status, 'settled');
    assert.strictEqual(result.match.state, 'settled');
    assert.strictEqual(snapshot.wallet.balance, 108);
    assert.strictEqual(snapshot.wallet.reserved, 0);
    assert.strictEqual(snapshot.profile.losses, 1);
}

function testHumanDisconnectForfeitPaysOpponentAndReleasesBothReserves() {
    const service = new CompetitiveService();
    const alice = player('disconnect-alice');
    const bob = player('disconnect-bob');
    const aliceProfile = service.ensureAccountForPlayer(alice).profile;
    const bobProfile = service.ensureAccountForPlayer(bob).profile;

    service.joinQuickMatch(alice, 'bronze_12');
    service.joinQuickMatch(bob, 'bronze_12');

    const result = service.forfeitActiveMatchByPlayerId(alice.id);
    const aliceSnapshot = service.getSnapshot(aliceProfile.id);
    const bobSnapshot = service.getSnapshot(bobProfile.id);

    assert.strictEqual(result.status, 'settled');
    assert.strictEqual(result.match.settlement.winnerAccountId, bobProfile.id);
    assert.strictEqual(aliceSnapshot.wallet.balance, 108);
    assert.strictEqual(aliceSnapshot.wallet.reserved, 0);
    assert.strictEqual(aliceSnapshot.profile.losses, 1);
    assert.strictEqual(bobSnapshot.wallet.balance, 128);
    assert.strictEqual(bobSnapshot.wallet.reserved, 0);
    assert.strictEqual(bobSnapshot.profile.wins, 1);
}

function testQueuedPlayerCanSwitchToAiAfterTimeoutWithoutDoubleReserve() {
    let currentTime = 100000;
    const service = new CompetitiveService({ now: () => currentTime });
    const user = player('fallback');
    const profile = service.ensureAccountForPlayer(user).profile;

    const queued = service.joinQuickMatch(user, 'bronze_12');
    assert.strictEqual(queued.status, 'queued');
    assert.strictEqual(queued.wallet.balance, 120);
    assert.strictEqual(queued.wallet.reserved, 12);

    assert.throws(() => {
        service.startAiMatch(user, 'bronze_12');
    }, /AI fallback is available after matchmaking timeout/);

    assert.strictEqual(service.getSnapshot(profile.id).wallet.reserved, 12);

    currentTime += 15000;
    const aiMatch = service.startAiMatch(user, 'bronze_12');
    const wallet = service.getSnapshot(profile.id).wallet;
    const ledger = service.getLedger(profile.id, { limit: 10 });

    assert.strictEqual(aiMatch.match.mode, 'ai');
    assert.strictEqual(wallet.balance, 120);
    assert.strictEqual(wallet.reserved, 12);
    assert.strictEqual(ledger.some(row => row.type === 'match.stake.release'), false);
    assert.strictEqual(ledger.filter(row => row.type === 'match.stake.reserve').length, 1);

    const settled = service.submitResult(user, aiMatch.match.id, {
        winner: 'player',
        reason: 'runner',
        state: finalRunnerState('A')
    });
    assert.strictEqual(settled.status, 'settled');
    assert.strictEqual(service.getSnapshot(profile.id).wallet.balance, 128);
    assert.strictEqual(service.getSnapshot(profile.id).wallet.reserved, 0);
}

function testAiProfileUsesRatingAndRecord() {
    const service = new CompetitiveService();

    const hotPlayer = player('hot-streak');
    const hotProfile = service.ensureAccountForPlayer(hotPlayer).profile;
    Object.assign(service.users.get(hotProfile.id), {
        rating: 1160,
        games: 10,
        wins: 10,
        losses: 0,
        streak: 5
    });
    const hotAi = service.startAiMatch(hotPlayer, 'bronze_12').match
        .participants.find(participant => participant.profile?.isAi).profile;
    assert.strictEqual(hotAi.aiProfileId, 'ace');
    assert.strictEqual(hotAi.difficulty, 'hard');
    assert.strictEqual(hotAi.skillScore, 1300);

    const coldPlayer = player('cold-streak');
    const coldProfile = service.ensureAccountForPlayer(coldPlayer).profile;
    Object.assign(service.users.get(coldProfile.id), {
        rating: 920,
        games: 10,
        wins: 0,
        losses: 10,
        streak: -5
    });
    const coldAi = service.startAiMatch(coldPlayer, 'bronze_12').match
        .participants.find(participant => participant.profile?.isAi).profile;
    assert.strictEqual(coldAi.aiProfileId, 'rookie');
    assert.strictEqual(coldAi.difficulty, 'easy');
    assert.strictEqual(coldAi.skillScore, 780);
}

function testAiRewardCap() {
    const service = new CompetitiveService();
    const user = player('daily');
    const profile = service.ensureAccountForPlayer(user).profile;

    for (let i = 0; i < 7; i++) {
        const match = service.startAiMatch(user, 'bronze_12').match;
        service.submitResult(user, match.id, {
            winner: 'player',
            reason: 'runner',
            state: finalRunnerState('A')
        });
    }

    const snapshot = service.getSnapshot(profile.id);
    assert.strictEqual(snapshot.wallet.balance, 156);
    assert.strictEqual(snapshot.profile.wins, 7);
}

function withTempStore(testFn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pello-competitive-'));
    const filePath = path.join(dir, 'competitive-state.json');
    try {
        testFn(new FileCompetitiveStore(filePath), filePath);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function testRestoreExistingAccountDoesNotCreateGuestWallet() {
    withTempStore((store, filePath) => {
        const service = new CompetitiveService({ store });
        const originalPlayer = player('recoverable');
        const createdSnapshot = service.ensureAccountForPlayer(originalPlayer);
        const profile = createdSnapshot.profile;
        const stateAfterCreate = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        const reloaded = new CompetitiveService({ store: new FileCompetitiveStore(filePath) });
        const newSocketPlayer = player('fresh-socket');
        const snapshot = reloaded.restoreAccount(newSocketPlayer, profile.id, createdSnapshot.sessionToken);
        const stateAfterRestore = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        assert.strictEqual(snapshot.profile.id, profile.id);
        assert.strictEqual(newSocketPlayer.accountId, profile.id);
        assert.strictEqual(reloaded.users.size, stateAfterCreate.users.length);
        assert.strictEqual(reloaded.wallets.size, stateAfterCreate.wallets.length);
        assert.strictEqual(stateAfterRestore.users.length, stateAfterCreate.users.length);
        assert.strictEqual(stateAfterRestore.wallets.length, stateAfterCreate.wallets.length);
        assert.strictEqual(stateAfterRestore.ledger.length, stateAfterCreate.ledger.length);
    });
}

function testRestoreExistingAccountRequiresSessionToken() {
    const service = new CompetitiveService();
    const createdSnapshot = service.ensureAccountForPlayer(player('protected'));
    assert.throws(() => {
        service.restoreAccount(player('intruder'), createdSnapshot.profile.id);
    }, /Account session token is required/);
    assert.throws(() => {
        service.restoreAccount(player('intruder'), createdSnapshot.profile.id, 'bad-token');
    }, /Account session token is invalid/);
}

function testPersistentSettlementRecovery() {
    withTempStore((store, filePath) => {
        const service = new CompetitiveService({ store });
        const user = player('persisted');
        const profile = service.ensureAccountForPlayer(user).profile;
        const match = service.startAiMatch(user, 'bronze_12').match;

        service.submitResult(user, match.id, {
            winner: 'player',
            reason: 'runner',
            state: finalRunnerState('A')
        });

        assert.strictEqual(fs.existsSync(filePath), true);

        const reloaded = new CompetitiveService({ store: new FileCompetitiveStore(filePath) });
        const snapshot = reloaded.getSnapshot(profile.id);
        assert.strictEqual(snapshot.wallet.balance, 128);
        assert.strictEqual(snapshot.wallet.reserved, 0);
        assert.strictEqual(snapshot.profile.wins, 1);
        assert.strictEqual(snapshot.profile.rating, 1018);
    });
}

function testRestartReleasesActiveMatchReserve() {
    withTempStore((store, filePath) => {
        const service = new CompetitiveService({ store });
        const user = player('interrupted');
        const profile = service.ensureAccountForPlayer(user).profile;
        const match = service.startAiMatch(user, 'bronze_12').match;
        const reserved = service.getSnapshot(profile.id).wallet;
        assert.strictEqual(reserved.balance, 120);
        assert.strictEqual(reserved.reserved, 12);

        const reloaded = new CompetitiveService({ store: new FileCompetitiveStore(filePath) });
        const snapshot = reloaded.getSnapshot(profile.id);
        const recoveredMatch = reloaded.matches.get(match.id);

        assert.strictEqual(snapshot.wallet.balance, 120);
        assert.strictEqual(snapshot.wallet.reserved, 0);
        assert.strictEqual(recoveredMatch.state, 'abandoned');
        assert.strictEqual(recoveredMatch.abandonReason, 'server_restart');
    });
}

testResultValidator();
testHumanSettlementRequiresMatchingFinalState();
testAiSettlementAndActiveGuard();
testAiSurrenderSettlesLossAndReleasesReserve();
testAiDisconnectForfeitSettlesLossAndReleasesReserve();
testHumanDisconnectForfeitPaysOpponentAndReleasesBothReserves();
testQueuedPlayerCanSwitchToAiAfterTimeoutWithoutDoubleReserve();
testAiProfileUsesRatingAndRecord();
testAiRewardCap();
testRestoreExistingAccountDoesNotCreateGuestWallet();
testRestoreExistingAccountRequiresSessionToken();
testPersistentSettlementRecovery();
testRestartReleasesActiveMatchReserve();

console.log('competitive service tests passed');
