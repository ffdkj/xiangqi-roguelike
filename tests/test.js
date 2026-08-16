/* 自动化测试: 规则单测 + 整局模拟(在 node 中运行: node tests/test.js) */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const files = [
  'js/data/pieces.js', 'js/data/battles.js', 'js/data/events.js', 'js/core/engine.js',
  'js/core/skills.js', 'js/core/ai.js', 'js/core/run.js'
];
let code = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n');
/* 测试提速: 缩短AI演出延迟 */
code = code.replace(/await sleep\(420\)/g, 'await sleep(3)');
code += '\n;module.exports = { RED, BLACK, newBoard, placeAt, makePiece, genLegalMoves, genRangedTargets, isInCheck, sideHasLegalMoves, generalsFace, applyMove, skillUse, startSideTurn, endSideTurn, alivePieces, hasPas, Flow, startGame, playerSkill, playerRanged, playerMove, playerEndTurn, skillReady, skillTargets, getRun: () => Run, setRun: r => { Run = r; }, P_DEFS, DRAFT_POOL, battleTick, startBattle, defaultDeploy, makeRun, enemyArmySpec, zoneSquares, sideGeneral, attackPower, dealDamage, rarityWeights, weightedRarity, EVENTS, pickEvent, execFx, runEventFx, saveRun, loadSave, clearSave, hasSave, continueGame, applyCard, CONSUMABLES, randomPieceIdShift, maxRarityFor, rollDraft };\n';
const out = path.join(__dirname, '_combined.cjs');
fs.writeFileSync(out, code);
const G = require(out);
Object.assign(global, G);
const R = G.getRun;

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function ok(msg) { passed++; }

function mkBattle(board) {
  return {
    run: { buffs: { qiPerTurn: 0 } }, no: 1, theme: {}, board: board || newBoard(),
    turn: RED, turnNo: 0, qi: { red: 0, black: 0 },
    extraMoves: { red: 0, black: 0 }, skillUsed: { red: false, black: false },
    movedDone: { red: false, black: false }, skipNext: { red: false, black: false },
    turnAtkBonus: { red: 0, black: 0 }, over: false, winner: null, reason: null,
    phase: 0, boss: null, bossAlive: false, bossExtra: 0, summoned: [],
    enemyAtkBonus: 0, skillProb: 0.5, logs: []
  };
}
function stdBoard() {
  const b = newBoard();
  const red = ['s_ju', 's_ma', 's_xiang', 's_shi', 's_jiang', 's_shi', 's_xiang', 's_ma', 's_ju'];
  red.forEach((id, c) => placeAt(b, 9, c, makePiece(id, RED)));
  placeAt(b, 7, 1, makePiece('s_pao', RED));
  placeAt(b, 7, 7, makePiece('s_pao', RED));
  [0, 2, 4, 6, 8].forEach(c => placeAt(b, 6, c, makePiece('s_bing', RED)));
  const black = ['s_ju', 's_ma', 's_xiang', 's_shi', 's_jiang', 's_shi', 's_xiang', 's_ma', 's_ju'];
  black.forEach((id, c) => placeAt(b, 0, c, makePiece(id, BLACK)));
  placeAt(b, 2, 1, makePiece('s_pao', BLACK));
  placeAt(b, 2, 7, makePiece('s_pao', BLACK));
  [0, 2, 4, 6, 8].forEach(c => placeAt(b, 3, c, makePiece('s_bing', BLACK)));
  return b;
}

console.log('== 规则单测 ==');
{
  const b = stdBoard();
  const battle = mkBattle();
  assert(genLegalMoves(b, b.grid[9][0], { battle }).length === 2, '车开局2步');
  assert(genLegalMoves(b, b.grid[9][1], { battle }).length === 2, '马开局2步');
  assert(genLegalMoves(b, b.grid[9][2], { battle }).length === 2, '相开局2步');
  assert(genLegalMoves(b, b.grid[6][0], { battle }).length === 1, '兵开局1步');
  const pao = genLegalMoves(b, b.grid[7][1], { battle });
  assert(pao.length === 12 && pao.some(m => m.cap && m.r === 0 && m.c === 1), '炮开局12步含隔山吃马');
  assert(genLegalMoves(b, b.grid[9][4], { battle }).length === 1, '帅开局1步');
  assert(genLegalMoves(b, b.grid[0][4], { battle }).length === 1, '将开局1步');
}
{
  const b = newBoard();
  placeAt(b, 9, 1, makePiece('s_ma', RED));
  placeAt(b, 8, 1, makePiece('s_bing', BLACK));
  placeAt(b, 9, 2, makePiece('s_bing', BLACK));
  const battle = mkBattle();
  assert(genLegalMoves(b, b.grid[9][1], { battle }).length === 0, '蹩马腿(全封)');
}
{
  const b = newBoard();
  placeAt(b, 9, 2, makePiece('s_xiang', RED));
  placeAt(b, 8, 3, makePiece('s_bing', BLACK));
  placeAt(b, 8, 1, makePiece('s_bing', BLACK));
  const battle = mkBattle();
  assert(genLegalMoves(b, b.grid[9][2], { battle }).length === 0, '塞象眼(全封)');
}
{
  const b = newBoard();
  placeAt(b, 6, 2, makePiece('s_xiang', RED));
  const battle = mkBattle();
  const ms = genLegalMoves(b, b.grid[6][2], { battle });
  assert(ms.length === 2 && ms.every(m => m.r >= 5), '相不过河');
  const b2 = newBoard();
  placeAt(b2, 6, 2, makePiece('zhanxiang', RED));
  const battle2 = mkBattle();
  assert(genLegalMoves(b2, b2.grid[6][2], { battle2 }).length === 4, '战象可过河');
}
{
  const b = newBoard();
  const p = makePiece('s_pao', RED); placeAt(b, 5, 4, p);
  placeAt(b, 3, 4, makePiece('s_ma', BLACK));
  placeAt(b, 2, 4, makePiece('s_ju', BLACK));
  const battle = mkBattle();
  const caps = genLegalMoves(b, p, { battle }).filter(m => m.cap);
  assert(caps.length === 1 && caps[0].r === 2, '炮隔一子吃');
}
{
  const b = newBoard();
  const p = makePiece('shenpao', RED); placeAt(b, 5, 4, p);
  placeAt(b, 3, 4, makePiece('s_ju', BLACK));
  const battle = mkBattle();
  const caps = genLegalMoves(b, p, { battle }).filter(m => m.cap);
  assert(caps.length === 1, '神炮无需炮架');
}
{
  /* 炮架可为己方棋子 */
  const b = newBoard();
  const p = makePiece('s_pao', RED); placeAt(b, 5, 4, p);
  placeAt(b, 4, 4, makePiece('s_bing', RED));
  placeAt(b, 3, 4, makePiece('s_ju', BLACK));
  const battle = mkBattle();
  const caps = genLegalMoves(b, p, { battle }).filter(m => m.cap);
  assert(caps.length === 1 && caps[0].r === 3 && caps[0].c === 4, '己方棋子可作炮架');
}
{
  /* 用户报告局面: 迫击炮隔两子(一己一敌)吃将 */
  const b = newBoard();
  const p = makePiece('paijipao', RED); placeAt(b, 7, 4, p);
  placeAt(b, 6, 4, makePiece('s_bing', RED));
  placeAt(b, 1, 4, makePiece('s_ma', BLACK));
  const g = makePiece('s_jiang', BLACK); placeAt(b, 0, 4, g);
  const battle = mkBattle(b);
  const caps = genLegalMoves(b, p, { battle }).filter(m => m.cap);
  assert(caps.some(m => m.target === g), '迫击炮隔两子(一己一敌)可吃将');
  /* 只隔一子时不可吃 */
  const b2 = newBoard();
  const p2 = makePiece('paijipao', RED); placeAt(b2, 7, 4, p2);
  placeAt(b2, 6, 4, makePiece('s_bing', RED));
  const g2 = makePiece('s_jiang', BLACK); placeAt(b2, 0, 4, g2);
  const battle2 = mkBattle(b2);
  assert(!genLegalMoves(b2, p2, { battle2 }).some(m => m.cap && m.target === g2), '迫击炮只隔一子不可吃');
  /* 隔两子但目标为己方: 不可吃 */
  const b3 = newBoard();
  const p3 = makePiece('paijipao', RED); placeAt(b3, 7, 4, p3);
  placeAt(b3, 6, 4, makePiece('s_bing', RED));
  placeAt(b3, 1, 4, makePiece('s_ma', BLACK));
  const own = makePiece('s_shi', RED); placeAt(b3, 0, 4, own);
  const battle3 = mkBattle(b3);
  assert(!genLegalMoves(b3, p3, { battle3 }).some(m => m.cap && m.target === own), '不可吃己方棋子');
}
{
  const b = newBoard();
  placeAt(b, 9, 4, makePiece('s_jiang', RED));
  placeAt(b, 0, 4, makePiece('s_jiang', BLACK));
  const battle = mkBattle();
  const caps = genLegalMoves(b, b.grid[9][4], { battle }).filter(m => m.cap);
  assert(caps.length === 1, '飞将擒王');
  assert(generalsFace(b), '两帅照面判定');
}
{
  const b = newBoard();
  placeAt(b, 9, 4, makePiece('s_jiang', RED));
  placeAt(b, 9, 0, makePiece('s_ju', BLACK));
  placeAt(b, 0, 3, makePiece('s_jiang', BLACK));
  const battle = mkBattle();
  assert(isInCheck(b, RED, battle), '红方被将');
  assert(genLegalMoves(b, b.grid[9][4], { battle }).length === 1, '帅只能上一步');
}
{
  const b = newBoard();
  placeAt(b, 0, 4, makePiece('s_jiang', BLACK));
  placeAt(b, 0, 0, makePiece('s_ju', RED));
  placeAt(b, 1, 1, makePiece('s_ju', RED));
  placeAt(b, 9, 3, makePiece('s_jiang', RED));
  const battle = mkBattle();
  assert(isInCheck(b, BLACK, battle), '双车错将军');
  assert(!sideHasLegalMoves(b, BLACK, battle), '黑方被将死');
}
{
  const b = newBoard();
  const p = makePiece('gongshou', RED); placeAt(b, 5, 4, p);
  const t1 = makePiece('s_bing', BLACK); placeAt(b, 5, 2, t1);
  const t2 = makePiece('s_bing', BLACK); placeAt(b, 4, 4, t2);
  const t3 = makePiece('s_ma', BLACK); placeAt(b, 6, 5, t3);
  const tg = genRangedTargets(b, p);
  assert(tg.includes(t1) && tg.includes(t2), '弓手直线2格');
  assert(!tg.includes(t3), '弓手不能射斜');
  const t4 = makePiece('s_bing', BLACK); placeAt(b, 5, 3, t4);
  assert(genRangedTargets(b, p).includes(t1), '弓手可越子(隔子仍射中)');
}
{
  /* 弓手移动: 直线2格,不可越子、不可吃 */
  const b = newBoard();
  const p = makePiece('gongshou', RED); placeAt(b, 8, 4, p);
  const enemy = makePiece('s_bing', BLACK); placeAt(b, 8, 1, enemy);
  const battle = mkBattle(b);
  const ms = genLegalMoves(b, p, { battle });
  assert(ms.some(m => m.r === 7 && m.c === 4) && ms.some(m => m.r === 6 && m.c === 4), '弓手可直线走2格');
  const cap = ms.filter(m => m.cap);
  assert(cap.length === 0, '弓手移动不可吃子');
  const b2 = newBoard();
  const p2 = makePiece('gongshou', RED); placeAt(b2, 8, 4, p2);
  const block = makePiece('s_bing', RED); placeAt(b2, 8, 3, block);
  const battle2 = mkBattle(b2);
  assert(!genLegalMoves(b2, p2, { battle2 }).some(m => m.c === 1 || m.c === 2), '弓手移动不可越子');
}
{
  /* 短刀手: 直线2格,可吃首敌,不可越子 */
  const b = newBoard();
  const p = makePiece('duandao', RED); placeAt(b, 8, 4, p);
  const t = makePiece('s_bing', BLACK); placeAt(b, 8, 2, t);
  const battle = mkBattle(b);
  const ms = genLegalMoves(b, p, { battle });
  assert(ms.some(m => m.r === 8 && m.c === 2 && m.cap), '短刀手可直吃2格内目标');
  assert(ms.some(m => m.r === 8 && m.c === 3 && !m.cap), '短刀手可空走1格');
  const b2 = newBoard();
  const p2 = makePiece('duandao', RED); placeAt(b2, 8, 4, p2);
  const block = makePiece('s_bing', RED); placeAt(b2, 8, 3, block);
  const t2 = makePiece('s_bing', BLACK); placeAt(b2, 8, 2, t2);
  const battle2 = mkBattle(b2);
  assert(!genLegalMoves(b2, p2, { battle2 }).some(m => m.cap), '短刀手不可越子');
}
{
  /* 天马2生命 */
  const p = makePiece('tianma', RED);
  assert(p.maxHp === 2 && p.hp === 2, '天马2生命');
}
{
  /* 妲己狐魅可把相邻敌人伤害削到0 */
  const b = newBoard();
  const jin = makePiece('daji', RED); placeAt(b, 5, 4, jin);
  const atk = makePiece('s_ju', BLACK); placeAt(b, 5, 5, atk); /* 相邻 */
  const t = makePiece('s_shi', RED); placeAt(b, 4, 5, t);
  const battle = mkBattle(b);
  dealDamage(b, t, 1, { source: atk, isSkill: false, battle });
  assert(t.hp === 1, '妲己狐魅把相邻敌人1点伤害削到0');
}
{
  /* 神炮: 可如车直取首敌,亦可如同炮隔一架轰击 */
  const b = newBoard();
  const p = makePiece('shenpao', RED); placeAt(b, 5, 4, p);
  const t1 = makePiece('s_bing', BLACK); placeAt(b, 5, 0, t1);
  const battle = mkBattle(b);
  assert(genLegalMoves(b, p, { battle }).some(m => m.cap && m.target === t1), '神炮可当车直取首敌');
  const b2 = newBoard();
  const p2 = makePiece('shenpao', RED); placeAt(b2, 5, 4, p2);
  const scr = makePiece('s_bing', RED); placeAt(b2, 5, 3, scr); /* 炮架(己方亦可) */
  const t2 = makePiece('s_ma', BLACK); placeAt(b2, 5, 1, t2);
  const battle2 = mkBattle(b2);
  assert(genLegalMoves(b2, p2, { battle2 }).some(m => m.cap && m.target === t2), '神炮可如炮隔一架轰击');
  assert(P_DEFS['shenpao'].mv.m.some(s => s.t === 'cannon') && P_DEFS['shenpao'].mv.m.some(s => s.t === 'chariot'), '神炮为车炮双模');
}
{
  const b = newBoard();
  const p = makePiece('s_ju', RED); placeAt(b, 5, 0, p);
  const t = makePiece('tieji', BLACK); placeAt(b, 5, 5, t);
  const battle = mkBattle(b);
  const m = genLegalMoves(b, p, { battle }).find(x => x.r === 5 && x.c === 5);
  const ev = applyMove(b, p, m, battle);
  assert(ev.bounced && t.hp === 1 && p.r === 5 && p.c === 0, '铁骑弹开攻击');
}
{
  const b = newBoard();
  const p = makePiece('s_ju', BLACK); placeAt(b, 5, 0, p);
  const t = makePiece('baopo', RED); placeAt(b, 5, 5, t);
  const t2 = makePiece('s_bing', BLACK); placeAt(b, 5, 7, t2);
  const battle = mkBattle(b);
  const m = genLegalMoves(b, p, { battle }).find(x => x.r === 5 && x.c === 5);
  applyMove(b, p, m, battle);
  assert(t.dead, '爆破兵阵亡');
  assert(t2.dead, '自爆波及2格');
}
{
  const b = newBoard();
  const p = makePiece('s_ju', BLACK); placeAt(b, 5, 0, p);
  const t = makePiece('zhuque', RED); placeAt(b, 5, 5, t);
  const battle = mkBattle(b);
  const m = genLegalMoves(b, p, { battle }).find(x => x.r === 5 && x.c === 5);
  applyMove(b, p, m, battle);
  assert(!t.dead && t.hp === 1, '朱雀涅槃');
  assert(t.rebornUsed, '涅槃标记');
}
{
  const b = newBoard();
  const p = makePiece('daoshi', RED); placeAt(b, 5, 4, p);
  const t = makePiece('s_ju', BLACK); placeAt(b, 3, 4, t);
  const battle = mkBattle(b);
  battle.turnNo = 2;
  const res = skillUse(battle, p, 0, t);
  assert(res.ok && t.status.stun === 1, '道士定身');
  startSideTurn(battle, BLACK);
  assert(t.status.stun === 0, '眩晕一回合后解除');
}
{
  const b = newBoard();
  const p = makePiece('fenghuo', RED); placeAt(b, 5, 4, p);
  const t1 = makePiece('s_bing', BLACK); placeAt(b, 5, 3, t1);
  const t2 = makePiece('s_bing', BLACK); placeAt(b, 5, 2, t2);
  const battle = mkBattle(b);
  const res = skillUse(battle, p, 0, { r: 5, c: 0 });
  assert(res.ok && t1.dead && t2.dead && p.c === 0, '风火车冲杀连破两兵');
}
{
  /* 风火车对2血铁骑: 1点伤害不死,应停住 */
  const b = newBoard();
  const p = makePiece('fenghuo', RED); placeAt(b, 5, 4, p);
  const t1 = makePiece('tieji', BLACK); placeAt(b, 5, 3, t1);
  const battle = mkBattle(b);
  const res = skillUse(battle, p, 0, { r: 5, c: 0 });
  assert(res.ok && !t1.dead && t1.hp === 1 && p.c === 4, '风火车撞不穿铁骑停在原地');
}
{
  /* 冲杀不可击杀将帅: 技能不能直接擒王 */
  const b = newBoard();
  const g = makePiece('s_jiang', RED); placeAt(b, 9, 4, g);
  const p = makePiece('zhaoyun', BLACK); placeAt(b, 2, 4, p);
  const t1 = makePiece('s_bing', RED); placeAt(b, 8, 4, t1);
  const battle = mkBattle(b);
  battle.qi.black = 5;
  const tg = skillTargets(p, battle, p.def.act[0]);
  assert(!tg.some(s => s.r === 9 && s.c === 4), '冲杀目标不含将帅格');
  const res = skillUse(battle, p, 0, { r: 8, c: 4 });
  assert(res.ok && !g.dead && t1.dead && p.r === 8 && p.c === 4, '冲杀停于将帅之前');
}
{
  /* 最终Boss可被技能/远程影响,普通将帅仍不可 */
  const b = newBoard();
  const boss = makePiece('chiyou', BLACK); placeAt(b, 0, 4, boss);
  const ju = makePiece('s_ju', BLACK); placeAt(b, 0, 0, ju);
  const gB = makePiece('s_jiang', BLACK); placeAt(b, 2, 8, gB);
  const battle = mkBattle(b);
  battle.qi.red = 10;
  /* 天雷(snipeAny)可锁Boss,不可锁将 */
  const lg = makePiece('leigong', RED); placeAt(b, 5, 4, lg);
  const tg = skillTargets(lg, battle, lg.def.act[0]);
  assert(tg.includes(boss) && !tg.includes(gB), '天雷可锁最终Boss,不可锁将');
  /* 狙击(snipe)可锁Boss */
  const fd = makePiece('feidao', RED); placeAt(b, 2, 4, fd);
  const tg2 = skillTargets(fd, battle, fd.def.act[0]);
  assert(tg2.includes(boss), '飞刀可锁最终Boss');
  /* 范围轰击可伤Boss */
  const hy = makePiece('hongyi', RED); placeAt(b, 3, 4, hy);
  const res = skillUse(battle, hy, 0, { r: 0, c: 4 });
  assert(res.ok && boss.hp === 7, '范围技能对最终Boss造成伤害');
  /* 蚩尤免疫眩晕: 定身不可锁 */
  const dao = makePiece('daoshi', RED); placeAt(b, 2, 5, dao);
  assert(!skillTargets(dao, battle, dao.def.act[0]).includes(boss), '蚩尤免疫眩晕不可定身');
  /* 远程可射击Boss,不可射击将 */
  const hy2 = makePiece('houyi', RED); placeAt(b, 9, 4, hy2);
  const rt = genRangedTargets(b, hy2);
  assert(rt.includes(boss) && !rt.includes(gB), '远程可射Boss,不可射将');
}
{
  /* 平衡: 飞刀兵冷却3回合; 后羿射日伤害1 */
  assert(P_DEFS.feidao.act[0].cd === 3, '飞刀兵冷却3回合');
  assert(P_DEFS.houyi.attack.dmg === 1, '后羿射日伤害1');
}
{
  /* 同一棋子一回合不能「走步/远程」+「放技能」 */
  const b = newBoard();
  placeAt(b, 9, 4, makePiece('s_jiang', RED));
  placeAt(b, 0, 4, makePiece('s_jiang', BLACK));
  const zy = makePiece('zhouyu', RED); placeAt(b, 5, 4, zy);
  const t = makePiece('s_bing', BLACK); placeAt(b, 5, 0, t);
  const battle = mkBattle(b);
  battle.qi.red = 5;
  /* 周瑜走一步后不能再放技能 */
  const m = genLegalMoves(b, zy, { battle }).find(x => !x.cap);
  playerMove(battle, zy, m);
  assert(zy.movedThisTurn === true, '走子后标记已行动');
  assert(!skillReady(battle, zy, 0).ok, '已走子不能再放技能');
  const res = playerSkill(battle, zy, 0, { r: 5, c: 2 });
  assert(!res.ok, 'playerSkill 拒绝已行动棋子');
  /* 另一棋子仍可放技能 */
  const lg = makePiece('leigong', RED); placeAt(b, 6, 4, lg);
  const res2 = playerSkill(battle, lg, 0, t);
  assert(res2.ok && lg.skilledThisTurn === true, '其他棋子仍可放技能');
  /* 放过技能的棋子不能再走 */
  const mq = genLegalMoves(b, lg, { battle }).find(x => !x.cap);
  playerMove(battle, lg, mq);
  assert(lg.r === 6 && lg.c === 4, '放过技能的棋子不能再走');
  /* 远程同样受限 */
  const t2 = makePiece('s_bing', BLACK); placeAt(b, 8, 6, t2);
  const gs = makePiece('gongshou', RED); placeAt(b, 8, 8, gs);
  playerRanged(battle, gs, t2);
  assert(gs.movedThisTurn === true, '远程攻击后标记已行动');
  /* 回合切换后标记复位 */
  endSideTurn(battle);
  assert(zy.movedThisTurn === false && lg.skilledThisTurn === false && gs.movedThisTurn === false, '回合切换后标记复位');
}
{
  const b = newBoard();
  const p = makePiece('erlang', RED); placeAt(b, 5, 4, p);
  const battle = mkBattle(b);
  battle.qi.red = 3;
  const res = skillUse(battle, p, 0, null);
  assert(res.ok && alivePieces(b, RED).some(x => x.defId === 'tiangou'), '二郎神召唤天狗');
}
{
  const b = newBoard();
  const p = makePiece('fengbo', RED); placeAt(b, 5, 4, p);
  const t = makePiece('s_bing', BLACK); placeAt(b, 3, 4, t);
  const battle = mkBattle(b);
  const res = skillUse(battle, p, 0, t);
  assert(res.ok && t.r === 2, '风伯推敌向底线');
}
{
  const b = newBoard();
  const p = makePiece('zhugeliang', RED); placeAt(b, 5, 4, p);
  const battle = mkBattle(b);
  battle.qi.red = 5;
  const res = skillUse(battle, p, 0, null);
  assert(res.ok && battle.skipNext.black === true, '空城计');
}
{
  const b = newBoard();
  const p = makePiece('jiandie', RED); placeAt(b, 2, 4, p);
  const t = makePiece('s_ju', BLACK); placeAt(b, 2, 3, t);
  const battle = mkBattle(b);
  battle.turnNo = 1;
  const m = genLegalMoves(b, t, { battle }).filter(x => x.cap);
  assert(m.every(x => x.target !== p), '无间: 前2回合不可吃间谍');
  battle.turnNo = 3;
  const m3 = genLegalMoves(b, t, { battle }).filter(x => x.cap);
  assert(m3.some(x => x.target === p), '2回合后可吃间谍');
}
{
  const b = newBoard();
  const p = makePiece('lvbu', RED); placeAt(b, 5, 4, p);
  const t = makePiece('s_bing', BLACK); placeAt(b, 4, 4, t);
  const battle = mkBattle(b);
  const m = genLegalMoves(b, p, { battle }).find(x => x.cap);
  applyMove(b, p, m, battle);
  assert(battle.extraMoves.red === 2, '吕布无双再动2次');
}
{
  /* 吃子再动上限按品质分级: r1/r2=1, r3=2, r4=3 */
  function eatTwice(defId, tCols, n) {
    const b = newBoard();
    const p = makePiece(defId, RED); placeAt(b, 7, 4, p);
    tCols.forEach((c, i) => placeAt(b, 7, c, makePiece('s_bing', BLACK)));
    const battle = mkBattle(b);
    const m1 = genLegalMoves(b, p, { battle }).find(x => x.cap);
    applyMove(b, p, m1, battle);
    const m2 = genLegalMoves(b, p, { battle }).find(x => x.cap);
    if (m2) applyMove(b, p, m2, battle);
    assert(battle.extraMoves.red === n, defId + ' 再动上限 ' + n);
  }
  eatTwice('lianhuanju', [5, 6, 7], 2); /* r3 珍品: 车连吃,上限2 */
  eatTwice('lvbu', [5, 6, 7], 3);       /* r4 神品: 无双,上限3 */
}
{
  const b = newBoard();
  const t = makePiece('xuanwu', RED); placeAt(b, 5, 5, t);
  const foe = makePiece('s_ju', BLACK); placeAt(b, 5, 0, foe);
  const battle = mkBattle(b);
  const m = genLegalMoves(b, foe, { battle }).find(x => x.cap && x.target === t);
  applyMove(b, foe, m, battle);
  assert(t.hp === 2, '玄武3血受1伤');
  assert(foe.dead, '玄武反震击杀车');
  ok('玄武反震链');
}
{
  const b = newBoard();
  const p = makePiece('guanyu', RED); placeAt(b, 5, 4, p);
  assert(hasPas(p, 'stunImmune'), '关羽免疫眩晕');
  const t = makePiece('s_ju', BLACK); placeAt(b, 3, 4, t);
  const battle = mkBattle(b);
  battle.qi.red = 3;
  const res = skillUse(battle, p, 0, t);
  assert(res.ok && t.dead, '拖刀计3伤秒车');
}
{
  /* 出货概率: 前5关(含开局)无神品; 全局神品期望≈1.5 */
  for (let n = 0; n <= 5; n++) assert(rarityWeights(n)[3] === 0, '前5关不出神品(battleNo=' + n + ')');
  assert(rarityWeights(6)[3] === 5, '第6关起解锁神品');
  /* 全局期望: 开局6张(全棋子) + 每关奖励3张×85%棋子 */
  let exp = 0;
  for (let n = 1; n <= 11; n++) exp += 3 * 0.85 * (rarityWeights(n)[3] / 100);
  assert(Math.abs(exp - 1.5) < 0.15, '全局神品期望≈1.5(实际' + exp.toFixed(2) + ')');
  /* 前期凡品为主 */
  const w1 = rarityWeights(1);
  assert(w1[0] > 50 && w1[1] > 25, '第1关以凡品为主+精品');
  console.log('  出货权重 开局=' + rarityWeights(0).join('/') + ' 第3关=' + rarityWeights(3).join('/') + ' 第6关=' + rarityWeights(6).join('/') + ' 第11关=' + rarityWeights(11).join('/'));
}
{
  /* Boss 阶段转换验证 */
  startGame();
  const run = R();
  run.battleNo = 12;
  const placed = defaultDeploy(run, 12);
  const battle = startBattle(12, placed);
  const boss = battle.boss;
  assert(!!boss && boss.defId === 'chiyou' && battle.phase === 1, 'Boss战开局为蚩尤第一阶段');
  const other = battle.enemyPieces.find(e => e !== boss && !e.dead);
  dealDamage(battle.board, boss, 3, { battle, ignoreAura: true });
  assert(battle.phase === 2 && boss.atkBoost === 1, '蚩尤受创进入第二阶段');
  assert(battle.enemyPieces.filter(e => e.defId === 'mobing' && !e.dead).length >= 2, '第二阶段召唤魔兵');
  if (other) assert(other.atkBoost === 1, '二阶段全体魔军伤害+1');
  dealDamage(battle.board, boss, 3, { battle, ignoreAura: true });
  assert(battle.phase === 3 && battle.bossExtra === 2, '蚩尤残血进入第三阶段');
  assert(battle.enemyPieces.filter(e => e.defId === 'taotie' && !e.dead).length >= 1, '第三阶段召唤饕餮');
  assert(boss.cdOverride && boss.cdOverride[0] === 2, '三阶段裂地冷却缩短');
}
console.log('  单测: ' + passed + ' 通过, ' + failed + ' 失败');

/* ---------------- 新内容单测: 凡品/事件/消耗品/存档/突发战斗 ---------------- */
console.log('== 新内容单测 ==');
{
  const commons = DRAFT_POOL.filter(id => P_DEFS[id].r === 1);
  assert(commons.length >= 20, '凡品棋子至少20个(实际' + commons.length + ')');
  const total = Object.keys(P_DEFS).filter(id => P_DEFS[id].r > 0).length;
  assert(total >= 99, '特色棋子总数≥99(实际' + total + ')');
}
{
  assert(EVENTS.length >= 50, '事件至少50个(实际' + EVENTS.length + ')');
  for (const e of EVENTS) {
    assert(e.intro.length >= 20, '事件' + e.id + '有完整介绍');
    assert(e.opts.length >= 2 && e.opts.length <= 4, '事件' + e.id + '有2-4个选项');
    for (const o of e.opts) {
      assert(o.label.length > 0 && o.desc.length > 0, '事件' + e.id + '选项有文案');
      for (const fx of (o.fx || [])) {
        if (fx.t === 'ambush') assert(o.fx[o.fx.length - 1] === fx, '事件' + e.id + ' ambush为最后一项');
      }
    }
  }
  const run0 = makeRun();
  const ev1 = pickEvent(run0, 2);
  run0.seenEvents.push(ev1.id);
  const ev2 = pickEvent(run0, 2);
  assert(ev1 && ev2 && ev1.id !== ev2.id, '事件不重复抽取');
  assert(EVENTS.some(e => e.cond && e.cond({ graveyard: [{ defId: 's_ma' }] }, 2)), '存在依赖阵亡池的事件');
  assert(EVENTS.some(e => e.cond && e.cond({ graveyard: [] }, 11) && !e.cond({ graveyard: [] }, 2)), '存在后期专属事件');
  const ambushEvents = EVENTS.filter(e => e.opts.some(o => (o.fx || []).some(fx => fx.t === 'ambush')));
  assert(ambushEvents.length >= 8, '突发战斗事件至少8个(实际' + ambushEvents.length + ')');
  const reviveEvents = EVENTS.filter(e => e.opts.some(o => (o.fx || []).some(fx => fx.t === 'revivePick' || fx.t === 'reviveRandom')));
  assert(reviveEvents.length >= 3, '复活类事件至少3个(实际' + reviveEvents.length + ')');
  const transformEvents = EVENTS.filter(e => e.opts.some(o => (o.fx || []).some(fx => fx.t === 'transform')));
  assert(transformEvents.length >= 1, '替换棋子类事件存在');
}
{
  /* 消耗品: 单体强化与三选一50%概率 */
  const run0 = makeRun();
  const tieji = makePiece('tieji', RED);
  run0.roster.push(tieji);
  CONSUMABLES.find(c => c.id === 'hp1').apply(run0, [tieji]);
  assert(tieji.maxHp === 3 && tieji.hp === 3 && tieji.permHp === 1, '虎骨膏: 单体生命上限+1');
  CONSUMABLES.find(c => c.id === 'atk1').apply(run0, [tieji]);
  assert(tieji.atk === 2 && tieji.permAtk === 1, '淬锋石: 单体伤害+1');
  const g1 = makePiece('s_ma', RED), g2 = makePiece('s_ma', RED), g3 = makePiece('s_ma', RED);
  const hp3 = CONSUMABLES.find(c => c.id === 'hp3');
  const orig = Math.random;
  Math.random = () => 0.99;
  const txtFail = hp3.apply(run0, [g1, g2, g3]).join(';');
  assert(g1.maxHp === 1 && g2.maxHp === 1 && g3.maxHp === 1, '祈福签: 0.99时三子全部失败');
  assert(txtFail.indexOf('运气不佳') >= 0, '失败文案存在');
  Math.random = () => 0.01;
  hp3.apply(run0, [g1, g2, g3]);
  Math.random = orig;
  assert(g1.maxHp === 2 && g2.maxHp === 2 && g3.maxHp === 2, '祈福签: 0.01时三子全部成功');
  assert(!CONSUMABLES.some(c => c.id === 'hp' || c.id === 'atk'), '旧的全体加血/加伤消耗品已移除');
  assert(run0.buffs.hpBonus === 0 && run0.buffs.atkBonus === 0, '开局无全体buff');
}
{
  /* 存档/读档(单栏位) */
  global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
  const run0 = makeRun();
  run0.battleNo = 5; run0.wins = 4; run0.kills = 12; run0.lost = 2;
  run0.roster.push(makePiece('tieji', RED, { permHp: 2, permAtk: 1 }));
  run0.graveyard.push({ defId: 's_ma', name: '马', permHp: 1, permAtk: 0 });
  run0.seenEvents = ['a', 'b'];
  run0.tempEnemyAtk = 1;
  assert(saveRun(run0) && hasSave(), '存档成功');
  const s = loadSave();
  assert(s.battleNo === 5 && s.roster.some(x => x.defId === 'tieji' && x.permHp === 2 && x.permAtk === 1), '存档内容完整(棋子永久强化)');
  assert(s.graveyard[0].permHp === 1 && s.seenEvents.join(',') === 'a,b' && s.tempEnemyAtk === 1, '存档含坟场/事件/敌军buff');
  clearSave();
  assert(!hasSave(), '清除存档');
  delete global.localStorage;
}
{
  /* 敌方军队必须始终有王: 裁剪不得移除将/蚩尤(修复"无王即伤即胜"bug) */
  for (let n = 1; n <= 12; n++) {
    for (let t = 0; t < 40; t++) {
      const spec = enemyArmySpec(n, 18);
      const king = n === 12 ? 'chiyou' : 's_jiang';
      assert(spec.ids.indexOf(king) >= 0, '第' + n + '关军队含王(' + king + ')');
    }
  }
  ok('40轮×12关 全部含王');
}
{
  /* 棋子名称随阵营显示(黑将不应叫"帅") */
  const gB = makePiece('s_jiang', BLACK);
  const gR = makePiece('s_jiang', RED);
  assert(gB.name === '将' && gR.name === '帅', '帅/将名称随阵营正确');
}
{
  /* 稀有度偏移: 前5关事件/突发奖励不出神品 */
  for (let i = 0; i < 60; i++) assert(P_DEFS[randomPieceIdShift(2, 5)].r <= 3, '第2关大偏移不出神品');
  let saw4 = false;
  for (let i = 0; i < 60; i++) if (P_DEFS[randomPieceIdShift(10, 3)].r === 4) saw4 = true;
  assert(saw4, '后期高偏移可出神品');
}
{
  /* 事件效果链 */
  const run0 = makeRun();
  G.setRun(run0);
  run0.battleNo = 3;
  run0.roster.push(makePiece('tieji', RED));
  execFx(run0, { t: 'pick', p: { n: 2, hp: 1, atk: 0, chance: 1 } }, () => {
    const first2 = run0.roster.filter(p => p.defId !== 's_jiang').slice(0, 2);
    assert(first2.every(p => p.permHp === 1 && p.maxHp === 2), '事件pick: 前两名棋子生命上限+1');
    execFx(run0, { t: 'qi', p: { n: 1 } }, () => {
      assert(run0.buffs.qiPerTurn === 1, '事件qi+1');
      execFx(run0, { t: 'enemyNext', p: { n: 1 } }, () => {
        assert(run0.tempEnemyAtk === 1, '事件下一战敌军+1伤');
        execFx(run0, { t: 'generalHp', p: { n: 1 } }, () => {
          const g = run0.roster.find(x => x.defId === 's_jiang');
          assert(run0.buffs.generalHp === 1 && g.maxHp === 2, '事件帅生命上限+1');
          execFx(run0, { t: 'curse', p: { hp: 2 } }, () => {
            assert(first2[0].permHp === 0 && first2[0].maxHp === 1, '事件curse扣回额外生命');
            execFx(run0, { t: 'transform', p: { shift: 0 } }, () => {
              assert(run0.roster[0].defId !== 's_ju', '事件transform替换了目标棋子');
              execFx(run0, { t: 'reviveRandom', p: {} }, () => {
                execFx(run0, { t: 'log', p: { text: 'ok' } }, () => { ok('事件效果链执行完毕'); });
              });
            });
          });
        });
      });
    });
  });
}
{
  /* 突发战斗配置: 不含关主/蚩尤,主题覆盖,ambush标记 */
  const run0 = makeRun();
  G.setRun(run0);
  run0.battleNo = 4;
  const placed = defaultDeploy(run0, 4);
  const battle = startBattle(4, placed, { themeName: '测试突袭', ambush: true, rewardShift: 1 });
  assert(battle.ambush && battle.theme.name === '测试突袭', '突发战斗标记与主题');
  assert(!battle.enemyPieces.some(p => p.defId === 'lvbu' || p.defId === 'chiyou' || p.defId === 'caocao'), '突发战斗不含关主/Boss');
  assert(battle.rewardShift === 1, '突发奖励稀有度偏移');
  /* 事件下一战敌军+1伤生效后清零 */
  const run1 = makeRun();
  G.setRun(run1);
  run1.tempEnemyAtk = 1;
  const b2 = startBattle(1, defaultDeploy(run1, 1));
  assert(b2.enemyAtkBonus === 1 && run1.tempEnemyAtk === 0, 'tempEnemyAtk 生效并清零');
  G.setRun(null);
}

/* ---------------- 整局模拟 ---------------- */
console.log('== 整局模拟 ==');
let runDone = 0, runWins = 0;
Flow.onGameOver = (result, run) => { runDone++; if (result === 'victory') runWins++; };
Flow.onBanner = () => {};

async function driveRed(battle) {
  if (battle.over || battle.turn !== RED) return;
  const mine = alivePieces(battle.board, RED).filter(p => p.status.stun === 0);
  if (!mine.length) return;
  /* 30% 概率用技能 */
  if (!battle.skillUsed[RED] && Math.random() < 0.3) {
    const skilled = mine.filter(p => p.def.act && !p.dead);
    if (skilled.length) {
      const p = skilled[Math.floor(Math.random() * skilled.length)];
      for (let idx = 0; idx < p.def.act.length; idx++) {
        if (skillReady(battle, p, idx).ok) {
          const tg = skillTargets(p, battle, p.def.act[idx]);
          const t = tg.length ? tg[Math.floor(Math.random() * tg.length)] : null;
          playerSkill(battle, p, idx, t);
          break;
        }
      }
    }
  }
  if (battle.over) return;
  const active = mine.filter(p => genLegalMoves(battle.board, p, { battle }).length > 0 || genRangedTargets(battle.board, p).length > 0);
  if (!active.length) return;
  const p = active[Math.floor(Math.random() * active.length)];
  const ms = genLegalMoves(battle.board, p, { battle });
  const rt = genRangedTargets(battle.board, p);
  if (rt.length && (ms.length === 0 || Math.random() < 0.35)) {
    playerRanged(battle, p, rt[Math.floor(Math.random() * rt.length)]);
  } else if (ms.length) {
    const m = ms[Math.floor(Math.random() * ms.length)];
    playerMove(battle, p, m);
  } else {
    return;
  }
  if (!battle.over) playerEndTurn(battle);
}

async function runSimulation(label) {
  const t0 = Date.now();
  startGame();
  let guard = 0;
  while (R().state !== 'over' && guard++ < 30000) {
    const b = R().battle;
    if (b && !b.over && b.turn === RED && R().state === 'battle') {
      await driveRed(b);
    }
    G.battleTick();
    await new Promise(r => setTimeout(r, 1));
  }
  if (guard >= 30000) { failed++; console.error('  ✗ ' + label + ' 超时未结束, state=' + R().state + ' battle=' + (R().battle && R().battle.no) + ' turn=' + (R().battle && R().battle.turn) + ' over=' + (R().battle && R().battle.over)); return; }
  console.log('  ' + label + ': 结束于 ' + R().state + ', 胜场 ' + R().wins + ', 战至 ' + R().battleNo + ' 关, 棋子 ' + R().roster.length + ' 枚, 阵亡 ' + R().graveyard.length + ', 耗时 ' + (Date.now() - t0) + 'ms');
  assert(R().state === 'over', label + ' 正常结束');
}

process.on('unhandledRejection', (e) => { console.error('  ✗✗ 未捕获异步异常:', e && e.stack || e); failed++; });

/* 贪婪红方AI: 用于深层模拟与Boss战验证 */
function driveRedGreedy(battle) {
  if (battle.over || battle.turn !== RED) return;
  const mine = alivePieces(battle.board, RED).filter(p => p.status.stun === 0);
  let best = null;
  for (const p of mine) {
    for (const m of genLegalMoves(battle.board, p, { battle })) {
      let s = Math.random();
      if (m.cap && m.target) s += m.target.def.val * 10 + 5;
      if (m.cap && m.target && m.target.isGeneral) s += 10000;
      s += (9 - m.r) * 0.3;
      if (p.isGeneral) s -= 8; /* 帅别乱跑 */
      const g = sideGeneral(battle.board, BLACK);
      if (g) {
        if (m.r === g.r || m.c === g.c) s += 12;
        s -= (Math.abs(m.r - g.r) + Math.abs(m.c - g.c)) * 0.12; /* 逼近敌将 */
      }
      if (!best || s > best.s) best = { s, p, m };
    }
    for (const t of genRangedTargets(battle.board, p)) {
      let s = Math.random() + 2;
      const dmg = attackPower(p, battle);
      s += (t.hp <= dmg ? t.def.val * 8 : 2);
      if (!best || s > best.s) best = { s, p, ranged: t };
    }
  }
  if (!best) return;
  if (best.ranged) playerRanged(battle, best.p, best.ranged);
  else playerMove(battle, best.p, best.m);
  if (!battle.over) playerEndTurn(battle);
}

async function runSimulation(label) {
  const t0 = Date.now();
  startGame();
  let guard = 0;
  while (R().state !== 'over' && guard++ < 200000) {
    const b = R().battle;
    if (b && !b.over && b.turn === RED && R().state === 'battle') {
      await driveRed(b);
    }
    G.battleTick();
    await new Promise(r => setTimeout(r, 2));
  }
  if (guard >= 200000) { failed++; console.error('  ✗ ' + label + ' 超时未结束, state=' + R().state + ' battle=' + (R().battle && R().battle.no) + ' turn=' + (R().battle && R().battle.turn) + ' over=' + (R().battle && R().battle.over)); return; }
  console.log('  ' + label + ': 结束于 ' + R().state + ', 胜场 ' + R().wins + ', 战至 ' + R().battleNo + ' 关, 棋子 ' + R().roster.length + ' 枚, 阵亡 ' + R().graveyard.length + ', 耗时 ' + (Date.now() - t0) + 'ms');
  assert(R().state === 'over', label + ' 正常结束');
}

async function runSimulationGreedy(label, startAtBattle) {
  const t0 = Date.now();
  startGame();
  if (startAtBattle && startAtBattle > 1) {
    /* 直接跳关: 用丰厚军力打第12关验证Boss */
    const run = R();
    run.battleNo = startAtBattle;
    for (const id of ['guanyu', 'zhaoyun', 'lvbu', 'zhuque', 'xuanwu', 'qinglong', 'houyi', 'leigong', 'shenyi', 'xiangyu']) {
      run.roster.push(makePiece(id, RED, { hpBonus: run.buffs.hpBonus, atkBonus: run.buffs.atkBonus, generalHp: run.buffs.generalHp }));
    }
    const placed = defaultDeploy(run, startAtBattle);
    startBattle(startAtBattle, placed);
  }
  let guard = 0;
  while (R().state !== 'over' && guard++ < 400000) {
    const b = R().battle;
    if (b && !b.over && b.turn === RED && R().state === 'battle') {
      driveRedGreedy(b);
    }
    G.battleTick();
    await new Promise(r => setTimeout(r, 2));
  }
  if (guard >= 400000) { failed++; console.error('  ✗ ' + label + ' 超时未结束, state=' + R().state + ' battle=' + (R().battle && R().battle.no) + ' turn=' + (R().battle && R().battle.turn) + ' over=' + (R().battle && R().battle.over)); return; }
  const b = R().battle;
  console.log('  ' + label + ': 结束于 ' + R().state + ', 胜场 ' + R().wins + ', 战至 ' + R().battleNo + ' 关, 棋子 ' + R().roster.length + ' 枚, 阵亡 ' + R().graveyard.length + ', 耗时 ' + (Date.now() - t0) + 'ms');
  if (startAtBattle === 12 && b) {
    const logs = b.logs.join('|');
    console.log('    Boss检查: 阶段日志=' + (logs.indexOf('第二阶段') >= 0 ? '有' : '无') + ' / ' + (logs.indexOf('第三阶段') >= 0 ? '有' : '无') + ', 回合数=' + b.turnNo + ', 胜负=' + (b.winner || '?') + ' (' + (b.reason || '') + ')');
    assert(b.turnNo > 1, 'Boss战正常运行');
  }
  assert(R().state === 'over' || R().state === 'reward' || R().state === 'deploy' || R().state === 'battle', label + ' 状态合法');
}

(async () => {
  for (let i = 0; i < 3; i++) await runSimulation('随机整局模拟#' + (i + 1));
  for (let i = 0; i < 2; i++) await runSimulationGreedy('贪婪AI整局模拟#' + (i + 1), 1);
  await runSimulationGreedy('Boss战验证(直接跳第12关)', 12);
  console.log('== 汇总: 单测 ' + passed + ' 通过 / ' + failed + ' 失败 ==');
  process.exit(failed ? 1 : 0);
})();
