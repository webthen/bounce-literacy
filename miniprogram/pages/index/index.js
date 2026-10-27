// miniprogram/pages/index/index.js
const { GameEngine } = require('../../engine/GameEngine');
const { EbbinghausEngine } = require('../../game/EbbinghausEngine');
const { AudioManager } = require('../../game/AudioManager');
const { StorageManager } = require('../../utils/Storage');
const { VOCAB_TIERS, isExtWord, getWordPinyin, getWordPhrase } = require('../../data/vocab');
const { MONSTER_LIST } = require('../../data/monsters');

Page({
  data: {
    // 运行状态
    isPlaying: false,
    isMuted: false,
    score: 0,
    combo: 0,
    currentGrade: 1,
    currentLevel: 0,
    currentLevelTitle: '',
    levelList: [],
    passedLevelCount: 0,
    targetWord: '',
    targetPinyin: '',
    targetPhrase: '',

    // 游玩时间与防沉迷家长锁
    sessionMinutes: 5,
    remainingSeconds: 300,
    timerText: '05:00',
    pendingUnlockMins: 5,
    showTimeLockModal: false,
    lockGateQuestionText: '',
    lockGateAnswer: 0,
    lockGateOptions: [],

    // 命中大字浮层
    showBigWord: false,
    hitWord: '',
    hitPinyin: '',
    hitPhrase: '',
    hitPts: 10,

    // 各个弹窗状态
    showIntroModal: false,
    showPauseModal: false,
    showWinModal: false,
    showBookModal: false,
    showMonsterModal: false,
    showGateModal: false,
    showParentModal: false,

    // 生字导读预览
    introWords: [],

    // 通关结算
    winWords: [],
    winSummary: '',

    // 识字画册
    bookGrade: 1,
    bookMasteredCount: 0,
    bookCounterText: '已掌握: 0 字',
    bookWordsList: [],

    // 怪兽图鉴
    monsterList: [],
    unlockedMonsterCount: 1,

    // 家长门禁与看板
    gateQuestionText: '',
    gateAnswer: 0,
    gateOptions: [],
    retentionRate: 100,
    totalPracticeHits: 0,
    masteredWordsCount: 0,
    parentStatsList: [],

    // 等级说明 (6级体系)
    gradeTips: {
      1: "第 1 级 · 启蒙基础（核心60字+拓展28字 · 累计核心60字）",
      2: "第 2 级 · 探索世界（核心60字+拓展30字 · 累计核心120字）",
      3: "第 3 级 · 认知表达（核心60字+拓展32字 · 累计核心180字）",
      4: "第 4 级 · 逻辑空间（核心60字+拓展40字 · 累计核心240字）",
      5: "第 5 级 · 丰富表达（核心70字+拓展34字 · 累计核心310字）",
      6: "第 6 级 · 读写进阶（核心80字 · 累计核心390字）"
    },

    // 屏幕安全区与两层 HUD 布局参数
    statusBarHeight: 20,
    menuTop: 26,
    menuHeight: 32,
    menuBottom: 58,
    capsulePaddingRight: 96,
    missionTop: 66,
    comboTop: 122,
    totalHudHeight: 132,
    startPaddingTop: 74
  },

  onLoad() {
    this.calculateSafeArea();
    const save = StorageManager.instance.data;
    const curG = save.currentGrade || 1;
    const totalG = EbbinghausEngine.getTotalLevelsInGrade(curG);
    let curL = save.currentLevel || 0;
    if (!StorageManager.instance.isLevelUnlocked(curG, curL)) {
      curL = StorageManager.instance.getMaxUnlockedLevel(curG, totalG);
    }
    const rem = save.remainingSeconds || (save.sessionMinutes || 5) * 60;
    this.setData({
      currentGrade: curG,
      currentLevel: curL,
      sessionMinutes: save.sessionMinutes || 5,
      pendingUnlockMins: save.sessionMinutes || 5,
      remainingSeconds: rem,
      timerText: this.formatTime(rem)
    });
    this.updateLevelList(curG);

    if (save.isTimeLocked) {
      this.openTimeLockModal();
    }
  },

  onShow() {
    this.updateLevelList(this.data.currentGrade || 1);
  },

  // 动态计算并刷新当前等级的关卡进阶列表（上一关通过解锁下一关，其余待解锁）
  updateLevelList(grade) {
    grade = grade || this.data.currentGrade || 1;
    const total = EbbinghausEngine.getTotalLevelsInGrade(grade);
    const storage = StorageManager.instance;
    const curLevel = this.data.currentLevel !== undefined ? this.data.currentLevel : (storage.data.currentLevel || 0);

    let passedCount = 0;
    const list = [];
    for (let i = 0; i < total; i++) {
      const passed = storage.isLevelPassed(grade, i);
      const unlocked = storage.isLevelUnlocked(grade, i);
      if (passed) passedCount++;

      const stars = storage.data.starsPerLevel[`${grade}_${i}`] || 0;
      let starText = '';
      if (stars === 3) starText = '⭐⭐⭐';
      else if (stars === 2) starText = '⭐⭐';
      else if (stars === 1) starText = '⭐';

      list.push({
        index: i,
        name: `第 ${i + 1} 关`,
        unlocked: unlocked,
        passed: passed,
        stars: stars,
        starText: starText,
        isCurrent: (i === curLevel && unlocked)
      });
    }

    this.setData({
      levelList: list,
      passedLevelCount: passedCount
    });
  },

  // 点击选关卡：上一关通过才能进入下一关，否则拒绝并提示
  selectLevel(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const grade = this.data.currentGrade;
    const storage = StorageManager.instance;

    if (!storage.isLevelUnlocked(grade, idx)) {
      AudioManager.instance.playSFX('sfx_mismatch');
      wx.showToast({
        title: `🔒 请先通过上一关才能解锁第 ${idx + 1} 关！`,
        icon: 'none',
        duration: 1800
      });
      return;
    }

    AudioManager.instance.playSFX('sfx_click');
    this.setData({
      currentLevel: idx
    });
    this.updateLevelList(grade);
    this.startGame();
  },

  formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  },

  calculateSafeArea() {
    let menuTop = 26;
    let menuHeight = 32;
    let menuBottom = 58;
    let windowWidth = 375;
    let windowHeight = 667;
    let statusBarHeight = 20;
    let menuLeft = 281;

    try {
      const sys = wx.getSystemInfoSync();
      windowWidth = sys.windowWidth || 375;
      windowHeight = sys.windowHeight || 667;
      statusBarHeight = sys.statusBarHeight || 20;

      const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
      if (menu && menu.top && menu.height) {
        menuTop = menu.top;
        menuHeight = menu.height;
        menuBottom = menu.bottom;
        menuLeft = menu.left || (windowWidth - 94);
      } else {
        menuTop = statusBarHeight + 4;
        menuHeight = 32;
        menuBottom = menuTop + menuHeight;
        menuLeft = windowWidth - 94;
      }
    } catch (e) {}

    const capsulePaddingRight = Math.max(88, (windowWidth - menuLeft) + 12);
    const missionTop = menuBottom + 8;
    const comboTop = missionTop + 54;
    const totalHudHeight = missionTop + 62;
    const startPaddingTop = menuBottom + 16;

    this.setData({
      statusBarHeight,
      menuTop,
      menuHeight,
      menuBottom,
      capsulePaddingRight,
      missionTop,
      comboTop,
      totalHudHeight,
      startPaddingTop
    });

    if (this.gameEngine) {
      this.gameEngine.setHudBottom(totalHudHeight);
    }
  },

  onReady() {
    this.initCanvas();
  },

  onUnload() {
    this.stopSessionTimer();
    AudioManager.instance.stopVoice();
    if (this.gameEngine) {
      this.gameEngine.stop();
    }
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#gameCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          setTimeout(() => this.initCanvas(), 300);
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;

        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        this.canvasWidth = res[0].width;
        this.canvasHeight = res[0].height;

        this.gameEngine = new GameEngine(canvas, ctx, this);
        this.gameEngine.setHudBottom(this.data.totalHudHeight);
        this.gameEngine.resize(res[0].width, res[0].height, dpr);
      });
  },

  handleTouchStart(e) {
    if (!this.data.isPlaying || !this.gameEngine || StorageManager.instance.data.isTimeLocked) return;
    const touch = e.touches[0];
    if (touch) {
      this.gameEngine.onTouchStart(touch.x, touch.y);
    }
  },

  handleTouchMove(e) {
    if (!this.data.isPlaying || !this.gameEngine || StorageManager.instance.data.isTimeLocked) return;
    const touch = e.touches[0];
    if (touch) {
      this.gameEngine.onTouchMove(touch.x, touch.y);
    }
  },

  handleTouchEnd() {
    if (!this.data.isPlaying || !this.gameEngine || StorageManager.instance.data.isTimeLocked) return;
    this.gameEngine.onTouchEnd();
  },

  // 选择识字等级
  selectGrade(e) {
    const g = Number(e.currentTarget.dataset.grade);
    AudioManager.instance.playSFX('sfx_click');
    StorageManager.instance.setGrade(g);
    const total = EbbinghausEngine.getTotalLevelsInGrade(g);
    const maxUnlocked = StorageManager.instance.getMaxUnlockedLevel(g, total);
    this.setData({
      currentGrade: g,
      currentLevel: maxUnlocked
    });
    this.updateLevelList(g);
  },

  // 选择单次游玩时长 (3 / 5 / 8 分钟)
  selectSessionTime(e) {
    const mins = Number(e.currentTarget.dataset.mins);
    AudioManager.instance.playSFX('sfx_click');
    if (StorageManager.instance.data.isTimeLocked) {
      this.openTimeLockModal();
      return;
    }
    StorageManager.instance.setSessionMinutes(mins, true);
    const rem = mins * 60;
    this.setData({
      sessionMinutes: mins,
      pendingUnlockMins: mins,
      remainingSeconds: rem,
      timerText: this.formatTime(rem)
    });
  },

  selectUnlockMins(e) {
    const mins = Number(e.currentTarget.dataset.mins);
    AudioManager.instance.playSFX('sfx_click');
    this.setData({
      pendingUnlockMins: mins
    });
  },

  startSessionTimer() {
    this.stopSessionTimer();
    this.sessionTimerId = setInterval(() => {
      if (!this.data.isPlaying || this.data.showPauseModal || this.data.showIntroModal) return;
      if (StorageManager.instance.data.isTimeLocked) {
        this.handleTimeUp();
        return;
      }

      const nextSec = Math.max(0, (StorageManager.instance.data.remainingSeconds || 0) - 1);
      StorageManager.instance.data.remainingSeconds = nextSec;
      StorageManager.instance.save();

      this.setData({
        remainingSeconds: nextSec,
        timerText: this.formatTime(nextSec)
      });

      if (nextSec <= 0) {
        this.handleTimeUp();
      }
    }, 1000);
  },

  stopSessionTimer() {
    if (this.sessionTimerId) {
      clearInterval(this.sessionTimerId);
      this.sessionTimerId = null;
    }
  },

  handleTimeUp() {
    StorageManager.instance.lockByTimeUp();
    this.stopSessionTimer();
    AudioManager.instance.stopVoice();
    if (this.gameEngine) {
      this.gameEngine.stop();
    }
    this.setData({
      showIntroModal: false,
      showPauseModal: false,
      showWinModal: false
    });
    this.openTimeLockModal();
  },

  openTimeLockModal() {
    const numWords = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    const a = Math.floor(Math.random() * 6) + 3;
    const b = Math.floor(Math.random() * 6) + 3;
    const ans = a * b;

    const opts = new Set([ans]);
    while (opts.size < 4) {
      const c = ans + Math.floor(Math.random() * 13) - 6;
      if (c > 0) opts.add(c);
    }
    const arr = Array.from(opts).sort(() => Math.random() - 0.5);

    this.setData({
      pendingUnlockMins: StorageManager.instance.data.sessionMinutes || 5,
      lockGateQuestionText: `${numWords[a]} 乘以 ${numWords[b]} 等于几？`,
      lockGateAnswer: ans,
      lockGateOptions: arr,
      showTimeLockModal: true
    });
  },

  handleLockGateAnswer(e) {
    const val = Number(e.currentTarget.dataset.val);
    if (val === this.data.lockGateAnswer) {
      AudioManager.instance.playSFX('sfx_bumper');
      const mins = this.data.pendingUnlockMins || 5;
      StorageManager.instance.unlockByParent(mins);
      const rem = mins * 60;
      this.setData({
        showTimeLockModal: false,
        sessionMinutes: mins,
        remainingSeconds: rem,
        timerText: this.formatTime(rem)
      });
      if (this.data.isPlaying && this.gameEngine) {
        this.gameEngine.start();
        this.startSessionTimer();
      }
    } else {
      AudioManager.instance.playSFX('sfx_mismatch');
      this.openTimeLockModal();
    }
  },

  closeTimeLockToHome() {
    AudioManager.instance.playSFX('sfx_click');
    this.stopSessionTimer();
    AudioManager.instance.stopVoice();
    if (this.gameEngine) this.gameEngine.stop();
    this.setData({
      showTimeLockModal: false,
      isPlaying: false
    });
  },

  // 开始游戏 -> 弹出本关生字预览
  startGame() {
    AudioManager.instance.playSFX('sfx_click');
    if (StorageManager.instance.data.isTimeLocked) {
      this.openTimeLockModal();
      return;
    }

    const mins = this.data.sessionMinutes || 5;
    StorageManager.instance.setSessionMinutes(mins, true);
    const rem = mins * 60;

    const grade = this.data.currentGrade;
    const total = EbbinghausEngine.getTotalLevelsInGrade(grade);
    let levelIdx = this.data.currentLevel;
    if (levelIdx === undefined || levelIdx === null) {
      levelIdx = StorageManager.instance.data.currentLevel || 0;
    }
    // 关卡锁定检查：若未解锁则自动跳转至该等级已解锁的最大关卡
    if (!StorageManager.instance.isLevelUnlocked(grade, levelIdx)) {
      levelIdx = StorageManager.instance.getMaxUnlockedLevel(grade, total);
    }

    const levelDef = EbbinghausEngine.generateLevel(grade, levelIdx, true);
    this.currentLevelDef = levelDef;

    const introWords = levelDef.newWords.map(ch => ({
      char: ch,
      pinyin: getWordPinyin(ch),
      phrase: getWordPhrase(ch)
    }));

    this.setData({
      showIntroModal: true,
      introWords: introWords,
      currentLevel: levelIdx,
      currentLevelTitle: levelDef.title,
      remainingSeconds: rem,
      timerText: this.formatTime(rem)
    });

    AudioManager.instance.stopVoice();
    if (introWords[0]) {
      AudioManager.instance.playWordWithPhrase(introWords[0].char);
    }
  },

  playIntroWord(e) {
    const word = e.currentTarget.dataset.word;
    AudioManager.instance.playWordWithPhrase(word);
  },

  // 确认开始弹射
  confirmStartLevel() {
    if (StorageManager.instance.data.isTimeLocked) {
      this.openTimeLockModal();
      return;
    }
    AudioManager.instance.stopVoice();
    AudioManager.instance.playSFX('sfx_shoot');
    this.setData({
      showIntroModal: false,
      isPlaying: true,
      score: 0,
      combo: 0
    });

    this.startSessionTimer();

    if (this.gameEngine && this.currentLevelDef) {
      this.gameEngine.loadLevel(this.currentLevelDef);
      this.gameEngine.start();
    }
  },

  // 更新 HUD 回调
  updateHUD(score, combo, targetWord) {
    this.setData({
      score: score,
      combo: combo,
      targetWord: targetWord,
      targetPinyin: targetWord ? getWordPinyin(targetWord) : '',
      targetPhrase: targetWord ? getWordPhrase(targetWord) : ''
    });
  },

  // 播放当前目标语音
  playTargetAudio() {
    if (this.data.targetWord) {
      AudioManager.instance.playMissionPrompt(this.data.targetWord);
    }
  },

  // 击中大字浮层闪现
  showBigWord(word, pinyin, pts) {
    this.setData({
      showBigWord: true,
      hitWord: word,
      hitPinyin: pinyin,
      hitPhrase: getWordPhrase(word),
      hitPts: pts
    });

    setTimeout(() => {
      this.setData({ showBigWord: false });
    }, 680);
  },

  // 通关结算
  showLevelWin(levelDef) {
    const totalInGrade = EbbinghausEngine.getTotalLevelsInGrade(this.data.currentGrade);
    const curLevel = this.data.currentLevel;

    // 记录通关并解锁下一关
    StorageManager.instance.recordLevelWin(this.data.currentGrade, curLevel, 3);
    this.updateLevelList(this.data.currentGrade);

    const isGradeComplete = (curLevel + 1 >= totalInGrade);
    let summary = `太棒了！顺利通过第 ${curLevel + 1} 关！下一关已解锁！`;
    if (isGradeComplete) {
      summary = `🎉 恭喜通关第 ${this.data.currentGrade} 级全部字词！`;
    }

    this.setData({
      showWinModal: true,
      winWords: levelDef.targetWords,
      winSummary: summary
    });
  },

  // 下一关 (继续)
  nextLevel() {
    AudioManager.instance.stopVoice();
    AudioManager.instance.playSFX('sfx_click');
    if (StorageManager.instance.data.isTimeLocked) {
      this.setData({ showWinModal: false });
      this.openTimeLockModal();
      return;
    }

    const totalInGrade = EbbinghausEngine.getTotalLevelsInGrade(this.data.currentGrade);
    let grade = this.data.currentGrade;
    let nextL = this.data.currentLevel + 1;

    if (nextL >= totalInGrade) {
      if (grade < 6) {
        grade++;
        nextL = 0;
        StorageManager.instance.setGrade(grade);
      } else {
        nextL = 0;
      }
    }

    // 检查下一关是否已解锁（必须上一关通过）
    if (!StorageManager.instance.isLevelUnlocked(grade, nextL)) {
      wx.showToast({
        title: `🔒 下一关尚未解锁哦！`,
        icon: 'none'
      });
      return;
    }

    const levelDef = EbbinghausEngine.generateLevel(grade, nextL, true);
    this.currentLevelDef = levelDef;

    this.setData({
      showWinModal: false,
      currentGrade: grade,
      currentLevel: nextL,
      currentLevelTitle: levelDef.title,
      score: 0,
      combo: 0
    });
    this.updateLevelList(grade);

    if (this.gameEngine) {
      this.gameEngine.loadLevel(levelDef);
      this.gameEngine.start();
    }
  },

  // 重新开始本关
  retryLevel() {
    AudioManager.instance.stopVoice();
    AudioManager.instance.playSFX('sfx_click');
    if (StorageManager.instance.data.isTimeLocked) {
      this.setData({ showPauseModal: false, showWinModal: false });
      this.openTimeLockModal();
      return;
    }

    this.setData({
      showPauseModal: false,
      showWinModal: false
    });

    if (this.gameEngine && this.currentLevelDef) {
      this.gameEngine.loadLevel(this.currentLevelDef);
      this.gameEngine.start();
    }
  },

  // 暂停与返回
  openPauseModal() {
    AudioManager.instance.playSFX('sfx_click');
    if (this.gameEngine) this.gameEngine.stop();
    this.setData({ showPauseModal: true });
  },

  resumeGame() {
    AudioManager.instance.playSFX('sfx_click');
    if (StorageManager.instance.data.isTimeLocked) {
      this.setData({ showPauseModal: false });
      this.openTimeLockModal();
      return;
    }
    this.setData({ showPauseModal: false });
    if (this.gameEngine) this.gameEngine.start();
  },

  quitToMenu() {
    AudioManager.instance.stopVoice();
    AudioManager.instance.playSFX('sfx_click');
    this.stopSessionTimer();
    if (this.gameEngine) this.gameEngine.stop();
    this.setData({
      showPauseModal: false,
      showWinModal: false,
      isPlaying: false
    });
  },

  toggleMute() {
    const nextMuted = !this.data.isMuted;
    AudioManager.instance.muted = nextMuted;
    if (nextMuted) AudioManager.instance.stopVoice();
    this.setData({ isMuted: nextMuted });
  },

  // 识字画册弹窗
  openBookModal() {
    AudioManager.instance.playSFX('sfx_click');
    const grade = this.data.currentGrade;
    this.loadBookData(grade);
    this.setData({ showBookModal: true });
  },

  switchBookGrade(e) {
    const g = Number(e.currentTarget.dataset.grade);
    AudioManager.instance.playSFX('sfx_click');
    this.loadBookData(g);
  },

  loadBookData(grade) {
    const tier = VOCAB_TIERS[grade] || VOCAB_TIERS[1];
    const stats = StorageManager.instance.data.stats;
    let totalMastered = 0;
    let gradeMastered = 0;

    Object.keys(stats).forEach(k => {
      if (stats[k].hits > 0) totalMastered++;
    });

    const wordsList = tier.words.map(ch => {
      const item = stats[ch];
      const isMastered = item && item.hits > 0;
      if (isMastered) gradeMastered++;
      return {
        char: ch,
        pinyin: getWordPinyin(ch),
        phrase: getWordPhrase(ch),
        isMastered: isMastered,
        isExt: isExtWord(grade, ch)
      };
    });

    const extDesc = tier.extWords.length > 0 ? `+拓展${tier.extWords.length}字` : '';
    const counterText = `已掌握: ${totalMastered} 字 · 本级: ${gradeMastered}/${tier.words.length} (核心${tier.coreWords.length}字${extDesc} · 累计核心${tier.cumulativeCore}字)`;

    this.setData({
      bookGrade: grade,
      bookMasteredCount: totalMastered,
      bookCounterText: counterText,
      bookWordsList: wordsList
    });
  },

  closeBookModal() {
    AudioManager.instance.playSFX('sfx_click');
    this.setData({ showBookModal: false });
  },

  // 怪兽图鉴
  openMonsterModal() {
    AudioManager.instance.playSFX('sfx_click');
    const save = StorageManager.instance.data;
    let unlocked = 0;

    const list = MONSTER_LIST.map(m => {
      const isUnlocked = save.unlockedMonsters.includes(m.id);
      if (isUnlocked) unlocked++;
      return {
        ...m,
        unlocked: isUnlocked
      };
    });

    this.setData({
      monsterList: list,
      unlockedMonsterCount: unlocked,
      showMonsterModal: true
    });
  },

  playMonsterSound(e) {
    const unlocked = e.currentTarget.dataset.unlocked;
    if (unlocked) {
      AudioManager.instance.playSFX('sfx_bumper');
    }
  },

  closeMonsterModal() {
    AudioManager.instance.playSFX('sfx_click');
    this.setData({ showMonsterModal: false });
  },

  // 家长门禁
  openParentGate() {
    AudioManager.instance.playSFX('sfx_click');
    const numWords = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    const a = Math.floor(Math.random() * 5) + 2;
    const b = Math.floor(Math.random() * 5) + 2;
    const ans = a * b;

    const opts = new Set([ans]);
    while (opts.size < 4) {
      opts.add(ans + Math.floor(Math.random() * 11) - 5);
    }
    const arr = Array.from(opts).sort(() => Math.random() - 0.5);

    this.setData({
      gateQuestionText: `${numWords[a]} 乘以 ${numWords[b]} 等于几？`,
      gateAnswer: ans,
      gateOptions: arr,
      showGateModal: true
    });
  },

  handleGateAnswer(e) {
    const val = Number(e.currentTarget.dataset.val);
    if (val === this.data.gateAnswer) {
      AudioManager.instance.playSFX('sfx_bumper');
      if (StorageManager.instance.data.isTimeLocked) {
        StorageManager.instance.unlockByParent();
        const rem = StorageManager.instance.data.remainingSeconds;
        this.setData({
          remainingSeconds: rem,
          timerText: this.formatTime(rem)
        });
      }
      this.setData({ showGateModal: false });
      this.openParentDashboard();
    } else {
      AudioManager.instance.playSFX('sfx_mismatch');
      this.openParentGate();
    }
  },

  closeGateModal() {
    AudioManager.instance.playSFX('sfx_click');
    this.setData({ showGateModal: false });
  },

  // 家长数据中心看板
  openParentDashboard() {
    const stats = StorageManager.instance.data.stats;
    let totalHits = 0;
    const list = [];

    Object.keys(stats).forEach(ch => {
      const item = stats[ch];
      totalHits += item.hits;
      const rate = Math.round((item.hits / (item.exposures || 1)) * 100);
      list.push({
        char: ch,
        pinyin: getWordPinyin(ch),
        exposures: item.exposures,
        hits: item.hits,
        misses: item.misses,
        rate: rate
      });
    });

    const retention = StorageManager.instance.getRetentionRate();

    this.setData({
      showParentModal: true,
      retentionRate: retention,
      totalPracticeHits: totalHits,
      masteredWordsCount: list.length,
      parentStatsList: list
    });
  },

  closeParentModal() {
    AudioManager.instance.playSFX('sfx_click');
    this.setData({ showParentModal: false });
  },

  playWordVoice(e) {
    const word = e.currentTarget.dataset.word;
    AudioManager.instance.playWordWithPhrase(word);
  }
});
