// miniprogram/engine/GameEngine.js
const { AudioManager } = require('../game/AudioManager');
const { StorageManager } = require('../utils/Storage');
const { getWordPinyin, getWordPhrase } = require('../data/vocab');

class GameEngine {
  constructor(canvas, ctx, page) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.page = page;

    this.width = canvas.width;
    this.height = canvas.height;
    this.dpr = page.data.dpr || 2;

    this.isRunning = false;
    this.animationFrameId = null;

    this.scale = this.width / 720;

    this.anchorX = this.width / 2;
    // 弹弓底座显著上移，预留充足底部防误触安全区（杜绝触发手机底部手势或半屏小程序）
    this.anchorY = this.height - (260 * this.scale);

    this.slingshotPullLimit = 110 * this.scale;
    this.ballRadius = 42 * this.scale;

    this.isDragging = false;
    this.dragX = this.anchorX;
    this.dragY = this.anchorY;

    this.currentBall = null;
    this.ballQueue = [];
    this.targets = [];
    this.bumpers = [];
    this.particles = [];

    this.score = 0;
    this.combo = 0;
    this.levelData = null;
    this.isCleared = false;
    this.hasClearedTriggered = false;
    this.isCelebratingHit = false;
    this.lastWrongVoiceTime = 0;
    this.nextBallTimeout = null;
    this.hudBottom = 135;

    this.bindEvents();
  }

  bindEvents() {}

  setHudBottom(bottom) {
    this.hudBottom = bottom || 135;
  }

  resize(w, h, dpr) {
    this.width = w;
    this.height = h;
    this.dpr = dpr || 2;
    this.scale = this.width / 720;
    this.anchorX = this.width / 2;
    this.anchorY = this.height - (260 * this.scale);
    this.slingshotPullLimit = 110 * this.scale;
    this.ballRadius = 42 * this.scale;
  }

  loadLevel(levelDef) {
    this.levelData = levelDef;
    this.ballQueue = [...levelDef.ballSequence];
    AudioManager.instance.prefetchLevel(levelDef.targetWords || []);
    this.particles = [];
    this.currentBall = null;
    this.combo = 0;
    this.isCleared = false;
    this.hasClearedTriggered = false;
    this.isCelebratingHit = false;
    if (this.nextBallTimeout) {
      clearTimeout(this.nextBallTimeout);
      this.nextBallTimeout = null;
    }

    this.targets = [];
    this.bumpers = [];

    const cx = this.width / 2;
    // 顶部 HUD 安全底边：留足 28*scale 间距，确保任何球体及光晕绝不被顶部任务栏或连击文字遮挡
    const hudFloor = (this.hudBottom || 135) + (28 * this.scale);
    const slingshotCeiling = this.anchorY - (85 * this.scale);
    const playCenterY = (hudFloor + slingshotCeiling) * 0.53;

    // 整体计算阵列最高点，若超过 hudFloor 则将整个阵列整体下移，保持行距均匀不重叠
    let minTopEdge = Infinity;
    levelDef.blocks.forEach(b => {
      const py = playCenterY - b.y * this.scale;
      const r = (b.width / 2) * this.scale;
      if (py - r < minTopEdge) {
        minTopEdge = py - r;
      }
    });
    const shiftDown = minTopEdge < hudFloor ? (hudFloor - minTopEdge) : 0;

    levelDef.blocks.forEach(b => {
      const px = cx + b.x * this.scale;
      const py = playCenterY - b.y * this.scale + shiftDown;
      const r = (b.width / 2) * this.scale;

      if (b.type === 'TARGET') {
        this.targets.push({
          id: b.id,
          word: b.word,
          pinyin: getWordPinyin(b.word),
          x: px,
          y: py,
          r: r,
          active: true,
          isReview: b.isReview || false,
          shakeTime: 0,
          scaleTime: Math.random() * Math.PI * 2
        });
      } else if (b.type === 'BUMPER') {
        this.bumpers.push({
          id: b.id,
          x: px,
          y: py,
          r: r,
          bumpAnim: 0
        });
      }
    });

    this.spawnNextBall(true);
    this.page.updateHUD(this.score, this.combo, this.currentBall ? this.currentBall.word : '');
  }

  spawnNextBall(shouldPrompt = true) {
    if (this.isCleared) return;

    const activeTargets = this.targets.filter(t => t.active);
    if (activeTargets.length === 0) {
      this.onLevelCleared();
      return;
    }

    this.ballQueue = this.ballQueue.filter(w => activeTargets.some(t => t.word === w));

    if (this.ballQueue.length === 0) {
      const remainWords = activeTargets.map(t => t.word);
      this.ballQueue = [...remainWords, ...remainWords].sort(() => Math.random() - 0.5);
    }

    const word = this.ballQueue.shift() || activeTargets[0].word;
    this.currentBall = {
      word: word,
      pinyin: getWordPinyin(word),
      phrase: getWordPhrase(word),
      x: this.anchorX,
      y: this.anchorY,
      vx: 0,
      vy: 0,
      r: this.ballRadius,
      state: 'READY',
      bounces: 0,
      maxBounces: 5,
      trail: []
    };

    this.dragX = this.anchorX;
    this.dragY = this.anchorY;

    if (shouldPrompt && !this.isCelebratingHit) {
      AudioManager.instance.playMissionPrompt(word);
    }
    this.page.updateHUD(this.score, this.combo, word);
  }

  onTouchStart(x, y) {
    if (!this.currentBall || this.currentBall.state !== 'READY') return;

    const dx = x - this.anchorX;
    const dy = y - this.anchorY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 扩大拖拽感应区，同时确保不触及屏幕最下沿
    if (dist < 110 * this.scale || (Math.abs(dx) < 160 * this.scale && y > this.anchorY - 70 * this.scale && y < this.anchorY + 90 * this.scale)) {
      this.isDragging = true;
      this.updateDrag(x, y);
    }
  }

  onTouchMove(x, y) {
    if (!this.isDragging) return;
    this.updateDrag(x, y);
  }

  updateDrag(x, y) {
    // 底部绝对防误触安全距离：严格限制拖拽位置不得低于屏幕底部 85px 安全区，彻底杜绝触发半屏/全屏手势返回
    const bottomSafeFloor = this.height - (130 * this.scale);
    if (y > bottomSafeFloor) {
      y = bottomSafeFloor;
    }

    const dx = x - this.anchorX;
    const dy = y - this.anchorY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > this.slingshotPullLimit) {
      const angle = Math.atan2(dy, dx);
      this.dragX = this.anchorX + Math.cos(angle) * this.slingshotPullLimit;
      this.dragY = this.anchorY + Math.sin(angle) * this.slingshotPullLimit;
    } else {
      this.dragX = x;
      this.dragY = y;
    }

    if (this.currentBall) {
      this.currentBall.x = this.dragX;
      this.currentBall.y = this.dragY;
    }
  }

  onTouchEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (!this.currentBall || this.currentBall.state !== 'READY') return;

    const dx = this.anchorX - this.dragX;
    const dy = this.anchorY - this.dragY;
    const pullDist = Math.sqrt(dx * dx + dy * dy);

    if (pullDist > 20 * this.scale) {
      const impulseRatio = 8.6;
      this.currentBall.vx = dx * impulseRatio;
      this.currentBall.vy = dy * impulseRatio;
      this.currentBall.state = 'FLYING';
      this.currentBall.bounces = 0;
      AudioManager.instance.playSFX('sfx_shoot');
      // 若当前引导音尚未播完，则不打断、不叠加单字发音
      AudioManager.instance.playWord(this.currentBall.word, null, true);
    } else {
      this.currentBall.x = this.anchorX;
      this.currentBall.y = this.anchorY;
      this.dragX = this.anchorX;
      this.dragY = this.anchorY;
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    let lastTime = Date.now();

    const loop = () => {
      if (!this.isRunning) return;
      const now = Date.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      this.update(dt);
      this.render();

      this.animationFrameId = this.canvas.requestAnimationFrame(loop);
    };

    this.animationFrameId = this.canvas.requestAnimationFrame(loop);
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      this.canvas.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  update(dt) {
    this.bumpers.forEach(b => {
      if (b.bumpAnim > 0) {
        b.bumpAnim -= dt * 4;
        if (b.bumpAnim < 0) b.bumpAnim = 0;
      }
    });

    this.targets.forEach(t => {
      t.scaleTime += dt * 2.5;
      if (t.shakeTime > 0) {
        t.shakeTime -= dt * 5;
        if (t.shakeTime < 0) t.shakeTime = 0;
      }
    });

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * this.scale * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    const ball = this.currentBall;
    if (ball && ball.state === 'FLYING') {
      ball.trail.unshift({ x: ball.x, y: ball.y });
      if (ball.trail.length > 8) ball.trail.pop();

      ball.vy += 180 * this.scale * dt;
      ball.vx *= (1 - 0.25 * dt);
      ball.vy *= (1 - 0.25 * dt);

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      const r = ball.r;
      const bounceRestitution = 0.92;

      if (ball.x - r < 0) {
        ball.x = r;
        ball.vx = -ball.vx * bounceRestitution;
        this.onBallWallBounce(ball);
      } else if (ball.x + r > this.width) {
        ball.x = this.width - r;
        ball.vx = -ball.vx * bounceRestitution;
        this.onBallWallBounce(ball);
      }

      const topBoundary = Math.max(80 * this.scale, (this.hudBottom || 135) + (14 * this.scale));
      if (ball.y - r < topBoundary) {
        ball.y = topBoundary + r;
        ball.vy = -ball.vy * bounceRestitution;
        this.onBallWallBounce(ball);
      }

      if (ball.y - r > this.height) {
        this.onBallLost();
        return;
      }

      this.bumpers.forEach(b => {
        const dx = ball.x - b.x;
        const dy = ball.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = ball.r + b.r;

        if (dist < minDist && dist > 0.001) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;
          ball.x += nx * overlap;
          ball.y += ny * overlap;

          const dot = ball.vx * nx + ball.vy * ny;
          if (dot < 0) {
            const bounceSpeed = Math.max(380 * this.scale, Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * 1.15);
            ball.vx = (ball.vx - 2 * dot * nx);
            ball.vy = (ball.vy - 2 * dot * ny);
            const curSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            if (curSpeed > 0) {
              ball.vx = (ball.vx / curSpeed) * bounceSpeed;
              ball.vy = (ball.vy / curSpeed) * bounceSpeed;
            }
          }

          b.bumpAnim = 1.0;
          AudioManager.instance.playSFX('sfx_bumper');
          this.createSparks(b.x, b.y, '#FFA000', 8);
        }
      });

      for (const target of this.targets) {
        if (!target.active) continue;

        const dx = ball.x - target.x;
        const dy = ball.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = ball.r + target.r;

        if (dist < minDist) {
          if (ball.word === target.word) {
            this.onTargetHit(target, ball);
            break;
          } else {
            this.onTargetMismatch(target, ball);
            break;
          }
        }
      }
    }
  }

  onBallWallBounce(ball) {
    ball.bounces++;
    AudioManager.instance.playSFX('sfx_bounce');
    this.createSparks(ball.x, ball.y, '#FFD54F', 4);

    if (ball.bounces >= ball.maxBounces) {
      this.onBallLost();
    }
  }

  onBallLost() {
    if (!this.currentBall || this.isCleared) return;
    this.currentBall.state = 'DEAD';
    this.combo = 0;
    this.page.updateHUD(this.score, this.combo, '');
    if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
    this.nextBallTimeout = setTimeout(() => {
      if (this.isRunning && !this.isCleared) this.spawnNextBall(true);
    }, 400);
  }

  onTargetMismatch(target, ball) {
    target.shakeTime = 1.0;
    AudioManager.instance.playSFX('sfx_mismatch');

    const now = Date.now();
    if (!this.isCelebratingHit && !AudioManager.instance.isSpeaking && now - this.lastWrongVoiceTime > 1500) {
      this.lastWrongVoiceTime = now;
      AudioManager.instance.playWrongWord(target.word);
    }

    StorageManager.instance.recordMiss(target.word);

    const dx = ball.x - target.x;
    const dy = ball.y - target.y;
    const dist = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
    const nx = dx / dist;
    const ny = dy / dist;
    ball.vx = nx * 320 * this.scale;
    ball.vy = ny * 320 * this.scale;

    this.createSparks(target.x, target.y, '#FF5252', 6);
  }

  onTargetHit(target, ball) {
    target.active = false;
    ball.state = 'DEAD';
    this.isCelebratingHit = true;

    this.combo++;
    const pts = 10 * this.combo;
    this.score += pts;

    this.createCelebrationParticles(target.x, target.y);
    AudioManager.instance.stopVoice();
    AudioManager.instance.playSFX('sfx_match');

    StorageManager.instance.recordHit(target.word, this.levelData.grade, this.levelData.level);

    this.page.showBigWord(target.word, target.pinyin, pts);
    this.page.updateHUD(this.score, this.combo, target.word);

    const remaining = this.targets.filter(t => t.active);
    if (remaining.length === 0) {
      this.isCleared = true;
      if (this.nextBallTimeout) {
        clearTimeout(this.nextBallTimeout);
        this.nextBallTimeout = null;
      }
      // 严格等待命中词组语音播报完毕后，再触发通关语音与结算弹窗
      AudioManager.instance.playWordWithPhrase(target.word, () => {
        this.isCelebratingHit = false;
        this.onLevelCleared();
      });
    } else {
      if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
      this.nextBallTimeout = setTimeout(() => {
        if (this.isRunning && !this.isCleared) {
          this.spawnNextBall(false);
        }
      }, 750);

      // 严格等待命中词组语音播报完毕后，再播报下一颗待命弹珠的引导音
      AudioManager.instance.playWordWithPhrase(target.word, () => {
        this.isCelebratingHit = false;
        if (this.isRunning && !this.isCleared && this.currentBall && this.currentBall.state === 'READY') {
          AudioManager.instance.playMissionPrompt(this.currentBall.word);
        }
      });
    }
  }

  onLevelCleared() {
    if (this.hasClearedTriggered) return;
    this.hasClearedTriggered = true;
    this.isCleared = true;
    if (this.nextBallTimeout) {
      clearTimeout(this.nextBallTimeout);
      this.nextBallTimeout = null;
    }
    this.stop();
    AudioManager.instance.stopVoice();
    AudioManager.instance.playSFX('sfx_win');
    AudioManager.instance.playVoice('vo_clear');
    StorageManager.instance.recordLevelWin(this.levelData.grade, this.levelData.level, 3);
    this.page.showLevelWin(this.levelData);
  }

  createSparks(x, y, color, count = 6) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (60 + Math.random() * 140) * this.scale;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: (3 + Math.random() * 4) * this.scale,
        color: color,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        alpha: 1
      });
    }
  }

  createCelebrationParticles(x, y) {
    const colors = ['#FF1744', '#FF9100', '#FFEA00', '#00E676', '#00B0FF', '#D500F9'];
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (120 + Math.random() * 260) * this.scale;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80 * this.scale,
        r: (4 + Math.random() * 6) * this.scale,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.2,
        alpha: 1
      });
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#FFF9E6';
    ctx.fillRect(0, 0, this.width, this.height);

    this.bumpers.forEach(b => {
      const scale = 1 + b.bumpAnim * 0.25;
      const r = b.r * scale;

      ctx.save();
      ctx.translate(b.x, b.y);

      ctx.fillStyle = 'rgba(141, 110, 99, 0.15)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.9, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      grad.addColorStop(0, '#FF8A80');
      grad.addColorStop(1, '#FF5252');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.25, r * 0.2, 0, Math.PI * 2);
      ctx.arc(r * 0.35, -r * 0.25, r * 0.18, 0, Math.PI * 2);
      ctx.arc(0, r * 0.3, r * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    this.targets.forEach(t => {
      if (!t.active) return;

      const breathe = Math.sin(t.scaleTime) * 0.04;
      const shakeX = t.shakeTime > 0 ? (Math.random() - 0.5) * 12 * this.scale : 0;
      const r = t.r * (1 + breathe);

      ctx.save();
      ctx.translate(t.x + shakeX, t.y);

      ctx.fillStyle = t.isReview ? 'rgba(124, 77, 255, 0.15)' : 'rgba(255, 160, 0, 0.16)';
      ctx.beginPath();
      ctx.arc(0, 0, r + 8 * this.scale, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      if (t.isReview) {
        grad.addColorStop(0, '#B388FF');
        grad.addColorStop(1, '#7C4DFF');
      } else {
        grad.addColorStop(0, '#FFE082');
        grad.addColorStop(1, '#FFA000');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3 * this.scale;
      ctx.stroke();

      ctx.fillStyle = '#FFFDE7';
      ctx.font = `bold ${Math.round(14 * this.scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.pinyin, 0, -r * 0.44);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 ${Math.round(44 * this.scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.word, 0, r * 0.14);

      ctx.restore();
    });

    this.renderSlingshot(ctx);

    if (this.currentBall && this.currentBall.state !== 'DEAD') {
      this.renderBall(ctx, this.currentBall);
    }

    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  renderSlingshot(ctx) {
    const leftArmX = this.anchorX - 44 * this.scale;
    const rightArmX = this.anchorX + 44 * this.scale;
    const armTopY = this.anchorY - 24 * this.scale;
    const baseBottomY = this.anchorY + 70 * this.scale;

    ctx.save();

    ctx.strokeStyle = '#8D6E63';
    ctx.lineWidth = 14 * this.scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(this.anchorX, baseBottomY);
    ctx.lineTo(this.anchorX, this.anchorY + 16 * this.scale);
    ctx.lineTo(leftArmX, armTopY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.anchorX, this.anchorY + 16 * this.scale);
    ctx.lineTo(rightArmX, armTopY);
    ctx.stroke();

    if (this.currentBall && (this.currentBall.state === 'READY' || this.isDragging)) {
      const bx = this.currentBall.x;
      const by = this.currentBall.y;

      ctx.strokeStyle = '#D84315';
      ctx.lineWidth = 5 * this.scale;

      ctx.beginPath();
      ctx.moveTo(leftArmX, armTopY);
      ctx.lineTo(bx - 15 * this.scale, by);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rightArmX, armTopY);
      ctx.lineTo(bx + 15 * this.scale, by);
      ctx.stroke();

      if (this.isDragging) {
        const dx = this.anchorX - bx;
        const dy = this.anchorY - by;
        const pull = Math.sqrt(dx * dx + dy * dy);
        if (pull > 20 * this.scale) {
          ctx.save();
          ctx.setLineDash([8 * this.scale, 8 * this.scale]);
          ctx.strokeStyle = 'rgba(255, 111, 0, 0.6)';
          ctx.lineWidth = 3 * this.scale;
          ctx.beginPath();
          ctx.moveTo(this.anchorX, this.anchorY);
          ctx.lineTo(this.anchorX + dx * 2.8, this.anchorY + dy * 2.8);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  renderBall(ctx, ball) {
    ctx.save();
    ctx.translate(ball.x, ball.y);

    const r = ball.r;

    if (ball.state === 'FLYING' && ball.trail.length > 0) {
      ball.trail.forEach((pos, idx) => {
        const trailAlpha = (1 - idx / ball.trail.length) * 0.35;
        const trailR = r * (1 - idx / ball.trail.length * 0.5);
        ctx.save();
        ctx.fillStyle = `rgba(255, 179, 0, ${trailAlpha})`;
        ctx.beginPath();
        ctx.arc(pos.x - ball.x, pos.y - ball.y, trailR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    ctx.fillStyle = 'rgba(141, 110, 99, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.85, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    bodyGrad.addColorStop(0, '#FFE082');
    bodyGrad.addColorStop(0.65, '#FFA000');
    bodyGrad.addColorStop(1, '#FF6F00');

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    const lightGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 0, -r * 0.35, -r * 0.35, r * 0.55);
    lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    lightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.35, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `900 ${Math.round(44 * this.scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#E65100';
    ctx.lineWidth = 3 * this.scale;
    ctx.strokeText(ball.word, 0, 2);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(ball.word, 0, 2);

    ctx.restore();
  }
}

module.exports = {
  GameEngine
};
