/**
 * VideoHub —— 主进程（完整实现）
 * 无边框窗口 + 自定义标题栏；使用 WebContentsView 原生嵌入三平台网页，
 * 支持单平台 / 聚合分屏、统一搜索、收藏与历史、迷你播放窗。
 */
const { app, BrowserWindow, WebContentsView, session, ipcMain, shell, Menu, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const {
  BUILTIN_PLATFORMS,
  NBA_SOURCES,
  NBA_SPLIT,
  DEFAULT_SPLIT,
  normalizeSource,
  searchUrlOf,
  toPublicPlatforms,
  NAME_INDEX,
  indexSourceByName,
} = require('../shared/platforms');
const { Store } = require('./store');
const { detectSource } = require('./detect');

const isDev = process.argv.includes('--dev');
const isSmoke = process.argv.includes('--smoke');

if (isSmoke) app.disableHardwareAcceleration();

// 用户数据目录固定到 %APPDATA%\VideoHub，便于安装包升级时保留数据、卸载时完整清理。
// 冒烟测试改用临时目录：既不会污染真实收藏/历史，也不会和用户正在运行的实例抢单实例锁。
app.setPath(
  'userData',
  isSmoke
    ? path.join(app.getPath('temp'), 'videohub-smoke')
    : path.join(app.getPath('appData'), 'VideoHub')
);

// 降低被识别为自动化环境的概率；允许视频自动播放
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// 与 renderer/styles.css 中的 --sidebar-w / --topbar-h / --pane-h 保持一致
const SIDEBAR_W = 228;
const SIDEBAR_W_COLLAPSED = 64;
const TOPBAR_H = 46;
const PANE_HEADER_H = 30;

let iconPath = null;
// 窗口底色：弹窗遮罩期间原生视图会被摘掉，露出的就是这层底色，需跟随主题
const BG_LIGHT = '#F5F6F8';
const BG_DARK = '#14161C';
let windowBg = BG_LIGHT;

let win = null;
let miniWin = null;
let miniView = null;
// 当前在小窗里播放的「源 id」：主窗口同名视图会被静音+暂停，避免两边同时播放
let miniSourceId = null;
// 摸鱼面板展开时的高度：面板是 HTML，而 WebContentsView 原生视图永远盖在上层，
// 不把内容视图下移的话面板会被视频挡住，看不见也点不到（与主窗口 overlay 同一类问题）
let miniOverlayH = 0;
const views = new Map(); // id -> WebContentsView
const viewStates = new Map(); // id -> { showingError }
const loaded = new Set(); // 已初始化过的视图
const lastUrl = new Map(); // id -> 最后访问的 url
const store = new Store(path.join(app.getPath('userData'), 'videohub.json'));

const state = {
  mode: 'single', // 'single' | 'split'
  active: 'bilibili', // 当前聚焦平台
  splitList: DEFAULT_SPLIT.slice(), // 分屏列数太多会挤，默认只放三个主力平台
  colRatios: {}, // id -> 列宽权重（1 为等宽），支持拖拽调整
  // 聚合布局：row 横排 | grid 网格 | focus 主次（左大右小）
  lm: { mode: 'row', gridCols: 2, focusRatio: 0.66 },
  solo: null, // 单列最大化时聚焦的那个 id
  overlay: false, // 界面弹出遮罩（弹窗/下拉菜单）时为 true，临时隐藏原生视图
  audio: 'focus', // 'focus' 仅焦点列发声 | 'all' 全部发声 | 'off' 全部静音
  sidebarWidth: SIDEBAR_W,
  topbarHeight: TOPBAR_H,
  collapsed: false,
};

/* ------------------------------------------------------------------ */
/* 平台注册表：内置平台 + 用户自定义视频源                              */
/* ------------------------------------------------------------------ */

let PLATFORMS = [];
let PLATFORM_MAP = {};
let ALL_HOSTS = [];

/** 合并内置平台与用户自定义源，重建索引；增删源后必须调用 */
function rebuildPlatforms() {
  const custom = (store.get('sources', []) || [])
    .map((s) => normalizeSource(s))
    .filter((r) => r.ok)
    .map((r) => r.source);

  PLATFORMS = BUILTIN_PLATFORMS.concat(custom);
  PLATFORM_MAP = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));
  ALL_HOSTS = PLATFORMS.flatMap((p) => p.hosts);

  // 源被删掉后，分屏列表 / 列宽 / 当前平台都要跟着清理，避免出现空白列
  state.splitList = state.splitList.filter((id) => PLATFORM_MAP[id]);
  Object.keys(state.colRatios).forEach((id) => {
    if (!PLATFORM_MAP[id]) delete state.colRatios[id];
  });
  if (!PLATFORM_MAP[state.active]) state.active = PLATFORMS.length ? PLATFORMS[0].id : 'bilibili';
  if (!state.splitList.length) state.splitList = [state.active];
  if (state.solo && !PLATFORM_MAP[state.solo]) state.solo = null;
}
rebuildPlatforms();

/* 免登录（游客）模式：开启时各平台落地到移动端 / 游客端点，少弹登录框 */
let GUEST = false;
const homeOf = (p) => (p && GUEST && p.guestHome ? p.guestHome : p ? p.home : '');

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** 主进程直接弹一条界面提示 */
const toast = (msg) => send('app:toast', String(msg));

/** 可以交给系统浏览器的协议：只认 http(s) */
const EXTERNAL_OK = /^https?:\/\//i;
const HARMLESS_SCHEME = /^(about|blob|data|javascript|mailto|tel|file|chrome|devtools):/i;

/**
 * 取出导航目标 URL。
 * Electron 33 起部分事件把参数换成了对象形式，这里两种都兼容。
 */
function navUrlOf(a, b) {
  if (a && typeof a === 'object' && typeof a.url === 'string' && a.url) return a.url;
  return typeof b === 'string' ? b : '';
}

/** 是否是需要拦下的"外部协议"（bitbrowser:// 这类） */
function isExternalProtocol(url) {
  const u = String(url || '').trim();
  if (!u || u.startsWith('//') || u.startsWith('#') || u.startsWith('?')) return false;
  const m = /^([a-z][a-z0-9+.\-]*):/i.exec(u);
  if (!m) return false;
  return !EXTERNAL_OK.test(u) && !HARMLESS_SCHEME.test(m[1] + ':');
}

/**
 * 记下一条被拦下的外部协议链接。
 * 除了提示用户，还会落盘到 userData（最多 20 条），
 * 这样"到底是哪个页面弹出的系统框"事后查得出来。
 */
function noteBlocked(url, from, via) {
  const raw = String(url || '').slice(0, 300);
  const scheme = (raw.match(/^([a-z][a-z0-9+.\-]*):/i) || [])[1] || '未知';
  let host = '';
  try {
    host = from ? new URL(from).hostname : '';
  } catch (e) {
    host = String(from || '').slice(0, 60);
  }
  const list = store.get('blocked', []).filter((x) => x.url !== raw);
  list.unshift({ url: raw, scheme, from: host, via: via || '', ts: Date.now() });
  store.set('blocked', list.slice(0, 20));
  send('blocked:changed', store.get('blocked', []));
  toast(`已拦截外部协议链接（${scheme}://${host ? '，来自 ' + host : ''}）`);
  return scheme;
}

/**
 * 安全地把链接交给系统浏览器。
 *
 * 站点里的 `xxx://` 自定义协议（广告、App 唤起链接，例如 bitbrowser://）
 * 一旦被原样丢给 ShellExecute，Windows 就会弹出「需要新应用打开此bitbrowser」。
 * 非 http(s) 一律不交给系统，只记一条日志 + 界面提示。
 */
function openExternalSafe(url, from) {
  const u = String(url || '').trim();
  if (EXTERNAL_OK.test(u)) {
    shell.openExternal(u);
    return true;
  }
  if (isExternalProtocol(u)) {
    noteBlocked(u, from || currentViewUrl(), 'openExternal');
  }
  return false;
}

/** 兜底来源：当前聚焦视图的地址 */
function currentViewUrl() {
  const v = views.get(state.active);
  try {
    return v && !v.webContents.isDestroyed() ? v.webContents.getURL() : '';
  } catch (e) {
    return '';
  }
}

/** 已装过防护的 webContents，避免全局 + 单视图两次注册导致重复拦截/重复提示 */
const guardedContents = new WeakSet();

/**
 * 给任意 webContents 装上一整套"外部协议防护"。
 * 三层：窗口打开 / 主框架导航 / 子框架导航，任何一层命中就取消。
 */
function guardExternalProtocol(contents, label) {
  if (guardedContents.has(contents)) return;
  guardedContents.add(contents);
  const from = () => {
    try {
      return contents.isDestroyed() ? '' : contents.getURL();
    } catch (e) {
      return '';
    }
  };
  const guard = (e, url, via) => {
    if (!isExternalProtocol(url)) return false;
    e.preventDefault();
    noteBlocked(url, from(), via || label);
    return true;
  };
  contents.on('will-navigate', (e, url) => guard(e, navUrlOf(e, url), 'will-navigate'));
  // 子框架（广告 iframe 等）里的自定义协议跳转，will-navigate 是收不到的
  contents.on('will-frame-navigate', (e, url) => guard(e, navUrlOf(e, url), 'will-frame-navigate'));
}

const hostMatches = (host, list) => list.some((h) => host === h || host.endsWith('.' + h));

/**
 * 是否属于本应用收录的域名。
 * 传 id 时只判断该平台自己的域名（视图内跳转用），
 * 不传则判断全部平台（错误页、外链兜底用）。
 */
function isOwnHost(url, id) {
  try {
    const host = new URL(url).hostname;
    if (id && PLATFORM_MAP[id]) return hostMatches(host, PLATFORM_MAP[id].hosts);
    return hostMatches(host, ALL_HOSTS);
  } catch (e) {
    return false;
  }
}

/** 反查某个 URL 属于哪个平台（迷你窗没有平台上下文时用） */
function platformOfUrl(url) {
  try {
    const host = new URL(url).hostname;
    const p = PLATFORMS.find((pl) => hostMatches(host, pl.hosts));
    return p ? p.id : null;
  } catch (e) {
    return null;
  }
}

function uid(prefix) {
  return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ------------------------------------------------------------------ */
/* 收藏 / 历史                                                         */
/* ------------------------------------------------------------------ */

function pushHistory(entry) {
  const list = store.get('history', []);
  const idx = list.findIndex((x) => x.url === entry.url);
  if (idx >= 0) list.splice(idx, 1);
  list.unshift(entry);
  const next = list.slice(0, 300);
  store.set('history', next);
  send('history:changed', next);
}

function recordVisit(id, url, title) {
  if (!url || url === 'about:blank' || !/^https?:/.test(url)) return;
  if (/\/(search|search\/video)/.test(url)) return; // 忽略搜索页
  const p = PLATFORM_MAP[id];
  if (!p) return;
  if (url === p.home || url === p.home.replace(/\/$/, '')) return;
  pushHistory({ id: uid('h'), platform: id, url, title: title || url, ts: Date.now() });
}

/* ------------------------------------------------------------------ */
/* 视图管理                                                            */
/* ------------------------------------------------------------------ */

function createView(id) {
  if (views.has(id)) return views.get(id);

  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:videohub',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'view-preload.js'),
    },
  });

  const wc = view.webContents;
  wc.setUserAgent(UA);
  view.setBackgroundColor('#FFFFFF');

  const vstate = { showingError: false };
  viewStates.set(id, vstate);

  wc.on('did-start-navigation', (_e, url, _isInPlace, isMainFrame) => {
    if (isMainFrame) send('view:loading', { id, loading: true, url });
  });

  wc.on('did-navigate', (_e, url) => {
    if (vstate.showingError) return; // 错误页不计入导航/历史
    lastUrl.set(id, url);
    send('view:nav', { id, url, title: wc.getTitle() });
    send('view:loading', { id, loading: false, url });
    recordVisit(id, url, wc.getTitle());
  });

  wc.on('did-navigate-in-page', (_e, url) => {
    if (vstate.showingError) return;
    lastUrl.set(id, url);
    send('view:nav', { id, url, title: wc.getTitle() });
  });

  wc.on('page-title-updated', (_e, title) => {
    send('view:nav', { id, url: vstate.showingError ? lastUrl.get(id) : wc.getURL(), title });
  });

  wc.on('did-finish-load', () => {
    send('view:loading', { id, loading: false, url: vstate.showingError ? lastUrl.get(id) : wc.getURL() });
  });

  // 主框架加载失败时切换到内置错误页（网络异常 / DNS / 被拦截等）
  wc.on('did-fail-load', (_e, code, desc, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    // 自定义协议 / about:blank 之类的失败不是"网页打不开"，不要换成错误页
    if (failedUrl && !/^https?:/i.test(failedUrl)) return;
    if (vstate.showingError) return;
    const target = lastUrl.get(id) || failedUrl;
    if (!/^https?:/.test(target)) return;
    vstate.showingError = true;
    const page = path.join(__dirname, '../renderer/error.html');
    wc.loadFile(page, {
      query: { id, code: String(code), desc: String(desc || ''), url: target },
    }).catch(() => {});
    send('view:error', { id, code, desc, url: target });
  });

  // 站内 target=_blank / window.open（搜索建议、视频卡片、登录回跳）一律在**当前视图内**打开。
  // 注意：返回 { action: 'allow' } 会让 Electron 另开一个原生窗口（就是"搜索后弹窗"的原因）。
  wc.setWindowOpenHandler(({ url }) => {
    if (isOwnHost(url, id)) {
      loadUrl(id, url);
      return { action: 'deny' };
    }
    openExternalSafe(url, wc.getURL());
    return { action: 'deny' };
  });

  // 页面内 location.href='xxx://…' / 广告 iframe 跳自定义协议：统一由守卫拦掉。
  // 不拦的话 Chromium 会以 ERR_UNKNOWN_URL_SCHEME 失败，
  // 又被 did-fail-load 当成"加载失败"而把好端端的页面换成错误页。
  guardExternalProtocol(wc, 'view');

  // 说明：站内跳转（含登录、验证码、第三方鉴权回跳）一律放行，
  // 仅把 target=_blank 且非本平台域名的链接交给系统浏览器。


  views.set(id, view);
  return view;
}

function getView(id) {
  return createView(id);
}

/** 统一的 URL 加载入口：重置错误页状态并记录目标地址 */
function loadUrl(id, url) {
  const v = getView(id);
  const vs = viewStates.get(id);
  if (vs) vs.showingError = false;
  loaded.add(id);
  lastUrl.set(id, url);
  v.webContents.loadURL(url).catch(() => {});
  return v;
}

function ensureLoaded(id) {
  const p = PLATFORM_MAP[id];
  if (!p || loaded.has(id)) return;
  loadUrl(id, lastUrl.get(id) || homeOf(p));
}

const attachedIds = new Set();

function attach(id) {
  const v = views.get(id);
  if (!v || attachedIds.has(id)) return;
  win.contentView.addChildView(v);
  attachedIds.add(id);
}

/**
 * 把视图从窗口摘掉。
 * @param {string} id
 * @param {{mute?: boolean}} [opts] mute 默认 true：摘下后必须静音，否则后台继续发声。
 *   例外是 overlay（弹窗/菜单展开）场景——那只是临时摘罩让 HTML 弹窗可见，
 *   必须保持原有播放，不能静音，否则一开弹窗视频就哑了。
 */
function detach(id, opts) {
  const v = views.get(id);
  if (!v || !attachedIds.has(id)) return;
  const mute = !opts || opts.mute !== false;
  if (mute) {
    try {
      if (v.webContents && !v.webContents.isDestroyed()) v.webContents.setAudioMuted(true);
    } catch (e) {
      /* ignore */
    }
  }
  try {
    win.contentView.removeChildView(v);
  } catch (e) {
    /* ignore */
  }
  attachedIds.delete(id);
}

/** 彻底销毁一个视图：关闭分屏列 / 删除视频源时释放内存 */
function destroyView(id) {
  detach(id);
  const v = views.get(id);
  if (v) {
    try {
      v.webContents.close();
    } catch (e) {
      /* ignore */
    }
    views.delete(id);
  }
  viewStates.delete(id);
  loaded.delete(id);
  lastUrl.delete(id);
}

function viewTargets() {
  if (state.mode === 'split') {
    // 单列最大化：只保留那一列，其余列不销毁，退出最大化即可恢复
    if (state.solo && state.splitList.includes(state.solo) && PLATFORM_MAP[state.solo]) {
      return [state.solo];
    }
    const list = state.splitList.filter((id) => PLATFORM_MAP[id]);
    return list.length ? list : [state.active];
  }
  return [state.active];
}

const clampNum = (v, lo, hi, dft) => {
  const n = Number(v);
  if (!isFinite(n)) return dft;
  return Math.min(hi, Math.max(lo, n));
};

/**
 * 计算布局并把需要展示的视图挂到窗口上。
 * 仅对「需要隐藏/显示」的视图做增删，避免缩放窗口时反复摘挂引起播放抖动。
 */
const GRID_GAP = 2;

/**
 * 计算所有可见窗格的矩形，是布局的唯一真相来源：
 * 主进程按它贴视图，渲染进程按它画列头，两边永远一致。
 *   row   —— 横向 N 列，宽度按 colRatios 权重分配（可拖拽）
 *   grid  —— 网格，按 gridCols 自动排行，适合 4/6 个页面同时看
 *   focus —— 主次，首列占 focusRatio，其余在右侧竖向堆叠
 */
function paneRects() {
  const [w, h] = win && !win.isDestroyed() ? win.getContentSize() : [1440, 900];
  const x0 = state.collapsed ? SIDEBAR_W_COLLAPSED : state.sidebarWidth;
  // 分屏模式下顶部有 30px 列头（由渲染进程绘制），视图需下移避让
  const y0 = state.topbarHeight + (state.mode === 'split' ? PANE_HEADER_H : 0);
  const gap = GRID_GAP;
  const cw = Math.max(160, w - x0);
  const ch = Math.max(160, h - y0);
  const targets = viewTargets();
  const n = targets.length;
  const out = [];

  const meta = { containerWidth: cw, containerHeight: ch, mode: state.mode === 'split' ? state.lm.mode : 'row', solo: !!state.solo };

  if (n <= 1) {
    if (n === 1) out.push({ id: targets[0], x: x0, y: y0, width: cw, height: ch });
    return Object.assign(meta, { panes: out });
  }

  if (state.mode === 'split' && state.lm.mode === 'grid') {
    const cols = Math.round(clampNum(state.lm.gridCols, 1, 4, 2));
    const rows = Math.ceil(n / cols);
    const cellW = Math.floor((cw - gap * (cols - 1)) / cols);
    const cellH = Math.floor((ch - gap * (rows - 1)) / rows);
    targets.forEach((id, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      out.push({
        id,
        x: x0 + c * (cellW + gap),
        y: y0 + r * (cellH + gap),
        // 最后一行/列吃掉取整误差，避免右侧和底部留下缝
        width: c === cols - 1 ? cw - c * (cellW + gap) : cellW,
        height: r === rows - 1 ? ch - r * (cellH + gap) : cellH,
      });
    });
  } else if (state.mode === 'split' && state.lm.mode === 'focus') {
    const ratio = clampNum(state.lm.focusRatio, 0.35, 0.85, 0.66);
    const mainW = Math.floor(cw * ratio);
    const rightW = Math.max(160, cw - mainW - gap);
    const rest = n - 1;
    const eachH = Math.floor((ch - gap * (rest - 1)) / rest);
    out.push({ id: targets[0], x: x0, y: y0, width: mainW, height: ch });
    for (let i = 1; i < n; i++) {
      const yy = y0 + (i - 1) * (eachH + gap);
      out.push({
        id: targets[i],
        x: x0 + mainW + gap,
        y: yy,
        width: rightW,
        height: i === n - 1 ? y0 + ch - yy : eachH,
      });
    }
  } else {
    const weights = targets.map((id) => clampNum(state.colRatios[id], 0.25, 8, 1));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const avail = Math.max(160, cw - gap * (n - 1));
    let cursor = 0;
    targets.forEach((id, i) => {
      const width = i === n - 1 ? avail - cursor : Math.round((avail * weights[i]) / total);
      out.push({ id, x: x0 + cursor, y: y0, width: Math.max(140, width), height: ch });
      cursor += width + gap;
    });
  }

  return Object.assign(meta, { panes: out });
}

/**
 * 计算布局并把需要展示的视图挂到窗口上。
 * 仅对「需要隐藏/显示」的视图做增删，避免缩放窗口时反复摘挂引起播放抖动。
 */
function layout() {
  if (!win || win.isDestroyed()) return;
  // 弹窗 / 下拉菜单展开时临时摘掉原生视图：
  // WebContentsView 是窗口的原生子视图，永远盖在界面 HTML 之上，
  // 不摘掉的话"添加视频源"这类弹窗会被网页挡住，用户点开却什么都看不到。
  const rects = state.overlay ? { panes: [] } : paneRects();
  const targets = rects.panes.map((p) => p.id);

  Array.from(attachedIds).forEach((id) => {
    if (!targets.includes(id)) detach(id, { mute: !state.overlay });
  });

  const multi = rects.panes.length > 1;
  rects.panes.forEach((p) => {
    ensureLoaded(p.id);
    const v = getView(p.id);
    attach(p.id);
    v.setBounds({ x: p.x, y: p.y, width: p.width, height: p.height });
    // 声音策略：off 全静音 / all 全放开 / focus 只留焦点列，避免多列混音
    // 若该源正在小窗里播放，主窗口这一份必须保持静音，否则两边同时出声
    const ownedByMini = !!(miniWin && !miniWin.isDestroyed() && miniSourceId && p.id === miniSourceId);
    const muted = ownedByMini
      ? true
      : state.audio === 'off' ? true : state.audio === 'all' ? false : multi ? p.id !== state.active : false;
    v.webContents.setAudioMuted(muted);
  });
}

/** 供渲染进程绘制列头时复用（与 layout 同一套算法） */
const paneWidths = () => paneRects();

function navigate(id, url) {
  if (!PLATFORM_MAP[id]) return;
  state.active = id;
  loadUrl(id, url);
  layout();
  send('state:changed', publicState());
}

/**
 * 一次性打开一组视图并切到分屏。
 * 用于「NBA 一键看球」等聚合入口：同时加载多个平台并排展示。
 */
function openViewSet(payload) {
  const raw = payload && Array.isArray(payload.items) && payload.items.length ? payload.items : NBA_SPLIT;
  const items = raw.filter((it) => it && PLATFORM_MAP[it.id]);
  if (!items.length) return publicState();

  state.mode = payload && payload.mode ? payload.mode : 'split';
  state.splitList = items.map((it) => it.id);
  state.active = state.splitList[0];
  state.colRatios = {}; // 换一组页面时恢复等宽，避免沿用上一组的极端比例
  state.solo = null; // 退出单列最大化，保证整组页面都看得见
  items.forEach((it) => {
    if (it.url) loadUrl(it.id, it.url);
  });
  layout();
  const next = publicState();
  send('state:changed', next);
  return next;
}

/** 关闭聚合页中的某一列：销毁视图、清理列宽与焦点 */
function closePane(id) {
  destroyView(id);
  const rest = state.splitList.filter((x) => x !== id);
  delete state.colRatios[id];
  if (state.solo === id) state.solo = null;
  if (state.active === id) state.active = rest[0] || (PLATFORMS[0] && PLATFORMS[0].id);
  if (rest.length) {
    state.splitList = rest;
  } else {
    // 关掉最后一列就退回单平台视图，不留空白窗口
    state.mode = 'single';
    state.splitList = [state.active];
  }
  layout();
  const next = publicState();
  send('state:changed', next);
  return next;
}

/* ------------------------------------------------------------------ */
/* 状态                                                                */
/* ------------------------------------------------------------------ */

function publicState() {
  return {
    mode: state.mode,
    active: state.active,
    splitList: state.splitList,
    colRatios: state.colRatios,
    lm: state.lm,
    solo: state.solo,
    audio: state.audio,
    collapsed: state.collapsed,
    // 正在小窗播放的源：主窗口这一份会被静音+暂停，界面据此给出提示避免误会
    miniSourceId: miniWin && !miniWin.isDestroyed() ? miniSourceId : null,
    bossHidden,
    panes: paneRects(),
    urls: Object.fromEntries(PLATFORMS.map((p) => [p.id, lastUrl.get(p.id) || p.home])),
  };
}

/** 平台列表（去掉不可克隆的 searchUrl 函数）下发给渲染进程 */
const publicPlatforms = () => toPublicPlatforms(PLATFORMS);

/* ------------------------------------------------------------------ */
/* 迷你播放窗                                                          */
/* ------------------------------------------------------------------ */

/** 把视图里的 video/audio 暂停掉（配合静音，杜绝主界面继续播放） */
function pauseMedia(v) {
  if (!v || !v.webContents || v.webContents.isDestroyed()) return;
  v.webContents
    .executeJavaScript(
      "try{document.querySelectorAll('video,audio').forEach(function(m){if(!m.paused)m.pause();});}catch(e){}",
      true
    )
    .catch(() => {});
}

/** 小窗偏好：透明度 / 是否在任务栏隐身 / 是否置顶（摸鱼三件套） */
function miniPrefs() {
  const prefs = store.get('prefs', {}) || {};
  return Object.assign({ opacity: 1, hideTaskbar: false, alwaysTop: true }, prefs.mini || {});
}

function applyMiniPrefs() {
  if (!miniWin || miniWin.isDestroyed()) return;
  const p = miniPrefs();
  try {
    miniWin.setOpacity(Math.min(1, Math.max(0.15, p.opacity)));
  } catch (e) {
    /* ignore */
  }
  try {
    miniWin.setSkipTaskbar(!!p.hideTaskbar);
  } catch (e) {
    /* ignore */
  }
  try {
    miniWin.setAlwaysOnTop(p.alwaysTop !== false);
  } catch (e) {
    /* ignore */
  }
}

/** 小窗内容视图的布局：顶栏占 36px，摸鱼面板展开时再整体下移面板高度 */
function layoutMiniView() {
  if (!miniWin || miniWin.isDestroyed() || !miniView) return;
  const [w, h] = miniWin.getContentSize();
  const top = 36 + miniOverlayH;
  miniView.setBounds({ x: 0, y: top, width: w, height: Math.max(60, h - top) });
}

/** 小窗接管某个源：主窗口同名视图静音+暂停 */
function shadowMainSource(id) {
  miniSourceId = id || null;
  const v = id ? views.get(id) : null;
  if (v) {
    try {
      v.webContents.setAudioMuted(true);
    } catch (e) {
      /* ignore */
    }
    pauseMedia(v);
  }
  // 主界面这一份已经「哑掉」，必须让用户知情，否则会误以为播坏了
  if (id && PLATFORM_MAP[id]) toast('已在小窗播放「' + PLATFORM_MAP[id].name + '」，主界面已暂停');
  layout();
  send('state:changed', publicState());
}

/** 关闭小窗：交回播放权，是否恢复发声由 layout 的声音策略决定 */
function releaseMiniSource() {
  miniSourceId = null;
  layout();
  send('state:changed', publicState());
}

/* ------------------------------------------------------------------ */
/* 老板键：Ctrl/Command+Alt+H 一键隐藏全部窗口并静音，再按一次恢复      */
/* ------------------------------------------------------------------ */
const BOSS_KEY = 'CommandOrControl+Alt+H';
let bossHidden = false;
let bossRestore = [];

/** 静音所有视图（含小窗），避免「藏起来了却还在响」 */
function muteAllViews() {
  views.forEach((v) => {
    try {
      if (v && v.webContents && !v.webContents.isDestroyed()) v.webContents.setAudioMuted(true);
    } catch (e) {
      /* ignore */
    }
  });
  try {
    if (miniView && miniView.webContents && !miniView.webContents.isDestroyed()) {
      miniView.webContents.setAudioMuted(true);
      pauseMedia(miniView);
    }
  } catch (e) {
    /* ignore */
  }
}

function toggleBossKey() {
  const all = BrowserWindow.getAllWindows().filter((w) => w && !w.isDestroyed());
  if (!bossHidden) {
    bossRestore = all.filter((w) => w.isVisible());
    muteAllViews();
    all.forEach((w) => w.hide());
    bossHidden = true;
  } else {
    all.forEach((w) => {
      if (bossRestore.indexOf(w) !== -1) w.show();
    });
    bossRestore = [];
    bossHidden = false;
    try {
      if (miniView && miniView.webContents && !miniView.webContents.isDestroyed()) {
        miniView.webContents.setAudioMuted(false);
      }
    } catch (e) {
      /* ignore */
    }
    // 声音策略由 layout 统一恢复，避免手改 mute 与策略打架
    layout();
    send('state:changed', publicState());
  }
  return bossHidden;
}

function openMiniPlayer(url, sourceId) {
  let id = sourceId || (PLATFORM_MAP[state.active] ? state.active : null);
  if (!url) {
    const v = id ? views.get(id) : null;
    let u = v ? v.webContents.getURL() : '';
    if (!u || u === 'about:blank') u = PLATFORM_MAP[id] ? homeOf(PLATFORM_MAP[id]) : '';
    url = u;
  } else if (!sourceId) {
    id = platformOfUrl(url) || id;
  }
  if (!PLATFORM_MAP[id]) id = null;
  if (!url) return;

  if (miniWin && !miniWin.isDestroyed()) {
    if (miniView && !miniView.webContents.isDestroyed()) miniView.webContents.loadURL(url).catch(() => {});
    // 已有小窗：换源时同步更新「主窗口哪一份要静音」的归属
    shadowMainSource(id);
    miniWin.focus();
    return;
  }

  miniWin = new BrowserWindow({
    width: 420,
    height: 760,
    minWidth: 320,
    minHeight: 420,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    backgroundColor: '#14161C',
    title: '迷你播放',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  miniView = new WebContentsView({
    webPreferences: {
      partition: 'persist:videohub',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  miniView.webContents.setUserAgent(UA);
  miniView.setBackgroundColor('#14161C');
  // 小窗同样不新开窗口：站内链接直接在小窗内跳转，站外交给系统浏览器
  miniView.webContents.setWindowOpenHandler(({ url: u }) => {
    if (isOwnHost(u, platformOfUrl(miniView.webContents.getURL()))) {
      miniView.webContents.loadURL(u).catch(() => {});
      return { action: 'deny' };
    }
    openExternalSafe(u, miniView.webContents.getURL());
    return { action: 'deny' };
  });
  guardExternalProtocol(miniView.webContents, 'mini');

  miniWin.loadFile(path.join(__dirname, '../renderer/mini.html'));
  miniWin.contentView.addChildView(miniView);

  miniWin.on('resize', layoutMiniView);
  miniWin.once('ready-to-show', () => {
    layoutMiniView();
    applyMiniPrefs();
    miniWin.show();
  });
  miniWin.on('closed', () => {
    // 显式关掉视图内容，避免父窗销毁后 webContents 泄漏、直播流在后台续跑
    try {
      if (miniView && miniView.webContents && !miniView.webContents.isDestroyed()) {
        miniView.webContents.close({ waitForBeforeUnload: false });
      }
    } catch (e) {
      /* ignore */
    }
    miniWin = null;
    miniView = null;
    releaseMiniSource();
  });
  miniView.webContents.loadURL(url).catch(() => {});
  // 主界面停止播放同一份内容，避免小窗和主窗口双重出声
  shadowMainSource(id);
}

/* ------------------------------------------------------------------ */
/* 主窗口                                                              */
/* ------------------------------------------------------------------ */

function createWindow() {
  win = new BrowserWindow({
    ...(iconPath ? { icon: iconPath } : {}),
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 660,
    frame: false,
    backgroundColor: windowBg,
    show: false,
    title: 'VideoHub',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error('[renderer]', message, sourceId + ':' + line);
  });
  win.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('[preload-error]', preloadPath, error.message);
  });

  win.once('ready-to-show', () => {
    layout();
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
    if (isSmoke) runSmoke();
  });

  win.on('resize', layout);
  // 尺寸变化结束后同步一次列宽，让渲染进程的列头与网页视图重新对齐
  const syncLayout = () => {
    layout();
    send('state:changed', publicState());
  };
  win.on('resized', syncLayout);
  win.on('enter-full-screen', syncLayout);
  win.on('leave-full-screen', syncLayout);
  win.on('closed', () => {
    win = null;
  });
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc() {
  // 无水印下载：仅在主动发起下载时拦截并设置干净文件名，页面自身触发的下载仍走系统默认保存对话框
  let forcedDownloadName = null;
  session.fromPartition('persist:videohub').on('will-download', (_e, item) => {
    if (!forcedDownloadName) return;
    const file = path.join(app.getPath('downloads'), forcedDownloadName);
    forcedDownloadName = null;
    try {
      item.setSavePath(file);
    } catch (e) {
      /* ignore */
    }
    item.on('done', (_e2, st) => {
      if (st === 'completed') {
        try { shell.showItemInFolder(file); } catch (e) { /* ignore */ }
        send('app:toast', '已保存（无水印）：' + path.basename(file));
      } else if (st === 'interrupted') {
        send('app:toast', '下载中断：' + path.basename(file));
      }
    });
  });

  ipcMain.handle('app:init', () => ({
    // 注意：内置平台的 searchUrl 是函数，无法跨进程结构化克隆，需剔除
    platforms: publicPlatforms(),
    sources: store.get('sources', []),
    removed: store.get('removed', []),
    nbaSources: NBA_SOURCES,
    nbaSplit: NBA_SPLIT,
    nameAliases: NAME_INDEX.map((e) => ({ aliases: e.aliases, name: e.name })),
    state: publicState(),
    prefs: store.get('prefs', {}),
    favorites: store.get('favorites', []),
    history: store.get('history', []),
    searchWords: store.get('searchWords', []),
    blocked: store.get('blocked', []),
    version: app.getVersion(),
  }));

  /** 一次性打开一组视图并切到分屏（NBA 一键看球 / 聚合页用） */
  ipcMain.handle('views:openSet', (_e, payload) => openViewSet(payload));

  ipcMain.handle('nav:go', (_e, p) => {
    navigate(p.id, p.url);
    return true;
  });

  ipcMain.handle('nav:search', (_e, { keyword, scope, platforms }) => {
    if (!keyword || !keyword.trim()) return false;
    const kw = keyword.trim();

    const words = store.get('searchWords', []).filter((w) => w !== kw);
    words.unshift(kw);
    const trimmed = words.slice(0, 12);
    store.set('searchWords', trimmed);
    send('searchWords:changed', trimmed);

    // 「全平台」搜索 = 当前聚合分屏包含的平台（最多 4 列，避免每列过窄看不清）
    const splitTargets = (platforms && platforms.length ? platforms : state.splitList)
      .filter((id) => PLATFORM_MAP[id])
      .slice(0, 4);
    const targets =
      scope === 'all'
        ? splitTargets.length
          ? splitTargets
          : DEFAULT_SPLIT.slice()
        : platforms && platforms.length
          ? platforms
          : [state.active];

    if (scope === 'all') {
      state.mode = 'split';
      state.splitList = targets;
      state.active = targets[0];
      targets.forEach((id) => {
        const fn = searchUrlOf(PLATFORM_MAP[id]);
        if (fn) loadUrl(id, fn(kw));
      });
      layout();
      send('state:changed', publicState());
    } else {
      const target = targets[0];
      const fn = searchUrlOf(PLATFORM_MAP[target]);
      if (fn) navigate(target, fn(kw));
      else toast(`「${PLATFORM_MAP[target] ? PLATFORM_MAP[target].name : target}」未配置搜索地址，已跳过`);
    }
    return true;
  });

  const nav = (fn) => (_e, id) => {
    const wc = getView(id || state.active).webContents;
    fn(wc);
  };
  ipcMain.handle('view:back', nav((wc) => {
    if (wc.navigationHistory && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (wc.canGoBack && wc.canGoBack()) wc.goBack();
  }));
  ipcMain.handle('view:forward', nav((wc) => {
    if (wc.navigationHistory && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (wc.canGoForward && wc.canGoForward()) wc.goForward();
  }));
  ipcMain.handle('view:reload', nav((wc) => wc.reload()));
  ipcMain.handle('view:stop', nav((wc) => wc.stop()));
  ipcMain.handle('view:home', (_e, id) => {
    const target = id || state.active;
    if (PLATFORM_MAP[target]) navigate(target, homeOf(PLATFORM_MAP[target]));
  });

  ipcMain.handle('layout:set', (_e, patch) => {
    if (!patch) return publicState();
    if (patch.mode) state.mode = patch.mode;
    if (patch.active && PLATFORM_MAP[patch.active]) state.active = patch.active;
    if (Array.isArray(patch.splitList)) {
      // 允许清空到只剩一个：至少保留当前焦点列，避免出现无内容的空白窗口
      const list = patch.splitList.filter((id) => PLATFORM_MAP[id]);
      state.splitList = list.length ? list : [state.active];
    }
    if (patch.colRatios && typeof patch.colRatios === 'object') {
      Object.entries(patch.colRatios).forEach(([id, r]) => {
        const n = Number(r);
        if (PLATFORM_MAP[id] && isFinite(n)) state.colRatios[id] = Math.min(8, Math.max(0.25, n));
      });
    }
    if (patch.resetRatios) state.colRatios = {};
    if (patch.lm && typeof patch.lm === 'object') {
      if (patch.lm.mode && ['row', 'grid', 'focus'].includes(patch.lm.mode)) state.lm.mode = patch.lm.mode;
      if (patch.lm.gridCols !== undefined) state.lm.gridCols = Math.round(clampNum(patch.lm.gridCols, 1, 4, 2));
      if (patch.lm.focusRatio !== undefined) state.lm.focusRatio = clampNum(patch.lm.focusRatio, 0.35, 0.85, 0.66);
      // 换布局模板时退出"单列最大化"，否则看不出模板效果
      if (patch.solo === undefined) state.solo = null;
    }
    if (patch.solo !== undefined) {
      state.solo = patch.solo && state.splitList.includes(patch.solo) ? patch.solo : null;
      if (state.solo) {
        state.mode = 'split';
        state.active = state.solo;
      }
    }
    if (patch.audio) state.audio = patch.audio;
    if (typeof patch.collapsed === 'boolean') state.collapsed = patch.collapsed;
    if (typeof patch.sidebarWidth === 'number') state.sidebarWidth = patch.sidebarWidth;
    if (typeof patch.topbarHeight === 'number') state.topbarHeight = patch.topbarHeight;
    layout();
    const next = publicState();
    send('state:changed', next);
    return next;
  });

  /** 关闭聚合页中的某一列（视图会被销毁，释放内存） */
  ipcMain.handle('pane:close', (_e, id) => closePane(id));

  /**
   * 界面出现弹窗 / 下拉菜单时置 true：临时摘掉所有原生视图，
   * 让 HTML 遮罩与弹窗可见可点；关闭后置 false 恢复。
   */
  ipcMain.handle('overlay:set', (_e, on) => {
    const next = !!on;
    if (state.overlay === next) return state.overlay;
    state.overlay = next;
    layout();
    return state.overlay;
  });

  /** 单列最大化 / 还原（不销毁其他列，退出后原样恢复） */
  ipcMain.handle('pane:solo', (_e, id) => {
    state.solo = id && id !== state.solo && state.splitList.includes(id) ? id : null;
    if (state.solo) {
      state.mode = 'split';
      state.active = state.solo;
    }
    layout();
    const next = publicState();
    send('state:changed', next);
    return next;
  });

  /** 调整列顺序：把 id 前移/后移一位，或拖到指定位置 */
  ipcMain.handle('pane:move', (_e, payload) => {
    const { id, delta, toIndex } = payload || {};
    const list = state.splitList.slice();
    const from = list.indexOf(id);
    if (from < 0) return publicState();
    let to = typeof toIndex === 'number' ? Math.round(toIndex) : from + (Number(delta) || 0);
    to = Math.min(list.length - 1, Math.max(0, to));
    if (to === from) return publicState();
    list.splice(from, 1);
    list.splice(to, 0, id);
    state.splitList = list;
    layout();
    const next = publicState();
    send('state:changed', next);
    return next;
  });

  /** 截图当前视图并保存到下载目录 */
  ipcMain.handle('view:shot', async (_e, id) => {
    const target = id && PLATFORM_MAP[id] ? id : state.active;
    const v = views.get(target);
    if (!v) {
      toast('该页面尚未加载，无法截图');
      return null;
    }
    try {
      const img = await v.webContents.capturePage();
      const dir = app.getPath('downloads');
      const name = String(v.webContents.getTitle() || PLATFORM_MAP[target].name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
      const ts = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const file = path.join(
        dir,
        `VideoHub_${name}_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`
      );
      fs.writeFileSync(file, img.toPNG());
      shell.showItemInFolder(file);
      toast('截图已保存到下载目录');
      return file;
    } catch (e) {
      toast('截图失败：' + e.message);
      return null;
    }
  });

  /** 刷新聚合页里的所有列 */
  ipcMain.handle('view:reloadAll', () => {
    viewTargets().forEach((id) => {
      const v = views.get(id);
      if (v) v.webContents.reload();
    });
    return true;
  });

  /* ---------------- 自定义视频源 ---------------- */

  const saveSources = (list) => {
    store.set('sources', list);
    store.save();
    rebuildPlatforms();
    send('sources:changed', {
      sources: store.get('sources', []),
      platforms: publicPlatforms(),
      removed: store.get('removed', []),
    });
  };

  ipcMain.handle('source:list', () => store.get('sources', []));

  // 一键静音：静默所有视图（含已摘下 / 后台运行的）
  ipcMain.handle('view:muteAll', () => {
    for (const v of views.values()) {
      try {
        if (v.webContents && !v.webContents.isDestroyed()) v.webContents.setAudioMuted(true);
      } catch (e) {
        /* ignore */
      }
    }
    return true;
  });

  // 无水印下载：扫描页面直链视频 / 图片
  ipcMain.handle('media:list', async (_e, id) => {
    const v = views.get(id || state.active);
    if (!v) return { ok: false, error: '视图未就绪' };
    try {
      const code =
        "(function(){ try { " +
        "var vids = Array.prototype.slice.call(document.querySelectorAll('video')).map(function(v){return {src:(v.currentSrc||v.src||''),w:v.videoWidth|0,h:v.videoHeight|0};}).filter(function(x){return x.src.slice(0,4)==='http';}); " +
        "var imgs = Array.prototype.slice.call(document.querySelectorAll('img')).map(function(i){return {src:(i.currentSrc||i.src||''),w:i.naturalWidth|0,h:i.naturalHeight|0};}).filter(function(x){return x.src.slice(0,4)==='http';}); " +
        "return JSON.stringify({videos:vids, images:imgs}); " +
        "} catch(e){ return JSON.stringify({videos:[],images:[],error:String(e)}); } })()";
      const raw = await v.webContents.executeJavaScript(code, true);
      const data = JSON.parse(raw);
      return { ok: true, videos: data.videos || [], images: data.images || [] };
    } catch (e) {
      return { ok: false, error: '提取失败：' + e.message };
    }
  });

  // 无水印下载：直接下载直链媒体（绕过平台叠加的水印层，得到干净文件）
  ipcMain.handle('media:download', async (_e, payload) => {
    const id = payload && payload.id;
    const url = payload && payload.url;
    const kind = payload && payload.kind;
    if (!url || !/^https?:/i.test(url)) {
      return { ok: false, error: '没有可用于下载的直链（可能是加密分片流或防盗链）' };
    }
    const v = views.get(id || state.active);
    if (!v) return { ok: false, error: '视图未就绪' };
    const p = PLATFORM_MAP[id || state.active];
    const base = (p && p.shortName ? p.shortName : 'VideoHub').replace(/[\\/:*?"<>|]/g, '_');
    const m = url.split('?')[0].split('#')[0].match(/\.(mp4|webm|mkv|mov|m4v|jpg|jpeg|png|gif|webp|avif|bmp)(?:[?#]|$)/i);
    const ext = (m && m[1]) ? m[1] : (kind === 'image' ? 'jpg' : 'mp4');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = (base + '_' + ts + '.' + ext).slice(0, 120);
    forcedDownloadName = name;
    // 兜底：若下载未被 will-download 消费（如被防盗链拦截），避免误拦截后续下载
    const token = name;
    setTimeout(() => { if (forcedDownloadName === token) forcedDownloadName = null; }, 10000);
    try {
      v.webContents.downloadURL(url);
    } catch (e) {
      forcedDownloadName = null;
      return { ok: false, error: '下载发起失败：' + e.message };
    }
    return { ok: true, name };
  });

  /** AI 智能识别：抓首页 HTML，推断名称/主色/搜索地址/分类 */
  ipcMain.handle('source:detect', async (_e, url) => {
    try {
      return await detectSource(url);
    } catch (e) {
      return { ok: false, error: '识别失败：' + e.message };
    }
  });

  ipcMain.handle('source:add', (_e, input) => {
    const res = normalizeSource(input);
    if (!res.ok) return { ok: false, error: res.error };
    const list = store.get('sources', []).filter((s) => s.id !== res.source.id);
    if (list.some((s) => s.home === res.source.home)) {
      return { ok: false, error: '该地址已经添加过了' };
    }
    // 避免把已内置的平台再手动添加一遍（会产生重复平台）
    const dupBuiltin = BUILTIN_PLATFORMS.find(
      (b) => b.home === res.source.home || (b.hosts || []).some((h) => res.source.hosts.includes(h))
    );
    if (dupBuiltin) {
      return { ok: false, error: `「${dupBuiltin.name}」已在侧栏内置，无需重复添加` };
    }
    list.push(res.source);
    saveSources(list);
    layout();
    send('state:changed', publicState());
    toast(`已添加视频源「${res.source.name}」`);
    return { ok: true, source: res.source, sources: list, platforms: publicPlatforms() };
  });

  /** 按名称自动索引：输入站点名，直接返回首页/搜索/分类等配置 */
  ipcMain.handle('source:indexByName', (_e, name) => {
    try {
      return indexSourceByName(name);
    } catch (e) {
      return { ok: false, error: '索引失败：' + e.message };
    }
  });

  ipcMain.handle('source:remove', (_e, id) => {
    const all = store.get('sources', []);
    const hit = all.find((s) => s.id === id);
    const list = all.filter((s) => s.id !== id);
    // 软删除：保留完整视频源对象，移入「已删除（可找回）」列表
    let removedList = (store.get('removed', []) || []).filter((s) => s.id !== id);
    if (hit) removedList.unshift(hit);
    store.set('removed', removedList);
    store.save();
    if (state.splitList.includes(id)) {
      state.splitList = state.splitList.filter((x) => x !== id);
      if (!PLATFORM_MAP[state.active]) state.active = PLATFORMS[0] ? PLATFORMS[0].id : 'bilibili';
    }
    saveSources(list);
    destroyView(id);
    layout();
    send('state:changed', publicState());
    return { ok: true, sources: list, platforms: publicPlatforms(), removed: removedList };
  });

  ipcMain.handle('source:restore', (_e, id) => {
    const removed = store.get('removed', []) || [];
    const hit = removed.find((s) => s.id === id);
    if (!hit) return { ok: false, error: '未找到可找回的视频源' };
    const removedList = removed.filter((s) => s.id !== id);
    store.set('removed', removedList);
    const list = store.get('sources', []).filter((s) => s.id !== id).concat([hit]);
    store.save();
    saveSources(list);
    layout();
    send('state:changed', publicState());
    return { ok: true, sources: list, platforms: publicPlatforms(), removed: removedList };
  });

  ipcMain.handle('source:purge', (_e, id) => {
    const removedList = (store.get('removed', []) || []).filter((s) => s.id !== id);
    store.set('removed', removedList);
    store.save();
    return { ok: true, removed: removedList };
  });

  ipcMain.handle('source:removed', () => store.get('removed', []) || []);

  ipcMain.handle('source:sort', (_e, ids) => {
    const list = store.get('sources', []);
    const byId = Object.fromEntries(list.map((s) => [s.id, s]));
    const next = (Array.isArray(ids) ? ids : []).map((i) => byId[i]).filter(Boolean);
    list.forEach((s) => {
      if (!next.includes(s)) next.push(s);
    });
    saveSources(next);
    send('state:changed', publicState());
    return { ok: true, sources: next, platforms: publicPlatforms() };
  });

  /** 偏好设置（主题 / 布局记忆等），整体存在 store.prefs */
  ipcMain.handle('pref:set', (_e, patch) => {
    const prefs = Object.assign({}, store.get('prefs', {}), patch || {});
    store.set('prefs', prefs);
    if (patch && patch.theme) {
      windowBg = patch.theme === 'dark' ? BG_DARK : BG_LIGHT;
      if (win && !win.isDestroyed()) win.setBackgroundColor(windowBg);
    }
    if (patch && patch.guestMode !== undefined) {
      GUEST = !!patch.guestMode;
      // 重新回到各视图首页，让免登录（游客）端点立即生效
      const ids = state.mode === 'split' ? state.splitList.slice() : [state.active];
      ids.forEach((id) => {
        const p = PLATFORM_MAP[id];
        if (p) loadUrl(id, homeOf(p));
      });
      layout();
    }
    return prefs;
  });

  ipcMain.handle('fav:add', (_e, item) => {
    const list = store.get('favorites', []);
    if (item && item.url && !list.some((f) => f.url === item.url)) {
      list.unshift({ id: uid('f'), ts: Date.now(), ...item });
      store.set('favorites', list.slice(0, 500));
    }
    send('favorites:changed', store.get('favorites', []));
    return store.get('favorites', []);
  });

  ipcMain.handle('fav:remove', (_e, id) => {
    store.set('favorites', store.get('favorites', []).filter((f) => f.id !== id));
    send('favorites:changed', store.get('favorites', []));
    return store.get('favorites', []);
  });

  ipcMain.handle('fav:current', () => {
    const id = state.active;
    const v = views.get(id);
    if (!v) return false;
    const url = v.webContents.getURL();
    if (!url || url === 'about:blank') return false;
    const list = store.get('favorites', []);
    if (!list.some((f) => f.url === url)) {
      list.unshift({ id: uid('f'), platform: id, title: v.webContents.getTitle() || url, url, ts: Date.now() });
      store.set('favorites', list.slice(0, 500));
      send('favorites:changed', store.get('favorites', []));
      return true;
    }
    return false;
  });

  ipcMain.handle('history:clear', () => {
    store.set('history', []);
    send('history:changed', []);
    return [];
  });

  ipcMain.handle('history:remove', (_e, url) => {
    store.set('history', store.get('history', []).filter((h) => h.url !== url));
    send('history:changed', store.get('history', []));
    return store.get('history', []);
  });

  ipcMain.handle('mini:open', (_e, url) => {
    openMiniPlayer(url);
    return true;
  });

  /** 摸鱼面板展开/收起：把内容视图下移，避免 HTML 面板被原生视频视图盖住 */
  ipcMain.handle('mini:overlay', (_e, h) => {
    miniOverlayH = Math.max(0, Number(h) || 0);
    layoutMiniView();
    return miniOverlayH;
  });

  /** 小窗「上班摸鱼」偏好：透明度 / 任务栏隐身 / 置顶。不传 patch 表示只读取当前值 */
  ipcMain.handle('mini:pref', (_e, patch) => {
    const prefs = store.get('prefs', {}) || {};
    let mini = Object.assign({ opacity: 1, hideTaskbar: false, alwaysTop: true }, prefs.mini || {});
    if (patch && typeof patch === 'object') {
      if (typeof patch.opacity === 'number') mini.opacity = Math.min(1, Math.max(0.15, patch.opacity));
      if (typeof patch.hideTaskbar === 'boolean') mini.hideTaskbar = patch.hideTaskbar;
      if (typeof patch.alwaysTop === 'boolean') mini.alwaysTop = patch.alwaysTop;
      prefs.mini = mini;
      store.set('prefs', prefs);
      store.save();
      applyMiniPrefs();
    }
    return mini;
  });

  /** 老板键：一键把所有窗口藏起来并静音，再按一次原样恢复 */
  ipcMain.handle('boss:toggle', () => toggleBossKey());
  ipcMain.handle('boss:state', () => ({ hidden: bossHidden, shortcut: BOSS_KEY }));

  ipcMain.handle('win:action', (_e, action) => {
    if (!win) return;
    if (action === 'min') win.minimize();
    else if (action === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
    else if (action === 'top') win.setAlwaysOnTop(!win.isAlwaysOnTop());
  });

  ipcMain.handle('win:miniAction', (_e, action) => {
    if (!miniWin) return;
    if (action === 'close') miniWin.close();
    else if (action === 'top') {
      const next = !miniWin.isAlwaysOnTop();
      miniWin.setAlwaysOnTop(next);
      // 记住本次选择，下次开小窗沿用
      try {
        const prefs = store.get('prefs', {}) || {};
        prefs.mini = Object.assign({}, prefs.mini || {}, { alwaysTop: next });
        store.set('prefs', prefs);
        store.save();
      } catch (e) {
        /* ignore */
      }
    }
    else if (miniView) {
      const wc = miniView.webContents;
      if (action === 'back') {
        if (wc.navigationHistory && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
        else if (wc.canGoBack && wc.canGoBack()) wc.goBack();
      } else if (action === 'reload') wc.reload();
    }
  });

  ipcMain.handle('open:external', (_e, url) => {
    openExternalSafe(url);
  });

  // 内置错误页按钮（来自 view-preload）
  ipcMain.on('vh:retry', (_e, id) => {
    const target = id && PLATFORM_MAP[id] ? id : state.active;
    loadUrl(target, lastUrl.get(target) || PLATFORM_MAP[target].home);
  });
  ipcMain.on('vh:home', (_e, id) => {
    const target = id && PLATFORM_MAP[id] ? id : state.active;
    loadUrl(target, PLATFORM_MAP[target].home);
  });
  ipcMain.on('vh:openExternal', (_e, url) => {
    openExternalSafe(url);
  });

  // 页面侧（view-preload）在捕获阶段拦下的自定义协议链接
  ipcMain.on('vh:blockedProtocol', (e, payload) => {
    const item = payload && typeof payload === 'object' ? payload : { url: String(payload || ''), via: 'page' };
    if (!isExternalProtocol(item.url)) return;
    let from = '';
    try {
      from = e.sender.getURL();
    } catch (err) {
      /* ignore */
    }
    noteBlocked(item.url, from, item.via || 'page');
  });

  ipcMain.handle('app:clearBrowsingData', async () => {
    const ses = session.fromPartition('persist:videohub');
    await ses.clearStorageData();
    await ses.clearCache();
    store.set('history', []);
    send('history:changed', []);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* 冒烟自检（--smoke）：截图 UI 后自动退出                              */
/* ------------------------------------------------------------------ */

async function runSmoke() {
  // 源码运行时把报告写进项目的 tools/；打包后 __dirname 在安装目录里（可能只读），
  // 统一改写到临时目录，保证任何环境下都拿得到自检产物
  const outDir = app.isPackaged
    ? path.join(app.getPath('temp'), 'videohub-smoke-shots')
    : path.join(__dirname, '..', '..', 'tools');
  fs.mkdirSync(outDir, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // 管道下 stdout 是异步写入的，进程退出时末尾几行常被吞掉；
  // 因此断言同时落盘到 tools/smoke-report.txt，便于事后核对
  const reportFile = path.join(outDir, 'smoke-report.txt');
  try {
    fs.writeFileSync(reportFile, 'VideoHub 冒烟自检 · ' + new Date().toLocaleString('zh-CN') + '\n');
  } catch (e) {
    /* ignore */
  }
  const log = (line) => {
    console.log(line);
    try {
      fs.appendFileSync(reportFile, line + '\n');
    } catch (e) {
      /* ignore */
    }
  };
  log('SMOKE_OUTDIR ' + outDir);
  try {
    // 每次都从干净状态开始：不受上次退出时保存的布局 / 自定义源影响（冒烟目录是复用的）
    store.set('layout', {});
    store.set('sources', []);
    store.set('blocked', []); // 每次都从空记录开始，避免命中去重逻辑导致断言不稳定
    rebuildPlatforms();
    state.mode = 'single';
    state.active = DEFAULT_SPLIT[0];
    state.splitList = DEFAULT_SPLIT.slice();
    state.colRatios = {};
    state.audio = 'focus';
    layout();

    await wait(1500);
    fs.writeFileSync(path.join(outDir, 'smoke-single.png'), (await win.capturePage()).toPNG());

    // 切到聚合分屏，确保三个视图都被创建
    state.mode = 'split';
    layout();
    send('state:changed', publicState());
    await wait(2500);

    // 逐个视图截图（窗口截图不包含 WebContentsView 子视图）
    for (const [id, v] of views) {
      try {
        const img = await v.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, `smoke-view-${id}.png`), img.toPNG());
      } catch (e) {
        log('SMOKE_VIEW_FAIL ' + id + ' ' + e.message);
      }
    }

    const diag = Array.from(views.entries()).map(([id, v]) => {
      const vs = viewStates.get(id) || {};
      return { id, url: v.webContents.getURL(), title: v.webContents.getTitle(), errorPage: !!vs.showingError };
    });
    log('SMOKE_DIAG ' + JSON.stringify(diag));

    fs.writeFileSync(path.join(outDir, 'smoke-split.png'), (await win.capturePage()).toPNG());
    log('SMOKE_ATTACH_SPLIT ' + JSON.stringify(Array.from(attachedIds)));

    // 验证「NBA 一键看球」：四分屏打开 央视 / 腾讯 / 抖音 / B站
    openViewSet({ items: NBA_SPLIT, mode: 'split' });
    await wait(2500);
    log('SMOKE_NBA_ATTACH ' + JSON.stringify(Array.from(attachedIds)));
    const nbaViews = NBA_SPLIT.map((it) => {
      const v = views.get(it.id);
      return { id: it.id, url: v ? v.webContents.getURL() : '' };
    });
    log('SMOKE_NBA_DIAG ' + JSON.stringify(nbaViews));
    fs.writeFileSync(path.join(outDir, 'smoke-nba.png'), (await win.capturePage()).toPNG());

    // 单独截取 NBA 各列视图（窗口截图看不到子视图内容）
    for (const it of NBA_SPLIT) {
      const v = views.get(it.id);
      if (!v) continue;
      try {
        const img = await v.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, `smoke-nba-${it.id}.png`), img.toPNG());
      } catch (e) {
        log('SMOKE_NBA_VIEW_FAIL ' + it.id + ' ' + e.message);
      }
    }

    // 验证「站内链接不再新开窗口」：在视图里触发 window.open，窗口总数应保持不变，且当前视图被导航
    const bv = views.get('bilibili');
    const before = BrowserWindow.getAllWindows().length;
    if (bv) {
      try {
        await bv.webContents.executeJavaScript(
          "window.open('https://www.bilibili.com/v/popular/all', '_blank'); true"
        );
      } catch (e) {
        /* ignore */
      }
      await wait(1800);
    }
    const after = BrowserWindow.getAllWindows().length;
    log(
      'SMOKE_POPUP windows_before=' +
        before +
        ' windows_after=' +
        after +
        ' view_url=' +
        (bv ? bv.webContents.getURL() : 'n/a')
    );

    // ---- 2.0.1 修复项 1：自定义协议不再被丢给系统（"需要新应用打开此xxx"弹窗） ----
    log('SMOKE_PROTOCOL_BLOCKED ' + (openExternalSafe('bitbrowser://open?id=1') === false));
    if (bv) {
      const u0 = bv.webContents.getURL();
      const w0 = BrowserWindow.getAllWindows().length;
      try {
        await bv.webContents.executeJavaScript("window.open('bitbrowser://open?id=1','_blank'); true");
      } catch (e) {
        /* ignore */
      }
      await wait(700);
      log(
        'SMOKE_PROTOCOL_VIEW url_unchanged=' +
          (bv.webContents.getURL() === u0) +
          ' windows=' +
          w0 +
          '->' +
          BrowserWindow.getAllWindows().length
      );
    }

    // ---- 2.0.2：页面里点击 <a href="bitbrowser://…"> 必须被页面侧拦掉 ----
    if (bv) {
      const u1 = bv.webContents.getURL();
      const before = store.get('blocked', []).length;
      try {
        await bv.webContents.executeJavaScript(
          "var a=document.createElement('a');a.href='bitbrowser://open?id=9';a.textContent='x';" +
            "a.setAttribute('target','_blank');document.body.appendChild(a);a.click();true"
        );
      } catch (e) {
        /* ignore */
      }
      await wait(900);
      const blocked = store.get('blocked', []);
      const hit = blocked.find((x) => x.scheme === 'bitbrowser');
      log(
        'SMOKE_PROTOCOL_CLICK url_unchanged=' + (bv.webContents.getURL() === u1) +
          ' windows=' + BrowserWindow.getAllWindows().length +
          ' recorded=' + !!hit +
          ' count=' + before + '->' + blocked.length +
          ' last=' + JSON.stringify(hit ? { scheme: hit.scheme, from: hit.from, via: hit.via } : null)
      );
    }

    // ---- 2.0.1 修复项 3：聚合布局方式（横排 / 网格 / 主次 + 最大化 + 换序） ----
    const rectStr = () => paneRects().panes.map((p) => p.id + ':' + p.width + 'x' + p.height + '@' + p.x + ',' + p.y).join(' ');
    state.mode = 'split';
    state.splitList = ['douyin', 'bilibili', 'kuaishou', 'cctv'];
    state.solo = null;
    state.lm.mode = 'grid';
    state.lm.gridCols = 2;
    layout();
    await wait(900);
    log('SMOKE_LM_GRID ' + rectStr());
    state.lm.mode = 'focus';
    layout();
    await wait(600);
    log('SMOKE_LM_FOCUS ' + rectStr());
    state.lm.mode = 'row';
    state.colRatios = { douyin: 1, bilibili: 2, kuaishou: 1, cctv: 1 };
    layout();
    await wait(400);
    log('SMOKE_LM_ROW ' + rectStr());

    // 单列最大化：只留一列，其余视图摘掉但不销毁
    state.solo = 'bilibili';
    layout();
    await wait(500);
    log('SMOKE_SOLO panes=' + JSON.stringify(paneRects().panes.map((p) => p.id)) + ' attached=' + JSON.stringify(Array.from(attachedIds)));
    state.solo = null;
    layout();
    await wait(400);
    log('SMOKE_SOLO_RESTORE attached=' + JSON.stringify(Array.from(attachedIds)));

    // 列换序（把 cctv 从第 4 位移到第 2 位）
    {
      const list = state.splitList.slice();
      const from = list.indexOf('cctv');
      list.splice(from, 1);
      list.splice(1, 0, 'cctv');
      state.splitList = list;
      layout();
      log('SMOKE_REORDER ' + JSON.stringify(state.splitList));
    }

    // ---- 2.0.1 修复项 2：弹窗遮罩期间原生视图必须摘掉，否则弹窗被网页挡住 ----
    {
      const before = attachedIds.size;
      state.overlay = true;
      layout();
      await wait(300);
      const during = attachedIds.size;
      state.overlay = false;
      layout();
      await wait(500);
      log(
        'SMOKE_OVERLAY before=' + before + ' during=' + during + ' after=' + attachedIds.size +
          ' ok=' + (before > 0 && during === 0 && attachedIds.size === before)
      );
    }

    // ---- 2.0：自定义视频源 + 聚合页增删列 + 列宽调整 ----
    const norm = normalizeSource({
      home: 'https://www.zhihu.com/',
      name: '知乎',
      searchTemplate: 'https://www.zhihu.com/search?q={q}',
      categories: [{ name: '首页', url: 'https://www.zhihu.com/' }],
    });
    if (norm.ok) {
      store.set('sources', store.get('sources', []).concat([norm.source]));
      store.save();
      rebuildPlatforms();
    }
    const srcId = norm.ok ? norm.source.id : '';
    log('SMOKE_SOURCE_ADD ok=' + norm.ok + ' id=' + srcId + ' platforms=' + PLATFORMS.length);

    state.mode = 'split';
    state.splitList = ['douyin', srcId].filter(Boolean);
    state.colRatios = { [srcId]: 2 };
    layout();
    await wait(1200);
    const panes = paneWidths();
    log('SMOKE_PANES ' + JSON.stringify(panes));
    const wDouyin = panes.panes.find((x) => x.id === 'douyin');
    const wSrc = panes.panes.find((x) => x.id === srcId);
    log(
      'SMOKE_WIDTH douyin=' + (wDouyin && wDouyin.width) + ' custom=' + (wSrc && wSrc.width) +
        ' ratio_ok=' + !!(wDouyin && wSrc && wSrc.width > wDouyin.width * 1.6)
    );

    // 关闭自定义源那一列
    const afterClose = closePane(srcId);
    await wait(600);
    log(
      'SMOKE_PANE_CLOSE list=' + JSON.stringify(afterClose.splitList) +
        ' attached=' + JSON.stringify(Array.from(attachedIds)) +
        ' views_has_src=' + views.has(srcId)
    );

    // 删除自定义源后应自动从注册表与分屏列表清除
    store.set('sources', []);
    store.save();
    rebuildPlatforms();
    log('SMOKE_SOURCE_REMOVE platforms=' + PLATFORMS.length + ' splitList=' + JSON.stringify(state.splitList));

    // 回到单平台模式，验证视图摘挂逻辑
    state.mode = 'single';
    state.active = 'douyin';
    layout();
    await wait(800);
    log('SMOKE_ATTACH_SINGLE ' + JSON.stringify(Array.from(attachedIds)) + ' active=' + state.active);

    // 界面自检：点真实的「＋ 添加视频源」按钮，验证弹窗真的能点开（修复项 2）
    try {
      state.mode = 'split';
      state.splitList = DEFAULT_SPLIT.slice();
      state.lm.mode = 'row';
      layout();
      await wait(600);
      const attachedBeforeModal = attachedIds.size;

      // 收集点击过程中的界面异常，避免"点了没反应"却查不到原因
      await win.webContents.executeJavaScript(
        "window.__vhErrs=[];window.addEventListener('error',function(e){window.__vhErrs.push(String(e.message))});true"
      );
      await win.webContents.executeJavaScript(
        "document.getElementById('btn-add-source').click(); true"
      );
      await wait(700);
      log(
        'SMOKE_UI_ERRS ' +
          (await win.webContents.executeJavaScript(
            "JSON.stringify({errs: window.__vhErrs, apiOk: typeof api.overlaySet, bodyCls: document.body.className})"
          ))
      );
      const modalProbe = await win.webContents.executeJavaScript(
        "JSON.stringify({modalShown: !document.getElementById('src-modal').classList.contains('hidden')})"
      );
      log(
        'SMOKE_UI_MODAL ' + modalProbe + ' overlay=' + state.overlay +
          ' attached=' + attachedBeforeModal + '->' + attachedIds.size +
          ' ok=' + (attachedIds.size === 0)
      );

      // 点「取消」关掉弹窗，视图应当恢复
      await win.webContents.executeJavaScript("document.getElementById('src-cancel').click(); true");
      await wait(700);
      log('SMOKE_UI_MODAL_CLOSE overlay=' + state.overlay + ' attached=' + attachedIds.size);

      // 深色模式 + 网格布局各截一张；--disable-gpu 下只改 CSS 不会重绘，
      // 所以顺手切一次布局模板强制重排，截图才不会拿到上一帧
      await win.webContents.executeJavaScript("document.body.classList.add('dark');true");
      state.splitList = ['douyin', 'bilibili', 'kuaishou', 'cctv'];
      state.lm.mode = 'grid';
      state.lm.gridCols = 2;
      layout();
      send('state:changed', publicState());
      await wait(1200);
      fs.writeFileSync(path.join(outDir, 'smoke-dark-grid.png'), (await win.capturePage()).toPNG());
      const themeProbe = await win.webContents.executeJavaScript(
        "JSON.stringify({cls: document.body.className, " +
          "sidebar: getComputedStyle(document.getElementById('sidebar')).backgroundColor, " +
          "topbar: getComputedStyle(document.getElementById('topbar')).backgroundColor})"
      );
      log('SMOKE_UI_DARK ' + themeProbe);

      state.lm.mode = 'row';
      state.splitList = DEFAULT_SPLIT.slice();
      state.colRatios = {};
      layout();
      send('state:changed', publicState());
      await wait(700);
      fs.writeFileSync(path.join(outDir, 'smoke-split-row.png'), (await win.capturePage()).toPNG());
      log('SMOKE_UI_ROW_SHOT ok');

      // 最后再开一次视频源弹窗截图（此时画面最稳定，避免拿到上一帧）
      await win.webContents.executeJavaScript(
        "document.body.classList.remove('dark');" +
          "document.getElementById('src-url').value='https://www.example.com';" +
          "document.getElementById('src-name').value='示例站点';" +
          "document.getElementById('src-home').value='https://www.example.com';" +
          "document.getElementById('src-search').value='https://www.example.com/search?q={q}';" +
          "var n=document.getElementById('src-notes');n.classList.remove('hidden');" +
          "n.innerHTML='<div class=\"src-note\">· 名称：取自页面标题「示例站点」</div>" +
          "<div class=\"src-note\">· 主色：取自 theme-color #7C3AED</div>" +
          "<div class=\"src-note\">· 搜索：试探命中常用形式 /search?q={q}</div>';" +
          "document.getElementById('btn-add-source').click();true"
      );
      // 微调窗口尺寸会强制整窗重新合成，比单纯等待更能拿到新鲜帧
      const [cw0, ch0] = win.getContentSize();
      win.setContentSize(cw0, ch0 - 1);
      await wait(500);
      win.setContentSize(cw0, ch0);
      await wait(1200);
      fs.writeFileSync(path.join(outDir, 'smoke-source-modal.png'), (await win.capturePage()).toPNG());
      log('SMOKE_UI_MODAL_SHOT modalOpen=' + state.overlay + ' size=' + cw0 + 'x' + ch0);
    } catch (e) {
      log('SMOKE_UI_FAIL ' + e.message);
    }

    log('SMOKE_OK');
  } catch (e) {
    log('SMOKE_FAIL ' + e.message);
  }
  // 管道下 stdout 写入是异步的，稍等一会儿再退出，避免末尾日志被截断
  await wait(500);
  app.quit(0);
}

/* ------------------------------------------------------------------ */
/* 生命周期                                                            */
/* ------------------------------------------------------------------ */

/**
 * 兜底守卫：任何 webContents 都装上。
 * 视图 / 迷你窗在创建时会把 window-open 处理器覆盖成更精细的版本，
 * 这里主要防止以后新增视图时漏配，以及界面自身被注入外链的情况。
 */
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalProtocol(url)) {
      let from = '';
      try {
        from = contents.getURL();
      } catch (err) {
        /* ignore */
      }
      noteBlocked(url, from, 'window-open');
    }
    return { action: 'deny' };
  });
  guardExternalProtocol(contents, 'global');
});

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    const iconFile = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    if (fs.existsSync(iconFile)) iconPath = iconFile;

    if (store.get('prefs', {}).theme === 'dark') windowBg = BG_DARK;
    GUEST = !!store.get('prefs', {}).guestMode;

    const ses = session.fromPartition('persist:videohub');
    ses.setUserAgent(UA);
    ses.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(['media', 'mediaKeySystem', 'clipboard-read', 'notifications', 'fullscreen', 'openExternal'].includes(permission));
    });

    registerIpc();

    // 注册老板键（摸鱼必备）：注册失败只告警不崩溃，避免与他人热键冲突导致起不来
    try {
      const ok = globalShortcut.register(BOSS_KEY, () => toggleBossKey());
      if (!ok) console.warn('[VideoHub] 老板键注册失败：' + BOSS_KEY);
    } catch (e) {
      console.warn('[VideoHub] 老板键注册异常：' + (e && e.message));
    }

    const saved = store.get('lastPlatform', null);
    if (saved && PLATFORM_MAP[saved]) state.active = saved;

    // 恢复上次退出的聚合布局（含列宽），下次打开还是熟悉的排布
    const savedLayout = store.get('layout', null);
    if (savedLayout) {
      if (savedLayout.mode) state.mode = savedLayout.mode;
      if (Array.isArray(savedLayout.splitList) && savedLayout.splitList.length) {
        const list = savedLayout.splitList.filter((id) => PLATFORM_MAP[id]);
        if (list.length) state.splitList = list;
      }
      if (savedLayout.colRatios && typeof savedLayout.colRatios === 'object') state.colRatios = savedLayout.colRatios;
      if (savedLayout.lm && typeof savedLayout.lm === 'object') {
        Object.assign(state.lm, {
          mode: ['row', 'grid', 'focus'].includes(savedLayout.lm.mode) ? savedLayout.lm.mode : state.lm.mode,
          gridCols: Math.round(clampNum(savedLayout.lm.gridCols, 1, 4, state.lm.gridCols)),
          focusRatio: clampNum(savedLayout.lm.focusRatio, 0.35, 0.85, state.lm.focusRatio),
        });
      }
      if (savedLayout.audio) state.audio = savedLayout.audio;
      if (typeof savedLayout.collapsed === 'boolean') state.collapsed = savedLayout.collapsed;
    }
    if (!state.splitList.length) state.splitList = [state.active];

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  store.set('lastPlatform', state.active);
  store.set('layout', {
    mode: state.mode,
    active: state.active,
    splitList: state.splitList,
    colRatios: state.colRatios,
    lm: state.lm, // 布局模板（横排/网格/主次）也跟着记住
    audio: state.audio,
    collapsed: state.collapsed,
  });
  store.save();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 退出前释放全局快捷键，避免残留占用让系统层面的热键失效
app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (e) {
    /* ignore */
  }
});
