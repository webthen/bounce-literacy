import { _decorator, Component, Node, Label, tween, Vec3 } from 'cc';
import { EventBus, GameEvents } from '../core/EventBus';
import { AudioManager } from '../managers/AudioManager';
const { ccclass, property } = _decorator;

@ccclass('LevelCompleteDialog')
export class LevelCompleteDialog extends Component {
    @property(Node)
    public starsGroup: Node = null!;

    @property(Label)
    public scoreLabel: Label = null!;

    private _nextLevelCallback: (() => void) | null = null;
    private _restartCallback: (() => void) | null = null;

    public show(score: number, onNext: () => void, onRestart: () => void) {
        this.node.active = true;
        this._nextLevelCallback = onNext;
        this._restartCallback = onRestart;

        if (this.scoreLabel) {
            this.scoreLabel.string = `最终得分: ${score}`;
        }

        // 弹窗果冻入场
        this.node.setScale(new Vec3(0.5, 0.5, 1));
        tween(this.node)
            .to(0.2, { scale: new Vec3(1.08, 1.08, 1) })
            .to(0.1, { scale: Vec3.ONE })
            .call(() => {
                this.playStarsAnim();
            })
            .start();
    }

    private playStarsAnim() {
        if (!this.starsGroup) return;
        const stars = this.starsGroup.children;
        stars.forEach((star, index) => {
            star.setScale(Vec3.ZERO);
            tween(star)
                .delay(0.15 * index)
                .to(0.18, { scale: new Vec3(1.2, 1.2, 1) })
                .to(0.08, { scale: Vec3.ONE })
                .call(() => {
                    AudioManager.instance.playSFX('sfx_bumper');
                })
                .start();
        });
    }

    public onNextLevelClicked() {
        AudioManager.instance.playSFX('sfx_click');
        this.node.active = false;
        if (this._nextLevelCallback) {
            this._nextLevelCallback();
        }
    }

    public onRestartClicked() {
        AudioManager.instance.playSFX('sfx_click');
        this.node.active = false;
        if (this._restartCallback) {
            this._restartCallback();
        }
    }
}
