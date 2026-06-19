const crypto = require('crypto');
const config = require('../../../shared/competitive-config.json');
const { DEFAULT_WIN_THRESHOLD, validateSubmittedResult } = require('../../../shared/game-result');

const AI_USER_ID = 'ai:pello';

function createId(prefix) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function createSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function nowDayKey(timestamp = Date.now()) {
    return new Date(timestamp).toISOString().slice(0, 10);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

class CompetitiveService {
    constructor(options = {}) {
        this.config = options.config || config;
        this.now = options.now || (() => Date.now());
        this.createId = options.createId || createId;
        this.createSessionToken = options.createSessionToken || createSessionToken;
        this.store = options.store || null;

        this.users = new Map();
        this.playerAccounts = new Map();
        this.wallets = new Map();
        this.queues = new Map();
        this.matches = new Map();
        this.ledger = [];

        if (this.store) {
            this.loadPersistedState();
        }

        this.ensureSystemUsers();
        this.ensureAccountSessionTokens();
        if (this.store) {
            this.recoverVolatileState();
            this.persist();
        }
    }

    ensureSystemUsers() {
        if (this.users.has(AI_USER_ID)) {
            return;
        }

        this.users.set(AI_USER_ID, {
            id: AI_USER_ID,
            displayName: 'Pello AI',
            rating: 1000,
            games: 0,
            wins: 0,
            losses: 0,
            streak: 0,
            isAi: true,
            createdAt: this.now()
        });
    }

    ensureAccountSessionTokens() {
        for (const user of this.users.values()) {
            if (!user.isAi && !user.sessionToken) {
                user.sessionToken = this.createSessionToken();
            }
        }
    }

    loadPersistedState() {
        const state = this.store.load();
        if (!state) {
            return;
        }

        this.users = new Map((state.users || []).map(user => [user.id, user]));
        this.wallets = new Map((state.wallets || []).map(wallet => [wallet.userId, wallet]));
        this.matches = new Map((state.matches || []).map(match => [match.id, match]));
        this.ledger = Array.isArray(state.ledger) ? state.ledger : [];
    }

    exportState() {
        return {
            version: 1,
            savedAt: this.now(),
            users: [...this.users.values()].map(clone),
            wallets: [...this.wallets.values()].map(clone),
            matches: [...this.matches.values()].map(clone),
            ledger: this.ledger.map(clone)
        };
    }

    persist() {
        if (!this.store) {
            return;
        }
        this.store.save(this.exportState());
    }

    recoverVolatileState() {
        let recovered = false;

        for (const wallet of this.wallets.values()) {
            if (wallet.reserved !== 0) {
                wallet.reserved = 0;
                recovered = true;
            }
        }

        for (const match of this.matches.values()) {
            if (Array.isArray(match.participants)) {
                match.participants.forEach(participant => {
                    if (participant.playerId !== null) {
                        participant.playerId = null;
                        recovered = true;
                    }
                });
            }

            if (match.state === 'active') {
                match.state = 'abandoned';
                match.abandonedAt = this.now();
                match.abandonReason = 'server_restart';
                recovered = true;
            }
        }

        if (recovered) {
            this.addLedger(null, 'system.recover_restart', 0, {
                reason: 'released_reserved_coins_and_abandoned_active_matches'
            });
        }
    }

    ensureAccountForPlayer(player, requestedAccountId = null, sessionToken = null) {
        if (requestedAccountId) {
            if (!this.users.has(requestedAccountId)) {
                throw this.error('ACCOUNT_NOT_FOUND', 'Account not found');
            }
            this.requireAccountSession(requestedAccountId, sessionToken);
            this.playerAccounts.set(player.id, requestedAccountId);
            player.accountId = requestedAccountId;
            return this.getSnapshot(requestedAccountId);
        }

        if (player.accountId && this.users.has(player.accountId)) {
            this.playerAccounts.set(player.id, player.accountId);
            return this.getSnapshot(player.accountId);
        }

        const linkedAccountId = this.playerAccounts.get(player.id);
        if (linkedAccountId && this.users.has(linkedAccountId)) {
            player.accountId = linkedAccountId;
            return this.getSnapshot(linkedAccountId);
        }

        const accountId = this.createId('usr');
        const user = {
            id: accountId,
            displayName: player.name || `Player ${accountId.slice(-4)}`,
            rating: 1000,
            games: 0,
            wins: 0,
            losses: 0,
            streak: 0,
            aiRewardDay: nowDayKey(this.now()),
            aiRewardClaimed: 0,
            sessionToken: this.createSessionToken(),
            createdAt: this.now()
        };

        this.users.set(accountId, user);
        this.wallets.set(accountId, {
            userId: accountId,
            balance: this.config.initialCoins,
            reserved: 0
        });
        this.addLedger(accountId, 'grant.initial', this.config.initialCoins, {
            reason: 'guest_starting_balance'
        });

        this.playerAccounts.set(player.id, accountId);
        player.accountId = accountId;
        this.persist();
        return this.getSnapshot(accountId);
    }

    restoreAccount(player, accountId, sessionToken) {
        return this.ensureAccountForPlayer(player, accountId, sessionToken);
    }

    unlinkPlayer(playerId) {
        this.cancelQueueByPlayerId(playerId);
    }

    forfeitActiveMatchByPlayerId(playerId, options = {}) {
        const match = this.findActiveMatchByPlayerId(playerId);
        if (!match) {
            return {
                status: 'no_active_match',
                match: null
            };
        }

        const loser = match.participants.find(participant => participant.playerId === playerId);
        const winner = match.participants.find(participant => participant.accountId !== loser.accountId);
        if (!winner) {
            throw this.error('INVALID_FORFEIT', 'Cannot resolve forfeit winner');
        }

        match.resultSubmissions[loser.accountId] = {
            winnerAccountId: winner.accountId,
            winnerSlot: winner.slot,
            reason: options.reason || 'disconnect_timeout',
            submittedAt: this.now(),
            evidence: {
                forfeit: true,
                playerId
            }
        };

        this.settleMatch(match, winner.accountId);
        this.persist();
        return {
            status: 'settled',
            match: this.publicMatch(match)
        };
    }

    getSnapshot(accountId) {
        const user = this.users.get(accountId);
        const wallet = this.wallets.get(accountId);
        if (!user || !wallet) {
            throw this.error('ACCOUNT_NOT_FOUND', 'Account not found');
        }
        return {
            profile: this.publicProfile(user),
            wallet: this.publicWallet(wallet),
            sessionToken: user.sessionToken,
            tables: clone(this.config.tables)
        };
    }

    getAccountDashboard(accountId, options = {}) {
        return {
            ...this.getSnapshot(accountId),
            ledger: this.getLedger(accountId, options),
            matches: this.getMatchHistory(accountId, options)
        };
    }

    getLedger(accountId, options = {}) {
        this.getSnapshot(accountId);
        const limit = this.normalizeLimit(options.limit, 20, 100);

        return this.ledger
            .filter(row => row.accountId === accountId)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit)
            .map(row => this.publicLedgerRow(row));
    }

    getMatchHistory(accountId, options = {}) {
        this.getSnapshot(accountId);
        const limit = this.normalizeLimit(options.limit, 20, 100);

        return [...this.matches.values()]
            .filter(match => match.participants.some(participant => participant.accountId === accountId))
            .sort((a, b) => {
                const bTime = b.settledAt || b.abandonedAt || b.createdAt || 0;
                const aTime = a.settledAt || a.abandonedAt || a.createdAt || 0;
                return bTime - aTime;
            })
            .slice(0, limit)
            .map(match => this.publicMatchForAccount(match, accountId));
    }

    publicLedgerRow(row) {
        const meta = row.meta || {};
        return {
            id: row.id,
            accountId: row.accountId,
            type: row.type,
            amount: row.amount,
            currency: this.config.currency,
            createdAt: row.createdAt,
            balanceAfter: meta.balanceAfter ?? null,
            reservedAfter: meta.reservedAfter ?? null,
            reservedDelta: meta.reservedDelta ?? 0,
            matchId: meta.matchId || null,
            tableId: meta.tableId || null,
            mode: meta.mode || null,
            reason: meta.reason || null,
            requestedPayout: meta.requestedPayout ?? null
        };
    }

    publicMatchForAccount(match, accountId) {
        const me = match.participants.find(participant => participant.accountId === accountId);
        const opponent = match.participants.find(participant => participant.accountId !== accountId);
        const settlement = match.settlement || null;
        const result = settlement
            ? (settlement.winnerAccountId === accountId ? 'win' : 'loss')
            : match.state;

        return {
            id: match.id,
            mode: match.mode,
            state: match.state,
            result,
            table: clone(match.table),
            stake: match.stake,
            winnerPayout: match.winnerPayout,
            systemSink: match.systemSink,
            createdAt: match.createdAt,
            settledAt: match.settledAt,
            abandonedAt: match.abandonedAt || null,
            abandonReason: match.abandonReason || null,
            mySlot: me ? me.slot : null,
            opponent: opponent ? {
                slot: opponent.slot,
                profile: clone(opponent.profile)
            } : null,
            settlement: settlement ? {
                mode: settlement.mode,
                result,
                winnerAccountId: settlement.winnerAccountId,
                loserAccountId: settlement.loserAccountId,
                stake: settlement.stake,
                winnerPayout: settlement.winnerPayout,
                requestedWinnerPayout: settlement.requestedWinnerPayout,
                systemSink: settlement.systemSink,
                settledAt: settlement.settledAt,
                wallet: settlement.wallets ? settlement.wallets[accountId] || null : null
            } : null
        };
    }

    normalizeLimit(value, fallback, max) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return fallback;
        }
        return Math.min(Math.floor(parsed), max);
    }

    publicProfile(user) {
        return {
            id: user.id,
            displayName: user.displayName,
            rating: user.rating,
            games: user.games,
            wins: user.wins,
            losses: user.losses,
            streak: user.streak,
            isAi: Boolean(user.isAi)
        };
    }

    publicWallet(wallet) {
        return {
            currency: this.config.currency,
            balance: wallet.balance,
            reserved: wallet.reserved,
            available: wallet.balance - wallet.reserved
        };
    }

    getAccountId(player) {
        const accountId = player.accountId || this.playerAccounts.get(player.id);
        if (!accountId || !this.users.has(accountId)) {
            throw this.error('ACCOUNT_REQUIRED', 'Player account is required');
        }
        return accountId;
    }

    requireAccountSession(accountId, sessionToken) {
        const user = this.users.get(accountId);
        if (!user) {
            throw this.error('ACCOUNT_NOT_FOUND', 'Account not found');
        }
        if (!sessionToken) {
            throw this.error('ACCOUNT_AUTH_REQUIRED', 'Account session token is required');
        }
        if (sessionToken !== user.sessionToken) {
            throw this.error('ACCOUNT_AUTH_INVALID', 'Account session token is invalid');
        }
        return true;
    }

    getTable(tableIdOrStake = null) {
        if (!tableIdOrStake) {
            return this.config.tables[0];
        }

        const stake = Number(tableIdOrStake);
        const table = this.config.tables.find(item => {
            return item.id === tableIdOrStake || item.stake === stake;
        });

        if (!table) {
            throw this.error('TABLE_NOT_FOUND', 'Match table not found');
        }

        return table;
    }

    joinQuickMatch(player, tableIdOrStake) {
        const accountId = this.getAccountId(player);
        const table = this.getTable(tableIdOrStake);

        if (player.roomId) {
            throw this.error('ALREADY_IN_ROOM', 'Leave the current room before matchmaking');
        }

        const existingActiveMatch = this.findActiveMatchByAccount(accountId);
        if (existingActiveMatch) {
            throw this.error('MATCH_ALREADY_ACTIVE', 'A match is already active');
        }

        this.cancelQueue(accountId, { release: true });
        this.reserve(accountId, table.stake, {
            type: 'match.stake.reserve',
            tableId: table.id
        });

        const queue = this.getQueue(table.id);
        const opponentEntry = [...queue.values()].find(entry => {
            return entry.accountId !== accountId && entry.playerId !== player.id;
        });

        const entry = {
            accountId,
            playerId: player.id,
            tableId: table.id,
            stake: table.stake,
            queuedAt: this.now()
        };

        if (!opponentEntry) {
            queue.set(accountId, entry);
            this.persist();
            return {
                status: 'queued',
                table: clone(table),
                wallet: this.publicWallet(this.wallets.get(accountId)),
                queuedAt: entry.queuedAt
            };
        }

        queue.delete(opponentEntry.accountId);
        const match = this.createHumanMatch(table, opponentEntry, entry);
        this.persist();
        return {
            status: 'matched',
            table: clone(table),
            match
        };
    }

    cancelQueue(accountId, options = { release: true }) {
        for (const queue of this.queues.values()) {
            const entry = queue.get(accountId);
            if (entry) {
                queue.delete(accountId);
                if (options.release) {
                    this.release(accountId, entry.stake, {
                        type: 'match.stake.release',
                        tableId: entry.tableId
                    });
                }
                this.persist();
                return {
                    canceled: true,
                    tableId: entry.tableId
                };
            }
        }
        return { canceled: false };
    }

    cancelQueueByPlayerId(playerId) {
        for (const queue of this.queues.values()) {
            const entry = [...queue.values()].find(item => item.playerId === playerId);
            if (entry) {
                return this.cancelQueue(entry.accountId, { release: true });
            }
        }
        return { canceled: false };
    }

    startAiMatch(player, tableIdOrStake) {
        const accountId = this.getAccountId(player);
        const queued = this.findQueuedEntry(accountId);
        const table = queued ? this.getTable(queued.entry.tableId) : this.getTable(tableIdOrStake);

        if (queued && tableIdOrStake) {
            const requestedTable = this.getTable(tableIdOrStake);
            if (requestedTable.id !== table.id) {
                throw this.error('QUEUE_TABLE_MISMATCH', 'AI fallback must use the queued match table');
            }
        }

        if (player.roomId) {
            throw this.error('ALREADY_IN_ROOM', 'Leave the current room before starting AI match');
        }

        const existingActiveMatch = this.findActiveMatchByAccount(accountId);
        if (existingActiveMatch) {
            throw this.error('MATCH_ALREADY_ACTIVE', 'A match is already active');
        }

        if (queued) {
            const waitMs = this.now() - queued.entry.queuedAt;
            if (waitMs < table.matchmakingTimeoutMs) {
                throw this.error('AI_FALLBACK_NOT_READY', 'AI fallback is available after matchmaking timeout');
            }
            queued.queue.delete(accountId);
        } else {
            this.reserve(accountId, table.stake, {
                type: 'match.stake.reserve',
                tableId: table.id,
                mode: 'ai'
            });
        }

        const profile = this.selectAiProfile(accountId);
        const match = this.createAiMatch(table, {
            accountId,
            playerId: player.id,
            aiProfile: profile
        });

        this.persist();
        return {
            status: 'matched',
            table: clone(table),
            match
        };
    }

    createHumanMatch(table, entryA, entryB) {
        const match = {
            id: this.createId('match'),
            mode: 'human',
            table: clone(table),
            stake: table.stake,
            winnerPayout: table.winnerPayout,
            systemSink: table.systemSink,
            state: 'active',
            createdAt: this.now(),
            settledAt: null,
            participants: [
                this.matchParticipant(entryA.accountId, entryA.playerId, 'A'),
                this.matchParticipant(entryB.accountId, entryB.playerId, 'B')
            ],
            resultSubmissions: {},
            settlement: null
        };

        this.matches.set(match.id, match);
        return this.publicMatch(match);
    }

    createAiMatch(table, entry) {
        const match = {
            id: this.createId('match'),
            mode: 'ai',
            table: clone(table),
            stake: table.stake,
            winnerPayout: table.winnerPayout,
            systemSink: table.systemSink,
            state: 'active',
            createdAt: this.now(),
            settledAt: null,
            participants: [
                this.matchParticipant(entry.accountId, entry.playerId, 'A'),
                {
                    accountId: AI_USER_ID,
                    playerId: null,
                    slot: 'B',
                    profile: {
                        id: entry.aiProfile.id,
                        displayName: entry.aiProfile.label,
                        rating: this.users.get(entry.accountId).rating,
                        isAi: true,
                        difficulty: entry.aiProfile.difficulty,
                        aiProfileId: entry.aiProfile.id,
                        skillScore: entry.aiProfile.skillScore
                    }
                }
            ],
            resultSubmissions: {},
            settlement: null
        };

        this.matches.set(match.id, match);
        return this.publicMatch(match);
    }

    matchParticipant(accountId, playerId, slot) {
        const user = this.users.get(accountId);
        return {
            accountId,
            playerId,
            slot,
            profile: this.publicProfile(user)
        };
    }

    publicMatch(match) {
        return {
            id: match.id,
            mode: match.mode,
            state: match.state,
            table: clone(match.table),
            stake: match.stake,
            winnerPayout: match.winnerPayout,
            systemSink: match.systemSink,
            createdAt: match.createdAt,
            settledAt: match.settledAt,
            participants: clone(match.participants),
            settlement: match.settlement ? clone(match.settlement) : null
        };
    }

    submitResult(player, matchId, result) {
        const accountId = this.getAccountId(player);
        const match = this.matches.get(matchId);
        if (!match) {
            throw this.error('MATCH_NOT_FOUND', 'Match not found');
        }
        if (match.state !== 'active') {
            return {
                status: 'already_settled',
                match: this.publicMatch(match)
            };
        }

        const participant = match.participants.find(item => item.accountId === accountId);
        if (!participant) {
            throw this.error('MATCH_FORBIDDEN', 'Player is not in this match');
        }

        const winnerParticipant = this.resolveWinnerParticipant(match, result);
        if (!winnerParticipant) {
            throw this.error('INVALID_WINNER', 'Winner is invalid for this match');
        }
        const validation = validateSubmittedResult({
            submittedWinnerSlot: winnerParticipant.slot,
            reason: result.reason,
            state: result.state
        }, {
            winThreshold: this.config.game?.winThreshold || DEFAULT_WIN_THRESHOLD
        });
        if (!validation.valid) {
            throw this.error(validation.code, validation.message);
        }

        const winnerAccountId = winnerParticipant.accountId;
        if (validation.reason === 'surrender' && winnerAccountId === accountId) {
            throw this.error('INVALID_SURRENDER', 'Surrender must award the opponent');
        }

        match.resultSubmissions[accountId] = {
            winnerAccountId,
            winnerSlot: winnerParticipant.slot,
            reason: validation.reason,
            submittedAt: this.now(),
            evidence: validation.evidence
        };

        if (match.mode === 'ai') {
            this.settleMatch(match, winnerAccountId);
            this.persist();
            return {
                status: 'settled',
                match: this.publicMatch(match)
            };
        }

        const submissions = Object.values(match.resultSubmissions);
        const isSurrender = validation.reason === 'surrender' && winnerAccountId !== accountId;
        const allSubmitted = submissions.length >= 2;
        const allAgree = allSubmitted && submissions.every(item => item.winnerAccountId === winnerAccountId);

        if (isSurrender || allAgree) {
            this.settleMatch(match, winnerAccountId);
            this.persist();
            return {
                status: 'settled',
                match: this.publicMatch(match)
            };
        }

        if (allSubmitted && !allAgree) {
            match.state = 'disputed';
            this.persist();
            return {
                status: 'disputed',
                match: this.publicMatch(match)
            };
        }

        this.persist();
        return {
            status: 'pending_confirmation',
            match: this.publicMatch(match)
        };
    }

    resolveWinner(match, result) {
        const winner = this.resolveWinnerParticipant(match, result);
        return winner ? winner.accountId : null;
    }

    resolveWinnerParticipant(match, result) {
        if (!result || !result.winner) return null;

        if (result.winner === 'player') {
            const human = match.participants.find(item => !item.profile.isAi);
            return human || null;
        }
        if (result.winner === 'ai') {
            return match.participants.find(item => item.accountId === AI_USER_ID) || null;
        }

        const winner = match.participants.find(item => {
            return item.accountId === result.winner || item.slot === result.winner;
        });
        return winner || null;
    }

    settleMatch(match, winnerAccountId) {
        if (match.state !== 'active') return;

        const now = this.now();
        const humanParticipants = match.participants.filter(item => item.accountId !== AI_USER_ID);
        const winner = match.participants.find(item => item.accountId === winnerAccountId);
        const loser = match.participants.find(item => item.accountId !== winnerAccountId);

        for (const participant of humanParticipants) {
            this.consumeReserve(participant.accountId, match.stake, {
                type: 'match.stake.consume',
                matchId: match.id
            });
        }

        let actualWinnerPayout = 0;
        if (winner && winner.accountId !== AI_USER_ID) {
            actualWinnerPayout = match.mode === 'ai'
                ? this.consumeAiRewardAllowance(winner.accountId, match.winnerPayout)
                : match.winnerPayout;

            if (actualWinnerPayout > 0) {
                this.credit(winner.accountId, actualWinnerPayout, {
                    type: match.mode === 'ai' ? 'match.ai_reward' : 'match.payout',
                    matchId: match.id,
                    requestedPayout: match.winnerPayout
                });
            }
        }

        if (match.systemSink > 0) {
            this.addLedger(null, 'match.system_sink', match.systemSink, {
                matchId: match.id,
                mode: match.mode
            });
        }

        this.updateRatings(match, winnerAccountId);

        match.state = 'settled';
        match.settledAt = now;
        match.settlement = {
            matchId: match.id,
            mode: match.mode,
            winnerAccountId,
            loserAccountId: loser ? loser.accountId : null,
            stake: match.stake,
            winnerPayout: actualWinnerPayout,
            requestedWinnerPayout: match.winnerPayout,
            systemSink: match.systemSink,
            settledAt: now,
            wallets: Object.fromEntries(humanParticipants.map(item => {
                return [item.accountId, this.publicWallet(this.wallets.get(item.accountId))];
            }))
        };
    }

    updateRatings(match, winnerAccountId) {
        for (const participant of match.participants) {
            if (participant.accountId === AI_USER_ID) continue;
            const user = this.users.get(participant.accountId);
            if (!user) continue;
            const won = participant.accountId === winnerAccountId;
            user.games += 1;
            user.wins += won ? 1 : 0;
            user.losses += won ? 0 : 1;
            user.streak = won ? Math.max(1, user.streak + 1) : Math.min(-1, user.streak - 1);
            user.rating = Math.max(100, user.rating + (won ? 18 : -14));
        }
    }

    selectAiProfile(accountId) {
        const user = this.users.get(accountId);
        const score = this.getAiMatchScore(user);
        const profile = this.config.ai.profiles.find(candidate => {
            return score >= candidate.ratingMin && score <= candidate.ratingMax;
        }) || this.config.ai.profiles[this.config.ai.profiles.length - 1];
        return {
            ...profile,
            skillScore: score
        };
    }

    getAiMatchScore(user) {
        if (!user) return 1000;

        const games = user.games || 0;
        const rating = user.rating || 1000;
        const winRateAdjustment = games >= 5
            ? Math.round((((user.wins || 0) / games) - 0.5) * 160)
            : 0;
        const streakAdjustment = Math.max(-60, Math.min(60, (user.streak || 0) * 12));
        return Math.max(0, Math.round(rating + winRateAdjustment + streakAdjustment));
    }

    consumeAiRewardAllowance(accountId, requestedPayout) {
        const user = this.users.get(accountId);
        if (!user) return 0;

        const currentDay = nowDayKey(this.now());
        if (user.aiRewardDay !== currentDay) {
            user.aiRewardDay = currentDay;
            user.aiRewardClaimed = 0;
        }

        const limit = this.config.ai.dailyRewardLimit;
        const remaining = Math.max(0, limit - user.aiRewardClaimed);
        const payout = Math.min(requestedPayout, remaining);
        user.aiRewardClaimed += payout;
        return payout;
    }

    findActiveMatchByAccount(accountId) {
        return [...this.matches.values()].find(match => {
            return match.state === 'active' && match.participants.some(item => item.accountId === accountId);
        });
    }

    findActiveMatchByPlayerId(playerId) {
        return [...this.matches.values()].find(match => {
            return match.state === 'active' && match.participants.some(item => item.playerId === playerId);
        });
    }

    getQueue(tableId) {
        if (!this.queues.has(tableId)) {
            this.queues.set(tableId, new Map());
        }
        return this.queues.get(tableId);
    }

    findQueuedEntry(accountId) {
        for (const queue of this.queues.values()) {
            const entry = queue.get(accountId);
            if (entry) {
                return { queue, entry };
            }
        }
        return null;
    }

    reserve(accountId, amount, meta) {
        const wallet = this.requireWallet(accountId);
        if (wallet.balance - wallet.reserved < amount) {
            throw this.error('INSUFFICIENT_FUNDS', 'Not enough available coins');
        }
        wallet.reserved += amount;
        this.addLedger(accountId, meta.type, 0, {
            ...meta,
            reservedDelta: amount,
            balanceAfter: wallet.balance,
            reservedAfter: wallet.reserved
        });
    }

    release(accountId, amount, meta) {
        const wallet = this.requireWallet(accountId);
        wallet.reserved = Math.max(0, wallet.reserved - amount);
        this.addLedger(accountId, meta.type, 0, {
            ...meta,
            reservedDelta: -amount,
            balanceAfter: wallet.balance,
            reservedAfter: wallet.reserved
        });
    }

    consumeReserve(accountId, amount, meta) {
        const wallet = this.requireWallet(accountId);
        if (wallet.reserved < amount || wallet.balance < amount) {
            throw this.error('RESERVE_MISMATCH', 'Reserved coins are not available');
        }
        wallet.reserved -= amount;
        wallet.balance -= amount;
        this.addLedger(accountId, meta.type, -amount, {
            ...meta,
            reservedDelta: -amount,
            balanceAfter: wallet.balance,
            reservedAfter: wallet.reserved
        });
    }

    credit(accountId, amount, meta) {
        const wallet = this.requireWallet(accountId);
        wallet.balance += amount;
        this.addLedger(accountId, meta.type, amount, {
            ...meta,
            balanceAfter: wallet.balance,
            reservedAfter: wallet.reserved
        });
    }

    requireWallet(accountId) {
        const wallet = this.wallets.get(accountId);
        if (!wallet) {
            throw this.error('WALLET_NOT_FOUND', 'Wallet not found');
        }
        return wallet;
    }

    addLedger(accountId, type, amount, meta = {}) {
        const row = {
            id: this.createId('led'),
            accountId,
            type,
            amount,
            meta,
            createdAt: this.now()
        };
        this.ledger.push(row);
        return row;
    }

    error(code, message) {
        const err = new Error(message);
        err.code = code;
        return err;
    }
}

module.exports = {
    CompetitiveService,
    AI_USER_ID
};
