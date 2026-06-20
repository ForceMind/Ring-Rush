const { sendJson, sendCorsPreflight } = require('./api');

function sendAdminPreflight(res) {
    sendCorsPreflight(res, 'GET, POST, OPTIONS', 'Content-Type, X-Pello-Admin-Token');
}

function statusForAdminError(err) {
    if (err.code === 'ADMIN_DISABLED') return 503;
    if (err.code === 'ADMIN_AUTH_REQUIRED') return 401;
    if (err.code === 'ADMIN_AUTH_INVALID') return 403;
    if (err.code === 'ADMIN_USER_NOT_FOUND') return 404;
    if (err.code === 'ADMIN_INVALID_AMOUNT') return 400;
    if (err.code === 'ADMIN_INVALID_ACTION') return 400;
    if (err.code === 'INVALID_JSON') return 400;
    return 500;
}

function adminError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

function requireAdmin(req, searchParams, options = {}) {
    const configuredToken = Object.prototype.hasOwnProperty.call(options, 'adminToken')
        ? options.adminToken
        : (process.env.PELLO_ADMIN_TOKEN || '');
    if (!configuredToken) {
        throw adminError('ADMIN_DISABLED', 'Admin API is disabled');
    }

    const headers = req.headers || {};
    const providedToken = headers['x-pello-admin-token']
        || headers['X-Pello-Admin-Token']
        || searchParams.get('adminToken');

    if (!providedToken) {
        throw adminError('ADMIN_AUTH_REQUIRED', 'Admin token is required');
    }
    if (String(providedToken) !== String(configuredToken)) {
        throw adminError('ADMIN_AUTH_INVALID', 'Admin token is invalid');
    }
}

function readJsonBody(req) {
    if (req.body !== undefined) {
        return Promise.resolve(parseJsonBody(req.body));
    }

    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 1024 * 64) {
                reject(adminError('INVALID_JSON', 'Request body is too large'));
            }
        });
        req.on('end', () => {
            try {
                resolve(parseJsonBody(raw));
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

function parseJsonBody(raw) {
    const text = String(raw || '').trim();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (_) {
        throw adminError('INVALID_JSON', 'Invalid JSON body');
    }
}

function sendAdminError(res, err) {
    sendJson(res, statusForAdminError(err), {
        ok: false,
        code: err.code || 'ADMIN_API_ERROR',
        message: err.message || 'Admin API error'
    }, 'GET, POST, OPTIONS', 'Content-Type, X-Pello-Admin-Token');
}

function parseUserRoute(pathname) {
    const match = pathname.match(/^\/api\/admin\/users\/([^/]+)(?:\/([^/]+))?$/);
    if (!match) return null;
    return {
        accountId: decodeURIComponent(match[1]),
        action: match[2] || null
    };
}

function handleAdminApi(req, res, service, options = {}) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/admin')) {
        return false;
    }

    if (req.method === 'OPTIONS') {
        sendAdminPreflight(res);
        return true;
    }

    try {
        requireAdmin(req, url.searchParams, options);

        if (req.method === 'GET' && url.pathname === '/api/admin/health') {
            sendJson(res, 200, {
                ok: true,
                stats: service.getAdminStats()
            }, 'GET, POST, OPTIONS', 'Content-Type, X-Pello-Admin-Token');
            return true;
        }

        if (req.method === 'GET' && url.pathname === '/api/admin/users') {
            sendJson(res, 200, {
                ok: true,
                stats: service.getAdminStats(),
                users: service.getAdminUsers({
                    query: url.searchParams.get('q') || '',
                    limit: url.searchParams.get('limit') || undefined
                })
            }, 'GET, POST, OPTIONS', 'Content-Type, X-Pello-Admin-Token');
            return true;
        }

        const userRoute = parseUserRoute(url.pathname);
        if (req.method === 'GET' && userRoute && !userRoute.action) {
            sendJson(res, 200, {
                ok: true,
                user: service.getAdminUser(userRoute.accountId)
            }, 'GET, POST, OPTIONS', 'Content-Type, X-Pello-Admin-Token');
            return true;
        }

        if (req.method === 'POST' && userRoute) {
            readJsonBody(req)
                .then(body => {
                    let result;
                    if (userRoute.action === 'delete') {
                        result = service.adminDeleteUser(userRoute.accountId);
                    } else if (userRoute.action === 'reset') {
                        result = service.adminResetUser(userRoute.accountId);
                    } else if (userRoute.action === 'wallet') {
                        result = service.adminUpdateWallet(userRoute.accountId, body.action, body.amount);
                    } else {
                        throw adminError('ADMIN_INVALID_ACTION', 'Admin endpoint not found');
                    }
                    sendJson(res, 200, {
                        ok: true,
                        result
                    }, 'GET, POST, OPTIONS', 'Content-Type, X-Pello-Admin-Token');
                })
                .catch(err => sendAdminError(res, err));
            return true;
        }

        sendJson(res, 404, {
            ok: false,
            code: 'ADMIN_API_NOT_FOUND',
            message: 'Admin API endpoint not found'
        }, 'GET, POST, OPTIONS', 'Content-Type, X-Pello-Admin-Token');
        return true;
    } catch (err) {
        sendAdminError(res, err);
        return true;
    }
}

module.exports = {
    handleAdminApi
};
