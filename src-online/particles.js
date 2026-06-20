/**
 * Ring Rush - Particle System
 * 粒子系统 - 碰撞火花、得分光效、胜利烟花
 */

export class Particle {
    constructor(x, y, color, vx, vy, life, size) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.alpha = 1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // 重力
        this.life--;
        this.alpha = this.life / this.maxLife;
        this.size *= 0.98;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

export class ParticleSystem {
    constructor() {
        this.particles = [];
        this.maxParticles = 120;
    }

    addParticle(particle) {
        this.particles.push(particle);
        if (this.particles.length > this.maxParticles) {
            this.particles.splice(0, this.particles.length - this.maxParticles);
        }
    }

    // 碰撞火花
    emitCollision(x, y, color1, color2, intensity = 1) {
        const strength = Math.max(0.6, Math.min(2.1, intensity));
        const count = Math.round(8 + strength * 5);
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const speed = (2.2 + Math.random() * 2.8) * strength;
            const color = Math.random() > 0.5 ? color1 : color2;
            this.addParticle(new Particle(
                x, y, color,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                14 + Math.random() * 12,
                2 + Math.random() * 2.2 * strength
            ));
        }
    }

    // 得分光效
    emitScore(x, y) {
        const colors = ['#ffd700', '#ffed4a', '#fff3b0'];
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.8 + Math.random() * 2.6;
            this.addParticle(new Particle(
                x, y,
                colors[Math.floor(Math.random() * colors.length)],
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 1.4,
                28 + Math.random() * 18,
                1.8 + Math.random() * 2.2
            ));
        }
    }

    // 胜利烟花
    emitWin(x, y) {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffd700'];
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 6;
            this.addParticle(new Particle(
                x + Math.random() * 40 - 20,
                y + Math.random() * 40 - 20,
                colors[Math.floor(Math.random() * colors.length)],
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 3,
                40 + Math.random() * 40,
                3 + Math.random() * 5
            ));
        }
    }

    update() {
        this.particles = this.particles.filter(p => {
            p.update();
            return !p.isDead();
        });
    }

    draw(ctx) {
        this.particles.forEach(p => p.draw(ctx));
    }

    clear() {
        this.particles = [];
    }
}
