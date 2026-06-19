const ASSET_BASE = '/assets/ui/';

const ASSETS = {
    background: 'screen-bg.svg',
    topbar: 'topbar.svg',
    panel: 'panel.svg',
    modal: 'modal.svg',
    playerCard: 'player-card.svg',
    coinPill: 'coin-pill.svg',
    buttonOrange: 'button-orange.svg',
    buttonBlue: 'button-blue.svg',
    buttonGreen: 'button-green.svg',
    buttonPurple: 'button-purple.svg',
    buttonGray: 'button-gray.svg',
    buttonRed: 'button-red.svg',
    boardBase: 'board-base.svg',
    spinnerRing: 'spinner-ring.svg'
};

const cache = new Map();

export function preloadUIAssets() {
    if (typeof Image === 'undefined') return;
    for (const [name, file] of Object.entries(ASSETS)) {
        if (cache.has(name)) continue;
        const image = new Image();
        image.decoding = 'async';
        image.src = `${ASSET_BASE}${file}`;
        cache.set(name, image);
    }
}

export function drawUIAsset(ctx, name, x, y, w, h) {
    const image = cache.get(name);
    if (!image || !image.complete || !image.naturalWidth) return false;
    ctx.drawImage(image, x, y, w, h);
    return true;
}

export function getButtonAsset(color) {
    const normalized = String(color || '').toLowerCase();
    if (normalized.includes('ff8a') || normalized.includes('ff7') || normalized.includes('orange')) return 'buttonOrange';
    if (normalized.includes('35b') || normalized.includes('49d') || normalized.includes('green')) return 'buttonGreen';
    if (normalized.includes('7c') || normalized.includes('68d') || normalized.includes('purple')) return 'buttonPurple';
    if (normalized.includes('d948') || normalized.includes('ef53') || normalized.includes('red')) return 'buttonRed';
    if (normalized.includes('767') || normalized.includes('gray') || normalized.includes('grey')) return 'buttonGray';
    return 'buttonBlue';
}

preloadUIAssets();
