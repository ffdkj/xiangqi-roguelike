/* ============================================================
 * 流程控制 —— Run 状态机: 开局双选、部署、战斗、三选一奖励、
 * 行军奇遇(每2战一次)、突发战斗、永久阵亡、敌方缩放、
 * Boss 阶段、胜负结算、存档/继续(单栏位)
 * ============================================================ */
'use strict';

const SAVE_KEY = 'chuhan_save_v1';

/* UI 挂载的回调(浏览器中由 ui.js 覆盖; 默认值用于无头模拟) */
const Flow = {
  onDraft(cards, round, total, cb) { cb(cards[0]); },
  onDeploy(run, battleNo, cb) { cb(defaultDeploy(run, battleNo)); },
  onBattleStart(battle) {},
  onReward(cards, cb) { cb(cards[0]); },
  onEvent(ev, cb) { cb(0); },
  onPickPieces(run, n, title, note, cb) { cb(run.roster.filter(p => p.defId !== 's_jiang').slice(0, n)); },
  onPickGrave(run, title, cb) { cb(run.graveyard.length ? run.graveyard[0] : null); },
  onEventReward(cards, title, cb) { cb(cards[0]); },
  onEventDone(texts) {},
  onGameOver(result, stats) {},
  onBattleEnd(battle) {},
  onBanner(title, text) {}
};

/* 消耗品: 全体加血/加伤已被拆为单体强化与三选一50%概率强化 */
const CONSUMABLES = [
  { id: 'revive', name: '还魂丹', desc: '随机复活一名阵亡棋子,重返沙场', cond: r => r.graveyard.length > 0, apply(r) { const g = r.graveyard.splice(Math.floor(Math.random() * r.graveyard.length), 1)[0]; const p = reviveFromGrave(r, g); return [g.name + '复活归来!']; } },
  { id: 'hp1', name: '虎骨膏', desc: '选择一名棋子,生命上限+1(每子至多+3)', needTarget: 1, cond: r => r.roster.some(p => (p.permHp || 0) < 3), apply(r, picks) { const p = picks && picks[0]; if (!p) return ['没有可选目标']; p.permHp += 1; p.maxHp += 1; p.hp = p.maxHp; return [p.name + '生命上限+1']; } },
  { id: 'atk1', name: '淬锋石', desc: '选择一名棋子,伤害+1(每子至多+3)', needTarget: 1, cond: r => r.roster.some(p => (p.permAtk || 0) < 3), apply(r, picks) { const p = picks && picks[0]; if (!p) return ['没有可选目标']; p.permAtk += 1; p.atk += 1; return [p.name + '伤害+1']; } },
  { id: 'hp3', name: '祈福签·体', desc: '选择3名棋子,各50%概率生命上限+1(失败无变化)', needTarget: 3, cond: r => r.roster.some(p => (p.permHp || 0) < 3), apply(r, picks) { return gambleBuff((picks || []).slice(0, 3), { hp: 1 }, 0.5); } },
  { id: 'atk3', name: '祈福签·武', desc: '选择3名棋子,各50%概率伤害+1(失败无变化)', needTarget: 3, cond: r => r.roster.some(p => (p.permAtk || 0) < 3), apply(r, picks) { return gambleBuff((picks || []).slice(0, 3), { atk: 1 }, 0.5); } },
  { id: 'qi', name: '锦囊妙计', desc: '每回合气力+1(至多+3)', cond: r => r.buffs.qiPerTurn < 3, apply(r) { r.buffs.qiPerTurn++; return ['每回合气力+1']; } },
  { id: 'ghp', name: '真龙龙袍', desc: '帅生命上限+1(至多+3)', cond: r => r.buffs.generalHp < 3, apply(r) { r.buffs.generalHp++; const g = r.roster.find(p => p.defId === 's_jiang'); if (g) { g.maxHp++; g.hp = g.maxHp; } return ['帅生命上限+1']; } }
];

function gambleBuff(picks, gain, chance) {
  const texts = [];
  for (const p of picks) {
    if (!p) continue;
    if (Math.random() < chance) texts.push(...applyPieceBuff(p, gain.hp || 0, gain.atk || 0));
    else texts.push(p.name + '运气不佳,毫无变化');
  }
  return texts.length ? texts : ['没有可选目标'];
}

let Run = null;

function makeRun() {
  const buffs = { atkBonus: 0, hpBonus: 0, qiPerTurn: 0, generalHp: 0 };
  const roster = STD_SET.map(id => makePiece(id, RED, { hpBonus: 0, atkBonus: 0, generalHp: 0 }));
  return {
    state: 'menu', battleNo: 1, wins: 0, kills: 0, lost: 0,
    buffs, roster, graveyard: [], battle: null,
    seenEvents: [], tempEnemyAtk: 0, ambushResume: null
  };
}

function randomPieceIdMin(battleNo, minR, rng) {
  for (let tries = 0; tries < 30; tries++) {
    const r = Math.max(minR, Math.min(maxRarityFor(battleNo), weightedRarity(battleNo, rng)));
    const ids = DRAFT_POOL.filter(id => P_DEFS[id].r === r);
    if (ids.length) return ids[Math.floor((rng ? rng() : Math.random()) * ids.length)];
  }
  return DRAFT_POOL[0];
}

function rollDraft(battleNo, opts) {
  opts = opts || {};
  const shift = opts.shift || 0;
  const onlyPieces = !!opts.onlyPieces;
  const cards = [];
  for (let i = 0; i < 3; i++) {
    if (!onlyPieces && battleNo > 0 && Math.random() < 0.15) {
      const valid = CONSUMABLES.filter(c => c.cond(Run));
      if (valid.length) {
        cards.push({ type: 'consumable', id: valid[Math.floor(Math.random() * valid.length)].id });
        continue;
      }
    }
    cards.push({ type: 'piece', defId: shift ? randomPieceIdShift(battleNo, shift) : randomPieceId(battleNo) });
  }
  /* 开局选将: 保证至少一张精良以上 */
  if (battleNo === 0) {
    while (!cards.some(c => c.type === 'piece' && P_DEFS[c.defId].r >= 2)) {
      cards[0] = { type: 'piece', defId: randomPieceIdMin(0, 2) };
    }
  }
  return cards;
}

function applyCard(run, card, picks) {
  const texts = [];
  if (card.type === 'piece') {
    const p = makePiece(card.defId, RED, { hpBonus: run.buffs.hpBonus, atkBonus: run.buffs.atkBonus, generalHp: run.buffs.generalHp });
    run.roster.push(p);
    texts.push('获得棋子 ' + p.name);
  } else {
    const c = CONSUMABLES.find(x => x.id === card.id);
    if (c) {
      if (c.needTarget && !picks) picks = run.roster.filter(p => p.defId !== 's_jiang').slice(0, c.needTarget);
      texts.push(c.name + ': ' + c.apply(run, picks).join('、'));
    }
  }
  return texts;
}

/* ---------------- 部署 ---------------- */
const MAX_DEPLOY = 24;

function stdSpots() {
  const spots = {};
  const row9 = ['s_ju', 's_ma', 's_xiang', 's_shi', 's_jiang', 's_shi', 's_xiang', 's_ma', 's_ju'];
  const cnt = {};
  row9.forEach((id, c) => {
    const k = id + '@' + (cnt[id] || 0);
    cnt[id] = (cnt[id] || 0) + 1;
    spots[k] = { r: 9, c };
  });
  spots['s_pao@0'] = { r: 7, c: 1 };
  spots['s_pao@1'] = { r: 7, c: 7 };
  [0, 2, 4, 6, 8].forEach((c, i) => spots['s_bing@' + i] = { r: 6, c });
  return spots;
}

function defaultDeploy(run, battleNo) {
  const placed = [];
  const used = {};
  const spots = stdSpots();
  const counts = {};
  /* 帅必须部署 */
  const general = run.roster.find(p => p.defId === 's_jiang');
  if (general) {
    placed.push({ piece: general, r: 9, c: 4 });
    used['9,4'] = true;
  }
  /* 标准棋子走经典位置 */
  for (const p of run.roster) {
    if (p.defId === 's_jiang' || p.defId.startsWith('s_') === false) continue;
    const k = p.defId + '@' + (counts[p.defId] || 0);
    counts[p.defId] = (counts[p.defId] || 0) + 1;
    const sp = spots[k];
    if (sp && !used[sp.r + ',' + sp.c]) {
      placed.push({ piece: p, r: sp.r, c: sp.c });
      used[sp.r + ',' + sp.c] = true;
    }
  }
  /* 特色棋子按部署区落位(价值高者优先) */
  const specials = run.roster.filter(p => !p.defId.startsWith('s_'))
    .sort((a, b) => b.def.val - a.def.val);
  for (const p of specials) {
    if (placed.length >= MAX_DEPLOY) break;
    const sqs = zoneSquares(p.def.dep, RED);
    /* 距河近者优先,兼顾居中 */
    sqs.sort((a, b) => (Math.abs(a[0] - 5) - Math.abs(b[0] - 5)) || (Math.abs(a[1] - 4) - Math.abs(b[1] - 4)));
    const spot = sqs.find(s => !used[s[0] + ',' + s[1]]);
    if (!spot) continue;
    placed.push({ piece: p, r: spot[0], c: spot[1] });
    used[spot[0] + ',' + spot[1]] = true;
  }
  return placed;
}

/* ---------------- 战斗 ---------------- */
function spawnNear(battle, defId, n) {
  const texts = [];
  for (let i = 0; i < n; i++) {
    const anchor = battle.bossAlive && battle.boss && !battle.boss.dead ? battle.boss : battle.enemyPieces[0];
    const spot = nearestEmpty(battle.board, anchor.r, anchor.c);
    if (!spot) break;
    const p = makePiece(defId, BLACK, { temp: true, atkBonus: battle.enemyAtkBonus });
    placeAt(battle.board, spot[0], spot[1], p);
    battle.enemyPieces.push(p);
    battle.summoned.push(p);
    texts.push(p.name);
  }
  return texts;
}

function startBattle(battleNo, placed, opts) {
  opts = opts || {};
  const run = Run;
  const board = newBoard();
  for (const pl of placed) placeAt(board, pl.r, pl.c, pl.piece);
  const spec = enemyArmySpec(battleNo, placed.length);
  if (opts.themeName) spec.theme = { name: opts.themeName, boss: false };
  if (opts.ambush) spec.ids = spec.ids.filter(id => ['lvbu', 'caocao', 'chiyou'].indexOf(id) < 0);
  /* 事件「下一战敌军±伤」只对接下来的一场战斗生效 */
  const atkBonus = spec.atkBonus + (run.tempEnemyAtk || 0);
  run.tempEnemyAtk = 0;
  const enemies = enemyPlacement(board, spec.ids, Math.random, atkBonus);

  const bossPiece = enemies.find(p => p.isBoss) || null;
  const battle = {
    run, no: battleNo, theme: spec.theme, board,
    playerPieces: placed.map(x => x.piece), enemyPieces: enemies,
    turn: RED, turnNo: 0,
    qi: { red: 0, black: spec.qiStart },
    extraMoves: { red: 0, black: 0 },
    skillUsed: { red: false, black: false },
    movedDone: { red: false, black: false },
    skipNext: { red: false, black: false },
    turnAtkBonus: { red: 0, black: 0 },
    over: false, winner: null, reason: null,
    phase: spec.theme.final ? 1 : 0,
    boss: bossPiece, bossAlive: !!bossPiece, bossExtra: 0,
    summoned: [],
    enemyAtkBonus: atkBonus,
    skillProb: spec.skillProb,
    ambush: !!opts.ambush,
    rewardShift: opts.rewardShift || 0,
    logs: []
  };
  /* 初始气力(传令兵等) */
  for (const pl of placed) {
    const q = getPas(pl.piece, 'qiStart');
    if (q) battle.qi.red += q.n;
  }
  /* 防止开局两帅照面 */
  if (generalsFace(board)) {
    const gB = sideGeneral(board, BLACK);
    for (const c of [3, 5]) {
      if (!board.grid[0][c]) { applyMoveRaw(board, gB, 0, c); break; }
    }
  }
  /* 安全网: 黑方必须有王(将/蚩尤),否则任何伤害都会直接判胜 */
  if (!sideGeneral(board, BLACK)) {
    let bspot = [[0, 4], [0, 3], [0, 5]].find(s => !board.grid[s[0]][s[1]]);
    if (!bspot) {
      for (let r = 0; r <= 2 && !bspot; r++) for (let c = 0; c < 9 && !bspot; c++) if (!board.grid[r][c]) bspot = [r, c];
    }
    if (bspot) {
      const bk = makePiece('s_jiang', BLACK, { atkBonus });
      placeAt(board, bspot[0], bspot[1], bk);
      enemies.push(bk);
    }
  }
  battle.checkPhase = function () {
    const b = battle.boss;
    if (!b || b.dead) { battle.bossAlive = false; return; }
    if (battle.phase === 1 && b.hp <= 5) {
      battle.phase = 2;
      b.atkBoost += 1;
      for (const e of battle.enemyPieces) if (!e.dead && e !== b) e.atkBoost += 1;
      const sp = spawnNear(battle, 'mobing', 2);
      logBattle(battle, '蚩尤进入第二阶段·魔威降临!全体魔军伤害+1,' + sp.join('、') + '现身!');
      Flow.onBanner('第二阶段 · 魔威', '蚩尤怒火中烧,全体魔军伤害+1,召唤魔兵!');
    } else if (battle.phase === 2 && b.hp <= 2) {
      battle.phase = 3;
      battle.bossExtra = 2;
      b.cdOverride = { 0: 2 };
      const sp = spawnNear(battle, 'taotie', 1);
      logBattle(battle, '蚩尤进入第三阶段·狂怒!每回合可行动两次,' + sp.join('、') + '降临!');
      Flow.onBanner('第三阶段 · 狂怒', '蚩尤彻底狂暴,每回合行动两次!');
    }
  };
  run.battle = battle;
  run.state = 'battle';
  startSideTurn(battle, RED);
  Flow.onBattleStart(battle);
  return battle;
}

/* 突发战斗: 事件触发,不推进关卡数,胜利有特殊奖励 */
function startAmbush(p) {
  const run = Run;
  const placed = defaultDeploy(run, run.battleNo);
  Flow.onBanner('⚔️ 突发战斗 · ' + (p.name || '乱军'), '击破来敌,可得稀有度提升的特殊奖励!');
  startBattle(run.battleNo, placed, { themeName: p.name || '乱军突袭', ambush: true, rewardShift: p.shift || 0 });
}

/* 玩家行动 */
function playerMove(battle, piece, m) {
  const from = [piece.r, piece.c];
  const ev = applyMove(battle.board, piece, m, battle);
  battle.movedDone[RED] = true;
  const cap = ev.captured.length ? '吃' + ev.captured.map(x => x.name).join('、') : '';
  logBattle(battle, SIDE_NAME[RED] + '·' + piece.name + ' (' + (from[1] + 1) + ',' + (from[0] + 1) + ')→(' + (m.c + 1) + ',' + (m.r + 1) + ') ' + cap + (ev.texts.length ? ' [' + ev.texts.join(';') + ']' : ''));
  if (ev.captured.length) runWinCheck(battle);
  if (generalCaptured(battle.board, RED)) finishBattle(battle, BLACK);
  return ev;
}
function playerRanged(battle, piece, target) {
  const ev = performRangedAttack(battle.board, piece, target, battle);
  battle.movedDone[RED] = true;
  logBattle(battle, SIDE_NAME[RED] + '·' + piece.name + '远程攻击' + target.name + ': ' + ev.texts.join(';'));
  if (ev.killed) runWinCheck(battle);
  if (generalCaptured(battle.board, RED)) finishBattle(battle, BLACK);
  return ev;
}
function playerSkill(battle, piece, idx, target) {
  const res = skillUse(battle, piece, idx, target);
  if (res.ok) {
    logBattle(battle, SIDE_NAME[RED] + '·' + piece.name + '使用技能: ' + res.texts.join(';'));
    runWinCheck(battle);
    if (generalCaptured(battle.board, RED)) finishBattle(battle, BLACK);
  }
  return res;
}
function runWinCheck(battle) {
  if (battle.over) return;
  if (generalCaptured(battle.board, BLACK)) finishBattle(battle, RED);
}
function playerEndTurn(battle) {
  if (battle.over) return;
  if (!battle.movedDone[RED] && !battle.skillUsed[RED]) return;
  endSideTurn(battle);
  pumpTurns(battle);
  battleTick();
}

/* 驱动敌方回合直到回到玩家回合(空城计/再动可能导致黑方连续行动) */
async function pumpTurns(battle) {
  try {
    while (!battle.over && battle.turn === BLACK) {
      await enemyTurn(battle);
      battleTick();
      if (!Run || Run.state !== 'battle') return;
    }
    if (Run && Run.state === 'battle' && !battle.over && battle.turn === RED) {
      Flow.onBattleStart && Flow.onBattleStart(battle); /* 通知UI回到玩家回合 */
    }
  } catch (e) {
    console.error(e);
    logBattle(battle, '敌方AI出错,自动判负: ' + (e && e.message));
    battle.over = true; battle.winner = RED; battle.reason = 'aiError';
    battleTick();
  }
}

/* 任何把 battle.over 置真的路径(如无子可动判负/回合上限)都经此结算 */
function battleTick() {
  if (!Run || Run.state !== 'battle') return;
  const b = Run.battle;
  if (b && b.over && !b.settled) finishBattle(b, b.winner || BLACK);
}

/* ---------------- 事件执行 ---------------- */
function applyPieceBuff(p, hp, atk) {
  const texts = [];
  if (hp) { p.permHp = (p.permHp || 0) + hp; p.maxHp += hp; p.hp = p.maxHp; texts.push(p.name + '生命上限+' + hp); }
  if (atk) { p.permAtk = (p.permAtk || 0) + atk; p.atk += atk; texts.push(p.name + '伤害+' + atk); }
  return texts;
}

function reviveFromGrave(run, g) {
  const p = makePiece(g.defId, RED, { hpBonus: run.buffs.hpBonus, atkBonus: run.buffs.atkBonus, generalHp: run.buffs.generalHp, permHp: g.permHp || 0, permAtk: g.permAtk || 0 });
  run.roster.push(p);
  return p;
}
function removePieceFromRoster(run, p) {
  const i = run.roster.indexOf(p);
  if (i >= 0) run.roster.splice(i, 1);
  run.graveyard.push({ defId: p.defId, name: p.name, permHp: p.permHp || 0, permAtk: p.permAtk || 0 });
}

function execFx(run, fx, next) {
  const p = fx.p || {};
  switch (fx.t) {
    case 'pick': {
      Flow.onPickPieces(run, p.n || 1, p.title || '选择棋子', p.note || '', function (picks) {
        const texts = [];
        for (const pick of (picks || [])) {
          if (Math.random() < (p.chance != null ? p.chance : 1)) texts.push(...applyPieceBuff(pick, p.hp || 0, p.atk || 0));
          else texts.push(pick.name + '未能受益');
        }
        next(texts);
      });
      break;
    }
    case 'cards': {
      const count = p.count || 1;
      const texts = [];
      (function one(i) {
        if (i >= count) return next(texts);
        const cards = rollDraft(run.battleNo, { shift: p.shift || 0, onlyPieces: true });
        Flow.onEventReward(cards, p.title || '选择奖励', function (card) {
          texts.push(...applyCard(run, card));
          one(i + 1);
        });
      })(0);
      break;
    }
    case 'revivePick': {
      Flow.onPickGrave(run, '选择要复活的棋子', function (g) {
        if (!g) return next(['没有可以复活的棋子']);
        const gi = run.graveyard.indexOf(g);
        if (gi >= 0) run.graveyard.splice(gi, 1);
        reviveFromGrave(run, g);
        next([g.name + '复活归来!']);
      });
      break;
    }
    case 'reviveRandom': {
      if (!run.graveyard.length) return next(['无亡魂可招']);
      const g = run.graveyard.splice(Math.floor(Math.random() * run.graveyard.length), 1)[0];
      reviveFromGrave(run, g);
      next([g.name + '复活归来!']);
      break;
    }
    case 'hpAllChance': case 'atkAllChance': {
      const texts = [];
      const hp = fx.t === 'hpAllChance' ? (p.n || 1) : 0;
      const atk = fx.t === 'atkAllChance' ? (p.n || 1) : 0;
      for (const pc of run.roster) if (Math.random() < (p.chance || 0.5)) texts.push(...applyPieceBuff(pc, hp, atk));
      next(texts.length ? texts : ['无人受益']);
      break;
    }
    case 'qi': {
      const before = run.buffs.qiPerTurn;
      run.buffs.qiPerTurn = Math.min(3, Math.max(0, run.buffs.qiPerTurn + (p.n || 0)));
      next([run.buffs.qiPerTurn !== before ? '每回合气力' + (p.n > 0 ? '+' : '') + (p.n || 0) : '毫无变化']);
      break;
    }
    case 'generalHp': {
      if (run.buffs.generalHp >= 3) return next(['帅的龙袍已至极限']);
      run.buffs.generalHp += (p.n || 1);
      const g = run.roster.find(x => x.defId === 's_jiang');
      if (g) { g.maxHp += (p.n || 1); g.hp = g.maxHp; }
      next(['帅生命上限+' + (p.n || 1)]);
      break;
    }
    case 'enemyNext': {
      run.tempEnemyAtk = (run.tempEnemyAtk || 0) + (p.n || 0);
      next([p.n >= 0 ? '下一战敌军伤害+' + p.n : '下一战敌军伤害' + p.n]);
      break;
    }
    case 'curse': {
      /* 优先扣有额外生命者,否则扣伤害(至多到基础值);不伤及帅 */
      const cands = run.roster.filter(p => p.defId !== 's_jiang');
      let vic = cands.find(x => (x.permHp || 0) > 0) || cands.find(x => (x.permAtk || 0) > 0);
      if (!vic) vic = cands[Math.floor(Math.random() * cands.length)];
      if (!vic) return next(['阴风过境,无人受伤']);
      const hp = p.hp || 1;
      if ((vic.permHp || 0) > 0) {
        const dec = Math.min(vic.permHp, hp);
        vic.permHp -= dec;
        vic.maxHp = Math.max(1, vic.maxHp - dec);
        if (vic.hp > vic.maxHp) vic.hp = vic.maxHp;
        next([vic.name + '生命上限-' + dec]);
      } else {
        const dec = Math.min(vic.permAtk || 0, hp);
        if (dec > 0) { vic.permAtk -= dec; vic.atk = Math.max(1, vic.atk - dec); next([vic.name + '伤害-' + dec]); }
        else next(['阴气过境,无人受伤']);
      }
      break;
    }
    case 'sacrificeForCards': {
      Flow.onPickPieces(run, 1, '献出哪一名棋子?', '该棋子将永久离开军队', function (picks) {
        const vic = picks && picks[0];
        if (!vic) return next(['无人献出']);
        removePieceFromRoster(run, vic);
        const texts = [vic.name + '离开了军队'];
        const cards = rollDraft(run.battleNo, { shift: p.shift || 0, onlyPieces: true });
        Flow.onEventReward(cards, p.title || '献祭所得', function (card) {
          texts.push(...applyCard(run, card));
          next(texts);
        });
      });
      break;
    }
    case 'transform': {
      Flow.onPickPieces(run, 1, '选择要蜕变的棋子', '它将变为同稀有度或更高的随机棋子', function (picks) {
        const vic = picks && picks[0];
        if (!vic) return next(['无人选择']);
        const i = run.roster.indexOf(vic);
        const baseR = vic.def.r === 0 ? 1 : vic.def.r;
        const targetR = Math.max(1, Math.min(maxRarityFor(run.battleNo), baseR + (p.shift || 0)));
        const ids = DRAFT_POOL.filter(id => P_DEFS[id].r === targetR);
        const nid = ids[Math.floor(Math.random() * ids.length)];
        const np = makePiece(nid, RED, { hpBonus: run.buffs.hpBonus, atkBonus: run.buffs.atkBonus, generalHp: run.buffs.generalHp });
        if (i >= 0) run.roster[i] = np; else run.roster.push(np);
        next([vic.name + '脱胎换骨,成为了' + np.name + '(' + RARITY[targetR] + ')']);
      });
      break;
    }
    case 'hpForAtk': {
      Flow.onPickPieces(run, 1, '选择要压榨潜能的棋子', '生命上限-1(最低1),伤害+' + (p.n || 1), function (picks) {
        const v = picks && picks[0];
        if (!v) return next(['无人选择']);
        v.maxHp = Math.max(1, v.maxHp - 1);
        if (v.hp > v.maxHp) v.hp = v.maxHp;
        v.permAtk = (v.permAtk || 0) + (p.n || 1);
        v.atk += (p.n || 1);
        next([v.name + '生命上限-1,伤害+' + (p.n || 1)]);
      });
      break;
    }
    case 'consume': {
      const c = CONSUMABLES.find(x => x.id === p.id);
      next(c && c.cond(run) ? c.apply(run) : ['无效果']);
      break;
    }
    case 'log': next([p.text || '']); break;
    case 'ambush': {
      /* 挂起事件链,突发战斗结束后由 finishBattle 恢复 */
      run.ambushResume = function (texts) { next(texts); };
      startAmbush(p);
      break;
    }
    default: next([]);
  }
}

/* 顺序执行一组事件效果 */
function runEventFx(run, fxList, done) {
  const texts = [];
  let i = 0;
  (function step() {
    if (i >= (fxList || []).length) return done(texts);
    execFx(run, fxList[i++], function (t) {
      texts.push(...(t || []));
      step();
    });
  })();
}

/* 每两次战斗结束后触发事件 */
function pickEvent(run, battleNo) {
  const seen = run.seenEvents || [];
  let pool = EVENTS.filter(e => (!e.cond || e.cond(run, battleNo)) && seen.indexOf(e.id) < 0);
  if (!pool.length) pool = EVENTS.filter(e => !e.cond && seen.indexOf(e.id) < 0);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------------- 结算与流程推进 ---------------- */
function sweepRoster(battle) {
  const run = Run;
  const dead = run.roster.filter(p => p.dead);
  for (const d of dead) {
    const i = run.roster.indexOf(d);
    if (i >= 0) run.roster.splice(i, 1);
    run.graveyard.push({ defId: d.defId, name: d.name, permHp: d.permHp || 0, permAtk: d.permAtk || 0 });
    run.lost++;
  }
  for (const p of run.roster) {
    p.hp = p.maxHp; p.dead = false; p.r = -1; p.c = -1;
    p.status = { stun: 0, poison: 0 };
    p.atkBoost = 0; p.rage = 0;
    p.firstStrikeUsed = false; p.rebornUsed = false;
    p.cdLeft = {}; p.usesLeft = {}; p.attacksLeft = 0;
  }
}

/* 胜利后推进: 战斗序号+1,保存存档,进入部署 */
function advanceToDeploy() {
  Run.battleNo++;
  saveRun(Run);
  Run.state = 'deploy';
  Flow.onDeploy(Run, Run.battleNo, function (placed) {
    startBattle(Run.battleNo, placed);
  });
}

function doRewardRound(no, opts) {
  const cards = rollDraft(no, opts);
  Run.state = 'reward';
  Flow.onReward(cards, function (card, picks) {
    applyCard(Run, card, picks);
    advanceToDeploy();
  });
}

function doEventRound(no) {
  const ev = pickEvent(Run, no);
  if (!ev) { doRewardRound(no); return; }
  Run.seenEvents.push(ev.id);
  Run.state = 'event';
  Flow.onEvent(ev, function (optIdx) {
    const opt = ev.opts[optIdx] || ev.opts[0];
    runEventFx(Run, opt.fx || [], function (texts) {
      if (opt.txt) texts.push(opt.txt);
      Flow.onEventDone(texts);
      advanceToDeploy();
    });
  });
}

function finishBattle(battle, winner) {
  if (battle.settled) return;
  battle.settled = true;
  battle.over = true;
  battle.winner = winner;
  Flow.onBattleEnd(battle);
  if (winner === RED) {
    Run.wins++;
    Run.kills += battle.enemyPieces.filter(e => e.dead && !e.temp).length;
    sweepRoster(battle);
    /* 突发战斗胜利: 特殊奖励后,恢复事件链 */
    if (battle.ambush && Run.ambushResume) {
      const resume = Run.ambushResume;
      Run.ambushResume = null;
      const cards = rollDraft(Run.battleNo, { shift: battle.rewardShift || 0, onlyPieces: true });
      Run.state = 'reward';
      Flow.onEventReward(cards, '⚡ 突发战斗特殊奖励(稀有度提升)', function (card) {
        applyCard(Run, card);
        resume(['突袭大捷,缴获甚丰!']);
      });
      return;
    }
    if (battle.no >= TOTAL_BATTLES) {
      clearSave();
      Run.state = 'over';
      Flow.onGameOver('victory', Run);
    } else if (battle.no % 2 === 0) {
      doEventRound(battle.no); /* 每两次战斗后触发奇遇 */
    } else {
      doRewardRound(battle.no);
    }
  } else {
    clearSave();
    Run.state = 'over';
    Flow.onGameOver('defeat', Run);
  }
}

/* ---------------- 存档 / 继续(单栏位) ---------------- */
function saveRun(run) {
  if (typeof localStorage === 'undefined') return false;
  try {
    const roster = [], graveyard = run.graveyard.slice();
    for (const p of run.roster) {
      if (p.dead) graveyard.push({ defId: p.defId, name: p.name, permHp: p.permHp || 0, permAtk: p.permAtk || 0 });
      else roster.push({ defId: p.defId, permHp: p.permHp || 0, permAtk: p.permAtk || 0 });
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, battleNo: run.battleNo, wins: run.wins, kills: run.kills, lost: run.lost,
      buffs: run.buffs, roster, graveyard,
      seenEvents: run.seenEvents || [], tempEnemyAtk: run.tempEnemyAtk || 0
    }));
    return true;
  } catch (e) { return false; }
}
function loadSave() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !Array.isArray(s.roster) || !s.buffs) return null;
    return s;
  } catch (e) { return null; }
}
function hasSave() { return !!loadSave(); }
function clearSave() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}
function continueGame() {
  const s = loadSave();
  if (!s) return false;
  Run = makeRun();
  Run.battleNo = s.battleNo; Run.wins = s.wins || 0; Run.kills = s.kills || 0; Run.lost = s.lost || 0;
  Run.buffs = s.buffs;
  Run.roster = s.roster.map(e => makePiece(e.defId, RED, { hpBonus: s.buffs.hpBonus, atkBonus: s.buffs.atkBonus, generalHp: s.buffs.generalHp, permHp: e.permHp || 0, permAtk: e.permAtk || 0 }));
  Run.graveyard = (s.graveyard || []).slice();
  Run.seenEvents = s.seenEvents || [];
  Run.tempEnemyAtk = s.tempEnemyAtk || 0;
  Run.state = 'deploy';
  Flow.onDeploy(Run, Run.battleNo, function (placed) { startBattle(Run.battleNo, placed); });
  return true;
}

/* ---------------- 开局 ---------------- */
function startGame() {
  Run = makeRun();
  doDraftRound(1, 2);
}
function doDraftRound(round, total) {
  const cards = rollDraft(0);
  Run.state = 'draft';
  Flow.onDraft(cards, round, total, function (card) {
    applyCard(Run, card);
    if (round < total) doDraftRound(round + 1, total);
    else {
      saveRun(Run);
      Run.state = 'deploy';
      Flow.onDeploy(Run, 1, function (placed) { startBattle(1, placed); });
    }
  });
}
