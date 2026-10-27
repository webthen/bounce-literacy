import { VOCAB_TIERS } from '../data/vocab';
import { StorageManager } from '../utils/Storage';

export interface BlockDef {
  id: string;
  type: 'TARGET' | 'BUMPER' | 'OBSTACLE';
  word?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'CIRCLE' | 'BOX';
  rotation?: number;
  isReview?: boolean;
}

export interface DynamicLevelDef {
  grade: number;
  level: number;
  title: string;
  newWords: string[];
  reviewWords: string[];
  targetWords: string[];
  ballSequence: string[];
  blocks: BlockDef[];
}

export class EbbinghausEngine {
  private static readonly WORDS_PER_LEVEL = 4; // 每次学习 4 个生字

  /** 获取指定等级下的关卡总数 */
  public static getTotalLevelsInGrade(grade: number): number {
    const tier = VOCAB_TIERS[grade];
    if (!tier) return 15;
    return Math.ceil(tier.words.length / this.WORDS_PER_LEVEL);
  }

  /**
   * 动态生成符合艾宾浩斯记忆曲线的关卡配置
   * @param grade 等级 (1 ~ 6)
   * @param levelIndex 关卡索引 (0-indexed, 0 ~ totalLevels-1)
   */
  public static generateLevel(grade: number, levelIndex: number, isPortrait: boolean = false): DynamicLevelDef {
    const tier = VOCAB_TIERS[grade] || VOCAB_TIERS[1];
    const totalLevels = this.getTotalLevelsInGrade(grade);
    const safeIdx = Math.max(0, Math.min(totalLevels - 1, levelIndex));

    // 1. 获取本关全新学习的汉字 (3 ~ 4 个)
    const startIdx = safeIdx * this.WORDS_PER_LEVEL;
    const newWords = tier.words.slice(startIdx, startIdx + this.WORDS_PER_LEVEL);
    const isExtSection = startIdx >= tier.coreWords.length;

    // 2. 根据艾宾浩斯遗忘曲线挑选复习汉字 (2 ~ 3 个)
    const reviewWords: string[] = [];
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
        else if (levelDelta === 5 || levelDelta === 6 || levelDelta === 7) weight += 2.8;

        if (stat.misses > 0) {
          weight += stat.misses * 2.5;
        }
        if (stat.hits === 0 && stat.exposures > 0) {
          weight += 3.0;
        }

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

    // 3. 组合目标球列表并构建发射队列
    const targetWords = [...newWords, ...reviewWords];
    const ballSequence = [...targetWords, ...targetWords].sort(() => Math.random() - 0.5);

    // 4. 智能物理坐标排布 (严谨防重叠算法，顶部留足 HUD 安全距离)
    const blocks: BlockDef[] = [];
    const layoutPositions = isPortrait
      ? this.generatePortraitLayout(targetWords.length)
      : this.generateNonOverlappingLayout(targetWords.length);

    targetWords.forEach((word, idx) => {
      const pos = layoutPositions[idx];
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

    // 5. 根据关卡递进加入趣味弹力轮 (Bumper)
    if (safeIdx >= 1) {
      if (isPortrait) {
        if (safeIdx % 2 === 1) {
          blocks.push({
            id: 'bmp_center',
            type: 'BUMPER',
            x: 0,
            y: -150,
            width: 68,
            height: 68,
            shape: 'CIRCLE'
          });
        } else {
          blocks.push({
            id: 'bmp_left',
            type: 'BUMPER',
            x: -160,
            y: -135,
            width: 64,
            height: 64,
            shape: 'CIRCLE'
          });
          blocks.push({
            id: 'bmp_right',
            type: 'BUMPER',
            x: 160,
            y: -135,
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

  /**
   * 竖屏专享纵向蜂巢/阶梯错落布局 (降低顶部 y 偏移，彻底避开顶部文字和 HUD)
   */
  private static generatePortraitLayout(count: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];

    if (count <= 4) {
      const xs = [-125, 125];
      const ys = [230, 80];
      for (const y of ys) {
        for (const x of xs) {
          if (positions.length < count) positions.push({ x, y });
        }
      }
    } else if (count === 5) {
      positions.push({ x: -185, y: 240 });
      positions.push({ x: 0, y: 255 });
      positions.push({ x: 185, y: 240 });
      positions.push({ x: -105, y: 90 });
      positions.push({ x: 105, y: 90 });
    } else if (count === 6) {
      positions.push({ x: -125, y: 255 });
      positions.push({ x: 125, y: 255 });
      positions.push({ x: -175, y: 125 });
      positions.push({ x: 175, y: 125 });
      positions.push({ x: -125, y: -5 });
      positions.push({ x: 125, y: -5 });
    } else if (count === 7) {
      positions.push({ x: -130, y: 260 });
      positions.push({ x: 130, y: 260 });
      positions.push({ x: -200, y: 130 });
      positions.push({ x: 0, y: 138 });
      positions.push({ x: 200, y: 130 });
      positions.push({ x: -130, y: 0 });
      positions.push({ x: 130, y: 0 });
    } else {
      positions.push({ x: -185, y: 265 });
      positions.push({ x: 0, y: 275 });
      positions.push({ x: 185, y: 265 });
      positions.push({ x: -115, y: 135 });
      positions.push({ x: 115, y: 135 });
      positions.push({ x: -185, y: 5 });
      positions.push({ x: 0, y: 15 });
      positions.push({ x: 185, y: 5 });
    }

    return positions;
  }

  /**
   * 横屏专属不重叠对称布局 (下移顶部行，预留充足顶部安全区)
   */
  private static generateNonOverlappingLayout(count: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];

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
