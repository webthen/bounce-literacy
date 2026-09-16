import { _decorator, Component, Node, director } from 'cc';
import { AudioManager } from '../managers/AudioManager';
import { ParentGateDialog } from './ParentGateDialog';
import { MonsterCodexDialog } from './MonsterCodexDialog';
const { ccclass, property } = _decorator;

@ccclass('TitleView')
export class TitleView extends Component {
    @property(ParentGateDialog)
    public parentGateDialog: ParentGateDialog = null!;

    @property(MonsterCodexDialog)
    public monsterCodexDialog: MonsterCodexDialog = null!;

    public onStartGameClicked() {
        AudioManager.instance.playSFX('sfx_click');
        director.loadScene('GamePlay');
    }

    public onParentPortalClicked() {
        AudioManager.instance.playSFX('sfx_click');
        if (this.parentGateDialog) {
            this.parentGateDialog.show();
        }
    }

    public onMonsterCodexClicked() {
        AudioManager.instance.playSFX('sfx_click');
        if (this.monsterCodexDialog) {
            this.monsterCodexDialog.show();
        }
    }

    public onSoundToggleClicked() {
        AudioManager.instance.toggleMute();
    }
}
