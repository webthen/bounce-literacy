import * as PIXI from 'pixi.js';

interface Particle {
  gfx: PIXI.Graphics;
  vx: number;
  vy: number;
  life: number;
  decay: number;
}

export class ParticleSystem extends PIXI.Container {
  private particles: Particle[] = [];
  private pool: PIXI.Graphics[] = [];

  constructor() {
    super();
  }

  public burst(x: number, y: number, color: number = 0xFFD700, count: number = 25) {
    for (let i = 0; i < count; i++) {
      let g = this.pool.pop();
      if (!g) {
        g = new PIXI.Graphics();
      }
      g.clear();
      g.beginFill(color);
      // 绘制小星形或小圆片
      if (Math.random() > 0.5) {
        g.drawCircle(0, 0, Math.random() * 5 + 3);
      } else {
        const size = Math.random() * 6 + 4;
        g.drawRect(-size / 2, -size / 2, size, size);
      }
      g.endFill();

      g.x = x;
      g.y = y;
      g.alpha = 1.0;
      this.addChild(g);

      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * 9 + 4;

      this.particles.push({
        gfx: g,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1.0,
        decay: Math.random() * 0.03 + 0.025
      });
    }
  }

  public update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.gfx.x += p.vx * 60 * dt;
      p.gfx.y += p.vy * 60 * dt;
      p.vy += 0.25 * 60 * dt; // 微重力下落
      p.life -= p.decay * 60 * dt;
      p.gfx.alpha = Math.max(0, p.life);

      if (p.life <= 0) {
        this.removeChild(p.gfx);
        this.pool.push(p.gfx);
        this.particles.splice(i, 1);
      }
    }
  }

  public clearAll() {
    for (const p of this.particles) {
      this.removeChild(p.gfx);
      this.pool.push(p.gfx);
    }
    this.particles = [];
  }
}
