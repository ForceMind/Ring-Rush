import {
    BOARD_X,
    BOARD_Y,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    CENTER_X,
    LAUNCH_LANE_WIDTH,
    LAUNCH_ZONE_HEIGHT,
    TOP_LAUNCH_LANE_Y,
    BOTTOM_LAUNCH_LANE_Y
} from '../src-online/constants.js';
import { Board } from '../src-online/board.js';
import { drawAppPanel, drawAppSprite } from './app-assets.js';

export class AppBoard extends Board {
    drawArenaBase(ctx, isTop = false) {
        if (drawAppSprite(ctx, 'boardSkin', BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT)) {
            return;
        }
        super.drawArenaBase(ctx, isTop);
    }

    drawLaunchLane(ctx, y, rgb, stroke, isTop) {
        const x = CENTER_X - LAUNCH_LANE_WIDTH / 2;
        const w = LAUNCH_LANE_WIDTH;
        const h = LAUNCH_ZONE_HEIGHT;

        ctx.save();
        if (!drawAppPanel(ctx, 'launchLane', x, y, w, h)) {
            super.drawLaunchLane(ctx, y, rgb, stroke, isTop);
            ctx.restore();
            return;
        }

        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.84;
        ctx.beginPath();
        ctx.roundRect(x + 6, y + 6, w - 12, h - 12, 10);
        ctx.stroke();

        ctx.globalAlpha = 0.58;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 5; i++) {
            const dotX = x + 34 + i * 33;
            ctx.beginPath();
            ctx.arc(dotX, y + h / 2, 2.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    drawLaunchZones(ctx, isTop = false) {
        let topStroke = this.game.getPlayerColor('B');
        let bottomStroke = this.game.getPlayerColor('A');
        let topColor = this.hexToRgbStr(topStroke);
        let bottomColor = this.hexToRgbStr(bottomStroke);

        if (isTop) {
            [topColor, bottomColor] = [bottomColor, topColor];
            [topStroke, bottomStroke] = [bottomStroke, topStroke];
        }

        this.drawLaunchLane(ctx, TOP_LAUNCH_LANE_Y, topColor, topStroke, true);
        this.drawLaunchLane(ctx, BOTTOM_LAUNCH_LANE_Y, bottomColor, bottomStroke, false);
    }
}
