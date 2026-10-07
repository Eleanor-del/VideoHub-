/**
 * 平台 / 视频源配置
 *
 * - BUILTIN_PLATFORMS：内置平台，写死在代码里
 * - 自定义视频源：由用户在应用内添加，存在 userData/videohub.json 的 sources 字段
 * - 两者结构一致，主进程启动时合并（见 src/main/index.js 的 rebuildPlatforms）
 *
 * 注意：内置平台的 searchUrl 是函数，不能跨 IPC（结构化克隆会失败），
 * 下发渲染进程前统一走 toPublicPlatforms() 剔除；自定义源用 searchTemplate 字符串保存，
 * 由 searchUrlOf() 还原成函数。
 */

const enc = (s) => encodeURIComponent(s);

const douyinSearch = (q) => `https://www.douyin.com/search/${enc(q)}?type=video`;
const douyinCat = (name) => ({ name, url: douyinSearch(name) });

const ksSearch = (q) => `https://www.kuaishou.com/search/video?searchKey=${enc(q)}`;
const ksCat = (name) => ({ name, url: ksSearch(name) });

const biliSearch = (q) => `https://search.bilibili.com/all?keyword=${enc(q)}`;

/* ---------------- 直播平台：搜索 / 分类辅助 ---------------- */
const huyaSearch = (q) => `https://www.huya.com/search?search=${enc(q)}`;
const huyaCat = (name) => ({ name, url: huyaSearch(name) });
const douyuSearch = (q) => `https://www.douyu.com/search/?kw=${enc(q)}`;
const douyuCat = (name) => ({ name, url: douyuSearch(name) });
const yySearch = (q) => `https://www.yy.com/search?keyword=${enc(q)}`;
const yyCat = (name) => ({ name, url: yySearch(name) });

/* ---------------- 音乐平台：搜索 / 分类辅助 ----------------
 * 注意：这里的分类一律由「首页」或「搜索式链接」构成，不使用推测性的二级路径，
 * 避免站点改版后出现死链（m.douyin.com 下线导致 404 就是前车之鉴）。 */
const miguSearch = (q) => `https://music.migu.cn/search?keyword=${enc(q)}`;
const miguCat = (name) => ({ name, url: miguSearch(name) });
const kuwoSearch = (q) => `https://www.kuwo.cn/search/list?key=${enc(q)}`;
const kuwoCat = (name) => ({ name, url: kuwoSearch(name) });
const neteaseSearch = (q) => `https://music.163.com/#/search/m/?s=${enc(q)}`;
const neteaseCat = (name) => ({ name, url: neteaseSearch(name) });
const qqmusicSearch = (q) => `https://y.qq.com/portal/search.html#page=1&searchid=1&remoteplace=txt.yqq.top&t=song&w=${enc(q)}`;
const qqmusicCat = (name) => ({ name, url: qqmusicSearch(name) });
const sing5Search = (q) => `https://5sing.kugou.com/search?k=${enc(q)}`;
const sing5Cat = (name) => ({ name, url: sing5Search(name) });

/**
 * 免登录（游客）模式落地页：能拿到移动端 / 游客端点就优先用，
 * 这些端点一般强制登录更少、弹窗更少；无法确定的平台不在此列。
 */
const GUEST_HOME = {
  // 抖音 m 站已于 2026 年下线（直返 404 Not Found），游客模式回退到 www 主站
  kuaishou: 'https://m.kuaishou.com/',
  bilibili: 'https://m.bilibili.com/',
  tencent: 'https://m.v.qq.com/',
  huya: 'https://m.huya.com/',
  douyu: 'https://m.douyu.com/',
};

const BUILTIN_PLATFORMS = [
  {
    id: 'douyin',
    name: '抖音',
    en: 'Douyin',
    color: '#FE2C55',
    colorSoft: 'rgba(254,44,85,0.10)',
    home: 'https://www.douyin.com/',
    // 含登录/验证码相关域名，避免鉴权流程被拦截
    hosts: ['douyin.com', 'iesdouyin.com', 'amemv.com', 'snssdk.com', 'zijieapi.com', 'volces.com'],
    searchUrl: douyinSearch,
    categories: [
      { name: '首页推荐', url: 'https://www.douyin.com/', icon: 'home' },
      { name: '抖音热榜', url: 'https://www.douyin.com/hot', icon: 'fire' },
      { name: '精选视频', url: 'https://www.douyin.com/discover', icon: 'star' },
      { name: '直播广场', url: 'https://live.douyin.com/', icon: 'live' },
      { name: 'NBA 集锦', url: douyinSearch('NBA') },
      douyinCat('音乐'),
      douyinCat('美食'),
      douyinCat('游戏'),
      douyinCat('体育'),
      douyinCat('二次元'),
      douyinCat('知识'),
      douyinCat('汽车'),
      douyinCat('旅行'),
      douyinCat('时尚'),
      douyinCat('搞笑'),
    ],
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    shortName: 'B站',
    en: 'Bilibili',
    color: '#FB7299',
    colorSoft: 'rgba(251,114,153,0.10)',
    home: 'https://www.bilibili.com/',
    hosts: ['bilibili.com', 'bilibili.tv', 'b23.tv', 'hdslb.com'],
    searchUrl: biliSearch,
    categories: [
      { name: '首页推荐', url: 'https://www.bilibili.com/', icon: 'home' },
      { name: '热门视频', url: 'https://www.bilibili.com/v/popular/all', icon: 'fire' },
      { name: '全站排行', url: 'https://www.bilibili.com/v/popular/rank/all', icon: 'rank' },
      { name: 'NBA 集锦', url: biliSearch('NBA 集锦') },
      { name: '体育赛事', url: 'https://www.bilibili.com/v/sports/', icon: 'play' },
      { name: '动画', url: 'https://www.bilibili.com/anime/', icon: 'play' },
      { name: '音乐', url: 'https://www.bilibili.com/v/music/', icon: 'play' },
      { name: '舞蹈', url: 'https://www.bilibili.com/v/dance/', icon: 'play' },
      { name: '游戏', url: 'https://www.bilibili.com/v/game/', icon: 'play' },
      { name: '知识', url: 'https://www.bilibili.com/v/knowledge/', icon: 'play' },
      { name: '科技', url: 'https://www.bilibili.com/v/tech/', icon: 'play' },
      { name: '生活', url: 'https://www.bilibili.com/v/life/', icon: 'play' },
      { name: '美食', url: 'https://www.bilibili.com/v/food/', icon: 'play' },
      { name: '时尚', url: 'https://www.bilibili.com/v/fashion/', icon: 'play' },
      { name: '娱乐', url: 'https://www.bilibili.com/v/ent/', icon: 'play' },
      { name: '影视', url: 'https://www.bilibili.com/v/cinephile/', icon: 'play' },
      { name: '纪录片', url: 'https://www.bilibili.com/v/documentary/', icon: 'play' },
      { name: '直播', url: 'https://live.bilibili.com/', icon: 'live' },
    ],
  },
  {
    id: 'kuaishou',
    name: '快手',
    en: 'Kuaishou',
    color: '#FF6A00',
    colorSoft: 'rgba(255,106,0,0.10)',
    home: 'https://www.kuaishou.com/',
    hosts: ['kuaishou.com', 'chenzhongtech.com', 'gifshow.com', 'kuaishou.cn', 'kuaishouzt.com'],
    searchUrl: ksSearch,
    categories: [
      { name: '首页推荐', url: 'https://www.kuaishou.com/', icon: 'home' },
      { name: '精选发现', url: 'https://www.kuaishou.com/brilliant', icon: 'star' },
      { name: '我的关注', url: 'https://www.kuaishou.com/follow', icon: 'star' },
      { name: '同城', url: 'https://www.kuaishou.com/nearby', icon: 'live' },
      { name: '直播广场', url: 'https://live.kuaishou.com/', icon: 'live' },
      { name: 'NBA 集锦', url: ksSearch('NBA') },
      ksCat('搞笑'),
      ksCat('美食'),
      ksCat('音乐'),
      ksCat('游戏'),
      ksCat('舞蹈'),
      ksCat('汽车'),
      ksCat('体育'),
      ksCat('宠物'),
    ],
  },
  {
    // 央视网：CCTV5 / CCTV5+ 体育直播完全免费，是唯一无需会员的 NBA 官方渠道
    id: 'cctv',
    name: '央视网',
    shortName: 'CCTV',
    en: 'CCTV',
    color: '#E4002B',
    colorSoft: 'rgba(228,0,43,0.10)',
    home: 'https://tv.cctv.com/',
    hosts: ['cctv.com', 'cntv.cn', 'cctv.cn', 'cctvpic.com', 'cctvstatic.cn', 'yangshipin.cn', 'yspapp.cn'],
    searchUrl: (q) => `https://search.cctv.com/search.php?qtext=${enc(q)}&type=video`,
    categories: [
      { name: 'CCTV5 体育直播', url: 'https://tv.cctv.com/live/cctv5/', icon: 'live' },
      { name: 'CCTV5+ 赛事直播', url: 'https://tv.cctv.com/live/cctv5plus/', icon: 'live' },
      { name: 'CCTV16 奥林匹克', url: 'https://tv.cctv.com/live/cctv16', icon: 'live' },
      { name: 'NBA 专题', url: 'https://sports.cctv.com/nba/', icon: 'star' },
      { name: 'CBA 专题', url: 'https://sports.cctv.com/cba/', icon: 'star' },
      { name: '篮球公园', url: 'https://tv.cctv.com/lm/lqgy/index.shtml', icon: 'play' },
      { name: '体育频道', url: 'https://sports.cctv.com/', icon: 'fire' },
      { name: '央视频', url: 'https://www.yangshipin.cn/', icon: 'play' },
      { name: '全部直播', url: 'https://tv.cctv.com/live/', icon: 'live' },
      { name: '节目库', url: 'https://tv.cctv.com/', icon: 'home' },
    ],
  },
  {
    // 腾讯体育 NBA：官方授权，含每周免费场次与大量免费集锦
    id: 'tencent',
    name: '腾讯体育',
    shortName: '腾讯',
    en: 'Tencent Sports',
    color: '#0A84FF',
    colorSoft: 'rgba(10,132,255,0.10)',
    home: 'https://sports.qq.com/nba/',
    hosts: ['qq.com', 'gtimg.cn', 'qpic.cn', 'qlogo.cn'],
    searchUrl: (q) => `https://v.qq.com/x/search/?q=${enc(q)}`,
    categories: [
      { name: 'NBA 频道', url: 'https://sports.qq.com/nba/', icon: 'star' },
      { name: 'NBA 比赛集锦', url: 'https://v.qq.com/x/search/?q=NBA%E9%9B%86%E9%94%A6', icon: 'play' },
      { name: 'NBA 经典赛回放', url: 'https://v.qq.com/x/search/?q=NBA%E7%BB%8F%E5%85%B8%E8%B5%9B', icon: 'play' },
      { name: '体育首页', url: 'https://sports.qq.com/', icon: 'home' },
    ],
  },
  {
    // 虎牙直播：国内头部游戏直播平台，游客即可浏览全部直播频道
    id: 'huya',
    name: '虎牙直播',
    shortName: '虎牙',
    en: 'Huya',
    color: '#FFA800',
    colorSoft: 'rgba(255,168,0,0.10)',
    home: 'https://www.huya.com/',
    hosts: ['huya.com', 'huya.com.cn', 'huyalive.com'],
    searchUrl: huyaSearch,
    categories: [
      { name: '直播首页', url: 'https://www.huya.com/', icon: 'home' },
      { name: '全部直播', url: 'https://www.huya.com/l', icon: 'live' },
      { name: '网游竞技', url: 'https://www.huya.com/g/1', icon: 'play' },
      { name: '手游休闲', url: 'https://www.huya.com/g/3', icon: 'play' },
      { name: '娱乐天地', url: 'https://www.huya.com/g/4', icon: 'play' },
      { name: '颜值星秀', url: 'https://www.huya.com/g/5', icon: 'play' },
      { name: '户外', url: 'https://www.huya.com/g/6', icon: 'live' },
      { name: '体育', url: 'https://www.huya.com/g/8', icon: 'live' },
      huyaCat('英雄联盟'),
      huyaCat('王者荣耀'),
      huyaCat('和平精英'),
      huyaCat('DNF'),
    ],
  },
  {
    // 斗鱼直播：与虎牙齐名的游戏直播平台，同样游客可看
    id: 'douyu',
    name: '斗鱼直播',
    shortName: '斗鱼',
    en: 'Douyu',
    color: '#FF5C00',
    colorSoft: 'rgba(255,92,0,0.10)',
    home: 'https://www.douyu.com/',
    hosts: ['douyu.com', 'douyu.com.cn'],
    searchUrl: douyuSearch,
    categories: [
      { name: '直播首页', url: 'https://www.douyu.com/', icon: 'home' },
      { name: '全部直播', url: 'https://www.douyu.com/directory/all', icon: 'live' },
      { name: '游戏专区', url: 'https://www.douyu.com/directory/game', icon: 'play' },
      { name: '英雄联盟', url: 'https://www.douyu.com/g_lol', icon: 'play' },
      { name: '王者荣耀', url: 'https://www.douyu.com/g_wzry', icon: 'play' },
      { name: '和平精英', url: 'https://www.douyu.com/g_hpjy', icon: 'play' },
      { name: '颜值', url: 'https://www.douyu.com/g_yz', icon: 'play' },
      { name: '户外', url: 'https://www.douyu.com/g_hw', icon: 'live' },
      { name: '娱乐', url: 'https://www.douyu.com/g_yl', icon: 'play' },
      douyuCat('英雄联盟'),
      douyuCat('美食'),
    ],
  },
  {
    // YY 直播：老牌综合直播平台
    id: 'yy',
    name: 'YY直播',
    shortName: 'YY',
    en: 'YY',
    color: '#FFD000',
    colorSoft: 'rgba(255,208,0,0.10)',
    home: 'https://www.yy.com/',
    hosts: ['yy.com', 'yy.com.cn'],
    searchUrl: yySearch,
    categories: [
      { name: '直播首页', url: 'https://www.yy.com/', icon: 'home' },
      yyCat('游戏'),
      yyCat('音乐'),
      yyCat('娱乐'),
      yyCat('体育'),
      yyCat('户外'),
    ],
  },
  {
    // 映客直播：移动端起家的娱乐直播平台
    id: 'inke',
    name: '映客直播',
    shortName: '映客',
    en: 'Inke',
    color: '#00C8C8',
    colorSoft: 'rgba(0,200,200,0.10)',
    home: 'https://www.inke.cn/',
    hosts: ['inke.cn', 'inke.com'],
    searchUrl: null,
    categories: [
      { name: '直播首页', url: 'https://www.inke.cn/', icon: 'home' },
      { name: '热门直播', url: 'https://www.inke.cn/live', icon: 'live' },
    ],
  },

  /* ---------------- 音乐平台（免登录即可播放） ---------------- */
  {
    id: 'migu',
    name: '咪咕音乐',
    en: 'MiGu Music',
    color: '#FF7A00',
    colorSoft: 'rgba(255,122,0,0.10)',
    home: 'https://music.migu.cn/',
    hosts: ['music.migu.cn', 'migu.cn'],
    searchUrl: miguSearch,
    categories: [
      { name: '首页推荐', url: 'https://music.migu.cn/', icon: 'home' },
      miguCat('热歌'),
      miguCat('经典老歌'),
      miguCat('抖音热歌'),
      miguCat('无损音质'),
      miguCat('华语'),
      miguCat('民谣'),
      miguCat('纯音乐'),
    ],
  },
  {
    id: 'kuwo',
    name: '酷我音乐',
    en: 'Kuwo Music',
    color: '#FFC300',
    colorSoft: 'rgba(255,195,0,0.10)',
    home: 'https://www.kuwo.cn/',
    hosts: ['kuwo.cn'],
    searchUrl: kuwoSearch,
    categories: [
      { name: '首页推荐', url: 'https://www.kuwo.cn/', icon: 'home' },
      kuwoCat('热歌'),
      kuwoCat('经典老歌'),
      kuwoCat('抖音热歌'),
      kuwoCat('车载DJ'),
      kuwoCat('轻音乐'),
    ],
  },
  {
    id: 'netease',
    name: '网易云音乐',
    en: 'NetEase Music',
    color: '#C20C0C',
    colorSoft: 'rgba(194,12,12,0.10)',
    home: 'https://music.163.com/',
    hosts: ['music.163.com', '163.com'],
    searchUrl: neteaseSearch,
    categories: [
      { name: '首页推荐', url: 'https://music.163.com/', icon: 'home' },
      neteaseCat('热歌榜'),
      neteaseCat('民谣'),
      neteaseCat('华语经典'),
      neteaseCat('ACG'),
      neteaseCat('轻音乐'),
    ],
  },
  {
    id: 'qqmusic',
    name: 'QQ音乐',
    en: 'QQ Music',
    color: '#31C27C',
    colorSoft: 'rgba(49,194,124,0.10)',
    home: 'https://y.qq.com/',
    hosts: ['y.qq.com', 'qq.com'],
    searchUrl: qqmusicSearch,
    categories: [
      { name: '首页推荐', url: 'https://y.qq.com/', icon: 'home' },
      qqmusicCat('热歌'),
      qqmusicCat('经典老歌'),
      qqmusicCat('影视原声'),
      qqmusicCat('民谣'),
      qqmusicCat('轻音乐'),
    ],
  },
  {
    id: 'sing5',
    name: '5sing原创音乐',
    en: '5sing Music',
    color: '#FF8A3D',
    colorSoft: 'rgba(255,138,61,0.10)',
    home: 'https://5sing.kugou.com/',
    hosts: ['5sing.kugou.com', 'kugou.com'],
    searchUrl: sing5Search,
    categories: [
      { name: '首页推荐', url: 'https://5sing.kugou.com/', icon: 'home' },
      sing5Cat('古风'),
      sing5Cat('流行'),
      sing5Cat('翻唱'),
      sing5Cat('伴奏'),
      sing5Cat('民谣'),
    ],
  },
].map((p) => Object.assign({ builtin: true }, GUEST_HOME[p.id] ? { guestHome: GUEST_HOME[p.id] } : {}, p));

/**
 * NBA 免费观看专区：官方授权渠道，点击直达对应平台的 NBA 页面。
 * badge 用于在界面上标明免费程度，避免误导用户。
 */
const NBA_SOURCES = [
  { name: 'CCTV5 体育直播', platform: 'cctv', url: 'https://tv.cctv.com/live/cctv5/', badge: '完全免费' },
  { name: '央视 NBA 专题', platform: 'cctv', url: 'https://sports.cctv.com/nba/', badge: '免费' },
  { name: '央视频（可回看）', platform: 'cctv', url: 'https://www.yangshipin.cn/', badge: '完全免费' },
  { name: '腾讯体育 NBA', platform: 'tencent', url: 'https://sports.qq.com/nba/', badge: '部分免费' },
  { name: '抖音 NBA 集锦', platform: 'douyin', url: douyinSearch('NBA'), badge: '集锦' },
  { name: 'B站 NBA 集锦', platform: 'bilibili', url: biliSearch('NBA 集锦'), badge: '集锦' },
  { name: '快手 NBA 集锦', platform: 'kuaishou', url: ksSearch('NBA'), badge: '集锦' },
];

/** 一键看球：四分屏同时打开央视 / 腾讯 / 抖音 / B站 的 NBA 页面 */
const NBA_SPLIT = [
  { id: 'cctv', url: 'https://tv.cctv.com/live/cctv5/' },
  { id: 'tencent', url: 'https://sports.qq.com/nba/' },
  { id: 'douyin', url: douyinSearch('NBA') },
  { id: 'bilibili', url: biliSearch('NBA') },
];

/** 默认聚合分屏包含的平台（列数太多会挤，其余平台可在分屏面板里勾选） */
const DEFAULT_SPLIT = ['douyin', 'bilibili', 'kuaishou'];

/** 自定义视频源的备选主色 */
const PALETTE = [
  '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#84CC16', '#EC4899', '#6366F1',
];

const MULTI_SUFFIX = [
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.jp', 'com.hk', 'com.tw', 'co.uk', 'com.au', 'com.sg',
];

/** 从主机名推断可注册域（www.bilibili.com → bilibili.com） */
function registrableDomain(host) {
  const parts = String(host || '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return MULTI_SUFFIX.includes(last2) ? parts.slice(-3).join('.') : last2;
}

const isHttpUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || ''));

function hexToSoft(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 'rgba(120,120,120,0.10)';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.10)`;
}

/** 生成自定义源 id */
function newSourceId() {
  return 'src' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/**
 * 把外部输入（表单 / AI 返回的 JSON）规整成可用的视频源对象。
 * 对缺字段做合理兜底，返回 { ok, source, error }。
 */
function normalizeSource(input) {
  const src = input && typeof input === 'object' ? input : {};
  const home = String(src.home || src.url || '').trim();
  if (!isHttpUrl(home)) return { ok: false, error: '首页地址必须是 http(s) 开头的完整网址' };

  let host = '';
  try {
    host = new URL(home).hostname;
  } catch (e) {
    return { ok: false, error: '无法解析首页地址' };
  }

  const name = String(src.name || src.title || host).trim().slice(0, 24) || host;

  // 域名白名单：外部给了就用，否则按可注册域自动推断（可覆盖所有子域）
  let hosts = [];
  if (Array.isArray(src.hosts)) hosts = src.hosts.map((h) => String(h).trim()).filter(Boolean);
  else if (typeof src.hosts === 'string') hosts = src.hosts.split(/[,，\s]+/).filter(Boolean);
  for (const h of [registrableDomain(host), host]) if (h && !hosts.includes(h)) hosts.push(h);

  // 搜索模板：必须带 {q} 且替换后是合法 URL，否则视为没有搜索能力
  let searchTemplate = String(src.searchTemplate || src.search || '').trim();
  if (searchTemplate && !searchTemplate.includes('{q}')) searchTemplate = '';
  if (searchTemplate && !isHttpUrl(searchTemplate.replace(/\{q\}/g, 'x'))) searchTemplate = '';

  const categories = (Array.isArray(src.categories) ? src.categories : [])
    .map((c) => {
      if (typeof c === 'string') {
        const [n, u] = c.split('|').map((x) => (x || '').trim());
        return n && isHttpUrl(u) ? { name: n.slice(0, 16), url: u } : null;
      }
      if (c && c.name && isHttpUrl(c.url)) return { name: String(c.name).slice(0, 16), url: c.url };
      return null;
    })
    .filter(Boolean)
    .slice(0, 20);

  if (!categories.length) categories.push({ name: '首页', url: home });

  let color = String(src.color || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    const seed = Array.from(String(name)).reduce((a, c) => a + c.charCodeAt(0), 0);
    color = PALETTE[seed % PALETTE.length];
  }

  return {
    ok: true,
    source: {
      id: src.id && /^src[0-9a-z]+$/i.test(String(src.id)) ? String(src.id) : newSourceId(),
      name,
      shortName: String(src.shortName || name).trim().slice(0, 6),
      color,
      colorSoft: hexToSoft(color),
      home,
      hosts,
      searchTemplate,
      categories,
      builtin: false,
      addedAt: src.addedAt || Date.now(),
    },
  };
}

/** 取平台/源的搜索 URL 构造函数（内置用函数，自定义用模板） */
function searchUrlOf(p) {
  if (!p) return null;
  if (typeof p.searchUrl === 'function') return p.searchUrl;
  if (p.searchTemplate && p.searchTemplate.includes('{q}')) {
    const tpl = p.searchTemplate;
    return (q) => tpl.replace(/\{q\}/g, enc(q));
  }
  return null;
}

/** 去掉不可结构化克隆的字段，供渲染进程使用 */
const toPublicPlatforms = (list) =>
  (list || BUILTIN_PLATFORMS).map(({ searchUrl, ...rest }) => rest);

/* ------------------------------------------------------------------ */
/* 按名称自动索引：输入"小红书 / 虎牙 / 微博"等，直接补全首页/搜索/分类 */
/* ------------------------------------------------------------------ */

/** 由搜索模板批量生成分类入口（名称 | 搜索结果页） */
const idxCats = (searchTpl, names) =>
  (names || []).map((n) => ({ name: n, url: searchTpl.replace(/\{q\}/g, enc(n)) }));

/**
 * 常见视频 / 直播 / 社交站点的"名称 → 配置"索引表。
 * 仅收录应用内置之外的站（内置平台已在侧栏，无需再添加，避免重复）。
 * aliases 同时收中文名、英文名、拼音，便于模糊匹配。
 */
const NAME_INDEX = [
  {
    aliases: ['微博', 'weibo', '新浪微博'],
    name: '微博',
    color: '#E6162D',
    home: 'https://weibo.com/',
    hosts: ['weibo.com', 'weibo.cn'],
    searchTemplate: 'https://s.weibo.com/weibo?q={q}',
    categories: [{ name: '首页', url: 'https://weibo.com/' }].concat(
      idxCats('https://s.weibo.com/weibo?q={q}', ['热门', '娱乐', '体育', '搞笑'])
    ),
  },
  {
    aliases: ['小红书', 'xiaohongshu', 'xhs', 'redbook'],
    name: '小红书',
    color: '#FF2442',
    home: 'https://www.xiaohongshu.com/',
    hosts: ['xiaohongshu.com', 'xhscdn.com'],
    searchTemplate: 'https://www.xiaohongshu.com/search_result?keyword={q}',
    categories: [{ name: '首页', url: 'https://www.xiaohongshu.com/' }].concat(
      idxCats('https://www.xiaohongshu.com/search_result?keyword={q}', ['穿搭', '美食', '旅行', '护肤'])
    ),
  },
  {
    aliases: ['西瓜视频', 'xigua', 'ixigua'],
    name: '西瓜视频',
    color: '#FF5C00',
    home: 'https://www.ixigua.com/',
    hosts: ['ixigua.com'],
    searchTemplate: 'https://www.ixigua.com/search/{q}',
    categories: [{ name: '首页', url: 'https://www.ixigua.com/' }].concat(
      idxCats('https://www.ixigua.com/search/{q}', ['推荐', '游戏', '影视', '音乐'])
    ),
  },
  {
    aliases: ['好看视频', 'haokan', 'baidu视频'],
    name: '好看视频',
    color: '#2932E1',
    home: 'https://haokan.baidu.com/',
    hosts: ['haokan.baidu.com'],
    searchTemplate: 'https://haokan.baidu.com/s?word={q}',
    categories: [{ name: '首页', url: 'https://haokan.baidu.com/' }].concat(
      idxCats('https://haokan.baidu.com/s?word={q}', ['推荐', '游戏', '综艺', '动漫'])
    ),
  },
  {
    aliases: ['爱奇艺', 'iqiyi'],
    name: '爱奇艺',
    color: '#00BE06',
    home: 'https://www.iqiyi.com/',
    hosts: ['iqiyi.com', 'qiyi.com'],
    searchTemplate: 'https://so.iqiyi.com/so/q_{q}',
    categories: [{ name: '首页', url: 'https://www.iqiyi.com/' }].concat(
      idxCats('https://so.iqiyi.com/so/q_{q}', ['热播', '电视剧', '电影', '综艺'])
    ),
  },
  {
    aliases: ['优酷', 'youku'],
    name: '优酷',
    color: '#1E9FFF',
    home: 'https://www.youku.com/',
    hosts: ['youku.com'],
    searchTemplate: 'https://so.youku.com/search_video/q_{q}',
    categories: [{ name: '首页', url: 'https://www.youku.com/' }].concat(
      idxCats('https://so.youku.com/search_video/q_{q}', ['热播', '电视剧', '电影', '动漫'])
    ),
  },
  {
    aliases: ['腾讯视频', 'tencentvideo', 'v.qq', 'qq视频'],
    name: '腾讯视频',
    color: '#FF6022',
    home: 'https://v.qq.com/',
    hosts: ['v.qq.com', 'qq.com'],
    searchTemplate: 'https://v.qq.com/x/search/?q={q}',
    categories: [{ name: '首页', url: 'https://v.qq.com/' }].concat(
      idxCats('https://v.qq.com/x/search/?q={q}', ['热播', '电视剧', '电影', '综艺'])
    ),
  },
  {
    aliases: ['芒果tv', '芒果', 'mgtv'],
    name: '芒果TV',
    color: '#FEA700',
    home: 'https://www.mgtv.com/',
    hosts: ['mgtv.com'],
    searchTemplate: 'https://so.mgtv.com/so?k={q}',
    categories: [{ name: '首页', url: 'https://www.mgtv.com/' }].concat(
      idxCats('https://so.mgtv.com/so?k={q}', ['热播', '综艺', '电视剧', '电影'])
    ),
  },
  {
    aliases: ['acfun', 'A站', 'af'],
    name: 'AcFun',
    color: '#FDB306',
    home: 'https://www.acfun.cn/',
    hosts: ['acfun.cn'],
    searchTemplate: 'https://www.acfun.cn/search?keyword={q}',
    categories: [{ name: '首页', url: 'https://www.acfun.cn/' }].concat(
      idxCats('https://www.acfun.cn/search?keyword={q}', ['动画', '游戏', '影视', '音乐'])
    ),
  },
  {
    aliases: ['搜狐视频', 'sohu', '搜狐'],
    name: '搜狐视频',
    color: '#FC2B4A',
    home: 'https://tv.sohu.com/',
    hosts: ['sohu.com'],
    searchTemplate: 'https://so.tv.sohu.com/search?q={q}',
    categories: [{ name: '首页', url: 'https://tv.sohu.com/' }].concat(
      idxCats('https://so.tv.sohu.com/search?q={q}', ['电视剧', '电影', '综艺', '动漫'])
    ),
  },
  {
    aliases: ['百度视频', 'baiduvideo'],
    name: '百度视频',
    color: '#2932E1',
    home: 'https://v.baidu.com/',
    hosts: ['v.baidu.com'],
    searchTemplate: 'https://v.baidu.com/composite?query={q}',
    categories: [{ name: '首页', url: 'https://v.baidu.com/' }].concat(
      idxCats('https://v.baidu.com/composite?query={q}', ['推荐', '电影', '电视剧', '综艺'])
    ),
  },
  {
    aliases: ['微视', 'weishi'],
    name: '微视',
    color: '#1E9FFF',
    home: 'https://weishi.qq.com/',
    hosts: ['weishi.qq.com', 'qq.com'],
    searchTemplate: '',
    categories: [{ name: '首页', url: 'https://weishi.qq.com/' }],
  },
  {
    aliases: ['网易云音乐', '网易云', 'music163', '163music'],
    name: '网易云音乐',
    color: '#C20C0C',
    home: 'https://music.163.com/',
    hosts: ['music.163.com'],
    searchTemplate: 'https://music.163.com/#/search/m/?s={q}',
    categories: [{ name: '首页', url: 'https://music.163.com/' }].concat(
      idxCats('https://music.163.com/#/search/m/?s={q}', ['推荐', '排行榜', '歌单', 'MV'])
    ),
  },
  {
    aliases: ['今日头条', '头条', 'toutiao'],
    name: '今日头条',
    color: '#F04142',
    home: 'https://www.toutiao.com/',
    hosts: ['toutiao.com', 'toutiaoapi.com'],
    searchTemplate: 'https://so.toutiao.com/search?keyword={q}',
    categories: [{ name: '首页', url: 'https://www.toutiao.com/' }].concat(
      idxCats('https://so.toutiao.com/search?keyword={q}', ['推荐', '热点', '视频', '科技'])
    ),
  },
  {
    aliases: ['知乎', 'zhihu'],
    name: '知乎',
    color: '#0066FF',
    home: 'https://www.zhihu.com/',
    hosts: ['zhihu.com'],
    searchTemplate: 'https://www.zhihu.com/search?q={q}',
    categories: [{ name: '首页', url: 'https://www.zhihu.com/' }].concat(
      idxCats('https://www.zhihu.com/search?q={q}', ['推荐', '热榜', '视频', '科技'])
    ),
  },
  {
    aliases: ['微信视频号', '视频号', 'channels'],
    name: '微信视频号',
    color: '#07C160',
    home: 'https://channels.weixin.qq.com/',
    hosts: ['channels.weixin.qq.com', 'weixin.qq.com'],
    searchTemplate: '',
    categories: [{ name: '首页', url: 'https://channels.weixin.qq.com/' }],
  },
];

/**
 * 按名称（中文名 / 英文名 / 拼音别名）查找索引，返回可直接填表的视频源配置。
 * @returns {{ok:boolean, source?:object, error?:string}}
 */
function indexSourceByName(raw) {
  const q = String(raw || '').trim().toLowerCase();
  if (!q) return { ok: false, error: '请输入要查找的名称' };

  const hit =
    NAME_INDEX.find((e) => e.aliases.some((a) => a.toLowerCase() === q)) ||
    NAME_INDEX.find((e) => e.aliases.some((a) => q.includes(a.toLowerCase()) || a.toLowerCase().includes(q)));
  if (!hit) {
    return { ok: false, error: `未找到「${raw}」的索引，可粘贴网址用 AI 识别，或在侧栏直接打开已内置的平台` };
  }
  const res = normalizeSource({
    home: hit.home,
    name: hit.name,
    color: hit.color,
    hosts: hit.hosts,
    searchTemplate: hit.searchTemplate,
    categories: hit.categories,
  });
  return res.ok ? { ok: true, source: res.source } : { ok: false, error: res.error };
}

module.exports = {
  BUILTIN_PLATFORMS,
  PALETTE,
  NBA_SOURCES,
  NBA_SPLIT,
  DEFAULT_SPLIT,
  normalizeSource,
  searchUrlOf,
  registrableDomain,
  hexToSoft,
  toPublicPlatforms,
  NAME_INDEX,
  indexSourceByName,
};
