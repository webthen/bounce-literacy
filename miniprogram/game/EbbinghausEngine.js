// miniprogram/game/EbbinghausEngine.js
const { VOCAB_TIERS, getWordPinyin } = require('../data/vocab');
const { StorageManager } = require('../utils/Storage');

class EbbinghausEngine {
  static get WORDS_PER_LEVEL() {
    return 4; // 每次学习 4 个生字
  }

  /** 获取指定等级下的关卡总数 */
  static getTotalLevelsInGrade(grade) {
    const tier = VOCAB_TIERS[grade];
    if (!tier) return 15;
    return Math.ceil(tier.words.length / this.WORDS_PER_LEVEL);
  }

  /**
   * 动态生成符合艾宾浩斯记忆曲线的关卡配置
   * @param grade 等级 (1 ~ 5)
   * @param levelIndex 关卡索引 (0-indexed)
   */
  static generateLevel(grade, levelIndex, isPortrait = true) {
    const tier = VOCAB_TIERS[grade] || VOCAB_TIERS[1];
    const totalLevels = this.getTotalLevelsInGrade(grade);
    const safeIdx = Math.max(0, Math.min(totalLevels - 1, levelIndex));

    // 1. 获取本关全新学习的汉字 (3 ~ 4 个)
    const startIdx = safeIdx * this.WORDS_PER_LEVEL;
    const newWords = tier.words.slice(startIdx, startIdx + this.WORDS_PER_LEVEL);

    // 2. 根据艾宾浩斯遗忘曲线挑选复习汉字 (2 ~ 3 个)
    const reviewWords = [];
    if (safeIdx > 0) {
      const learnedWords = tier.words.slice(0, startIdx);
      const stats = StorageManager.instance.data.stats;

      const candidates = learnedWords.map((word, wIdx) => {
        const wordLevel = Math.floor(wIdx / this.WORDS_PER_LEVEL);
        const levelDelta = safeIdx - wordLevel;
        const stat = stats[word] || { hits: 0, misses: 0, exposures: 0 };

        let weight = 1.0;
        if (levelDelta === 1) weight += 2.5;
        else if (levelDelta === 2 || levelDelta === 3) weight += 2.0;
        else if (levelDelta >= 5 && levelDelta <= 7) weight += 2.8;

        if (stat.misses > 0) weight += stat.misses * 2.5;
        if (stat.hits === 0 && stat.exposures > 0) weight += 3.0;

        return { word, weight };
      });

      const reviewCount = safeIdx === 1 ? 2 : (safeIdx % 2 === 0 ? 3 : 4);
      candidates.sort((a, b) => b.weight - a.weight + (Math.random() - 0.5) * 1.5);

      for (let i = 0; i < candidates.length && reviewWords.length < reviewCount; i++) {
        const cand = candidates[i].word;
        if (!newWords.includes(cand) && !reviewWords.includes(cand)) {
          reviewWords.push(cand);
        }
      }
    }

    const targetWords = [...newWords, ...reviewWords];
    const ballSequence = [...targetWords, ...targetWords].sort(() => Math.random() - 0.5);

    const blocks = [];
    const layoutPositions = isPortrait 
      ? this.generatePortraitLayout(targetWords.length)
      : this.generateNonOverlappingLayout(targetWords.length);

    targetWords.forEach((word, idx) => {
      const pos = layoutPositions[idx] || { x: 0, y: 300 };
      const isReviewWord = reviewWords.includes(word);
      blocks.push({
        id: `t_${idx}_${word}`,
        type: 'TARGET',
        word: word,
        x: pos.x,
        y: pos.y,
        width: 104,
        height: 104,
        shape: 'CIRCLE',
        isReview: isReviewWord
      });
    });

    if (safeIdx >= 1) {
      if (isPortrait) {
        if (safeIdx % 2 === 1) {
          blocks.push({
            id: 'bmp_center',
            type: 'BUMPER',
            x: 0,
            y: -100,
            width: 70,
            height: 70,
            shape: 'CIRCLE'
          });
        } else {
          blocks.push({
            id: 'bmp_left',
            type: 'BUMPER',
            x: -160,
            y: -90,
            width: 64,
            height: 64,
            shape: 'CIRCLE'
          });
          blocks.push({
            id: 'bmp_right',
            type: 'BUMPER',
            x: 160,
            y: -90,
            width: 64,
            height: 64,
            shape: 'CIRCLE'
          });
        }
      } else {
        if (safeIdx % 2 === 1) {
          blocks.push({
            id: 'bmp_center',
            type: 'BUMPER',
            x: 0,
            y: -20,
            width: 70,
            height: 70,
            shape: 'CIRCLE'
          });
        } else {
          blocks.push({
            id: 'bmp_left',
            type: 'BUMPER',
            x: -320,
            y: 40,
            width: 68,
            height: 68,
            shape: 'CIRCLE'
          });
          blocks.push({
            id: 'bmp_right',
            type: 'BUMPER',
            x: 320,
            y: 40,
            width: 68,
            height: 68,
            shape: 'CIRCLE'
          });
        }
      }
    }

    const title = `${tier.title} · 第 ${safeIdx + 1} 课${reviewWords.length > 0 ? ` (新学+复习)` : ' (新课启航)'}`;

    return {
      grade,
      level: safeIdx,
      title,
      newWords,
      reviewWords,
      targetWords,
      ballSequence,
      blocks
    };
  }

  static generatePortraitLayout(count) {
    const positions = [];
    if (count <= 4) {
      const xs = [-125, 125];
      const ys = [220, 80];
      for (const y of ys) {
        for (const x of xs) {
          if (positions.length < count) positions.push({ x, y });
        }
      }
    } else if (count === 5) {
      positions.push({ x: -180, y: 230 });
      positions.push({ x: 0, y: 245 });
      positions.push({ x: 180, y: 230 });
      positions.push({ x: -100, y: 90 });
      positions.push({ x: 100, y: 90 });
    } else if (count === 6) {
      positions.push({ x: -120, y: 240 });
      positions.push({ x: 120, y: 240 });
      positions.push({ x: -170, y: 130 });
      positions.push({ x: 170, y: 130 });
      positions.push({ x: -120, y: 20 });
      positions.push({ x: 120, y: 20 });
    } else if (count === 7) {
      positions.push({ x: -120, y: 245 });
      positions.push({ x: 120, y: 245 });
      positions.push({ x: -190, y: 140 });
      positions.push({ x: 0, y: 150 });
      positions.push({ x: 190, y: 140 });
      positions.push({ x: -120, y: 35 });
      positions.push({ x: 120, y: 35 });
    } else {
      positions.push({ x: -180, y: 250 });
      positions.push({ x: 0, y: 265 });
      positions.push({ x: 180, y: 250 });
      positions.push({ x: -110, y: 150 });
      positions.push({ x: 110, y: 150 });
      positions.push({ x: -180, y: 40 });
      positions.push({ x: 0, y: 50 });
      positions.push({ x: 180, y: 40 });
    }
    return positions;
  }

  static generateNonOverlappingLayout(count) {
    const positions = [];
    if (count <= 4) {
      const spacing = 180;
      const startX = -((count - 1) * spacing) / 2;
      for (let i = 0; i < count; i++) {
        const x = startX + i * spacing;
        const archY = 120 - Math.abs(x) * 0.12;
        positions.push({ x, y: archY });
      }
    } else if (count <= 6) {
      const topCount = 3;
      const btmCount = count - topCount;
      const topSpacing = 220;
      const btmSpacing = 220;
      const topStartX = -((topCount - 1) * topSpacing) / 2;
      for (let i = 0; i < topCount; i++) {
        positions.push({ x: topStartX + i * topSpacing, y: 160 });
      }
      const btmStartX = -((btmCount - 1) * btmSpacing) / 2;
      for (let i = 0; i < btmCount; i++) {
        positions.push({ x: btmStartX + i * btmSpacing, y: 30 });
      }
    } else {
      const topCount = 4;
      const btmCount = count - topCount;
      const topSpacing = 190;
      const btmSpacing = 200;
      const topStartX = -((topCount - 1) * topSpacing) / 2;
      for (let i = 0; i < topCount; i++) {
        positions.push({ x: topStartX + i * topSpacing, y: 175 });
      }
      const btmStartX = -((btmCount - 1) * btmSpacing) / 2;
      for (let i = 0; i < btmCount; i++) {
        positions.push({ x: btmStartX + i * btmSpacing, y: 35 });
      }
    }
    return positions;
  }
}

module.exports = {
  EbbinghausEngine
};
