// app.js
App({
  onLaunch() {
    console.log('【奇趣弹弹幼儿乐学】小程序初始化启动...');
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
