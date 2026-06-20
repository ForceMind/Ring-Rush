import { CENTER_X } from '../src-online/constants.js';
import { DiceManager } from '../src-online/dice.js';
import { drawAppButton, drawAppPanel, drawAppSprite } from './app-assets.js';

export class AppDiceManager extends DiceManager {
    drawDicePanel(ctx, x, y, w, h) {
        if (drawAppPanel(ctx, 'modal', x, y, w, h)) return;
        super.drawDicePanel(ctx, x, y, w, h);
    }

    drawRollButton(ctx, x, y, w, h, label) {
        if (!drawAppButton(ctx, 'buttonGreen', x, y, w, h)) {
            super.drawRollButton(ctx, x, y, w, h, label);
            return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + w / 2, y + h / 2 + 1, w - 22);
    }

    drawDie(ctx, x, y, value, color, label) {
        const size = 82;
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = '900 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y - size / 2 - 22, 130);

        if (!drawAppPanel(ctx, 'panel', x - size / 2, y - size / 2, size, size)) {
            super.drawDie(ctx, x, y, value, color, label);
            ctx.restore();
            return;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(x - size / 2 + 5, y - size / 2 + 5, size - 10, size - 10, 18);
        ctx.stroke();

        if (value === null) {
            ctx.fillStyle = color;
            ctx.font = '900 38px sans-serif';
            ctx.fillText('?', x, y + 3);
            ctx.restore();
            return;
        }

        ctx.fillStyle = color;
        const dotRadius = 8;
        const dotOffset = size * 0.28;
        const dots = {
            1: [[0, 0]],
            2: [[-dotOffset, -dotOffset], [dotOffset, dotOffset]],
            3: [[-dotOffset, -dotOffset], [0, 0], [dotOffset, dotOffset]],
            4: [[-dotOffset, -dotOffset], [dotOffset, -dotOffset], [-dotOffset, dotOffset], [dotOffset, dotOffset]],
            5: [[-dotOffset, -dotOffset], [dotOffset, -dotOffset], [0, 0], [-dotOffset, dotOffset], [dotOffset, dotOffset]],
            6: [[-dotOffset, -dotOffset], [dotOffset, -dotOffset], [-dotOffset, 0], [dotOffset, 0], [-dotOffset, dotOffset], [dotOffset, dotOffset]]
        };
        (dots[value] || []).forEach(([dx, dy]) => {
            ctx.beginPath();
            ctx.arc(x + dx, y + dy, dotRadius, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    drawNormalLayout(ctx, myVal, opVal, myColor, opColor, myLabel, opLabel) {
        super.drawNormalLayout(ctx, myVal, opVal, myColor, opColor, myLabel, opLabel);
        if (!this.results && !this.tieResult) {
            drawAppSprite(ctx, 'robot', CENTER_X - 34, 254, 68, 68, { alpha: 0.22 });
        }
    }
}
