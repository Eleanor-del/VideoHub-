/* 冒烟测试：启动应用、等待加载、截图 UI、检查是否崩溃、然后退出 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const portable = process.env.VH_EXE;
const electron =
  portable || path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const appDir = path.join(__dirname, '..');
const args = (portable ? [] : [appDir]).concat(['--smoke', '--disable-gpu', '--no-sandbox']);
const out = path.join(__dirname, 'smoke.png');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

// 沙箱/CI 环境常缺少可用 GPU，冒烟时禁用硬件加速
const p = spawn(electron, args, { env, windowsHide: true });

let buf = '';
p.stdout.on('data', (d) => (buf += d.toString()));
p.stderr.on('data', (d) => (buf += d.toString()));

const timer = setTimeout(() => {
  console.log('TIMEOUT');
  try { p.kill(); } catch (e) {}
}, 90000);

p.on('exit', (code, sig) => {
  clearTimeout(timer);
  console.log('EXIT', 'code=' + code, 'sig=' + sig);
  console.log('SHOT', fs.existsSync(out) ? out + ' (' + fs.statSync(out).size + ' bytes)' : 'NO SCREENSHOT');
  const lines = buf.split(/\r?\n/).filter((l) => /error|Error|Uncaught|Unhandled|failed|not defined|SyntaxError|Cannot read/.test(l));
  console.log('--- 关键日志 ---');
  console.log(lines.slice(0, 40).join('\n') || '(无错误日志)');
  console.log('--- 末尾输出 ---');
  console.log(buf.split(/\r?\n/).slice(-8).join('\n'));
});
