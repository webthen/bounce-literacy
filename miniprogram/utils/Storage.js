// miniprogram/utils/Storage.js
const STORAGE_KEY = 'BOUNCE_LITERACY_WX_V1';

class StorageManager {
  static get instance() {
    if (!this._instance) this._instance = new StorageManager();
    return this._instance;
  }

  constructor() {
    this.data = {
      totalHits: 0,
      currentGrade: 1,
      currentLevel: 0,
      unlockedMonsters: ['m_mushroom'],
      starsPerLevel: {},
      stats: {}
    };
    this.load();
  }

  load() {
    try {
      const raw = wx.getStorageSync(STORAGE_KEY);
      if (raw) {
        Object.assign(this.data, typeof raw === 'string' ? JSON.parse(raw) : raw);
      }
    } catch (e) {
      console.warn('读取本地存档失败', e);
    }
    if (!this.data.currentGrade) this.data.currentGrade = 1;
    if (this.data.currentLevel === undefined) this.data.currentLevel = 0;
  }

  save() {
    try {
      wx.setStorageSync(STORAGE_KEY, this.data);
    } catch (e) {
      console.warn('保存本地存档失败', e);
    }
  }

  setGrade(grade) {
    this.data.currentGrade = grade;
    this.data.currentLevel = 0;
    this.save();
  }

  recordHit(word, grade, level) {
    this.data.totalHits++;
    if (!this.data.stats[word]) {
      this.data.stats[word] = { hits: 0, misses: 0, exposures: 0 };
    }
    this.data.stats[word].hits++;
    this.data.stats[word].exposures++;
    this.data.stats[word].lastGrade = grade;
    this.data.stats[word].lastLevel = level;
    this.checkUnlocks(grade, level);
    this.save();
  }

  recordMiss(word) {
    if (!this.data.stats[word]) {
      this.data.stats[word] = { hits: 0, misses: 0, exposures: 0 };
    }
    this.data.stats[word].misses++;
    this.data.stats[word].exposures++;
    this.save();
  }

  recordLevelWin(grade, levelId, stars) {
    const key = `${grade}_${levelId}`;
    const old = this.data.starsPerLevel[key] || 0;
    if (stars > old) {
      this.data.starsPerLevel[key] = stars;
    }
    this.data.currentLevel = levelId + 1;
    this.checkUnlocks(grade, levelId);
    this.save();
  }

  checkUnlocks(curGrade, curLevel) {
    if (this.data.totalHits >= 3 && !this.data.unlockedMonsters.includes('m_star')) {
      this.data.unlockedMonsters.push('m_star');
    }
    if ((curLevel >= 3 || curGrade >= 2) && !this.data.unlockedMonsters.includes('m_turtle')) {
      this.data.unlockedMonsters.push('m_turtle');
    }
    if (this.data.totalHits >= 12 && !this.data.unlockedMonsters.includes('m_cloud')) {
      this.data.unlockedMonsters.push('m_cloud');
    }
    if (this.data.totalHits >= 25 && !this.data.unlockedMonsters.includes('m_sheep')) {
      this.data.unlockedMonsters.push('m_sheep');
    }
  }

  getRetentionRate() {
    const words = Object.keys(this.data.stats);
    if (words.length === 0) return 100;
    let totalScore = 0;
    for (const w of words) {
      const s = this.data.stats[w];
      const acc = s.hits / (s.exposures || 1);
      totalScore += acc;
    }
    return Math.round((totalScore / words.length) * 100);
  }
}

module.exports = {
  StorageManager
};
