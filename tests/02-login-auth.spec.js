// @ts-check
/**
 * 模块二：登录 / 认证
 * M2-01 签名 cookie 可认证；篡改签名/错 authority 被拒（正负例）[web]
 * M2-02 无凭证被拒 [web]
 * M2-03/M2-04 认证态开箱可用 [双端]
 *
 * 官方版起，登录态由 fixtures/dsh-credentials.js 用 .credentials.yaml 里的签名密钥
 * **离线构造**，不再走「服务启动打印 token → 换 cookie」那条会因重启而失效的路径。
 */
const { test, expect, APP_URL } = require('../fixtures/app.fixtures');
const { request: bareRequest } = require('@playwright/test');
const apiRequest = require('@playwright/test').request;

/** 把 fixtures/dsh-credentials 构造出的 cookie 转成 Playwright storageState 的一项 */
function cookieToState(cookie, authority) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: authority.split(':')[0],
    path: '/',
    expires: cookie.expiresAt ? Math.floor(cookie.expiresAt / 1000) : Math.floor(Date.now() / 1000) + 86400,
    httpOnly: true,
    secure: false,
    sameSite: 'Strict',
  };
}

test.describe('M2 登录/认证', () => {

  test('M2-01 签名 cookie 可认证，篡改/错 authority 被拒 [web]', async ({ mode }) => {
    test.skip(mode !== 'web', 'web 专属用例');
    const { buildCookie, authorityOf, readSecret } = require('../fixtures/dsh-credentials');
    const authority = authorityOf(APP_URL);
    const secret = readSecret();
    const cookie = buildCookie({ authority, secret });

    // 1) 合法签名 cookie → 200
    const ok = await apiRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [cookieToState(cookie, authority)], origins: [] },
    });
    expect((await ok.get('/')).status(), '合法签名 cookie 应被接受').toBe(200);
    await ok.dispose();

    // 2) 篡改签名 → 401（签名对象是 base64url(body) 本身，改一个字符即失效）
    const tampered = cookie.value.slice(0, -1) + (cookie.value.endsWith('A') ? 'B' : 'A');
    const bad = await apiRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [cookieToState({ name: cookie.name, value: tampered }, authority)], origins: [] },
    });
    expect((await bad.get('/')).status(), '篡改签名的 cookie 应被拒').toBe(401);
    await bad.dispose();

    // 3) authority 不匹配（cookie 名与端口强绑定）→ 401
    const wrongPort = buildCookie({ authority: `127.0.0.1:1`, secret });
    const wrong = await apiRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [cookieToState(wrongPort, authority)], origins: [] },
    });
    expect((await wrong.get('/')).status(), 'authority 不匹配的 cookie 应被拒').toBe(401);
    await wrong.dispose();

    test.info().annotations.push({ type: 'note', description: `authority=${authority}，cookie 名=${cookie.name}` });
  });

  test('M2-02 无 token/cookie 直接访问被拒 [web]', async ({ mode }) => {
    test.skip(mode !== 'web', 'web 专属用例');
    const ctx = await bareRequest.newContext({
      baseURL: APP_URL,
      storageState: { cookies: [], origins: [] },
    });
    const resp = await ctx.get('/');
    expect([401, 403]).toContain(resp.status());
    expect((await resp.text()).toLowerCase()).toContain('auth');
    await ctx.dispose();
  });

  test('M2-03/M2-04 认证态下应用完整可用 [双端]', async ({ pages }) => {
    test.setTimeout(120000);
    await pages.sidebar.openApp();

    await expect(pages.sidebar.newSessionButton()).toBeVisible();
    // 官方版侧栏已无「选择工作区」常驻按钮（改为工作区树），改为断言树中至少有一个工作区节点
    const wsTitles = await pages.workspace.titles();
    expect(wsTitles.length, '工作区树应至少有一个工作区').toBeGreaterThan(0);
    test.info().annotations.push({ type: 'note', description: `工作区（${wsTitles.length} 个）: ${wsTitles.slice(0, 4).join(', ')}` });
  });
});
