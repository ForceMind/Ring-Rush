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
        let bestScore = -1;
        let bestTactic = 'occupy';
        
        const enemies = game.physics.pieces.filter(p => p.player !== piece.player && p.player !== 'N' && p.isLaunched && !p.isDiscarded);
        const neutral = game.physics.pieces.filter(p => p.player === 'N' && p.isLaunched && !p.isDiscarded);
        const friends = game.physics.pieces.filter(p => p.player === piece.player && p !== piece && p.isLaunched && !p.isDiscarded);
        const avoidPieces = [...enemies, ...neutral, ...friends];

        // 1. 检查是否有高分敌军值得优先撞击（防守策略）
        let bestEnemyToKnock = null;
        let maxEnemyScore = 0;
        for (const enemy of enemies) {
            const score = game.board.calculateScore(enemy);
            if (score >= 3 && score > maxEnemyScore) {
                // 确保撞击路线没有友军或中立球挡路（适当放宽判定到1.5倍半径，允许擦边）
                if (this.checkPathClear(piece.x, piece.y, enemy.x, enemy.y, [...friends, ...neutral], PIECE_RADIUS * 1.5)) {
                    bestEnemyToKnock = enemy;
                    maxEnemyScore = score;
                }
            }
        }

        // 如果敌军分数极高（4或5分）且AI难度允许，触发绝对防守
        const shouldDefend = Math.random() < this.config.accuracy && bestEnemyToKnock && maxEnemyScore >= 4;

        if (shouldDefend) {
            bestTarget = { x: bestEnemyToKnock.x, y: bestEnemyToKnock.y };
            bestTactic = 'knockout';
            bestScore = maxEnemyScore;
        } else {
            // 2. 寻找最高得分的空位占领
            const candidateTargets = [];
            candidateTargets.push({ x: CENTER_X, y: CENTER_Y, score: 5 }); // 5分点
            
            for (let i = 0; i < 8; i++) { // 4分点
                const angle = (i / 8) * Math.PI * 2;
                candidateTargets.push({ x: CENTER_X + Math.cos(angle) * 36, y: CENTER_Y + Math.sin(angle) * 36, score: 4 });
            }
            for (let i = 0; i < 12; i++) { // 3分点
                const angle = (i / 12) * Math.PI * 2;
                candidateTargets.push({ x: CENTER_X + Math.cos(angle) * 85, y: CENTER_Y + Math.sin(angle) * 85, score: 3 });
            }
            for (let i = 0; i < 16; i++) { // 2分点
                const angle = (i / 16) * Math.PI * 2;
                candidateTargets.push({ x: CENTER_X + Math.cos(angle) * 135, y: CENTER_Y + Math.sin(angle) * 135, score: 2 });
            }

            for (const target of candidateTargets) {
                const isOccupied = avoidPieces.some(p => Math.sqrt((p.x - target.x)**2 + (p.y - target.y)**2) < PIECE_RADIUS * 1.5);
                if (isOccupied) continue;

                if (this.checkPathClear(piece.x, piece.y, target.x, target.y, avoidPieces, PIECE_RADIUS * 1.8)) {
                    if (target.score > bestScore) {
                        bestScore = target.score;
                        bestTarget = target;
                        bestTactic = 'occupy';
                    }
                }
            }

            // 3. 如果找不到任何安全位置（全被挡住了），退而求其次撞击敌人
            if (!bestTarget) {
                if (bestEnemyToKnock) {
                    bestTarget = { x: bestEnemyToKnock.x, y: bestEnemyToKnock.y };
                    bestTactic = 'knockout';
                } else if (enemies.length > 0) {
                    // 随便撞一个最近的敌人
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
