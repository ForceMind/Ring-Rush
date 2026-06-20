function createCompetitiveLiveController(deps) {
    const {
        service,
        players,
        rooms,
        Room,
        allocateRoomId,
        startGame,
        broadcastRoomListUpdate
    } = deps;

    function sendSnapshot(player) {
        try {
            const snapshot = service.ensureAccountForPlayer(player);
            player.send({
                type: 'competitive_profile',
                profile: snapshot.profile,
                wallet: snapshot.wallet,
                accountId: snapshot.profile.id,
                sessionToken: snapshot.sessionToken,
                tables: snapshot.tables
            });
        } catch (err) {
            sendError(player, err);
        }
    }

    function sendError(player, err) {
        player.send({
            type: 'competitive_error',
            code: err.code || 'COMPETITIVE_ERROR',
            message: err.message || 'Competitive service error'
        });
    }

    function handleQuickMatch(player, message) {
        try {
            const result = service.joinQuickMatch(player, message.tableId || message.stake);

            if (result.status === 'queued') {
                player.send({
                    type: 'matchmaking_queued',
                    table: result.table,
                    wallet: result.wallet,
                    accountId: player.accountId,
                    queuedAt: result.queuedAt
                });
                return;
            }

            const room = createCompetitiveRoom(result.match);
            notifyMatch(result.match, room);
            startGame(room);
            broadcastRoomListUpdate();
        } catch (err) {
            sendError(player, err);
        }
    }

    function handleCancelMatchmaking(player) {
        try {
            const accountId = service.getAccountId(player);
            const result = service.cancelQueue(accountId, { release: true });
            const snapshot = service.getSnapshot(accountId);
            player.send({
                type: 'matchmaking_canceled',
                canceled: result.canceled,
                accountId,
                wallet: snapshot.wallet
            });
        } catch (err) {
            sendError(player, err);
        }
    }

    function handleAiMatch(player, message) {
        try {
            const result = service.startAiMatch(player, message.tableId || message.stake);
            player.activeMatchId = result.match.id;
            notifyMatch(result.match, null);
        } catch (err) {
            sendError(player, err);
        }
    }

    function handleResult(player, message) {
        try {
            const matchId = message.matchId || player.activeMatchId;
            const result = service.submitResult(player, matchId, {
                winner: message.winner,
                reason: message.reason,
                state: message.state
            });
            notifyResult(result);
        } catch (err) {
            sendError(player, err);
        }
    }

    function handleSurrender(player) {
        try {
            if (!player.roomId) return;
            const room = rooms.get(player.roomId);
            if (!room || !room.competitiveMatchId) return;

            const opponent = room.getPlayers().find(p => p.id !== player.id);
            if (!opponent || !opponent.accountId) return;

            const result = service.submitResult(player, room.competitiveMatchId, {
                winner: opponent.accountId,
                reason: 'surrender'
            });
            notifyResult(result);
        } catch (err) {
            sendError(player, err);
        }
    }

    function handleDisconnectTimeout(player) {
        try {
            const result = service.forfeitActiveMatchByPlayerId(player.id, {
                reason: 'disconnect_timeout'
            });
            if (result.match) {
                notifyResult(result);
            }
            return result;
        } catch (err) {
            sendError(player, err);
            return null;
        }
    }

    function createCompetitiveRoom(match) {
        const hostSlot = match.participants.find(p => p.slot === 'A');
        const guestSlot = match.participants.find(p => p.slot === 'B');
        const host = hostSlot ? players.get(hostSlot.playerId) : null;
        const guest = guestSlot ? players.get(guestSlot.playerId) : null;

        if (!host || !guest) {
            throw new Error('Matched players are no longer connected');
        }
        if (host.roomId || guest.roomId) {
            throw new Error('Matched player already entered another room');
        }

        const roomId = allocateRoomId();
        const room = new Room(roomId, host);
        room.name = `${match.table.label} ${match.id.slice(-4)}`;
        room.addPlayer(guest);
        room.state = 'playing';
        room.competitiveMatchId = match.id;
        room.stake = match.stake;
        rooms.set(roomId, room);

        host.roomId = roomId;
        host.playerIndex = 'A';
        host.ready = true;
        host.activeMatchId = match.id;

        guest.roomId = roomId;
        guest.playerIndex = 'B';
        guest.ready = true;
        guest.activeMatchId = match.id;

        return room;
    }

    function notifyMatch(match, room) {
        match.participants.forEach(participant => {
            if (!participant.playerId) return;
            const participantPlayer = players.get(participant.playerId);
            if (!participantPlayer) return;

            participantPlayer.activeMatchId = match.id;
            const snapshot = service.getSnapshot(participant.accountId);
            participantPlayer.send({
                type: 'competitive_match_found',
                match,
                room: room ? room.toJSON() : null,
                playerIndex: participant.slot,
                accountId: participant.accountId,
                wallet: snapshot.wallet
            });
        });
    }

    function notifyResult(result) {
        const match = result.match;
        match.participants.forEach(participant => {
            if (!participant.playerId) return;
            const participantPlayer = players.get(participant.playerId);
            if (!participantPlayer) return;

            const snapshot = service.getSnapshot(participant.accountId);
            if (match.state === 'settled' || match.state === 'disputed') {
                participantPlayer.activeMatchId = null;
            }

            participantPlayer.send({
                type: 'competitive_settlement',
                status: result.status,
                match,
                settlement: match.settlement,
                accountId: participant.accountId,
                wallet: snapshot.wallet
            });
        });
    }

    return {
        sendSnapshot,
        sendError,
        handleQuickMatch,
        handleCancelMatchmaking,
        handleAiMatch,
        handleResult,
        handleSurrender,
        handleDisconnectTimeout,
        notifyMatch,
        notifyResult
    };
}

module.exports = {
    createCompetitiveLiveController
};
