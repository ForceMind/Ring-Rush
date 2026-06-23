import {
    AI_DIFFICULTY,
    BOARD_HEIGHT,
    BOARD_WIDTH,
    BOARD_X,
    BOARD_Y,
    CENTER_X,
    CENTER_Y,
    FRICTION,
    LAUNCH_LANE_HALF_WIDTH,
    MAX_SPEED,
    PIECE_RADIUS,
    RESTITUTION,
    SCORING_ZONES,
    SPEED_THRESHOLD
} from './constants.js';

export class AI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.config = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.medium;
        this.isThinking = false;
        this.thinkTimer = null;
    }

    getRequiredSpeed(distance) {
        const frictionLossTail = SPEED_THRESHOLD / Math.max(0.001, 1 - FRICTION);
        return (distance + frictionLossTail * 0.72) * (1 - FRICTION);
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
        const pieces = game.physics.pieces;
        const enemies = pieces.filter((p) => p.player !== piece.player && p.player !== 'N' && p.isLaunched && !p.isDiscarded);
        const neutral = pieces.filter((p) => p.player === 'N' && p.isLaunched && !p.isDiscarded);
        const friends = pieces.filter((p) => p.player === piece.player && p !== piece && p.isLaunched && !p.isDiscarded);
        const avoidPieces = [...enemies, ...neutral, ...friends];
        const plans = [];

        for (const enemy of enemies) {
            const score = game.board.calculateScore(enemy);
            if (score < 3) continue;

            if (Math.random() < this.config.accuracy) {
                plans.push({
                    target: { x: enemy.x, y: enemy.y },
                    tactic: 'knockout',
                    baseValue: score * 22 + (score >= 5 ? 20 : 8)
                });
            }
        }

        const candidateTargets = this.getScoringCandidateTargets(game, piece.player);
        for (const target of candidateTargets) {
            const isOccupied = avoidPieces.some((p) => Math.sqrt((p.x - target.x) ** 2 + (p.y - target.y) ** 2) < PIECE_RADIUS * 1.2);
            if (isOccupied) continue;

            plans.push({
                target,
                tactic: 'occupy',
                baseValue: this.scoreOccupyTarget(target, enemies)
            });
        }

        if (plans.length === 0) {
            if (enemies.length > 0) {
                let nearestDistance = 9999;
                let nearestEnemy = null;
                for (const enemy of enemies) {
                    const distance = Math.sqrt((enemy.x - piece.x) ** 2 + (enemy.y - piece.y) ** 2);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestEnemy = enemy;
                    }
                }
                if (nearestEnemy) {
                    plans.push({
                        target: { x: nearestEnemy.x, y: nearestEnemy.y },
                        tactic: 'knockout',
                        baseValue: 10
                    });
                }
            } else {
                plans.push({
                    target: {
                        x: CENTER_X,
                        y: CENTER_Y + (piece.player === 'A' ? -1 : 1) * SCORING_ZONES.pentagon.radius * 0.72
                    },
                    tactic: 'occupy',
                    baseValue: 20
                });
            }
        }

        const selectedLaunch = this.pickBestLaunch(piece, game, plans);
        return this.applyDifficultyError(selectedLaunch);
    }

    scoreOccupyTarget(target, enemies) {
        let value = target.score * 13 - this.distanceToCenter(target) * 0.025;
        if (target.score === 5) value += 20;
        if (target.score === 4) value += 8;
        if (target.score === 2) value -= 2;

        let minEnemyDist = 9999;
        for (const enemy of enemies) {
            const distance = Math.sqrt((enemy.x - target.x) ** 2 + (enemy.y - target.y) ** 2);
            if (distance < minEnemyDist) minEnemyDist = distance;
        }

        if (minEnemyDist < PIECE_RADIUS * 2.5) {
            value -= 18;
        } else if (minEnemyDist < PIECE_RADIUS * 4) {
            value -= 5;
        }

        return value;
    }

    pickBestLaunch(piece, game, plans) {
        const sortedPlans = plans
            .filter((plan) => plan && plan.target)
            .sort((a, b) => b.baseValue - a.baseValue);
        const limit = this.difficulty === 'hard' ? 16 : this.difficulty === 'medium' ? 10 : 6;
        const evaluated = [];

        for (const plan of sortedPlans.slice(0, limit)) {
            const candidates = this.generateLaunchCandidates(piece, plan);
            for (const launch of candidates) {
                evaluated.push(this.evaluateLaunch(piece, game, plan, launch));
            }
        }

        if (evaluated.length === 0) {
            const fallbackPlan = {
                target: {
                    x: CENTER_X,
                    y: CENTER_Y + (piece.player === 'A' ? -1 : 1) * SCORING_ZONES.pentagon.radius * 0.72
                },
                tactic: 'occupy'
            };
            const fallbackLaunch = this.createLaunchVector(piece, fallbackPlan.target, fallbackPlan.tactic, piece.x);
            return this.evaluateLaunch(piece, game, fallbackPlan, fallbackLaunch);
        }

        evaluated.sort((a, b) => b.value - a.value);

        if (this.difficulty === 'hard') {
            const bestKnockout = evaluated.find((entry) => entry.plan.tactic === 'knockout' && entry.value > -200);
            if (bestKnockout && bestKnockout.value >= evaluated[0].value - 80) {
                return bestKnockout;
            }
            return evaluated[0];
        }

        const choiceCount = this.difficulty === 'medium' ? Math.min(3, evaluated.length) : Math.min(6, evaluated.length);
        const pick = Math.floor(Math.random() * choiceCount);
        return evaluated[pick];
    }

    generateLaunchCandidates(piece, plan) {
        const launchPositions = this.getLaunchPositionCandidates(piece, plan.target);
        const angleOffsets = this.difficulty === 'hard'
            ? [0, -0.032, 0.032]
            : this.difficulty === 'medium'
                ? [0, -0.055, 0.055]
                : [0, -0.085, 0.085];
        const speedScales = this.difficulty === 'hard'
            ? [0.92, 1, 1.1]
            : this.difficulty === 'medium'
                ? [0.92, 1, 1.1]
                : [0.94, 1.08];
        const candidates = [];
        const seen = new Set();

        for (const launchX of launchPositions) {
            const base = this.createLaunchVector(piece, plan.target, plan.tactic, launchX);
            for (const angleOffset of angleOffsets) {
                for (const speedScale of speedScales) {
                    const angle = base.baseAngle + angleOffset;
                    const speed = Math.min(MAX_SPEED, Math.max(0.5, base.requiredSpeed * speedScale));
                    const key = `${Math.round(launchX)}:${Math.round(angle * 1000)}:${Math.round(speed * 100)}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    candidates.push({
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        baseAngle: angle,
                        requiredSpeed: speed,
                        launchX,
                        tactic: plan.tactic,
                        target: plan.target
                    });
                }
            }
        }

        return candidates;
    }

    getLaunchPositionCandidates(piece, target) {
        const radius = piece.radius || PIECE_RADIUS;
        const minX = CENTER_X - LAUNCH_LANE_HALF_WIDTH + radius;
        const maxX = CENTER_X + LAUNCH_LANE_HALF_WIDTH - radius;
        const clamp = (x) => Math.max(minX, Math.min(maxX, x));
        const count = this.difficulty === 'hard' ? 7 : this.difficulty === 'medium' ? 5 : 3;
        const candidates = [clamp(piece.x), clamp(CENTER_X), clamp(target.x)];

        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0.5 : i / (count - 1);
            candidates.push(minX + (maxX - minX) * t);
        }

        return [...new Set(candidates.map((x) => Math.round(clamp(x) * 100) / 100))];
    }

    evaluateLaunch(piece, game, plan, launch) {
        const before = this.scoreSimulationPieces(game.physics.pieces, game);
        const outcome = this.simulateShot(piece, game, launch.vx, launch.vy, { launchX: launch.launchX });
        const after = this.scoreSimulationPieces(outcome.pieces, game);
        const current = outcome.pieces.find((p) => p.isCurrent);

        if (!current || current.isDiscarded || !current.hasEnteredBoard) {
            return {
                ...launch,
                plan,
                value: -999,
                predictedStop: current ? { x: current.x, y: current.y } : null,
                predictedScore: 0
            };
        }

        const currentScore = game.board.calculateScore(current);
        const targetDistance = Math.sqrt((current.x - plan.target.x) ** 2 + (current.y - plan.target.y) ** 2);
        const ownScoreGain = after.friendly[piece.player] - before.friendly[piece.player];
        const enemyScoreBefore = before.enemy[piece.player] || 0;
        const enemyScoreAfter = after.enemy[piece.player] || 0;
        const enemyScoreDrop = enemyScoreBefore - enemyScoreAfter;
        const friendlyLoss = Math.max(0, before.friendly[piece.player] - after.friendly[piece.player]);

        let value = plan.baseValue;
        value += currentScore * 24;
        value += ownScoreGain * 10;
        value += enemyScoreDrop * (plan.tactic === 'knockout' ? 22 : 12);
        value -= friendlyLoss * 24;
        value -= Math.min(55, targetDistance * 0.32);
        if (plan.tactic === 'occupy' && currentScore === 0) value -= 85;
        if (plan.tactic === 'knockout' && enemyScoreDrop <= 0) value -= 45;
        if (currentScore >= 4) value += 12;

        return {
            ...launch,
            plan,
            value,
            target: plan.target,
            tactic: plan.tactic,
            predictedStop: { x: current.x, y: current.y },
            predictedScore: currentScore,
            predictedEnemyScoreDrop: enemyScoreDrop,
            predictedFriendlyLoss: friendlyLoss
        };
    }

    scoreSimulationPieces(pieces, game) {
        const totals = {
            friendly: { A: 0, B: 0 },
            enemy: { A: 0, B: 0 }
        };

        for (const piece of pieces) {
            if (piece.isDiscarded || piece.player === 'N') continue;
            const score = game.board.calculateScore(piece);
            if (piece.player === 'A') {
                totals.friendly.A += score;
                totals.enemy.B += score;
            } else if (piece.player === 'B') {
                totals.friendly.B += score;
                totals.enemy.A += score;
            }
        }

        return totals;
    }

    applyDifficultyError(launch) {
        const baseAngle = Math.atan2(launch.vy, launch.vx);
        const requiredSpeed = Math.sqrt(launch.vx * launch.vx + launch.vy * launch.vy);
        const angleError = Math.pow(1 - this.config.accuracy, 1.05) * Math.PI / 10;
        const actualAngle = baseAngle + (Math.random() * 2 - 1) * angleError;
        const powerError = (1 - this.config.powerControl) * 0.14 * MAX_SPEED;
        const actualSpeed = Math.min(MAX_SPEED, Math.max(0.5, requiredSpeed + (Math.random() * 2 - 1) * powerError));

        return {
            vx: Math.cos(actualAngle) * actualSpeed,
            vy: Math.sin(actualAngle) * actualSpeed,
            launchX: launch.launchX,
            tactic: launch.tactic,
            target: launch.target,
            predictedStop: launch.predictedStop,
            predictedScore: launch.predictedScore,
            predictedEnemyScoreDrop: launch.predictedEnemyScoreDrop,
            plannedValue: launch.value
        };
    }

    createLaunchVector(piece, target, tactic, launchX = piece.x) {
        const dx = target.x - launchX;
        const dy = target.y - piece.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const baseAngle = Math.atan2(dy, dx);
        const tacticBoost = tactic === 'knockout' ? MAX_SPEED * 0.4 : 0;
        const requiredSpeed = Math.min(MAX_SPEED, Math.max(0.5, this.getRequiredSpeed(dist) + tacticBoost));

        return {
            vx: Math.cos(baseAngle) * requiredSpeed,
            vy: Math.sin(baseAngle) * requiredSpeed,
            baseAngle,
            requiredSpeed,
            launchX
        };
    }

    simulateShot(sourcePiece, game, vx, vy, options = {}) {
        const pieces = game.physics.pieces.map((piece, index) => ({
            x: piece === sourcePiece && options.launchX !== undefined ? options.launchX : piece.x,
            y: piece.y,
            vx: piece === sourcePiece ? vx : (piece.vx || 0),
            vy: piece === sourcePiece ? vy : (piece.vy || 0),
            radius: piece.radius || PIECE_RADIUS,
            player: piece.player,
            isLaunched: piece === sourcePiece ? true : piece.isLaunched,
            isActive: piece === sourcePiece ? true : piece.isActive,
            isDiscarded: !!piece.isDiscarded,
            hasEnteredBoard: !!piece.hasEnteredBoard,
            sourceIndex: index,
            isCurrent: piece === sourcePiece
        }));

        for (let frame = 0; frame < 460; frame++) {
            let anyActive = false;
            for (const piece of pieces) {
                piece.prevX = piece.x;
                piece.prevY = piece.y;
            }
            for (const piece of pieces) {
                if (!piece.isActive || piece.isDiscarded) continue;

                const prevX = piece.x;
                const prevY = piece.y;

                piece.x += piece.vx;
                piece.y += piece.vy;
                piece.vx *= FRICTION;
                piece.vy *= FRICTION;

                this.applySimulationBoundary(piece);
                this.applySimulationCollisions(piece, pieces, prevX, prevY);

                const speed = Math.sqrt(piece.vx * piece.vx + piece.vy * piece.vy);
                if (speed < SPEED_THRESHOLD) {
                    piece.vx = 0;
                    piece.vy = 0;
                    piece.isActive = false;
                } else {
                    anyActive = true;
                }
            }
            if (!anyActive) break;
        }

        return { pieces };
    }

    applySimulationBoundary(piece) {
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

    getSimulationSweptCollision(currentPiece, other, currentPrevX, currentPrevY) {
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

    resolveSimulationCollision(currentPiece, other, nx, ny, distance, minDist) {
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

    applySimulationCollisions(currentPiece, pieces, currentPrevX = currentPiece.prevX ?? currentPiece.x, currentPrevY = currentPiece.prevY ?? currentPiece.y) {
        for (const other of pieces) {
            if (other === currentPiece || !other.isLaunched || other.isDiscarded) continue;

            const dx = other.x - currentPiece.x;
            const dy = other.y - currentPiece.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = currentPiece.radius + other.radius;

            if (distance < minDist && distance > 0) {
                this.resolveSimulationCollision(currentPiece, other, dx / distance, dy / distance, distance, minDist);
                continue;
            }

            const swept = this.getSimulationSweptCollision(currentPiece, other, currentPrevX, currentPrevY);
            if (swept) {
                currentPiece.x = swept.currentX;
                currentPiece.y = swept.currentY;
                other.x = swept.otherX;
                other.y = swept.otherY;
                const hitDx = other.x - currentPiece.x;
                const hitDy = other.y - currentPiece.y;
                const hitDistance = Math.max(0.0001, Math.sqrt(hitDx * hitDx + hitDy * hitDy));
                this.resolveSimulationCollision(currentPiece, other, hitDx / hitDistance, hitDy / hitDistance, hitDistance, minDist);
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
                }
            }
        }
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
        if (launch.launchX !== undefined) {
            piece.x = launch.launchX;
        }
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
