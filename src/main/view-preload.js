/**
 * 注入到各平台页面视图中的 preload。
 * 外层站点拿不到任何 Node 能力；仅暴露给内置错误页使用的一个最小接口。
 *
 * 另外承担一件重要的事：在**页面侧**掐掉自定义协议链接。
 * 站点里的 `xxx://` 链接（App 唤起、广告，例如 bitbrowser://）一旦被点/被脚本触发，
 * Chromium 会把它交给操作系统，Windows 就弹出「需要新应用打开此bitbrowser」这种系统框。
 * 主进程的 will-navigate 只能拦住主框架导航，这里在**事件捕获阶段**直接 preventDefault，
 * 是最早、也最彻底的一层拦截。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vhInternal', {
  retry: (id) => ipcRenderer.send('vh:retry', id),
  home: (id) => ipcRenderer.send('vh:home', id),
  openExternal: (url) => ipcRenderer.send('vh:openExternal', url),
});

/** 允许浏览器自己处理的协议，其余一律视为"外部协议" */
const SAFE_SCHEME = /^(https?|about|blob|data|javascript|mailto|tel|file|chrome|devtools):/i;

/** 取出 URL 的协议名；'//host' 这类相对地址返回空串 */
function schemeOf(url) {
  const s = String(url == null ? '' : url).trim();
  if (!s || s.startsWith('//') || s.startsWith('#') || s.startsWith('?')) return '';
  const m = /^([a-z][a-z0-9+.\-]*):/i.exec(s);
  return m ? m[1].toLowerCase() : '';
}

function isExternalProtocol(url) {
  const scheme = schemeOf(url);
  if (!scheme) return false;
  return !SAFE_SCHEME.test(scheme + ':');
}

function block(url, via) {
  try {
    ipcRenderer.send('vh:blockedProtocol', { url: String(url).slice(0, 300), via });
  } catch (e) {
    /* ignore */
  }
}

/** 点击 / 中键点击：命中外链协议就地取消，别让默认行为继续 */
function onClickCapture(e) {
  let el = e.target;
  if (el && el.nodeType === 3) el = el.parentElement; // 文本节点
  if (!el || !el.closest) return;
  const a = el.closest('a[href], area[href]');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (!isExternalProtocol(href)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  block(href, 'click');
}

/** 表单 action 指向外部协议时同样拦掉 */
function onSubmitCapture(e) {
  const form = e.target;
  if (!form || !form.getAttribute) return;
  const action = form.getAttribute('action') || '';
  if (!isExternalProtocol(action)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  block(action, 'form');
}

window.addEventListener('click', onClickCapture, true);
window.addEventListener('auxclick', onClickCapture, true);
window.addEventListener('submit', onSubmitCapture, true);
