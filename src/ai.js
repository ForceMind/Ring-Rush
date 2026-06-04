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
        let targetX = CENTER_X;
        let targetY = CENTER_Y;
        let requiredSpeed = 0;
        let tactic = 'occupy'; // 'knockout', 'assist', 'occupy'
        
        const enemies = game.physics.pieces.filter(p => p.color !== piece.color && p.isLaunched && !p.isDiscarded);
        const friends = game.physics.pieces.filter(p => p.color === piece.color && p !== piece && p.isLaunched && !p.isDiscarded);
        
        // 1. 尝试寻找可以击杀的高分敌军
        let bestEnemy = null;
        let maxEnemyScore = -1;
        for (const enemy of enemies) {
            const dCenter = Math.sqrt((enemy.x - CENTER_X)**2 + (enemy.y - CENTER_Y)**2);
            let scoreValue = 0;
            if (dCenter < 40) scoreValue = 3;
            else if (dCenter < 90) scoreValue = 2;
            else if (dCenter < 150) scoreValue = 1;

            if (scoreValue > maxEnemyScore) {
                // 确保路线上没有自己的棋子
                if (this.checkPathClear(piece.x, piece.y, enemy.x, enemy.y, friends, PIECE_RADIUS)) {
                    bestEnemy = enemy;
                    maxEnemyScore = scoreValue;
                }
            }
        }

        // 2. 尝试寻找可以助攻的低分友军（如果没有高价值敌军）
        let bestFriend = null;
        let bestFriendScore = -1;
        let friendAimX, friendAimY;
        if (maxEnemyScore < 2) { // 只有在没有3分/2分敌军时，才考虑助攻
            for (const friend of friends) {
                const dCenter = Math.sqrt((friend.x - CENTER_X)**2 + (friend.y - CENTER_Y)**2);
                let scoreValue = 0;
                if (dCenter < 40) scoreValue = 3;
                else if (dCenter < 90) scoreValue = 2;
                else if (dCenter < 150) scoreValue = 1;
                
                // 只有1分或0分的友军值得助攻
                if (scoreValue < 2 && scoreValue > bestFriendScore) {
                    const angleToCenter = Math.atan2(CENTER_Y - friend.y, CENTER_X - friend.x);
                    // 瞄准友军背对靶心的一侧
                    const aimX = friend.x - Math.cos(angleToCenter) * PIECE_RADIUS * 2;
                    const aimY = friend.y - Math.sin(angleToCenter) * PIECE_RADIUS * 2;

                    if (this.checkPathClear(piece.x, piece.y, aimX, aimY, friends.filter(f => f !== friend), PIECE_RADIUS)) {
                        bestFriend = friend;
                        bestFriendScore = scoreValue;
                        friendAimX = aimX;
                        friendAimY = aimY;
                    }
                }
            }
        }

        // 3. 决定最终战术
        // 如果靶心没有友军，直接占点永远是一个好选择
        const centerClearOfFriends = !friends.some(f => Math.sqrt((f.x - CENTER_X)**2 + (f.y - CENTER_Y)**2) < PIECE_RADIUS * 2);
        
        if (bestEnemy && maxEnemyScore >= 2) {
            tactic = 'knockout';
            targetX = bestEnemy.x;
            targetY = bestEnemy.y;
            const dist = Math.sqrt((targetX - piece.x)**2 + (targetY - piece.y)**2);
            // 撞击敌军需要使用“过剩力度”把他们弹飞，但要考虑距离不能太大导致脱靶
            requiredSpeed = this.getRequiredSpeed(dist) + MAX_SPEED * 0.4;
        } else if (centerClearOfFriends && this.checkPathClear(piece.x, piece.y, CENTER_X, CENTER_Y, friends, PIECE_RADIUS)) {
            tactic = 'occupy';
            targetX = CENTER_X;
            targetY = CENTER_Y;
            const dist = Math.sqrt((targetX - piece.x)**2 + (targetY - piece.y)**2);
            // 占点需要非常精准的力度，刚好停在那里
            requiredSpeed = this.getRequiredSpeed(dist);
        } else if (bestFriend) {
            tactic = 'assist';
            targetX = friendAimX;
            targetY = friendAimY;
            const dist = Math.sqrt((targetX - piece.x)**2 + (targetY - piece.y)**2);
            // 助攻需要把友军往里推，力度需要刚好能推动两颗棋子
            requiredSpeed = this.getRequiredSpeed(dist) + MAX_SPEED * 0.2;
        } else if (bestEnemy) {
            // 如果连靶心都被自己人挡了，那只能去撞任意敌军了
            tactic = 'knockout';
            targetX = bestEnemy.x;
            targetY = bestEnemy.y;
            const dist = Math.sqrt((targetX - piece.x)**2 + (targetY - piece.y)**2);
            requiredSpeed = this.getRequiredSpeed(dist) + MAX_SPEED * 0.4;
        } else {
            // 最无奈的情况，随便打个安全的地方（比如稍微偏离中心）
            tactic = 'occupy';
            targetX = CENTER_X + 50;
            targetY = CENTER_Y;
            const dist = Math.sqrt((targetX - piece.x)**2 + (targetY - piece.y)**2);
            requiredSpeed = this.getRequiredSpeed(dist);
        }

        // 4. 根据难度加入随机误差
        const dx = targetX - piece.x;
        const dy = targetY - piece.y;
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
