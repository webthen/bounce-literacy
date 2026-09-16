import { _decorator, Component, Node, Label, Button } from 'cc';
import { UserDataManager } from '../managers/UserDataManager';
import { WordDataManager } from '../managers/WordDataManager';
import { AudioManager } from '../managers/AudioManager';
const { ccclass, property } = _decorator;

@ccclass('ParentGateDialog')
export class ParentGateDialog extends Component {
    @property(Node)
    public gateQuestionPanel: Node = null!;

    @property(Node)
    public parentDashboardPanel: Node = null!;

    @property(Label)
    public questionLabel: Label = null!;

    @property([Button])
    public optionButtons: Button[] = [];

    @property(Label)
    public totalStudyCountLabel: Label = null!;

    private _currentAnswer: number = 0;

    public show() {
        this.node.active = true;
        this.openGateChallenge();
    }

    public hide() {
        AudioManager.instance.playSFX('sfx_click');
        this.node.active = false;
    }

    private openGateChallenge() {
        this.gateQuestionPanel.active = true;
        this.parentDashboardPanel.active = false;

        const q = UserDataManager.instance.generateParentGateQuestion();
        this._currentAnswer = q.answer;
        this.questionLabel.string = q.question;

        q.options.forEach((val, idx) => {
            if (this.optionButtons[idx]) {
                const lbl = this.optionButtons[idx].getComponentInChildren(Label);
                if (lbl) lbl.string = `${val}`;
                this.optionButtons[idx].node.off(Button.EventType.CLICK);
                this.optionButtons[idx].node.on(Button.EventType.CLICK, () => {
                    this.onOptionSelected(val);
                }, this);
            }
        });
    }

    private onOptionSelected(selectedVal: number) {
        if (selectedVal === this._currentAnswer) {
            AudioManager.instance.playSFX('sfx_bumper');
            this.gateQuestionPanel.active = false;
            this.parentDashboardPanel.active = true;
            this.renderParentDashboard();
        } else {
            AudioManager.instance.playSFX('sfx_mismatch');
            // 答错重新生成题目
            this.openGateChallenge();
        }
    }

    private renderParentDashboard() {
        const stats = WordDataManager.instance.getAllStats();
        const totalHits = stats.reduce((acc, cur) => acc + cur.hitCount, 0);
        if (this.totalStudyCountLabel) {
            this.totalStudyCountLabel.string = `今日累计认字练习: ${totalHits} 次`;
        }
    }
}
