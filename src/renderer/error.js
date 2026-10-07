(() => {
  const q = new URLSearchParams(location.search);
  const id = q.get('id') || '';
  const desc = q.get('desc') || '';
  const code = q.get('code') || '';
  const url = q.get('url') || '';

  const HINTS = {
    '-105': '域名无法解析，请检查网络或 DNS 设置',
    '-106': '网络不可用，请检查本机网络连接',
    '-101': '连接被重置，可能是网络代理或防火墙拦截',
    '-102': '连接被拒绝，请稍后重试',
    '-118': '连接超时，请稍后重试',
    '-2': '加载被中断，请重试',
    '-7': '请求超时，请重试',
  };

  const el = document.getElementById('desc');
  const hint = HINTS[String(code)];
  el.textContent = hint ? hint + '（' + code + ' ' + desc + '）' : (desc ? code + ' · ' + desc : '请检查网络连接后重试');
  document.getElementById('url').textContent = url;

  const api = window.vhInternal || {};
  document.getElementById('retry').onclick = () => api.retry && api.retry(id);
  document.getElementById('home').onclick = () => api.home && api.home(id);
})();
