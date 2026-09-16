import { _decorator, resources, JsonAsset, Node, instantiate, Prefab, Vec3 } from 'cc';
import { ILevelConfig, IBlockConfig, BlockType } from '../core/GameDefines';
import { TargetBlock } from '../entities/TargetBlock';
import { ObstacleBlock } from '../entities/ObstacleBlock';

export class LevelManager {
    private static _instance: LevelManager | null = null;
    public static get instance(): LevelManager {
        if (!this._instance) {
            this._instance = new LevelManager();
        }
        return this._instance;
    }

    private _currentLevelConfig: ILevelConfig | null = null;
    private _remainingTargets: Set<string> = new Set();
    private _ballQueue: string[] = [];

    public async loadLevel(levelId: number): Promise<ILevelConfig> {
        const idStr = levelId < 10 ? `0${levelId}` : `${levelId}`;
        const path = `config/level_${idStr}`;

        return new Promise((resolve, reject) => {
            resources.load(path, JsonAsset, (err, asset) => {
                if (err || !asset) {
                    console.error(`Failed to load level config: ${path}`, err);
                    reject(err);
                    return;
                }
                this._currentLevelConfig = asset.json as ILevelConfig;
                this._remainingTargets.clear();
                this._currentLevelConfig.targetWords.forEach(w => this._remainingTargets.add(w));
                this._ballQueue = [...this._currentLevelConfig.ballSequence];
                console.log(`Level ${levelId} loaded: ${this._currentLevelConfig.title}`);
                resolve(this._currentLevelConfig);
            });
        });
    }

    public get currentConfig(): ILevelConfig | null {
        return this._currentLevelConfig;
    }

    public getNextBallWord(): string | null {
        if (this._ballQueue.length > 0) {
            return this._ballQueue.shift()!;
        }
        // 如果队列打空但还有未消除目标字，轮流补充目标字
        if (this._remainingTargets.size > 0) {
            const arr = Array.from(this._remainingTargets);
            return arr[Math.floor(Math.random() * arr.length)];
        }
        return null;
    }

    public peekNextBallWord(): string | null {
        if (this._ballQueue.length > 0) {
            return this._ballQueue[0];
        }
        if (this._remainingTargets.size > 0) {
            return Array.from(this._remainingTargets)[0];
        }
        return null;
    }

    public onTargetEliminated(word: string) {
        this._remainingTargets.delete(word);
    }

    public isLevelCleared(): boolean {
        return this._remainingTargets.size === 0;
    }

    public getRemainingTargetCount(): number {
        return this._remainingTargets.size;
    }
}
