// @ts-check
/**
 * 极简 .env 加载器（零依赖，供 config / fixtures / setup 各入口显式引入）
 *
 * 目的：项目迁移到其他 PC 时，机器相关配置（token、桌面端路径、服务地址）
 * 全部收敛到项目根的 .env（从 .env.example 复制填写），代码零改动。
 * 已存在的环境变量优先（允许 CI 或命令行临时覆盖 .env）。
 */
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

function loadEnv(file = ENV_FILE) {
  if (!fs.existsSync(file)) return {};
  const overrides = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // 去掉成对引号
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
      overrides[key] = val;
    }
  }
  return overrides;
}

module.exports = { loadEnv, ENV_FILE };
