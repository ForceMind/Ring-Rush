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
        const PIECE_RADIUS = 18; // constants 中定义的值
        let requiredSpeed = 0;
        let bestTarget = null;
        let bestTactic = 'occupy';
        let bestOverallValue = -999;

        const enemies = game.physics.pieces.filter(p => p.player !== piece.player && p.player !== 'N' && p.isLaunched && !p.isDiscarded);
        const neutral = game.physics.pieces.filter(p => p.player === 'N' && p.isLaunched && !p.isDiscarded);
        const friends = game.physics.pieces.filter(p => p.player === piece.player && p !== piece && p.isLaunched && !p.isDiscarded);
        const avoidPieces = [...enemies, ...neutral, ...friends];

        // 1. 评估“击飞敌军”的收益
        let bestEnemyToKnock = null;
        let maxEnemyValue = 0;
        for (const enemy of enemies) {
            const score = game.board.calculateScore(enemy);
            if (score >= 3) {
                // 放宽到1.2倍半径判定，允许擦边撞击
                if (this.checkPathClear(piece.x, piece.y, enemy.x, enemy.y, [...friends, ...neutral], PIECE_RADIUS * 1.2)) {
                    // 击飞敌军的收益 = 敌军分数*10 + 5分击杀奖励
                    let knockValue = score * 10 + 5;
                    if (knockValue > maxEnemyValue) {
                        bestEnemyToKnock = enemy;
                        maxEnemyValue = knockValue;
                    }
                }
            }
        }

        // 根据难度决定是否能发现这个击杀机会
        if (bestEnemyToKnock && Math.random() < this.config.accuracy) {
            bestOverallValue = maxEnemyValue;
            bestTarget = { x: bestEnemyToKnock.x, y: bestEnemyToKnock.y };
            bestTactic = 'knockout';
        }

        // 2. 划分网格并全盘评估“占位收益”
        const candidateTargets = [];
        // 以步长 15 遍历整个得分圆区 (半径 115 的区域)
        for (let x = CENTER_X - 115; x <= CENTER_X + 115; x += 15) {
            for (let y = CENTER_Y - 115; y <= CENTER_Y + 115; y += 15) {
                const distToCenter = Math.sqrt((x - CENTER_X)**2 + (y - CENTER_Y)**2);
                if (distToCenter <= 115) {
                    const score = game.board.calculateScore({ x, y });
                    if (score >= 2) candidateTargets.push({ x, y, score });
                }
            }
        }

        for (const target of candidateTargets) {
            // 如果该网格点太靠近任何其他棋子，说明已经被占据
            const isOccupied = avoidPieces.some(p => Math.sqrt((p.x - target.x)**2 + (p.y - target.y)**2) < PIECE_RADIUS * 1.2);
            if (isOccupied) continue;

            // 检查路径是否畅通
            if (this.checkPathClear(piece.x, piece.y, target.x, target.y, avoidPieces, PIECE_RADIUS * 1.5)) {
                let cellValue = target.score * 10; // 基础分数收益

                // 安全性评估：离敌军多远
                let minEnemyDist = 9999;
                for (const e of enemies) {
                    const d = Math.sqrt((e.x - target.x)**2 + (e.y - target.y)**2);
                    if (d < minEnemyDist) minEnemyDist = d;
                }

                // 如果离敌军太近，极易被撞飞，大幅扣分
                if (minEnemyDist < PIECE_RADIUS * 2.5) {
                    cellValue -= 18; 
                } else if (minEnemyDist < PIECE_RADIUS * 4) {
                    cellValue -= 5;
                }

                if (cellValue > bestOverallValue) {
                    bestOverallValue = cellValue;
                    bestTarget = target;
                    bestTactic = 'occupy';
                }
            }
        }

        // 3. 如果找不到任何好位置（路径全被挡死），随便撞个最近的敌人
        if (!bestTarget) {
            if (enemies.length > 0) {
                let minD = 9999;
                for (const e of enemies) {
                    const d = Math.sqrt((e.x - piece.x)**2 + (e.y - piece.y)**2);
                    if (d < minD) { minD = d; bestTarget = { x: e.x, y: e.y }; }
                }
                bestTactic = 'knockout';
            } else {
                bestTarget = { x: CENTER_X, y: CENTER_Y + (piece.player === 'A' ? -100 : 100) };
                bestTactic = 'occupy';
            }
        }

        // 3. 计算所需力度
        const dist = Math.sqrt((bestTarget.x - piece.x)**2 + (bestTarget.y - piece.y)**2);
        if (bestTactic === 'occupy') {
            requiredSpeed = this.getRequiredSpeed(dist);
        } else if (bestTactic === 'knockout') {
            requiredSpeed = this.getRequiredSpeed(dist) + MAX_SPEED * 0.4;
        }

        // 4. 根据难度加入随机误差
        const dx = bestTarget.x - piece.x;
        const dy = bestTarget.y - piece.y;
        const baseAngle = Math.atan2(dy, dx);
        
        const angleError = (1 - this.config.accuracy) * Math.PI / 8;
        const actualAngle = baseAngle + (Math.random() * 2 - 1) * angleError;

        const powerError = (1 - this.config.powerControl) * 0.2 * MAX_SPEED;
        const actualSpeed = Math.min(MAX_SPEED, Math.max(0.5, requiredSpeed + (Math.random() * 2 - 1) * powerError));

        return { vx: Math.cos(actualAngle) * actualSpeed, vy: Math.sin(actualAngle) * actualSpeed };
    }

    async executeTurn(game) {
        this.isThinking = true;
        await this.think();
        const piece = game.getCurrentPiece();
        if (!piece) return;

        const launch = this.calculateLaunch(piece, game);
        piece.vx = launch.vx;
        piece.vy = launch.vy;
        piece.isLaunched = true;
        piece.isActive = true;
        game.isAnimating = true;
        game.audio.play('launch');
        this.isThinking = false;
    }

    think() {
        return new Promise(resolve => {
            const jitter = Math.random() * 500 - 250;
            this.thinkTimer = setTimeout(resolve, this.config.thinkTime + jitter);
        });
    }

    cancel() {
        if (this.thinkTimer) clearTimeout(this.thinkTimer);
        this.thinkTimer = null;
        this.isThinking = false;
    }
}
