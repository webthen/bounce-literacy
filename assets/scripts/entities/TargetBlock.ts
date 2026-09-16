import { _decorator, Component, Label, Sprite, tween, Vec3, Color } from 'cc';
import { EventBus, GameEvents } from '../core/EventBus';
const { ccclass, property } = _decorator;

@ccclass('TargetBlock')
export class TargetBlock extends Component {
    @property(Label)
    public wordLabel: Label = null!;

    @property(Sprite)
    public bgSprite: Sprite = null!;

    public word: string = '';
    public isTarget: boolean = true;
    private _isEliminated: boolean = false;

    public init(word: string, isTarget: boolean = true) {
        this.word = word;
        this.isTarget = isTarget;
        if (this.wordLabel) {
            this.wordLabel.string = word;
        }
        this._isEliminated = false;
        this.node.setScale(Vec3.ONE);
    }

    /** 命中且匹配：消除动画与音效反馈 */
    public onMatchedEliminate() {
        if (this._isEliminated) return;
        this._isEliminated = true;

        // 果冻回弹 -> 迅速缩小碎裂
        tween(this.node)
            .to(0.1, { scale: new Vec3(1.25, 1.25, 1) })
            .to(0.15, { scale: Vec3.ZERO })
            .call(() => {
                EventBus.emit(GameEvents.WORD_ELIMINATED, { word: this.word });
                this.node.destroy();
            })
            .start();
    }

    /** 撞错字：轻微弹性晃动反馈（不扣分、不批评、不出现红叉） */
    public onMismatchBounce() {
        tween(this.node)
            .to(0.05, { scale: new Vec3(0.92, 1.08, 1) })
            .to(0.07, { scale: new Vec3(1.06, 0.94, 1) })
            .to(0.08, { scale: Vec3.ONE })
            .start();
    }

    /** 智能防挫败弱提示：放大并金光呼吸闪烁 */
    public triggerGlowHint() {
        tween(this.node)
            .to(0.35, { scale: new Vec3(1.18, 1.18, 1) })
            .to(0.35, { scale: Vec3.ONE })
            .union()
            .repeat(3)
            .start();
    }
}
