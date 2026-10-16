// @ts-check
/**
 * 页面对象组合根：把各组件挂到一个 pages 对象上，由 fixtures 注入 spec。
 *
 * 约定：spec 只通过 pages.xxx 访问组件，选择器改动只在本目录内发生。
 * 删除的组件：MarketDialogPage（社区版「易链市场」弹窗，官方版已无对应 UI）
 */
const { SidebarPage } = require('./SidebarPage');
const { ChatComposerPage } = require('./ChatComposerPage');
const { ChatTranscriptPage } = require('./ChatTranscriptPage');
const { MessageActionsPage } = require('./MessageActionsPage');
const { ReplyMetaPage } = require('./ReplyMetaPage');
const { InputControlsPage } = require('./InputControlsPage');
const { RightPanelPage } = require('./RightPanelPage');
const { WorkspacePage } = require('./WorkspacePage');
const { AgentPresetPage } = require('./AgentPresetPage');
const { PluginManagerPage } = require('./PluginManagerPage');
const { SettingsDialogPage } = require('./SettingsDialogPage');

/**
 * @param {import('@playwright/test').Page} page
 * @param {'web'|'electron'} mode
 */
function createPages(page, mode, extra = {}) {
  const opts = { mode, ...extra };
  return {
    sidebar: new SidebarPage(page, opts),
    composer: new ChatComposerPage(page, opts),
    transcript: new ChatTranscriptPage(page, opts),
    messageActions: new MessageActionsPage(page, opts),
    replyMeta: new ReplyMetaPage(page, opts),
    inputControls: new InputControlsPage(page, opts),
    rightPanel: new RightPanelPage(page, opts),
    workspace: new WorkspacePage(page, opts),
    agentPreset: new AgentPresetPage(page, opts),
    plugins: new PluginManagerPage(page, opts),
    settings: new SettingsDialogPage(page, opts),
  };
}

module.exports = { createPages };
