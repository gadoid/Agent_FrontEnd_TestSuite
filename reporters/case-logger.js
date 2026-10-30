// @ts-check
/**
 * 控制台用例描述打印 —— 每条用例开始时输出「套件 › 标题 + 用例描述」。
 *
 * 描述复用 fixtures/test-data/case-catalog.js 的提取逻辑（TEST-CASES.md 为单一事实源），
 * 与 HTML 报告注解同源；结果行（✓/✘/耗时/重试）仍由 list reporter 输出，这里不重复。
 *
 * 接线：playwright.config.js → reporter: [..., ['./reporters/case-logger.js']]
 */
const { describeTitle } = require('../fixtures/test-data/case-catalog');

class CaseLogger {
  /** @param {import('@playwright/test').TestCase} test */
  onTestBegin(test) {
    const suite = test.parent && test.parent.title ? `${test.parent.title} › ` : '';
    const lines = [`\n▶ ${suite}${test.title}`];
    const desc = describeTitle(test.title);
    if (desc) for (const d of desc.split('\n')) lines.push(`  │ ${d}`);
    console.log(lines.join('\n'));
  }
}

module.exports = CaseLogger;
