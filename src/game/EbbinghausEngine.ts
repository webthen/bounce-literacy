import { VOCAB_TIERS, getWordPinyin } from '../data/vocab';
import { StorageManager } from '../utils/Storage';

export interface BlockDef {
  id: string;
  type: 'TARGET' | 'BUMPER' | 'OBSTACLE';
  word?: string;
  x: number; // 相对 (640, 360) 的偏移
  y: number; // 相对 (640, 360) 的偏移
  width: number;
  height: number;
  shape: 'CIRCLE' | 'BOX';
  rotation?: number;
  isReview?: boolean; // 是否为艾宾浩斯复习字
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
   * @param grade 等级 (1 ~ 5)
   * @param levelIndex 关卡索引 (0-indexed, 0 ~ totalLevels-1)
   */
  public static generateLevel(grade: number, levelIndex: number, isPortrait: boolean = false): DynamicLevelDef {
    const tier = VOCAB_TIERS[grade] || VOCAB_TIERS[1];
    const totalLevels = this.getTotalLevelsInGrade(grade);
    const safeIdx = Math.max(0, Math.min(totalLevels - 1, levelIndex));

    // 1. 获取本关全新学习的汉字 (3 ~ 4 个)
    const startIdx = safeIdx * this.WORDS_PER_LEVEL;
    const newWords = tier.words.slice(startIdx, startIdx + this.WORDS_PER_LEVEL);

    // 2. 根据艾宾浩斯遗忘曲线挑选复习汉字 (2 ~ 3 个)
    const reviewWords: string[] = [];
    if (safeIdx > 0) {
      // 收集之前所有关卡已学汉字
      const learnedWords = tier.words.slice(0, startIdx);
      const stats = StorageManager.instance.data.stats;

      // 为每个已学汉字计算艾宾浩斯复习优先级权重
      const candidates = learnedWords.map((word, wIdx) => {
        const wordLevel = Math.floor(wIdx / this.WORDS_PER_LEVEL);
        const levelDelta = safeIdx - wordLevel; // 间隔关卡数
        const stat = stats[word] || { hits: 0, misses: 0, exposures: 0 };

        let weight = 1.0;

        // 艾宾浩斯黄金复习节点：
        // 间隔 1 关 (即时巩固) 权重加倍
        if (levelDelta === 1) weight += 2.5;
        // 间隔 2~3 关 (短期唤醒)
        else if (levelDelta === 2 || levelDelta === 3) weight += 2.0;
        // 间隔 5~7 关 (中长期强化)
        else if (levelDelta === 5 || levelDelta === 6 || levelDelta === 7) weight += 2.8;

        // 错题优先加权：失误越多、命中率越低，越需要优先复习
        if (stat.misses > 0) {
          weight += stat.misses * 2.5;
        }
        if (stat.hits === 0 && stat.exposures > 0) {
          weight += 3.0;
        }

        return { word, weight };
      });

      // 按权重加权随机采样 2 ~ 3 个复习词（最多不超过 4 个，保证单关不超过 7-8 个字）
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
    // 发射队列：每词至少出现 1~2 次，随机打乱
    const ballSequence = [...targetWords, ...targetWords].sort(() => Math.random() - 0.5);

    // 4. 智能物理坐标排布 (严谨防重叠算法，横屏宽屏与竖屏长屏自适应)
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
        width: 84,
        height: 84,
        shape: 'CIRCLE',
        isReview: isReviewWord
      });
    });

    // 5. 根据关卡递进加入趣味弹力轮 (Bumper) 和普通障碍物
    if (safeIdx >= 1) {
      if (isPortrait) {
        // 竖屏长屏 (720x1280, 中心 360, 640): 弹弓在底部 py=1120 (by=-480), 目标球在 py=200~540 (by=100~440)
        // 弹力轮放置在中间过渡区 py=740~800 (by=-100~-160)，增加纵向反复弹射乐趣
        if (safeIdx % 2 === 1) {
          blocks.push({
            id: 'bmp_center',
            type: 'BUMPER',
            x: 0,
            y: -140, // 屏幕绝对坐标 py = 640 - (-140) = 780
            width: 70,
            height: 70,
            shape: 'CIRCLE'
          });
        } else {
          blocks.push({
            id: 'bmp_left',
            type: 'BUMPER',
            x: -160,
            y: -120, // py = 760
            width: 64,
            height: 64,
            shape: 'CIRCLE'
          });
          blocks.push({
            id: 'bmp_right',
            type: 'BUMPER',
            x: 160,
            y: -120, // py = 760
            width: 64,
            height: 64,
            shape: 'CIRCLE'
          });
        }
      } else {
        // 横屏原布局
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

  /**
   * 竖屏专享纵向蜂巢/阶梯错落长屏布局
   * 视口尺寸 720 × 1280，屏幕中心为 (360, 640)
   * 目标球排布在 py = 200 ~ 540，即相对于中心 y 偏移在 +100 ~ +440
   * 横向 x 偏移在 -220 ~ +220，圆心间距严格保持 >= 140px，清爽大方
   */
  private static generatePortraitLayout(count: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];

    if (count <= 4) {
      // 优雅 2 × 2 黄金矩形阵
      const xs = [-120, 120];
      const ys = [360, 180]; // py = 280, 460
      for (const y of ys) {
        for (const x of xs) {
          if (positions.length < count) positions.push({ x, y });
        }
      }
    } else if (count === 5) {
      // 倒梯形金字塔阵 (上排3个，下排2个)
      // 上排 py = 270 (y = 370)
      positions.push({ x: -190, y: 370 });
      positions.push({ x: 0, y: 385 });
      positions.push({ x: 190, y: 370 });
      // 下排 py = 440 (y = 200)
      positions.push({ x: -105, y: 200 });
      positions.push({ x: 105, y: 200 });
    } else if (count === 6) {
      // 3行错落蜂巢阵 (2 - 2 - 2)
      // 行1 py = 230 (y = 410)
      positions.push({ x: -125, y: 410 });
      positions.push({ x: 125, y: 410 });
      // 行2 py = 380 (y = 260)
      positions.push({ x: -175, y: 260 });
      positions.push({ x: 175, y: 260 });
      // 行3 py = 520 (y = 120)
      positions.push({ x: -125, y: 120 });
      positions.push({ x: 125, y: 120 });
    } else if (count === 7) {
      // 经典 2 - 3 - 2 钻石蜂巢阵
      // 行1 py = 220 (y = 420)
      positions.push({ x: -130, y: 420 });
      positions.push({ x: 130, y: 420 });
      // 行2 py = 360 (y = 280)
      positions.push({ x: -210, y: 280 });
      positions.push({ x: 0, y: 290 });
      positions.push({ x: 210, y: 280 });
      // 行3 py = 500 (y = 140)
      positions.push({ x: -130, y: 140 });
      positions.push({ x: 130, y: 140 });
    } else {
      // 3 - 2 - 3 满贯长屏大阵 (8个)
      // 行1 py = 210 (y = 430)
      positions.push({ x: -190, y: 430 });
      positions.push({ x: 0, y: 445 });
      positions.push({ x: 190, y: 430 });
      // 行2 py = 350 (y = 290)
      positions.push({ x: -115, y: 290 });
      positions.push({ x: 115, y: 290 });
      // 行3 py = 490 (y = 150)
      positions.push({ x: -190, y: 150 });
      positions.push({ x: 0, y: 165 });
      positions.push({ x: 190, y: 150 });
    }

    return positions;
  }

  /**
   * 生成 $N$ 个绝对不重叠的美观对称/拱形布局点位 (横屏专属)
   * 坐标为相对于屏幕中心 (640, 360) 的偏移
   */
  private static generateNonOverlappingLayout(count: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];

    // 单行/双行拱门阵列布局，保证圆心间距 >= 115px (球直径 84px)
    if (count <= 4) {
      // 优雅单行微弧线
      const spacing = 180;
      const startX = -((count - 1) * spacing) / 2;
      for (let i = 0; i < count; i++) {
        const x = startX + i * spacing;
        const archY = 120 - Math.abs(x) * 0.12;
        positions.push({ x, y: archY });
      }
    } else if (count <= 6) {
      // 上排 3 个，下排 2~3 个
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
      // 7 ~ 8 个：顶排 4 个，中排 3~4 个，错落排列
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
