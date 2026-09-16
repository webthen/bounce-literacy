import { _decorator, Component, Node } from 'cc';
import { AudioManager } from '../managers/AudioManager';
const { ccclass, property } = _decorator;

@ccclass('PauseDialog')
export class PauseDialog extends Component {
    private _onResume: (() => void) | null = null;
    private _onRestart: (() => void) | null = null;
    private _onQuit: (() => void) | null = null;

    public show(onResume: () => void, onRestart: () => void, onQuit: () => void) {
        this.node.active = true;
        this._onResume = onResume;
        this._onRestart = onRestart;
        this._onQuit = onQuit;
    }

    public onResumeClicked() {
        AudioManager.instance.playSFX('sfx_click');
        this.node.active = false;
        if (this._onResume) this._onResume();
    }

    public onRestartClicked() {
        AudioManager.instance.playSFX('sfx_click');
        this.node.active = false;
        if (this._onRestart) this._onRestart();
    }

    public onQuitClicked() {
        AudioManager.instance.playSFX('sfx_click');
        this.node.active = false;
        if (this._onQuit) this._onQuit();
    }
}
