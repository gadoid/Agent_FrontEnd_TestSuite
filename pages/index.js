// @ts-check
/**
 * 页面组件组合根（Composition Root）
 *
 * 所有组件在此按 mode 统一构造，fixtures 把 `pages` 注入测试，
 * spec 文件不再自行 new 组件 —— 这是本套件的模块化边界约定：
 *   fixtures 负责依赖注入（page/mode/pages）
 *   pages/*   只封装定位与操作，不写断言
 *   tests/*   只编排步骤与断言，不出现选择器
 */
const { SidebarPage } = require('./SidebarPage');
const { ChatComposerPage } = require('./ChatComposerPage');
const { ChatTranscriptPage } = require('./ChatTranscriptPage');
const { SettingsDialogPage } = require('./SettingsDialogPage');
const { MarketDialogPage } = require('./MarketDialogPage');
const { MessageActionsPage } = require('./MessageActionsPage');
const { ReplyMetaPage } = require('./ReplyMetaPage');
const { InputControlsPage } = require('./InputControlsPage');
const { RightPanelPage } = require('./RightPanelPage');

/**
 * @param {import('@playwright/test').Page} page
 * @param {'web'|'electron'} mode
 */
function createPages(page, mode) {
  const opts = { mode };
  return {
    sidebar: new SidebarPage(page, opts),
    composer: new ChatComposerPage(page, opts),
    transcript: new ChatTranscriptPage(page, opts),
    settings: new SettingsDialogPage(page, opts),
    market: new MarketDialogPage(page, opts),
    messageActions: new MessageActionsPage(page, opts),
    replyMeta: new ReplyMetaPage(page, opts),
    inputControls: new InputControlsPage(page, opts),
    rightPanel: new RightPanelPage(page, opts),
  };
}

module.exports = { createPages };
