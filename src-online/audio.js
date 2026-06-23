import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { canUseVibration, loadSettings } from './settings.js';

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.settings = loadSettings();
        this.enabled = this.settings.audioEnabled;
        this.musicGain = null;
        this.musicTimer = null;
        this.musicPlaying = false;
        this.lastVibrateAt = 0;
    }

    refreshSettings() {
        this.settings = loadSettings();
        this.enabled = this.settings.audioEnabled;
        if (!this.settings.musicEnabled) {
            this.stopMusic();
        }
    }

    ensureContext() {
        this.refreshSettings();
        if (this.audioContext) return true;
        if (typeof window === 'undefined') return false;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            return true;
        } catch (e) {
            console.warn('Web Audio API unavailable', e);
            this.enabled = false;
            return false;
        }
    }

    setSoundEnabled(enabled) {
        this.enabled = Boolean(enabled);
        this.settings.audioEnabled = this.enabled;
    }

    setMusicEnabled(enabled) {
        this.settings.musicEnabled = Boolean(enabled);
        if (this.settings.musicEnabled) {
            this.startMusic();
        } else {
            this.stopMusic();
        }
    }

    setVibrationEnabled(enabled) {
        this.settings.vibrationEnabled = Boolean(enabled);
    }

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
        oscillator.frequency.setValueAtTime(340, now);
        oscillator.frequency.exponentialRampToValueAtTime(620, now + 0.13);
        gainNode.gain.setValueAtTime(0.14, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        oscillator.start(now);
        oscillator.stop(now + 0.18);
    }

    playCollision(oscillator, gainNode, now) {
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(240, now);
        oscillator.frequency.exponentialRampToValueAtTime(120, now + 0.08);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
        oscillator.start(now);
        oscillator.stop(now + 0.09);
    }

    playScore(oscillator, gainNode, now) {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523, now);
        oscillator.frequency.setValueAtTime(659, now + 0.09);
        oscillator.frequency.setValueAtTime(784, now + 0.18);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.34);
        oscillator.start(now);
        oscillator.stop(now + 0.34);
    }

    playWin(oscillator, gainNode, now) {
        oscillator.type = 'sine';
        [523, 659, 784, 1047].forEach((freq, index) => {
            oscillator.frequency.setValueAtTime(freq, now + index * 0.13);
        });
        gainNode.gain.setValueAtTime(0.22, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.68);
        oscillator.start(now);
        oscillator.stop(now + 0.68);
    }

    playBounce(oscillator, gainNode, now) {
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(420, now);
        oscillator.frequency.exponentialRampToValueAtTime(230, now + 0.045);
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        oscillator.start(now);
        oscillator.stop(now + 0.05);
    }

    resume() {
        if (!this.ensureContext()) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.startMusic();
    }

    startMusic() {
        this.refreshSettings();
        if (!this.settings.musicEnabled || this.musicPlaying || !this.audioContext) return;

        this.musicPlaying = true;
        this.musicGain = this.audioContext.createGain();
        this.musicGain.gain.setValueAtTime(0.035, this.audioContext.currentTime);
        this.musicGain.connect(this.audioContext.destination);

        const notes = [262, 330, 392, 523, 392, 330, 294, 392];
        let index = 0;
        const playNote = () => {
            if (!this.musicPlaying || !this.audioContext || !this.musicGain) return;
            const now = this.audioContext.currentTime;
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(notes[index % notes.length], now);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
            osc.connect(gain);
            gain.connect(this.musicGain);
            osc.start(now);
            osc.stop(now + 0.44);
            index++;
            this.musicTimer = setTimeout(playNote, 430);
        };
        playNote();
    }

    stopMusic() {
        this.musicPlaying = false;
        if (this.musicTimer) clearTimeout(this.musicTimer);
        this.musicTimer = null;
        if (this.musicGain) {
            try {
                this.musicGain.disconnect();
            } catch (_) {}
        }
        this.musicGain = null;
    }

    getHapticPattern(type) {
        return {
            launch: [8],
            bounce: [6],
            collision: [10, 18, 8],
            settle: [6],
            score: [14, 20, 10],
            miss: [10],
            runner: [16],
            win: [28, 30, 28]
        }[type] || [8];
    }

    async playNativeHaptic(type) {
        if (type === 'win') {
            await Haptics.notification({ type: NotificationType.Success });
            return;
        }

        const style = {
            collision: ImpactStyle.Medium,
            score: ImpactStyle.Heavy,
            runner: ImpactStyle.Medium,
            launch: ImpactStyle.Light,
            bounce: ImpactStyle.Light,
            settle: ImpactStyle.Light,
            miss: ImpactStyle.Light
        }[type] || ImpactStyle.Light;

        await Haptics.impact({ style });

        const duration = this.getHapticPattern(type).reduce((sum, item) => sum + item, 0);
        if (duration > 24) {
            await Haptics.vibrate({ duration: Math.min(120, duration) });
        }
    }

    vibrate(type) {
        this.refreshSettings();
        if (!canUseVibration()) return;
        if (!this.settings.vibrationEnabled) return;

        const now = Date.now();
        if (now - this.lastVibrateAt < 70) return;
        this.lastVibrateAt = now;

        this.playNativeHaptic(type).catch(() => {
            try {
                if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                    navigator.vibrate(this.getHapticPattern(type));
                }
            } catch (_) {}
        });
    }
}
