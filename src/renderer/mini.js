/* 迷你播放窗：控制条 + 上班摸鱼面板 */
(() => {
  const api = window.api;
  if (!api) return;

  document.querySelector('#b-back').onclick = () => api.miniAction('back');
  document.querySelector('#b-reload').onclick = () => api.miniAction('reload');
  document.querySelector('#b-top').onclick = () => api.miniAction('top');
  document.querySelector('#b-close').onclick = () => api.miniAction('close');

  const panel = document.querySelector('#panel');
  const btnStealth = document.querySelector('#b-stealth');
  const range = document.querySelector('#r-opacity');
  const valLabel = document.querySelector('#v-opacity');
  const btnHide = document.querySelector('#b-hide');

  let pref = { opacity: 1, hideTaskbar: false, alwaysTop: true };

  const paint = () => {
    const pct = Math.round(pref.opacity * 100);
    range.value = String(pct);
    valLabel.textContent = pct + '%';
    btnHide.classList.toggle('on', !!pref.hideTaskbar);
    btnHide.textContent = pref.hideTaskbar ? '已隐身' : '任务栏隐身';
    btnStealth.classList.toggle('on', pref.opacity < 1 || !!pref.hideTaskbar);
  };

  btnStealth.onclick = () => {
    const show = !panel.classList.contains('show');
    panel.classList.toggle('show', show);
    // 面板是 HTML，展开时必须让视频下移，否则原生视频视图会盖在上面看不见也点不到
    const h = show ? Math.round(panel.getBoundingClientRect().height) : 0;
    api.miniOverlay(h).catch(() => {});
  };

  range.oninput = () => {
    const v = Number(range.value) / 100;
    api.miniPref({ opacity: v }).then((p) => {
      pref = p;
      paint();
    });
  };

  document.querySelectorAll('#panel [data-op]').forEach((b) => {
    b.onclick = () => {
      api.miniPref({ opacity: Number(b.dataset.op) }).then((p) => {
        pref = p;
        paint();
      });
    };
  });

  btnHide.onclick = () => {
    api.miniPref({ hideTaskbar: !pref.hideTaskbar }).then((p) => {
      pref = p;
      paint();
    });
  };

  // 读回持久化偏好：下次开小窗沿用上次的透明度与隐身状态
  api
    .miniPref(null)
    .then((p) => {
      pref = p || pref;
      paint();
    })
    .catch(() => paint());
})();
