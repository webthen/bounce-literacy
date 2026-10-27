// app.js
App({
  onLaunch() {
    console.log('【奇趣弹弹幼儿乐学】小程序初始化启动...');
    // 全局强制配置：在静音模式下仍然播放声音，避免 iOS 侧边静音开关导致无声
    if (typeof wx !== 'undefined' && wx.setInnerAudioOption) {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        mixWithOther: true
      });
    }

    const sys = wx.getSystemInfoSync();
    this.globalData = {
      windowWidth: sys.windowWidth,
      windowHeight: sys.windowHeight,
      statusBarHeight: sys.statusBarHeight || 20,
      pixelRatio: sys.pixelRatio || 2
    };
  },
  globalData: {}
});
