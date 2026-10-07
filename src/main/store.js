const fs = require('fs');
const path = require('path');

/** 轻量 JSON 持久化（收藏 / 历史 / 偏好设置），存放在 userData 目录 */
class Store {
  constructor(filePath) {
    this.file = filePath;
    this.data = this.read();
    this.timer = null;
  }

  read() {
    try {
      if (fs.existsSync(this.file)) {
        return JSON.parse(fs.readFileSync(this.file, 'utf8'));
      }
    } catch (e) {
      console.warn('[store] 读取失败，将使用默认配置', e.message);
    }
    return {};
  }

  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.warn('[store] 写入失败', e.message);
    }
  }

  get(key, fallback) {
    const v = this.data[key];
    return v === undefined ? fallback : v;
  }

  set(key, value) {
    this.data[key] = value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  /** 同步落盘，退出前调用 */
  save() {
    if (this.timer) clearTimeout(this.timer);
    this.flush();
  }
}

module.exports = { Store };
