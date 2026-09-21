// miniprogram/engine/GameEngine.js
const { AudioManager } = require('../game/AudioManager');
const { StorageManager } = require('../utils/Storage');
const { getWordPinyin, getWordPhrase } = require('../data/vocab');

class GameEngine {
  constructor(canvas, ctx, page) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.page = page; // 宿主小程序 Page 实例

    this.width = canvas.width;
    this.height = canvas.height;
    this.dpr = page.data.dpr || 2;

    this.isRunning = false;
    this.animationFrameId = null;

    // 物理缩放比例 (以设计宽度 720 为基准)
    this.scale = this.width / 720;

    // 弹弓锚点位置 (底部中央)
    this.anchorX = this.width / 2;
    this.anchorY = this.height - (180 * this.scale);

    // 弹弓参数
    this.slingshotPullLimit = 140 * this.scale;
    this.ballRadius = 42 * this.scale;

    // 触摸拖拽状态
    this.isDragging = false;
    this.dragX = this.anchorX;
    this.dragY = this.anchorY;

    // 关卡对象
    this.currentBall = null;
    this.ballQueue = [];
    this.targets = [];
    this.bumpers = [];
    this.particles = [];

    // 状态
    this.score = 0;
    this.combo = 0;
    this.levelData = null;
    this.isCleared = false;
    this.hasClearedTriggered = false;
    this.nextBallTimeout = null;
    this.hudBottom = 130;

    this.bindEvents();
  }

  bindEvents() {
    // 监听窗口尺寸或重设尺寸
  }

  setHudBottom(bottom) {
    this.hudBottom = bottom || 130;
  }

  resize(w, h, dpr) {
    this.width = w;
    this.height = h;
    this.dpr = dpr || 2;
    this.scale = this.width / 720;
    this.anchorX = this.width / 2;
    this.anchorY = this.height - (180 * this.scale);
    this.slingshotPullLimit = 140 * this.scale;
    this.ballRadius = 42 * this.scale;
  }

  loadLevel(levelDef) {
    this.levelData = levelDef;
    this.ballQueue = [...levelDef.ballSequence];
    this.particles = [];
    this.currentBall = null;
    this.combo = 0;
    this.isCleared = false;
    this.hasClearedTriggered = false;
    if (this.nextBallTimeout) {
      clearTimeout(this.nextBallTimeout);
      this.nextBallTimeout = null;
    }

    // 解析目标方块与反弹蘑菇
    this.targets = [];
    this.bumpers = [];

    const cx = this.width / 2;
    // 游戏区域垂直分布：避开顶部两层 HUD (带安全距离) 与 底部弹弓
    const hudFloor = (this.hudBottom || 126) + (20 * this.scale);
    const slingshotCeiling = this.anchorY - (80 * this.scale);
    // 纵向中心基准线
    const playCenterY = (hudFloor + slingshotCeiling) / 2;

    levelDef.blocks.forEach(b => {
      // 坐标映射：以屏幕水平中心与游戏可玩纵向中心为基准
      const px = cx + b.x * this.scale;
      let py = playCenterY - b.y * this.scale;

      const r = (b.width / 2) * this.scale;
      // 保证所有目标方块距离顶部 HUD 至少有 20px 安全空隙，绝对不遮挡
      if (py - r < hudFloor) {
        py = hudFloor + r;
      }

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

    this.spawnNextBall();
    this.page.updateHUD(this.score, this.combo, this.currentBall ? this.currentBall.word : '');
  }

  spawnNextBall() {
    if (this.isCleared) return;

    const activeTargets = this.targets.filter(t => t.active);
    if (activeTargets.length === 0) {
      this.onLevelCleared();
      return;
    }

    // 智能选球：过滤已消除的字，只发场上存活的目标球
    this.ballQueue = this.ballQueue.filter(w => activeTargets.some(t => t.word === w));

    // 如果队列空了，按场上存活的目标重新填充
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
      state: 'READY', // 'READY', 'FLYING', 'DEAD'
      bounces: 0,
      maxBounces: 5,
      trail: []
    };

    this.dragX = this.anchorX;
    this.dragY = this.anchorY;

    // 播放任务引导提示音
    AudioManager.instance.playMissionPrompt(word);
    this.page.updateHUD(this.score, this.combo, word);
  }

  onTouchStart(x, y) {
    if (!this.currentBall || this.currentBall.state !== 'READY') return;

    const dx = x - this.anchorX;
    const dy = y - this.anchorY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 在弹弓区域点击即可开始拉拽
    if (dist < 100 * this.scale || y > this.anchorY - 60 * this.scale) {
      this.isDragging = true;
      this.updateDrag(x, y);
    }
  }

  onTouchMove(x, y) {
    if (!this.isDragging) return;
    this.updateDrag(x, y);
  }

  updateDrag(x, y) {
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

    if (pullDist > 25 * this.scale) {
      // 成功发射
      const impulseRatio = 6.8;
      this.currentBall.vx = dx * impulseRatio;
      this.currentBall.vy = dy * impulseRatio;
      this.currentBall.state = 'FLYING';
      this.currentBall.bounces = 0;
      AudioManager.instance.playSFX('sfx_shoot');
      AudioManager.instance.playWord(this.currentBall.word);
    } else {
      // 拉伸距离过小，重置回原点
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
    // 1. 更新反弹蘑菇动画
    this.bumpers.forEach(b => {
      if (b.bumpAnim > 0) {
        b.bumpAnim -= dt * 4;
        if (b.bumpAnim < 0) b.bumpAnim = 0;
      }
    });

    // 2. 更新目标方块呼吸与抖动
    this.targets.forEach(t => {
      t.scaleTime += dt * 2.5;
      if (t.shakeTime > 0) {
        t.shakeTime -= dt * 5;
        if (t.shakeTime < 0) t.shakeTime = 0;
      }
    });

    // 3. 更新粒子系统
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * this.scale * dt; // 重力
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 4. 更新弹球物理飞行
    const ball = this.currentBall;
    if (ball && ball.state === 'FLYING') {
      // 记录拖尾
      ball.trail.unshift({ x: ball.x, y: ball.y });
      if (ball.trail.length > 8) ball.trail.pop();

      // 微重力 + 阻力
      ball.vy += 180 * this.scale * dt;
      ball.vx *= (1 - 0.25 * dt);
      ball.vy *= (1 - 0.25 * dt);

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // 墙壁碰撞检测
      const r = ball.r;
      const bounceRestitution = 0.92;

      // 左右侧壁
      if (ball.x - r < 0) {
        ball.x = r;
        ball.vx = -ball.vx * bounceRestitution;
        this.onBallWallBounce(ball);
      } else if (ball.x + r > this.width) {
        ball.x = this.width - r;
        ball.vx = -ball.vx * bounceRestitution;
        this.onBallWallBounce(ball);
      }

      // 顶部墙壁反弹边界：严格限制在 hudBottom 之下，确保弹球绝不会进入或穿透到 HUD 背后
      const topBoundary = Math.max(70 * this.scale, (this.hudBottom || 126) + (10 * this.scale));
      if (ball.y - r < topBoundary) {
        ball.y = topBoundary + r;
        ball.vy = -ball.vy * bounceRestitution;
        this.onBallWallBounce(ball);
      }

      // 底部出界
      if (ball.y - r > this.height) {
        this.onBallLost();
        return;
      }

      // 碰撞检测：蘑菇反弹器
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

          // 弹性强力反弹
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

      // 碰撞检测：目标汉字球
      for (const target of this.targets) {
        if (!target.active) continue;

        const dx = ball.x - target.x;
        const dy = ball.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = ball.r + target.r;

        if (dist < minDist) {
          if (ball.word === target.word) {
            // 正确命中目标！
            this.onTargetHit(target, ball);
            break;
          } else {
            // 撞到非目标字（撞错）
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
      if (this.isRunning && !this.isCleared) this.spawnNextBall();
    }, 400);
  }

  onTargetMismatch(target, ball) {
    target.shakeTime = 1.0;
    AudioManager.instance.playSFX('sfx_mismatch');
    AudioManager.instance.playWrongWord(target.word);

    // 记录错字统计
    StorageManager.instance.recordMiss(target.word);

    // 弹性弹开
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

    this.combo++;
    const pts = 10 * this.combo;
    this.score += pts;

    // 产生五彩烟花爆炸粒子
    this.createCelebrationParticles(target.x, target.y);
    AudioManager.instance.playSFX('sfx_match');
    AudioManager.instance.playWordWithPhrase(target.word);

    // 记录命中数据
    StorageManager.instance.recordHit(target.word, this.levelData.grade, this.levelData.level);

    // 触发大字结算浮层
    this.page.showBigWord(target.word, target.pinyin, pts);
    this.page.updateHUD(this.score, this.combo, target.word);

    // 检查是否通关
    const remaining = this.targets.filter(t => t.active);
    if (remaining.length === 0) {
      this.isCleared = true;
      if (this.nextBallTimeout) {
        clearTimeout(this.nextBallTimeout);
        this.nextBallTimeout = null;
      }
      setTimeout(() => {
        this.onLevelCleared();
      }, 700);
    } else {
      if (this.nextBallTimeout) clearTimeout(this.nextBallTimeout);
      this.nextBallTimeout = setTimeout(() => {
        if (this.isRunning && !this.isCleared) this.spawnNextBall();
      }, 900);
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

    // 1. 绘制背景装饰 (鹅黄底色 + 漂浮微云)
    ctx.fillStyle = '#FFF9E6';
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. 绘制反弹蘑菇 (Bumpers)
    this.bumpers.forEach(b => {
      const scale = 1 + b.bumpAnim * 0.25;
      const r = b.r * scale;

      ctx.save();
      ctx.translate(b.x, b.y);

      // 阴影
      ctx.fillStyle = 'rgba(141, 110, 99, 0.15)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.9, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // 蘑菇伞盖
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      grad.addColorStop(0, '#FF8A80');
      grad.addColorStop(1, '#FF5252');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // 白色斑点
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.25, r * 0.2, 0, Math.PI * 2);
      ctx.arc(r * 0.35, -r * 0.25, r * 0.18, 0, Math.PI * 2);
      ctx.arc(0, r * 0.3, r * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    // 3. 绘制目标汉字方块/圆泡泡 (Targets)
    this.targets.forEach(t => {
      if (!t.active) return;

      const breathe = Math.sin(t.scaleTime) * 0.04;
      const shakeX = t.shakeTime > 0 ? (Math.random() - 0.5) * 12 * this.scale : 0;
      const r = t.r * (1 + breathe);

      ctx.save();
      ctx.translate(t.x + shakeX, t.y);

      // 泡泡外光晕
      ctx.fillStyle = t.isReview ? 'rgba(124, 77, 255, 0.15)' : 'rgba(255, 160, 0, 0.16)';
      ctx.beginPath();
      ctx.arc(0, 0, r + 8 * this.scale, 0, Math.PI * 2);
      ctx.fill();

      // 泡泡本体渐变
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

      // 泡泡边缘描边
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3 * this.scale;
      ctx.stroke();

      // 拼音 (小字)
      ctx.fillStyle = '#FFFDE7';
      ctx.font = `bold ${Math.round(14 * this.scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.pinyin, 0, -r * 0.42);

      // 汉字 (大字)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 ${Math.round(44 * this.scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.word, 0, r * 0.15);

      ctx.restore();
    });

    // 4. 绘制弹弓与皮筋 (Slingshot)
    this.renderSlingshot(ctx);

    // 5. 绘制当前发射小球
    if (this.currentBall && this.currentBall.state !== 'DEAD') {
      this.renderBall(ctx, this.currentBall);
    }

    // 6. 绘制爆炸与星星粒子
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

    // 弹弓木架底座
    ctx.strokeStyle = '#8D6E63';
    ctx.lineWidth = 14 * this.scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 左叉、右叉与主立柱
    ctx.beginPath();
    ctx.moveTo(this.anchorX, baseBottomY);
    ctx.lineTo(this.anchorX, this.anchorY + 16 * this.scale);
    ctx.lineTo(leftArmX, armTopY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.anchorX, this.anchorY + 16 * this.scale);
    ctx.lineTo(rightArmX, armTopY);
    ctx.stroke();

    // 弹力橡皮筋 (拉动时绘制前后两条皮筋连接到小球)
    if (this.currentBall && (this.currentBall.state === 'READY' || this.isDragging)) {
      const bx = this.currentBall.x;
      const by = this.currentBall.y;

      ctx.strokeStyle = '#D84315';
      ctx.lineWidth = 5 * this.scale;

      // 后皮筋
      ctx.beginPath();
      ctx.moveTo(leftArmX, armTopY);
      ctx.lineTo(bx - 15 * this.scale, by);
      ctx.stroke();

      // 前皮筋
      ctx.beginPath();
      ctx.moveTo(rightArmX, armTopY);
      ctx.lineTo(bx + 15 * this.scale, by);
      ctx.stroke();

      // 拖拽瞄准虚线预测轨迹
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

    // 拖尾特效 (绘制半透明光圈)
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

    // 1. 地面柔和立体接触投影
    ctx.fillStyle = 'rgba(141, 110, 99, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.85, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. 3D 琥珀琉璃球体底纹
    const bodyGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    bodyGrad.addColorStop(0, '#FFE082');
    bodyGrad.addColorStop(0.65, '#FFA000');
    bodyGrad.addColorStop(1, '#FF6F00');

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // 3. 琉璃球体高光 Specular Highlight
    const lightGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 0, -r * 0.35, -r * 0.35, r * 0.55);
    lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    lightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.35, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // 4. 水晶内嵌汉字 (大字号、粗体、描边)
    ctx.font = `900 ${Math.round(44 * this.scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 阴影与描边
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
