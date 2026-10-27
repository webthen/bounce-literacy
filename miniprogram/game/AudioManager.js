// miniprogram/game/AudioManager.js
const { getWordPhrase } = require('../data/vocab');

const FISH_AUDIO_CONFIG = {
  modelUrl: 'https://fish.audio/zh-CN/app/m/25aca46726ab4e65a626c2bbdce46c91/',
  referenceId: '25aca46726ab4e65a626c2bbdce46c91',
  apiKey: 'sk-fish-uNXaaAp2zM8bwSDr-X30zucEj-AYP-rEzLUpq-uZHEU',
  endpoint: 'https://api.fish.audio/v1/tts',
  model: 's2.1-pro-free'
};

const SFX_NAME_MAP = {
  'sfx_launch': 'sfx_shoot',
  'sfx_hit': 'sfx_match',
  'sfx_pull': ''
};

const VOICE_TEXT_MAP = {
  vo_ready: '准备发射！',
  vo_super: '太棒啦！一发即中！',
  vo_clear: '恭喜过关！你真棒！',
  vo_combo: '好厉害，连续命中！',
  vo_intro: '点一点汉字卡片，听听它们怎么读吧！',
  vo_win_review: '太棒啦！来复习一下本关认识的汉字吧！',
  vo_warn_30s: '时间还剩最后30秒啦，准备收尾咯！',
  vo_contract_3: '约定好啦，挑战3分钟，说话算话哦！',
  vo_contract_5: '约定好啦，挑战5分钟，说话算话哦！',
  vo_contract_8: '约定好啦，挑战8分钟，说话算话哦！',
  vo_contract_intro: '小朋友，自己决定本次玩多久？对自己负责，说话算话哦！',
  vo_timeup: '时间到啦！小眼睛休息一下，看看远方，请爸爸妈妈来解锁吧！',
  vo_opt_3: '3分钟，快速挑战！',
  vo_opt_5: '5分钟，推荐时长！',
  vo_opt_8: '8分钟，识字大师！'
};

function getWordAudioCode(char) {
  if (!char || typeof char !== 'string') return '';
  return 'u' + char.charCodeAt(0).toString(16).toLowerCase();
}

class AudioManager {
  static get instance() {
    if (!this._instance) this._instance = new AudioManager();
    return this._instance;
  }

  constructor() {
    this.muted = false;
    this.sfxContexts = {};
    this.currentVoiceCtx = null;
    this.isVoicePlaying = false;
    this.voiceQueue = [];
    this.activeToken = 0;
    this.watchdogTimer = null;
    this.fishCache = {};
    this.fishCooldownUntil = 0;
    this.baseUrl = '/';

    // 全局强制配置：在静音模式下仍然播放声音，避免 iOS 侧边静音开关导致无声
    if (typeof wx !== 'undefined' && wx.setInnerAudioOption) {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        mixWithOther: true
      });
    }
  }

  playSFX(name) {
    if (this.muted) return;
    if (typeof wx === 'undefined' || !wx.createInnerAudioContext) return;
    try {
      const realName = SFX_NAME_MAP[name] !== undefined ? SFX_NAME_MAP[name] : name;
      if (!realName) return;
      const ctx = wx.createInnerAudioContext();
      ctx.obeyMuteSwitch = false;
      ctx.src = encodeURI(`/audio/sfx/${realName}.wav`);
      ctx.play();
      ctx.onEnded(() => {
        try { ctx.destroy(); } catch (e) {}
      });
      ctx.onError((err) => {
        try {
          ctx.src = encodeURI(`audio/sfx/${realName}.wav`);
          ctx.play();
        } catch (e2) {
          try { ctx.destroy(); } catch (e3) {}
        }
      });
    } catch (e) {}
  }

  /**
   * 立即停止当前语音并清空等待队列（切换关卡、暂停、锁屏时调用）
   */
  stopVoice() {
    this.activeToken++;
    this.voiceQueue = [];
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.currentVoiceCtx) {
      try {
        this.currentVoiceCtx.offEnded();
        this.currentVoiceCtx.offError();
        this.currentVoiceCtx.stop();
        this.currentVoiceCtx.destroy();
      } catch (e) {}
      this.currentVoiceCtx = null;
    }
    this.isVoicePlaying = false;
  }

  stopSpeech() {
    this.stopVoice();
  }

  /**
   * 严格串行语音入队：只有一个语音播放完毕才会进入另一个，绝不混音
   */
  enqueueVoice(task, skipIfBusy = false) {
    if (this.muted) {
      task.onEnd && task.onEnd();
      return;
    }

    if (this.isVoicePlaying) {
      if (skipIfBusy) {
        task.onEnd && task.onEnd();
        return;
      }
      if (this.voiceQueue.length >= 1) {
        const dropped = this.voiceQueue.shift();
        dropped && dropped.onEnd && dropped.onEnd();
      }
      this.voiceQueue.push(task);
      return;
    }

    this.runVoiceTask(task);
  }

  fetchFishAudioFile(text, callback) {
    if (!text || typeof wx === 'undefined' || !wx.request) {
      callback(null);
      return;
    }
    if (this.fishCache[text]) {
      callback(this.fishCache[text]);
      return;
    }
    if (Date.now() < this.fishCooldownUntil) {
      callback(null);
      return;
    }

    let settled = false;
    const done = (filePath) => {
      if (settled) return;
      settled = true;
      callback(filePath);
    };

    const timer = setTimeout(() => {
      this.fishCooldownUntil = Date.now() + 30000;
      done(null);
    }, 15000);

    wx.request({
      url: FISH_AUDIO_CONFIG.endpoint,
      method: 'POST',
      responseType: 'arraybuffer',
      header: {
        'Authorization': `Bearer ${FISH_AUDIO_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
        'model': FISH_AUDIO_CONFIG.model
      },
      data: {
        text: text,
        reference_id: FISH_AUDIO_CONFIG.referenceId,
        format: 'mp3',
        normalize: true,
        model: FISH_AUDIO_CONFIG.model
      },
      success: (res) => {
        clearTimeout(timer);
        if (res.statusCode === 200 && res.data && res.data.byteLength > 200) {
          try {
            const fs = wx.getFileSystemManager();
            const safeKey = encodeURIComponent(text).replace(/%/g, '_').slice(0, 40);
            const filePath = `${wx.env.USER_DATA_PATH}/fish_${safeKey}.mp3`;
            fs.writeFileSync(filePath, res.data, 'binary');
            this.fishCache[text] = filePath;
            done(filePath);
            return;
          } catch (e) {}
        } else if (res.statusCode === 401 || res.statusCode === 402 || res.statusCode === 403) {
          this.fishCooldownUntil = Date.now() + 120000;
        } else {
          this.fishCooldownUntil = Date.now() + 30000;
        }
        done(null);
      },
      fail: () => {
        clearTimeout(timer);
        this.fishCooldownUntil = Date.now() + 30000;
        done(null);
      }
    });
  }

  runVoiceTask(task) {
    this.isVoicePlaying = true;
    const token = ++this.activeToken;

    // 优先播放小程序本地预置打包好的 Fish Audio 音频（0延迟秒开，避免网络卡顿）
    this.playUrlListSequentially(task.localUrls, 0, token, (success) => {
      if (token !== this.activeToken) return;

      // 若所有本地路径均失败，且有 ttsText，再异步降级向 Fish Audio 发起网络请求
      if (!success && task.ttsText) {
        this.fetchFishAudioFile(task.ttsText, (fishPath) => {
          if (token !== this.activeToken) return;
          if (fishPath) {
            this.playUrlListSequentially([fishPath], 0, token, () => {
              this.finishVoiceTask(token, task);
            });
            return;
          }
          this.finishVoiceTask(token, task);
        });
        return;
      }

      this.finishVoiceTask(token, task);
    });
  }

  finishVoiceTask(token, task) {
    if (token !== this.activeToken) return;
    this.isVoicePlaying = false;
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    task.onEnd && task.onEnd();
    this.processNextInQueue();
  }

  processNextInQueue() {
    if (this.isVoicePlaying || this.voiceQueue.length === 0) return;
    const nextTask = this.voiceQueue.shift();
    this.runVoiceTask(nextTask);
  }

  playUrlListSequentially(urls, idx, token, onComplete) {
    if (token !== this.activeToken) return;
    if (idx >= urls.length || typeof wx === 'undefined' || !wx.createInnerAudioContext) {
      onComplete && onComplete(false);
      return;
    }

    const rawUrl = urls[idx];
    let targetPath = rawUrl;
    if (!targetPath.startsWith('http') && !targetPath.startsWith('wxfile://') && !(wx.env && targetPath.startsWith(wx.env.USER_DATA_PATH))) {
      // 统一确保小程序包内资源带根目录斜杠或相对路径
      targetPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    }
    const cleanUrl = encodeURI(targetPath);

    if (this.currentVoiceCtx) {
      try {
        this.currentVoiceCtx.offEnded();
        this.currentVoiceCtx.offError();
        this.currentVoiceCtx.stop();
        this.currentVoiceCtx.destroy();
      } catch (e) {}
      this.currentVoiceCtx = null;
    }

    const ctx = wx.createInnerAudioContext();
    ctx.obeyMuteSwitch = false;
    this.currentVoiceCtx = ctx;

    let handled = false;
    const done = (isErr) => {
      if (handled || token !== this.activeToken) return;
      handled = true;
      if (this.watchdogTimer) {
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = null;
      }
      try {
        ctx.offEnded();
        ctx.offError();
        ctx.destroy();
      } catch (e) {}
      if (this.currentVoiceCtx === ctx) {
        this.currentVoiceCtx = null;
      }
      if (isErr) {
        this.playUrlListSequentially(urls, idx + 1, token, onComplete);
      } else {
        onComplete && onComplete(true);
      }
    };

    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      done(false);
    }, 5000);

    ctx.onEnded(() => done(false));
    ctx.onError((err) => {
      console.warn('[AudioManager Error]', cleanUrl, err);
      done(true);
    });

    try {
      ctx.src = cleanUrl;
      ctx.play();
    } catch (e) {
      done(true);
    }
  }

  playVoice(name, onEnd) {
    if (!name || name === 'undefined') {
      onEnd && onEnd();
      return;
    }
    this.enqueueVoice({
      ttsText: VOICE_TEXT_MAP[name] || '',
      localUrls: [`/audio/voice/${name}.mp3`, `audio/voice/${name}.mp3`],
      onEnd
    });
  }

  playWord(word, onEnd, skipIfBusy = false) {
    if (!word || typeof word !== 'string' || word === 'undefined') {
      onEnd && onEnd();
      return;
    }
    const code = getWordAudioCode(word);
    this.enqueueVoice({
      ttsText: `${word}！`,
      localUrls: [
        `/audio/words/${code}.mp3`,
        `audio/words/${code}.mp3`
      ],
      onEnd
    }, skipIfBusy);
  }

  playMissionPrompt(word, onEnd) {
    if (!word || typeof word !== 'string' || word === 'undefined') {
      onEnd && onEnd();
      return;
    }
    const code = getWordAudioCode(word);
    const phrase = getWordPhrase(word);
    this.enqueueVoice({
      ttsText: `找一找，${word}！${phrase}的${word}！`,
      localUrls: [
        `/audio/words/${code}.mp3`,
        `audio/words/${code}.mp3`
      ],
      onEnd
    });
  }

  playWordWithPhrase(word, onEnd) {
    if (!word || typeof word !== 'string' || word === 'undefined') {
      onEnd && onEnd();
      return;
    }
    const code = getWordAudioCode(word);
    const phrase = getWordPhrase(word);
    this.enqueueVoice({
      ttsText: `${word}，${phrase}！`,
      localUrls: [
        `/audio/words/${code}.mp3`,
        `audio/words/${code}.mp3`
      ],
      onEnd
    });
  }

  playTouchWord(word, onEnd) {
    if (!word || typeof word !== 'string' || word === 'undefined') {
      onEnd && onEnd();
      return;
    }
    const code = getWordAudioCode(word);
    const phrase = getWordPhrase(word);
    this.enqueueVoice({
      ttsText: `这是${word}，${phrase}的${word}哦！`,
      localUrls: [
        `/audio/words/${code}.mp3`,
        `audio/words/${code}.mp3`
      ],
      onEnd
    });
  }

  playWrongWord(hitWord, onEnd) {
    if (!hitWord || typeof hitWord !== 'string' || hitWord === 'undefined') {
      onEnd && onEnd();
      return;
    }
    const code = getWordAudioCode(hitWord);
    const phrase = getWordPhrase(hitWord);
    this.enqueueVoice({
      ttsText: `这是${hitWord}，${phrase}的${hitWord}哦！`,
      localUrls: [
        `/audio/words/${code}.mp3`,
        `audio/words/${code}.mp3`
      ],
      onEnd
    }, true);
  }

  prefetchLevel(words) {
    if (!words || !Array.isArray(words)) return;
    const textsToWarm = Object.values(VOICE_TEXT_MAP);
    for (const w of words) {
      if (!w) continue;
      const phrase = getWordPhrase(w);
      textsToWarm.push(`${w}！`);
      textsToWarm.push(`${w}，${phrase}！`);
      textsToWarm.push(`找一找，${w}！${phrase}的${w}！`);
      textsToWarm.push(`这是${w}，${phrase}的${w}哦！`);
    }
    const unique = [...new Set(textsToWarm)].filter(t => !this.fishCache[t]);
    unique.forEach(text => {
      this.fetchFishAudioFile(text, () => {});
    });
  }

  get isSpeaking() {
    return this.isVoicePlaying;
  }
}

module.exports = {
  AudioManager,
  FISH_AUDIO_CONFIG
};
