/**
 * Ring Rush - AI
 * AI 对手逻辑 - 支持多难度等级的电脑玩家
 */

import { AI_DIFFICULTY, MAX_SPEED, CENTER_X, CENTER_Y } from './constants.js';

export class AI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.config = AI_DIFFICULTY[difficulty];
        this.isThinking = false;
        this.thinkTimer = null;
    }

    getRequiredSpeed(distance) {
        // 使用物理公式计算恰好停在 distance 距离所需的初始速度
        // 位移 = 初速度 / (1 - 摩擦力)
        // 初速度 = 位移 * (1 - 摩擦力)
        // 这里需要引入一个常数 FRICTION，当前 constants 设定为 0.985
        return distance * (1 - 0.985);
    }

    checkPathClear(startX, startY, targetX, targetY, avoidPieces, pieceRadius) {
        const dx = targetX - startX;
        const dy = targetY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return true;
        
        const dirX = dx / dist;
        const dirY = dy / dist;

        for (const p of avoidPieces) {
            const px = p.x - startX;
            const py = p.y - startY;
            const projection = px * dirX + py * dirY;

            if (projection > 0 && projection < dist) {
                const closestX = startX + dirX * projection;
                const closestY = startY + dirY * projection;
                const perpDist = Math.sqrt((p.x - closestX)**2 + (p.y - closestY)**2);
                
                // 如果垂直距离小于两倍半径，说明会发生碰撞
                if (perpDist < pieceRadius * 2) {
                    return false;
                }
            }
        }
        return true;
    }

    calculateLaunch(piece, game) {
        const PIECE_RADIUS = 18;
        let bestTarget = null;
        let bestTactic = 'occupy';
        let bestOverallValue = -999;
        let bestSliderValue = 0.5;

        const enemies = game.physics.pieces.filter(p => p.player !== piece.player && p.player !== 'N' && p.isLaunched && !p.isDiscarded);
        const neutral = game.physics.pieces.filter(p => p.player === 'N' && p.isLaunched && !p.isDiscarded);
        const friends = game.physics.pieces.filter(p => p.player === piece.player && p !== piece && p.isLaunched && !p.isDiscarded);
        const avoidPieces = [...enemies, ...neutral, ...friends];

        const getStartX = (sv) => {
            const minX = (600 / 2) - 100 + piece.radius;
            const maxX = (600 / 2) + 100 - piece.radius;
            if (game.perspective === 'top') {
                return maxX - sv * (maxX - minX);
            } else {
                return minX + sv * (maxX - minX);
            }
        };

        const startY = piece.y;

        let step = 0.1;
        if (this.difficulty === 'hard') step = 0.05;
        if (this.difficulty === 'easy') step = 0.2;

        for (let sv = 0; sv <= 1.0; sv += step) {
            const startX = getStartX(sv);

            for (const enemy of enemies) {
                const score = game.board.calculateScore(enemy);
                if (score >= 3) {
                    if (this.checkPathClear(startX, startY, enemy.x, enemy.y, [...friends, ...neutral], PIECE_RADIUS * 1.2)) {
                        let knockValue = score * 10 + 5;
                        if (knockValue > bestOverallValue) {
                            bestOverallValue = knockValue;
                            bestTarget = { x: enemy.x, y: enemy.y };
                            bestTactic = 'knockout';
                            bestSliderValue = sv;
                        }
                    }
                }
            }

            for (let x = CENTER_X - 115; x <= CENTER_X + 115; x += 15) {
                for (let y = CENTER_Y - 115; y <= CENTER_Y + 115; y += 15) {
                    const distToCenter = Math.sqrt((x - CENTER_X)**2 + (y - CENTER_Y)**2);
                    if (distToCenter <= 115) {
                        const targetScore = game.board.calculateScore({ x, y });
                        if (targetScore >= 2) {
                            const isOccupied = avoidPieces.some(p => Math.sqrt((p.x - x)**2 + (p.y - y)**2) < PIECE_RADIUS * 1.2);
                            if (!isOccupied) {
                                if (this.checkPathClear(startX, startY, x, y, avoidPieces, PIECE_RADIUS * 1.5)) {
                                    let cellValue = targetScore * 10;
                                    
                                    let minEnemyDist = 9999;
                                    for (const e of enemies) {
                                        const d = Math.sqrt((e.x - x)**2 + (e.y - y)**2);
                                        if (d < minEnemyDist) minEnemyDist = d;
                                    }

                                    if (minEnemyDist < PIECE_RADIUS * 2.5) {
                                        cellValue -= 18; 
                                    } else if (minEnemyDist < PIECE_RADIUS * 4) {
                                        cellValue -= 5;
                                    }

                                    if (cellValue > bestOverallValue) {
                                        bestOverallValue = cellValue;
                                        bestTarget = { x, y };
                                        bestTactic = 'occupy';
                                        bestSliderValue = sv;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!bestTarget) {
            bestSliderValue = 0.5;
            const startX = getStartX(0.5);
            if (enemies.length > 0) {
                let minD = 9999;
                for (const e of enemies) {
                    const d = Math.sqrt((e.x - startX)**2 + (e.y - startY)**2);
                    if (d < minD) { minD = d; bestTarget = { x: e.x, y: e.y }; }
                }
                bestTactic = 'knockout';
            } else {
                bestTarget = { x: CENTER_X, y: CENTER_Y + (piece.player === 'A' ? -100 : 100) };
                bestTactic = 'occupy';
            }
        }

        const startX = getStartX(bestSliderValue);
        const dist = Math.sqrt((bestTarget.x - startX)**2 + (bestTarget.y - startY)**2);
        
        let requiredSpeed = 0;
        if (bestTactic === 'occupy') {
            requiredSpeed = this.getRequiredSpeed(dist);
        } else if (bestTactic === 'knockout') {
            requiredSpeed = this.getRequiredSpeed(dist) + MAX_SPEED * 0.4;
        }

        const dx = bestTarget.x - startX;
        const dy = bestTarget.y - startY;
        const baseAngle = Math.atan2(dy, dx);
        
        const angleError = (1 - this.config.accuracy) * Math.PI / 8;
        const actualAngle = baseAngle + (Math.random() * 2 - 1) * angleError;

        const powerError = (1 - this.config.powerControl) * 0.2 * MAX_SPEED;
        const actualSpeed = Math.min(MAX_SPEED, Math.max(0.5, requiredSpeed + (Math.random() * 2 - 1) * powerError));

        return { vx: Math.cos(actualAngle) * actualSpeed, vy: Math.sin(actualAngle) * actualSpeed, sliderValue: bestSliderValue };
    }

    async animateSlider(game, targetValue) {
        return new Promise(resolve => {
            const startValue = game.input.sliderValue;
            const distance = targetValue - startValue;
            if (Math.abs(distance) < 0.01) {
                game.input.sliderValue = targetValue;
                game.input.applySliderToPiece();
                resolve();
                return;
            }

            let progress = 0;
            const duration = 500;
            const startTime = performance.now();

            const step = (currentTime) => {
                if (!this.isThinking || game.state !== 'playing' || game.currentPlayer !== game.getCurrentPiece()?.player) {
                    resolve();
                    return;
                }

                progress = (currentTime - startTime) / duration;
                if (progress >= 1) {
                    game.input.sliderValue = targetValue;
                    game.input.applySliderToPiece();
                    resolve();
                } else {
                    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                    game.input.sliderValue = startValue + distance * ease;
                    game.input.applySliderToPiece();
                    requestAnimationFrame(step);
                }
            };
            requestAnimationFrame(step);
        });
    }

    async executeTurn(game) {
        this.isThinking = true;
        
        await this.think(this.config.thinkTime / 2);
        
        const piece = game.getCurrentPiece();
        if (!piece || !this.isThinking) return;

        const launch = this.calculateLaunch(piece, game);

        await this.animateSlider(game, launch.sliderValue);

        if (!this.isThinking) return;

        await this.think(this.config.thinkTime / 2);

        if (!this.isThinking) return;

        piece.vx = launch.vx;
        piece.vy = launch.vy;
        piece.isLaunched = true;
        piece.isActive = true;
        game.isAnimating = true;
        game.audio.play('launch');
        this.isThinking = false;
    }

    think(time = this.config.thinkTime) {
        return new Promise(resolve => {
            const jitter = Math.random() * 200 - 100;
            this.thinkTimer = setTimeout(resolve, time + jitter);
        });
    }

    cancel() {
        if (this.thinkTimer) clearTimeout(this.thinkTimer);
        this.thinkTimer = null;
        this.isThinking = false;
    }
}
