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
     * 清除物理系统中的所有棋子
     */
    clearPieces() {
        this.pieces = [];
    }

    /**
     * 每帧更新所有活跃棋子的位置和速度
     */
    update() {
        for (let piece of this.pieces) {
            piece.prevX = piece.x;
            piece.prevY = piece.y;
        }

        for (let piece of this.pieces) {
            if (!piece.isActive) continue;

            const prevX = piece.x;
            const prevY = piece.y;

            piece.x += piece.vx;
            piece.y += piece.vy;
            piece.vx *= FRICTION;
            piece.vy *= FRICTION;

            const bounce = this.checkBoundaryCollision(piece);
            if (bounce) {
                const sx = this.game.perspective === 'top' ? this.game.tx(bounce.x) : bounce.x;
                const sy = this.game.perspective === 'top' ? this.game.ty(bounce.y) : bounce.y;
                this.game.ui.addWallBounce(sx, sy, bounce.intensity);
                this.game.audio.play('bounce');
                this.game.triggerFeedback('bounce', bounce.intensity);
            }
            this.checkPieceCollisions(piece, prevX, prevY);

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
        
        let bounce = null;
        const impactSpeed = Math.sqrt(piece.vx * piece.vx + piece.vy * piece.vy);

        const markBounce = (side) => {
            bounce = {
                side,
                x: piece.x,
                y: piece.y,
                intensity: Math.max(0.5, Math.min(2.2, impactSpeed / 8))
            };
        };

        // Check if piece has entered the board
        if (!piece.hasEnteredBoard && piece.isLaunched) {
            if (piece.y >= boardMinY && piece.y <= boardMaxY) {
                piece.hasEnteredBoard = true;
            }
        }

        // X collision (全开，不再限制为发球区宽度)
        if (piece.x < boardMinX) { piece.x = boardMinX; piece.vx *= -RESTITUTION; markBounce('left'); }
        if (piece.x > boardMaxX) { piece.x = boardMaxX; piece.vx *= -RESTITUTION; markBounce('right'); }

        // Y collision
        if (piece.y < boardMinY) {
            if (piece.hasEnteredBoard || piece.player === 'A') {
                // Already entered, or it's A (starts at bottom, crossing top means crossed the board)
                piece.y = boardMinY; piece.vy *= -RESTITUTION; markBounce('top');
            } else {
                if (piece.y < absMinY) {
                    piece.y = absMinY; piece.vy *= -RESTITUTION; markBounce('top');
                }
            }
        }
        
        if (piece.y > boardMaxY) {
            if (piece.hasEnteredBoard || piece.player === 'B') {
                piece.y = boardMaxY; piece.vy *= -RESTITUTION; markBounce('bottom');
            } else {
                if (piece.y > absMaxY) {
                    piece.y = absMaxY; piece.vy *= -RESTITUTION; markBounce('bottom');
                }
            }
        }

        return bounce;
    }

    /**
     * 检测并处理棋子之间的碰撞（弹性碰撞）
     * @param {Piece} currentPiece - 当前检测的棋子
     */
    getSweptCollision(currentPiece, other, currentPrevX, currentPrevY) {
        const otherPrevX = other.prevX ?? other.x;
        const otherPrevY = other.prevY ?? other.y;
        const minDist = currentPiece.radius + other.radius;

        const startX = currentPrevX - otherPrevX;
        const startY = currentPrevY - otherPrevY;
        const endX = currentPiece.x - other.x;
        const endY = currentPiece.y - other.y;
        const moveX = endX - startX;
        const moveY = endY - startY;

        const a = moveX * moveX + moveY * moveY;
        const b = 2 * (startX * moveX + startY * moveY);
        const c = startX * startX + startY * startY - minDist * minDist;

        if (c <= 0 || a === 0) return null;

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return null;

        const t = (-b - Math.sqrt(discriminant)) / (2 * a);
        if (t < 0 || t > 1) return null;

        return {
            currentX: currentPrevX + (currentPiece.x - currentPrevX) * t,
            currentY: currentPrevY + (currentPiece.y - currentPrevY) * t,
            otherX: otherPrevX + (other.x - otherPrevX) * t,
            otherY: otherPrevY + (other.y - otherPrevY) * t
        };
    }

    resolvePieceCollision(currentPiece, other, nx, ny, distance, minDist) {
        const dvx = currentPiece.vx - other.vx;
        const dvy = currentPiece.vy - other.vy;
        const dvDotN = dvx * nx + dvy * ny;
        const impact = Math.abs(dvDotN);

        if (dvDotN > 0) {
            const impulse = dvDotN * (1 + RESTITUTION) / 2;
            currentPiece.vx -= impulse * nx;
            currentPiece.vy -= impulse * ny;
            other.vx += impulse * nx;
            other.vy += impulse * ny;
            other.isActive = true;
        }

        const overlap = minDist - distance;
        if (overlap > 0) {
            currentPiece.x -= (overlap / 2) * nx;
            currentPiece.y -= (overlap / 2) * ny;
            other.x += (overlap / 2) * nx;
            other.y += (overlap / 2) * ny;
        }

        if (impact > 0.2 || overlap > 0.5) {
            const midX = (currentPiece.x + other.x) / 2;
            const midY = (currentPiece.y + other.y) / 2;
            const sx = this.game.perspective === 'top' ? this.game.tx(midX) : midX;
            const sy = this.game.perspective === 'top' ? this.game.ty(midY) : midY;
            const intensity = Math.max(0.6, Math.min(2.4, impact / 7));
            currentPiece.hitFlash = 1;
            other.hitFlash = 1;
            this.game.particles.emitCollision(
                sx,
                sy,
                this.game.getPlayerColor(currentPiece.player),
                this.game.getPlayerColor(other.player),
                intensity
            );
            this.game.audio.play('collision');
            this.game.triggerFeedback('collision', intensity);
        }
    }

    checkPieceCollisions(currentPiece, currentPrevX = currentPiece.prevX ?? currentPiece.x, currentPrevY = currentPiece.prevY ?? currentPiece.y) {
        for (let other of this.pieces) {
            if (other === currentPiece || !other.isLaunched || other.isDiscarded) continue;

            const dx = other.x - currentPiece.x;
            const dy = other.y - currentPiece.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = currentPiece.radius + other.radius;

            if (distance < minDist && distance > 0) {
                this.resolvePieceCollision(currentPiece, other, dx / distance, dy / distance, distance, minDist);
                continue;
            }

            const swept = this.getSweptCollision(currentPiece, other, currentPrevX, currentPrevY);
            if (swept) {
                currentPiece.x = swept.currentX;
                currentPiece.y = swept.currentY;
                other.x = swept.otherX;
                other.y = swept.otherY;
                const hitDx = other.x - currentPiece.x;
                const hitDy = other.y - currentPiece.y;
                const hitDistance = Math.max(0.0001, Math.sqrt(hitDx * hitDx + hitDy * hitDy));
                this.resolvePieceCollision(currentPiece, other, hitDx / hitDistance, hitDy / hitDistance, hitDistance, minDist);
                continue;
            }

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
                    const intensity = Math.max(0.6, Math.min(2.4, Math.abs(dvDotN) / 7));
                    currentPiece.hitFlash = 1;
                    other.hitFlash = 1;
                    this.game.particles.emitCollision(
                        sx,
                        sy,
                        this.game.getPlayerColor(currentPiece.player),
                        this.game.getPlayerColor(other.player),
                        intensity
                    );
                    this.game.audio.play('collision');
                    this.game.triggerFeedback('collision', intensity);
                }
            }
        }
    }

    /**
     * 检查所有棋子是否已停止运动
     * @returns {boolean}
     */
    static simulateStep(pieces) {
        let activeCount = 0;

        for (const piece of pieces) {
            piece.prevX = piece.x;
            piece.prevY = piece.y;
        }

        for (const piece of pieces) {
            if (!piece.isActive || piece.isDiscarded) continue;
            activeCount++;

            const prevX = piece.x;
            const prevY = piece.y;

            piece.x += piece.vx;
            piece.y += piece.vy;
            piece.vx *= FRICTION;
            piece.vy *= FRICTION;

            Physics.checkBoundaryCollisionSim(piece);
            Physics.checkPieceCollisionsSim(piece, pieces, prevX, prevY);

            const speed = Math.sqrt(piece.vx * piece.vx + piece.vy * piece.vy);
            if (speed < SPEED_THRESHOLD) {
                piece.vx = 0;
                piece.vy = 0;
                piece.isActive = false;
            }
        }

        return activeCount > 0;
    }

    static checkBoundaryCollisionSim(piece) {
        const boardMinX = BOARD_X + piece.radius;
        const boardMaxX = BOARD_X + BOARD_WIDTH - piece.radius;
        const boardMinY = BOARD_Y + piece.radius;
        const boardMaxY = BOARD_Y + BOARD_HEIGHT - piece.radius;
        const absMinY = BOARD_Y - 85 + piece.radius;
        const absMaxY = BOARD_Y + BOARD_HEIGHT + 85 - piece.radius;

        if (!piece.hasEnteredBoard && piece.isLaunched) {
            if (piece.y >= boardMinY && piece.y <= boardMaxY) {
                piece.hasEnteredBoard = true;
            }
        }

        if (piece.x < boardMinX) {
            piece.x = boardMinX;
            piece.vx *= -RESTITUTION;
        }
        if (piece.x > boardMaxX) {
            piece.x = boardMaxX;
            piece.vx *= -RESTITUTION;
        }

        if (piece.y < boardMinY) {
            if (piece.hasEnteredBoard || piece.player === 'A') {
                piece.y = boardMinY;
                piece.vy *= -RESTITUTION;
            } else if (piece.y < absMinY) {
                piece.y = absMinY;
                piece.vy *= -RESTITUTION;
            }
        }

        if (piece.y > boardMaxY) {
            if (piece.hasEnteredBoard || piece.player === 'B') {
                piece.y = boardMaxY;
                piece.vy *= -RESTITUTION;
            } else if (piece.y > absMaxY) {
                piece.y = absMaxY;
                piece.vy *= -RESTITUTION;
            }
        }
    }

    static getSweptCollisionSim(currentPiece, other, currentPrevX, currentPrevY) {
        const otherPrevX = other.prevX ?? other.x;
        const otherPrevY = other.prevY ?? other.y;
        const minDist = currentPiece.radius + other.radius;

        const startX = currentPrevX - otherPrevX;
        const startY = currentPrevY - otherPrevY;
        const endX = currentPiece.x - other.x;
        const endY = currentPiece.y - other.y;
        const moveX = endX - startX;
        const moveY = endY - startY;

        const a = moveX * moveX + moveY * moveY;
        const b = 2 * (startX * moveX + startY * moveY);
        const c = startX * startX + startY * startY - minDist * minDist;

        if (c <= 0 || a === 0) return null;

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return null;

        const t = (-b - Math.sqrt(discriminant)) / (2 * a);
        if (t < 0 || t > 1) return null;

        return {
            currentX: currentPrevX + (currentPiece.x - currentPrevX) * t,
            currentY: currentPrevY + (currentPiece.y - currentPrevY) * t,
            otherX: otherPrevX + (other.x - otherPrevX) * t,
            otherY: otherPrevY + (other.y - otherPrevY) * t
        };
    }

    static resolvePieceCollisionSim(currentPiece, other, nx, ny, distance, minDist) {
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
        }

        const overlap = minDist - distance;
        if (overlap > 0) {
            currentPiece.x -= (overlap / 2) * nx;
            currentPiece.y -= (overlap / 2) * ny;
            other.x += (overlap / 2) * nx;
            other.y += (overlap / 2) * ny;
        }
    }

    static checkPieceCollisionsSim(currentPiece, allPieces, currentPrevX = currentPiece.prevX ?? currentPiece.x, currentPrevY = currentPiece.prevY ?? currentPiece.y) {
        for (const other of allPieces) {
            if (other === currentPiece || !other.isLaunched || other.isDiscarded) continue;

            const dx = other.x - currentPiece.x;
            const dy = other.y - currentPiece.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = currentPiece.radius + other.radius;

            if (distance < minDist && distance > 0) {
                Physics.resolvePieceCollisionSim(currentPiece, other, dx / distance, dy / distance, distance, minDist);
                continue;
            }

            const swept = Physics.getSweptCollisionSim(currentPiece, other, currentPrevX, currentPrevY);
            if (swept) {
                currentPiece.x = swept.currentX;
                currentPiece.y = swept.currentY;
                other.x = swept.otherX;
                other.y = swept.otherY;
                const hitDx = other.x - currentPiece.x;
                const hitDy = other.y - currentPiece.y;
                const hitDistance = Math.max(0.0001, Math.sqrt(hitDx * hitDx + hitDy * hitDy));
                Physics.resolvePieceCollisionSim(currentPiece, other, hitDx / hitDistance, hitDy / hitDistance, hitDistance, minDist);
            }
        }
    }

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
