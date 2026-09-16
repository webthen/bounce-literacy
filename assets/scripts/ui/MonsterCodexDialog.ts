import { _decorator, Component, Node, Label, instantiate, Prefab } from 'cc';
import { UserDataManager, IMonsterItem } from '../managers/UserDataManager';
import { AudioManager } from '../managers/AudioManager';
const { ccclass, property } = _decorator;

@ccclass('MonsterCodexDialog')
export class MonsterCodexDialog extends Component {
    @property(Node)
    public listContainer: Node = null!;

    @property(Label)
    public totalUnlockedLabel: Label = null!;

    public show() {
        this.node.active = true;
        this.renderMonsters();
    }

    public hide() {
        AudioManager.instance.playSFX('sfx_click');
        this.node.active = false;
    }

    private renderMonsters() {
        const monsters = UserDataManager.instance.monsters;
        let unlockedCount = 0;

        monsters.forEach(m => {
            if (m.isUnlocked) unlockedCount++;
        });

        if (this.totalUnlockedLabel) {
            this.totalUnlockedLabel.string = `已收集: ${unlockedCount} / ${monsters.length}`;
        }
    }
}
