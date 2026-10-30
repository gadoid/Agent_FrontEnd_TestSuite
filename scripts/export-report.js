// @ts-check
/**
 * 报告归档：把最近一轮的自包含 HTML 报告（playwright-report/）按时间戳复制到 reports/ 下。
 *
 * 背景：每轮跑完 playwright test 都会**覆盖** playwright-report/，需要留档对比时
 * 在跑完后立即执行 `npm run report:export`。目录自包含（含结束截图/失败截图/trace），
 * 接收方 `npx playwright show-report <目录>` 或任意静态服务器即可打开。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'playwright-report');
const DEST_DIR = path.join(__dirname, '..', 'reports');

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error('✘ 未找到 playwright-report/index.html —— 先跑一轮用例生成报告（npm run test:electron / npm run test:web）。');
  process.exit(1);
}

const d = new Date();
const p = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
const dest = path.join(DEST_DIR, `e2e-report-${stamp}`);

fs.cpSync(SRC, dest, { recursive: true });

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name));
    else files.push(fs.statSync(path.join(dir, e.name)).size);
  }
})(dest);
const mb = (files.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(1);

console.log(`✔ 报告已归档: ${dest}（${files.length} 个文件，${mb} MB）`);
console.log(`  本地查看: npx playwright show-report "${path.relative(process.cwd(), dest)}"`);
