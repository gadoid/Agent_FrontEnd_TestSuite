// @ts-check
/**
 * web 服务关闭（项目 `web-server:teardown`）
 *
 * 由 `web-server` 项目的 `teardown` 指向本文件：跑完依赖它的项目后自动执行，
 * 保证即使中途有失败也会收干净（官方版的 web 进程会 spawn detached 子 host，
 * 必须整树杀，见 fixtures/web-server.js 的 killTree）。
 */
const { test: teardown } = require('@playwright/test');
const { stopWebServer } = require('../fixtures/web-server');

teardown('关闭官方版 dsh web 服务', async () => {
  teardown.setTimeout(60000);
  await stopWebServer();
});
