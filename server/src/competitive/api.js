function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Pello-Session'
    });
    res.end(JSON.stringify(payload));
}

function sendCorsPreflight(res) {
    res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Pello-Session',
        'Access-Control-Max-Age': '86400'
    });
    res.end();
}

function parseLimit(searchParams) {
    return searchParams.get('limit') || undefined;
}

function requireAccountId(searchParams) {
    const accountId = searchParams.get('accountId');
    if (!accountId) {
        const err = new Error('accountId is required');
        err.code = 'ACCOUNT_ID_REQUIRED';
        throw err;
    }
    return accountId;
}

function requireSessionToken(req, searchParams) {
    const headers = req.headers || {};
    const sessionToken = headers['x-pello-session']
        || headers['X-Pello-Session']
        || searchParams.get('sessionToken');
    if (!sessionToken) {
        const err = new Error('sessionToken is required');
        err.code = 'ACCOUNT_AUTH_REQUIRED';
        throw err;
    }
    return sessionToken;
}

function statusForError(err) {
    if (err.code === 'ACCOUNT_ID_REQUIRED') return 400;
    if (err.code === 'ACCOUNT_AUTH_REQUIRED') return 401;
    if (err.code === 'ACCOUNT_AUTH_INVALID') return 403;
    if (err.code === 'ACCOUNT_NOT_FOUND') return 404;
    return 500;
}

function handleCompetitiveApi(req, res, service) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/competitive')) {
        return false;
    }

    if (req.method === 'OPTIONS') {
        sendCorsPreflight(res);
        return true;
    }

    if (req.method !== 'GET') {
        sendJson(res, 405, {
            ok: false,
            code: 'METHOD_NOT_ALLOWED',
            message: 'Only GET is supported'
        });
        return true;
    }

    try {
        if (url.pathname === '/api/competitive/health') {
            sendJson(res, 200, {
                ok: true,
                currency: service.config.currency,
                tables: service.config.tables,
                aiProfiles: service.config.ai.profiles
            });
            return true;
        }

        const accountId = requireAccountId(url.searchParams);
        const sessionToken = requireSessionToken(req, url.searchParams);
        service.requireAccountSession(accountId, sessionToken);
        const limit = parseLimit(url.searchParams);

        if (url.pathname === '/api/competitive/profile'
            || url.pathname === '/api/competitive/dashboard') {
            sendJson(res, 200, {
                ok: true,
                accountId,
                dashboard: service.getAccountDashboard(accountId, { limit })
            });
            return true;
        }

        if (url.pathname === '/api/competitive/ledger') {
            sendJson(res, 200, {
                ok: true,
                accountId,
                ledger: service.getLedger(accountId, { limit })
            });
            return true;
        }

        if (url.pathname === '/api/competitive/matches') {
            sendJson(res, 200, {
                ok: true,
                accountId,
                matches: service.getMatchHistory(accountId, { limit })
            });
            return true;
        }

        sendJson(res, 404, {
            ok: false,
            code: 'API_NOT_FOUND',
            message: 'Competitive API endpoint not found'
        });
        return true;
    } catch (err) {
        sendJson(res, statusForError(err), {
            ok: false,
            code: err.code || 'COMPETITIVE_API_ERROR',
            message: err.message || 'Competitive API error'
        });
        return true;
    }
}

module.exports = {
    handleCompetitiveApi,
    sendJson,
    sendCorsPreflight
};
