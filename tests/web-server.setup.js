// @ts-check
/**
 * web 服务启动（项目 `web-server`）
 *
 * 为什么用「项目」而不是 globalSetup：Playwright 的 webServer 与 globalSetup 都是
 * **配置级全局**，跑 `--project=electron` 时也会执行。做成项目后由 `setup`/`web-chromium`
 * 声明 `dependencies: ['web-server']`，而 electron 项目**不声明依赖**，
 * 于是 `--project=electron` 天然不会启动 web 服务——两轮分离由依赖图保证，不靠约定。
 */
const { test: setup } = require('@playwright/test');
const { startWebServer } = require('../fixtures/web-server');

setup('启动官方版 dsh web 服务', async () => {
  setup.setTimeout(180000);
  const info = await startWebServer();
  setup.info().annotations.push({
    type: 'note',
    description: `web 服务: ${info.url}${info.external ? '（外部/复用）' : ` pid=${info.pid}`}`,
  });
});
