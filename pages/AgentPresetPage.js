// @ts-check
/**
 * Agent 预设（eline 叫「模式」）选择器
 *
 * eline 实测（2026-10，eline.exe v0.2.0-rc.2）：首页 hero 区的 Agent 预设 chip：
 *   [data-slot="conversation.hero.agentPreset"] button[aria-haspopup="menu"]
 *   按钮无 aria-label，靠 title="选择新任务使用的 Agent 预设" 与文本定位（双保险）。
 *
 * 实测菜单项（本部署）：外贸专家模式 / 标准模式 / PTC 模式 / 极简模式 / 创造模式
 * ——「外贸专家模式」为 eline 特有（部署 persona，官方版没有）；菜单项文本带描述行，匹配取首行。
 */
const { BasePage } = require('./BasePage');
const { AGENT_MODES } = require('../fixtures/test-data/ui-catalog');

/** eline 部署实测存在的模式（数据源：fixtures/test-data/ui-catalog.js） */
const MODES = AGENT_MODES;

class AgentPresetPage extends BasePage {
  /** Agent 预设 chip（只在首页 hero 态渲染；会话进行中不显示） */
  button() {
    return this.page
      .locator('[data-slot="conversation.hero.agentPreset"] button[aria-haspopup="menu"], button[title*="Agent 预设"]')
      .first();
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

module.exports = { AgentPresetPage, AGENT_MODES: MODES };
