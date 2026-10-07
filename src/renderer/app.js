/* VideoHub 渲染进程：界面与交互（2.0）
 * 2.0 新增：聚合页自选页面 / 列宽拖拽 / 单列关闭、
 *          自定义视频源（AI 智能识别）、深色模式、截图、分屏声音策略。
 */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const ICONS = {
    bilibili:
      '<svg viewBox="0 0 24 24"><path d="M6.8 3.2 9.2 6M17.2 3.2 14.8 6"/><rect x="3" y="6" width="18" height="14" rx="4.5"/><path d="M8.8 11.2v3.2M15.2 11.2v3.2"/></svg>',
    douyin:
      '<svg viewBox="0 0 24 24"><path d="M14.2 3v11.4a3.7 3.7 0 1 1-2.5-3.5V6.4"/><path d="M14.2 3c1.4 1.1 3.5 1.7 5.1 1.8-1 1.9-2.9 3-5.1 3.2"/></svg>',
    kuaishou:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.4 13.6c.9 1.4 2.1 2.1 3.6 2.1s2.7-.7 3.6-2.1"/><path d="M9 9.6h.01M15 9.6h.01" stroke-width="2.6"/></svg>',
    cctv:
      '<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M8 3v2.5M16 3v2.5"/><path d="M10.5 10.5v3.6M10.5 12.3h3M13.5 10.5v3.6"/></svg>',
    tencent:
      '<svg viewBox="0 0 24 24"><path d="M12 3.6l7.5 4.2v8.4L12 20.4 4.5 16.2V7.8z"/><path d="M9.4 14.2c.7-.9 1.6-1.4 2.6-1.4s1.9.5 2.6 1.4"/><path d="M9.8 10.4h.01M14.2 10.4h.01" stroke-width="2.4"/></svg>',
    ball: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v17M6 5.6c3.4 3.2 3.4 9.6 0 12.8M18 5.6c-3.4 3.2-3.4 9.6 0 12.8"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13h9l1-13"/></svg>',
    huya: '<svg viewBox="0 0 24 24"><path d="M4 9v6M8 6v12M12 4v16M16 6v12M20 9v6"/></svg>',
    douyu: '<svg viewBox="0 0 24 24"><path d="M5 4h14v12H5zM9 20h6M12 16v4"/><path d="M8 9l3 2-3 2zM16 9l-3 2 3 2z"/></svg>',
    yy: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M9 10v4M15 10v4M9 16h6"/></svg>',
    inke: '<svg viewBox="0 0 24 24"><rect x="5" y="9" width="14" height="9" rx="2"/><path d="M12 9V5M9 5h6"/></svg>',
    muteOff: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3l4-4v13l-4-4H4z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M17.5 7a7 7 0 0 1 0 10"/></svg>',
    muteOn: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3l4-4v13l-4-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>',
    /* 音乐平台图标 */
    migu:
      '<svg viewBox="0 0 24 24"><path d="M9 17.5V5.5l8-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="14.5" cy="15.5" r="2.5"/></svg>',
    kuwo:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M10 15.5V8.5l5-1.2v7"/><circle cx="9" cy="15.5" r="1.8"/></svg>',
    netease:
      '<svg viewBox="0 0 24 24"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13.5" width="4.5" height="6" rx="2"/><rect x="17" y="13.5" width="4.5" height="6" rx="2"/></svg>',
    qqmusic:
      '<svg viewBox="0 0 24 24"><path d="M5 19V9M9.5 19V5M14.5 19v-8M19 19V7"/></svg>',
    sing5:
      '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="10" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
  };

  const SIDEBAR_W = 228;
  const SIDEBAR_W_COLLAPSED = 64;
  const TOPBAR_H = 46;

  const state = {
    platforms: [],
    sources: [],
    nbaSources: [],
    nbaSplit: [],
    mode: 'single',
    active: 'bilibili',
    splitList: [],
    colRatios: {},
    lm: { mode: 'row', gridCols: 2, focusRatio: 0.66 },
    solo: null,
    overlay: false,
    audio: 'focus',
    muted: false,
    lastAudio: 'focus',
    removed: [],
    collapsed: false,
    favorites: [],
    history: [],
    searchWords: [],
    mineTab: 'fav',
    scope: 'current',
    titles: {},
    loading: {},
    panes: { containerWidth: 0, panes: [] },
    blocked: [],
    prefs: {},
    version: '',
  };

  /* ---------------- 通用 ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  const esc = (s) =>
    String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fmtTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return sameDay ? `${hh}:${mm}` : `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  }

  const ratioOf = (id) => {
    const r = Number(state.colRatios[id]);
    return isFinite(r) && r > 0 ? r : 1;
  };
  const sidebarPx = () => (state.collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W);
  const findPlatform = (id) => state.platforms.find((x) => x.id === id);
  const isSplit = () => state.mode === 'split';

  /* ---------------- 原生视图遮罩管理 ----------------
   * WebContentsView 是窗口的原生子视图，永远盖在界面 HTML 之上。
   * 只要界面上出现弹窗或下拉菜单，就必须请主进程临时摘掉原生视图，
   * 否则「添加视频源」这类弹窗会被网页挡住 —— 点了像没反应。
   */
  function setOverlay(on) {
    const next = !!on;
    if (state.overlay === next) return;
    state.overlay = next;
    document.body.classList.toggle('overlay-on', next);
    api.overlaySet(next);
  }
  const noOverlayOpen = () =>
    ['#src-modal', '#set-menu', '#scope-menu', '#suggest'].every((s) => $(s).classList.contains('hidden'));

  /** 按当前浮层的显隐状态，重新决定要不要摘掉原生视图 */
  function syncOverlay() {
    setOverlay(!noOverlayOpen());
  }

  /** 关闭所有浮层并恢复原生视图，作为兜底（点空白处 / Esc） */
  function closeOverlays() {
    ['#set-menu', '#scope-menu', '#suggest'].forEach((s) => $(s).classList.add('hidden'));
    closeSourceModal();
  }

  /** 列头宽度直接复用主进程算好的数值，保证列头与网页视图严格对齐 */
  function paneWidthOf(id) {
    const list = (state.panes && state.panes.panes) || [];
    const f = list.find((x) => x.id === id);
    if (f) return f.width;
    const cw = (state.panes && state.panes.containerWidth) || window.innerWidth - sidebarPx();
    return Math.floor(Math.max(200, cw) / Math.max(1, state.splitList.length));
  }

  /* ---------------- 渲染：平台 / 视频源 ---------------- */
  function renderPlatforms() {
    $('#platform-list').innerHTML = state.platforms
      .map((p, i) => {
        const active = p.id === state.active ? ' active' : '';
        const inSplit = state.splitList.includes(p.id);
        const icon = ICONS[p.id] || esc((p.shortName || p.name).slice(0, 1));
        return `<button class="platform-item${active}" data-id="${p.id}" title="${esc(p.name)}${p.builtin ? '' : '（自定义源）'}">
          <span class="platform-icon" style="background:${p.color}">${icon}</span>
          <span class="platform-name">${esc(p.name)}</span>
          ${p.builtin ? '' : '<span class="src-tag">自定义</span>'}
          <span class="platform-key">${i + 1}</span>
          <span class="split-dot${inSplit ? ' on' : ''}" title="${inSplit ? '已在聚合分屏中' : 'Alt+点击加入分屏'}"></span>
        </button>`;
      })
      .join('');

    $$('.platform-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.id;
        // Alt + 点击 = 把该页面加入/移出聚合分屏
        if (e.altKey) {
          toggleSplitPage(id);
          return;
        }
        state.active = id;
        api.setLayout({ active: id, mode: 'single' });
        renderAll();
      });
    });
  }

  /* ---------------- 渲染：分类 ---------------- */
  function renderCategories() {
    const p = findPlatform(state.active);
    const box = $('#category-list');
    if (!p) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = p.categories
      .map((c) => `<button class="cat-item" data-url="${esc(c.url)}" title="${esc(c.name)}">${esc(c.name)}</button>`)
      .join('');
    $$('.cat-item').forEach((btn) => {
      btn.addEventListener('click', () => api.go({ id: state.active, url: btn.dataset.url }).then(() => {}));
    });
  }

  /* ---------------- 渲染：视图模式 / 列头 ---------------- */
  function renderMode() {
    $('#mode-single').classList.toggle('active', state.mode === 'single');
    $('#mode-split').classList.toggle('active', state.mode === 'split');
    renderPaneHeaders();
    renderPagePicker();
  }

  function renderPaneHeaders() {
    const wrap = $('#pane-headers');
    if (state.mode !== 'split') {
      wrap.classList.add('hidden');
      wrap.innerHTML = '';
      return;
    }
    wrap.classList.remove('hidden');
    // 只有「横排且未最大化」时列头才与网页列严格等宽；网格/主次模式下用等宽标签
    const rowMode = state.lm.mode === 'row' && !state.solo;
    wrap.classList.toggle('compact', !rowMode);

    wrap.innerHTML = state.splitList
      .map((id, i) => {
        const p = findPlatform(id);
        if (!p) return '';
        const active = id === state.active ? ' active' : '';
        const title = state.titles[id] || p.home;
        const style = rowMode ? ` style="width:${paneWidthOf(id)}px"` : '';
        const resizer =
          rowMode && i < state.splitList.length - 1
            ? `<div class="pane-resizer" data-resize="${id}" title="拖动调整这一列的宽度"></div>`
            : '';
        const soloState = state.solo === id ? '还原所有列' : '最大化这一列';
        return `<div class="pane-head${active}" data-id="${id}"${style}>
          <span class="pane-dot" style="background:${p.color}"></span>
          <span class="pane-name" style="color:${p.color}">${esc(p.shortName || p.name)}</span>
          ${rowMode ? `<span class="pane-title">${esc(state.loading[id] ? '加载中…' : title)}</span>` : ''}
          <button class="pane-btn ghost" data-narrow="${id}" title="这一列变窄">−</button>
          <button class="pane-btn ghost" data-wide="${id}" title="这一列加宽">＋</button>
          <button class="pane-btn ghost" data-solo="${id}" title="${soloState}">▢</button>
          <button class="pane-btn danger" data-close="${id}" title="关闭这一列">✕</button>
          ${resizer}
        </div>`;
      })
      .join('');

    $$('.pane-head').forEach((head) => {
      head.addEventListener('click', () => {
        const id = head.dataset.id;
        if (id === state.active) return;
        state.active = id;
        api.setLayout({ active: id });
        renderAll();
      });
      // 双击列头 = 最大化 / 还原这一列
      head.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        api.paneSolo(head.dataset.id);
      });
    });
    $$('[data-narrow]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setRatio(b.dataset.narrow, Math.max(0.4, ratioOf(b.dataset.narrow) - 0.2));
      })
    );
    $$('[data-wide]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setRatio(b.dataset.wide, Math.min(4, ratioOf(b.dataset.wide) + 0.2));
      })
    );
    $$('[data-solo]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        api.paneSolo(b.dataset.solo);
      })
    );
    $$('[data-close]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        api.paneClose(b.dataset.close);
      })
    );
    $$('[data-resize]').forEach((h) => {
      h.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startResize(e, h.dataset.resize);
      });
    });
  }

  function setRatio(id, value) {
    const patch = {};
    patch[id] = Math.round(value * 100) / 100;
    api.setLayout({ colRatios: patch });
  }

  /** 拖拽列头之间的分隔条调整两列宽度 */
  function startResize(e, idA) {
    const idx = state.splitList.indexOf(idA);
    const idB = state.splitList[idx + 1];
    if (!idB) return;
    const startX = e.clientX;
    const n = state.splitList.length;
    const gap = 2;
    const cw = (state.panes && state.panes.containerWidth) || window.innerWidth - sidebarPx();
    // 权重 1 对应的像素宽度（与主进程同一套公式，拖起来才不会飘）
    const total = state.splitList.reduce((a, id) => a + ratioOf(id), 0) || 1;
    const unit = Math.max(120, (cw - gap * (n - 1)) / total);
    const baseA = ratioOf(idA) * unit;
    const baseB = ratioOf(idB) * unit;
    document.body.classList.add('resizing');

    let pending = null;
    const flush = () => {
      pending = null;
      const patch = {};
      patch[idA] = Math.round((pendingA / unit) * 1000) / 1000;
      patch[idB] = Math.round((pendingB / unit) * 1000) / 1000;
      api.setLayout({ colRatios: patch });
    };
    let pendingA = baseA;
    let pendingB = baseB;

    const move = (ev) => {
      const dx = ev.clientX - startX;
      pendingA = Math.max(180, Math.min(baseA + baseB - 180, baseA + dx));
      pendingB = baseA + baseB - pendingA;
      if (!pending) pending = requestAnimationFrame(flush);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing');
      if (pending) {
        cancelAnimationFrame(pending);
        flush();
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /* ---------------- 聚合页：自选页面 ---------------- */
  function toggleSplitPage(id) {
    const has = state.splitList.includes(id);
    let next = has ? state.splitList.filter((x) => x !== id) : state.splitList.concat([id]);
    if (!next.length) next = [id];
    api.setLayout({ splitList: next, mode: 'split' });
  }

  function renderPagePicker() {
    const box = $('#page-picker');
    if (!box) return;
    box.innerHTML = state.platforms
      .map((p) => {
        const on = state.splitList.includes(p.id);
        return `<button class="pick-item${on ? ' on' : ''}" data-pick="${p.id}">
          <span class="pick-box">${on ? '☑' : '☐'}</span>
          <span class="pane-dot" style="background:${p.color}"></span>
          <span class="pick-name">${esc(p.shortName || p.name)}</span>
        </button>`;
      })
      .join('');
    $$('#page-picker .pick-item').forEach((b) =>
      b.addEventListener('click', () => toggleSplitPage(b.dataset.pick))
    );
  }

  /* ---------------- 渲染：收藏 / 历史 ---------------- */
  function renderMine() {
    const isFav = state.mineTab === 'fav';
    $$('.mine-tab').forEach((t) => t.classList.toggle('active', (t.dataset.tab === 'fav') === isFav));
    $('#btn-clear-history').classList.toggle('hidden', !isFav);

    const list = isFav ? state.favorites : state.history;
    const box = $('#mine-list');
    if (!list.length) {
      box.innerHTML = `<div class="mine-empty">${isFav ? '还没有收藏，点击顶栏 ☆ 收藏当前页面' : '暂无浏览记录'}</div>`;
      return;
    }
    box.innerHTML = list
      .map((it) => {
        const p = findPlatform(it.platform) || { color: '#9aa1ac' };
        return `<div class="mine-item" data-url="${esc(it.url)}" data-platform="${esc(it.platform)}" title="${esc(it.title)}">
          <span class="pane-dot" style="background:${p.color}"></span>
          <span class="mi-title">${esc(it.title)}</span>
          <span class="mi-time" style="color:var(--text-3);font-size:11px">${fmtTime(it.ts)}</span>
          <button class="mine-del" data-del="${esc(it.id || it.url)}">${ICONS.trash}</button>
        </div>`;
      })
      .join('');

    $$('.mine-item').forEach((el) => {
      el.addEventListener('click', () => {
        api.go({ id: el.dataset.platform, url: el.dataset.url }).then(() => {});
      });
    });
    $$('.mine-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.del;
        if (isFav) api.favRemove(key);
        else api.historyRemove(key);
      });
    });
  }

  /* ---------------- 渲染：设置菜单 ---------------- */
  function renderSetMenu() {
    $('#split-toggles').innerHTML = state.platforms
      .map((p) => {
        const on = state.splitList.includes(p.id) ? '☑' : '☐';
        return `<div class="menu-item" data-toggle="${p.id}">${on} ${esc(p.shortName || p.name)}</div>`;
      })
      .join('');
    $$('#split-toggles .menu-item').forEach((el) => {
      el.addEventListener('click', () => toggleSplitPage(el.dataset.toggle));
    });

    // 布局模板 / 网格列数 / 声音 / 列宽 的选中态
    $$('#set-menu [data-lm]').forEach((b) => b.classList.toggle('on', b.dataset.lm === state.lm.mode));
    $$('#set-menu [data-gridcols]').forEach((b) =>
      b.classList.toggle('on', Number(b.dataset.gridcols) === state.lm.gridCols)
    );
    $('#grid-cols-row').classList.toggle('hidden', state.lm.mode !== 'grid');
    $$('#set-menu [data-audio]').forEach((b) => b.classList.toggle('on', b.dataset.audio === state.audio));
    $('#menu-solo').textContent = state.solo ? '还原所有列（取消最大化）' : '最大化当前列';

    // 排列顺序：聚合页里每一列的上移 / 下移
    $('#pane-order').innerHTML = state.splitList
      .map((id, i) => {
        const p = findPlatform(id) || {};
        return `<div class="order-item">
          <span class="pane-dot" style="background:${p.color || '#9aa1ac'}"></span>
          <span class="order-name">${esc(p.shortName || p.name || id)}</span>
          <button class="pane-btn" data-up="${id}" title="前移" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="pane-btn" data-down="${id}" title="后移" ${i === state.splitList.length - 1 ? 'disabled' : ''}>↓</button>
        </div>`;
      })
      .join('');
    $$('#pane-order [data-up]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        api.paneMove({ id: b.dataset.up, delta: -1 });
      })
    );
    $$('#pane-order [data-down]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        api.paneMove({ id: b.dataset.down, delta: 1 });
      })
    );

    // 被拦下的外部协议链接：方便回看"到底是哪个页面想拉起外链"
    const bl = $('#blocked-list');
    bl.innerHTML = state.blocked.length
      ? state.blocked
          .slice(0, 5)
          .map(
            (b) => `<div class="order-item" title="${esc(b.url)}">
              <span class="order-name">${esc(b.scheme || '未知')}://</span>
              <span class="src-home">${esc(b.from || '')}</span>
            </div>`
          )
          .join('')
      : '<div class="menu-title">暂无（不会再弹系统提示框）</div>';

    $('#menu-theme').textContent = document.body.classList.contains('dark') ? '浅色模式' : '深色模式';
    $('#menu-guest').textContent = (state.guestMode ? '☑ ' : '☐ ') + '免登录模式（游客访问）';
    $('#about-line').textContent =
      `VideoHub v${state.version} · ${state.platforms.length} 个视频源 · 布局 ${
        { row: '横排', grid: '网格', focus: '主次' }[state.lm.mode]
      }`;
  }

  /* ---------------- 渲染：NBA 免费专区 ---------------- */
  function renderNba() {
    const box = $('#nba-list');
    if (!box || !state.nbaSources.length) return;
    box.innerHTML = state.nbaSources
      .map((s) => {
        const p = findPlatform(s.platform) || {};
        return `<button class="nba-item" data-url="${esc(s.url)}" data-platform="${esc(s.platform)}" title="${esc(s.name)}">
          <span class="nba-dot" style="background:${p.color || '#9aa1ac'}"></span>
          <span class="nba-name">${esc(s.name)}</span>
          <span class="nba-badge">${esc(s.badge || '')}</span>
        </button>`;
      })
      .join('');

    $$('.nba-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.platform;
        const url = btn.dataset.url;
        if (state.mode === 'split' && state.splitList.includes(id)) {
          api.go({ id, url });
        } else {
          api.setLayout({ mode: 'single', active: id }).then(() => api.go({ id, url }));
        }
      });
    });
  }

  function renderAll() {
    renderPlatforms();
    renderCategories();
    renderNba();
    renderMode();
    renderMine();
    renderSetMenu();
    renderSourceList();
    document.body.classList.toggle('collapsed', state.collapsed);
    document.body.classList.toggle('solo', !!state.solo);
    $('#collapse-label').textContent = state.collapsed ? '展开' : '收起侧栏';
  }

  /* ---------------- 视频源：添加 / 管理 ---------------- */
  function openSourceModal() {
    $('#src-modal').classList.remove('hidden');
    syncOverlay(); // 先摘掉原生视图，否则弹窗会被网页盖住，看着像"点了没反应"
    $('#src-notes').classList.add('hidden');
    renderSourceList();
    const url = $('#src-url');
    if (!$('#src-home').value) url.value = '';
    setTimeout(() => url.focus(), 30);
  }
  function closeSourceModal() {
    const m = $('#src-modal');
    if (m.classList.contains('hidden')) return;
    m.classList.add('hidden');
    syncOverlay();
  }

  const catsToText = (list) => (list || []).map((c) => `${c.name}|${c.url}`).join('\n');

  function parseCats(text) {
    return String(text || '')
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const i = l.indexOf('|');
        if (i < 0) return null;
        const name = l.slice(0, i).trim();
        const url = l.slice(i + 1).trim();
        return name && /^https?:\/\//i.test(url) ? { name, url } : null;
      })
      .filter(Boolean);
  }

    function renderSourceList() {
    const box = $('#src-list');
    if (!box) return;
    const list = state.sources || [];
    const removed = state.removed || [];
    let html = '';
    if (!list.length) {
      html += '<div class="mine-empty">还没有自定义源，用上面的 AI 识别添加一个试试</div>';
    } else {
      html += list
        .map(
          (s) => `<div class="src-item" title="${esc(s.home)}">
            <span class="pane-dot" style="background:${s.color}"></span>
            <span class="src-name">${esc(s.name)}</span>
            <span class="src-home">${esc(s.home)}</span>
            <button class="pane-btn" data-src-split="${s.id}" title="加入/移出聚合分屏">分屏</button>
            <button class="pane-btn danger" data-src-del="${s.id}" title="删除">✕</button>
          </div>`
        )
        .join('');
    }
    if (removed.length) {
      html += '<div class="src-subtitle">已删除（可找回）</div>';
      html += removed
        .map(
          (s) => `<div class="src-item removed" title="${esc(s.home)}">
            <span class="pane-dot" style="background:${s.color}"></span>
            <span class="src-name">${esc(s.name)}</span>
            <span class="src-home">${esc(s.home)}</span>
            <button class="pane-btn" data-src-restore="${s.id}" title="恢复到视频源列表">恢复</button>
            <button class="pane-btn danger" data-src-purge="${s.id}" title="彻底删除，不可找回">✕</button>
          </div>`
        )
        .join('');
    }
    box.innerHTML = html;

    $$('[data-src-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const res = await api.sourceRemove(b.dataset.srcDel);
        if (res && res.ok) {
          state.sources = res.sources;
          state.platforms = res.platforms;
          state.removed = res.removed || state.removed;
          renderAll();
          toast('已删除该视频源（可在「已删除」处找回）');
        }
      })
    );
    $$('[data-src-split]').forEach((b) =>
      b.addEventListener('click', () => {
        toggleSplitPage(b.dataset.srcSplit);
        closeSourceModal();
      })
    );
    $$('[data-src-restore]').forEach((b) =>
      b.addEventListener('click', async () => {
        const res = await api.sourceRestore(b.dataset.srcRestore);
        if (res && res.ok) {
          state.sources = res.sources;
          state.platforms = res.platforms;
          state.removed = res.removed || [];
          renderAll();
          toast('已恢复视频源：' + (res.source ? res.source.name : ''));
        }
      })
    );
    $$('[data-src-purge]').forEach((b) =>
      b.addEventListener('click', async () => {
        const res = await api.sourcePurge(b.dataset.srcPurge);
        if (res && res.ok) {
          state.removed = res.removed || [];
          renderSourceList();
          toast('已彻底删除');
        }
      })
    );
  }


  async function runDetect() {
    const url = $('#src-url').value.trim();
    if (!url) {
      toast('请先填写网站首页地址');
      return;
    }
    const btn = $('#src-detect');
    btn.disabled = true;
    btn.textContent = '识别中…';
    const notes = $('#src-notes');
    notes.innerHTML = '<div class="src-note">正在抓取站点信息…</div>';
    notes.classList.remove('hidden');

    const res = await api.sourceDetect(url);
    btn.disabled = false;
    btn.textContent = 'AI 识别';

    if (!res || !res.ok) {
      notes.innerHTML = `<div class="src-note warn">${esc((res && res.error) || '识别失败')}</div>`;
      return;
    }
    const s = res.source;
    $('#src-name').value = s.name || '';
    $('#src-home').value = s.home || '';
    $('#src-color').value = s.color || '#7C3AED';
    $('#src-search').value = s.searchTemplate || '';
    $('#src-cats').value = catsToText(s.categories);
    notes.innerHTML = (res.notes || [])
      .map((n) => `<div class="src-note">· ${esc(n)}</div>`)
      .join('');
    toast('识别完成，确认信息后保存');
  }

  async function saveSource() {
    const payload = {
      name: $('#src-name').value.trim(),
      home: $('#src-home').value.trim() || $('#src-url').value.trim(),
      color: $('#src-color').value,
      searchTemplate: $('#src-search').value.trim(),
      categories: parseCats($('#src-cats').value),
    };
    if (!payload.home) {
      toast('请填写首页地址');
      return;
    }
    const res = await api.sourceAdd(payload);
    if (!res || !res.ok) {
      toast((res && res.error) || '添加失败');
      return;
    }
    state.sources = res.sources;
    state.platforms = res.platforms;
    closeSourceModal();
    renderAll();
    toast(`已添加「${res.source.name}」，可在侧栏直接打开`);
  }

  async function runIndexByName() {
    const name = $('#src-index-name').value.trim();
    if (!name) {
      toast('请先输入要索引的名称');
      return;
    }
    const btn = $('#src-index');
    btn.disabled = true;
    btn.textContent = '索引中…';
    const notes = $('#src-notes');
    notes.innerHTML = '<div class="src-note">正在按名称查找索引…</div>';
    notes.classList.remove('hidden');

    const res = await api.sourceIndex(name);
    btn.disabled = false;
    btn.textContent = '按名称索引';

    if (!res || !res.ok) {
      notes.innerHTML = `<div class="src-note warn">${esc((res && res.error) || '未找到匹配项')}</div>`;
      return;
    }
    const s = res.source;
    $('#src-name').value = s.name || '';
    $('#src-home').value = s.home || '';
    $('#src-color').value = s.color || '#7C3AED';
    $('#src-search').value = s.searchTemplate || '';
    $('#src-cats').value = catsToText(s.categories);
    notes.innerHTML = `<div class="src-note">· 已从索引补全「${esc(s.name)}」的首页 / 搜索 / ${s.categories.length} 个分类入口</div>`;
    toast('索引完成，确认信息后保存');
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme(dark) {
    document.body.classList.toggle('dark', !!dark);
    $('#menu-theme').textContent = dark ? '浅色模式' : '深色模式';
  }

  /* ---------------- 搜索 ---------------- */
  function doSearch() {
    const kw = $('#search-input').value.trim();
    if (!kw) return;
    hideSuggest();
    api.search({
      keyword: kw,
      scope: state.scope,
      platforms: state.scope === 'all' ? state.splitList : [state.active],
    });
  }

  function showSuggest() {
    const box = $('#suggest');
    if (!state.searchWords.length) {
      box.classList.add('hidden');
      syncOverlay();
      return;
    }
    box.innerHTML =
      `<div class="menu-title">最近搜索</div>` +
      state.searchWords.map((w) => `<div class="menu-item" data-word="${esc(w)}">${esc(w)}</div>`).join('');
    box.classList.remove('hidden');
    syncOverlay();
    $$('#suggest .menu-item').forEach((el) => {
      el.addEventListener('click', () => {
        $('#search-input').value = el.dataset.word;
        hideSuggest();
        doSearch();
      });
    });
  }
  function hideSuggest() {
    const box = $('#suggest');
    if (box.classList.contains('hidden')) return;
    box.classList.add('hidden');
    syncOverlay();
  }

  /* ---------------- 初始化 ---------------- */
  /* ---------------- 一键静音 ---------------- */
  function updateMuteBtn() {
    const btn = $('#btn-mute');
    if (!btn) return;
    btn.classList.toggle('muted', !!state.muted);
    btn.innerHTML = state.muted ? ICONS.muteOn : ICONS.muteOff;
    btn.title = state.muted ? '取消静音' : '一键静音 / 取消静音';
  }

  function toggleMute() {
    if (state.muted) {
      const prev = state.lastAudio && state.lastAudio !== 'off' ? state.lastAudio : 'focus';
      api.setLayout({ audio: prev });
      state.muted = false;
    } else {
      state.lastAudio = state.audio !== 'off' ? state.audio : 'focus';
      api.setLayout({ audio: 'off' });
      api.muteAll();
      state.muted = true;
    }
    updateMuteBtn();
  }

  /* ---------------- 无水印下载视频 / 图片 ---------------- */
  async function downloadMedia(id, want) {
    const list = await api.mediaList(id);
    if (!list || !list.ok) {
      toast((list && list.error) || '无法读取页面媒体');
      return;
    }
    const pool = want === 'image' ? list.images : list.videos;
    const fallback = want === 'image' ? list.videos : list.images;
    let chosen = null;
    if (pool && pool.length) {
      chosen = pool.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    } else if (fallback && fallback.length) {
      chosen = fallback.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
      toast(want === 'image' ? '该页面未找到图片，已改为下载视频' : '该页面未找到视频，已改为下载图片');
    }
    if (!chosen) {
      toast('当前页面未找到可直接下载的媒体（可能是加密分片流，可改用截图功能）');
      return;
    }
    const res = await api.mediaDownload({ id, url: chosen.src, kind: want });
    if (res && res.ok) {
      toast('已开始下载（无水印）：' + (res.name || ''));
    } else {
      toast((res && res.error) || '下载发起失败');
    }
  }

  async function boot() {
    const data = await api.init();
    state.platforms = data.platforms;
    state.sources = data.sources || [];
    state.removed = data.removed || [];
    state.prefs = data.prefs || {};
    state.guestMode = !!(data.prefs && data.prefs.guestMode);
    state.nameAliases = data.nameAliases || [];
    Object.assign(state, {
      mode: data.state.mode,
      active: data.state.active,
      splitList: data.state.splitList,
      colRatios: data.state.colRatios || {},
      lm: data.state.lm || state.lm,
      solo: data.state.solo || null,
      audio: data.state.audio || 'focus',
      collapsed: data.state.collapsed,
      panes: data.state.panes || state.panes,
    });
    state.favorites = data.favorites;
    state.history = data.history;
    state.searchWords = data.searchWords;
    state.blocked = data.blocked || [];
    state.version = data.version;
    state.nbaSources = data.nbaSources || [];
    state.nbaSplit = data.nbaSplit || [];

    applyTheme(state.prefs.theme === 'dark');
    renderAll();
    updateMuteBtn();
    // 名称索引候选：填进 <datalist> 做输入联想
    $('#src-name-list').innerHTML = state.nameAliases
      .map((e) => `<option value="${esc(e.name)}">${esc(e.aliases.join(' / '))}</option>`)
      .join('');
    api.setLayout({ sidebarWidth: SIDEBAR_W, topbarHeight: TOPBAR_H });

    // 顶栏按钮
    $('#btn-back').onclick = () => api.back(state.active);
    $('#btn-forward').onclick = () => api.forward(state.active);
    $('#btn-reload').onclick = () => api.reload(state.active);
    $('#btn-home').onclick = () => api.home(state.active);
    $('#btn-fav').onclick = async () => {
      const ok = await api.favCurrent();
      toast(ok ? '已收藏当前页面' : '该页面已在收藏中');
    };
    $('#btn-mini').onclick = () => api.openMini(null);
    $('#btn-mute').onclick = () => toggleMute();
    $('#btn-min').onclick = () => api.winAction('min');
    $('#btn-max').onclick = () => api.winAction('max');
    $('#btn-close').onclick = () => api.winAction('close');

    // 视图模式
    $('#mode-single').onclick = () => api.setLayout({ mode: 'single' });
    $('#mode-split').onclick = () => api.setLayout({ mode: 'split' });
    $('#btn-collapse').onclick = () => api.setLayout({ collapsed: !state.collapsed });
    $('#btn-pick-pages').onclick = () => $('#page-picker').classList.toggle('hidden');
    $('#btn-nba-split').onclick = async () => {
      if (!state.nbaSplit.length) return;
      await api.openSet({ items: state.nbaSplit, mode: 'split' });
      toast('已四分屏打开 NBA 免费渠道，可切换焦点列');
    };

    // 搜索
    $('#btn-search').onclick = doSearch;
    $('#search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
      if (e.key === 'Escape') hideSuggest();
    });
    $('#search-input').addEventListener('focus', showSuggest);
    $('#scope-btn').onclick = () => {
      $('#scope-menu').classList.toggle('hidden');
      syncOverlay();
    };
    $$('#scope-menu .menu-item').forEach((el) => {
      el.addEventListener('click', () => {
        state.scope = el.dataset.scope;
        $('#scope-label').textContent = el.dataset.scope === 'all' ? '全平台' : '当前平台';
        $('#scope-menu').classList.add('hidden');
        syncOverlay();
      });
    });

    // 设置菜单
    $('#btn-set').onclick = () => {
      renderSetMenu();
      $('#set-menu').classList.toggle('hidden');
      syncOverlay();
    };
    const hideSetMenu = () => {
      $('#set-menu').classList.add('hidden');
      syncOverlay();
    };
    $('#menu-clear').onclick = async () => {
      await api.clearBrowsingData();
      hideSetMenu();
      toast('已清除浏览数据与登录态');
    };
    $('#menu-guest').onclick = async () => {
      const on = !state.guestMode;
      state.guestMode = on;
      state.prefs = await api.prefSet({ guestMode: on });
      hideSetMenu();
      toast(on ? '已开启免登录模式（游客访问）' : '已关闭免登录模式');
    };
    $('#menu-add-source').onclick = () => {
      $('#set-menu').classList.add('hidden'); // 先收起菜单，再由弹窗统一接管遮罩
      openSourceModal();
    };
    $('#menu-shot').onclick = () => {
      hideSetMenu();
      api.shot(state.active);
    };
    $('#menu-download-video').onclick = () => {
      hideSetMenu();
      downloadMedia(state.active, 'video');
    };
    $('#menu-download-image').onclick = () => {
      hideSetMenu();
      downloadMedia(state.active, 'image');
    };
    $('#menu-reload-all').onclick = () => {
      hideSetMenu();
      api.reloadAll();
      toast('已刷新聚合页的所有页面');
    };
    $('#menu-solo').onclick = () => {
      hideSetMenu();
      api.paneSolo(state.solo || state.active);
    };
    // 布局模板：横排 / 网格 / 主次
    $$('#set-menu [data-lm]').forEach((b) =>
      b.addEventListener('click', () => {
        api.setLayout({ lm: { mode: b.dataset.lm } });
        renderSetMenu();
      })
    );
    // 网格列数
    $$('#set-menu [data-gridcols]').forEach((b) =>
      b.addEventListener('click', () => {
        api.setLayout({ lm: { mode: 'grid', gridCols: Number(b.dataset.gridcols) } });
        renderSetMenu();
      })
    );
    $('#menu-theme').onclick = async () => {
      const dark = !document.body.classList.contains('dark');
      applyTheme(dark);
      state.prefs = await api.prefSet({ theme: dark ? 'dark' : 'light' });
      renderSetMenu();
      syncOverlay();
    };
    $('#menu-top').onclick = () => {
      hideSetMenu();
      api.winAction('top');
      toast('已切换窗口置顶');
    };
    $$('#set-menu [data-ratio]').forEach((b) =>
      b.addEventListener('click', () => {
        const kind = b.dataset.ratio;
        if (kind === 'reset') {
          api.setLayout({ resetRatios: true });
          return;
        }
        const patch = {};
        state.splitList.forEach((id, i) => {
          patch[id] = kind === 'master' ? (i === 0 ? 1.8 : 0.8) : 1;
        });
        api.setLayout({ colRatios: patch });
      })
    );
    $$('#set-menu [data-audio]').forEach((b) =>
      b.addEventListener('click', () => {
        api.setLayout({ audio: b.dataset.audio });
        toast(b.dataset.audio === 'off' ? '已静音所有分屏' : b.dataset.audio === 'all' ? '所有分屏均可发声' : '仅焦点列发声');
      })
    );

    // 视频源弹窗
    $('#btn-add-source').onclick = openSourceModal;
    $('#src-close').onclick = closeSourceModal;
    $('#src-cancel').onclick = closeSourceModal;
    $('#src-detect').onclick = runDetect;
    $('#src-index').onclick = runIndexByName;
    $('#src-save').onclick = saveSource;
    $('#src-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runDetect();
    });
    $('#src-index-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runIndexByName();
    });
    $('#src-modal').addEventListener('mousedown', (e) => {
      if (e.target === $('#src-modal')) closeSourceModal();
    });

    // 我的
    $$('.mine-tab').forEach((t) => {
      t.addEventListener('click', () => {
        state.mineTab = t.dataset.tab;
        renderMine();
      });
    });
    $('#btn-clear-history').onclick = () => api.historyClear();

    // 点空白处收起浮层：每个浮层都有自己的"归属元素"，收起后统一同步遮罩状态
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#scope-btn') && !e.target.closest('#scope-menu')) $('#scope-menu').classList.add('hidden');
      if (!e.target.closest('#btn-set') && !e.target.closest('#set-menu')) $('#set-menu').classList.add('hidden');
      if (!e.target.closest('.search-wrap')) $('#suggest').classList.add('hidden');
      syncOverlay();
    });

    // 主进程事件
    api.on('state:changed', (s) => {
      Object.assign(state, {
        mode: s.mode,
        active: s.active,
        splitList: s.splitList,
        colRatios: s.colRatios || {},
        lm: s.lm || state.lm,
        solo: s.solo || null,
        audio: s.audio || 'focus',
        muted: s.audio === 'off',
        collapsed: s.collapsed,
        panes: s.panes || state.panes,
      });
      renderAll();
    });
    api.on('sources:changed', (p) => {
      state.sources = p.sources || [];
      state.platforms = p.platforms || state.platforms;
      state.removed = p.removed || state.removed;
      renderAll();
    });
    api.on('app:toast', (msg) => toast(msg));
    api.on('blocked:changed', (list) => {
      state.blocked = list || [];
      renderSetMenu();
    });
    api.on('view:nav', (p) => {
      if (p.title) state.titles[p.id] = p.title;
      renderPaneHeaders();
    });
    api.on('view:loading', (p) => {
      state.loading[p.id] = p.loading;
      renderPaneHeaders();
    });
    api.on('view:error', (p) => {
      if (p.code === -102 || p.code === -105) toast('页面加载失败，请检查网络连接');
    });
    api.on('favorites:changed', (list) => {
      state.favorites = list;
      renderMine();
    });
    api.on('history:changed', (list) => {
      state.history = list;
      renderMine();
    });
    api.on('searchWords:changed', (list) => {
      state.searchWords = list;
    });

    // 快捷键
    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'f') {
        e.preventDefault();
        $('#search-input').focus();
        $('#search-input').select();
      } else if (ctrl && /^[1-9]$/.test(e.key)) {
        // Ctrl+1..N 按侧栏顺序切换平台（平台数量变化也能用）
        const p = state.platforms[Number(e.key) - 1];
        if (p) {
          state.active = p.id;
          api.setLayout({ active: p.id, mode: 'single' });
          renderAll();
        }
      } else if (ctrl && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        api.setLayout({ mode: state.mode === 'single' ? 'split' : 'single' });
      } else if (ctrl && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        api.paneSolo(state.solo || state.active);
      } else if (ctrl && e.altKey && (e.key === 's' || e.key === 'S')) {
        api.shot(state.active);
      } else if (ctrl && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        openSourceModal();
      } else if (ctrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        $('#btn-fav').click();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        api.back(state.active);
      } else if (e.altKey && e.key === 'ArrowRight') {
        api.forward(state.active);
      } else if (e.key === 'F5') {
        api.reload(state.active);
      } else if (e.key === 'Escape') {
        closeOverlays();
      }
    });
  }

  boot().catch((e) => {
    console.error(e);
    toast('初始化失败：' + e.message);
  });
})();
