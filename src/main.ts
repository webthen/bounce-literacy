import * as PIXI from 'pixi.js';
import { PlayScene } from './scenes/PlayScene';
import { AudioManager } from './game/AudioManager';
import { StorageManager } from './utils/Storage';
import { MONSTER_LIST } from './data/monsters';
import { getWordPinyin, getWordPhrase, VOCAB_TIERS } from './data/vocab';

class App {
  private app: PIXI.Application;
  private playScene: PlayScene | null = null;
  private isPlaying: boolean = false;

  constructor() {
    const isPortrait = window.innerHeight > window.innerWidth;
    const screenW = window.innerWidth || 360;
    const screenH = window.innerHeight || 640;
    const targetW = isPortrait ? 720 : 1280;
    const targetH = isPortrait ? Math.round(720 * (screenH / screenW)) : 720;

    this.app = new PIXI.Application({
      width: targetW,
      height: targetH,
      backgroundColor: 0xFFF9E6,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });

    const wrapper = document.getElementById('game-wrapper');
    if (wrapper) {
      wrapper.appendChild(this.app.view as HTMLCanvasElement);
    }

    this.setupUI();
    this.setupTicker();
    this.checkOrientation();
    window.addEventListener('resize', () => this.checkOrientation());
    window.addEventListener('orientationchange', () => this.checkOrientation());
  }

  private isRotated: boolean = false;
  private originalMapPos: any = null;

  private checkOrientation() {
    const isPortrait = window.innerHeight > window.innerWidth;
    document.body.classList.toggle('is-portrait', isPortrait);
    document.body.classList.toggle('is-landscape', !isPortrait);

    // 动态调整 Pixi.js 渲染器逻辑分辨率
    // 竖屏时动态匹配屏幕宽高比，保证 ScaleX === ScaleY，100% 杜绝小球与文字纵向拉伸变成椭圆
    const screenW = window.innerWidth || 360;
    const screenH = window.innerHeight || 640;
    const targetW = isPortrait ? 720 : 1280;
    const targetH = isPortrait ? Math.round(720 * (screenH / screenW)) : 720;

    if (this.app.renderer.width !== targetW || this.app.renderer.height !== targetH) {
      this.app.renderer.resize(targetW, targetH);
    }
    if (this.playScene) {
      this.playScene.setOrientation(isPortrait, targetW, targetH);
    }

    // 若用户物理旋转至横屏，自动退出网页内强制旋转，恢复完美原生全屏横屏
    if (!isPortrait && this.isRotated) {
      this.toggleInPageRotation();
    }
  }

  private toggleInPageRotation() {
    this.isRotated = !this.isRotated;
    const wrapper = document.getElementById('game-wrapper');
    if (!wrapper) return;

    wrapper.classList.toggle('in-page-rotated', this.isRotated);
    const rotateBtns = document.querySelectorAll('.btn-rotate-toggle');
    rotateBtns.forEach(btn => {
      (btn as HTMLElement).innerText = this.isRotated ? '📱 竖屏模式' : (btn.id === 'btn-rotate-start' ? '🔄 横屏模式' : '🔄 横屏');
    });

    if (this.isRotated) {
      if (!this.originalMapPos) {
        this.originalMapPos = (this.app.renderer.events as any).mapPositionToPoint.bind(this.app.renderer.events);
      }
      (this.app.renderer.events as any).mapPositionToPoint = (point: PIXI.Point, x2: number, y2: number) => {
        const canvas = this.app.view as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        // 90度顺时针旋转坐标转换映射：触控垂直映射游戏X轴，触控水平映射游戏Y轴
        point.x = ((y2 - rect.top) / (rect.height || 1)) * 1280;
        point.y = ((rect.right - x2) / (rect.width || 1)) * 720;
      };
    } else {
      if (this.originalMapPos) {
        (this.app.renderer.events as any).mapPositionToPoint = this.originalMapPos;
      }
    }
  }

  private setupTicker() {
    this.app.ticker.add((delta) => {
      const dt = delta / 60;
      if (this.isPlaying && this.playScene) {
        this.playScene.update(dt);
      }
    });
  }

  private setupUI() {
    const startScreen = document.getElementById('start-screen');
    const hud = document.getElementById('game-hud');

    // 识字等级切换 (第 1 级 ~ 第 5 级)
    this.updateGradeButtons();
    const setupGradeBtnList = (containerId: string) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      const btns = container.querySelectorAll('.btn-grade');
      btns.forEach(btn => {
        (btn as HTMLElement).onclick = () => {
          AudioManager.instance.playSFX('sfx_click');
          const grade = parseInt(btn.getAttribute('data-grade') || '1');
          StorageManager.instance.setGrade(grade);
          this.updateGradeButtons();
        };
      });
    };
    setupGradeBtnList('grade-btn-group');
    setupGradeBtnList('parent-grade-btn-group');

    // 开始游戏
    document.getElementById('btn-start-game')!.onclick = () => {
      AudioManager.instance.unlock();
      AudioManager.instance.playSFX('sfx_click');
      startScreen!.classList.add('hidden');
      hud!.style.display = 'flex';
      this.startGame();
    };

    // 暂停面板
    const pauseModal = document.getElementById('pause-modal')!;
    document.getElementById('pause-btn')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      pauseModal.classList.add('show');
    };
    document.getElementById('btn-resume')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      pauseModal.classList.remove('show');
    };
    document.getElementById('btn-restart-level')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      pauseModal.classList.remove('show');
      if (this.playScene) this.playScene.retryLevel();
    };
    document.getElementById('btn-quit-to-menu')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      pauseModal.classList.remove('show');
      this.quitToTitle();
    };

    // 通关结算面板
    const winModal = document.getElementById('win-modal')!;
    document.getElementById('modal-next-btn')!.onclick = () => {
      winModal.classList.remove('show');
      if (this.playScene) this.playScene.nextLevel();
    };
    document.getElementById('modal-retry-btn')!.onclick = () => {
      winModal.classList.remove('show');
      if (this.playScene) this.playScene.retryLevel();
    };

    // 小怪兽图鉴
    const monsterModal = document.getElementById('monster-modal')!;
    document.getElementById('btn-open-monsters')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      this.renderMonsters();
      monsterModal.classList.add('show');
    };
    document.getElementById('btn-close-monsters')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      monsterModal.classList.remove('show');
    };

    // 我的识字画册
    const bookModal = document.getElementById('book-modal')!;
    const btnOpenBook = document.getElementById('btn-open-book');
    if (btnOpenBook) {
      btnOpenBook.onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        const curGrade = StorageManager.instance.data.currentGrade || 1;
        this.renderBook(curGrade);
        bookModal.classList.add('show');
      };
    }
    const btnCloseBook = document.getElementById('btn-close-book');
    if (btnCloseBook) {
      btnCloseBook.onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        bookModal.classList.remove('show');
      };
    }
    const bookGradeBtns = document.querySelectorAll('#book-grade-btn-group .btn-grade');
    bookGradeBtns.forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        const g = parseInt(btn.getAttribute('data-grade') || '1');
        this.renderBook(g);
      };
    });

    // 家长门禁
    const gateModal = document.getElementById('gate-modal')!;
    const parentModal = document.getElementById('parent-modal')!;
    document.getElementById('btn-open-parent')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      this.openParentGate();
    };
    document.getElementById('btn-close-gate')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      gateModal.classList.remove('show');
    };
    document.getElementById('btn-close-parent')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      parentModal.classList.remove('show');
    };

    // 声音开关 (简洁图标按钮)
    const soundBtn = document.getElementById('sound-btn');
    if (soundBtn) {
      soundBtn.onclick = () => {
        AudioManager.instance.muted = !AudioManager.instance.muted;
        soundBtn.innerText = AudioManager.instance.muted ? '🔇' : '🔊';
        soundBtn.title = AudioManager.instance.muted ? '开启声音' : '静音';
      };
    }

    // 全屏切换
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      };
    }

    // 网页内横屏/竖屏自由切换（无需配置手机系统横屏，即开即玩）
    const rotateBtns = document.querySelectorAll('.btn-rotate-toggle');
    rotateBtns.forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        this.toggleInPageRotation();
      };
    });
  }

  private startGame() {
    if (this.playScene) {
      this.app.stage.removeChild(this.playScene);
      this.playScene.destroy({ children: true });
    }
    const isPortrait = window.innerHeight > window.innerWidth;
    const screenW = window.innerWidth || 360;
    const screenH = window.innerHeight || 640;
    const targetW = isPortrait ? 720 : 1280;
    const targetH = isPortrait ? Math.round(720 * (screenH / screenW)) : 720;

    this.playScene = new PlayScene(this.app, () => this.quitToTitle(), isPortrait, targetW, targetH);
    this.app.stage.addChild(this.playScene);
    this.isPlaying = true;
  }

  private quitToTitle() {
    this.isPlaying = false;
    AudioManager.instance.stopSpeech();
    if (this.playScene) {
      this.app.stage.removeChild(this.playScene);
      this.playScene.destroy({ children: true });
      this.playScene = null;
    }
    const introModal = document.getElementById('intro-modal');
    if (introModal) introModal.classList.remove('show');
    document.getElementById('game-hud')!.style.display = 'none';
    document.getElementById('start-screen')!.classList.remove('hidden');
  }

  private renderMonsters() {
    const container = document.getElementById('monster-list')!;
    container.innerHTML = '';
    let unlocked = 0;
    const save = StorageManager.instance.data;

    MONSTER_LIST.forEach(m => {
      const isUnlocked = save.unlockedMonsters.includes(m.id);
      if (isUnlocked) unlocked++;
      const card = document.createElement('div');
      card.className = `monster-card ${isUnlocked ? '' : 'locked'}`;
      card.innerHTML = `
        <div class="monster-icon">${m.icon}</div>
        <div class="monster-name">${m.name}</div>
        <div class="monster-desc">${isUnlocked ? '已解锁' : m.desc}</div>
      `;
      if (isUnlocked) {
        card.onclick = () => AudioManager.instance.playSFX('sfx_bumper');
      }
      container.appendChild(card);
    });
    document.getElementById('monster-counter')!.innerText = `已收集: ${unlocked} / ${MONSTER_LIST.length}`;
  }

  private renderBook(grade: number) {
    const grid = document.getElementById('book-grid')!;
    grid.innerHTML = '';
    const stats = StorageManager.instance.data.stats;

    document.querySelectorAll('#book-grade-btn-group .btn-grade').forEach(btn => {
      const g = parseInt(btn.getAttribute('data-grade') || '1');
      btn.classList.toggle('active', g === grade);
    });

    const tier = VOCAB_TIERS[grade] || VOCAB_TIERS[1];
    let gradeMastered = 0;
    let totalMastered = 0;

    Object.keys(stats).forEach(k => {
      if (stats[k].hits > 0) totalMastered++;
    });

    tier.words.forEach(ch => {
      const item = stats[ch];
      const isMastered = item && item.hits > 0;
      if (isMastered) gradeMastered++;

      const py = getWordPinyin(ch);
      const ph = getWordPhrase(ch);

      const card = document.createElement('div');
      card.className = `book-card ${isMastered ? 'mastered' : 'unmastered'}`;
      card.innerHTML = `
        ${isMastered ? `<div class="book-badge">✓</div>` : ''}
        <div class="book-pinyin">${py}</div>
        <div class="book-char">${ch}</div>
        <div class="book-phrase">${ph}</div>
      `;
      card.onclick = () => {
        AudioManager.instance.playWordWithPhrase(ch);
      };
      grid.appendChild(card);
    });

    const counter = document.getElementById('book-counter');
    if (counter) {
      counter.innerText = `已掌握: ${totalMastered} / 300 字 · 本级掌握: ${gradeMastered} / ${tier.words.length} (${tier.title})`;
    }
  }

  private openParentGate() {
    const numWords = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    const a = Math.floor(Math.random() * 5) + 2;
    const b = Math.floor(Math.random() * 5) + 2;
    const ans = a * b;
    document.getElementById('gate-question')!.innerText = `${numWords[a]} 乘以 ${numWords[b]} 等于几？`;

    const opts = new Set([ans]);
    while (opts.size < 4) {
      opts.add(ans + Math.floor(Math.random() * 11) - 5);
    }
    const arr = Array.from(opts).sort(() => Math.random() - 0.5);

    const optContainer = document.getElementById('gate-options')!;
    optContainer.innerHTML = '';
    arr.forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'btn-gate-opt';
      btn.innerText = String(val);
      btn.onclick = () => {
        if (val === ans) {
          AudioManager.instance.playSFX('sfx_bumper');
          document.getElementById('gate-modal')!.classList.remove('show');
          this.openParentDashboard();
        } else {
          AudioManager.instance.playSFX('sfx_mismatch');
          this.openParentGate();
        }
      };
      optContainer.appendChild(btn);
    });
    document.getElementById('gate-modal')!.classList.add('show');
  }

  private updateGradeButtons() {
    const curG = StorageManager.instance.data.currentGrade || 1;
    document.querySelectorAll('.btn-grade').forEach(el => {
      const g = parseInt(el.getAttribute('data-grade') || '1');
      el.classList.toggle('active', g === curG);
    });

    const tips: Record<number, string> = {
      1: "第 1 级 · 启蒙基础 (数词、自然天地、身体动作与亲人)",
      2: "第 2 级 · 探索世界 (代词、四季气候、常见动物与生活色彩)",
      3: "第 3 级 · 认知表达 (家庭成员、身体部位、疑问词与特征反义词)",
      4: "第 4 级 · 逻辑空间 (方位定向、动作指令、身体感受与逻辑连接)",
      5: "第 5 级 · 丰富表达 (量词度量、五味感官、形态细节与事理法则)"
    };
    const tipEl = document.getElementById('grade-tip-text');
    if (tipEl) {
      tipEl.innerText = tips[curG] || tips[1];
    }
  }

  private openParentDashboard() {
    this.updateGradeButtons();
    const tbody = document.getElementById('stats-tbody')!;
    tbody.innerHTML = '';
    const stats = StorageManager.instance.data.stats;
    let totalHits = 0;
    const chars = Object.keys(stats);
    chars.forEach(char => {
      const item = stats[char];
      totalHits += item.hits;
      const rate = Math.round((item.hits / (item.exposures || 1)) * 100);
      const py = getWordPinyin(char);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${char}</strong></td>
        <td style="color:#FFA000; font-weight:bold;">${py}</td>
        <td>${item.exposures}</td>
        <td><span style="color:#4CAF50;">${item.hits}</span></td>
        <td><span style="color:#F44336;">${item.misses}</span></td>
        <td><strong>${rate}%</strong></td>
      `;
      tbody.appendChild(tr);
    });

    const retention = StorageManager.instance.getRetentionRate();
    const retEl = document.getElementById('parent-retention-rate');
    if (retEl) {
      retEl.innerText = `艾宾浩斯记忆留存率: ${retention}% (${retention >= 85 ? '🌟 记忆稳固' : retention >= 65 ? '👍 良好' : '💪 需多轮巩固'})`;
    }

    document.getElementById('parent-summary-text')!.innerText = `累计消除练习: ${totalHits} 次 | 已掌握汉字: ${chars.length} 个`;
    document.getElementById('parent-modal')!.classList.add('show');
  }
}

// 页面加载完成后启动
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
