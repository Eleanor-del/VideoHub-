const { app, BrowserWindow } = require('electron');
const path = require('path');

app.disableHardwareAcceleration();

function probe() {
  return `(() => {
    const v = document.createElement('video');
    const t = (c) => v.canPlayType(c) || 'NO';
    return {
      avc: t('video/mp4; codecs="avc1.42E01E"'),
      aac: t('audio/mp4; codecs="mp4a.40.2"'),
      hevc: t('video/mp4; codecs="hvc1.1.6.L93.B0"'),
      av1: t('video/mp4; codecs="av01.0.05M.08"'),
      vp9: t('video/webm; codecs="vp9"'),
      mseH264: typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')
    };
  })()`;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 300 });
  await win.loadFile(path.join(__dirname, 'page.html'));
  const res = await win.webContents.executeJavaScript(probe());
  console.log('CODEC_RESULT ' + JSON.stringify(res));
  app.quit();
});
