import * as PIXI from 'pixi.js';
import { PlayScene } from './scenes/PlayScene';
import { AudioManager } from './game/AudioManager';
import { StorageManager } from './utils/Storage';
import { MONSTER_LIST } from './data/monsters';
import { getWordPinyin, getWordPhrase, isExtWord, VOCAB_TIERS } from './data/vocab';
import { EbbinghausEngine } from './game/EbbinghausEngine';

class App {
  private app: PIXI.Application;
  private playScene: PlayScene | null = null;
  private isPlaying: boolean = false;
  private isPausedByModal: boolean = false;
  private sessionTimerId: any = null;
  private pendingUnlockMins: number = 5;
  private pendingContractMins: number = 5;
  private hasWarned30s: boolean = false;
  private warnToastTimer: any = null;

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

    this.pendingUnlockMins = StorageManager.instance.data.sessionMinutes || 5;
    this.setupUI();
    this.setupTicker();
    this.checkOrientation();
    window.addEventListener('resize', () => this.checkOrientation());
    window.addEventListener('orientationchange', () => this.checkOrientation());

    // 预热全局核心 Fish Audio 语音，确保首次发音零延迟
    AudioManager.instance.prefetchLevel([]);

    // 若上次已是时间截止锁定状态，进入页面即提示家长解锁
    if (StorageManager.instance.data.isTimeLocked) {
      this.openTimeLockModal();
    }
  }

  private isRotated: boolean = false;
  private originalMapPos: any = null;

  private checkOrientation() {
    const isPortrait = window.innerHeight > window.innerWidth;
    document.body.classList.toggle('is-portrait', isPortrait);
    document.body.classList.toggle('is-landscape', !isPortrait);

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
      if (this.isPlaying && !this.isPausedByModal && !StorageManager.instance.data.isTimeLocked && this.playScene) {
        this.playScene.update(dt);
      }
    });
  }

  private setupUI() {
    const startScreen = document.getElementById('start-screen');
    const hud = document.getElementById('game-hud');

    // 识字等级切换 (第 1 级 ~ 第 6 级)
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
          this.updateLevelList(grade);
        };
      });
    };
    setupGradeBtnList('grade-btn-group');
    setupGradeBtnList('parent-grade-btn-group');
    this.updateLevelList(StorageManager.instance.data.currentGrade || 1);

    // 游玩时间选择 (3 / 5 / 8 分钟)
    this.updateTimeButtons();
    const startTimeBtns = document.querySelectorAll('#time-btn-group .btn-time-opt');
    startTimeBtns.forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        if (StorageManager.instance.data.isTimeLocked) {
          this.openTimeLockModal();
          return;
        }
        const mins = parseInt(btn.getAttribute('data-mins') || '5');
        this.pendingUnlockMins = mins;
        StorageManager.instance.setSessionMinutes(mins, true);
        this.updateTimeButtons();
        this.updateTimerBadgeUI();
      };
    });

    const lockTimeBtns = document.querySelectorAll('#lock-time-btn-group .btn-time-opt');
    lockTimeBtns.forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        const mins = parseInt(btn.getAttribute('data-mins') || '5');
        this.pendingUnlockMins = mins;
        this.updateTimeButtons();
      };
    });

    const btnLockBackHome = document.getElementById('btn-lock-back-home');
    if (btnLockBackHome) {
      btnLockBackHome.onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        document.getElementById('time-lock-modal')?.classList.remove('show');
        if (this.isPlaying) {
          this.quitToTitle();
        }
      };
    }

    // 开始游戏
    document.getElementById('btn-start-game')!.onclick = () => {
      AudioManager.instance.unlock();
      AudioManager.instance.playSFX('sfx_click');
      if (StorageManager.instance.data.isTimeLocked) {
        this.openTimeLockModal();
        return;
      }
      const grade = StorageManager.instance.data.currentGrade || 1;
      const total = EbbinghausEngine.getTotalLevelsInGrade(grade);
      const maxUnlocked = StorageManager.instance.getMaxUnlockedLevel(grade, total);
      let curL = StorageManager.instance.data.currentLevel || 0;
      if (!StorageManager.instance.isLevelUnlocked(grade, curL)) {
        curL = maxUnlocked;
        StorageManager.instance.data.currentLevel = curL;
      }
      this.openContractModal();
    };

    // 暂停面板
    const pauseModal = document.getElementById('pause-modal')!;
    document.getElementById('pause-btn')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      this.isPausedByModal = true;
      pauseModal.classList.add('show');
    };
    document.getElementById('btn-resume')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      this.isPausedByModal = false;
      pauseModal.classList.remove('show');
    };
    document.getElementById('btn-restart-level')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      this.isPausedByModal = false;
      pauseModal.classList.remove('show');
      if (this.playScene) this.playScene.retryLevel();
    };
    document.getElementById('btn-quit-to-menu')!.onclick = () => {
      AudioManager.instance.playSFX('sfx_click');
      this.isPausedByModal = false;
      pauseModal.classList.remove('show');
      this.quitToTitle();
    };

    // 通关结算面板
    const winModal = document.getElementById('win-modal')!;
    document.getElementById('modal-next-btn')!.onclick = () => {
      if (StorageManager.instance.data.isTimeLocked) {
        winModal.classList.remove('show');
        this.openTimeLockModal();
        return;
      }
      winModal.classList.remove('show');
      if (this.playScene) this.playScene.nextLevel();
    };
    document.getElementById('modal-retry-btn')!.onclick = () => {
      if (StorageManager.instance.data.isTimeLocked) {
        winModal.classList.remove('show');
        this.openTimeLockModal();
        return;
      }
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

    // 声音开关
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

    // 网页内横屏/竖屏自由切换
    const rotateBtns = document.querySelectorAll('.btn-rotate-toggle');
    rotateBtns.forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        this.toggleInPageRotation();
      };
    });

    // 时间约定契约弹窗选项交互
    document.querySelectorAll('#contract-options-grid .contract-opt-card').forEach(card => {
      (card as HTMLElement).onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        const mins = parseInt(card.getAttribute('data-mins') || '5');
        this.selectContractMins(mins);
      };
    });

    const btnConfirmContract = document.getElementById('btn-confirm-contract');
    if (btnConfirmContract) {
      btnConfirmContract.onclick = () => {
        AudioManager.instance.playSFX('sfx_click');
        this.confirmContract();
      };
    }

    const btnReplayContract = document.getElementById('btn-replay-contract-voice');
    if (btnReplayContract) {
      btnReplayContract.onclick = () => {
        AudioManager.instance.stopVoice();
        AudioManager.instance.playVoice('vo_contract_intro');
      };
    }

    const btnReplayTimeup = document.getElementById('btn-replay-timeup-voice');
    if (btnReplayTimeup) {
      btnReplayTimeup.onclick = () => {
        AudioManager.instance.stopVoice();
        AudioManager.instance.playVoice('vo_timeup');
      };
    }
  }

  private updateTimeButtons() {
    const curMins = StorageManager.instance.data.sessionMinutes || 5;
    document.querySelectorAll('#time-btn-group .btn-time-opt').forEach(el => {
      const m = parseInt(el.getAttribute('data-mins') || '5');
      el.classList.toggle('active', m === curMins);
    });
    document.querySelectorAll('#lock-time-btn-group .btn-time-opt').forEach(el => {
      const m = parseInt(el.getAttribute('data-mins') || '5');
      el.classList.toggle('active', m === this.pendingUnlockMins);
    });
  }

  private formatRemainingTime(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  private updateTimerBadgeUI() {
    const badge = document.getElementById('timer-badge');
    if (!badge) return;
    const rem = StorageManager.instance.data.remainingSeconds;
    badge.innerText = `⏳ ${this.formatRemainingTime(rem)}`;
    badge.classList.toggle('urgent', rem <= 30);
  }

  private startSessionTimer() {
    this.stopSessionTimer();
    this.updateTimerBadgeUI();
    this.sessionTimerId = setInterval(() => {
      if (!this.isPlaying || this.isPausedByModal) return;
      if (StorageManager.instance.data.isTimeLocked) {
        this.handleTimeUp();
        return;
      }

      const nextSec = Math.max(0, (StorageManager.instance.data.remainingSeconds || 0) - 1);
      StorageManager.instance.data.remainingSeconds = nextSec;
      StorageManager.instance.save();
      this.updateTimerBadgeUI();

      // 剩余 30 秒温馨预警 (视觉横幅 + 专属 Fish Audio 语音)
      if (nextSec <= 30 && !this.hasWarned30s && nextSec > 0) {
        this.hasWarned30s = true;
        this.trigger30sWarning();
      }

      if (nextSec <= 0) {
        this.handleTimeUp();
      }
    }, 1000);
  }

  private trigger30sWarning() {
    AudioManager.instance.playVoice('vo_warn_30s');
    const toast = document.getElementById('warn-30s-toast');
    if (toast) {
      toast.classList.add('show');
      if (this.warnToastTimer) clearTimeout(this.warnToastTimer);
      this.warnToastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 5000);
    }
  }

  private openContractModal() {
    const curMins = StorageManager.instance.data.sessionMinutes || 5;
    this.selectContractMins(curMins, false);
    document.getElementById('contract-modal')?.classList.add('show');
    // 打开契约弹窗时，亲切女声引导小朋友做自主约定
    AudioManager.instance.stopVoice();
    AudioManager.instance.playVoice('vo_contract_intro');
  }

  private selectContractMins(mins: number, playVoice: boolean = true) {
    this.pendingContractMins = mins;
    document.querySelectorAll('#contract-options-grid .contract-opt-card').forEach(el => {
      const m = parseInt(el.getAttribute('data-mins') || '5');
      el.classList.toggle('active', m === mins);
    });
    const promiseEl = document.getElementById('contract-promise-text');
    if (promiseEl) {
      promiseEl.innerText = `我的承诺：我约定挑战 ${mins} 分钟，时间到了主动休息眼睛！`;
    }
    if (playVoice) {
      AudioManager.instance.stopVoice();
      AudioManager.instance.playVoice(`vo_opt_${mins}`);
    }
  }

  private confirmContract() {
    document.getElementById('contract-modal')?.classList.remove('show');
    const mins = this.pendingContractMins || 5;
    // 播放自主契约承诺确认语音 (Fish Audio 亲切女声)
    AudioManager.instance.playVoice(`vo_contract_${mins}`);
    StorageManager.instance.setSessionMinutes(mins, true);
    this.hasWarned30s = false;
    this.updateTimeButtons();
    this.updateTimerBadgeUI();

    const startScreen = document.getElementById('start-screen');
    const hud = document.getElementById('game-hud');
    if (startScreen && hud) {
      startScreen.classList.add('hidden');
      hud.style.display = 'flex';
      this.startGame();
    }
  }

  private stopSessionTimer() {
    if (this.sessionTimerId) {
      clearInterval(this.sessionTimerId);
      this.sessionTimerId = null;
    }
  }

  private handleTimeUp() {
    StorageManager.instance.lockByTimeUp();
    this.stopSessionTimer();
    AudioManager.instance.stopVoice();
    this.isPausedByModal = true;
    document.getElementById('contract-modal')?.classList.remove('show');
    document.getElementById('warn-30s-toast')?.classList.remove('show');
    document.getElementById('intro-modal')?.classList.remove('show');
    document.getElementById('pause-modal')?.classList.remove('show');
    document.getElementById('win-modal')?.classList.remove('show');
    this.openTimeLockModal();
  }

  private openTimeLockModal() {
    this.pendingUnlockMins = StorageManager.instance.data.sessionMinutes || 5;
    this.updateTimeButtons();
    // 游玩时间截止时，亲切女声提醒小朋友休息眼睛并请家长解锁
    AudioManager.instance.stopVoice();
    AudioManager.instance.playVoice('vo_timeup');

    const numWords = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    const a = Math.floor(Math.random() * 6) + 3;
    const b = Math.floor(Math.random() * 6) + 3;
    const ans = a * b;
    const qEl = document.getElementById('lock-gate-question');
    if (qEl) {
      qEl.innerText = `${numWords[a]} 乘以 ${numWords[b]} 等于几？`;
    }

    const opts = new Set([ans]);
    while (opts.size < 4) {
      const candidate = ans + Math.floor(Math.random() * 13) - 6;
      if (candidate > 0) opts.add(candidate);
    }
    const arr = Array.from(opts).sort(() => Math.random() - 0.5);

    const optContainer = document.getElementById('lock-gate-options');
    if (optContainer) {
      optContainer.innerHTML = '';
      arr.forEach(val => {
        const btn = document.createElement('button');
        btn.className = 'btn-gate-opt';
        btn.innerText = String(val);
        btn.onclick = () => {
          if (val === ans) {
            AudioManager.instance.playSFX('sfx_bumper');
            StorageManager.instance.unlockByParent(this.pendingUnlockMins);
            this.hasWarned30s = false;
            this.updateTimeButtons();
            this.updateTimerBadgeUI();
            document.getElementById('time-lock-modal')?.classList.remove('show');
            this.isPausedByModal = false;
            if (this.isPlaying) {
              this.startSessionTimer();
            }
          } else {
            AudioManager.instance.playSFX('sfx_mismatch');
            this.openTimeLockModal();
          }
        };
        optContainer.appendChild(btn);
      });
    }

    document.getElementById('time-lock-modal')?.classList.add('show');
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

    this.isPausedByModal = false;
    this.playScene = new PlayScene(this.app, () => this.quitToTitle(), isPortrait, targetW, targetH);
    this.app.stage.addChild(this.playScene);
    this.isPlaying = true;
    this.startSessionTimer();
  }

  private quitToTitle() {
    this.isPlaying = false;
    this.isPausedByModal = false;
    this.stopSessionTimer();
    AudioManager.instance.stopVoice();
    if (this.playScene) {
      this.app.stage.removeChild(this.playScene);
      this.playScene.destroy({ children: true });
      this.playScene = null;
    }
    const introModal = document.getElementById('intro-modal');
    if (introModal) introModal.classList.remove('show');
    document.getElementById('game-hud')!.style.display = 'none';
    document.getElementById('start-screen')!.classList.remove('hidden');
    this.updateLevelList(StorageManager.instance.data.currentGrade || 1);
  }

  private updateLevelList(grade: number) {
    const scrollRow = document.getElementById('level-scroll-row');
    if (!scrollRow) return;
    scrollRow.innerHTML = '';

    const total = EbbinghausEngine.getTotalLevelsInGrade(grade);
    const passedCount = StorageManager.instance.getPassedLevelCount(grade, total);
    const maxUnlocked = StorageManager.instance.getMaxUnlockedLevel(grade, total);

    let curL = StorageManager.instance.data.currentLevel ?? 0;
    if (!StorageManager.instance.isLevelUnlocked(grade, curL)) {
      curL = maxUnlocked;
      StorageManager.instance.data.currentLevel = curL;
    }

    const subEl = document.getElementById('level-box-subtitle');
    if (subEl) {
      subEl.innerText = `上一关通过解锁下一关 · 第 ${grade} 级`;
    }
    const badgeEl = document.getElementById('level-progress-badge');
    if (badgeEl) {
      badgeEl.innerText = `已通关: ${passedCount}/${total} 关`;
    }

    const startScreen = document.getElementById('start-screen');
    const hud = document.getElementById('game-hud');

    for (let i = 0; i < total; i++) {
      const isPassed = StorageManager.instance.isLevelPassed(grade, i);
      const isUnlocked = StorageManager.instance.isLevelUnlocked(grade, i);
      const isCur = (i === curL);

      const item = document.createElement('div');
      item.className = `level-card-item ${isUnlocked ? (isPassed ? 'level-passed' : 'level-active') : 'level-locked'} ${isCur ? 'is-current' : ''}`;

      const starText = isPassed ? (StorageManager.instance.data.starsPerLevel[`${grade}_${i}`] === 3 ? '⭐⭐⭐' : '⭐') : '';

      item.innerHTML = `
        <div class="level-card-name">第 ${i + 1} 关</div>
        ${isPassed 
          ? `<div class="level-card-status"><span class="status-star" style="font-size:10px;">${starText}</span><span class="status-text" style="font-size:10px; font-weight:bold; color:#2E7D32;">已通关</span></div>`
          : (isUnlocked 
              ? `<div class="level-card-status"><span class="status-text active-text" style="font-size:11px; font-weight:800; color:#FF6F00;">🔥 可挑战</span></div>`
              : `<div class="level-card-status"><span style="font-size:12px;">🔒</span><span class="locked-text" style="font-size:10px; color:#78909C;">待解锁</span></div>`
            )
        }
      `;

      item.onclick = () => {
        if (!isUnlocked) {
          AudioManager.instance.playSFX('sfx_mismatch');
          alert(`🔒 请先通过上一关才能解锁第 ${i + 1} 关！`);
          return;
        }
        AudioManager.instance.playSFX('sfx_click');
        if (StorageManager.instance.data.isTimeLocked) {
          this.openTimeLockModal();
          return;
        }
        StorageManager.instance.data.currentLevel = i;
        StorageManager.instance.save();
        this.updateLevelList(grade);
        this.openContractModal();
      };

      scrollRow.appendChild(item);
    }
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
      const extFlag = isExtWord(grade, ch);

      const card = document.createElement('div');
      card.className = `book-card ${isMastered ? 'mastered' : 'unmastered'}`;
      card.innerHTML = `
        ${isMastered ? `<div class="book-badge">✓</div>` : ''}
        ${extFlag ? `<div style="position:absolute;top:-5px;left:-5px;background:#7E57C2;color:#FFF;font-size:10px;padding:1px 5px;border-radius:8px;font-weight:bold;">拓</div>` : ''}
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
      const extDesc = tier.extWords.length > 0 ? `+拓展${tier.extWords.length}字` : '';
      counter.innerText = `已掌握: ${totalMastered} 字 · 本级掌握: ${gradeMastered} / ${tier.words.length} (核心${tier.coreWords.length}字${extDesc} · 累计核心${tier.cumulativeCore}字)`;
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
          // 家长验证通过后若处于时间截止锁屏也一并解锁
          if (StorageManager.instance.data.isTimeLocked) {
            StorageManager.instance.unlockByParent();
            this.updateTimerBadgeUI();
          }
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
      1: "第 1 级 · 启蒙基础（核心60字 + 拓展28字 · 累计核心：60字）",
      2: "第 2 级 · 探索世界（核心60字 + 拓展30字 · 累计核心：120字）",
      3: "第 3 级 · 认知表达（核心60字 + 拓展32字 · 累计核心：180字）",
      4: "第 4 级 · 逻辑空间（核心60字 + 拓展40字 · 累计核心：240字）",
      5: "第 5 级 · 丰富表达（核心70字 + 拓展34字 · 累计核心：310字）",
      6: "第 6 级 · 读写进阶（核心80字 · 累计核心：390字）"
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

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
