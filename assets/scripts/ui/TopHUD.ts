import { _decorator, Component, Label, Node } from 'cc';
import { EventBus, GameEvents } from '../core/EventBus';
const { ccclass, property } = _decorator;

@ccclass('TopHUD')
export class TopHUD extends Component {
    @property(Label)
    public levelTitleLabel: Label = null!;

    @property(Label)
    public scoreLabel: Label = null!;

    @property(Label)
    public comboLabel: Label = null!;

    @property(Node)
    public comboBanner: Node = null!;

    onLoad() {
        EventBus.on(GameEvents.SCORE_CHANGED, this.onScoreChanged.bind(this));
        EventBus.on(GameEvents.COMBO_CHANGED, this.onComboChanged.bind(this));
    }

    public updateLevelTitle(title: string) {
        if (this.levelTitleLabel) {
            this.levelTitleLabel.string = title;
        }
    }

    private onScoreChanged(data: { score: number }) {
        if (this.scoreLabel) {
            this.scoreLabel.string = `${data.score}`.padStart(4, '0');
        }
    }

    private onComboChanged(data: { combo: number }) {
        if (!this.comboBanner || !this.comboLabel) return;
        if (data.combo > 1) {
            this.comboBanner.active = true;
            this.comboLabel.string = `连击 x${data.combo}!`;
        } else {
            this.comboBanner.active = false;
        }
    }
}
