/**
 * 免安装便携版打包脚本
 * 直接复用已下载的 Electron 运行时，把应用放进 resources/app，
 * 生成 dist/VideoHub/VideoHub.exe（双击即可运行，无需 Node 环境）。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'VideoHub');
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');

if (!fs.existsSync(electronDist)) {
  console.error('未找到 Electron 运行时，请先执行 npm install');
  process.exit(1);
}

// 只清理应用代码目录（文件数少）；Electron 运行时体积大且基本不变，走覆盖即可，
// 避免整目录批量删除
const staleApp = path.join(out, 'resources', 'app');
if (fs.existsSync(staleApp)) fs.rmSync(staleApp, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1. 复制 Electron 运行时
fs.cpSync(electronDist, out, { recursive: true });

// 2. 放入应用代码
const appDir = path.join(out, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });
fs.cpSync(path.join(root, 'src'), path.join(appDir, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'assets'), path.join(appDir, 'assets'), { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const runtimePkg = {
  name: pkg.name,
  productName: pkg.productName,
  version: pkg.version,
  description: pkg.description,
  main: pkg.main,
  author: pkg.author,
  license: pkg.license,
};
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(runtimePkg, null, 2));

// 3. 重命名可执行文件，并清理默认应用
const oldExe = path.join(out, 'electron.exe');
const newExe = path.join(out, 'VideoHub.exe');
if (fs.existsSync(oldExe)) fs.renameSync(oldExe, newExe);
const defaultApp = path.join(out, 'resources', 'default_app.asar');
if (fs.existsSync(defaultApp)) fs.rmSync(defaultApp, { force: true });

// 4. 便捷启动脚本
fs.writeFileSync(
  path.join(out, '启动 VideoHub.bat'),
  ['@echo off', 'cd /d "%~dp0"', 'start "" "%~dp0VideoHub.exe"', ''].join('\r\n'),
  'utf8'
);

// 5. 简易说明
fs.writeFileSync(
  path.join(out, '使用说明.txt'),
  [
    'VideoHub · 视频聚合台（免安装便携版）',
    '',
    '双击 "VideoHub.exe" 或 "启动 VideoHub.bat" 即可运行，无需安装 Node.js。',
    '',
    '聚合平台：抖音 / 哔哩哔哩 / 快手 / 央视网 / 腾讯体育',
    '',
    'NBA 免费观看（侧栏「NBA 免费专区」直达，均为官方授权渠道）：',
    '  CCTV5 体育直播           完全免费，每周约 3-4 场 NBA',
    '  央视频（CCTV5 同步）      完全免费，可回看',
    '  央视 NBA 专题            免费集锦与赛事资讯',
    '  腾讯体育 NBA             每周部分场次免费（需登录）',
    '  抖音 / B站 / 快手 NBA     免费集锦',
    '  点「一键四分屏看球」可同时打开四个渠道',
    '',
    '快捷键：',
    '  Ctrl + 1 / 2 / 3 / 4 / 5   切换 抖音 / B站 / 快手 / 央视网 / 腾讯体育',
    '  Ctrl + Shift + S          单平台 / 聚合分屏 切换',
    '  Ctrl + F                  定位搜索框',
    '  Ctrl + D                  收藏当前页面',
    '  Alt + ← / →               后退 / 前进',
    '  F5                        刷新当前平台',
    '  Ctrl + B                  收起 / 展开侧栏',
    '',
    '说明：站内链接一律在当前窗口内打开，不会弹出新窗口；',
    '      站外链接会交给系统默认浏览器。',
    '',
    '数据（收藏、历史、登录状态）保存在：',
    '  %APPDATA%\\VideoHub',
    '',
  ].join('\r\n'),
  'utf8'
);

function sizeOf(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += sizeOf(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

console.log('打包完成：' + newExe);
console.log('体积：' + (sizeOf(out) / 1024 / 1024).toFixed(1) + ' MB');
