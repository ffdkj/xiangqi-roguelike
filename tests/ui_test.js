/* DOM 冒烟测试: 模拟完整玩家流程(node tests/ui_test.js) */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.confirm = () => true;

const files = [
  'js/data/pieces.js', 'js/data/battles.js', 'js/data/events.js', 'js/core/engine.js',
  'js/core/skills.js', 'js/core/ai.js', 'js/core/run.js',
  'js/ui/ui.js', 'js/main.js'
];
let code = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n');
code = code.replace(/await sleep\(420\)/g, 'await sleep(60)');
/* 测试垫片: 暴露内部符号 */
code += '\n;window.__X = { UI, boot, startGame, genLegalMoves, genRangedTargets, alivePieces, battleClick, refresh, finishBattle, RED, BLACK, MAX_DEPLOY, zoneSquares, skillTargets, skillUse, playerEndTurn, playerSkill, playerMove, playerRanged, getRun: () => Run, showEvent, showPickPieces, showPickGrave, showEventReward, backToMenu, refreshContinueBtn, saveRun, hasSave, clearSave, continueGame, EVENTS, CONSUMABLES, rollDraft };\n';
window.eval(code);
window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
const X = window.__X;

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const doc = window.document;
const q = s => doc.querySelector(s);

(async () => {
  try {
    /* 0. 回归: 空弹窗容器不得拦截点击 */
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    assert(/#modal-root\s*\{[^}]*pointer-events:\s*none/.test(css), '空弹窗容器点击穿透');
    assert(/#modal-root\s+\.modal-box\s*\{[^}]*pointer-events:\s*auto/.test(css), '弹窗本体可点击');
    /* 标记尺寸回归: 吃子/移动/部署高亮不得超过单格范围 */
    assert(/\.ring-cap\s*\{[^}]*width:\s*11\.2%/.test(css), '吃子圈按格缩放');
    assert(/\.dot-move\s*\{[^}]*width:\s*3\.4%/.test(css), '移动点按格缩放');
    assert(/\.sq-zone\s*\{[^}]*width:\s*12%[^}]*height:\s*10\.4%/.test(css), '部署区高亮按格缩放');
    /* 移动端与王标回归 */
    assert(/touch-action:\s*manipulation/.test(css), '移动端触控适配(touch-action)');
    assert(/\.king-badge\s*\{/.test(css), '将帅/王特殊标注样式存在');

    /* 1. 菜单 */
    assert(q('#screen-menu') && !q('#screen-menu').classList.contains('hidden'), '菜单显示');
    q('#btn-codex-menu').click();
    assert(doc.querySelectorAll('.codex-card').length > 80, '图鉴包含80+棋子');
    doc.querySelector('.modal-box').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    q('#btn-help-menu').click();
    assert(q('.help-body'), '帮助弹窗');
    q('#btn-help').click(); /* 再点一次关闭 */

    /* 2. 开局双选 */
    q('#btn-start').click();
    await sleep(50);
    assert(doc.querySelectorAll('#modal-root .card').length === 3, '开局三选一弹窗');
    doc.querySelector('#modal-root .card').click();
    await sleep(50);
    assert(doc.querySelectorAll('#modal-root .card').length === 3, '第二轮三选一');
    doc.querySelector('#modal-root .card').click();
    await sleep(50);
    assert(X.UI.mode === 'deploy', '进入部署');
    assert(doc.querySelectorAll('#board .pc').length >= 18, '默认部署18子');
    assert(q('#tb-alive').textContent.indexOf('18') >= 0, '部署计数');

    /* 3. 开战 */
    q('#btn-fight').click();
    await sleep(80);
    assert(X.UI.mode === 'battle', '战斗开始');
    assert(X.UI.battle && X.UI.battle.turn === 'red', '红方先行');
    assert(doc.querySelectorAll('#board .pc').length > 20, '双方棋子渲染');

    /* 4. 模拟数回合(用安全走法: 优先来回走相,保证战斗持续) */
    const W = X;
    for (let t = 0; t < 6; t++) {
      if (W.UI.battle.over || W.UI.mode !== 'battle') break;
      const b = W.UI.battle;
      const mine = W.alivePieces(b.board, W.RED).filter(p => p.status.stun === 0);
      let mover = null, mv = null;
      for (const id of ['s_xiang', 's_shi', 's_ma']) {
        const p = mine.find(x => x.defId === id);
        if (!p) continue;
        const ms = W.genLegalMoves(b.board, p, { battle: b }).sort((a, c) => (a.cap ? 1 : 0) - (c.cap ? 1 : 0));
        if (ms.length) { mover = p; mv = ms[0]; break; }
      }
      if (!mover) {
        for (const p of mine) {
          const ms = W.genLegalMoves(b.board, p, { battle: b }).filter(m => !m.cap);
          if (ms.length) { mover = p; mv = ms[0]; break; }
        }
      }
      if (!mover || !mv) break;
      X.battleClick(mover.r, mover.c);
      assert(X.UI.sel === mover, '选中棋子');
      X.battleClick(mv.r, mv.c);
      if (b.over) break;
      assert(q('#btn-end'), '有结束回合按钮');
      q('#btn-end').click();
      await sleep(500); /* 等敌方回合完成 */
      if (X.UI.mode !== 'battle') break;
    }
    assert(X.UI.battle.turnNo >= 1, '至少完成一个回合');
    console.log('  模拟回合完成, turnNo=' + X.UI.battle.turnNo + ', 红方存活=' + X.UI.battle.playerPieces.filter(p => !p.dead).length);

    /* 5. 技能面板: 选中有主动技能的棋子 */
    const b = X.UI.battle;
    if (!b.over && b.turn === X.RED) {
      const skiller = W.alivePieces(b.board, W.RED).find(p => p.def.act);
      if (skiller) {
        X.battleClick(skiller.r, skiller.c);
        assert(doc.querySelectorAll('#sb-skill .btn-skill').length > 0, '技能按钮渲染');
        X.UI.sel = null; X.refresh();
      }
    }

    /* 5.2 敌情详情: 点击敌军可查看行动与技能 */
    if (X.UI.mode === 'battle' && X.UI.battle) {
      const chip = doc.querySelector('#sb-intel .enemy-chip');
      assert(!!chip, '敌情列表有棋子');
      if (chip) {
        chip.click();
        await sleep(30);
        let mhtml = doc.querySelector('#modal-root').innerHTML;
        assert(mhtml.indexOf('行动') >= 0, '敌情详情含行动方式');
        assert(mhtml.indexOf('生命') >= 0, '敌情详情含生命数据');
        doc.querySelector('#btn-detail-close').click();
        await sleep(20);
        /* 再点一个有技能/被动的敌人,应展示技能 */
        const skilled = X.UI.battle.enemyPieces.find(p => !p.dead && ((p.def.pas && p.def.pas.length) || (p.def.act && p.def.act.length)));
        if (skilled) {
          const chip2 = doc.querySelector('#sb-intel .enemy-chip[data-id="' + skilled.id + '"]');
          if (chip2) {
            chip2.click();
            await sleep(30);
            mhtml = doc.querySelector('#modal-root').innerHTML;
            assert(mhtml.indexOf('被动') >= 0 || mhtml.indexOf('主动') >= 0, '敌情详情含技能信息');
            doc.querySelector('#btn-detail-close').click();
            await sleep(20);
          }
        }
      }
    }

    /* 5.3 点击敌军棋子(棋盘上): 只读查看行动范围/吃子对象/技能 */
    if (X.UI.mode === 'battle' && !X.UI.battle.over && X.UI.battle.turn === X.RED) {
      const bb = X.UI.battle;
      const foe = X.alivePieces(bb.board, X.BLACK).find(p => !p.isGeneral && X.genLegalMoves(bb.board, p, { battle: bb }).length > 0);
      if (foe) {
        X.battleClick(foe.r, foe.c);
        assert(X.UI.inspect === foe, '点击敌军进入只读查看');
        assert(doc.querySelector('#sb-skill').innerHTML.indexOf('只读') >= 0, '敌军只读面板渲染');
        assert(doc.querySelectorAll('#sb-skill .btn-skill').length === 0, '敌军技能不可操作');
        assert(doc.querySelectorAll('#board .mk.dot-move, #board .mk.ring-cap').length > 0, '敌军行动范围与吃子对象已显示');
        /* 点击空白处关闭查看 */
        let empty = null;
        for (let r = 0; r < 10 && !empty; r++) for (let c = 0; c < 9 && !empty; c++) if (!bb.board.grid[r][c]) empty = { r, c };
        if (empty) { X.battleClick(empty.r, empty.c); assert(X.UI.inspect === null, '点击空白关闭敌军查看'); }
        /* 再次查看后,选中己方棋子应清除查看,且提供取消按钮 */
        X.battleClick(foe.r, foe.c);
        const mineA = X.alivePieces(bb.board, X.RED).find(p => p.status.stun === 0 && X.genLegalMoves(bb.board, p, { battle: bb }).length > 0);
        if (mineA) {
          X.battleClick(mineA.r, mineA.c);
          assert(X.UI.inspect === null && X.UI.sel === mineA, '选中己方棋子清除敌军查看');
          assert(doc.querySelector('#btn-cancel'), '有取消选择按钮(触屏替代右键)');
          doc.querySelector('#btn-cancel').click();
          assert(X.UI.sel === null, '取消按钮清除选择');
        }
      }
    }

    /* 5.4 主帅特殊标注: 双方王均有金色「将/帅/王」标 */
    if (X.UI.mode === 'battle') {
      const badges = doc.querySelectorAll('#board .king-badge');
      assert(badges.length >= 2, '双方主帅均有王标(实际' + badges.length + ')');
    }

    /* 5.5 行动次数限制: 走完一步后不能再走 */
    if (X.UI.mode === 'battle' && !X.UI.battle.over && X.UI.battle.turn === X.RED) {
      const b2 = X.UI.battle;
      const mine2 = X.alivePieces(b2.board, X.RED).filter(p => p.status.stun === 0);
      /* 找一个能走非吃子步的红子 */
      let p1 = null, m1 = null;
      for (const p of mine2) {
        const ms = X.genLegalMoves(b2.board, p, { battle: b2 }).filter(m => !m.cap);
        if (ms.length) { p1 = p; m1 = ms[0]; break; }
      }
      if (p1 && m1) {
        X.battleClick(p1.r, p1.c);
        X.battleClick(m1.r, m1.c);
        assert(b2.movedDone[X.RED], '主行动标记已设置');
        /* 再找另一个能动的红子,尝试走 → 应被拒绝 */
        const q2 = X.alivePieces(b2.board, X.RED).find(x => x !== p1 && x.status.stun === 0 && X.genLegalMoves(b2.board, x, { battle: b2 }).some(m => !m.cap));
        if (q2) {
          const m2 = X.genLegalMoves(b2.board, q2, { battle: b2 }).find(m => !m.cap);
          const before = { r: q2.r, c: q2.c };
          X.battleClick(q2.r, q2.c);
          X.battleClick(m2.r, m2.c);
          assert(q2.r === before.r && q2.c === before.c, '行动次数受限: 走完一步后不可再走');
        }
      }
    }

    /* 6. 保存退出 → 继续游戏(单栏位) */
    if (X.UI.mode === 'over') {
      /* 战斗提前结束: 返回菜单重开一局再测存档 */
      doc.querySelector('#btn-back-menu').click();
      await sleep(30);
      q('#btn-start').click(); await sleep(50);
      doc.querySelector('#modal-root .card').click(); await sleep(50);
      doc.querySelector('#modal-root .card').click(); await sleep(50);
      q('#btn-fight').click(); await sleep(80);
    } else if (X.UI.mode !== 'battle' && X.UI.mode !== 'deploy') {
      /* reward/event: 选卡推进到部署 */
      const card = doc.querySelector('#modal-root .card');
      if (card) { card.click(); await sleep(60); }
      if (X.UI.mode === 'deploy') q('#btn-fight').click();
      await sleep(80);
    }
    q('#btn-savequit').click();
    await sleep(60);
    assert(!q('#screen-menu').classList.contains('hidden'), '保存退出后回到主菜单');
    assert(!q('#btn-continue').classList.contains('hidden'), '有存档时显示「继续征战」');
    assert(X.hasSave(), '存档已写入');
    q('#btn-continue').click();
    await sleep(80);
    assert(X.UI.mode === 'deploy', '继续游戏进入部署');
    q('#btn-fight').click();
    await sleep(80);
    assert(X.UI.mode === 'battle' && X.UI.battle && X.UI.battle.turn === 'red', '继续游戏后开战');

    /* 6.2 事件弹窗(合成事件) */
    let chosen = -1;
    X.showEvent({ title: '测试奇遇', intro: '这是一段完整的测试事件介绍: 大军行至隘口,前有狼后有虎,何去何从,全凭主将定夺。', opts: [{ label: '甲方案', desc: '选一名棋子强化' }, { label: '乙方案', desc: '突发战斗' }] }, i => { chosen = i; });
    await sleep(30);
    assert(doc.querySelector('.event-intro'), '事件弹窗含完整介绍');
    assert(doc.querySelectorAll('.event-opt').length === 2, '事件弹窗含多个选项');
    doc.querySelectorAll('.event-opt')[1].click();
    await sleep(20);
    assert(chosen === 1, '事件选项回调正确');

    /* 6.3 选子弹窗 */
    const runNow = X.getRun();
    let picked = null;
    X.showPickPieces(runNow, 2, '测试选子', '请选择2名棋子', arr => { picked = arr; });
    await sleep(30);
    const chips = doc.querySelectorAll('.pick-chip');
    assert(chips.length >= 4, '选子弹窗渲染棋子');
    chips[0].click(); chips[1].click();
    doc.querySelector('#btn-pick-ok').click();
    await sleep(20);
    assert(picked && picked.length === 2, '选子弹窗回调2名棋子');

    /* 6.4 消耗品拆分: 军需池中无全体加血/加伤 */
    assert(!X.CONSUMABLES.some(c => c.id === 'hp' || c.id === 'atk'), '全体buff消耗品已移除');
    assert(X.CONSUMABLES.some(c => c.id === 'hp1' && c.needTarget === 1), '单体强化消耗品存在');
    assert(X.CONSUMABLES.some(c => c.id === 'hp3' && c.needTarget === 3), '三选一概率强化消耗品存在');

    /* 7. 认输结束 */
    q('#btn-surrender').click();
    await sleep(80);
    assert(doc.querySelector('#modal-root .result-grid'), '结算弹窗');
    /* 点击弹窗外(模态背景)不得关闭结算页 */
    const mb = doc.querySelector('#modal-root .modal-box');
    mb.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(30);
    assert(doc.querySelector('#modal-root .result-grid'), '点击弹窗外不会关闭结算页(修复卡死)');
    /* 返回主菜单,存档应已清除 */
    doc.querySelector('#btn-back-menu').click();
    await sleep(30);
    assert(!q('#screen-menu').classList.contains('hidden'), '结算页可返回主菜单');
    assert(q('#btn-continue').classList.contains('hidden'), '战败后存档清除,无继续按钮');
    assert(!X.hasSave(), '战败清除存档');
  } catch (e) {
    failed++;
    console.error('  ✗✗ 异常:', e.stack.split('\n').slice(0, 6).join('\n'));
  }
  console.log('== UI冒烟: ' + passed + ' 通过 / ' + failed + ' 失败 ==');
  process.exit(failed ? 1 : 0);
})();
