/**
 * 用本机 Inno Setup 把便携版打包成 Windows 安装程序。
 *
 * 用法：node tools/build-installer.js [--rebuild]
 *   --rebuild  先重新生成便携版 dist/VideoHub，再打安装包
 *
 * 产物：dist/installer/VideoHub-Setup-<version>.exe
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const portableDir = path.join(root, 'dist', 'VideoHub');
const outDir = path.join(root, 'dist', 'installer');
const innoDir = path.join(__dirname, 'inno');
const issTemplate = path.join(innoDir, 'installer.iss');
const islFile = path.join(innoDir, 'ChineseSimplified.isl');

function fail(msg) {
  console.error('BUILD_INSTALLER_FAIL: ' + msg);
  process.exit(1);
}

/** 定位 ISCC.exe */
function findISCC() {
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const candidates = [
    path.join(pf86, 'Inno Setup 6', 'ISCC.exe'),
    path.join(pf, 'Inno Setup 6', 'ISCC.exe'),
    path.join(pf86, 'Inno Setup 5', 'ISCC.exe'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;

  const w = spawnSync('where.exe', ['ISCC.exe'], { encoding: 'utf8', windowsHide: true });
  if (w.status === 0 && w.stdout) {
    const hit = w.stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (hit && fs.existsSync(hit.trim())) return hit.trim();
  }
  return null;
}

// 1. 便携版是否已存在
if (process.argv.includes('--rebuild') || !fs.existsSync(path.join(portableDir, 'VideoHub.exe'))) {
  console.log('[1/4] 生成便携版 ...');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'build-portable.js')], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) fail('便携版生成失败：\n' + (r.stderr || r.stdout || '未知错误'));
} else {
  console.log('[1/4] 复用已有便携版 dist/VideoHub');
}
if (!fs.existsSync(path.join(portableDir, 'VideoHub.exe'))) fail('找不到便携版 ' + portableDir);

// 2. 依赖文件检查
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (!fs.existsSync(issTemplate)) fail('缺少安装脚本 ' + issTemplate);
if (!fs.existsSync(islFile)) fail('缺少简体中文语言文件 ' + islFile);

const iscc = findISCC();
if (!iscc) fail('未找到 Inno Setup（ISCC.exe）。请安装 Inno Setup 6 或改用便携版 dist/VideoHub。');
console.log('[2/4] ISCC = ' + iscc);

// ISS 里含中文，ISCC 必须以 UTF-8 BOM 读取，否则向导界面会出现乱码
const buildIss = path.join(innoDir, 'installer.build.iss');
const src = fs.readFileSync(issTemplate, 'utf8').replace(/^\uFEFF/, '');
fs.writeFileSync(buildIss, '\uFEFF' + src, 'utf8');
fs.mkdirSync(outDir, { recursive: true });
// 清掉上次编译残留，避免同名文件导致 ISCC 或后续改名失败
for (const stale of ['mysetup.exe', `VideoHub-Setup-${version}.exe`, 'compile.log']) {
  const f = path.join(outDir, stale);
  if (fs.existsSync(f)) fs.rmSync(f, { force: true });
}

console.log('[3/4] 编译安装包（约 270MB 源文件，需要几分钟）...');
const t0 = Date.now();
const r = spawnSync(
  iscc,
  [buildIss, '/Qp', `/DMyAppVersion=${version}`, `/O${outDir}`],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, cwd: innoDir }
);
const log = ((r.stdout || '') + (r.stderr || '')).trim();
if (log) console.log(log.split(/\r?\n/).filter((l) => l.trim()).join('\n'));
if (r.status !== 0) {
  // 失败时保留中间脚本，方便对照行号排查
  try { fs.writeFileSync(path.join(outDir, 'compile.log'), log, 'utf8'); } catch (e) { /* ignore */ }
  fail('ISCC 编译失败，exit code = ' + r.status + '，中间脚本：' + buildIss);
}
fs.rmSync(buildIss, { force: true });

const outExe = path.join(outDir, `VideoHub-Setup-${version}.exe`);

// 个别环境下 ISCC 会把产物留在默认名 mysetup.exe，做一次兜底改名
if (!fs.existsSync(outExe)) {
  for (const alt of ['mysetup.exe', `${path.basename(outExe)}`]) {
    const cand = path.join(outDir, alt);
    if (fs.existsSync(cand)) {
      fs.renameSync(cand, outExe);
      console.log('  （检测到 ISCC 未应用 OutputBaseFilename，已把 ' + alt + ' 改名为 ' + path.basename(outExe) + '）');
      break;
    }
  }
}

if (!fs.existsSync(outExe)) fail('未产出安装包 ' + outExe);
const mb = (fs.statSync(outExe).size / 1024 / 1024).toFixed(1);
console.log(
  '\n[4/4] 完成，用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's\n' +
  '  ' + outExe + '  ' + mb + ' MB'
);

// 顺手输出一份相对路径，方便复制
console.log('  ' + path.relative(process.cwd(), outExe));
