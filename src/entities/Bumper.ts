import * as PIXI from 'pixi.js';

export class Bumper extends PIXI.Container {
  public blockId: string;
  public r: number;
  private bgGfx: PIXI.Graphics;
  private iconText: PIXI.Text;
  private pulseTimer: number = 0;

  constructor(id: string, r: number = 35) {
    super();
    this.blockId = id;
    this.r = r;

    this.bgGfx = new PIXI.Graphics();
    this.drawBumper();
    this.addChild(this.bgGfx);

    this.iconText = new PIXI.Text('⚡', {
      fontSize: 24,
      fill: 0xFFFFFF,
      fontWeight: 'bold'
    });
    this.iconText.anchor.set(0.5);
    this.addChild(this.iconText);
  }

  private drawBumper() {
    this.bgGfx.clear();
    this.bgGfx.lineStyle(4, 0xFFFFFF, 1);
    this.bgGfx.beginFill(0xD50000);
    this.bgGfx.drawCircle(0, 0, this.r);
    this.bgGfx.endFill();

    this.bgGfx.lineStyle(0);
    this.bgGfx.beginFill(0xFF5252, 0.9);
    this.bgGfx.drawCircle(0, 0, this.r * 0.7);
    this.bgGfx.endFill();
  }

  public triggerPulse() {
    this.pulseTimer = 0.2;
  }

  public update(dt: number) {
    if (this.pulseTimer > 0) {
      this.pulseTimer -= dt;
      const t = this.pulseTimer / 0.2;
      const s = 1.0 + Math.sin(t * Math.PI) * 0.3;
      this.scale.set(s, s);
    } else {
      this.scale.set(1.0, 1.0);
    }
  }
}

export class Obstacle extends PIXI.Container {
  public blockId: string;
  public w: number;
  public h: number;
  private bgGfx: PIXI.Graphics;
  private hitTimer: number = 0;

  constructor(id: string, w: number = 96, h: number = 96) {
    super();
    this.blockId = id;
    this.w = w;
    this.h = h;

    this.bgGfx = new PIXI.Graphics();
    this.drawBox();
    this.addChild(this.bgGfx);
  }

  private drawBox() {
    this.bgGfx.clear();
    this.bgGfx.lineStyle(4, 0x8D6E63, 1);
    this.bgGfx.beginFill(0xBCAAA4);
    this.bgGfx.drawRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 14);
    this.bgGfx.endFill();
  }

  public triggerHit() {
    this.hitTimer = 0.15;
  }

  public update(dt: number) {
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      const s = 1.0 + Math.sin((this.hitTimer / 0.15) * Math.PI) * 0.08;
      this.scale.set(s, s);
    } else {
      this.scale.set(1.0, 1.0);
    }
  }
}
