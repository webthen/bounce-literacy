import * as PIXI from 'pixi.js';
import confetti from 'canvas-confetti';
import { Ball } from '../entities/Ball';
import { TargetBlock } from '../entities/TargetBlock';
import { Bumper, Obstacle } from '../entities/Bumper';
import { Slingshot } from '../entities/Slingshot';
import { ParticleSystem } from '../game/ParticleSystem';
import { AudioManager } from '../game/AudioManager';
import { StorageManager } from '../utils/Storage';
import { EbbinghausEngine, DynamicLevelDef } from '../game/EbbinghausEngine';
import { VOCAB_LIST, getWordPinyin } from '../data/vocab';

export class PlayScene extends PIXI.Container {
  private app: PIXI.Application;
  private onQuitToTitle: () => void;

  private bgGfx: PIXI.Graphics;
  private slingshot: Slingshot;
  private particleSys: ParticleSystem;

  private currentGrade: number = 1;
  private currentLevelIdx: number = 0;
  private curConfig!: DynamicLevelDef;
  private remainingTargets: Set<string> = new Set();
  private ballQueue: string[] = [];

  private currentBall: Ball | null = null;
  private targetBlocks: TargetBlock[] = [];
  private obstacles: Obstacle[] = [];
  private bumpers: Bumper[] = [];

  private score: number = 0;
  private combo: number = 0;
  private missCount: number = 0;
  private activeWeakHint: boolean = false;

  public isPortrait: boolean = false;
  public viewWidth: number = 1280;
  public viewHeight: number = 720;

  // 动力学减速调优参数 (专为 4~6 岁儿童视力与追踪能力调校)
  private readonly LAUNCH_IMPULSE_RATIO: number = 5.2; // 适中灵敏度
  private readonly MAX_SPEED: number = 520;           // 全场速度硬顶上限 520 px/s
  private readonly MIN_SPEED: number = 280;           // 最小基础发射速度 280 px/s
  private screenShakeStrength: number = 0;

  constructor(app: PIXI.Application, onQuitToTitle: () => void, isPortrait: boolean = false, viewW?: number, viewH?: number) {
    super();
    this.app = app;
    this.onQuitToTitle = onQuitToTitle;
    this.isPortrait = isPortrait;
    this.viewWidth = viewW || (isPortrait ? 720 : 1280);
    this.viewHeight = viewH || (isPortrait ? 1280 : 720);

    this.bgGfx = new PIXI.Graphics();
    this.addChild(this.bgGfx);
    this.drawBackground();

    this.slingshot = new Slingshot();
    const anchorX = this.viewWidth / 2;
    const anchorY = isPortrait ? (this.viewHeight - 160) : 580;
    this.slingshot.setAnchor(anchorX, anchorY);
    this.addChild(this.slingshot);

    this.particleSys = new ParticleSystem();
    this.addChild(this.particleSys);

    this.setupInteractions();
    const curG = StorageManager.instance.data.currentGrade || 1;
    const curL = StorageManager.instance.data.currentLevel || 0;
    this.startLevel(curL, curG);
  }

  public setOrientation(isPortrait: boolean, viewW?: number, viewH?: number) {
    const newW = viewW || (isPortrait ? 720 : 1280);
    const newH = viewH || (isPortrait ? 1280 : 720);
    if (this.isPortrait === isPortrait && this.viewWidth === newW && this.viewHeight === newH) return;
    this.isPortrait = isPortrait;
    this.viewWidth = newW;
    this.viewHeight = newH;

    this.drawBackground();
    const anchorX = this.viewWidth / 2;
    const anchorY = isPortrait ? (this.viewHeight - 160) : 580;
    this.slingshot.setAnchor(anchorX, anchorY);
    this.hitArea = new PIXI.Rectangle(0, 0, this.viewWidth, this.viewHeight);

    this.startLevel(this.currentLevelIdx, this.currentGrade);
  }

  private drawBackground() {
    this.bgGfx.clear();
    // 温暖鹅黄奶白底色
    this.bgGfx.beginFill(0xFFF9E6);
    this.bgGfx.drawRect(0, 0, this.viewWidth, this.viewHeight);
    this.bgGfx.endFill();

    // 浮动云朵装饰 (自适应横屏/竖屏)
    this.bgGfx.beginFill(0xFFFFFF, 0.45);
    if (this.isPortrait) {
      this.bgGfx.drawCircle(110, 110, 45);
      this.bgGfx.drawCircle(150, 100, 58);
      this.bgGfx.drawCircle(190, 110, 38);

      const rightCloudX = this.viewWidth - 150;
      this.bgGfx.drawCircle(rightCloudX - 40, 130, 45);
      this.bgGfx.drawCircle(rightCloudX, 120, 58);
      this.bgGfx.drawCircle(rightCloudX + 40, 130, 38);
    } else {
      this.bgGfx.drawCircle(180, 140, 50);
      this.bgGfx.drawCircle(230, 130, 65);
      this.bgGfx.drawCircle(280, 140, 45);

      this.bgGfx.drawCircle(1040, 180, 50);
      this.bgGfx.drawCircle(1090, 170, 65);
      this.bgGfx.drawCircle(1140, 180, 45);
    }
    this.bgGfx.endFill();

    // 底部发射基线
    const baselineY = this.isPortrait ? (this.viewHeight - 240) : 520;
    this.bgGfx.lineStyle(3, 0xE0D6C3, 1);
    for (let x = 30; x < this.viewWidth - 30; x += 24) {
      this.bgGfx.moveTo(x, baselineY);
      this.bgGfx.lineTo(x + 12, baselineY);
    }
  }

  public startLevel(idx: number, grade?: number) {
    if (grade !== undefined) {
      this.currentGrade = grade;
    } else {
      this.currentGrade = StorageManager.instance.data.currentGrade || 1;
    }
    this.currentLevelIdx = idx;
    this.curConfig = EbbinghausEngine.generateLevel(this.currentGrade, this.currentLevelIdx, this.isPortrait);
    this.remainingTargets = new Set(this.curConfig.targetWords);
    this.ballQueue = [...this.curConfig.ballSequence];
    this.combo = 0;
    this.missCount = 0;
    this.activeWeakHint = false;

    this.targetBlocks.forEach(b => this.removeChild(b));
    this.obstacles.forEach(o => this.removeChild(o));
    this.bumpers.forEach(bm => this.removeChild(bm));
    this.targetBlocks = [];
    this.obstacles = [];
    this.bumpers = [];

    if (this.currentBall) {
      this.removeChild(this.currentBall.getTrailGfx());
      this.removeChild(this.currentBall);
      this.currentBall = null;
    }

    const centerX = this.viewWidth / 2;
    const centerY = this.isPortrait ? Math.round(this.viewHeight * 0.42) : 360;

    for (const b of this.curConfig.blocks) {
      const px = centerX + b.x;
      const py = centerY - b.y;

      if (b.type === 'TARGET') {
        const tb = new TargetBlock(b.id, b.word || '', b.width, b.height, b.isReview);
        tb.x = px;
        tb.y = py;
        tb.rotation = (b.rotation || 0) * Math.PI / 180;
        this.targetBlocks.push(tb);
        this.addChild(tb);
      } else if (b.type === 'BUMPER') {
        const bmp = new Bumper(b.id, (b.width || 70) / 2);
        bmp.x = px;
        bmp.y = py;
        this.bumpers.push(bmp);
        this.addChild(bmp);
      } else {
        const obs = new Obstacle(b.id, b.width, b.height);
        obs.x = px;
        obs.y = py;
        obs.rotation = (b.rotation || 0) * Math.PI / 180;
        this.obstacles.push(obs);
        this.addChild(obs);
      }
    }

    this.updateHUD();
    AudioManager.instance.playVoice('vo_ready');
    this.spawnNextBall();
  }

  private spawnNextBall() {
    let word = this.ballQueue.shift();
    if (!word) {
      if (this.remainingTargets.size > 0) {
        const arr = Array.from(this.remainingTargets);
        word = arr[Math.floor(Math.random() * arr.length)];
      } else {
        return;
      }
    }

    if (this.currentBall) {
      this.removeChild(this.currentBall.getTrailGfx());
      this.removeChild(this.currentBall);
    }

    this.currentBall = new Ball(word);
    this.currentBall.x = this.slingshot.anchorX;
    this.currentBall.y = this.slingshot.anchorY;

    this.addChild(this.currentBall.getTrailGfx());
    this.addChild(this.currentBall);
  }

  private setupInteractions() {
    this.interactive = true;
    this.hitArea = new PIXI.Rectangle(0, 0, this.viewWidth, this.viewHeight);

    const onPointerDown = (e: PIXI.FederatedPointerEvent) => {
      AudioManager.instance.unlock();
      if (!this.currentBall || this.currentBall.state !== 'IDLE') return;

      const pos = e.getLocalPosition(this);
      const dist = Math.hypot(pos.x - this.slingshot.anchorX, pos.y - this.slingshot.anchorY);

      if (dist < 150 || (pos.y > (this.slingshot.anchorY - 100) && Math.abs(pos.x - this.slingshot.anchorX) < 160)) {
        this.slingshot.isDragging = true;
        this.updateBallDrag(pos.x, pos.y);
      }
    };

    const onPointerMove = (e: PIXI.FederatedPointerEvent) => {
      if (!this.slingshot.isDragging || !this.currentBall) return;
      const pos = e.getLocalPosition(this);
      this.updateBallDrag(pos.x, pos.y);
    };

    const onPointerUp = () => {
      if (!this.slingshot.isDragging || !this.currentBall) return;
      this.slingshot.isDragging = false;
      this.slingshot.clearAimLine();

      const dx = this.slingshot.anchorX - this.slingshot.dragX;
      const dy = this.slingshot.anchorY - this.slingshot.dragY;
      const dist = Math.hypot(dx, dy);

      if (dist > 18) {
        // 计算平缓而适中的速度 (px/s)
        let initialSpeed = dist * this.LAUNCH_IMPULSE_RATIO;
        initialSpeed = Math.max(this.MIN_SPEED, Math.min(this.MAX_SPEED, initialSpeed));

        const angle = Math.atan2(dy, dx);
        const vx = Math.cos(angle) * initialSpeed;
        const vy = Math.sin(angle) * initialSpeed;

        this.currentBall.launch(vx, vy);
        AudioManager.instance.playSFX('sfx_shoot');
      } else {
        this.currentBall.x = this.slingshot.anchorX;
        this.currentBall.y = this.slingshot.anchorY;
      }
    };

    this.on('pointerdown', onPointerDown);
    this.on('pointermove', onPointerMove);
    this.on('globalpointermove', onPointerMove);
    this.on('pointerup', onPointerUp);
    this.on('pointerupoutside', onPointerUp);
  }

  /** 限制小球拖动范围：只能向后/下拉，且绝对不能超出画框边界 */
  private updateBallDrag(pointerX: number, pointerY: number) {
    if (!this.currentBall) return;

    // 1. 获取光标相对基准点的偏移量：仅允许向下拉 (dy >= 0)，防止向上推导致反向误发射
    const rawDx = pointerX - this.slingshot.anchorX;
    const rawDy = Math.max(0, pointerY - this.slingshot.anchorY);

    // 2. 距离硬顶限制在 maxDrag 以内
    const dist = Math.hypot(rawDx, rawDy);
    let targetX = this.slingshot.anchorX;
    let targetY = this.slingshot.anchorY;

    if (dist > 0) {
      const clampedDist = Math.min(dist, this.slingshot.maxDrag);
      targetX = this.slingshot.anchorX + (rawDx / dist) * clampedDist;
      targetY = this.slingshot.anchorY + (rawDy / dist) * clampedDist;
    }

    // 3. 画框安全边界绝对约束 (保证球体整体完全在画框内，且留出安全边距)
    const minX = this.currentBall.r + 20;
    const maxX = this.viewWidth - this.currentBall.r - 20;
    const minY = this.slingshot.anchorY;
    const maxY = this.viewHeight - this.currentBall.r - 12;

    this.slingshot.dragX = Math.max(minX, Math.min(maxX, targetX));
    this.slingshot.dragY = Math.max(minY, Math.min(maxY, targetY));

    this.currentBall.x = this.slingshot.dragX;
    this.currentBall.y = this.slingshot.dragY;
    this.slingshot.updateAimLine(this.slingshot.dragX, this.slingshot.dragY, this.viewWidth);
  }

  public update(dt: number) {
    this.particleSys.update(dt);

    if (this.screenShakeStrength > 0) {
      this.screenShakeStrength -= dt * 25;
      if (this.screenShakeStrength < 0) this.screenShakeStrength = 0;
      this.x = (Math.random() - 0.5) * this.screenShakeStrength;
      this.y = (Math.random() - 0.5) * this.screenShakeStrength;
    } else {
      this.x = 0;
      this.y = 0;
    }

    this.targetBlocks.forEach(b => {
      b.update(dt);
      b.setGlow(this.activeWeakHint && this.currentBall != null && b.word === this.currentBall.word);
    });
    this.bumpers.forEach(bm => bm.update(dt));
    this.obstacles.forEach(o => o.update(dt));

    if (this.currentBall && this.currentBall.state === 'FLYING') {
      const ball = this.currentBall;

      // 限速保护：确保无论怎么反弹碰撞，小球速度都不超过舒适可读阈值
      const curSpd = Math.hypot(ball.vx, ball.vy);
      if (curSpd > this.MAX_SPEED) {
        const factor = this.MAX_SPEED / curSpd;
        ball.vx *= factor;
        ball.vy *= factor;
      }

      // 精确时间步进 (px/s 乘以 dt 秒)
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.updatePhysicsEffects();

      // 边框碰撞
      if (ball.x - ball.r < 20) {
        ball.x = 20 + ball.r;
        ball.vx = Math.abs(ball.vx);
        ball.bounces++;
        AudioManager.instance.playSFX('sfx_bounce');
      } else if (ball.x + ball.r > this.viewWidth - 20) {
        ball.x = this.viewWidth - 20 - ball.r;
        ball.vx = -Math.abs(ball.vx);
        ball.bounces++;
        AudioManager.instance.playSFX('sfx_bounce');
      }
      if (ball.y - ball.r < (this.isPortrait ? 85 : 75)) {
        ball.y = (this.isPortrait ? 85 : 75) + ball.r;
        ball.vy = Math.abs(ball.vy);
        ball.bounces++;
        AudioManager.instance.playSFX('sfx_bounce');
      } else if (ball.y - ball.r > this.viewHeight) {
        const word = ball.word;
        this.recycleBall();
        this.onMiss(word);
        return;
      }

      // 超级弹力轮 (Bumper) 反弹（温和提速至固定舒适速度，绝不飞速失控）
      for (const bmp of this.bumpers) {
        const dist = Math.hypot(ball.x - bmp.x, ball.y - bmp.y);
        if (dist < ball.r + bmp.r) {
          const nx = (ball.x - bmp.x) / dist;
          const ny = (ball.y - bmp.y) / dist;
          const dot = ball.vx * nx + ball.vy * ny;
          ball.vx = ball.vx - 2 * dot * nx;
          ball.vy = ball.vy - 2 * dot * ny;

          // 保持在 460 px/s 左右的活泼节奏
          const boostSpd = Math.min(this.MAX_SPEED, Math.max(450, Math.hypot(ball.vx, ball.vy) * 1.05));
          const norm = Math.hypot(ball.vx, ball.vy) || 1;
          ball.vx = (ball.vx / norm) * boostSpd;
          ball.vy = (ball.vy / norm) * boostSpd;

          ball.bounces++;
          this.score += 20;
          this.updateHUD();
          bmp.triggerPulse();
          this.screenShakeStrength = 5;
          this.particleSys.burst(bmp.x, bmp.y, 0xFF5252, 14);
          AudioManager.instance.playSFX('sfx_bumper');
        }
      }

      // 普通障碍碰撞
      for (const obs of this.obstacles) {
        const nearX = Math.max(obs.x - obs.w / 2, Math.min(ball.x, obs.x + obs.w / 2));
        const nearY = Math.max(obs.y - obs.h / 2, Math.min(ball.y, obs.y + obs.h / 2));
        const dx = ball.x - nearX;
        const dy = ball.y - nearY;
        if (dx * dx + dy * dy < ball.r * ball.r) {
          if (Math.abs(dx) > Math.abs(dy)) {
            ball.vx = -ball.vx;
            ball.x = nearX + Math.sign(dx) * ball.r;
          } else {
            ball.vy = -ball.vy;
            ball.y = nearY + Math.sign(dy) * ball.r;
          }
          ball.bounces++;
          obs.triggerHit();
          AudioManager.instance.playSFX('sfx_bounce');
          this.particleSys.burst(ball.x, ball.y, 0xBCAAA4, 8);
        }
      }

      // 汉字玻璃珠目标碰撞 (双球弹性碰撞)
      for (let i = this.targetBlocks.length - 1; i >= 0; i--) {
        const tb = this.targetBlocks[i];
        if (tb.eliminated) continue;

        const dist = Math.hypot(ball.x - tb.x, ball.y - tb.y);
        const radiusSum = ball.r + tb.r;

        if (dist < radiusSum) {
          const nx = (ball.x - tb.x) / (dist || 1);
          const ny = (ball.y - tb.y) / (dist || 1);
          const dot = ball.vx * nx + ball.vy * ny;
          ball.vx = ball.vx - 2 * dot * nx;
          ball.vy = ball.vy - 2 * dot * ny;
          ball.x = tb.x + nx * radiusSum;
          ball.y = tb.y + ny * radiusSum;
          ball.bounces++;

          if (tb.word === ball.word) {
            tb.eliminated = true;
            this.remainingTargets.delete(tb.word);
            this.removeChild(tb);
            this.targetBlocks.splice(i, 1);

            StorageManager.instance.recordHit(tb.word, this.currentLevelIdx + 1);
            this.particleSys.burst(tb.x, tb.y, 0xFFD700, 35);
            this.screenShakeStrength = 7;
            this.onHitSuccess(tb.word, ball.bounces);
            this.recycleBall();
            return;
          } else {
            tb.triggerSquish();
            StorageManager.instance.recordMiss(tb.word);
            AudioManager.instance.playSFX('sfx_mismatch');
          }
        }
      }

      // 16秒无操作/低速软回收保护
      if (Date.now() - ball.launchTime > 16000) {
        const w = ball.word;
        this.recycleBall();
        this.onMiss(w);
      }
    }
  }

  private recycleBall() {
    if (this.currentBall) {
      this.removeChild(this.currentBall.getTrailGfx());
      this.removeChild(this.currentBall);
      this.currentBall = null;
    }
  }

  private onHitSuccess(word: string, bounces: number) {
    this.missCount = 0;
    this.activeWeakHint = false;
    this.combo++;

    const isSuperHit = bounces >= 3;
    const addPts = 10 * this.combo + (isSuperHit ? 30 : 0);
    this.score += addPts;
    this.updateHUD();

    StorageManager.instance.recordHit(word, this.currentGrade, this.currentLevelIdx);
    AudioManager.instance.playSFX('sfx_match');
    setTimeout(() => AudioManager.instance.playWord(word), 100);
    if (isSuperHit) {
      setTimeout(() => AudioManager.instance.playVoice('vo_super'), 800);
    }

    this.showBigWordPopup(word, addPts);

    setTimeout(() => {
      this.hideBigWordPopup();
      if (this.remainingTargets.size === 0) {
        this.handleLevelWin();
      } else {
        this.spawnNextBall();
      }
    }, 950);
  }

  private onMiss(word: string) {
    this.missCount++;
    this.combo = 0;
    this.updateHUD();

    if (this.missCount >= 2) {
      this.activeWeakHint = true;
    }
    setTimeout(() => this.spawnNextBall(), 400);
  }

  private handleLevelWin() {
    StorageManager.instance.recordLevelWin(this.currentGrade, this.currentLevelIdx, 3);
    AudioManager.instance.playSFX('sfx_win');
    setTimeout(() => AudioManager.instance.playVoice('vo_clear'), 300);

    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 }
    });

    const totalInGrade = EbbinghausEngine.getTotalLevelsInGrade(this.currentGrade);
    const isGradeComplete = (this.currentLevelIdx + 1 >= totalInGrade);

    const winModal = document.getElementById('win-modal');
    if (winModal) {
      let title = `恭喜通过第 ${this.currentGrade} 级 · 第 ${this.currentLevelIdx + 1} 关！`;
      let desc = `得分: ${this.score} | 累计识字: ${StorageManager.instance.data.totalHits} 次 (艾宾浩斯复习巩固)`;
      if (isGradeComplete) {
        if (this.currentGrade < 5) {
          title = `🎉 恭喜通关【第 ${this.currentGrade} 级】全部字词！`;
          desc = `下一关将解锁【第 ${this.currentGrade + 1} 级】新词汇挑战！`;
        } else {
          title = `👑 恭喜全部 5 个等级完全通关！`;
          desc = `已牢固掌握 300 个核心汉字！你是超级识字大宗师！`;
        }
      }
      document.getElementById('win-summary')!.innerText = title;
      document.getElementById('win-unlocked-tip')!.innerText = desc;
      winModal.classList.add('show');
    }
  }

  private showBigWordPopup(word: string, pts: number) {
    const popup = document.getElementById('big-word-popup');
    if (!popup) return;
    const pinyin = getWordPinyin(word);
    document.getElementById('big-word-pinyin')!.innerText = pinyin;
    document.getElementById('big-word-char')!.innerText = word;
    document.getElementById('big-word-pts')!.innerText = `+${pts} 命中!`;
    popup.classList.add('show');
  }

  private hideBigWordPopup() {
    const popup = document.getElementById('big-word-popup');
    if (popup) popup.classList.remove('show');
  }

  public updateHUD() {
    const titleEl = document.getElementById('level-badge');
    if (titleEl && this.curConfig) {
      if (this.isPortrait) {
        titleEl.innerText = `第 ${this.currentLevelIdx + 1} 关`;
      } else {
        titleEl.innerText = `第${this.currentGrade}级 第${this.currentLevelIdx + 1}关`;
      }
    }

    const scoreEl = document.getElementById('score-badge');
    if (scoreEl) {
      scoreEl.innerText = `得分: ${this.score}`;
    }

    const comboEl = document.getElementById('combo-badge');
    if (comboEl) {
      if (this.combo > 1) {
        comboEl.innerText = `🔥 ${this.combo}连击!`;
        comboEl.style.display = 'block';
      } else {
        comboEl.style.display = 'none';
      }
    }
  }

  public nextLevel() {
    const totalInGrade = EbbinghausEngine.getTotalLevelsInGrade(this.currentGrade);
    if (this.currentLevelIdx + 1 < totalInGrade) {
      this.startLevel(this.currentLevelIdx + 1, this.currentGrade);
    } else {
      if (this.currentGrade < 5) {
        const nextG = this.currentGrade + 1;
        alert(`🎉 太棒了！已顺利通关第 ${this.currentGrade} 级！即将进入【第 ${nextG} 级】新词汇挑战！`);
        StorageManager.instance.setGrade(nextG);
        this.startLevel(0, nextG);
      } else {
        alert('👑 终极大满贯！你已经成功通关了全部 5 个等级共 300 个汉字！艾宾浩斯记忆大师！');
        this.onQuitToTitle();
      }
    }
  }

  public retryLevel() {
    this.startLevel(this.currentLevelIdx, this.currentGrade);
  }
}
