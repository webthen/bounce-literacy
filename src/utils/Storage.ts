export interface WordStatItem {
  hits: number;
  misses: number;
  exposures: number;
  lastGrade?: number;
  lastLevel?: number;
}

export interface UserSaveData {
  totalHits: number;
  currentGrade: number; // 当前选中的等级 1 ~ 5
  currentLevel: number; // 当前等级的关卡索引
  unlockedMonsters: string[];
  starsPerLevel: Record<string, number>; // key: `${grade}_${level}`
  stats: Record<string, WordStatItem>;
}

const STORAGE_KEY = 'BOUNCE_LITERACY_PIXI_V2';

export class StorageManager {
  private static _instance: StorageManager;
  public static get instance(): StorageManager {
    if (!this._instance) this._instance = new StorageManager();
    return this._instance;
  }

  public data: UserSaveData = {
    totalHits: 0,
    currentGrade: 1,
    currentLevel: 0,
    unlockedMonsters: ['m_mushroom'],
    starsPerLevel: {},
    stats: {}
  };

  constructor() {
    this.load();
  }

  public load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        this.data = Object.assign(this.data, JSON.parse(raw));
      } catch (e) {
        console.warn('Failed to parse user save data', e);
      }
    }
    // 兼容老版本存储
    if (!this.data.currentGrade) this.data.currentGrade = 1;
    if (this.data.currentLevel === undefined) this.data.currentLevel = 0;
  }

  public save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }

  public setGrade(grade: number) {
    this.data.currentGrade = grade;
    this.data.currentLevel = 0;
    this.save();
  }

  public recordHit(word: string, grade: number, level: number) {
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

  public recordMiss(word: string) {
    if (!this.data.stats[word]) {
      this.data.stats[word] = { hits: 0, misses: 0, exposures: 0 };
    }
    this.data.stats[word].misses++;
    this.data.stats[word].exposures++;
    this.save();
  }

  public recordLevelWin(grade: number, levelId: number, stars: number) {
    const key = `${grade}_${levelId}`;
    const old = this.data.starsPerLevel[key] || 0;
    if (stars > old) {
      this.data.starsPerLevel[key] = stars;
    }
    this.data.currentLevel = levelId + 1;
    this.checkUnlocks(grade, levelId);
    this.save();
  }

  private checkUnlocks(curGrade: number, curLevel: number) {
    if (this.data.totalHits >= 3 && !this.data.unlockedMonsters.includes('m_star')) {
      this.data.unlockedMonsters.push('m_star');
    }
    if ((curLevel >= 3 || curGrade >= 2) && !this.data.unlockedMonsters.includes('m_turtle')) {
      this.data.unlockedMonsters.push('m_turtle');
    }
    if (this.data.totalHits >= 12 && !this.data.unlockedMonsters.includes('m_cloud')) {
      this.data.unlockedMonsters.push('m_cloud');
    }
    if (this.data.totalHits >= 25 && !this.data.unlockedMonsters.includes('m_lion')) {
      this.data.unlockedMonsters.push('m_lion');
    }
    if (this.data.totalHits >= 50 && !this.data.unlockedMonsters.includes('m_dragon')) {
      this.data.unlockedMonsters.push('m_dragon');
    }
  }

  /** 获取艾宾浩斯整体记忆留存率 (0% ~ 100%) */
  public getRetentionRate(): number {
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
