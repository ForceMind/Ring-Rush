/**
 * Ring Rush - AI
 * AI 对手逻辑 - 支持多难度等级的电脑玩家
 */

import { AI_DIFFICULTY, MAX_SPEED, CENTER_X, CENTER_Y, BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT } from './constants.js';
import { Physics } from './physics.js';

export class AI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.config = AI_DIFFICULTY[difficulty];
        this.isThinking = false;
        this.thinkTimer = null;
    }

    async calculateLaunch(piece, game) {
        let bestScore = -9999;
        let bestLaunch = { vx: 0, vy: 0, sliderValue: 0.5 };

        // Define search space
        let svSteps, speedSteps;
        if (this.difficulty === 'hard') {
            svSteps = 21; // 10px spacing
            speedSteps = 3;
        } else if (this.difficulty === 'medium') {
            svSteps = 11; // 20px spacing
            speedSteps = 2;
        } else {
            svSteps = 5;  // 50px spacing
            speedSteps = 1;
        }

        const PIECE_RADIUS = 18;
        const minX = CENTER_X - 100 + PIECE_RADIUS;
        const maxX = CENTER_X + 100 - PIECE_RADIUS;
        const startY = piece.y; 

        const isShootingDown = startY < CENTER_Y;
        
        const originalPieces = game.physics.pieces;
        const candidates = [];

        const addTarget = (tx, ty) => {
            for (let svIdx = 0; svIdx < svSteps; svIdx++) {
                const sv = svSteps === 1 ? 0.5 : svIdx / (svSteps - 1);
                let startX = game.perspective === 'top' ? maxX - sv * (maxX - minX) : minX + sv * (maxX - minX);

                const dx = tx - startX;
                const dy = ty - startY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                
                // 停止在此处所需的精确速度 = (位移 + 阈值截断带来的提前量) * (1 - 摩擦力)
                // 剩余滑行距离约为 SPEED_THRESHOLD / 0.015 = 0.1 / 0.015 = 6.66
                const exactSpeed = (dist + 6.66) * 0.015;
                if (exactSpeed <= MAX_SPEED) {
                    candidates.push({ sv, angle, speed: exactSpeed, startX });
                    if (speedSteps > 1 && exactSpeed + 3 <= MAX_SPEED) {
                        candidates.push({ sv, angle, speed: exactSpeed + 3, startX });
                    }
                    if (speedSteps > 2) {
                        candidates.push({ sv, angle, speed: MAX_SPEED, startX });
                    }
                }
            }
        };

        for (let tx = CENTER_X - 115; tx <= CENTER_X + 115; tx += 15) {
            for (let ty = CENTER_Y - 115; ty <= CENTER_Y + 115; ty += 15) {
                const distToCenter = Math.sqrt((tx - CENTER_X)**2 + (ty - CENTER_Y)**2);
                if (distToCenter <= 115) {
                    // Direct shot
                    addTarget(tx, ty);
                    
                    // Bank shots for hard difficulty
                    if (this.difficulty === 'hard') {
                        const boardLeft = BOARD_X + PIECE_RADIUS;
                        const vLeftX = boardLeft - (tx - boardLeft);
                        addTarget(vLeftX, ty);

                        const boardRight = BOARD_X + BOARD_WIDTH - PIECE_RADIUS;
                        const vRightX = boardRight + (boardRight - tx);
                        addTarget(vRightX, ty);
                    }
                }
            }
        }

        // Add explicit targets for all pieces currently on the board
        for (const p of originalPieces) {
            if (p.isLaunched && !p.isDiscarded && p.isActive === false && p.player !== 'N') {
                addTarget(p.x, p.y);
                if (this.difficulty === 'hard') {
                    const boardLeft = BOARD_X + PIECE_RADIUS;
                    addTarget(boardLeft - (p.x - boardLeft), p.y);
                    const boardRight = BOARD_X + BOARD_WIDTH - PIECE_RADIUS;
                    addTarget(boardRight + (boardRight - p.x), p.y);
                }
            }
        }

        let lastYieldTime = performance.now();
        for (const cand of candidates) {
            if (!this.isThinking) return bestLaunch; // Break if turn cancelled
            
            const now = performance.now();
            if (now - lastYieldTime > 16) {
                // Yield to event loop to keep animations smooth (60 FPS)
                await new Promise(resolve => setTimeout(resolve, 0));
                lastYieldTime = performance.now();
            }
            const vx = Math.cos(cand.angle) * cand.speed;
            const vy = Math.sin(cand.angle) * cand.speed;

            // Setup simulation sandbox
            const simPieces = originalPieces.map(p => {
                return {
                    x: p.x,
                    y: p.y,
                    vx: p.vx,
                    vy: p.vy,
                    radius: p.radius,
                    player: p.player,
                    isActive: p.isActive,
                    isLaunched: p.isLaunched,
                    isDiscarded: p.isDiscarded,
                    hasEnteredBoard: p.hasEnteredBoard,
                    originalRef: p
                };
            });

            const simShooter = simPieces.find(p => p.originalRef === piece);
            if (!simShooter) continue;
            
            simShooter.x = cand.startX;
            simShooter.y = startY;
            simShooter.vx = vx;
            simShooter.vy = vy;
            simShooter.isActive = true;
            simShooter.isLaunched = true;

            // Run simulation
            let steps = 0;
            while (Physics.simulateStep(simPieces) && steps < 300) {
                steps++;
            }

            // Evaluate board state
            let myScore = 0;
            let opScore = 0;

            for (const p of simPieces) {
                let isDiscardedSim = p.isDiscarded || (!p.hasEnteredBoard && p.isLaunched && !p.isActive);
                if (isDiscardedSim || p.player === 'N') continue;
                
                const s = game.board.calculateScore(p);
                
                if (p.player === piece.player) {
                    myScore += s;
                    // Add a tiny penalty if our piece is too close to opponent's launch zone
                    if (isShootingDown && p.y > BOARD_Y + BOARD_HEIGHT - 100) {
                        myScore -= 0.5;
                    } else if (!isShootingDown && p.y < BOARD_Y + 100) {
                        myScore -= 0.5;
                    }
                } else {
                    opScore += s;
                }
            }

            const sliderBias = -Math.abs(cand.sv - 0.5) * 0.1;
            // 增加最多 0.4 的随机分数（小于最小的分差步长 0.5），用来在同等收益的选项中随机挑一个，避免每次开局完全一致
            const noiseScore = Math.random() * 0.4;
            const netScore = myScore - opScore * 1.5 + sliderBias + noiseScore;

            if (netScore > bestScore) {
                bestScore = netScore;
                bestLaunch = { vx, vy, sliderValue: cand.sv };
            }
        }

        // Add some noise for lower difficulties
        if (this.difficulty === 'easy') {
            bestLaunch.vx += (Math.random() - 0.5) * 1.5;
            bestLaunch.vy += (Math.random() - 0.5) * 1.5;
        }

        return bestLaunch;
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

        const launch = await this.calculateLaunch(piece, game);

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
