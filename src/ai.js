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

    calculateLaunch(piece, game) {
        let targetX = CENTER_X;
        let targetY = CENTER_Y;
        
        const enemies = game.physics.pieces.filter(p => p.color !== piece.color && p.isLaunched && !p.isDiscarded);
        const friends = game.physics.pieces.filter(p => p.color === piece.color && p !== piece && p.isLaunched && !p.isDiscarded);
        
        // 1. 优先尝试撞击处于高分区（距离中心近）的敌方棋子
        let bestEnemy = null;
        let minEnemyDist = Infinity;
        for (let enemy of enemies) {
            const dCenter = Math.sqrt((enemy.x - CENTER_X)**2 + (enemy.y - CENTER_Y)**2);
            if (dCenter < 100 && dCenter < minEnemyDist) {
                minEnemyDist = dCenter;
                bestEnemy = enemy;
            }
        }

        // 2. 尝试将己方边缘棋子推入高分区的机会
        let bestFriend = null;
        let minFriendDist = Infinity;
        if (!bestEnemy) {
            for (let friend of friends) {
                const dCenter = Math.sqrt((friend.x - CENTER_X)**2 + (friend.y - CENTER_Y)**2);
                if (dCenter > 50 && dCenter < 200 && dCenter < minFriendDist) {
                    minFriendDist = dCenter;
                    bestFriend = friend;
                }
            }
        }

        if (bestEnemy) {
            targetX = bestEnemy.x;
            targetY = bestEnemy.y;
        } else if (bestFriend) {
            // 瞄准己方棋子的边缘，试图把它往中心推
            const angleToCenter = Math.atan2(CENTER_Y - bestFriend.y, CENTER_X - bestFriend.x);
            targetX = bestFriend.x - Math.cos(angleToCenter) * bestFriend.radius;
            targetY = bestFriend.y - Math.sin(angleToCenter) * bestFriend.radius;
        }

        const dx = targetX - piece.x;
        const dy = targetY - piece.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const baseAngle = Math.atan2(dy, dx);
        
        const angleError = (1 - this.config.accuracy) * Math.PI / 8;
        const actualAngle = baseAngle + (Math.random() * 2 - 1) * angleError;

        let basePower;
        if (distance < 150) basePower = 0.4;
        else if (distance < 300) basePower = 0.6;
        else if (distance < 500) basePower = 0.8;
        else basePower = 1.0;

        // 如果是撞击，增加力度
        if (bestEnemy) basePower = Math.min(1.0, basePower + 0.2);

        const powerError = (1 - this.config.powerControl) * 0.2;
        const actualPower = Math.max(0.2, Math.min(1, basePower + (Math.random() * 2 - 1) * powerError));
        const speed = MAX_SPEED * actualPower;

        return { vx: Math.cos(actualAngle) * speed, vy: Math.sin(actualAngle) * speed };
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
