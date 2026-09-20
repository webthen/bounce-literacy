export class AudioManager {
  private static _instance: AudioManager;
  public static get instance(): AudioManager {
    if (!this._instance) this._instance = new AudioManager();
    return this._instance;
  }

  public muted: boolean = false;
  private sfxCache: Map<string, HTMLAudioElement> = new Map();
  private unlocked: boolean = false;

  // 人声独占通道 (确保任何时候至多只有 1 个语音在发声)
  private currentVoiceAudio: HTMLAudioElement | null = null;
  private speechTimeout: any = null;
  private isVoicePlaying: boolean = false;

  constructor() {}

  public unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silent.play().catch(() => {});
  }

  /**
   * 停止当前所有正在发声的人声通道（包括 Web Speech 和语音音频文件）
   * 彻底杜绝多重声音重叠碰撞
   */
  public stopVoice() {
    // 1. 停止当前正在播放的人声音频文件
    if (this.currentVoiceAudio) {
      try {
        this.currentVoiceAudio.pause();
        this.currentVoiceAudio.currentTime = 0;
        this.currentVoiceAudio.onended = null;
        this.currentVoiceAudio.onerror = null;
      } catch (e) {}
      this.currentVoiceAudio = null;
    }

    // 2. 清理计划中的语音延时定时器
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }

    // 3. 停止浏览器原生语音合成
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    this.isVoicePlaying = false;
  }

  /**
   * 兼容旧接口：停止语音
   */
  public stopSpeech() {
    this.stopVoice();
  }

  /**
   * 播放普通音效 (SFX) - 音效允许与背景或人声自然融合，不打断人声
   */
  public playSFX(name: string) {
    if (this.muted) return;
    this.unlock();
    const url = `audio/sfx/${name}.wav`;
    let audio = this.sfxCache.get(url);
    if (!audio) {
      audio = new Audio(url);
      this.sfxCache.set(url, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  /**
   * 播放独立人声音频文件 (例如 vo_ready, vo_super, vo_clear, vo_combo)
   * 互斥机制：优先播放高品质云希真人童声 MP3，自动打断此前的人声，并在结束时触发 onEnd
   */
  public playVoice(name: string, onEnd?: () => void) {
    if (this.muted) {
      onEnd?.();
      return;
    }
    // 优先加载新生成的云希 Neural MP3，若不存在则降级尝试 wav
    this.playVoiceAudio(`audio/voice/${name}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/voice/${name}.wav`, onEnd);
    });
  }

  /**
   * 播放人声字词音频文件，支持失败时平滑降级到备选方案
   */
  private playVoiceAudio(url: string, onEnd?: () => void, onFallback?: () => void) {
    if (this.muted) {
      onEnd?.();
      return;
    }
    this.stopVoice();
    this.unlock();

    const audio = new Audio(url);
    this.currentVoiceAudio = audio;
    this.isVoicePlaying = true;

    let isDone = false;
    const cleanup = (isError: boolean = false) => {
      if (isDone) return;
      isDone = true;
      if (this.currentVoiceAudio === audio) {
        this.currentVoiceAudio = null;
        this.isVoicePlaying = false;
      }
      if (isError && onFallback) {
        onFallback();
      } else {
        onEnd?.();
      }
    };

    audio.onended = () => cleanup(false);
    audio.onerror = () => cleanup(true);
    audio.play().catch(() => cleanup(true));
  }

  /**
   * 彻底去除机械音：保留兼容调用签名，绝不调用浏览器原生 SAPI/机械语音合成
   */
  public speakText(_text: string, onEnd?: () => void) {
    onEnd?.();
  }

  /**
   * 单字标准发音：云希活力单字发音（“山！”）
   */
  public playWord(word: string, onEnd?: () => void) {
    if (this.muted) {
      onEnd?.();
      return;
    }
    const safeWord = encodeURIComponent(word);
    this.playVoiceAudio(`audio/words/single_${safeWord}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/words/${safeWord}.mp3`, onEnd);
    });
  }

  /**
   * 关卡任务引导：晓晓老师温柔亲切引导（“找一找，【山】！大山的山！”）
   */
  public playMissionPrompt(word: string, onEnd?: () => void) {
    if (this.muted) {
      onEnd?.();
      return;
    }
    const safeWord = encodeURIComponent(word);
    this.playVoiceAudio(`audio/prompts/${safeWord}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/words/${safeWord}.mp3`, onEnd);
    });
  }

  /**
   * 命中结算或回顾卡组词朗读：云希生动词组跟读（“山，大山！”）
   */
  public playWordWithPhrase(word: string, onEnd?: () => void) {
    if (this.muted) {
      onEnd?.();
      return;
    }
    const safeWord = encodeURIComponent(word);
    this.playVoiceAudio(`audio/words/${safeWord}.mp3`, onEnd);
  }

  /**
   * 战场方块点读互动：晓晓温柔教学讲解（“这是【水】，喝水的水哦！”）
   */
  public playTouchWord(word: string, onEnd?: () => void) {
    if (this.muted) {
      onEnd?.();
      return;
    }
    const safeWord = encodeURIComponent(word);
    this.playVoiceAudio(`audio/touch/${safeWord}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/words/${safeWord}.mp3`, onEnd);
    });
  }

  /**
   * 撞上非目标汉字时的教学提示：晓晓温和点读提示（“这是【水】，喝水的水哦！”）
   */
  public playWrongWord(hitWord: string, onEnd?: () => void) {
    if (this.muted) {
      onEnd?.();
      return;
    }
    const safeWord = encodeURIComponent(hitWord);
    this.playVoiceAudio(`audio/touch/${safeWord}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/words/${safeWord}.mp3`, onEnd);
    });
  }

  /**
   * 当前是否有人声在发声
   */
  public get isSpeaking(): boolean {
    return this.isVoicePlaying;
  }
}
