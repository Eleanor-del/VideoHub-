/**
 * 视频源智能识别
 *
 * 输入一个站点地址，自动推断出可作为「视频源」的配置：
 *   名称 / 主色 / 首页 / 域名白名单 / 搜索地址模板 / 分类导航
 *
 * 思路：抓首页 HTML（走 Electron 的 Chromium 网络栈，UA 与内嵌视图一致），
 * 先解析页面里的搜索表单，再对常见的搜索 URL 形态逐个探测，命中即用。
 * 全程本地完成，不依赖任何外部服务；识别结果会交给用户在表单里确认后再保存。
 */
const { net } = require('electron');
const { normalizeSource } = require('../shared/platforms');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const PROBE_KEYWORD = 'NBA';

/** 常见搜索地址形态，{q} 为关键词占位 */
const SEARCH_PATTERNS = [
  '/search?keyword={q}',
  '/search?q={q}',
  '/search?query={q}',
  '/search?wd={q}',
  '/search?word={q}',
  '/search?searchKey={q}',
  '/search/video?searchKey={q}',
  '/search/{q}',
  '/s?q={q}',
  '/so?q={q}',
];

const SKIP_LINK_TEXT =
  /^(登录|注册|登陆|下载|客户端|app|首页|home|更多|全部|关于|帮助|反馈|隐私|协议|招聘|联系|english|中文|设置|我的|消息|客服|顶部|返回|上一页|下一页)$/i;

function fetchText(url, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const req = net.request({ method: 'GET', url, redirect: 'follow' });
      req.setHeader('User-Agent', UA);
      req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8');
      const timer = setTimeout(() => {
        try {
          req.abort();
        } catch (e) {
          /* ignore */
        }
        done(null);
      }, timeoutMs);

      req.on('response', (res) => {
        if (res.statusCode >= 400) {
          clearTimeout(timer);
          done(null);
          try {
            req.abort();
          } catch (e) {
            /* ignore */
          }
          return;
        }
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString();
          if (body.length > 500000) {
            clearTimeout(timer);
            done(body);
            try {
              req.abort();
            } catch (e) {
              /* ignore */
            }
          }
        });
        res.on('end', () => {
          clearTimeout(timer);
          done(body);
        });
        res.on('error', () => {
          clearTimeout(timer);
          done(null);
        });
      });
      req.on('error', () => {
        clearTimeout(timer);
        done(null);
      });
      req.end();
    } catch (e) {
      done(null);
    }
  });
}

const decodeEntities = (s) =>
  String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));

/** 从 <title> 提取站点名：去掉常见后缀 */
function pickName(html) {
  const m = /<title[^>]*>([\s\S]{1,200}?)<\/title>/i.exec(html);
  if (!m) return '';
  let t = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
  t = t.split(/\s*[|｜\-–—_·]+\s*/)[0].trim();
  return t.slice(0, 24);
}

function pickColor(html) {
  const m =
    /<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i.exec(html);
  const c = m && m[1] ? m[1].trim() : '';
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '';
}

/** 找页面里的搜索表单，拼出搜索模板 */
function searchFromForm(html, base) {
  const forms = html.match(/<form[\s\S]{0,2000}?<\/form>/gi) || [];
  for (const f of forms) {
    const inputM = /<input[^>]+(?:type=["'](?:text|search)["'][^>]*)?name=["']([^"']+)["']/i.exec(f);
    if (!inputM) continue;
    const actionM = /action=["']([^"']*)["']/i.exec(f);
    const action = actionM ? actionM[1] : '';
    if (/search|so|find|result/i.test(action + ' ' + inputM[1]) === false) continue;
    let url;
    try {
      url = new URL(action || '/search', base).toString();
    } catch (e) {
      continue;
    }
    if (url.includes('{q}')) continue;
    return url + (url.includes('?') ? '&' : '?') + inputM[1] + '={q}';
  }
  return '';
}

/** 抓取导航链接作为分类候选 */
function pickCategories(html, origin) {
  const out = [];
  const seen = new Set();
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{1,40}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 10) {
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2 || text.length > 10) continue;
    if (SKIP_LINK_TEXT.test(text)) continue;
    let abs;
    try {
      abs = new URL(m[1], origin);
    } catch (e) {
      continue;
    }
    if (abs.origin !== origin) continue;
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp)$/i.test(abs.pathname)) continue;
    const key = text + '|' + abs.pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: text, url: abs.toString() });
  }
  return out;
}

/** 逐个探测搜索模板，返回第一个可用的 */
async function probeSearchTemplate(origin, candidates) {
  for (const tpl of candidates) {
    const testUrl = tpl.replace(/\{q\}/g, encodeURIComponent(PROBE_KEYWORD));
    const html = await fetchText(testUrl, 6000);
    if (!html || html.length < 400) continue;
    // 结果页通常会出现关键词，或至少不是首页复制
    if (html.includes(PROBE_KEYWORD) || /search|so\b|result/i.test(tpl)) {
      return tpl;
    }
  }
  return '';
}

/**
 * 主入口：识别一个站点
 * @returns {Promise<{ok:boolean, source?:object, detected?:object, notes:string[], error?:string}>}
 */
async function detectSource(rawUrl) {
  const input = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(input)) return { ok: false, error: '请输入 http(s) 开头的完整地址' };

  let origin = '';
  let home = input;
  try {
    const u = new URL(input);
    origin = u.origin;
    home = u.toString();
  } catch (e) {
    return { ok: false, error: '地址格式不正确' };
  }

  const notes = [];
  const html = await fetchText(home, 9000);
  if (!html) {
    notes.push('首页抓取失败（站点可能限制非浏览器访问），已按地址生成基础配置');
    const base = normalizeSource({ home, name: new URL(origin).hostname });
    return { ok: true, source: base.source, detected: { name: false, search: false, categories: false }, notes };
  }

  const name = pickName(html);
  if (name) notes.push(`名称：取自页面标题「${name}」`);

  const color = pickColor(html);
  if (color) notes.push(`主色：取自 theme-color ${color}`);

  const formTpl = searchFromForm(html, home);
  let searchTemplate = '';
  if (formTpl) {
    const ok = await probeSearchTemplate(origin, [formTpl]);
    if (ok) {
      searchTemplate = ok;
      notes.push(`搜索：解析页内搜索表单得到 ${ok}`);
    }
  }
  if (!searchTemplate) {
    const candidates = SEARCH_PATTERNS.map((p) => origin + p);
    const ok = await probeSearchTemplate(origin, candidates);
    if (ok) {
      searchTemplate = ok;
      notes.push(`搜索：试探命中常用形式 ${ok.replace(origin, '')}`);
    } else {
      notes.push('搜索：未识别到可用的搜索地址，可留空（该源将不参与统一搜索）');
    }
  }

  const categories = pickCategories(html, origin);
  if (categories.length) notes.push(`分类：从导航抓取 ${categories.length} 个入口`);

  const normalized = normalizeSource({
    home,
    name: name || new URL(origin).hostname,
    color,
    searchTemplate,
    categories,
  });
  if (!normalized.ok) return { ok: false, error: normalized.error };

  return {
    ok: true,
    source: normalized.source,
    detected: {
      name: !!name,
      color: !!color,
      search: !!searchTemplate,
      categories: categories.length,
    },
    notes,
  };
}

module.exports = { detectSource };
