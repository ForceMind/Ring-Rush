import {
    AI_DIFFICULTY,
    CENTER_X,
    CENTER_Y,
    FRICTION,
    MAX_SPEED,
    PIECE_RADIUS,
    SCORING_ZONES
} from './constants.js';

export class AI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.config = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.medium;
        this.isThinking = false;
        this.thinkTimer = null;
    }

    getRequiredSpeed(distance) {
        return distance * (1 - FRICTION);
    }

    checkPathClear(startX, startY, targetX, targetY, avoidPieces, clearanceRadius) {
        const dx = targetX - startX;
        const dy = targetY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return true;

        const dirX = dx / dist;
        const dirY = dy / dist;

        for (const piece of avoidPieces) {
            const px = piece.x - startX;
            const py = piece.y - startY;
            const projection = px * dirX + py * dirY;

            if (projection <= 0 || projection >= dist) continue;

            const closestX = startX + dirX * projection;
            const closestY = startY + dirY * projection;
            const perpDist = Math.sqrt((piece.x - closestX) ** 2 + (piece.y - closestY) ** 2);
            if (perpDist < clearanceRadius) {
                return false;
            }
        }

        return true;
    }

    calculateLaunch(piece, game) {
        let requiredSpeed = 0;
        let bestTarget = null;
        let bestTactic = 'occupy';
        let bestOverallValue = -999;

        const pieces = game.physics.pieces;
        const enemies = pieces.filter((p) => p.player !== piece.player && p.player !== 'N' && p.isLaunched && !p.isDiscarded);
        const neutral = pieces.filter((p) => p.player === 'N' && p.isLaunched && !p.isDiscarded);
        const friends = pieces.filter((p) => p.player === piece.player && p !== piece && p.isLaunched && !p.isDiscarded);
        const avoidPieces = [...enemies, ...neutral, ...friends];

        let bestEnemyToKnock = null;
        let maxEnemyValue = 0;
        for (const enemy of enemies) {
            const score = game.board.calculateScore(enemy);
            if (score < 3) continue;

            const clear = this.checkPathClear(
                piece.x,
                piece.y,
                enemy.x,
                enemy.y,
                [...friends, ...neutral],
                PIECE_RADIUS * 2.4
            );
            if (!clear) continue;

            const knockValue = score * 10 + 5;
            if (knockValue > maxEnemyValue) {
                bestEnemyToKnock = enemy;
                maxEnemyValue = knockValue;
            }
        }

        if (bestEnemyToKnock && Math.random() < this.config.accuracy) {
            bestOverallValue = maxEnemyValue;
            bestTarget = { x: bestEnemyToKnock.x, y: bestEnemyToKnock.y };
            bestTactic = 'knockout';
        }

        const candidateTargets = this.getScoringCandidateTargets(game, piece.player);
        for (const target of candidateTargets) {
            const isOccupied = avoidPieces.some((p) => Math.sqrt((p.x - target.x) ** 2 + (p.y - target.y) ** 2) < PIECE_RADIUS * 1.2);
            if (isOccupied) continue;

            const clear = this.checkPathClear(piece.x, piece.y, target.x, target.y, avoidPieces, PIECE_RADIUS * 3);
            if (!clear) continue;

            let cellValue = target.score * 12 - this.distanceToCenter(target) * 0.03;
            if (target.score === 5) cellValue += 14;
            if (target.score === 2) cellValue -= 3;
            let minEnemyDist = 9999;
            for (const enemy of enemies) {
                const distance = Math.sqrt((enemy.x - target.x) ** 2 + (enemy.y - target.y) ** 2);
                if (distance < minEnemyDist) minEnemyDist = distance;
            }

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

        if (!bestTarget) {
            if (enemies.length > 0) {
                let nearestDistance = 9999;
                for (const enemy of enemies) {
                    const distance = Math.sqrt((enemy.x - piece.x) ** 2 + (enemy.y - piece.y) ** 2);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        bestTarget = { x: enemy.x, y: enemy.y };
                    }
                }
                bestTactic = 'knockout';
            } else {
                bestTarget = {
                    x: CENTER_X,
                    y: CENTER_Y + (piece.player === 'A' ? -1 : 1) * SCORING_ZONES.pentagon.radius * 0.72
                };
                bestTactic = 'occupy';
            }
        }

        const dist = Math.sqrt((bestTarget.x - piece.x) ** 2 + (bestTarget.y - piece.y) ** 2);
        if (bestTactic === 'occupy') {
            requiredSpeed = this.getRequiredSpeed(dist);
        } else {
            requiredSpeed = this.getRequiredSpeed(dist) + MAX_SPEED * 0.28;
        }

        const dx = bestTarget.x - piece.x;
        const dy = bestTarget.y - piece.y;
        const baseAngle = Math.atan2(dy, dx);
        const angleError = Math.pow(1 - this.config.accuracy, 1.05) * Math.PI / 10;
        const actualAngle = baseAngle + (Math.random() * 2 - 1) * angleError;
        const powerError = (1 - this.config.powerControl) * 0.14 * MAX_SPEED;
        const actualSpeed = Math.min(MAX_SPEED, Math.max(0.5, requiredSpeed + (Math.random() * 2 - 1) * powerError));

        return {
            vx: Math.cos(actualAngle) * actualSpeed,
            vy: Math.sin(actualAngle) * actualSpeed,
            tactic: bestTactic,
            target: bestTarget
        };
    }

    getScoringCandidateTargets(game, player) {
        const targets = [];
        const seen = new Set();
        const pushTarget = (x, y) => {
            const key = `${Math.round(x)}:${Math.round(y)}`;
            if (seen.has(key)) return;
            seen.add(key);
            const score = game.board.calculateScore({ x, y, player });
            if (score >= 2) targets.push({ x, y, score });
        };

        pushTarget(CENTER_X, CENTER_Y);
        [
            SCORING_ZONES.center.radius * 0.65,
            SCORING_ZONES.hexagon.radius * 0.72,
            SCORING_ZONES.pentagon.radius * 0.78,
            SCORING_ZONES.square.radius * 0.86
        ].forEach((radius, ringIndex) => {
            const pointCount = ringIndex === 0 ? 6 : 10;
            for (let i = 0; i < pointCount; i++) {
                const angle = (Math.PI * 2 * i) / pointCount;
                pushTarget(CENTER_X + Math.cos(angle) * radius, CENTER_Y + Math.sin(angle) * radius);
            }
        });

        const step = Math.max(10, Math.round(PIECE_RADIUS * 0.62));
        const scanRadius = SCORING_ZONES.square.radius;
        const offsets = [];

        for (let offset = -scanRadius; offset <= scanRadius; offset += step) {
            offsets.push(offset);
        }
        if (!offsets.includes(0)) offsets.push(0);
        if (!offsets.includes(scanRadius)) offsets.push(scanRadius);
        offsets.sort((a, b) => a - b);

        for (const dx of offsets) {
            for (const dy of offsets) {
                pushTarget(CENTER_X + dx, CENTER_Y + dy);
            }
        }

        targets.sort((a, b) => b.score - a.score || this.distanceToCenter(a) - this.distanceToCenter(b));
        return targets;
    }

    distanceToCenter(target) {
        return Math.sqrt((target.x - CENTER_X) ** 2 + (target.y - CENTER_Y) ** 2);
    }

    async executeTurn(game) {
        this.isThinking = true;
        await this.think();
        const piece = game.getCurrentPiece();
        if (!piece) {
            this.isThinking = false;
            return;
        }

        const launch = this.calculateLaunch(piece, game);
        piece.vx = launch.vx;
        piece.vy = launch.vy;
        piece.isLaunched = true;
        piece.isActive = true;
        piece.launchFlash = 1;
        game.isAnimating = true;
        game.audio.play('launch');
        game.triggerFeedback('launch');
        this.isThinking = false;
    }

    think() {
        return new Promise((resolve) => {
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
