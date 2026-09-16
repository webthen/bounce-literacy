import { _decorator, AudioSource, AudioClip, resources } from 'cc';

export class AudioManager {
    private static _instance: AudioManager | null = null;
    public static get instance(): AudioManager {
        if (!this._instance) {
            this._instance = new AudioManager();
        }
        return this._instance;
    }

    private _audioSource: AudioSource = null!;
    private _clipCache: Map<string, AudioClip> = new Map();
    private _isMuted: boolean = false;

    public init(audioSource: AudioSource) {
        this._audioSource = audioSource;
    }

    public toggleMute(): boolean {
        this._isMuted = !this._isMuted;
        if (this._audioSource) {
            this._audioSource.volume = this._isMuted ? 0 : 1;
        }
        return this._isMuted;
    }

    public get isMuted(): boolean {
        return this._isMuted;
    }

    /** 极速播放音效 (延迟控制在 0.1s 内) */
    public playSFX(sfxName: string) {
        if (this._isMuted) return;
        const path = `audio/sfx/${sfxName}`;
        this._playFromPath(path, 0.9);
    }

    /** 播放汉字标准普通话发音 */
    public playWordVoice(audioFile: string) {
        if (this._isMuted) return;
        // 去除后缀
        const nameWithoutExt = audioFile.replace(/\.[^/.]+$/, '');
        const path = `audio/words/${nameWithoutExt}`;
        this._playFromPath(path, 1.0);
    }

    /** 播放鼓励人声 */
    public playVoiceCue(cueName: string) {
        if (this._isMuted) return;
        const path = `audio/voice/${cueName}`;
        this._playFromPath(path, 1.0);
    }

    private _playFromPath(path: string, volume: number = 1.0) {
        if (this._clipCache.has(path)) {
            const clip = this._clipCache.get(path)!;
            this._audioSource.playOneShot(clip, volume);
            return;
        }

        resources.load(path, AudioClip, (err, clip) => {
            if (err || !clip) {
                console.warn(`Audio clip not found: ${path}`);
                return;
            }
            this._clipCache.set(path, clip);
            if (!this._isMuted) {
                this._audioSource.playOneShot(clip, volume);
            }
        });
    }
}
