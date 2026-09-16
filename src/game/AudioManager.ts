import { VOCAB_LIST } from '../data/vocab';

export class AudioManager {
  private static _instance: AudioManager;
  public static get instance(): AudioManager {
    if (!this._instance) this._instance = new AudioManager();
    return this._instance;
  }

  public muted: boolean = false;
  private cache: Map<string, HTMLAudioElement> = new Map();
  private unlocked: boolean = false;

  public unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silent.play().catch(() => {});
  }

  public play(url: string) {
    if (this.muted) return;
    this.unlock();
    let a = this.cache.get(url);
    if (!a) {
      a = new Audio(url);
      this.cache.set(url, a);
    }
    a.currentTime = 0;
    a.play().catch(e => console.warn('Audio play error:', e));
  }

  /**
   * 汉字发音：双引擎保障（本地音频 + Web Speech API 原生标准普通话朗读）
   */
  public playWord(word: string) {
    if (this.muted) return;
    this.unlock();

    const item = VOCAB_LIST.find(v => v.char === word);
    if (item && item.audioFile) {
      this.play(`audio/words/${item.audioFile}`);
      return;
    }

    // 调用浏览器高品质中文语音合成
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel(); // 停止前面的语音
        const utter = new SpeechSynthesisUtterance(word);
        utter.lang = 'zh-CN';
        utter.rate = 0.85; // 亲切自然的童声适中语速
        utter.pitch = 1.1; // 稍微清亮活泼
        window.speechSynthesis.speak(utter);
      } catch (e) {
        console.warn('SpeechSynthesis error:', e);
      }
    }
  }

  public playSFX(name: string) {
    this.play(`audio/sfx/${name}.wav`);
  }

  public playVoice(name: string) {
    this.play(`audio/voice/${name}.wav`);
  }
}
