const env = import.meta.env || {};
const DEFAULT_NATIVE_SERVER_URL = 'https://pello.xincreates.com';

function parseBoolean(value) {
    if (value === true) return true;
    if (typeof value !== 'string') return false;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function isNativeRuntime() {
    if (typeof window === 'undefined') return false;
    const capacitor = window.Capacitor;
    if (capacitor) {
        if (typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform()) return true;
        if (typeof capacitor.getPlatform === 'function') {
            return ['android', 'ios'].includes(capacitor.getPlatform());
        }
    }
    return ['capacitor:', 'ionic:'].includes(window.location.protocol);
}

if (typeof window !== 'undefined') {
    const nativeRuntime = isNativeRuntime();
    const serverUrl = env.VITE_PELLO_SERVER_URL || (nativeRuntime ? DEFAULT_NATIVE_SERVER_URL : '');
    if (serverUrl) {
        window.PELLO_SERVER_URL = serverUrl;
    }

    window.PELLO_SERVER_LOCKED = env.VITE_PELLO_SERVER_LOCKED === undefined
        ? nativeRuntime && Boolean(serverUrl)
        : parseBoolean(env.VITE_PELLO_SERVER_LOCKED);
}
