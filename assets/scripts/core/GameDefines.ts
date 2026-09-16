/**
 * 游戏常量与核心接口定义
 */

export enum GameState {
    READY,          // 关卡加载就绪，倒计时准备
    PLAYING,        // 发射台上待命中，等待瞄准
    BALL_FLYING,    // 弹珠飞行中，高速反弹碰撞
    HIT_SUCCESS,    // 命中目标字，播放大字与语音
    NEXT_BALL,      // 装填下一颗弹珠
    LEVEL_COMPLETE, // 本关全部消除，通关表彰
    PAUSED          // 游戏暂停
}

export enum BallState {
    IDLE,
    AIMING,
    FLYING,
    HIT,
    DEAD
}

export enum BlockType {
    TARGET = 'TARGET',       // 目标汉字方块
    OBSTACLE = 'OBSTACLE',   // 静态反弹障碍
    BUMPER = 'BUMPER',       // 超级弹力轮
}

export enum BlockShape {
    BOX = 'BOX',
    CIRCLE = 'CIRCLE',
}

export interface IBlockConfig {
    id: string;
    type: BlockType;
    word?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    shape: BlockShape;
    rotation?: number;
    restitution?: number;
}

export interface IWeakHintRule {
    missCountToTrigger: number;
    hintType: 'GLOW' | 'ARROW' | 'ENLARGE';
}

export interface ILevelConfig {
    levelId: number;
    title: string;
    themeBook: string;
    targetWords: string[];
    distractorWords: string[];
    ballSequence: string[];
    blocks: IBlockConfig[];
    timeoutSec: number;
    weakHint: IWeakHintRule;
    targetScore: number;
}

export interface IWordItem {
    id: number;
    char: string;
    pinyin: string;
    audioFile: string;
    strokeCount: number;
    book: string;
    confusingChars: string[];
    category: 'NATURE' | 'HUMAN' | 'ANIMAL' | 'OBJECT';
}

export interface IWordStudyStat {
    wordId: number;
    char: string;
    totalExposure: number;
    hitCount: number;
    mismatchCount: number;
    avgReactionTimeMs: number;
    consecutiveHits: number;
    lastSeenTimestamp: number;
}
