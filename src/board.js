/**
 * @file board.js
 * @description 棋盘模块 - 绘制棋盘、得分区域和发射区域，计算棋子得分
 * Ring Rush - 弹棋
 */

import {
    SCORING_ZONES,
    CENTER_X,
    CENTER_Y,
    BOARD_X,
    BOARD_Y,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    LAUNCH_ZONE_WIDTH,
    LAUNCH_ZONE_HEIGHT
} from './constants.js';

/**
 * 棋盘类，负责棋盘和得分区域的绘制与计分逻辑
 */
export class Board {
    constructor(game) {
        this.game = game;
        this.hexagonVertices = this.generatePolygon(6, SCORING_ZONES.hexagon.radius);
        this.pentagonVertices = this.generatePolygon(5, SCORING_ZONES.pentagon.radius);
        this.squareVertices = this.generateSquareAligned(SCORING_ZONES.square.radius);
        this.pulsePhase = 0;
    }

    /**
     * 生成正多边形顶点（相对于中心的偏移量）
     * @param {number} sides - 边数
     * @param {number} radius - 外接圆半径
     * @returns {Array<{x: number, y: number}>}
     */
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

    /**
     * 生成轴对齐正方形的顶点
     * @param {number} radius - 半边长
     * @returns {Array<{x: number, y: number}>}
     */
    generateSquareAligned(radius) {
        return [
            { x: -radius, y: -radius },
            { x: radius, y: -radius },
            { x: radius, y: radius },
            { x: -radius, y: radius }
        ];
    }

    /**
     * 计算棋子在哪个得分区域内
     * @param {Piece} piece
     * @returns {number} 得分值 (0, 2, 3, 4, 5)
     */
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

    /**
     * 射线法判断点是否在多边形内部
     * @param {number} px - 相对于中心的X坐标
     * @param {number} py - 相对于中心的Y坐标
     * @param {Array<{x: number, y: number}>} vertices
     * @returns {boolean}
     */
    isInsidePolygon(px, py, vertices) {
        let inside = false;
        const n = vertices.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;
            if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * 绘制棋盘（统一方法，支持正常和翻转视角）
     * - isTop = false: 正常绘制（底部视角）
     * - isTop = true:  翻转坐标绘制（顶部视角，文字始终正向）
     * @param {CanvasRenderingContext2D} ctx
     * @param {boolean} [isTop=false] - 是否为顶部视角（翻转坐标）
     */
    draw(ctx, isTop = false) {
        const flipX = (x) => isTop ? BOARD_X + BOARD_WIDTH - (x - BOARD_X) : x;
        const flipY = (y) => isTop ? BOARD_Y + BOARD_HEIGHT - (y - BOARD_Y) : y;

        this.pulsePhase += 0.02;

        // 棋盘背景
        const gradient = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X, BOARD_Y + BOARD_HEIGHT);
        gradient.addColorStop(0, '#2d1f14');
        gradient.addColorStop(0.5, '#3d2b1a');
        gradient.addColorStop(1, '#2d1f14');
        ctx.fillStyle = gradient;
        ctx.strokeStyle = '#8b7355';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, 12);
        ctx.fill();
        ctx.stroke();

        // 内边框
        ctx.strokeStyle = 'rgba(139, 115, 85, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(BOARD_X + 8, BOARD_Y + 8, BOARD_WIDTH - 16, BOARD_HEIGHT - 16, 8);
        ctx.stroke();

        // 得分区域
        this.drawScoringZones(ctx, flipX, flipY);

        // 中心十字线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(flipX(CENTER_X), BOARD_Y);
        ctx.lineTo(flipX(CENTER_X), BOARD_Y + BOARD_HEIGHT);
        ctx.moveTo(BOARD_X, flipY(CENTER_Y));
        ctx.lineTo(BOARD_X + BOARD_WIDTH, flipY(CENTER_Y));
        ctx.stroke();
        ctx.setLineDash([]);

        // 发射区
        this.drawLaunchZones(ctx, isTop);
    }

    /**
     * 绘制得分区域（支持坐标翻转）
     * @param {CanvasRenderingContext2D} ctx
     * @param {function} flipX - X坐标变换函数
     * @param {function} flipY - Y坐标变换函数
     */
    drawScoringZones(ctx, flipX, flipY) {
        const cx = flipX(CENTER_X);
        const cy = flipY(CENTER_Y);

        // 正方形（最外层）
        const sq = this.squareVertices.map(v => ({
            x: flipX(CENTER_X + v.x),
            y: flipY(CENTER_Y + v.y)
        }));
        this.drawPolygonAt(ctx, sq, SCORING_ZONES.square.color, '#9370db');

        // 五边形改为圆形（第三环）
        ctx.beginPath();
        ctx.arc(cx, cy, SCORING_ZONES.pentagon.radius, 0, Math.PI * 2);
        ctx.fillStyle = SCORING_ZONES.pentagon.color;
        ctx.fill();
        ctx.strokeStyle = '#6495ed';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 六边形（第二环）
        const hex = this.hexagonVertices.map(v => ({
            x: flipX(CENTER_X + v.x),
            y: flipY(CENTER_Y + v.y)
        }));
        this.drawPolygonAt(ctx, hex, SCORING_ZONES.hexagon.color, '#3cb371');

        // 中心圆（带发光）
        ctx.save();
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, SCORING_ZONES.center.radius, 0, Math.PI * 2);
        ctx.fillStyle = SCORING_ZONES.center.color;
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // 分数标注（文字始终正向）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('5', cx, cy);
        ctx.fillText('4', cx, cy - SCORING_ZONES.hexagon.radius + 15);
        ctx.fillText('3', cx, cy - SCORING_ZONES.pentagon.radius + 15);
        ctx.fillText('2', cx, cy - SCORING_ZONES.square.radius + 18);
    }

    /**
     * 在绝对坐标处绘制多边形
     * @param {CanvasRenderingContext2D} ctx
     * @param {Array<{x: number, y: number}>} vertices - 绝对坐标顶点
     * @param {string} fillColor
     * @param {string} strokeColor
     */
    drawPolygonAt(ctx, vertices, fillColor, strokeColor) {
        if (vertices.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    /**
     * 绘制发射区域（顶部和底部）
     * @param {CanvasRenderingContext2D} ctx
     */
    drawLaunchZones(ctx, isTop = false) {
        let topStroke = this.game.getPlayerColor('B');
        let bottomStroke = this.game.getPlayerColor('A');

        const hexToRgbStr = (hex) => {
            return `${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)}`;
        };

        let topColor = hexToRgbStr(topStroke);
        let bottomColor = hexToRgbStr(bottomStroke);

        if (isTop) {
            // If the user is B (isTop), they are playing from the bottom of the screen.
            // So the bottom of the screen should be B's color (topColor), and top should be A's color (bottomColor).
            const tempColor = topColor;
            topColor = bottomColor;
            bottomColor = tempColor;

            const tempStroke = topStroke;
            topStroke = bottomStroke;
            bottomStroke = tempStroke;
        }

        // 对手发射区（顶部）
        const topZoneY = BOARD_Y - LAUNCH_ZONE_HEIGHT - 25;
        const topGradient = ctx.createLinearGradient(CENTER_X - LAUNCH_ZONE_WIDTH * 2, topZoneY, CENTER_X + LAUNCH_ZONE_WIDTH * 2, topZoneY);
        topGradient.addColorStop(0, `rgba(${topColor}, 0.1)`);
        topGradient.addColorStop(0.5, `rgba(${topColor}, 0.25)`);
        topGradient.addColorStop(1, `rgba(${topColor}, 0.1)`);
        ctx.fillStyle = topGradient;
        ctx.strokeStyle = topStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(CENTER_X - LAUNCH_ZONE_WIDTH * 2, topZoneY, LAUNCH_ZONE_WIDTH * 4, LAUNCH_ZONE_HEIGHT, 8);
        ctx.fill();
        ctx.stroke();

        // 玩家发射区（底部）
        const bottomZoneY = BOARD_Y + BOARD_HEIGHT + 25;
        const bottomGradient = ctx.createLinearGradient(CENTER_X - LAUNCH_ZONE_WIDTH * 2, bottomZoneY, CENTER_X + LAUNCH_ZONE_WIDTH * 2, bottomZoneY);
        bottomGradient.addColorStop(0, `rgba(${bottomColor}, 0.1)`);
        bottomGradient.addColorStop(0.5, `rgba(${bottomColor}, 0.25)`);
        bottomGradient.addColorStop(1, `rgba(${bottomColor}, 0.1)`);
        ctx.fillStyle = bottomGradient;
        ctx.strokeStyle = bottomStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(CENTER_X - LAUNCH_ZONE_WIDTH * 2, bottomZoneY, LAUNCH_ZONE_WIDTH * 4, LAUNCH_ZONE_HEIGHT, 8);
        ctx.fill();
        ctx.stroke();
    }
}
