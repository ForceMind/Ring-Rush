/**
 * Ring Rush - AI
 * AI 对手逻辑 - 支持多难度等级的电脑玩家
 */

import { AI_DIFFICULTY, MAX_SPEED, CENTER_X, CENTER_Y, BOARD_Y, BOARD_HEIGHT } from './constants.js';
import { Physics } from './physics.js';

export class AI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.config = AI_DIFFICULTY[difficulty];
        this.isThinking = false;
        this.thinkTimer = null;
    }

    calculateLaunch(piece, game) {
        let bestScore = -9999;
        let bestLaunch = { vx: 0, vy: 0, sliderValue: 0.5 };

        // Define search space
        let svSteps, angleSteps, speedSteps;
        if (this.difficulty === 'hard') {
            svSteps = 11;
            angleSteps = 30;
            speedSteps = 5;
        } else if (this.difficulty === 'medium') {
            svSteps = 5;
            angleSteps = 15;
            speedSteps = 3;
        } else {
            svSteps = 3;
            angleSteps = 7;
            speedSteps = 2;
        }

        const PIECE_RADIUS = 18;
        const minX = (600 / 2) - 100 + PIECE_RADIUS;
        const maxX = (600 / 2) + 100 - PIECE_RADIUS;
        const startY = piece.y; 

        const isShootingDown = startY < CENTER_Y;
        const angleStart = isShootingDown ? 0 : Math.PI;
        
        const originalPieces = game.physics.pieces;

        for (let svIdx = 0; svIdx < svSteps; svIdx++) {
            const sv = svSteps === 1 ? 0.5 : svIdx / (svSteps - 1);
            
            let startX;
            if (game.perspective === 'top') {
                startX = maxX - sv * (maxX - minX);
            } else {
                startX = minX + sv * (maxX - minX);
            }

            for (let aIdx = 0; aIdx < angleSteps; aIdx++) {
                const angle = angleStart + (aIdx / Math.max(1, angleSteps - 1)) * Math.PI;

                for (let sIdx = 0; sIdx < speedSteps; sIdx++) {
                    const speed = (sIdx + 1) / speedSteps * MAX_SPEED;

                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed;

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
                    
                    simShooter.x = startX;
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

                    const sliderBias = -Math.abs(sv - 0.5) * 0.1;
                    const netScore = myScore - opScore * 1.5 + sliderBias;

                    if (netScore > bestScore) {
                        bestScore = netScore;
                        bestLaunch = { vx, vy, sliderValue: sv };
                    }
                }
            }
        }

        // Add some noise for lower difficulties
        if (this.difficulty === 'easy') {
            bestLaunch.vx += (Math.random() - 0.5) * 5;
            bestLaunch.vy += (Math.random() - 0.5) * 5;
        } else if (this.difficulty === 'medium') {
            bestLaunch.vx += (Math.random() - 0.5) * 2;
            bestLaunch.vy += (Math.random() - 0.5) * 2;
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
