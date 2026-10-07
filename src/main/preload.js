const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

const api = {
  init: invoke('app:init'),

  go: invoke('nav:go'), // {id, url}
  search: invoke('nav:search'), // {keyword, scope, platforms}
  openSet: invoke('views:openSet'), // {items:[{id,url}], mode} 一次性打开一组视图

  back: invoke('view:back'),
  forward: invoke('view:forward'),
  reload: invoke('view:reload'),
  stop: invoke('view:stop'),
  home: invoke('view:home'),
  reloadAll: invoke('view:reloadAll'), // 刷新聚合页所有列
  shot: invoke('view:shot'), // 截图当前视图，返回文件路径
  paneClose: invoke('pane:close'), // 关闭聚合页中的一列
  paneSolo: invoke('pane:solo'), // 单列最大化 / 还原
  paneMove: invoke('pane:move'), // 调整列顺序
  overlaySet: invoke('overlay:set'), // 弹窗/菜单展开时隐藏原生视图

  setLayout: invoke('layout:set'),

  // 自定义视频源
  sourceList: invoke('source:list'),
  sourceDetect: invoke('source:detect'), // AI 智能识别
  sourceIndex: invoke('source:indexByName'), // 按名称自动索引
  sourceAdd: invoke('source:add'),
  sourceRemove: invoke('source:remove'),
  sourceSort: invoke('source:sort'),
  sourceRestore: invoke('source:restore'),
  sourcePurge: invoke('source:purge'),
  sourceRemoved: invoke('source:removed'),

  prefSet: invoke('pref:set'),

  favAdd: invoke('fav:add'),
  favRemove: invoke('fav:remove'),
  favCurrent: invoke('fav:current'),

  historyClear: invoke('history:clear'),
  historyRemove: invoke('history:remove'),

  openMini: invoke('mini:open'),
  // 摸鱼面板展开高度：让内容视图下移，面板才不会被原生视频视图盖住
  miniOverlay: invoke('mini:overlay'),
  // 小窗摸鱼偏好：透明度 / 任务栏隐身 / 置顶
  miniPref: invoke('mini:pref'),
  // 老板键：一键隐藏全部窗口并静音，再按恢复
  bossToggle: invoke('boss:toggle'),
  bossState: invoke('boss:state'),
  winAction: invoke('win:action'), // min | max | close | top
  miniAction: invoke('win:miniAction'), // close | top | back
  openExternal: invoke('open:external'),
  clearBrowsingData: invoke('app:clearBrowsingData'),
  muteAll: invoke('view:muteAll'),
  mediaList: invoke('media:list'),
  mediaDownload: invoke('media:download'),

  on(channel, cb) {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
