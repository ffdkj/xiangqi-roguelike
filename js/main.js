/* 启动引导: 构建UI并挂载流程回调 */
'use strict';

window.addEventListener('DOMContentLoaded', () => {
  if (window.__BOOTED__) return;
  window.__BOOTED__ = true;
  boot();
  /* 流程回调挂载(ui.js 的顶层函数) */
  Flow.onDraft = (cards, round, total, cb) => showDraft(cards, round, total, cb);
  Flow.onDeploy = (run, battleNo, cb) => showDeploy(run, battleNo, cb);
  Flow.onBattleStart = (battle) => onBattleStart(battle);
  Flow.onReward = (cards, cb) => showReward(cards, cb);
  Flow.onEvent = (ev, cb) => showEvent(ev, cb);
  Flow.onPickPieces = (run, n, title, note, cb) => showPickPieces(run, n, title, note, cb);
  Flow.onPickGrave = (run, title, cb) => showPickGrave(run, title, cb);
  Flow.onEventReward = (cards, title, cb) => showEventReward(cards, title, cb);
  Flow.onEventDone = (texts) => banner('⚡ 奇遇结局', texts.join(';'));
  Flow.onGameOver = (result, run) => showGameOver(result, run);
  Flow.onBattleEnd = (battle) => onBattleEnd(battle);
  Flow.onBanner = (title, text) => banner(title, text);
});
