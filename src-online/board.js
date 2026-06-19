import {
    SCORING_ZONES,
    CENTER_X,
    CENTER_Y,
    BOARD_X,
    BOARD_Y,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    LAUNCH_ZONE_HEIGHT,
    LAUNCH_LANE_WIDTH,
    TOP_LAUNCH_LANE_Y,
    BOTTOM_LAUNCH_LANE_Y
} from './constants.js';

const SURFACE_INSET = 10;
const SURFACE_RADIUS = 10;
const INNER_HIGHLIGHT_INSET = 18;

export class Board {
    constructor(game) {
        this.game = game;
        this.hexagonVertices = this.generatePolygon(6, SCORING_ZONES.hexagon.radius);
        this.pentagonVertices = this.generatePolygon(5, SCORING_ZONES.pentagon.radius);
        this.squareVertices = this.generateSquareAligned(SCORING_ZONES.square.radius);
        this.pulsePhase = 0;
    }

    generatePolygon(sides, radius) {
        const vertices = [];
        const angleStep = (Math.PI * 2) / sides;
        const startAngle = -Math.PI / 2;
        for (let i = 0; i < sides; i++) {
            const angle = startAngle + i * angleStep;
            vertices.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        }
        return vertices;
    }

    generateSquareAligned(radius) {
        return [
            { x: -radius, y: -radius },
            { x: radius, y: -radius },
            { x: radius, y: radius },
            { x: -radius, y: radius }
        ];
    }

    calculateScore(piece) {
        if (!piece || piece.isDiscarded || piece.player === 'N') return 0;
        const dx = piece.x - CENTER_X;
        const dy = piece.y - CENTER_Y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= SCORING_ZONES.center.radius) return SCORING_ZONES.center.score;
        if (this.isInsidePolygon(dx, dy, this.hexagonVertices)) return SCORING_ZONES.hexagon.score;
        if (distance <= SCORING_ZONES.pentagon.radius) return SCORING_ZONES.pentagon.score;
        if (this.isInsidePolygon(dx, dy, this.squareVertices)) return SCORING_ZONES.square.score;
        return 0;
    }

    isInsidePolygon(px, py, vertices) {
        let inside = false;
        const n = vertices.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = vertices[i].x;
            const yi = vertices[i].y;
            const xj = vertices[j].x;
            const yj = vertices[j].y;
            if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    draw(ctx, isTop = false) {
        const flipX = (x) => (isTop ? BOARD_X + BOARD_WIDTH - (x - BOARD_X) : x);
        const flipY = (y) => (isTop ? BOARD_Y + BOARD_HEIGHT - (y - BOARD_Y) : y);

        this.pulsePhase += 0.02;

        this.drawArenaBase(ctx, isTop);
        this.drawScoringZones(ctx, flipX, flipY);
        this.drawCenterGuides(ctx, flipX, flipY);
        this.drawLaunchZones(ctx, isTop);
    }

    drawArenaBase(ctx, isTop = false) {
        let topStroke = this.game.getPlayerColor('B');
        let bottomStroke = this.game.getPlayerColor('A');
        if (isTop) {
            const tempStroke = topStroke;
            topStroke = bottomStroke;
            bottomStroke = tempStroke;
        }
        const topRgb = this.hexToRgbStr(topStroke);
        const bottomRgb = this.hexToRgbStr(bottomStroke);

        ctx.save();
        ctx.shadowColor = 'rgba(45, 120, 148, 0.26)';
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 9;
        const teamRim = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X + BOARD_WIDTH, BOARD_Y + BOARD_HEIGHT);
        teamRim.addColorStop(0, `rgba(${topRgb}, 0.95)`);
        teamRim.addColorStop(0.5, 'rgba(255, 220, 92, 0.95)');
        teamRim.addColorStop(1, `rgba(${bottomRgb}, 0.95)`);
        ctx.fillStyle = teamRim;
        ctx.beginPath();
        ctx.roundRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, 18);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.shadowColor = 'rgba(255, 255, 255, 0.62)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
        ctx.beginPath();
        ctx.roundRect(BOARD_X + 8, BOARD_Y + 8, BOARD_WIDTH - 16, BOARD_HEIGHT - 16, 14);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        const floor = ctx.createLinearGradient(
            BOARD_X,
            BOARD_Y + SURFACE_INSET,
            BOARD_X,
            BOARD_Y + BOARD_HEIGHT - SURFACE_INSET
        );
        floor.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        floor.addColorStop(0.48, 'rgba(225, 245, 255, 0.74)');
        floor.addColorStop(1, 'rgba(236, 255, 246, 0.82)');
        ctx.fillStyle = floor;
        ctx.beginPath();
        ctx.roundRect(
            BOARD_X + SURFACE_INSET,
            BOARD_Y + SURFACE_INSET,
            BOARD_WIDTH - SURFACE_INSET * 2,
            BOARD_HEIGHT - SURFACE_INSET * 2,
            SURFACE_RADIUS
        );
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(
            BOARD_X + SURFACE_INSET,
            BOARD_Y + SURFACE_INSET,
            BOARD_WIDTH - SURFACE_INSET * 2,
            BOARD_HEIGHT - SURFACE_INSET * 2,
            SURFACE_RADIUS
        );
        ctx.clip();
        this.drawArenaPattern(ctx);
        ctx.restore();

        this.drawGlassOverlay(ctx);

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(
            BOARD_X + INNER_HIGHLIGHT_INSET,
            BOARD_Y + INNER_HIGHLIGHT_INSET,
            BOARD_WIDTH - INNER_HIGHLIGHT_INSET * 2,
            BOARD_HEIGHT - INNER_HIGHLIGHT_INSET * 2,
            8
        );
        ctx.stroke();

        ctx.strokeStyle = 'rgba(20, 54, 66, 0.16)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(
            BOARD_X + SURFACE_INSET,
            BOARD_Y + SURFACE_INSET,
            BOARD_WIDTH - SURFACE_INSET * 2,
            BOARD_HEIGHT - SURFACE_INSET * 2,
            SURFACE_RADIUS
        );
        ctx.stroke();
        ctx.restore();
    }

    drawGlassOverlay(ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(
            BOARD_X + SURFACE_INSET,
            BOARD_Y + SURFACE_INSET,
            BOARD_WIDTH - SURFACE_INSET * 2,
            BOARD_HEIGHT - SURFACE_INSET * 2,
            SURFACE_RADIUS
        );
        ctx.clip();

        const sheen = ctx.createLinearGradient(
            BOARD_X,
            BOARD_Y + SURFACE_INSET,
            BOARD_X,
            BOARD_Y + BOARD_HEIGHT - SURFACE_INSET
        );
        sheen.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        sheen.addColorStop(0.26, 'rgba(255, 255, 255, 0.1)');
        sheen.addColorStop(0.62, 'rgba(111, 207, 255, 0.13)');
        sheen.addColorStop(1, 'rgba(255, 255, 255, 0.22)');
        ctx.fillStyle = sheen;
        ctx.fillRect(
            BOARD_X + SURFACE_INSET,
            BOARD_Y + SURFACE_INSET,
            BOARD_WIDTH - SURFACE_INSET * 2,
            BOARD_HEIGHT - SURFACE_INSET * 2
        );

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.46)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(BOARD_X + 30, BOARD_Y + 34);
        ctx.bezierCurveTo(BOARD_X + 118, BOARD_Y + 22, BOARD_X + BOARD_WIDTH - 118, BOARD_Y + 25, BOARD_X + BOARD_WIDTH - 30, BOARD_Y + 34);
        ctx.stroke();
        ctx.restore();
    }

    drawArenaPattern(ctx) {
        ctx.save();
        ctx.globalAlpha = 0.13;
        for (let x = BOARD_X + 34; x < BOARD_X + BOARD_WIDTH - 24; x += 38) {
            const sway = Math.sin((x - BOARD_X) * 0.055) * 6;
            ctx.strokeStyle = x % 76 === 0 ? '#ffffff' : '#6fcfff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, BOARD_Y + 24);
            ctx.bezierCurveTo(x + sway, BOARD_Y + 124, x - sway, BOARD_Y + BOARD_HEIGHT - 124, x + 2, BOARD_Y + BOARD_HEIGHT - 24);
            ctx.stroke();
        }
        ctx.restore();

        const topShade = ctx.createLinearGradient(BOARD_X, BOARD_Y + SURFACE_INSET, BOARD_X, BOARD_Y + 102);
        topShade.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        topShade.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = topShade;
        ctx.fillRect(BOARD_X + SURFACE_INSET, BOARD_Y + SURFACE_INSET, BOARD_WIDTH - SURFACE_INSET * 2, 92);

        const bottomShade = ctx.createLinearGradient(
            BOARD_X,
            BOARD_Y + BOARD_HEIGHT - 102,
            BOARD_X,
            BOARD_Y + BOARD_HEIGHT - SURFACE_INSET
        );
        bottomShade.addColorStop(0, 'rgba(255, 255, 255, 0)');
        bottomShade.addColorStop(1, 'rgba(65, 197, 155, 0.14)');
        ctx.fillStyle = bottomShade;
        ctx.fillRect(
            BOARD_X + SURFACE_INSET,
            BOARD_Y + BOARD_HEIGHT - 110,
            BOARD_WIDTH - SURFACE_INSET * 2,
            92
        );
    }

    drawCenterGuides(ctx, flipX, flipY) {
        ctx.save();
        ctx.strokeStyle = 'rgba(20, 54, 66, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(flipX(CENTER_X), BOARD_Y + SURFACE_INSET + 4);
        ctx.lineTo(flipX(CENTER_X), BOARD_Y + BOARD_HEIGHT - SURFACE_INSET - 4);
        ctx.moveTo(BOARD_X + SURFACE_INSET + 4, flipY(CENTER_Y));
        ctx.lineTo(BOARD_X + BOARD_WIDTH - SURFACE_INSET - 4, flipY(CENTER_Y));
        ctx.stroke();
        ctx.restore();
    }

    drawScoringZones(ctx, flipX, flipY) {
        const cx = flipX(CENTER_X);
        const cy = flipY(CENTER_Y);

        ctx.save();
        ctx.shadowColor = 'rgba(47, 111, 139, 0.18)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;

        const square = this.squareVertices.map((v) => ({
            x: flipX(CENTER_X + v.x),
            y: flipY(CENTER_Y + v.y)
        }));
        this.drawPolygonAt(ctx, square, 'rgba(149, 128, 244, 0.24)', '#8068f0', 3);

        ctx.beginPath();
        ctx.arc(cx, cy, SCORING_ZONES.pentagon.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(111, 187, 255, 0.26)';
        ctx.fill();
        ctx.strokeStyle = '#35a9e8';
        ctx.lineWidth = 3;
        ctx.stroke();

        const hexagon = this.hexagonVertices.map((v) => ({
            x: flipX(CENTER_X + v.x),
            y: flipY(CENTER_Y + v.y)
        }));
        this.drawPolygonAt(ctx, hexagon, 'rgba(89, 218, 151, 0.44)', '#31bd78', 4);

        ctx.shadowColor = '#f6c945';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 0;
        ctx.beginPath();
        ctx.arc(cx, cy, SCORING_ZONES.center.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 216, 24, 0.86)';
        ctx.fill();
        ctx.strokeStyle = '#fff5ad';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.82)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = 'rgba(20, 54, 66, 0.72)';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('5', cx, cy);
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = 'rgba(20, 54, 66, 0.68)';
        ctx.fillText('4', cx, cy - SCORING_ZONES.hexagon.radius + 15);
        ctx.fillText('3', cx, cy - SCORING_ZONES.pentagon.radius + 15);
        ctx.fillText('2', cx, cy - SCORING_ZONES.square.radius + 18);
        ctx.restore();
    }

    drawPolygonAt(ctx, vertices, fillColor, strokeColor, lineWidth = 1.5) {
        if (vertices.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        ctx.restore();
    }

    drawLaunchZones(ctx, isTop = false) {
        let topStroke = this.game.getPlayerColor('B');
        let bottomStroke = this.game.getPlayerColor('A');

        let topColor = this.hexToRgbStr(topStroke);
        let bottomColor = this.hexToRgbStr(bottomStroke);

        if (isTop) {
            const tempColor = topColor;
            topColor = bottomColor;
            bottomColor = tempColor;

            const tempStroke = topStroke;
            topStroke = bottomStroke;
            bottomStroke = tempStroke;
        }

        this.drawLaunchLane(ctx, TOP_LAUNCH_LANE_Y, topColor, topStroke, true);
        this.drawLaunchLane(ctx, BOTTOM_LAUNCH_LANE_Y, bottomColor, bottomStroke, false);
    }

    hexToRgbStr(hex) {
        const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#47707c';
        return `${parseInt(normalized.slice(1, 3), 16)}, ${parseInt(normalized.slice(3, 5), 16)}, ${parseInt(normalized.slice(5, 7), 16)}`;
    }

    drawLaunchLane(ctx, y, rgb, stroke, isTop) {
        const x = CENTER_X - LAUNCH_LANE_WIDTH / 2;
        const w = LAUNCH_LANE_WIDTH;
        const h = LAUNCH_ZONE_HEIGHT;
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, `rgba(${rgb}, ${isTop ? 0.22 : 0.08})`);
        gradient.addColorStop(0.5, `rgba(${rgb}, 0.22)`);
        gradient.addColorStop(1, `rgba(${rgb}, ${isTop ? 0.08 : 0.26})`);

        ctx.save();
        ctx.shadowColor = `rgba(${rgb}, 0.34)`;
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = isTop ? 2 : 4;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 10);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.48)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x + 7, y + 7, w - 14, h - 14, 8);
        ctx.stroke();

        ctx.globalAlpha = 0.56;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 5; i++) {
            const dotX = x + 34 + i * 33;
            const dotY = y + h / 2;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}
