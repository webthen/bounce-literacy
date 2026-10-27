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
import { getWordPinyin, getWordPhrase } from '../data/vocab';

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
  private lastWrongVoiceTime: number = 0;
  private isCelebrationActive: boolean = false;

  public isPortrait: boolean = false;
  public viewWidth: number = 1280;
  public viewHeight: number = 720;

  // 动力学减速调优参数 (专为 4~6 岁儿童视力与追踪能力调校)
  private readonly LAUNCH_IMPULSE_RATIO: number = 5.2;
  private readonly MAX_SPEED: number = 520;
  private readonly MIN_SPEED: number = 280;
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
    // 弹弓底座上移，预留充足底部防误触区域，避免手指在底边滑动时触发系统手势
    const anchorY = isPortrait ? (this.viewHeight - 240) : 560;
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
    const anchorY = isPortrait ? (this.viewHeight - 240) : 560;
    this.slingshot.setAnchor(anchorX, anchorY);
    this.hitArea = new PIXI.Rectangle(0, 0, this.viewWidth, this.viewHeight);

    this.startLevel(this.currentLevelIdx, this.currentGrade, true);
  }

  /**
   * 动态计算顶部 HUD 在 Canvas 坐标系下的安全底边 Y 值，杜绝任何顶部文字遮挡球体
   */
  private getTopSafeCeilingY(): number {
    let minSafe = this.isPortrait ? 148 : 108;
    try {
      const wrapper = document.getElementById('game-wrapper');
      const hud = document.getElementById('game-hud');
      if (wrapper && hud && hud.style.display !== 'none') {
        const wRect = wrapper.getBoundingClientRect();
        const hRect = hud.getBoundingClientRect();
        if (wRect.height > 0 && hRect.height > 0) {
          const hudBottomCss = hRect.bottom - wRect.top;
          const canvasHudBottom = (hudBottomCss / wRect.height) * this.viewHeight;
          minSafe = Math.max(minSafe, Math.round(canvasHudBottom + 18));
        }
      }
    } catch (e) {}
    return minSafe;
  }

  private drawBackground() {
    this.bgGfx.clear();
    this.bgGfx.beginFill(0xFFF9E6);
    this.bgGfx.drawRect(0, 0, this.viewWidth, this.viewHeight);
    this.bgGfx.endFill();

    this.bgGfx.beginFill(0xFFFFFF, 0.45);
    if (this.isPortrait) {
      this.bgGfx.drawCircle(110, 140, 45);
      this.bgGfx.drawCircle(150, 130, 58);
      this.bgGfx.drawCircle(190, 140, 38);

      const rightCloudX = this.viewWidth - 150;
      this.bgGfx.drawCircle(rightCloudX - 40, 160, 45);
      this.bgGfx.drawCircle(rightCloudX, 150, 58);
      this.bgGfx.drawCircle(rightCloudX + 40, 160, 38);
    } else {
      this.bgGfx.drawCircle(180, 150, 50);
      this.bgGfx.drawCircle(230, 140, 65);
      this.bgGfx.drawCircle(280, 150, 45);

      this.bgGfx.drawCircle(1040, 180, 50);
      this.bgGfx.drawCircle(1090, 170, 65);
      this.bgGfx.drawCircle(1140, 180, 45);
    }
    this.bgGfx.endFill();

    const baselineY = this.isPortrait ? (this.viewHeight - 320) : 500;
    this.bgGfx.lineStyle(3, 0xE0D6C3, 1);
    for (let x = 30; x < this.viewWidth - 30; x += 24) {
      this.bgGfx.moveTo(x, baselineY);
      this.bgGfx.lineTo(x + 12, baselineY);
    }
  }

  public startLevel(idx: number, grade?: number, skipIntro: boolean = false) {
    if (grade !== undefined) {
      this.currentGrade = grade;
    } else {
      this.currentGrade = StorageManager.instance.data.currentGrade || 1;
    }

    const totalInGrade = EbbinghausEngine.getTotalLevelsInGrade(this.currentGrade);
    // 关卡锁定检查：若未解锁则自动回退至已解锁的最大关卡
    if (!StorageManager.instance.isLevelUnlocked(this.currentGrade, idx)) {
      idx = StorageManager.instance.getMaxUnlockedLevel(this.currentGrade, totalInGrade);
    }

    this.currentLevelIdx = idx;
    this.curConfig = EbbinghausEngine.generateLevel(this.currentGrade, this.currentLevelIdx, this.isPortrait);
    this.remainingTargets = new Set(this.curConfig.targetWords);
    this.ballQueue = [...this.curConfig.ballSequence];

    // 关卡全量 Fish Audio 语音后台静默预热（从内存/IndexedDB/云端预取，保障零网络延迟发音）
    AudioManager.instance.prefetchLevel(this.curConfig.targetWords);

    this.combo = 0;
    this.missCount = 0;
    this.activeWeakHint = false;
    this.isCelebrationActive = false;

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
    const topSafeY = this.getTopSafeCeilingY();
    const baselineY = this.isPortrait ? (this.viewHeight - 320) : 500;
    const defaultCenterY = this.isPortrait ? Math.round((topSafeY + baselineY) * 0.54) : 410;

    // 整体计算阵列上下边界，若最顶部的球靠近顶部 HUD，则整组下移，绝不挤压行距且绝不遮挡文字
    let minTopEdge = Infinity;
    for (const b of this.curConfig.blocks) {
      const py = defaultCenterY - b.y;
      const halfH = ((b.height && b.height > 84) ? b.height : 104) / 2;
      if (py - halfH < minTopEdge) {
        minTopEdge = py - halfH;
      }
    }
    const requiredTopEdge = topSafeY + 22;
    const shiftDown = minTopEdge < requiredTopEdge ? (requiredTopEdge - minTopEdge) : 0;

    for (const b of this.curConfig.blocks) {
      const px = centerX + b.x;
      const py = defaultCenterY - b.y + shiftDown;

      if (b.type === 'TARGET') {
        const tb = new TargetBlock(b.id, b.word || '', (b.width && b.width > 84) ? b.width : 104, (b.height && b.height > 84) ? b.height : 104, b.isReview);
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

    // 关卡生字卡片导读弹窗
    const introModal = document.getElementById('intro-modal');
    const introCards = document.getElementById('intro-cards-container');
    const introTitle = document.getElementById('intro-title');
    if (!skipIntro && introModal && introCards) {
      if (introTitle) {
        introTitle.innerText = `第 ${this.currentGrade} 级 · 第 ${this.currentLevelIdx + 1} 课 汉字朋友`;
      }
      introCards.innerHTML = '';
      this.curConfig.targetWords.forEach(w => {
        const py = getWordPinyin(w);
        const ph = getWordPhrase(w);
        const card = document.createElement('div');
        card.className = 'intro-word-card';
        card.innerHTML = `
          <div class="intro-card-pinyin">${py}</div>
          <div class="intro-card-char">${w}</div>
          <div class="intro-card-phrase">${ph}</div>
          <div class="intro-card-voice">🔊 点我听</div>
        `;
        card.onclick = () => AudioManager.instance.playWordWithPhrase(w);
        introCards.appendChild(card);
      });
      introModal.classList.add('show');
      const startBtn = document.getElementById('btn-start-level-play');
      if (startBtn) {
        startBtn.onclick = () => {
          introModal.classList.remove('show');
          AudioManager.instance.stopVoice();
          this.spawnNextBall(false);
          // 严格串行：vo_ready 播放完毕后才进入找字语音引导
          AudioManager.instance.playVoice('vo_ready', () => {
            this.promptNextBall();
          });
        };
      }
      AudioManager.instance.stopVoice();
      if (this.curConfig.targetWords.length > 0) {
        AudioManager.instance.playVoice('vo_intro');
      }
    } else {
      AudioManager.instance.stopVoice();
      this.spawnNextBall(false);
      AudioManager.instance.playVoice('vo_ready', () => {
        this.promptNextBall();
      });
    }
  }

  private updateMissionHUD(word: string) {
    const mWord = document.getElementById('mission-word');
    const mPinyin = document.getElementById('mission-pinyin');
    const mPhrase = document.getElementById('mission-phrase');
    const mPill = document.getElementById('mission-pill');
    if (mWord) mWord.innerText = word;
    if (mPinyin) mPinyin.innerText = getWordPinyin(word);
    if (mPhrase) mPhrase.innerText = getWordPhrase(word);
    if (mPill) {
      mPill.onclick = () => {
        AudioManager.instance.playMissionPrompt(word);
      };
    }
  }

  private promptNextBall() {
    if (this.currentBall && this.currentBall.state === 'IDLE' && !this.isCelebrationActive) {
      AudioManager.instance.playMissionPrompt(this.currentBall.word);
    }
  }

  private spawnNextBall(shouldPrompt: boolean = true) {
    const activeWords = Array.from(new Set(this.targetBlocks.filter(b => !b.eliminated).map(b => b.word)));
    if (activeWords.length === 0) {
      return;
    }

    this.remainingTargets = new Set(activeWords);
    this.ballQueue = this.ballQueue.filter(w => this.remainingTargets.has(w));

    if (this.ballQueue.length === 0) {
      if (activeWords.length === 1) {
        this.ballQueue = [activeWords[0], activeWords[0]];
      } else {
        const refill = [...activeWords, ...activeWords].sort(() => Math.random() - 0.5);
        this.ballQueue = refill;
      }
    }

    let word = this.ballQueue.shift();
    if (!word || !this.remainingTargets.has(word)) {
      word = activeWords[Math.floor(Math.random() * activeWords.length)];
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

    this.updateMissionHUD(word);
    if (shouldPrompt && !this.isCelebrationActive) {
      AudioManager.instance.playMissionPrompt(word);
    }
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
        // 若当前已有引导语音正在播放，则不重复叠加单字语音
        AudioManager.instance.playWord(this.currentBall.word, undefined, true);
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

  private updateBallDrag(pointerX: number, pointerY: number) {
    if (!this.currentBall) return;

    const rawDx = pointerX - this.slingshot.anchorX;
    const rawDy = Math.max(0, pointerY - this.slingshot.anchorY);

    const dist = Math.hypot(rawDx, rawDy);
    let targetX = this.slingshot.anchorX;
    let targetY = this.slingshot.anchorY;

    if (dist > 0) {
      const clampedDist = Math.min(dist, this.slingshot.maxDrag);
      targetX = this.slingshot.anchorX + (rawDx / dist) * clampedDist;
      targetY = this.slingshot.anchorY + (rawDy / dist) * clampedDist;
    }

    const minX = this.currentBall.r + 20;
    const maxX = this.viewWidth - this.currentBall.r - 20;
    const minY = this.slingshot.anchorY;
    const maxY = this.viewHeight - (this.isPortrait ? 100 : 40);

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

      const curSpd = Math.hypot(ball.vx, ball.vy);
      if (curSpd > this.MAX_SPEED) {
        const factor = this.MAX_SPEED / curSpd;
        ball.vx *= factor;
        ball.vy *= factor;
      }

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.updatePhysicsEffects();

      const baselineY = this.isPortrait ? (this.viewHeight - 240) : 520;

      if (ball.y <= baselineY) {
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
      }

      // 顶部边界反弹 (严格在 HUD 安全底边之下反弹，绝不钻入顶部文字后方)
      const topBounceY = this.getTopSafeCeilingY();
      if (ball.y - ball.r < topBounceY) {
        ball.y = topBounceY + ball.r;
        ball.vy = Math.abs(ball.vy);
        ball.bounces++;
        AudioManager.instance.playSFX('sfx_bounce');
      } else if (ball.y > baselineY && ball.vy > 0) {
        const word = ball.word;
        this.recycleBall();
        this.onMiss(word);
        return;
      }

      for (const bmp of this.bumpers) {
        const dist = Math.hypot(ball.x - bmp.x, ball.y - bmp.y);
        if (dist < ball.r + bmp.r) {
          const nx = (ball.x - bmp.x) / dist;
          const ny = (ball.y - bmp.y) / dist;
          const dot = ball.vx * nx + ball.vy * ny;
          ball.vx = ball.vx - 2 * dot * nx;
          ball.vy = ball.vy - 2 * dot * ny;

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
            this.removeChild(tb);
            this.targetBlocks.splice(i, 1);

            const hasMoreOfSameWord = this.targetBlocks.some(b => !b.eliminated && b.word === tb.word);
            if (!hasMoreOfSameWord) {
              this.remainingTargets.delete(tb.word);
              this.ballQueue = this.ballQueue.filter(w => this.remainingTargets.has(w));
            }

            this.particleSys.burst(tb.x, tb.y, 0xFFD700, 35);
            this.screenShakeStrength = 7;
            this.onHitSuccess(tb.word, ball.bounces);
            this.recycleBall();
            return;
          } else {
            tb.triggerSquish();
            const pinyin = getWordPinyin(tb.word);
            tb.showSpeechBubble(`这是“${tb.word}” ${pinyin}`, 1.4);
            StorageManager.instance.recordMiss(tb.word);
            AudioManager.instance.playSFX('sfx_mismatch');

            const now = Date.now();
            if (!this.isCelebrationActive && !AudioManager.instance.isSpeaking && now - this.lastWrongVoiceTime > 1500) {
              this.lastWrongVoiceTime = now;
              AudioManager.instance.playWrongWord(tb.word);
            }
          }
        }
      }

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
    this.isCelebrationActive = true;

    const isDirectHit = bounces <= 1;
    const isSuperHit = bounces >= 3;
    const directHitBonus = isDirectHit ? 50 : 0;
    const addPts = 10 * this.combo + (isSuperHit ? 30 : 0) + directHitBonus;
    this.score += addPts;
    this.updateHUD();

    StorageManager.instance.recordHit(word, this.currentGrade, this.currentLevelIdx);

    // 停止此前未播完的引导语音，进入命中专属串行语音流
    AudioManager.instance.stopVoice();
    AudioManager.instance.playSFX('sfx_match');

    this.showBigWordPopup(word, addPts, isDirectHit);

    // 视觉上 950ms 后收起大字弹窗并提前生成待命弹珠，避免连续命中时遮挡视野
    setTimeout(() => {
      this.hideBigWordPopup();
      if (this.remainingTargets.size > 0 && !this.currentBall) {
        this.spawnNextBall(false);
      }
    }, 950);

    // 语音严格串行：念读词组完毕 -> (若神射手则播放赞美语音) -> 完毕后才播报下一颗球引导或通关语音
    const onAllHitVoicesDone = () => {
      this.isCelebrationActive = false;
      if (this.remainingTargets.size === 0) {
        this.handleLevelWin();
      } else {
        if (!this.currentBall) {
          this.spawnNextBall(true);
        } else {
          this.promptNextBall();
        }
      }
    };

    AudioManager.instance.playWordWithPhrase(word, () => {
      if (isDirectHit || isSuperHit) {
        AudioManager.instance.playVoice('vo_super', onAllHitVoicesDone);
      } else {
        onAllHitVoicesDone();
      }
    });
  }

  private onMiss(_word: string) {
    this.missCount++;
    this.combo = 0;
    this.updateHUD();

    if (this.missCount >= 2) {
      this.activeWeakHint = true;
    }
    setTimeout(() => this.spawnNextBall(true), 400);
  }

  private handleLevelWin() {
    this.isCelebrationActive = true;
    AudioManager.instance.stopVoice();
    StorageManager.instance.recordLevelWin(this.currentGrade, this.currentLevelIdx, 3);
    AudioManager.instance.playSFX('sfx_win');
    AudioManager.instance.playVoice('vo_clear');

    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 }
    });

    const totalInGrade = EbbinghausEngine.getTotalLevelsInGrade(this.currentGrade);
    const isGradeComplete = (this.currentLevelIdx + 1 >= totalInGrade);

    const gallery = document.getElementById('win-words-gallery');
    if (gallery) {
      gallery.innerHTML = '';
      const wordsToReview = this.curConfig.targetWords;
      wordsToReview.forEach(w => {
        const py = getWordPinyin(w);
        const ph = getWordPhrase(w);
        const card = document.createElement('div');
        card.className = 'win-word-card';
        card.innerHTML = `
          <div class="win-word-pinyin">${py}</div>
          <div class="win-word-char">${w}</div>
          <div class="win-word-phrase">${ph}</div>
          <div class="win-word-speaker">🔊 读一读</div>
        `;
        card.onclick = () => AudioManager.instance.playWordWithPhrase(w);
        gallery.appendChild(card);
      });
    }

    const winModal = document.getElementById('win-modal');
    if (winModal) {
      let title = `恭喜通过第 ${this.currentGrade} 级 · 第 ${this.currentLevelIdx + 1} 关！`;
      let desc = `得分: ${this.score} | 累计识字: ${StorageManager.instance.data.totalHits} 次 (艾宾浩斯复习巩固)`;
      if (isGradeComplete) {
        if (this.currentGrade < 6) {
          title = `🎉 恭喜通关【第 ${this.currentGrade} 级】全部字词！`;
          desc = `下一关将解锁【第 ${this.currentGrade + 1} 级】新词汇挑战！`;
        } else {
          title = `👑 恭喜全部 6 个等级完全通关！`;
          desc = `已牢固掌握全部 390 个核心汉字与拓展字！你是超级识字大宗师！`;
        }
      }
      document.getElementById('win-summary')!.innerText = title;
      document.getElementById('win-unlocked-tip')!.innerText = desc;
      winModal.classList.add('show');
    }
  }

  private showBigWordPopup(word: string, pts: number, isDirectHit: boolean = false) {
    const popup = document.getElementById('big-word-popup');
    if (!popup) return;
    const pinyin = getWordPinyin(word);
    const phrase = getWordPhrase(word);
    const hitTypeEl = document.getElementById('big-word-hit-type');
    const pinyinEl = document.getElementById('big-word-pinyin');
    const charEl = document.getElementById('big-word-char');
    const phraseEl = document.getElementById('big-word-phrase');
    const ptsEl = document.getElementById('big-word-pts');

    if (hitTypeEl) {
      hitTypeEl.style.display = isDirectHit ? 'block' : 'none';
      if (isDirectHit) hitTypeEl.innerText = '🎯 识字神射手 · 一发即中！+50分';
    }
    if (pinyinEl) pinyinEl.innerText = pinyin;
    if (charEl) charEl.innerText = word;
    if (phraseEl) phraseEl.innerText = phrase && phrase !== word ? phrase : `汉字 · ${word}`;
    if (ptsEl) ptsEl.innerText = `+${pts} 命中!`;
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
        comboEl.style.display = 'inline-flex';
      } else {
        comboEl.style.display = 'none';
      }
    }
  }

  public nextLevel() {
    AudioManager.instance.stopVoice();
    this.isCelebrationActive = false;
    const totalInGrade = EbbinghausEngine.getTotalLevelsInGrade(this.currentGrade);
    const nextIdx = this.currentLevelIdx + 1;
    if (nextIdx < totalInGrade) {
      if (!StorageManager.instance.isLevelUnlocked(this.currentGrade, nextIdx)) {
        alert('🔒 下一关尚未解锁，请先通过上一关！');
        return;
      }
      this.startLevel(nextIdx, this.currentGrade);
    } else {
      if (this.currentGrade < 6) {
        const nextG = this.currentGrade + 1;
        alert(`🎉 太棒了！已顺利通关第 ${this.currentGrade} 级！即将进入【第 ${nextG} 级】新词汇挑战！`);
        StorageManager.instance.setGrade(nextG);
        this.startLevel(0, nextG);
      } else {
        alert('👑 终极大满贯！你已经成功通关了全部 6 个等级共 390 个核心汉字！艾宾浩斯记忆大师！');
        this.onQuitToTitle();
      }
    }
  }

  public retryLevel() {
    AudioManager.instance.stopVoice();
    this.isCelebrationActive = false;
    this.startLevel(this.currentLevelIdx, this.currentGrade, true);
  }
}
