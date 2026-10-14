// @ts-check
/**
 * dsh 运行时状态文件管理
 *
 * 机制（用户实测提供）：dsh 每次启动会检查 .dsh-desktop-runtime.json，
 * 文件存在即判定「上次异常退出」，进入恢复流程（表现为市场入口缺失、服务行为异常等）。
 * 文件在服务运行期间由 dsh 维护（记录 childPid/desktopPid/url），属正常状态。
 *
 * 因此：负责启动 dsh 的脚本（electron 桌面端 / 服务恢复）必须先判断——
 * 服务未运行时若该文件存在，即为异常退出残留，删除后再启动。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { loadEnv } = require('./env');

// 机器相关配置统一走 .env（见 .env.example），命令行/CI 环境变量优先
loadEnv();

/** 运行时状态文件默认路径（桌面客户端 home 下） */
const RUNTIME_STATE_FILE = path.join(
  os.homedir(), '.bruc3van-dsh-desktop', 'dsh', '.dsh-desktop-runtime.json'
);

/**
 * 探测端口是否无监听（服务未运行）。
 * 能绑上 = 端口空闲 = 无服务；EADDRINUSE = 服务在跑。
 */
function isServiceDown(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false)); // 端口被占 → 服务在运行
    srv.once('listening', () => srv.close(() => resolve(true))); // 绑定成功 → 无服务
    srv.listen(port, host);
  });
}

/** 从 DSH_URL 派生服务端口（迁移到非默认端口部署时无需改代码） */
function servicePort() {
  try {
    return new URL(process.env.DSH_URL || 'http://127.0.0.1:3080').port || 3080;
  } catch {
    return 3080;
  }
}

/**
 * 启动 dsh 前清理异常退出残留的状态文件。
 * 仅当「服务未运行 且 文件存在」时删除（运行中该文件是正常状态，不能动）。
 *
 * @returns {Promise<boolean>} 是否执行了删除
 */
async function ensureCleanRuntimeState({
  port = servicePort(),
  file = RUNTIME_STATE_FILE,
  logger = () => {},
} = {}) {
  if (!fs.existsSync(file)) return false;
  if (!(await isServiceDown(port))) {
    logger(`服务运行中（:${port}），运行时状态文件属正常状态，保留`);
    return false;
  }
  fs.rmSync(file, { force: true });
  logger(`服务未运行且状态文件残留（上次异常退出），已删除: ${file}`);
  return true;
}

module.exports = { ensureCleanRuntimeState, isServiceDown, RUNTIME_STATE_FILE, servicePort };
