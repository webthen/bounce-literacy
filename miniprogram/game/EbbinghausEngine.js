// miniprogram/game/EbbinghausEngine.js
const { VOCAB_TIERS } = require('../data/vocab');
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
   * @param grade 等级 (1 ~ 6)
   * @param levelIndex 关卡索引 (0-indexed)
   */
  static generateLevel(grade, levelIndex, isPortrait = true) {
    const tier = VOCAB_TIERS[grade] || VOCAB_TIERS[1];
    const totalLevels = this.getTotalLevelsInGrade(grade);
    const safeIdx = Math.max(0, Math.min(totalLevels - 1, levelIndex));

    const startIdx = safeIdx * this.WORDS_PER_LEVEL;
    const newWords = tier.words.slice(startIdx, startIdx + this.WORDS_PER_LEVEL);
    const isExtSection = startIdx >= tier.coreWords.length;

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
      const pos = layoutPositions[idx] || { x: 0, y: 180 };
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
            y: -120,
            width: 68,
            height: 68,
            shape: 'CIRCLE'
          });
        } else {
          blocks.push({
            id: 'bmp_left',
            type: 'BUMPER',
            x: -160,
            y: -110,
            width: 64,
            height: 64,
            shape: 'CIRCLE'
          });
          blocks.push({
            id: 'bmp_right',
            type: 'BUMPER',
            x: 160,
            y: -110,
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
            y: -45,
            width: 68,
            height: 68,
            shape: 'CIRCLE'
          });
        } else {
          blocks.push({
            id: 'bmp_left',
            type: 'BUMPER',
            x: -320,
            y: 15,
            width: 66,
            height: 66,
            shape: 'CIRCLE'
          });
          blocks.push({
            id: 'bmp_right',
            type: 'BUMPER',
            x: 320,
            y: 15,
            width: 66,
            height: 66,
            shape: 'CIRCLE'
          });
        }
      }
    }

    const sectionTag = isExtSection ? '拓展巩固' : (reviewWords.length > 0 ? '核心+复习' : '核心新课');
    const title = `${tier.title} · 第 ${safeIdx + 1} 课 (${sectionTag})`;

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
      const ys = [190, 55];
      for (const y of ys) {
        for (const x of xs) {
          if (positions.length < count) positions.push({ x, y });
        }
      }
    } else if (count === 5) {
      positions.push({ x: -180, y: 200 });
      positions.push({ x: 0, y: 212 });
      positions.push({ x: 180, y: 200 });
      positions.push({ x: -105, y: 65 });
      positions.push({ x: 105, y: 65 });
    } else if (count === 6) {
      positions.push({ x: -120, y: 210 });
      positions.push({ x: 120, y: 210 });
      positions.push({ x: -170, y: 95 });
      positions.push({ x: 170, y: 95 });
      positions.push({ x: -120, y: -15 });
      positions.push({ x: 120, y: -15 });
    } else if (count === 7) {
      positions.push({ x: -125, y: 215 });
      positions.push({ x: 125, y: 215 });
      positions.push({ x: -190, y: 100 });
      positions.push({ x: 0, y: 108 });
      positions.push({ x: 190, y: 100 });
      positions.push({ x: -125, y: -12 });
      positions.push({ x: 125, y: -12 });
    } else {
      positions.push({ x: -180, y: 220 });
      positions.push({ x: 0, y: 230 });
      positions.push({ x: 180, y: 220 });
      positions.push({ x: -110, y: 105 });
      positions.push({ x: 110, y: 105 });
      positions.push({ x: -180, y: -10 });
      positions.push({ x: 0, y: 0 });
      positions.push({ x: 180, y: -10 });
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
        const archY = 95 - Math.abs(x) * 0.10;
        positions.push({ x, y: archY });
      }
    } else if (count <= 6) {
      const topCount = 3;
      const btmCount = count - topCount;
      const topSpacing = 220;
      const btmSpacing = 220;
      const topStartX = -((topCount - 1) * topSpacing) / 2;
      for (let i = 0; i < topCount; i++) {
        positions.push({ x: topStartX + i * topSpacing, y: 130 });
      }
      const btmStartX = -((btmCount - 1) * btmSpacing) / 2;
      for (let i = 0; i < btmCount; i++) {
        positions.push({ x: btmStartX + i * btmSpacing, y: 5 });
      }
    } else {
      const topCount = 4;
      const btmCount = count - topCount;
      const topSpacing = 190;
      const btmSpacing = 200;
      const topStartX = -((topCount - 1) * topSpacing) / 2;
      for (let i = 0; i < topCount; i++) {
        positions.push({ x: topStartX + i * topSpacing, y: 138 });
      }
      const btmStartX = -((btmCount - 1) * btmSpacing) / 2;
      for (let i = 0; i < btmCount; i++) {
        positions.push({ x: btmStartX + i * btmSpacing, y: 8 });
      }
    }
    return positions;
  }
}

module.exports = {
  EbbinghausEngine
};
