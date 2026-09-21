// miniprogram/game/AudioManager.js
const SFX_NAME_MAP = {
  'sfx_launch': 'sfx_shoot',
  'sfx_hit': 'sfx_match',
  'sfx_pull': '' // 无此文件，忽略
};

class AudioManager {
  static get instance() {
    if (!this._instance) this._instance = new AudioManager();
    return this._instance;
  }

  constructor() {
    this.muted = false;
    this.sfxContexts = {};
    this.voiceContext = null;
    this.speechTimeout = null;
    this.isVoicePlaying = false;
    // 微信小程序包内路径必须以 / 开头
    this.baseUrl = '/';
  }

  initVoiceContext() {
    if (!this.voiceContext && typeof wx !== 'undefined' && wx.createInnerAudioContext) {
      this.voiceContext = wx.createInnerAudioContext();
      this.voiceContext.obeyMuteSwitch = false;
    }
  }

  getSFXContext(rawName) {
    const realName = SFX_NAME_MAP[rawName] !== undefined ? SFX_NAME_MAP[rawName] : rawName;
    if (!realName) return null;

    if (!this.sfxContexts[realName] && typeof wx !== 'undefined' && wx.createInnerAudioContext) {
      const ctx = wx.createInnerAudioContext();
      ctx.obeyMuteSwitch = false;
      ctx.src = `${this.baseUrl}audio/sfx/${realName}.wav`;
      ctx.onError((err) => {
        // 静默捕获，防止在控制台抛出 Uncaught NotSupportedError
        console.warn(`音效 ${realName} 无法加载，已忽略:`, err && err.errMsg);
      });
      this.sfxContexts[realName] = ctx;
    }
    return this.sfxContexts[realName];
  }

  playSFX(name) {
    if (this.muted) return;
    try {
      const ctx = this.getSFXContext(name);
      if (ctx) {
        ctx.stop();
        ctx.play();
      }
    } catch (e) {
      console.warn('播放音效失败', e);
    }
  }

  stopVoice() {
    if (this.voiceContext) {
      try {
        this.voiceContext.stop();
      } catch (e) {}
    }
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }
    this.isVoicePlaying = false;
  }

  stopSpeech() {
    this.stopVoice();
  }

  playVoiceAudio(url, onEnd, onFallback) {
    if (this.muted || !url) {
      onEnd && onEnd();
      return;
    }
    this.stopVoice();
    this.initVoiceContext();

    if (!this.voiceContext) {
      onEnd && onEnd();
      return;
    }

    this.isVoicePlaying = true;
    let handled = false;

    const cleanup = (isError = false) => {
      if (handled) return;
      handled = true;
      this.isVoicePlaying = false;
      if (isError && onFallback) {
        onFallback();
      } else {
        onEnd && onEnd();
      }
    };

    this.voiceContext.offEnded();
    this.voiceContext.offError();

    this.voiceContext.onEnded(() => cleanup(false));
    this.voiceContext.onError((err) => {
      cleanup(true);
    });

    try {
      // 确保路径以 / 开头，且中文无需 encodeURIComponent
      const cleanUrl = url.startsWith('/') ? url : `${this.baseUrl}${url}`;
      this.voiceContext.src = cleanUrl;
      this.voiceContext.play();
    } catch (err) {
      cleanup(true);
    }
  }

  playVoice(name, onEnd) {
    if (!name || name === 'undefined') return;
    this.playVoiceAudio(`audio/voice/${name}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/voice/${name}.wav`, onEnd);
    });
  }

  playWord(word, onEnd) {
    if (!word || typeof word !== 'string' || word === 'undefined') {
      onEnd && onEnd();
      return;
    }
    // 阶梯尝试：single_mp3 -> single_wav -> mp3 -> wav
    this.playVoiceAudio(`audio/words/single_${word}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/words/single_${word}.wav`, onEnd, () => {
        this.playVoiceAudio(`audio/words/${word}.mp3`, onEnd, () => {
          this.playVoiceAudio(`audio/words/${word}.wav`, onEnd);
        });
      });
    });
  }

  playMissionPrompt(word, onEnd) {
    if (!word || typeof word !== 'string' || word === 'undefined') {
      onEnd && onEnd();
      return;
    }
    // 关卡任务引导：优先 prompts mp3 -> prompts wav -> words mp3 -> words wav
    this.playVoiceAudio(`audio/prompts/${word}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/prompts/${word}.wav`, onEnd, () => {
        this.playWord(word, onEnd);
      });
    });
  }

  playWordWithPhrase(word, onEnd) {
    if (!word || typeof word !== 'string' || word === 'undefined') {
      onEnd && onEnd();
      return;
    }
    this.playVoiceAudio(`audio/words/${word}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/words/${word}.wav`, onEnd, () => {
        this.playWord(word, onEnd);
      });
    });
  }

  playTouchWord(word, onEnd) {
    if (!word || typeof word !== 'string' || word === 'undefined') {
      onEnd && onEnd();
      return;
    }
    this.playVoiceAudio(`audio/touch/${word}.mp3`, onEnd, () => {
      this.playVoiceAudio(`audio/touch/${word}.wav`, onEnd, () => {
        this.playWord(word, onEnd);
      });
    });
  }

  playWrongWord(hitWord, onEnd) {
    this.playTouchWord(hitWord, onEnd);
  }

  get isSpeaking() {
    return this.isVoicePlaying;
  }
}

module.exports = {
  AudioManager
};
