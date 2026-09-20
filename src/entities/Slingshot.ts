import * as PIXI from 'pixi.js';

export class Slingshot extends PIXI.Container {
  public anchorX: number = 640;
  public anchorY: number = 580;
  public maxDrag: number = 90;
  public isDragging: boolean = false;
  public dragX: number = 640;
  public dragY: number = 580;

  private trajectoryGfx: PIXI.Graphics;
  private pedestalGfx: PIXI.Graphics;

  constructor() {
    super();

    this.pedestalGfx = new PIXI.Graphics();
    this.drawPedestal();
    this.addChild(this.pedestalGfx);

    this.trajectoryGfx = new PIXI.Graphics();
    this.addChild(this.trajectoryGfx);
  }

  public setAnchor(x: number, y: number) {
    this.anchorX = x;
    this.anchorY = y;
    this.dragX = x;
    this.dragY = y;
    this.drawPedestal();
  }

  private drawPedestal() {
    this.pedestalGfx.clear();
    // 弹弓发射底座：带木纹底托与圆环
    this.pedestalGfx.lineStyle(4, 0x8D6E63, 1);
    this.pedestalGfx.beginFill(0xD7CCC8);
    this.pedestalGfx.drawCircle(this.anchorX, this.anchorY, 36);
    this.pedestalGfx.endFill();

    this.pedestalGfx.lineStyle(0);
    this.pedestalGfx.beginFill(0xBCAAA4);
    this.pedestalGfx.drawCircle(this.anchorX, this.anchorY, 22);
    this.pedestalGfx.endFill();
  }

  public updateAimLine(targetX: number, targetY: number, viewWidth: number = 720) {
    this.trajectoryGfx.clear();
    if (!this.isDragging) return;

    const dx = this.anchorX - targetX;
    const dy = this.anchorY - targetY;
    const dist = Math.hypot(dx, dy);

    if (dist > 18) {
      let nx = dx / dist;
      let ny = dy / dist;
      this.trajectoryGfx.lineStyle(0);

      // 加长瞄准引导线 (大幅延伸至 750~880px，支持侧壁撞击真实折射反弹预测)
      const maxDistance = Math.min(880, 220 + dist * 7.5);
      const step = 28;
      const totalSteps = Math.floor(maxDistance / step);

      let curX = this.anchorX;
      let curY = this.anchorY;
      const minX = 20 + 52; // 侧墙 20px + 小球半径 52px
      const maxX = viewWidth - 20 - 52;

      for (let s = 1; s <= totalSteps; s++) {
        curX += nx * step;
        curY += ny * step;

        // 左右侧壁镜面反弹预测
        if (curX < minX) {
          curX = minX + (minX - curX);
          nx = Math.abs(nx);
        } else if (curX > maxX) {
          curX = maxX - (curX - maxX);
          nx = -Math.abs(nx);
        }

        // 抵达顶部 HUD 边界停止
        if (curY < 80) break;

        // 绘制由近及远、晶莹清晰的导向圆点
        const progress = s / totalSteps;
        const dotRadius = Math.max(3.2, 6.5 - progress * 2.8);

        this.trajectoryGfx.beginFill(0xFFB300, 0.92);
        this.trajectoryGfx.drawCircle(curX, curY, dotRadius);
        this.trajectoryGfx.endFill();

        this.trajectoryGfx.beginFill(0xFFFFFF, 0.8);
        this.trajectoryGfx.drawCircle(curX, curY, dotRadius * 0.48);
        this.trajectoryGfx.endFill();
      }
    }
  }

  public clearAimLine() {
    this.trajectoryGfx.clear();
  }
}
