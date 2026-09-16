import { _decorator, resources, JsonAsset } from 'cc';
import { IWordItem, IWordStudyStat } from '../core/GameDefines';

export class WordDataManager {
    private static _instance: WordDataManager | null = null;
    public static get instance(): WordDataManager {
        if (!this._instance) {
            this._instance = new WordDataManager();
        }
        return this._instance;
    }

    private _vocabMap: Map<string, IWordItem> = new Map();
    private _statsMap: Map<string, IWordStudyStat> = new Map();

    /** 加载字库数据 */
    public async loadVocabLibrary(): Promise<void> {
        return new Promise((resolve, reject) => {
            resources.load('config/vocab_library', JsonAsset, (err, asset) => {
                if (err || !asset) {
                    console.error('Failed to load vocab library:', err);
                    reject(err);
                    return;
                }
                const list = asset.json as IWordItem[];
                list.forEach(item => {
                    this._vocabMap.set(item.char, item);
                    if (!this._statsMap.has(item.char)) {
                        this._statsMap.set(item.char, {
                            wordId: item.id,
                            char: item.char,
                            totalExposure: 0,
                            hitCount: 0,
                            mismatchCount: 0,
                            avgReactionTimeMs: 0,
                            consecutiveHits: 0,
                            lastSeenTimestamp: Date.now()
                        });
                    }
                });
                console.log(`Vocab library loaded: ${this._vocabMap.size} words.`);
                resolve();
            });
        });
    }

    public getWordInfo(char: string): IWordItem | undefined {
        return this._vocabMap.get(char);
    }

    /** 记录正确命中 */
    public recordHit(char: string, reactionTimeMs: number) {
        let stat = this._statsMap.get(char);
        if (stat) {
            stat.totalExposure++;
            stat.hitCount++;
            stat.consecutiveHits++;
            stat.lastSeenTimestamp = Date.now();
            stat.avgReactionTimeMs = stat.avgReactionTimeMs === 0 
                ? reactionTimeMs 
                : Math.round((stat.avgReactionTimeMs + reactionTimeMs) / 2);
        }
    }

    /** 记录错误碰撞（不惩罚，只统计易错） */
    public recordMismatch(char: string) {
        let stat = this._statsMap.get(char);
        if (stat) {
            stat.totalExposure++;
            stat.mismatchCount++;
            stat.consecutiveHits = 0;
            stat.lastSeenTimestamp = Date.now();
        }
    }

    /** 获取所有学习数据列表（供家长面板查看） */
    public getAllStats(): IWordStudyStat[] {
        return Array.from(this._statsMap.values());
    }
}
