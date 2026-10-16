// @ts-check
/**
 * Agent 预设（社区版叫「模式」）选择器
 *
 * 官方版实测（2026-10 真机探测）：模式选择从「侧栏无 aria-label 的 hasPopup=menu 按钮」
 * （旧 WorkspacePage.modeButton 的假设，在前端重建后已不成立）迁移到
 * **首页 hero 区**的 Agent 预设 chip：
 *   [data-slot="conversation.hero.agentPreset"] button[aria-haspopup="menu"]
 *   按钮文本即当前预设名（如「标准模式」）
 *
 * 实测菜单项（本部署）：标准模式 / PTC 模式 / 极简模式 / 创造模式
 * ——社区版的「外贸专家」在官方版全库 0 命中，已移除。
 * 菜单项文本带描述行（多行），匹配时取首行。
 */
const { BasePage } = require('./BasePage');

class AgentPresetPage extends BasePage {
  /** Agent 预设 chip（只在首页 hero 态渲染；会话进行中不显示） */
  button() {
    return this.page.locator('[data-slot="conversation.hero.agentPreset"] button[aria-haspopup="menu"]').first();
  }

  /** 当前预设名 */
  async current() {
    return (await this.button().innerText()).trim();
  }

  /** 打开菜单并返回全部预设名（每项取首行，剥掉描述） */
  async openMenu() {
    await this.button().click();
    await this.page.locator('[role="menuitem"]').first().waitFor({ timeout: 10000 });
    const names = await this.page.locator('[role="menuitem"]').allInnerTexts();
    return names.map(t => t.trim().split('\n')[0].trim());
  }

  closeMenu() {
    return this.page.keyboard.press('Escape');
  }

  /** 切换到指定预设并等按钮文本更新 */
  async switchTo(name) {
    await this.button().click();
    await this.page.getByRole('menuitem', { name: new RegExp(`^${name}`) }).first().click();
    await this.button().filter({ hasText: name }).waitFor({ timeout: 15000 });
    return this;
  }
}

module.exports = { AgentPresetPage };
