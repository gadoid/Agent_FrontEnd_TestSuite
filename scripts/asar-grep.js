// @ts-check
// 在 asar 全包里搜指定字符串（默认 deepseek-flash / model-lock），定位引用来源。
const { execFileSync } = require('child_process');
const ASAR = process.env.ASAR_PATH || 'D:\\ElineAI\\resources\\app.asar';
const RD = 'scripts/asar-read.js';
const NEEDLES = (process.argv[2] || 'deepseek-flash,model-lock,modelLock').split(',');

const list = execFileSync('node', [RD, ASAR, 'list', 'dsh/node_modules/@deepseek-ai'], { encoding: 'utf8' });
const pkgs = list.split('\n').map(l => l.replace(/\/$/, '').split('\t')[0]).filter(Boolean);

function scan(rel) {
  let out;
  try { out = execFileSync('node', [RD, ASAR, 'cat', rel], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }); } catch { return; }
  for (const needle of NEEDLES) {
    let i = out.indexOf(needle);
    while (i !== -1) {
      console.log(`${rel} :: ${needle} :: …${out.slice(Math.max(0, i - 90), i + 90).replace(/\n/g, ' ')}…`);
      i = out.indexOf(needle, i + 1);
      if (i > 2e9) break;
    }
  }
}

scan('lib/main.js');
scan('dsh/package.json');
for (const name of pkgs) {
  scan(`dsh/node_modules/@deepseek-ai/${name}/lib/index.js`);
  scan(`dsh/node_modules/@deepseek-ai/${name}/lib/client.js`);
}
console.log('done');
