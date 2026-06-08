/**
 * Ring Rush - Audio Manager
 * 音效管理器 - 使用 Web Audio API 生成游戏音效
 */

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
    }

    /**
     * 懒初始化 AudioContext（仅在首次需要时创建）
     * 避免在用户交互之前创建 AudioContext 导致浏览器警告
     */
    ensureContext() {
        if (this.audioContext) return true;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            return true;
        } catch (e) {
            console.warn('Web Audio API 不可用');
            this.enabled = false;
            return false;
        }
    }

    // 生成音效
    play(type) {
        if (!this.enabled) return;
        if (!this.ensureContext()) return;

        const now = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        switch (type) {
            case 'launch':
                this.playLaunch(oscillator, gainNode, now);
                break;
            case 'collision':
                this.playCollision(oscillator, gainNode, now);
                break;
            case 'score':
                this.playScore(oscillator, gainNode, now);
                break;
            case 'win':
                this.playWin(oscillator, gainNode, now);
                break;
            case 'bounce':
                this.playBounce(oscillator, gainNode, now);
                break;
        }
    }

    playLaunch(oscillator, gainNode, now) {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(300, now);
        oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        oscillator.start(now);
        oscillator.stop(now + 0.2);
    }

    playCollision(oscillator, gainNode, now) {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200, now);
        oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
    }

    playScore(oscillator, gainNode, now) {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523, now);
        oscillator.frequency.setValueAtTime(659, now + 0.1);
        oscillator.frequency.setValueAtTime(784, now + 0.2);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
    }

    playWin(oscillator, gainNode, now) {
        oscillator.type = 'sine';
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            oscillator.frequency.setValueAtTime(freq, now + i * 0.15);
        });
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        oscillator.start(now);
        oscillator.stop(now + 0.8);
    }

    playBounce(oscillator, gainNode, now) {
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(400, now);
        oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.05);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        oscillator.start(now);
        oscillator.stop(now + 0.05);
    }

    resume() {
        if (!this.enabled) return;
        if (!this.ensureContext()) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
}
