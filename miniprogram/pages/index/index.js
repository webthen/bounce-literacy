// miniprogram/pages/index/index.js
const { GameEngine } = require('../../engine/GameEngine');
const { EbbinghausEngine } = require('../../game/EbbinghausEngine');
const { AudioManager } = require('../../game/AudioManager');
const { StorageManager } = require('../../utils/Storage');
const { VOCAB_TIERS, getWordPinyin, getWordPhrase } = require('../../data/vocab');
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
    targetWord: '',
    targetPinyin: '',
    targetPhrase: '',

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

    // 识字画册
    bookGrade: 1,
    bookMasteredCount: 0,
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

    // 等级说明
    gradeTips: {
      1: "第 1 级 · 启蒙基础 (数词、自然天地、身体动作与亲人)",
      2: "第 2 级 · 探索世界 (代词、四季气候、常见动物与生活色彩)",
      3: "第 3 级 · 认知表达 (家庭成员、身体部位、疑问词与特征反义词)",
      4: "第 4 级 · 逻辑空间 (方位定向、动作指令、身体感受与逻辑连接)",
      5: "第 5 级 · 丰富表达 (量词度量、五味感官、形态细节与事理法则)"
    },

    // 屏幕安全区与两层 HUD 布局参数 (适配刘海、状态栏与微信胶囊)
    statusBarHeight: 20,
    menuTop: 26,
    menuHeight: 32,
    menuBottom: 58,
    capsulePaddingRight: 96,
    missionTop: 66,
    comboTop: 122,
    totalHudHeight: 126,
    startPaddingTop: 74
  },

  onLoad() {
    console.log('首页 onLoad');
    this.calculateSafeArea();
    const save = StorageManager.instance.data;
    this.setData({
      currentGrade: save.currentGrade || 1,
      currentLevel: save.currentLevel || 0
    });
  },

  // 计算屏幕安全区域与胶囊按钮对齐信息
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
    } catch (e) {
      console.warn('获取胶囊信息失败，使用默认布局:', e);
    }

    // 胶囊左边缘到屏幕右边缘的距离 + 10px 间距，确保右侧按钮绝不与微信胶囊重叠
    const capsulePaddingRight = Math.max(88, (windowWidth - menuLeft) + 12);
    // 第二行识字任务栏位于第一行胶囊栏正下方 8px
    const missionTop = menuBottom + 8;
    // 连击提示位于任务栏下方
    const comboTop = missionTop + 54;
    // HUD 总占用高度 (传给物理引擎作为顶部反弹天花板)
    const totalHudHeight = missionTop + 56;
    // 首页欢迎界面的顶部留白
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
          console.warn('获取 Canvas 节点失败，稍后重试');
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
        console.log('GameEngine 初始化就绪，画布尺寸:', res[0].width, res[0].height);
      });
  },

  // 触摸手势分发到物理引擎
  handleTouchStart(e) {
    if (!this.data.isPlaying || !this.gameEngine) return;
    const touch = e.touches[0];
    if (touch) {
      this.gameEngine.onTouchStart(touch.x, touch.y);
    }
  },

  handleTouchMove(e) {
    if (!this.data.isPlaying || !this.gameEngine) return;
    const touch = e.touches[0];
    if (touch) {
      this.gameEngine.onTouchMove(touch.x, touch.y);
    }
  },

  handleTouchEnd() {
    if (!this.data.isPlaying || !this.gameEngine) return;
    this.gameEngine.onTouchEnd();
  },

  // 选择识字等级
  selectGrade(e) {
    const g = Number(e.currentTarget.dataset.grade);
    AudioManager.instance.playSFX('sfx_click');
    StorageManager.instance.setGrade(g);
    this.setData({
      currentGrade: g,
      currentLevel: 0
    });
  },

  // 开始游戏 -> 弹出本关生字预览
  startGame() {
    AudioManager.instance.playSFX('sfx_click');
    const grade = this.data.currentGrade;
    const levelIdx = StorageManager.instance.data.currentLevel || 0;

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
      currentLevelTitle: levelDef.title
    });

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
    AudioManager.instance.playSFX('sfx_shoot');
    this.setData({
      showIntroModal: false,
      isPlaying: true,
      score: 0,
      combo: 0
    });

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
    }, 700);
  },

  // 通关结算
  showLevelWin(levelDef) {
    const totalInGrade = EbbinghausEngine.getTotalLevelsInGrade(this.data.currentGrade);
    const curLevel = this.data.currentLevel;
    const isGradeComplete = (curLevel + 1 >= totalInGrade);
    let summary = `太棒了！顺利通过第 ${curLevel + 1} 关！`;
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
    AudioManager.instance.playSFX('sfx_click');
    const totalInGrade = EbbinghausEngine.getTotalLevelsInGrade(this.data.currentGrade);
    let grade = this.data.currentGrade;
    let nextL = this.data.currentLevel + 1;

    // 如果当前等级通关了，自动晋级到下一个等级
    if (nextL >= totalInGrade) {
      if (grade < 5) {
        grade++;
        nextL = 0;
        StorageManager.instance.setGrade(grade);
      } else {
        nextL = 0;
      }
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

    if (this.gameEngine) {
      this.gameEngine.loadLevel(levelDef);
      this.gameEngine.start();
    }
  },

  // 重新开始本关
  retryLevel() {
    AudioManager.instance.playSFX('sfx_click');
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
    this.setData({ showPauseModal: false });
    if (this.gameEngine) this.gameEngine.start();
  },

  quitToMenu() {
    AudioManager.instance.playSFX('sfx_click');
    if (this.gameEngine) this.gameEngine.stop();
    this.setData({
      showPauseModal: false,
      isPlaying: false
    });
  },

  toggleMute() {
    const nextMuted = !this.data.isMuted;
    AudioManager.instance.muted = nextMuted;
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

    Object.keys(stats).forEach(k => {
      if (stats[k].hits > 0) totalMastered++;
    });

    const wordsList = tier.words.map(ch => {
      const item = stats[ch];
      const isMastered = item && item.hits > 0;
      return {
        char: ch,
        pinyin: getWordPinyin(ch),
        phrase: getWordPhrase(ch),
        isMastered: isMastered
      };
    });

    this.setData({
      bookGrade: grade,
      bookMasteredCount: totalMastered,
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
