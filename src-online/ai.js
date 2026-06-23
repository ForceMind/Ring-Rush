/**
 * Pello AI.
 *
 * This is the mature bot architecture restored from the old desktop game:
 * search many launch positions and target paths, run the real headless
 * physics simulation for every candidate, then score the final board state.
 */

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
    SPEED_THRESHOLD,
    WIN_THRESHOLD
} from './constants.js';
import { Physics } from './physics.js';

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

export class AI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.config = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.medium;
        this.isThinking = false;
        this.thinkTimer = null;
        this.lastPrediction = null;
    }

    getSearchConfig() {
        if (this.difficulty === 'hard') {
            return { sliderSteps: 17, targetStep: 18, speedVariants: 3, useBanks: true };
        }
        if (this.difficulty === 'medium') {
            return { sliderSteps: 11, targetStep: 24, speedVariants: 2, useBanks: false };
        }
        return { sliderSteps: 7, targetStep: 34, speedVariants: 1, useBanks: false };
    }

    getDecisionConfig() {
        if (this.difficulty === 'hard') {
            return {
                nearOptimalWindow: 210,
                randomPickRate: 0.18,
                varietyPickRate: 0.26,
                temperature: 70,
                scoreWeights: { 0: 0.02, 2: 0.2, 3: 0.55, 4: 1.25, 5: 1.15 },
                angleError: 0,
                powerError: 0
            };
        }
        if (this.difficulty === 'medium') {
            return {
                nearOptimalWindow: 300,
                randomPickRate: 0.34,
                varietyPickRate: 0.38,
                temperature: 105,
                scoreWeights: { 0: 0.12, 2: 0.75, 3: 1.25, 4: 1.3, 5: 0.7 },
                angleError: Math.PI / 90,
                powerError: 0.04
            };
        }
        return {
            nearOptimalWindow: 440,
            randomPickRate: 0.58,
            varietyPickRate: 0.5,
            temperature: 160,
            scoreWeights: { 0: 0.45, 2: 1.15, 3: 1.2, 4: 0.85, 5: 0.5 },
            angleError: Math.PI / 36,
            powerError: 0.11
        };
    }

    getLaunchStartX(sliderValue, game) {
        const minX = CENTER_X - LAUNCH_LANE_HALF_WIDTH + PIECE_RADIUS;
        const maxX = CENTER_X + LAUNCH_LANE_HALF_WIDTH - PIECE_RADIUS;
        return game.perspective === 'top'
            ? maxX - sliderValue * (maxX - minX)
            : minX + sliderValue * (maxX - minX);
    }

    getRequiredStopSpeed(distance) {
        const tailDistance = SPEED_THRESHOLD / Math.max(0.001, 1 - FRICTION);
        return (distance + tailDistance) * (1 - FRICTION);
    }

    getPlayerProgress(runnerPosition, player) {
        return player === 'B' ? runnerPosition : -runnerPosition;
    }

    progressToRunnerPosition(progress, player) {
        const runnerPosition = player === 'B' ? progress : -progress;
        return Math.max(-WIN_THRESHOLD, Math.min(WIN_THRESHOLD, runnerPosition));
    }

    isSimDiscarded(piece) {
        return piece.isDiscarded || (!piece.hasEnteredBoard && piece.isLaunched && !piece.isActive);
    }

    getPieceScore(game, piece) {
        if (!piece || this.isSimDiscarded(piece) || piece.player === 'N') return 0;
        return game.board.calculateScore(piece);
    }

    addTarget(targets, targetKeys, x, y, kind = 'score', priority = 0, allowBank = false) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const key = `${Math.round(x)}:${Math.round(y)}:${kind}`;
        if (targetKeys.has(key)) return;
        targetKeys.add(key);
        targets.push({ x, y, kind, priority, allowBank });
    }

    collectTargets(game, piece, searchConfig) {
        const targets = [];
        const targetKeys = new Set();
        const minX = CENTER_X - 160;
        const maxX = CENTER_X + 160;
        const minY = CENTER_Y - 160;
        const maxY = CENTER_Y + 160;

        this.addTarget(targets, targetKeys, CENTER_X, CENTER_Y, 'score', 5, searchConfig.useBanks);

        for (let x = minX; x <= maxX; x += searchConfig.targetStep) {
            for (let y = minY; y <= maxY; y += searchConfig.targetStep) {
                const score = game.board.calculateScore({ x, y, player: piece.player });
                if (score > 0) {
                    this.addTarget(targets, targetKeys, x, y, 'score', score, searchConfig.useBanks && score >= 4);
                }
            }
        }

        for (const p of game.physics.pieces) {
            if (!p.isLaunched || p.isDiscarded || p.isActive || p === piece) continue;

            const score = game.board.calculateScore(p);
            if (p.player === piece.player) {
                this.addTarget(targets, targetKeys, p.x, p.y, 'friend', score, false);
            } else if (p.player === 'N') {
                this.addTarget(targets, targetKeys, p.x, p.y, 'neutral', score, searchConfig.useBanks);
            } else {
                this.addTarget(targets, targetKeys, p.x, p.y, 'enemy', score, searchConfig.useBanks);
            }
        }

        return targets;
    }

    addCandidatesForTarget(candidates, candidateKeys, target, searchConfig, startY, game) {
        const addCandidate = (tx, ty, bank = false) => {
            for (let svIdx = 0; svIdx < searchConfig.sliderSteps; svIdx++) {
                const sliderValue = searchConfig.sliderSteps === 1
                    ? 0.5
                    : svIdx / (searchConfig.sliderSteps - 1);
                const startX = this.getLaunchStartX(sliderValue, game);
                const dx = tx - startX;
                const dy = ty - startY;
                const distance = Math.hypot(dx, dy);
                if (distance < 1) continue;

                const angle = Math.atan2(dy, dx);
                const stopSpeed = this.getRequiredStopSpeed(distance);
                const speeds = [stopSpeed];

                if (searchConfig.speedVariants >= 2) {
                    speeds.push(stopSpeed + (target.kind === 'score' ? 2.4 : 4.2));
                }
                if (searchConfig.speedVariants >= 3) {
                    speeds.push(target.kind === 'score' ? stopSpeed + 5.2 : MAX_SPEED);
                }

                for (const rawSpeed of speeds) {
                    const speed = Math.max(0.5, Math.min(MAX_SPEED, rawSpeed));
                    const key = `${svIdx}:${Math.round(angle * 1000)}:${Math.round(speed * 10)}:${bank ? 1 : 0}`;
                    if (candidateKeys.has(key)) continue;
                    candidateKeys.add(key);
                    candidates.push({
                        angle,
                        bank,
                        speed,
                        startX,
                        launchX: startX,
                        sliderValue,
                        targetKind: target.kind,
                        targetPriority: target.priority
                    });
                }
            }
        };

        addCandidate(target.x, target.y, false);

        if (target.allowBank) {
            const boardLeft = BOARD_X + PIECE_RADIUS;
            const boardRight = BOARD_X + BOARD_WIDTH - PIECE_RADIUS;
            addCandidate(boardLeft - (target.x - boardLeft), target.y, true);
            addCandidate(boardRight + (boardRight - target.x), target.y, true);
        }
    }

    buildCandidates(game, piece) {
        const searchConfig = this.getSearchConfig();
        const targets = this.collectTargets(game, piece, searchConfig);
        const candidates = [];
        const candidateKeys = new Set();

        for (const target of targets) {
            this.addCandidatesForTarget(candidates, candidateKeys, target, searchConfig, piece.y, game);
        }

        return candidates;
    }

    clonePiecesForSimulation(originalPieces) {
        return originalPieces.map(p => ({
            x: p.x,
            y: p.y,
            vx: p.vx || 0,
            vy: p.vy || 0,
            radius: p.radius || PIECE_RADIUS,
            player: p.player,
            isActive: !!p.isActive,
            isLaunched: !!p.isLaunched,
            isDiscarded: !!p.isDiscarded,
            hasEnteredBoard: !!p.hasEnteredBoard,
            originalRef: p
        }));
    }

    simulateCandidate(piece, game, candidate) {
        const simPieces = this.clonePiecesForSimulation(game.physics.pieces);
        const simShooter = simPieces.find(p => p.originalRef === piece);
        if (!simShooter) return null;

        simShooter.x = candidate.startX;
        simShooter.y = piece.y;
        simShooter.vx = Math.cos(candidate.angle) * candidate.speed;
        simShooter.vy = Math.sin(candidate.angle) * candidate.speed;
        simShooter.isActive = true;
        simShooter.isLaunched = true;
        simShooter.isDiscarded = false;

        let steps = 0;
        while (Physics.simulateStep(simPieces) && steps < 520) {
            steps++;
        }

        return { simPieces, simShooter, steps };
    }

    evaluateSimulation(piece, game, candidate, simulation, baseProgress, baseScores) {
        const { simPieces, simShooter, steps } = simulation;
        const shotScore = this.getPieceScore(game, simShooter);
        const validShot = !this.isSimDiscarded(simShooter) && simShooter.hasEnteredBoard;
        const progressAfter = baseProgress + shotScore;
        const scoreNeeded = WIN_THRESHOLD - baseProgress;
        const opponentDistanceAfter = WIN_THRESHOLD + progressAfter;
        const myPiecesLeft = piece.player === 'A' ? game.piecesLeftA : game.piecesLeftB;
        const opponentPiecesLeft = piece.player === 'A' ? game.piecesLeftB : game.piecesLeftA;

        let ownBoardDelta = 0;
        let opponentBoardDelta = 0;
        let friendlyMovementPenalty = 0;
        let opponentDisruptionBonus = 0;

        for (const p of simPieces) {
            const original = p.originalRef;
            if (!original || original === piece || original.player === 'N') continue;

            const finalScore = this.getPieceScore(game, p);
            const originalScore = baseScores.get(original) || 0;
            const moved = Math.hypot(p.x - original.x, p.y - original.y);

            if (original.player === piece.player) {
                ownBoardDelta += finalScore - originalScore;
                if (moved > PIECE_RADIUS * 0.75) {
                    friendlyMovementPenalty += Math.min(10, moved / 18);
                }
            } else {
                opponentBoardDelta += finalScore - originalScore;
                if (originalScore >= 3 && finalScore < originalScore) {
                    opponentDisruptionBonus += originalScore - finalScore;
                }
            }
        }

        let value = 0;

        if (!validShot) {
            value -= 420;
        }

        value += shotScore * 135;
        value += Math.min(shotScore, Math.max(0, scoreNeeded)) * 35;

        if (shotScore === 0) {
            value -= 115;
        } else if (shotScore >= 4) {
            value += 55;
        }

        if (progressAfter >= WIN_THRESHOLD) {
            value += 10000 + shotScore * 120;
        }

        if (baseProgress < 0) {
            value += shotScore * Math.min(70, Math.abs(baseProgress) * 18);
        }

        if (opponentPiecesLeft > 0 && opponentDistanceAfter <= 5) {
            value -= (6 - opponentDistanceAfter) * 85;
        }

        if (myPiecesLeft === 1 && opponentPiecesLeft === 0) {
            if (progressAfter > 0) {
                value += 2200 + progressAfter * 120;
            } else if (progressAfter === 0) {
                value -= 220;
            } else {
                value -= 2600 + Math.abs(progressAfter) * 130;
            }
        }

        value += ownBoardDelta * 7;
        value -= opponentBoardDelta * 5;
        value += opponentDisruptionBonus * 8;
        value -= friendlyMovementPenalty * 6;

        if (validShot) {
            const distToCenter = Math.hypot(simShooter.x - CENTER_X, simShooter.y - CENTER_Y);
            value += Math.max(0, 160 - distToCenter) * 0.08;

            const edgeClearance = Math.min(
                simShooter.x - (BOARD_X + PIECE_RADIUS),
                BOARD_X + BOARD_WIDTH - PIECE_RADIUS - simShooter.x,
                simShooter.y - (BOARD_Y + PIECE_RADIUS),
                BOARD_Y + BOARD_HEIGHT - PIECE_RADIUS - simShooter.y
            );
            if (edgeClearance < PIECE_RADIUS * 0.8) {
                value -= 30;
            }

            const nearOpponentLaunch = piece.player === 'B'
                ? simShooter.y > BOARD_Y + BOARD_HEIGHT - 90
                : simShooter.y < BOARD_Y + 90;
            if (nearOpponentLaunch) {
                value -= 16;
            }
        }

        value -= Math.abs(candidate.sliderValue - 0.5) * 0.35;
        value -= candidate.speed * 0.04;
        value -= candidate.bank ? 2.5 : 0;
        value -= steps >= 520 ? 20 : 0;

        return {
            value,
            predictedScore: shotScore,
            predictedStop: { x: simShooter.x, y: simShooter.y },
            progressAfter,
            runnerPositionAfter: this.progressToRunnerPosition(progressAfter, piece.player),
            validShot
        };
    }

    isCriticalDecision(piece, game, launch, baseProgress) {
        const opponentDistanceAfter = WIN_THRESHOLD + launch.progressAfter;
        const myPiecesLeft = piece.player === 'A' ? game.piecesLeftA : game.piecesLeftB;
        const opponentPiecesLeft = piece.player === 'A' ? game.piecesLeftB : game.piecesLeftA;

        if (launch.progressAfter >= WIN_THRESHOLD || myPiecesLeft <= 1) return true;

        if (this.difficulty === 'hard') {
            return baseProgress < 0
                || myPiecesLeft <= 2
                || (opponentPiecesLeft > 0 && opponentDistanceAfter <= 5);
        }

        if (this.difficulty === 'medium') {
            return baseProgress <= -2
                || (opponentPiecesLeft > 0 && opponentDistanceAfter <= 4);
        }

        return baseProgress <= -4
            || (opponentPiecesLeft > 0 && opponentDistanceAfter <= 2);
    }

    getMinimumSelectableScore(bestScore) {
        if (this.difficulty === 'hard') {
            if (bestScore >= 4) return 4;
            return bestScore;
        }
        if (this.difficulty === 'medium') {
            if (bestScore >= 4) return 3;
            return Math.max(0, bestScore - 1);
        }
        return 0;
    }

    weightedPickLaunch(pool, bestValue, decisionConfig) {
        let totalWeight = 0;
        const weighted = pool.map(launch => {
            const scoreWeight = decisionConfig.scoreWeights[launch.predictedScore] || 0.25;
            const valueWeight = Math.exp((launch.tacticalValue - bestValue) / decisionConfig.temperature);
            const weight = Math.max(0.001, valueWeight * scoreWeight);
            totalWeight += weight;
            return { launch, weight };
        });

        let roll = Math.random() * totalWeight;
        for (const item of weighted) {
            roll -= item.weight;
            if (roll <= 0) return item.launch;
        }
        return weighted[weighted.length - 1]?.launch || pool[0];
    }

    selectLaunch(evaluatedLaunches, piece, game, baseProgress) {
        if (evaluatedLaunches.length === 0) return null;

        const sorted = [...evaluatedLaunches].sort((a, b) => b.tacticalValue - a.tacticalValue);
        const best = sorted[0];
        const decisionConfig = this.getDecisionConfig();

        if (this.isCriticalDecision(piece, game, best, baseProgress)) {
            return { ...best, selectionReason: 'critical-best' };
        }

        const minimumSelectableScore = this.getMinimumSelectableScore(best.predictedScore);
        const nearOptimal = sorted.filter(launch =>
            launch.validShot
            && launch.predictedScore >= minimumSelectableScore
            && best.tacticalValue - launch.tacticalValue <= decisionConfig.nearOptimalWindow
        );

        if (best.predictedScore === 5 && Math.random() < decisionConfig.varietyPickRate) {
            const alternatives = nearOptimal.filter(launch =>
                launch.predictedScore >= minimumSelectableScore && launch.predictedScore < 5
            );
            if (alternatives.length > 0) {
                return {
                    ...this.weightedPickLaunch(alternatives, best.tacticalValue, decisionConfig),
                    selectionReason: 'near-optimal-variety'
                };
            }
        }

        if (nearOptimal.length > 1 && Math.random() < decisionConfig.randomPickRate) {
            return {
                ...this.weightedPickLaunch(nearOptimal, best.tacticalValue, decisionConfig),
                selectionReason: 'near-optimal-weighted'
            };
        }

        return { ...best, selectionReason: 'best' };
    }

    applyDifficultyError(launch) {
        const speed = Math.hypot(launch.vx, launch.vy);
        if (speed <= 0) return launch;

        const decisionConfig = this.getDecisionConfig();
        if (decisionConfig.angleError <= 0 && decisionConfig.powerError <= 0) return launch;

        const angle = Math.atan2(launch.vy, launch.vx);
        const actualAngle = angle + (Math.random() * 2 - 1) * decisionConfig.angleError;
        const actualSpeed = Math.max(
            0.5,
            Math.min(MAX_SPEED, speed * (1 + (Math.random() * 2 - 1) * decisionConfig.powerError))
        );

        return {
            ...launch,
            vx: Math.cos(actualAngle) * actualSpeed,
            vy: Math.sin(actualAngle) * actualSpeed
        };
    }

    async calculateLaunch(piece, game) {
        let bestValue = -Infinity;
        let bestLaunch = {
            vx: 0,
            vy: 0,
            sliderValue: 0.5,
            startX: this.getLaunchStartX(0.5, game),
            launchX: this.getLaunchStartX(0.5, game),
            predictedScore: 0,
            predictedStop: null,
            runnerPositionAfter: game.runnerPosition || 0,
            validShot: false
        };
        const evaluatedLaunches = [];

        const originalPieces = game.physics.pieces;
        const candidates = this.buildCandidates(game, piece);
        const baseProgress = this.getPlayerProgress(game.runnerPosition || 0, piece.player);
        const baseScores = new Map();
        for (const p of originalPieces) {
            baseScores.set(p, this.getPieceScore(game, p));
        }

        let lastYieldTime = now();
        for (const candidate of candidates) {
            const currentTime = now();
            if (currentTime - lastYieldTime > 16) {
                await new Promise(resolve => setTimeout(resolve, 0));
                lastYieldTime = now();
            }

            const simulation = this.simulateCandidate(piece, game, candidate);
            if (!simulation) continue;

            const evaluation = this.evaluateSimulation(
                piece,
                game,
                candidate,
                simulation,
                baseProgress,
                baseScores
            );

            const launch = {
                vx: Math.cos(candidate.angle) * candidate.speed,
                vy: Math.sin(candidate.angle) * candidate.speed,
                sliderValue: candidate.sliderValue,
                startX: candidate.startX,
                launchX: candidate.startX,
                predictedScore: evaluation.predictedScore,
                predictedStop: evaluation.predictedStop,
                runnerPositionAfter: evaluation.runnerPositionAfter,
                tacticalValue: evaluation.value,
                progressAfter: evaluation.progressAfter,
                validShot: evaluation.validShot,
                targetKind: candidate.targetKind,
                targetPriority: candidate.targetPriority
            };

            if (evaluation.value > bestValue) {
                bestValue = evaluation.value;
                bestLaunch = launch;
            }

            evaluatedLaunches.push(launch);
        }

        bestLaunch = this.selectLaunch(evaluatedLaunches, piece, game, baseProgress) || bestLaunch;
        bestLaunch = this.applyDifficultyError(bestLaunch);
        this.lastPrediction = {
            predictedScore: bestLaunch.predictedScore,
            predictedStop: bestLaunch.predictedStop,
            runnerPositionAfter: bestLaunch.runnerPositionAfter,
            tacticalValue: bestLaunch.tacticalValue,
            selectionReason: bestLaunch.selectionReason,
            validShot: bestLaunch.validShot
        };

        return bestLaunch;
    }

    async animateSlider(game, targetValue) {
        if (!game.input?.applySliderToPiece) return;

        return new Promise(resolve => {
            const startValue = game.input.sliderValue;
            const distance = targetValue - startValue;
            if (Math.abs(distance) < 0.01 || !globalThis.requestAnimationFrame) {
                game.input.sliderValue = targetValue;
                game.input.applySliderToPiece();
                resolve();
                return;
            }

            const duration = 500;
            const startTime = now();

            const step = (currentTime) => {
                const currentPiece = game.getCurrentPiece();
                if (!this.isThinking || game.gameOver || game.dice?.phase || !currentPiece || currentPiece.isLaunched) {
                    resolve();
                    return;
                }

                const progress = (currentTime - startTime) / duration;
                if (progress >= 1) {
                    game.input.sliderValue = targetValue;
                    game.input.applySliderToPiece();
                    resolve();
                } else {
                    const ease = progress < 0.5
                        ? 2 * progress * progress
                        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
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

        await this.think((this.config.thinkTime || 800) / 2);

        const piece = game.getCurrentPiece();
        if (!piece || !this.isThinking) {
            this.isThinking = false;
            return;
        }

        const launch = await this.calculateLaunch(piece, game);

        await this.animateSlider(game, launch.sliderValue);

        if (!this.isThinking) return;

        if (game.input) {
            game.input.sliderValue = launch.sliderValue;
            game.input.applySliderToPiece?.();
        }
        piece.x = launch.startX ?? launch.launchX ?? piece.x;

        await this.think((this.config.thinkTime || 800) / 2);

        if (!this.isThinking) return;

        piece.vx = launch.vx;
        piece.vy = launch.vy;
        piece.isLaunched = true;
        piece.isActive = true;
        piece.launchFlash = 1;
        game.isAnimating = true;
        game.audio?.play?.('launch');
        game.triggerFeedback?.('launch');
        this.isThinking = false;
    }

    think(time = this.config.thinkTime || 800) {
        return new Promise(resolve => {
            const jitter = Math.random() * 200 - 100;
            this.thinkTimer = setTimeout(resolve, Math.max(0, time + jitter));
        });
    }

    cancel() {
        if (this.thinkTimer) clearTimeout(this.thinkTimer);
        this.thinkTimer = null;
        this.isThinking = false;
    }
}
