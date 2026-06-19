const DEFAULT_WIN_THRESHOLD = 6;
const TIMEOUT_LOSS_LIMIT = 3;
const VALID_SLOTS = new Set(['A', 'B']);

function asFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function asSlot(value) {
    return VALID_SLOTS.has(value) ? value : null;
}

function invalid(code, message, evidence = {}) {
    return {
        valid: false,
        code,
        message,
        evidence
    };
}

function finalResult(winnerSlot, reason, evidence) {
    return {
        valid: true,
        final: true,
        winnerSlot,
        reason,
        evidence
    };
}

function deriveWinnerFromState(state, options = {}) {
    if (!state || typeof state !== 'object') {
        return invalid('RESULT_STATE_REQUIRED', 'Final game state is required');
    }

    const winThreshold = Number.isFinite(options.winThreshold)
        ? options.winThreshold
        : DEFAULT_WIN_THRESHOLD;
    const runnerPosition = asFiniteNumber(state.runnerPosition);

    if (runnerPosition === null) {
        return invalid('RESULT_STATE_INVALID', 'Final game state is missing runner position');
    }

    const evidence = {
        runnerPosition,
        piecesLeftA: asFiniteNumber(state.piecesLeftA),
        piecesLeftB: asFiniteNumber(state.piecesLeftB),
        timeoutsA: asFiniteNumber(state.timeoutsA),
        timeoutsB: asFiniteNumber(state.timeoutsB),
        stateWinner: asSlot(state.winner),
        pendingWinReason: typeof state.pendingWinReason === 'string' ? state.pendingWinReason : null
    };

    if (runnerPosition <= -winThreshold) {
        return finalResult('A', 'runner', evidence);
    }
    if (runnerPosition >= winThreshold) {
        return finalResult('B', 'runner', evidence);
    }

    const timeoutsA = evidence.timeoutsA || 0;
    const timeoutsB = evidence.timeoutsB || 0;
    if (timeoutsA >= TIMEOUT_LOSS_LIMIT && timeoutsB >= TIMEOUT_LOSS_LIMIT) {
        return invalid('RESULT_STATE_INVALID', 'Timeout result is ambiguous', evidence);
    }
    if (timeoutsA >= TIMEOUT_LOSS_LIMIT) {
        return finalResult('B', 'timeout', evidence);
    }
    if (timeoutsB >= TIMEOUT_LOSS_LIMIT) {
        return finalResult('A', 'timeout', evidence);
    }

    if (evidence.piecesLeftA !== null && evidence.piecesLeftB !== null
        && evidence.piecesLeftA <= 0 && evidence.piecesLeftB <= 0) {
        if (runnerPosition < 0) {
            return finalResult('A', 'allUsed', evidence);
        }
        if (runnerPosition > 0) {
            return finalResult('B', 'allUsed', evidence);
        }
        return {
            valid: true,
            final: false,
            winnerSlot: null,
            reason: 'overtime',
            evidence
        };
    }

    return {
        valid: true,
        final: false,
        winnerSlot: null,
        reason: 'incomplete',
        evidence
    };
}

function validateSubmittedResult(result, options = {}) {
    const winnerSlot = asSlot(result && result.submittedWinnerSlot);
    if (!winnerSlot) {
        return invalid('INVALID_WINNER_SLOT', 'Submitted winner slot is invalid');
    }

    const requestedReason = result.reason || (result.state && result.state.pendingWinReason) || 'normal';
    if (requestedReason === 'surrender') {
        return finalResult(winnerSlot, 'surrender', { surrender: true });
    }

    const derived = deriveWinnerFromState(result.state, options);
    if (!derived.valid) {
        return derived;
    }
    if (!derived.final || !derived.winnerSlot) {
        return invalid('RESULT_STATE_NOT_FINAL', 'Submitted state does not prove a finished game', derived.evidence);
    }
    if (winnerSlot !== derived.winnerSlot) {
        return invalid('RESULT_WINNER_MISMATCH', 'Submitted winner does not match final game state', {
            ...derived.evidence,
            submittedWinnerSlot: winnerSlot,
            derivedWinnerSlot: derived.winnerSlot
        });
    }
    if (requestedReason !== 'normal' && requestedReason !== derived.reason) {
        return invalid('RESULT_REASON_MISMATCH', 'Submitted result reason does not match final game state', {
            ...derived.evidence,
            submittedReason: requestedReason,
            derivedReason: derived.reason
        });
    }

    return finalResult(winnerSlot, derived.reason, derived.evidence);
}

module.exports = {
    DEFAULT_WIN_THRESHOLD,
    TIMEOUT_LOSS_LIMIT,
    deriveWinnerFromState,
    validateSubmittedResult
};
