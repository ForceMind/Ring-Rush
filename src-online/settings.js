export const SETTINGS_STORAGE_KEY = 'pelloAppSettings';

export const DEFAULT_SETTINGS = {
    audioEnabled: true,
    musicEnabled: true,
    vibrationEnabled: true,
    serverUrl: ''
};

const BOOLEAN_SETTINGS = new Set(['audioEnabled', 'musicEnabled', 'vibrationEnabled']);

function normalizeSettings(value = {}) {
    return {
        audioEnabled: value.audioEnabled !== false,
        musicEnabled: value.musicEnabled !== false,
        vibrationEnabled: value.vibrationEnabled !== false,
        serverUrl: typeof value.serverUrl === 'string' ? value.serverUrl : ''
    };
}

export function loadSettings() {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };

    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        return normalizeSettings(JSON.parse(raw));
    } catch (_) {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        } catch (_) {}
    }
    return normalized;
}

export function updateSetting(key, value) {
    const nextValue = BOOLEAN_SETTINGS.has(key) ? Boolean(value) : value;
    return saveSettings({
        ...loadSettings(),
        [key]: nextValue
    });
}
