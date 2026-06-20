const ATLAS_BASE = '/assets/app-ui/';
const MANIFEST_URL = `${ATLAS_BASE}manifest.json`;

const atlas = {
    image: null,
    manifest: null,
    promise: null
};

export function preloadAppAtlas() {
    loadAppAtlas().catch(() => {});
}

export async function loadAppAtlas() {
    if (atlas.manifest && atlas.image?.complete) return atlas;
    if (atlas.promise) return atlas.promise;

    atlas.promise = fetch(MANIFEST_URL)
        .then((response) => {
            if (!response.ok) throw new Error(`Failed to load app UI manifest: ${response.status}`);
            return response.json();
        })
        .then((manifest) => new Promise((resolve, reject) => {
            const image = new Image();
            image.decoding = 'async';
            image.onload = () => {
                atlas.manifest = manifest;
                atlas.image = image;
                resolve(atlas);
            };
            image.onerror = () => reject(new Error('Failed to load app UI atlas image'));
            image.src = `${ATLAS_BASE}${manifest.image}`;
        }))
        .finally(() => {
            atlas.promise = null;
        });

    return atlas.promise;
}

export function isAppAtlasReady() {
    return Boolean(atlas.manifest && atlas.image?.complete && atlas.image.naturalWidth);
}

export function getAppFrame(name) {
    return atlas.manifest?.frames?.[name] || null;
}

export function drawAppSprite(ctx, name, x, y, w, h, options = {}) {
    const frame = getAppFrame(name);
    if (!frame || !atlas.image?.complete || !atlas.image.naturalWidth) return false;
    ctx.save();
    if (options.alpha !== undefined) ctx.globalAlpha *= options.alpha;
    if (options.rotation) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(options.rotation);
        x = -w / 2;
        y = -h / 2;
    }
    ctx.drawImage(atlas.image, frame.x, frame.y, frame.w, frame.h, x, y, w, h);
    ctx.restore();
    return true;
}

export function drawAppPanel(ctx, name, x, y, w, h) {
    const frame = getAppFrame(name);
    if (!frame || !atlas.image?.complete || !atlas.image.naturalWidth) return false;
    if (!frame.slice) return drawAppSprite(ctx, name, x, y, w, h);

    const s = frame.slice;
    const sx = frame.x;
    const sy = frame.y;
    const sw = frame.w;
    const sh = frame.h;
    const left = Math.min(s.left, w / 2);
    const right = Math.min(s.right, w / 2);
    const top = Math.min(s.top, h / 2);
    const bottom = Math.min(s.bottom, h / 2);

    const draw = (srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH) => {
        if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return;
        ctx.drawImage(atlas.image, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
    };

    draw(sx, sy, s.left, s.top, x, y, left, top);
    draw(sx + s.left, sy, sw - s.left - s.right, s.top, x + left, y, w - left - right, top);
    draw(sx + sw - s.right, sy, s.right, s.top, x + w - right, y, right, top);

    draw(sx, sy + s.top, s.left, sh - s.top - s.bottom, x, y + top, left, h - top - bottom);
    draw(sx + s.left, sy + s.top, sw - s.left - s.right, sh - s.top - s.bottom, x + left, y + top, w - left - right, h - top - bottom);
    draw(sx + sw - s.right, sy + s.top, s.right, sh - s.top - s.bottom, x + w - right, y + top, right, h - top - bottom);

    draw(sx, sy + sh - s.bottom, s.left, s.bottom, x, y + h - bottom, left, bottom);
    draw(sx + s.left, sy + sh - s.bottom, sw - s.left - s.right, s.bottom, x + left, y + h - bottom, w - left - right, bottom);
    draw(sx + sw - s.right, sy + sh - s.bottom, s.right, s.bottom, x + w - right, y + h - bottom, right, bottom);
    return true;
}

export function drawAppButton(ctx, name, x, y, w, h) {
    return drawAppPanel(ctx, name, x, y, w, h) || drawAppSprite(ctx, name, x, y, w, h);
}

export function drawAppEffectFrame(ctx, animationName, progress, x, y, w, h, options = {}) {
    const frames = atlas.manifest?.animations?.[animationName];
    if (!frames || frames.length === 0) return false;
    const index = Math.max(0, Math.min(frames.length - 1, Math.floor(progress * frames.length)));
    return drawAppSprite(ctx, frames[index], x, y, w, h, options);
}

export function drawAppPiece(ctx, piece, x, y, highlight = false) {
    const radius = piece.radius || 14;
    const color = piece.game?.getPlayerColor?.(piece.player) || '';
    let sprite = 'puckBlue';
    if (piece.player === 'N') sprite = 'puckGold';
    else if (/d94a|c83a|red/i.test(color)) sprite = 'puckRed';

    const size = radius * (highlight ? 2.85 : 2.62);
    const ok = drawAppSprite(ctx, sprite, x - size / 2, y - size / 2, size, size);
    if (!ok) return false;

    if (highlight) {
        drawAppEffectFrame(ctx, 'scorePulse', (Date.now() % 900) / 900, x - radius * 2.1, y - radius * 2.1, radius * 4.2, radius * 4.2, { alpha: 0.34 });
    }
    if (piece.hitFlash > 0) {
        drawAppEffectFrame(ctx, 'collisionSpark', 1 - piece.hitFlash, x - radius * 2.4, y - radius * 2.4, radius * 4.8, radius * 4.8, { alpha: piece.hitFlash });
        piece.hitFlash = Math.max(0, piece.hitFlash - 0.12);
    }
    if (piece.launchFlash > 0) {
        drawAppEffectFrame(ctx, 'scorePulse', 1 - piece.launchFlash, x - radius * 2.2, y - radius * 2.2, radius * 4.4, radius * 4.4, { alpha: piece.launchFlash * 0.75 });
        piece.launchFlash = Math.max(0, piece.launchFlash - 0.08);
    }
    return true;
}

preloadAppAtlas();
