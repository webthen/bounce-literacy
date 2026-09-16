import { _decorator, Component, Node, Prefab, instantiate, AudioSource, Label } from 'cc';
import { GameState, ILevelConfig, BlockType } from '../core/GameDefines';
import { EventBus, GameEvents } from '../core/EventBus';
import { WordDataManager } from './WordDataManager';
import { AudioManager } from './AudioManager';
import { LevelManager } from './LevelManager';
import { LauncherController } from '../entities/LauncherController';
import { BallController } from '../entities/BallController';
import { TargetBlock } from '../entities/TargetBlock';
import { ObstacleBlock } from '../entities/ObstacleBlock';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property(Prefab)
    public ballPrefab: Prefab = null!;

    @property(Prefab)
    public targetBlockPrefab: Prefab = null!;

    @property(Prefab)
    public obstacleBlockPrefab: Prefab = null!;

    @property(Prefab)
    public bumperPrefab: Prefab = null!;

    @property(Node)
    public playFieldNode: Node = null!;

    @property(LauncherController)
    public launcher: LauncherController = null!;

    @property(AudioSource)
    public audioSource: AudioSource = null!;

    @property(Node)
    public bigWordFlashNode: Node = null!; // 消除时全屏浮现的大字

    @property(Label)
    public bigWordLabel: Label = null!;

    public gameState: GameState = GameState.READY;
    public currentLevelId: number = 1;
    public score: number = 0;
    public combo: number = 0;

    private _activeBallNode: Node | null = null;
    private _targetBlocksMap: Map<string, TargetBlock> = new Map();
    private _consecutiveMissCount: number = 0;

    async onLoad() {
        AudioManager.instance.init(this.audioSource);
        await WordDataManager.instance.loadVocabLibrary();

        EventBus.on(GameEvents.BALL_LAUNCHED, this.onBallLaunched.bind(this));
        EventBus.on(GameEvents.BALL_HIT_TARGET, this.onBallHitTarget.bind(this));
        EventBus.on(GameEvents.BALL_HIT_OBSTACLE, this.onBallHitObstacle.bind(this));
        EventBus.on(GameEvents.BALL_HIT_BUMPER, this.onBallHitBumper.bind(this));
        EventBus.on(GameEvents.BALL_OUT_OF_BOUNDS, this.onBallOutOfBounds.bind(this));
        EventBus.on(GameEvents.WORD_ELIMINATED, this.onWordEliminated.bind(this));
    }

    async start() {
        await this.startLevel(this.currentLevelId);
    }

    /** 开启指定关卡 */
    public async startLevel(levelId: number) {
        this.currentLevelId = levelId;
        this.score = 0;
        this.combo = 0;
        this._consecutiveMissCount = 0;
        this.gameState = GameState.READY;

        // 清空当前场景方块
        this.playFieldNode.removeAllChildren();
        this._targetBlocksMap.clear();

        const config = await LevelManager.instance.loadLevel(levelId);
        this.buildLevelBlocks(config);

        AudioManager.instance.playVoiceCue('vo_ready');

        this.scheduleOnce(() => {
            this.gameState = GameState.PLAYING;
            this.spawnNextBall();
        }, 0.8);
    }

    /** 构建关卡方块实体 */
    private buildLevelBlocks(config: ILevelConfig) {
        for (const b of config.blocks) {
            let node: Node | null = null;
            if (b.type === BlockType.TARGET) {
                node = instantiate(this.targetBlockPrefab);
                const tb = node.getComponent(TargetBlock)!;
                tb.init(b.word || '', true);
                this._targetBlocksMap.set(b.id, tb);
            } else if (b.type === BlockType.BUMPER) {
                node = instantiate(this.bumperPrefab);
            } else {
                node = instantiate(this.obstacleBlockPrefab);
            }

            if (node) {
                node.setPosition(b.x, b.y, 0);
                node.angle = b.rotation || 0;
                this.playFieldNode.addChild(node);
            }
        }
    }

    /** 生成并装填待发弹珠 */
    private spawnNextBall() {
        const word = LevelManager.instance.getNextBallWord();
        if (!word) {
            if (LevelManager.instance.isLevelCleared()) {
                this.handleLevelCleared();
            }
            return;
        }

        if (this._activeBallNode) {
            this._activeBallNode.destroy();
        }

        this._activeBallNode = instantiate(this.ballPrefab);
        const ballCtrl = this._activeBallNode.getComponent(BallController)!;
        ballCtrl.initBall(word);
        this.node.addChild(this._activeBallNode);

        this.launcher.setBallNode(this._activeBallNode);
        this.gameState = GameState.PLAYING;
    }

    private onBallLaunched(data: { word: string }) {
        this.gameState = GameState.BALL_FLYING;
    }

    private onBallHitObstacle() {
        AudioManager.instance.playSFX('sfx_bounce');
    }

    private onBallHitBumper() {
        AudioManager.instance.playSFX('sfx_bumper');
        this.score += 15;
        EventBus.emit(GameEvents.SCORE_CHANGED, { score: this.score });
    }

    /** 核心逻辑：碰撞汉字判定 */
    private onBallHitTarget(data: { ballWord: string; targetWord: string; isMatch: boolean; reactionTime: number; bounceCount: number }) {
        if (data.isMatch) {
            // 命中匹配！
            this._consecutiveMissCount = 0;
            this.combo++;
            this.score += (10 * this.combo);
            if (data.bounceCount >= 3) {
                this.score += 30; // 神奇反弹额外加分
                AudioManager.instance.playVoiceCue('vo_super');
            }

            EventBus.emit(GameEvents.COMBO_CHANGED, { combo: this.combo });
            EventBus.emit(GameEvents.SCORE_CHANGED, { score: this.score });

            WordDataManager.instance.recordHit(data.ballWord, data.reactionTime);

            // 0.1s 内播放匹配音效与普通话语音
            AudioManager.instance.playSFX('sfx_match');
            const wordInfo = WordDataManager.instance.getWordInfo(data.ballWord);
            if (wordInfo) {
                this.scheduleOnce(() => {
                    AudioManager.instance.playWordVoice(wordInfo.audioFile);
                }, 0.1);
            }

            // 弹出大字高亮 0.8s
            this.showBigWordPopup(data.ballWord);

            // 找到方块并消除
            for (const [id, tb] of this._targetBlocksMap.entries()) {
                if (tb.word === data.ballWord && tb.node.isValid) {
                    tb.onMatchedEliminate();
                    this._targetBlocksMap.delete(id);
                    break;
                }
            }
        } else {
            // 错撞其他汉字：只反弹、不批评、不扣分、记录统计
            AudioManager.instance.playSFX('sfx_mismatch');
            WordDataManager.instance.recordMismatch(data.targetWord);
            
            for (const tb of this._targetBlocksMap.values()) {
                if (tb.word === data.targetWord && tb.node.isValid) {
                    tb.onMismatchBounce();
                }
            }
        }
    }

    private onWordEliminated(data: { word: string }) {
        LevelManager.instance.onTargetEliminated(data.word);
        if (LevelManager.instance.isLevelCleared()) {
            this.scheduleOnce(() => {
                this.handleLevelCleared();
            }, 0.8);
        } else {
            this.scheduleOnce(() => {
                this.spawnNextBall();
            }, 0.6);
        }
    }

    private onBallOutOfBounds(data: { word: string; isTimeout?: boolean }) {
        this._consecutiveMissCount++;
        this.combo = 0; // 连击重置
        EventBus.emit(GameEvents.COMBO_CHANGED, { combo: 0 });

        // 智能防挫败弱提示 (连续 2-3 次未命中)
        if (this._consecutiveMissCount >= 2) {
            this.triggerWeakHint();
        }

        if (this._activeBallNode) {
            this._activeBallNode.destroy();
            this._activeBallNode = null;
        }

        this.scheduleOnce(() => {
            this.spawnNextBall();
        }, 0.4);
    }

    private triggerWeakHint() {
        const nextWord = LevelManager.instance.peekNextBallWord();
        if (!nextWord) return;
        for (const tb of this._targetBlocksMap.values()) {
            if (tb.word === nextWord && tb.node.isValid) {
                tb.triggerGlowHint();
            }
        }
    }

    private showBigWordPopup(word: string) {
        if (!this.bigWordFlashNode || !this.bigWordLabel) return;
        this.bigWordLabel.string = word;
        this.bigWordFlashNode.active = true;
        this.scheduleOnce(() => {
            this.bigWordFlashNode.active = false;
        }, 0.9);
    }

    private handleLevelCleared() {
        this.gameState = GameState.LEVEL_COMPLETE;
        AudioManager.instance.playSFX('sfx_win');
        AudioManager.instance.playVoiceCue('vo_clear');
        EventBus.emit(GameEvents.LEVEL_CLEARED, { levelId: this.currentLevelId, score: this.score });
    }
}
