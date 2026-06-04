/**
 * @file physics.js
 * @description 物理引擎模块 - 处理棋子的运动、边界碰撞和棋子间碰撞
 * Ring Rush - 弹棋
 */

import {
    BOARD_X,
    BOARD_Y,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    FRICTION,
    RESTITUTION,
    SPEED_THRESHOLD
} from './constants.js';

/**
 * 物理引擎类，管理棋子的物理模拟
 */
export class Physics {
    /**
     * @param {object} game - 游戏主实例引用
     */
    constructor(game) {
        this.pieces = [];
        this.game = game;
    }

    /**
     * 添加棋子到物理系统
     * @param {Piece} piece
     */
    addPiece(piece) {
        this.pieces.push(piece);
    }

    /**
     * 每帧更新所有活跃棋子的位置和速度
     */
    update() {
        for (let piece of this.pieces) {
            if (!piece.isActive) continue;

            const prevX = piece.x;
            const prevY = piece.y;

            piece.x += piece.vx;
            piece.y += piece.vy;
            piece.vx *= FRICTION;
            piece.vy *= FRICTION;

            if (this.checkBoundaryCollision(piece)) {
                this.game.audio.play('bounce');
            }
            this.checkPieceCollisions(piece);

            const speed = Math.sqrt(piece.vx * piece.vx + piece.vy * piece.vy);
            if (speed < SPEED_THRESHOLD) {
                piece.vx = 0;
                piece.vy = 0;
                piece.isActive = false;
            }
        }
    }

    checkBoundaryCollision(piece) {
        const boardMinX = BOARD_X + piece.radius;
        const boardMaxX = BOARD_X + BOARD_WIDTH - piece.radius;
        const boardMinY = BOARD_Y + piece.radius;
        const boardMaxY = BOARD_Y + BOARD_HEIGHT - piece.radius;
        
        const center = BOARD_X + BOARD_WIDTH / 2;
        const zoneLeft = center - 100 + piece.radius;
        const zoneRight = center + 100 - piece.radius;
        
        const absMinY = BOARD_Y - 85 + piece.radius;
        const absMaxY = BOARD_Y + BOARD_HEIGHT + 85 - piece.radius;
        
        let bounced = false;

        // Check if piece has entered the board
        if (!piece.hasEnteredBoard && piece.isLaunched) {
            if (piece.y >= boardMinY && piece.y <= boardMaxY) {
                piece.hasEnteredBoard = true;
            }
        }

        // X collision
        if (piece.y < boardMinY || piece.y > boardMaxY) {
            // In launch zone or gap, restrict to zone width
            if (piece.x < zoneLeft) { piece.x = zoneLeft; piece.vx *= -RESTITUTION; bounced = true; }
            if (piece.x > zoneRight) { piece.x = zoneRight; piece.vx *= -RESTITUTION; bounced = true; }
        } else {
            // In main board, restrict to board width
            if (piece.x < boardMinX) { piece.x = boardMinX; piece.vx *= -RESTITUTION; bounced = true; }
            if (piece.x > boardMaxX) { piece.x = boardMaxX; piece.vx *= -RESTITUTION; bounced = true; }
        }

        // Y collision
        if (piece.y < boardMinY) {
            if (piece.hasEnteredBoard || piece.player === 'A') {
                // Already entered, or it's A (starts at bottom, crossing top means crossed the board)
                piece.y = boardMinY; piece.vy *= -RESTITUTION; bounced = true;
            } else {
                if (piece.y < absMinY) {
                    piece.y = absMinY; piece.vy *= -RESTITUTION; bounced = true;
                }
            }
        }
        
        if (piece.y > boardMaxY) {
            if (piece.hasEnteredBoard || piece.player === 'B') {
                piece.y = boardMaxY; piece.vy *= -RESTITUTION; bounced = true;
            } else {
                if (piece.y > absMaxY) {
                    piece.y = absMaxY; piece.vy *= -RESTITUTION; bounced = true;
                }
            }
        }

        return bounced;
    }

    /**
     * 检测并处理棋子之间的碰撞（弹性碰撞）
     * @param {Piece} currentPiece - 当前检测的棋子
     */
    checkPieceCollisions(currentPiece) {
        for (let other of this.pieces) {
            if (other === currentPiece || !other.isLaunched) continue;

            const dx = other.x - currentPiece.x;
            const dy = other.y - currentPiece.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = currentPiece.radius + other.radius;

            if (distance < minDist && distance > 0) {
                const nx = dx / distance;
                const ny = dy / distance;
                const dvx = currentPiece.vx - other.vx;
                const dvy = currentPiece.vy - other.vy;
                const dvDotN = dvx * nx + dvy * ny;

                if (dvDotN > 0) {
                    const impulse = dvDotN * (1 + RESTITUTION) / 2;
                    currentPiece.vx -= impulse * nx;
                    currentPiece.vy -= impulse * ny;
                    other.vx += impulse * nx;
                    other.vy += impulse * ny;
                    other.isActive = true;

                    const overlap = minDist - distance;
                    currentPiece.x -= (overlap / 2) * nx;
                    currentPiece.y -= (overlap / 2) * ny;
                    other.x += (overlap / 2) * nx;
                    other.y += (overlap / 2) * ny;

                    // 碰撞特效
                    const midX = (currentPiece.x + other.x) / 2;
                    const midY = (currentPiece.y + other.y) / 2;
                    const sx = this.game.perspective === 'top' ? this.game.tx(midX) : midX;
                    const sy = this.game.perspective === 'top' ? this.game.ty(midY) : midY;
                    this.game.particles.emitCollision(sx, sy, currentPiece.color, other.color);
                    this.game.audio.play('collision');
                }
            }
        }
    }

    /**
     * 检查所有棋子是否已停止运动
     * @returns {boolean}
     */
    allStopped() {
        return this.pieces.every(p => !p.isActive);
    }

    /**
     * 重置物理系统，清除所有棋子
     */
    reset() {
        this.pieces = [];
    }
}
