import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'public', 'assets', 'ui');
mkdirSync(outDir, { recursive: true });

const svg = (width, height, body) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${body}
</svg>
`;

function write(name, width, height, body) {
    writeFileSync(join(outDir, name), svg(width, height, body), 'utf8');
}

const defs = `
<defs>
  <filter id="softShadow" x="-30%" y="-30%" width="160%" height="170%">
    <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#143642" flood-opacity="0.18"/>
    <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#ffffff" flood-opacity="0.65"/>
  </filter>
  <filter id="popShadow" x="-30%" y="-30%" width="160%" height="170%">
    <feDropShadow dx="0" dy="10" stdDeviation="7" flood-color="#143642" flood-opacity="0.22"/>
  </filter>
  <linearGradient id="glassPanel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
    <stop offset="0.55" stop-color="#f7ffff" stop-opacity="0.96"/>
    <stop offset="1" stop-color="#edfff3" stop-opacity="0.96"/>
  </linearGradient>
  <linearGradient id="panelEdge" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.45" stop-color="#b8f1ff"/>
    <stop offset="0.68" stop-color="#fff0a6"/>
    <stop offset="1" stop-color="#9ff0b7"/>
  </linearGradient>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#74dcff"/>
    <stop offset="0.42" stop-color="#fff2a6"/>
    <stop offset="0.72" stop-color="#a4ef9e"/>
    <stop offset="1" stop-color="#58d88e"/>
  </linearGradient>
</defs>`;

write('screen-bg.svg', 450, 960, `${defs}
<rect width="450" height="960" fill="url(#bg)"/>
<path d="M0 0 H450 V150 C360 126 326 170 244 142 C164 114 96 176 0 142 Z" fill="#ffffff" opacity="0.1"/>
<g opacity="0.3" fill="#fff">
  <circle cx="28" cy="88" r="26"/>
  <circle cx="182" cy="74" r="23"/>
  <circle cx="326" cy="92" r="35"/>
  <circle cx="430" cy="204" r="32"/>
  <circle cx="54" cy="238" r="26"/>
  <circle cx="118" cy="438" r="22"/>
  <rect x="-18" y="548" width="46" height="116" rx="23"/>
  <rect x="70" y="672" width="42" height="116" rx="21"/>
  <rect x="328" y="760" width="48" height="92" rx="24"/>
</g>
<path d="M0 724 C78 668 146 716 218 682 C304 638 374 674 450 616 L450 960 L0 960 Z" fill="#35b779" opacity="0.2"/>
<path d="M0 798 C72 736 146 784 226 742 C322 692 374 742 450 686 L450 960 L0 960 Z" fill="#ffffff" opacity="0.12"/>`);

write('topbar.svg', 422, 58, `${defs}
<rect x="2" y="3" width="418" height="53" rx="20" fill="#8ed6ec" opacity="0.25"/>
<rect x="1.5" y="1.5" width="419" height="53" rx="19" fill="url(#glassPanel)" filter="url(#softShadow)" stroke="url(#panelEdge)" stroke-width="3"/>
<rect x="8" y="8" width="406" height="40" rx="15" fill="#ffffff" opacity="0.32"/>
<path d="M20 18 C104 7 164 17 224 15 C302 12 356 7 402 18" fill="none" stroke="#fff" stroke-width="3" opacity="0.55"/>`);

write('panel.svg', 402, 220, `${defs}
<rect x="4" y="8" width="394" height="208" rx="22" fill="#7bdde3" opacity="0.18"/>
<rect x="2" y="2" width="398" height="214" rx="22" fill="url(#glassPanel)" filter="url(#softShadow)" stroke="url(#panelEdge)" stroke-width="4"/>
<rect x="16" y="16" width="370" height="172" rx="16" fill="#ffffff" opacity="0.18"/>
<path d="M28 28 C106 14 176 28 244 22 C306 16 344 16 374 28" fill="none" stroke="#fff" stroke-width="4" opacity="0.5"/>`);

write('modal.svg', 402, 330, `${defs}
<rect x="4" y="8" width="394" height="318" rx="28" fill="#6bd4df" opacity="0.18"/>
<rect x="2" y="2" width="398" height="324" rx="28" fill="url(#glassPanel)" filter="url(#softShadow)" stroke="url(#panelEdge)" stroke-width="4"/>
<path d="M28 100 H374" stroke="#8fd5d7" stroke-width="3" stroke-dasharray="5 7" opacity="0.72"/>
<path d="M28 176 H374" stroke="#8fd5d7" stroke-width="3" stroke-dasharray="5 7" opacity="0.72"/>
<path d="M28 252 H374" stroke="#8fd5d7" stroke-width="3" stroke-dasharray="5 7" opacity="0.72"/>
<path d="M30 32 C106 18 176 32 244 26 C306 20 344 20 374 32" fill="none" stroke="#fff" stroke-width="4" opacity="0.55"/>`);

write('player-card.svg', 334, 60, `${defs}
<rect x="3" y="5" width="328" height="52" rx="18" fill="#7bdde3" opacity="0.18"/>
<rect x="1.5" y="1.5" width="331" height="55" rx="18" fill="url(#glassPanel)" filter="url(#softShadow)" stroke="url(#panelEdge)" stroke-width="3"/>
<rect x="12" y="10" width="36" height="40" rx="12" fill="#e9fbff" opacity="0.86"/>
<path d="M62 13 C126 7 182 14 238 10 C282 7 304 9 318 14" fill="none" stroke="#fff" stroke-width="3" opacity="0.45"/>`);

write('coin-pill.svg', 196, 50, `${defs}
<linearGradient id="coinBg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff8c9"/>
  <stop offset="1" stop-color="#ffd961"/>
</linearGradient>
<rect x="2" y="2" width="192" height="46" rx="23" fill="url(#coinBg)" filter="url(#softShadow)" stroke="#ffffff" stroke-width="4"/>
<circle cx="31" cy="25" r="16" fill="#f6c945" stroke="#fff" stroke-width="4"/>
<circle cx="31" cy="25" r="10" fill="#ff9f43"/>
<circle cx="26" cy="20" r="4" fill="#fff6c7" opacity="0.9"/>`);

const button = (name, top, bottom) => write(name, 390, 68, `${defs}
<linearGradient id="btn" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${top}"/>
  <stop offset="1" stop-color="${bottom}"/>
</linearGradient>
<rect x="5" y="9" width="380" height="55" rx="17" fill="#143642" opacity="0.18"/>
<rect x="2" y="2" width="386" height="60" rx="18" fill="url(#btn)" filter="url(#popShadow)" stroke="#fff" stroke-opacity="0.88" stroke-width="4"/>
<path d="M24 15 C94 5 140 15 194 13 C270 10 306 5 366 17" fill="none" stroke="#fff" stroke-opacity="0.42" stroke-width="4"/>
<path d="M16 54 H374" stroke="#143642" stroke-opacity="0.1" stroke-width="4" stroke-linecap="round"/>`);

button('button-orange.svg', '#ffb342', '#ff7a18');
button('button-blue.svg', '#32a8ed', '#1977d4');
button('button-green.svg', '#49d987', '#1aa95a');
button('button-purple.svg', '#8f79ec', '#6549c8');
button('button-gray.svg', '#a9b4a2', '#7f8b79');
button('button-red.svg', '#ff7d78', '#e14444');

write('board-base.svg', 356, 396, `
<defs>
  <filter id="boardShadow" x="-20%" y="-20%" width="140%" height="150%">
    <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#190f08" flood-opacity="0.42"/>
  </filter>
  <linearGradient id="outer" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7a5831"/>
    <stop offset="0.46" stop-color="#332314"/>
    <stop offset="1" stop-color="#a2753d"/>
  </linearGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2f1d10"/>
    <stop offset="0.48" stop-color="#402716"/>
    <stop offset="1" stop-color="#24170d"/>
  </linearGradient>
</defs>
<rect x="0" y="6" width="356" height="384" rx="14" fill="#190f08" opacity="0.18"/>
<rect x="0" y="0" width="356" height="396" rx="13" fill="url(#outer)" filter="url(#boardShadow)" stroke="#c49b59" stroke-width="4"/>
<rect x="10" y="10" width="336" height="376" rx="9" fill="url(#floor)"/>
<path d="M10 10 H346 V102 H10 Z" fill="#000000" opacity="0.26"/>
<path d="M10 294 H346 V386 H10 Z" fill="#000000" opacity="0.28"/>
<g opacity="0.12" stroke="#f0c27a" stroke-width="1">
  <path d="M44 18 C52 118 37 272 46 378"/><path d="M82 18 C76 128 91 264 84 378"/>
  <path d="M120 18 C129 118 113 272 122 378"/><path d="M158 18 C151 128 168 264 160 378"/>
  <path d="M196 18 C205 118 188 272 198 378"/><path d="M234 18 C228 128 243 264 236 378"/>
  <path d="M272 18 C281 118 265 272 274 378"/><path d="M310 18 C303 128 318 264 312 378"/>
</g>
<rect x="18" y="18" width="320" height="360" rx="8" fill="none" stroke="#ffecb8" stroke-opacity="0.36" stroke-width="1.5"/>
<rect x="11" y="11" width="334" height="374" rx="8" fill="none" stroke="#000000" stroke-opacity="0.34" stroke-width="1"/>`);

write('spinner-ring.svg', 180, 180, `
<defs>
  <radialGradient id="disc" cx="35%" cy="30%" r="70%">
    <stop offset="0" stop-color="#9ee8ff"/>
    <stop offset="0.55" stop-color="#2d9cdb"/>
    <stop offset="1" stop-color="#1262c4"/>
  </radialGradient>
</defs>
<circle cx="90" cy="90" r="78" fill="none" stroke="#fff" stroke-width="3" opacity="0.65"/>
<circle cx="90" cy="90" r="56" fill="none" stroke="#2d9cdb" stroke-width="3" opacity="0.24"/>
<circle cx="90" cy="90" r="42" fill="none" stroke="#2d9cdb" stroke-width="3" opacity="0.32"/>
<circle cx="90" cy="90" r="28" fill="url(#disc)" stroke="#fff" stroke-width="4"/>
<path d="M90 77 L95 87 L106 88 L98 96 L100 108 L90 102 L80 108 L82 96 L74 88 L85 87 Z" fill="#fff" opacity="0.65"/>`);

const manifest = {
    generatedBy: 'scripts/generate-ui-assets.mjs',
    files: [
        'screen-bg.svg',
        'topbar.svg',
        'panel.svg',
        'modal.svg',
        'player-card.svg',
        'coin-pill.svg',
        'button-orange.svg',
        'button-blue.svg',
        'button-green.svg',
        'button-purple.svg',
        'button-gray.svg',
        'button-red.svg',
        'board-base.svg',
        'spinner-ring.svg'
    ]
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
