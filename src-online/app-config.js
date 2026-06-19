const env = import.meta.env || {};

function parseBoolean(value) {
    if (value === true) return true;
    if (typeof value !== 'string') return false;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

if (typeof window !== 'undefined') {
    const serverUrl = env.VITE_PELLO_SERVER_URL;
    if (serverUrl) {
        window.PELLO_SERVER_URL = serverUrl;
    }

    window.PELLO_SERVER_LOCKED = parseBoolean(env.VITE_PELLO_SERVER_LOCKED);
}
