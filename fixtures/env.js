// @ts-check
/**
 * 极简 .env 加载器（零依赖，供 config / fixtures / setup 各入口显式引入）
 *
 * 目的：项目迁移到其他 PC 时，机器相关配置（桌面端 exe、服务地址等）
 * 全部收敛到项目根的 .env（从 .env.example 复制填写），代码零改动。
 * 已存在的环境变量优先（允许 CI 或命令行临时覆盖 .env）。
 *
 * ⚠️ 键名必须用 `E2E_` 前缀，**不得出现 `DSH_` / `XDG_` / `DYLD_` / `BASH_FUNC_` 前缀**：
 * 官方版 DeepSeek Harness 启动时会读取**当前工作目录**的 .env，命中这些前缀即判定
 * 为「只有启动环境才能设置的变量」并抛错退出，表现为应用根本起不来。
 * assertEnvFileSafe() 把这个坑钉死在套件侧，见下方。
 */
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

/**
 * 官方版禁止出现在 .env 里的前缀（来自 dsh-app-boot 的 BOOTSTRAP_PREFIXES）。
 * 命中任何一个，任何以项目根为 cwd 启动的官方版进程都会启动失败。
 */
const BOOTSTRAP_PREFIXES = ['DSH_', 'XDG_', 'DYLD_', 'BASH_FUNC_'];
/** 另有若干单独受限的名字（与官方版语义一致：进程如何启动/去哪加载代码/如何联网） */
const BOOTSTRAP_NAMES = new Set([
  'PATH', 'HOME', 'NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
]);

/** 解析 .env 的键名（不取值） */
function envKeys(file) {
  if (!fs.existsSync(file)) return [];
  const keys = [];
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    keys.push(line.slice(0, eq).trim());
  }
  return keys;
}

/**
 * 守卫：.env 里不得出现会毒死官方版的键名。
 * 命中即抛出可读错误（含正确做法），避免日后有人加回 `DSH_*` 导致应用莫名起不来。
 */
function assertEnvFileSafe(file = ENV_FILE) {
  const bad = envKeys(file).filter(k =>
    BOOTSTRAP_PREFIXES.some(p => k.startsWith(p)) || BOOTSTRAP_NAMES.has(k));
  if (!bad.length) return;
  throw new Error([
    `.env 含有会让官方版 DeepSeek Harness 启动失败的键名: ${bad.join(', ')}`,
    `原因：官方版启动会读取当前工作目录的 .env，命中 ${BOOTSTRAP_PREFIXES.join(' / ')} 等前缀`,
    '（或 PATH / NODE_OPTIONS / *_PROXY 等启动环境专属变量）时会直接抛错退出。',
    '正确做法：',
    '  1) 机器相关配置一律用 E2E_ 前缀写进 .env；',
    '  2) 确实需要给应用传 DSH_* 时，用真实环境变量 export，不要写进 .env。',
    `文件: ${file}`,
  ].join('\n'));
}

/**
 * 被测应用所需的 LLM 凭据环境变量。
 *
 * 官方版默认模型走 `deepseek-account` 路由，其凭据解析顺序是「凭据服务 → 启动环境变量」，
 * 因此这里把套件配置的 key 注入到我们拉起的子进程环境即可，无需改应用的凭据存储。
 *
 * 来源优先级：E2E_LLM_API_KEY（.env）→ 进程环境变量 DEEPSEEK_API_KEY。
 * 未配置时返回空对象，应用会照常报 MISSING_CREDENTIAL（便于定位）。
 */
function llmEnv() {
  const key = readEnv('E2E_LLM_API_KEY', ['DEEPSEEK_API_KEY']);
  return key ? { DEEPSEEK_API_KEY: key } : {};
}

function loadEnv(file = ENV_FILE) {
  assertEnvFileSafe(file);
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

/**
 * 读取配置项：`E2E_*` 优先，其次回落到**进程环境变量**里的旧名。
 * 只回落进程环境（支持命令行/CI 临时覆盖），**绝不回落 .env 文件内容**——文件必须保持无毒。
 */
function readEnv(name, legacyNames = []) {
  if (process.env[name]) return process.env[name];
  for (const old of legacyNames) {
    if (process.env[old]) return process.env[old];
  }
  return '';
}

module.exports = {
  loadEnv,
  readEnv,
  llmEnv,
  assertEnvFileSafe,
  envKeys,
  ENV_FILE,
  BOOTSTRAP_PREFIXES,
  BOOTSTRAP_NAMES,
};
