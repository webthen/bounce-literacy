import * as PIXI from 'pixi.js';

export class TargetBlock extends PIXI.Container {
  public blockId: string;
  public word: string;
  public r: number;
  public w: number;
  public h: number;
  public shape: 'CIRCLE' = 'CIRCLE';
  public eliminated: boolean = false;
  public shakeTime: number = 0;

  private glowGfx: PIXI.Graphics;
  private shadowGfx: PIXI.Graphics;
  private sphereSprite: PIXI.Sprite;
  private wordShadowText: PIXI.Text;
  private wordText: PIXI.Text;
  private highlightSprite: PIXI.Sprite;

  private static cachedSphereTextures: Map<number, PIXI.Texture> = new Map();
  private static cachedHighlightTextures: Map<number, PIXI.Texture> = new Map();

  public isReview: boolean = false;

  constructor(id: string, word: string, w: number = 104, h: number = 104, isReview: boolean = false) {
    super();
    this.blockId = id;
    this.word = word;
    this.isReview = isReview;
    this.r = (w && w > 84 ? w : 104) / 2;
    this.w = this.r * 2;
    this.h = this.r * 2;

    // 1. 弱提示高亮光环
    this.glowGfx = new PIXI.Graphics();
    this.addChild(this.glowGfx);

    // 2. 悬浮柔和阴影与焦散
    this.shadowGfx = new PIXI.Graphics();
    this.drawShadow();
    this.addChild(this.shadowGfx);

    // 3. 晶莹剔透天青水晶玻璃球体底纹
    this.sphereSprite = new PIXI.Sprite(TargetBlock.getSphereTexture(this.r));
    this.sphereSprite.anchor.set(0.5);
    this.sphereSprite.width = this.r * 2 + 16;
    this.sphereSprite.height = this.r * 2 + 16;
    this.addChild(this.sphereSprite);

    // 4. 水晶球内嵌汉字 (字号适中饱满，清新明亮高辨识度)
    this.wordShadowText = new PIXI.Text(word, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: 46,
      fontWeight: '900',
      fill: 0x00838F,
      align: 'center'
    });
    this.wordShadowText.anchor.set(0.5);
    this.wordShadowText.y = 2.5;
    this.wordShadowText.alpha = 0.32;
    this.addChild(this.wordShadowText);

    this.wordText = new PIXI.Text(word, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: 46,
      fontWeight: '900',
      fill: 0xFFFFFF,
      stroke: 0x00ACC1,
      strokeThickness: 2.2,
      align: 'center'
    });
    this.wordText.anchor.set(0.5);
    this.addChild(this.wordText);

    // 5. 玻璃表层光滑高曲率反光与高光
    this.highlightSprite = new PIXI.Sprite(TargetBlock.getHighlightTexture(this.r));
    this.highlightSprite.anchor.set(0.5);
    this.highlightSprite.width = this.r * 2 + 16;
    this.highlightSprite.height = this.r * 2 + 16;
    this.addChild(this.highlightSprite);

    // 6. 艾宾浩斯复习专属小标识
    if (isReview) {
      const tagGfx = new PIXI.Graphics();
      tagGfx.beginFill(0xFFA000);
      tagGfx.lineStyle(1.5, 0xFFFFFF, 1);
      tagGfx.drawRoundedRect(this.r * 0.28, -this.r * 0.95, 28, 18, 9);
      tagGfx.endFill();
      const tagText = new PIXI.Text('复', {
        fontFamily: 'sans-serif',
        fontSize: 12,
        fill: 0xFFFFFF,
        fontWeight: 'bold'
      });
      tagText.anchor.set(0.5);
      tagText.position.set(this.r * 0.28 + 14, -this.r * 0.95 + 9);
      this.addChild(tagGfx);
      this.addChild(tagText);
    }
  }

  private drawShadow() {
    this.shadowGfx.clear();
    // 柔和清爽接触软阴影 (告别深海黑蓝色 0x1A237E)
    this.shadowGfx.beginFill(0x546E7A, 0.12);
    this.shadowGfx.drawEllipse(0, this.r * 0.82, this.r * 0.95, this.r * 0.3);
    this.shadowGfx.endFill();

    // 冰晶玻璃焦散微光
    this.shadowGfx.beginFill(0xE0F7FA, 0.60);
    this.shadowGfx.drawEllipse(0, this.r * 0.82, this.r * 0.42, this.r * 0.14);
    this.shadowGfx.endFill();
  }

  public setGlow(active: boolean) {
    this.glowGfx.clear();
    if (active) {
      this.glowGfx.lineStyle(8, 0xFFD700, 0.9);
      this.glowGfx.drawCircle(0, 0, this.r + 6);
    }
  }

  public triggerSquish() {
    this.shakeTime = 0.25;
  }

  public update(dt: number) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const t = this.shakeTime / 0.25;
      const squish = Math.sin(t * Math.PI * 4) * 0.15 * t;
      this.scale.set(1 + squish, 1 - squish);
    } else {
      this.scale.set(1, 1);
    }
  }

  private static getSphereTexture(radius: number): PIXI.Texture {
    if (TargetBlock.cachedSphereTextures.has(radius)) return TargetBlock.cachedSphereTextures.get(radius)!;
    const dpr = 2;
    const r = radius * dpr;
    const size = (radius * 2 + 16) * dpr;
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

    // 清新薄荷天青冰晶光学折射底色 (温润通透糖果感，移除 #006064 等暗沉深色)
    const bodyGrad = ctx.createRadialGradient(
      cx + r * 0.22, cy + r * 0.25, r * 0.05,
      cx - r * 0.1, cy - r * 0.1, r * 1.05
    );
    bodyGrad.addColorStop(0.0, '#FFFFFF'); // 右下清透极亮聚光点
    bodyGrad.addColorStop(0.18, '#E0F7FA'); // 晶莹冰晶透亮薄荷
    bodyGrad.addColorStop(0.42, '#B2EBF2'); // 柔和纯净天青水蓝
    bodyGrad.addColorStop(0.68, '#80DEEA'); // 清新通透薄荷琉璃
    bodyGrad.addColorStop(0.88, '#4DD0E1'); // 鲜活明快海青色
    bodyGrad.addColorStop(1.0, '#26C6DA'); // 边缘清新水绿 (告别 #006064、#00838F 等沉闷暗深色)
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // 球体边缘厚度遮罩 (水蓝微暗环境光，告别生硬黑圈)
    const depthGrad = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    depthGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0)');
    depthGrad.addColorStop(0.80, 'rgba(77, 208, 225, 0)');
    depthGrad.addColorStop(1.0, 'rgba(0, 151, 167, 0.10)');
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

    const tex = PIXI.Texture.from(canvas);
    TargetBlock.cachedSphereTextures.set(radius, tex);
    return tex;
  }

  private static getHighlightTexture(radius: number): PIXI.Texture {
    if (TargetBlock.cachedHighlightTextures.has(radius)) return TargetBlock.cachedHighlightTextures.get(radius)!;
    const dpr = 2;
    const r = radius * dpr;
    const size = (radius * 2 + 16) * dpr;
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

    // 1. 球顶漫反射覆膜
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

    // 2. 左上优雅弧形天光高光
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

    // 3. 左上方极锐利微小星芒高光点
    const glintX = cx - r * 0.42;
    const glintY = cy - r * 0.42;
    const flareGrad = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, r * 0.18);
    flareGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    flareGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.45)');
    flareGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = flareGrad;
    ctx.beginPath();
    ctx.arc(glintX, glintY, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(glintX, glintY, 2.5 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // 4. 右下方反向微弱漫反射环境反光
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.2 * dpr, 0.22 * Math.PI, 0.62 * Math.PI);
    ctx.lineWidth = 2.4 * dpr;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // 释放剪裁

    // 5. 玻璃外壁菲涅尔光滑轮廓环
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

    const hTex = PIXI.Texture.from(canvas);
    TargetBlock.cachedHighlightTextures.set(radius, hTex);
    return hTex;
  }
}
