import { getWordPhrase } from '../data/vocab';
import { audioDB } from '../utils/AudioDB';

export const FISH_AUDIO_CONFIG = {
  modelUrl: 'https://fish.audio/zh-CN/app/m/25aca46726ab4e65a626c2bbdce46c91/',
  referenceId: '25aca46726ab4e65a626c2bbdce46c91',
  apiKey: 'sk-fish-uNXaaAp2zM8bwSDr-X30zucEj-AYP-rEzLUpq-uZHEU',
  endpoint: 'https://api.fish.audio/v1/tts',
  proxyEndpoint: '/api/fish-tts',
  model: 's2.1-pro-free'
};

interface QueuedVoiceTask {
  ttsText: string;
  localUrls: string[];
  onEnd?: () => void;
}

const VOICE_TEXT_MAP: Record<string, string> = {
  vo_ready: '准备发射！',
  vo_super: '太棒啦！一发即中！',
  vo_clear: '恭喜过关！你真棒！',
  vo_combo: '好厉害，连续命中！',
  vo_intro: '点一点汉字卡片，听听它们怎么读吧！',
  vo_win_review: '太棒啦！来复习一下本关认识的汉字吧！'
};

function getWordAudioCode(char: string): string {
  if (!char || typeof char !== 'string') return '';
  return 'u' + char.charCodeAt(0).toString(16).toLowerCase();
}

export class AudioManager {
  private static _instance: AudioManager;
  public static get instance(): AudioManager {
    if (!this._instance) this._instance = new AudioManager();
    return this._instance;
  }

  public muted: boolean = false;
  private sfxCache: Map<string, HTMLAudioElement> = new Map();
  private fishBlobCache: Map<string, string> = new Map();
  private pendingFetches: Map<string, Promise<string | null>> = new Map();
  private unlocked: boolean = false;

  // Fish Audio 熔断冷却时间戳（当 API 额度不足 402 或网络不通时自动降级本地语音，避免卡顿）
  private fishCooldownUntil: number = 0;

  // 严格串行语音队列与独占锁（确保只有一个语音播放完才会进入另一个，绝不混音）
  private currentVoiceAudio: HTMLAudioElement | null = null;
  private isVoicePlaying: boolean = false;
  private voiceQueue: QueuedVoiceTask[] = [];
  private activeToken: number = 0;
  private watchdogTimer: any = null;

  constructor() {}

  public unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silent.play().catch(() => {});
  }

  /**
   * 立即清空语音队列并停止当前语音（用于切换关卡、退出界面、锁屏暂停等）
   */
  public stopVoice() {
    this.activeToken++;
    this.voiceQueue = [];
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    if (this.currentVoiceAudio) {
      try {
        this.currentVoiceAudio.onended = null;
        this.currentVoiceAudio.onerror = null;
        this.currentVoiceAudio.pause();
        this.currentVoiceAudio.src = '';
      } catch (e) {}
      this.currentVoiceAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    this.isVoicePlaying = false;
  }

  public stopSpeech() {
    this.stopVoice();
  }

  /**
   * 播放普通音效 (SFX)
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
   * 串行入队播放：若当前有语音正在播放，则等待当前语音播放完毕后再进入下一个语音，绝不混音
   */
  private enqueueVoice(task: QueuedVoiceTask, skipIfBusy: boolean = false) {
    if (this.muted) {
      task.onEnd?.();
      return;
    }
    this.unlock();

    if (this.isVoicePlaying) {
      if (skipIfBusy) {
        task.onEnd?.();
        return;
      }
      // 队列最多保留 1 个待播任务（新任务覆盖旧等待任务，但绝不打断正在播放的语音）
      if (this.voiceQueue.length >= 1) {
        const dropped = this.voiceQueue.shift();
        dropped?.onEnd?.();
      }
      this.voiceQueue.push(task);
      return;
    }

    this.runVoiceTask(task);
  }

  private getStaticFishAudioUrl(text: string): string | null {
    if (!text) return null;
    for (const [key, voiceText] of Object.entries(VOICE_TEXT_MAP)) {
      if (text === voiceText) {
        return `audio/voice/${key}.mp3`;
      }
    }
    if (text.startsWith('找一找，')) {
      const char = text.slice(4, 5);
      return `audio/words/${getWordAudioCode(char)}.mp3`;
    }
    if (text.startsWith('这是')) {
      const char = text.slice(2, 3);
      return `audio/words/${getWordAudioCode(char)}.mp3`;
    }
    if (text.includes('，')) {
      const char = text.split('，')[0].replace(/[^\u4e00-\u9fa5]/g, '');
      if (char) return `audio/words/${getWordAudioCode(char)}.mp3`;
    }
    const singleChar = text.replace(/[！!]/g, '').trim();
    if (singleChar.length === 1) {
      return `audio/words/${getWordAudioCode(singleChar)}.mp3`;
    }
    return null;
  }

  public async fetchFishAudioBlobUrl(text: string): Promise<string | null> {
    if (!text) return null;
    if (this.fishBlobCache.has(text)) {
      return this.fishBlobCache.get(text)!;
    }
    if (this.pendingFetches.has(text)) {
      return this.pendingFetches.get(text)!;
    }

    const fetchPromise = (async (): Promise<string | null> => {
      // 1. 端侧 IndexedDB 持久化缓存（1~2ms 极速直出，保证零网络延迟）
      try {
        const cachedBlob = await audioDB.get(text);
        if (cachedBlob && cachedBlob.size > 200) {
          const blobUrl = URL.createObjectURL(cachedBlob);
          this.fishBlobCache.set(text, blobUrl);
          return blobUrl;
        }
      } catch (e) {}

      // 2. 尝试从服务端获取预先使用 Fish Audio 模型生成的离线原声音频（几毫秒高速 GET）
      const staticUrl = this.getStaticFishAudioUrl(text);
      if (staticUrl) {
        try {
          const res = await fetch(staticUrl);
          if (res.ok) {
            const blob = await res.blob();
            if (blob.size > 200) {
              audioDB.set(text, blob).catch(() => {});
              const blobUrl = URL.createObjectURL(blob);
              this.fishBlobCache.set(text, blobUrl);
              return blobUrl;
            }
          }
        } catch (e) {}
      }

      // 3. 熔断判定
      if (Date.now() < this.fishCooldownUntil) {
        return null;
      }

      // 4. 调用实时 Fish Audio 云端 API（宽限至 15 秒，避免过早 canceled）
      const body = JSON.stringify({
        text,
        reference_id: FISH_AUDIO_CONFIG.referenceId,
        format: 'mp3',
        model: FISH_AUDIO_CONFIG.model,
        normalize: true
      });
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${FISH_AUDIO_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
        'model': FISH_AUDIO_CONFIG.model
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(FISH_AUDIO_CONFIG.proxyEndpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const contentType = res.headers.get('Content-Type') || '';
          if (contentType.includes('audio') || contentType.includes('octet-stream')) {
            const blob = await res.blob();
            if (blob.size > 200) {
              audioDB.set(text, blob).catch(() => {});
              const blobUrl = URL.createObjectURL(blob);
              this.fishBlobCache.set(text, blobUrl);
              return blobUrl;
            }
          }
        } else if (res.status === 401 || res.status === 402 || res.status === 403) {
          this.fishCooldownUntil = Date.now() + 120000;
          return null;
        }
      } catch (e) {
        clearTimeout(timeoutId);
      }

      return null;
    })();

    this.pendingFetches.set(text, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      this.pendingFetches.delete(text);
    }
  }

  /**
   * 关卡静默全量预取：在关卡初始化时，后台静默预热本关所有目标字词的 Fish Audio 发音
   * 使得后续所有点击、拖拽、命中发音直接从内存 / IndexedDB 中以 0ms 零延迟极速播报！
   */
  public async prefetchLevel(words: string[]) {
    const textsToWarm: string[] = [
      ...Object.values(VOICE_TEXT_MAP)
    ];

    for (const w of words) {
      if (!w) continue;
      const phrase = getWordPhrase(w);
      textsToWarm.push(`${w}！`);
      textsToWarm.push(`${w}，${phrase}！`);
      textsToWarm.push(`找一找，${w}！${phrase}的${w}！`);
      textsToWarm.push(`这是${w}，${phrase}的${w}哦！`);
    }

    const uniqueTexts = [...new Set(textsToWarm)].filter(t => !this.fishBlobCache.has(t));
    for (const text of uniqueTexts) {
      this.fetchFishAudioBlobUrl(text).catch(() => {});
    }
  }

  private async runVoiceTask(task: QueuedVoiceTask) {
    this.isVoicePlaying = true;
    const token = ++this.activeToken;

    // 核心发音：优先从 Fish Audio 预热缓存/IndexedDB/云端获取 Blob URL
    let playUrl: string | null = null;
    if (task.ttsText) {
      playUrl = await this.fetchFishAudioBlobUrl(task.ttsText);
    }
    if (token !== this.activeToken) return;

    const urlsToPlay = playUrl ? [playUrl] : task.localUrls;
    this.playUrlListSequentially(urlsToPlay, 0, token, () => {
      this.finishVoiceTask(token, task);
    });
  }

  private finishVoiceTask(token: number, task: QueuedVoiceTask) {
    if (token !== this.activeToken) return;
    this.isVoicePlaying = false;
    this.currentVoiceAudio = null;
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    task.onEnd?.();
    this.processNextInQueue();
  }

  private processNextInQueue() {
    if (this.isVoicePlaying || this.voiceQueue.length === 0) return;
    const nextTask = this.voiceQueue.shift()!;
    this.runVoiceTask(nextTask);
  }

  private playUrlListSequentially(urls: string[], idx: number, token: number, onComplete: (success: boolean) => void) {
    if (token !== this.activeToken) return;
    if (idx >= urls.length) {
      onComplete(false);
      return;
    }

    const url = urls[idx];
    const audio = new Audio(url);
    this.currentVoiceAudio = audio;

    let finished = false;
    const done = (isErr: boolean) => {
      if (finished || token !== this.activeToken) return;
      finished = true;
      if (this.watchdogTimer) {
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = null;
      }
      audio.onended = null;
      audio.onerror = null;
      if (isErr) {
        this.playUrlListSequentially(urls, idx + 1, token, onComplete);
      } else {
        onComplete(true);
      }
    };

    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      done(false);
    }, 5000);

    audio.onended = () => done(false);
    audio.onerror = () => done(true);
    audio.play().catch(() => done(true));
  }

  /**
   * 播放独立人声音频文件 (vo_ready, vo_super, vo_clear, vo_combo, vo_intro)
   */
  public playVoice(name: string, onEnd?: () => void) {
    const ttsText = VOICE_TEXT_MAP[name] || '';
    this.enqueueVoice({
      ttsText,
      localUrls: [`audio/voice/${name}.mp3`, `audio/voice/${name}.wav`],
      onEnd
    });
  }

  public speakText(_text: string, onEnd?: () => void) {
    onEnd?.();
  }

  /**
   * 单字发音（拖拽弹弓时若当前已有语音在播放，则不打断、不混音）
   */
  public playWord(word: string, onEnd?: () => void, skipIfBusy: boolean = false) {
    const code = getWordAudioCode(word);
    this.enqueueVoice({
      ttsText: `${word}！`,
      localUrls: [`audio/words/${code}.mp3`, `audio/words/${word}.mp3`],
      onEnd
    }, skipIfBusy);
  }

  /**
   * 关卡任务引导（“找一找，【山】！大山的山！”）
   */
  public playMissionPrompt(word: string, onEnd?: () => void) {
    const code = getWordAudioCode(word);
    const phrase = getWordPhrase(word);
    this.enqueueVoice({
      ttsText: `找一找，${word}！${phrase}的${word}！`,
      localUrls: [`audio/words/${code}.mp3`, `audio/words/${word}.mp3`],
      onEnd
    });
  }

  /**
   * 命中结算或回顾卡组词朗读（“山，大山！”）
   */
  public playWordWithPhrase(word: string, onEnd?: () => void) {
    const code = getWordAudioCode(word);
    const phrase = getWordPhrase(word);
    this.enqueueVoice({
      ttsText: `${word}，${phrase}！`,
      localUrls: [`audio/words/${code}.mp3`, `audio/words/${word}.mp3`],
      onEnd
    });
  }

  /**
   * 战场方块点读互动
   */
  public playTouchWord(word: string, onEnd?: () => void) {
    const code = getWordAudioCode(word);
    const phrase = getWordPhrase(word);
    this.enqueueVoice({
      ttsText: `这是${word}，${phrase}的${word}哦！`,
      localUrls: [`audio/words/${code}.mp3`, `audio/words/${word}.mp3`],
      onEnd
    });
  }

  /**
   * 撞上非目标汉字时的提示（若当前已有语音在播报，则跳过，绝不混音）
   */
  public playWrongWord(hitWord: string, onEnd?: () => void) {
    const code = getWordAudioCode(hitWord);
    const phrase = getWordPhrase(hitWord);
    this.enqueueVoice({
      ttsText: `这是${hitWord}，${phrase}的${hitWord}哦！`,
      localUrls: [`audio/words/${code}.mp3`, `audio/words/${hitWord}.mp3`],
      onEnd
    }, true);
  }

  public get isSpeaking(): boolean {
    return this.isVoicePlaying;
  }
}
