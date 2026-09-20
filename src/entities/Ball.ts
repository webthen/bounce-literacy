import * as PIXI from 'pixi.js';

export class Ball extends PIXI.Container {
  public word: string = '';
  public r: number = 52;
  public vx: number = 0;
  public vy: number = 0;
  public state: 'IDLE' | 'FLYING' | 'DEAD' = 'IDLE';
  public bounces: number = 0;
  public launchTime: number = 0;

  private shadowGfx: PIXI.Graphics;
  private sphereSprite: PIXI.Sprite;
  private wordText: PIXI.Text;
  private wordShadowText: PIXI.Text;
  private glassHighlightSprite: PIXI.Sprite;
  private trailGfx: PIXI.Graphics;
  public trailHistory: { x: number; y: number }[] = [];

  constructor(word: string) {
    super();
    this.word = word;

    // 1. 拖尾层 (放在最底层)
    this.trailGfx = new PIXI.Graphics();

    // 2. 地面立体投影 (Drop Shadow)
    this.shadowGfx = new PIXI.Graphics();
    this.drawShadow();
    this.addChild(this.shadowGfx);

    // 3. 3D 立体水晶球体底纹 (3D Sphere Base)
    this.sphereSprite = new PIXI.Sprite(this.generateSphereTexture());
    this.sphereSprite.anchor.set(0.5);
    this.sphereSprite.width = this.r * 2 + 16;
    this.sphereSprite.height = this.r * 2 + 16;
    this.addChild(this.sphereSprite);

    // 4. 水晶内嵌汉字 (悬浮在水晶球内部，大字号清新醒目)
    this.wordShadowText = new PIXI.Text(word, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif',
      fontSize: 48,
      fontWeight: '900',
      fill: 0xF57C00,
      align: 'center'
    });
    this.wordShadowText.anchor.set(0.5);
    this.wordShadowText.y = 2.5;
    this.wordShadowText.alpha = 0.35;
    this.addChild(this.wordShadowText);

    this.wordText = new PIXI.Text(word, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif',
      fontSize: 48,
      fontWeight: '900',
      fill: 0xFFFFFF,
      stroke: 0xF57C00,
      strokeThickness: 2.2,
      align: 'center'
    });
    this.wordText.anchor.set(0.5);
    this.addChild(this.wordText);

    // 5. 前置光滑玻璃曲面反光与高光 (Glass Highlights & Specular Sheen)
    this.glassHighlightSprite = new PIXI.Sprite(this.generateGlassHighlightTexture());
    this.glassHighlightSprite.anchor.set(0.5);
    this.glassHighlightSprite.width = this.r * 2 + 16;
    this.glassHighlightSprite.height = this.r * 2 + 16;
    this.addChild(this.glassHighlightSprite);
  }

  public getTrailGfx(): PIXI.Graphics {
    return this.trailGfx;
  }

  /** 绘制球体在桌面/地面上的立体接触阴影与玻璃透光焦散光斑 (清新柔和透亮) */
  private drawShadow() {
    this.shadowGfx.clear();
    // 1. 柔和温润接触软阴影 (告别黑褐色暗沉)
    this.shadowGfx.beginFill(0x8D6E63, 0.16);
    this.shadowGfx.drawEllipse(0, this.r * 0.85, this.r * 1.12, this.r * 0.35);
    this.shadowGfx.endFill();

    // 2. 玻璃折射透光焦散亮点 (Caustic spotlight under glass)
    this.shadowGfx.beginFill(0xFFF9C4, 0.65);
    this.shadowGfx.drawEllipse(0, this.r * 0.85, this.r * 0.46, this.r * 0.15);
    this.shadowGfx.endFill();
  }

  /** 生成超清 3D 晶莹剔透玻璃球体底纹 (清新明媚蜜糖柠檬暖阳配色，去暗沉深色) */
  private generateSphereTexture(): PIXI.Texture {
    const dpr = 2;
    const r = this.r * dpr;
    const padding = 8 * dpr;
    const size = (this.r * 2 + 16) * dpr;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;

    ctx.save();
    // 基础剪裁圆
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // 玻璃透光折射底色：清新柔和明丽的阳光蜜糖琉璃质感，杜绝焦黑棕色
    const bodyGrad = ctx.createRadialGradient(
      cx + r * 0.22, cy + r * 0.25, r * 0.05,
      cx - r * 0.1, cy - r * 0.1, r * 1.05
    );
    bodyGrad.addColorStop(0.0, '#FFFFFF'); // 右下清透极亮焦点
    bodyGrad.addColorStop(0.15, '#FFFDE7'); // 柔和温润奶白微光
    bodyGrad.addColorStop(0.40, '#FFF59D'); // 清新明朗柠檬黄
    bodyGrad.addColorStop(0.68, '#FFE082'); // 晶莹透亮蜜糖金
    bodyGrad.addColorStop(0.88, '#FFB74D'); // 柔美蜜桃暖杏
    bodyGrad.addColorStop(1.0, '#FFA726'); // 边缘清新活力果冻橙 (彻底移除 #BF360C 和 #E65100 等深焦暗色)
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // 球体边缘厚度遮罩 (温润暖调透光暗角，告别粗重黑圈)
    const depthGrad = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    depthGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0)');
    depthGrad.addColorStop(0.80, 'rgba(255, 183, 77, 0)');
    depthGrad.addColorStop(1.0, 'rgba(239, 108, 0, 0.10)');
    ctx.fillStyle = depthGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // 水晶中心悬浮透亮光核 (明亮通透内部光晕)
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.68);
    coreGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.58)');
    coreGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.18)');
    coreGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    ctx.restore();

    const texture = PIXI.Texture.from(canvas);
    return texture;
  }

  /** 生成极度光滑的玻璃表面曲率反光与双重镜面高光 (Ultra-Smooth Specular) */
  private generateGlassHighlightTexture(): PIXI.Texture {
    const dpr = 2;
    const r = this.r * dpr;
    const size = (this.r * 2 + 16) * dpr;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2;
    const cy = size / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // 1. 球顶大面积柔和漫反射覆膜 (平滑自然的高光衰减)
    const domeGrad = ctx.createRadialGradient(
      cx, cy - r * 0.7, r * 0.05,
      cx, cy - r * 0.2, r * 0.95
    );
    domeGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.52)');
    domeGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.18)');
    domeGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.04)');
    domeGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = domeGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // 2. 左上优雅弧形天光高光 (Smooth Curved Arc Specular)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.75, -Math.PI * 0.88, -Math.PI * 0.26);
    ctx.lineWidth = r * 0.13;
    ctx.lineCap = 'round';
    const arcGrad = ctx.createLinearGradient(
      cx - r * 0.7, cy - r * 0.65,
      cx + r * 0.3, cy - r * 0.65
    );
    arcGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.1)');
    arcGrad.addColorStop(0.25, 'rgba(255, 255, 255, 0.85)');
    arcGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.85)');
    arcGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.1)');
    ctx.strokeStyle = arcGrad;
    ctx.stroke();
    ctx.restore();

    // 3. 左上方极锐利微小星芒高光点 (Pinpoint Specular Core)
    const glintX = cx - r * 0.42;
    const glintY = cy - r * 0.42;
    // 光晕
    const flareGrad = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, r * 0.18);
    flareGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    flareGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.45)');
    flareGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = flareGrad;
    ctx.beginPath();
    ctx.arc(glintX, glintY, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    // 核心亮点
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(glintX, glintY, 2.2 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // 4. 右下方反向环境反光弧 (Bottom-Right Rim Light)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.2 * dpr, 0.22 * Math.PI, 0.62 * Math.PI);
    ctx.lineWidth = 2.4 * dpr;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // 释放剪裁

    // 5. 玻璃外壁菲涅尔光滑轮廓环 (Fresnel Glass Outer Rim)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.75 * dpr, 0, Math.PI * 2);
    const rimGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    rimGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    rimGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
    rimGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    rimGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.8)');
    ctx.lineWidth = 1.6 * dpr;
    ctx.strokeStyle = rimGrad;
    ctx.stroke();
    ctx.restore();

    return PIXI.Texture.from(canvas);
  }

  /** 更新伪 3D 悬浮视差与流光拖尾 */
  public updatePhysicsEffects() {
    // 伪 3D 视差：根据小球运动速度，让球内汉字产生轻微内嵌视差位移
    if (this.state === 'FLYING') {
      const px = Math.max(-4, Math.min(4, this.vx * 0.35));
      const py = Math.max(-4, Math.min(4, this.vy * 0.35));
      this.wordText.x = px;
      this.wordText.y = py;
      this.wordShadowText.x = px + 0.5;
      this.wordShadowText.y = py + 2.5;

      // 阴影与球心稍微解耦增加悬空感
      this.shadowGfx.x = -px * 0.5;
      this.shadowGfx.y = -py * 0.2;

      this.trailHistory.push({ x: this.x, y: this.y });
      if (this.trailHistory.length > 7) {
        this.trailHistory.shift();
      }
    } else {
      this.wordText.x = 0;
      this.wordText.y = 0;
      this.wordShadowText.x = 0.5;
      this.wordShadowText.y = 2.5;
      this.shadowGfx.x = 0;
      this.shadowGfx.y = 0;
      this.trailHistory = [];
    }

    // 绘制流光残影
    this.trailGfx.clear();
    for (let i = 0; i < this.trailHistory.length; i++) {
      const p = this.trailHistory[i];
      const ratio = (i + 1) / this.trailHistory.length;
      this.trailGfx.beginFill(0xFFE082, ratio * 0.25);
      this.trailGfx.drawCircle(p.x, p.y, this.r * (0.35 + ratio * 0.55));
      this.trailGfx.endFill();
    }
  }

  public launch(vx: number, vy: number) {
    this.vx = vx;
    this.vy = vy;
    this.state = 'FLYING';
    this.bounces = 0;
    this.launchTime = Date.now();
  }
}
