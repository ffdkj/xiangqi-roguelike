/* ============================================================
 * 敌方 AI —— 走子评估、再动、技能使用
 * ============================================================ */
'use strict';

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function cheapestAttacker(board, r, c, bySide, battle) {
  let cheap = null;
  for (const p of alivePieces(board, bySide)) {
    if (p.status.stun > 0) continue;
    for (const m of genLegalMoves(board, p, { battle })) {
      if (m.r === r && m.c === c && m.cap) {
        if (cheap === null || p.def.val < cheap) cheap = p.def.val;
      }
    }
  }
  return cheap;
}

function scoreMove(battle, piece, m) {
  let s = 0;
  if (m.cap && m.target) {
    const dmg = attackPower(piece, battle);
    if (m.target.isGeneral) return 10000;
    s += m.target.def.val * 10;
    if (m.target.hp <= dmg) {
      s += 6;
      /* 被吃回的风险 */
      const rec = cheapestAttacker(battle.board, m.r, m.c, RED, battle);
      if (rec !== null) {
        if (rec <= piece.def.val) s -= piece.def.val * 4;
        else s -= 2.5;
      }
    } else {
      s += dmg * 3 - 6;
    }
  }
  /* 将军(近似: 直线可达) */
  const g = sideGeneral(battle.board, RED);
  if (g && (m.r === g.r || m.c === g.c)) {
    const dr = Math.sign(g.r - m.r), dc = Math.sign(g.c - m.c);
    let clear = true;
    let rr = m.r + dr, cc = m.c + dc;
    while (rr !== g.r || cc !== g.c) {
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || battle.board.grid[rr][cc]) { clear = false; break; }
      rr += dr; cc += dc;
    }
    if (clear) s += 30;
  }
  /* 位置: 前压、占中 */
  s += m.r * 0.25;
  s += (4 - Math.abs(m.c - 4)) * 0.1;
  if (piece.isGeneral) s -= 2;
  s += Math.random() * 2;
  return s;
}

function scoreRanged(battle, piece, t) {
  const atk = piece.def.attack;
  const dmg = atk.dmg || attackPower(piece, battle);
  let s = dmg * 2 + 2;
  if (t.hp <= dmg) s += t.def.val * 8 + 6;
  s += Math.random();
  return s;
}

function chooseAction(battle) {
  let best = null;
  const candidates = [];
  for (const p of alivePieces(battle.board, BLACK)) {
    if (p.status.stun > 0 || p.skilledThisTurn) continue; /* 放过技能的棋子不能再动 */
    for (const m of genLegalMoves(battle.board, p, { battle })) {
      const sc = scoreMove(battle, p, m);
      candidates.push({ kind: 'move', piece: p, m, score: sc });
    }
    for (const t of genRangedTargets(battle.board, p)) {
      candidates.push({ kind: 'ranged', piece: p, target: t, score: scoreRanged(battle, p, t) });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.filter(x => x.score >= candidates[0].score - 4);
  return top[Math.floor(Math.random() * top.length)];
}

function scoreSkill(battle, p, act, t) {
  const foes = alivePieces(battle.board, RED);
  const mine = alivePieces(battle.board, BLACK);
  const P = act.p || {};
  switch (act.id) {
    case 'healAdj': case 'healAny': case 'healAll': {
      const wounded = mine.filter(x => x.hp < x.maxHp);
      if (!wounded.length) return 0;
      let heal = 0;
      if (act.id === 'healAll') heal = wounded.length * P.n;
      else if (t) heal = Math.min(P.n, t.maxHp - t.hp);
      return heal * 6;
    }
    case 'snipe': case 'snipeAny': case 'snipeLine': {
      if (!t) return 0;
      let s = P.dmg * 2;
      if (t.hp <= P.dmg) s += t.def.val * 8;
      return s;
    }
    case 'aoeBox': {
      if (!t) return 0;
      const lo = -Math.floor((P.size - 1) / 2), hi = Math.ceil((P.size - 1) / 2);
      let s = 0;
      for (const f of foes) {
        if (f.isGeneral) continue;
        const dr = f.r - t.r, dc = f.c - t.c;
        if (dr >= lo && dr <= hi && dc >= lo && dc <= hi) {
          s += P.dmg * 2 + (f.hp <= P.dmg ? f.def.val * 8 : 0);
        }
      }
      return s;
    }
    case 'lineDamage': {
      if (!t) return 0;
      let s = 0;
      for (const f of foes) if (!f.isGeneral && f.c === t.c) s += P.dmg * 2 + (f.hp <= P.dmg ? f.def.val * 8 : 0);
      return s;
    }
    case 'stunTarget': return t ? 3 + t.def.val / 4 : 0;
    case 'stunAdj': {
      const adj = adjacentPieces(battle.board, p.r, p.c, RED, 1).filter(f => !f.isGeneral && !hasPas(f, 'stunImmune'));
      return adj.length * 2.5;
    }
    case 'teleport': {
      const inDanger = cheapestAttacker(battle.board, p.r, p.c, RED, battle) !== null;
      return inDanger ? 5 : 1;
    }
    case 'summon': return mine.length < foes.length - 1 ? 8 : 2;
    case 'buffSelf': return battle.turnNo <= 5 ? 4 : 2;
    case 'buffAll': return mine.length >= 6 ? 4 + mine.length : 0;
    case 'enemySkip': return foes.length >= 5 ? 10 : 0;
    case 'dash': {
      if (!t) return 0;
      const dr = Math.sign(t.r - p.r), dc = Math.sign(t.c - p.c);
      let s = 3, rr = p.r + dr, cc = p.c + dc, kills = 0;
      while (rr !== t.r + dr || cc !== t.c + dc) {
        const cell = battle.board.grid[rr] ? battle.board.grid[rr][cc] : null;
        if (cell && cell.side === RED) {
          s += P.dmg * 2 + (cell.hp <= P.dmg ? cell.def.val * 8 : 0);
          kills++;
          if (kills >= (P.maxKills || 1)) break;
        }
        rr += dr; cc += dc;
      }
      return s;
    }
    case 'pounce': {
      if (!t) return 0;
      const cell = battle.board.grid[t.r][t.c];
      if (cell && cell.side === RED) {
        const dmg = attackPower(p, battle);
        return dmg * 2 + (cell.hp <= dmg ? cell.def.val * 8 : 0);
      }
      return 2;
    }
    case 'attackAdj': {
      const adj = adjacentPieces(battle.board, p.r, p.c, RED, 1).filter(f => !f.isGeneral);
      let s = 0;
      for (const f of adj) s += P.dmg * 2 + (f.hp <= P.dmg ? f.def.val * 8 : 0);
      return s;
    }
    case 'pushRow': case 'pushCol': return 2;
    default: return 1;
  }
}

function tryUseSkill(battle) {
  if (battle.skillUsed[BLACK] || battle.over) return;
  if (Math.random() > (battle.skillProb != null ? battle.skillProb : 0.5)) return;
  let best = null;
  for (const p of alivePieces(battle.board, BLACK)) {
    if (p.status.stun > 0 || !p.def.act) continue;
    for (let idx = 0; idx < p.def.act.length; idx++) {
      const act = p.def.act[idx];
      const rd = skillReady(battle, p, idx);
      if (!rd.ok) continue;
      const tg = skillTargets(p, battle, act);
      if (tg.length === 0 && skillNeedsTarget(act)) continue;
      const list = tg.length ? tg : [null];
      for (const t of list) {
        const sc = scoreSkill(battle, p, act, t);
        if (sc > 0 && (!best || sc > best.sc)) best = { p, idx, t, sc };
      }
    }
  }
  if (best && best.sc >= 5) {
    const res = skillUse(battle, best.p, best.idx, best.t);
    if (res.ok) {
      logBattle(battle, SIDE_NAME[BLACK] + '·' + best.p.name + '使用技能: ' + res.texts.join(';'));
      if (generalCaptured(battle.board, RED)) {
        battle.over = true; battle.winner = BLACK; battle.reason = 'capture';
      }
    }
  }
}

async function enemyTurn(battle) {
  const side = BLACK;
  let actions = 0;
  let maxActions = 1;
  if (battle.bossAlive && battle.phase >= 3) maxActions += battle.bossExtra || 0;
  while (actions < maxActions) {
    if (battle.over) break;
    const action = chooseAction(battle);
    if (!action) {
      battle.over = true; battle.winner = RED; battle.reason = 'noMoves';
      break;
    }
    await sleep(420);
    if (battle.over) break;
    if (action.kind === 'move') {
      const from = [action.piece.r, action.piece.c];
      const ev = applyMove(battle.board, action.piece, action.m, battle);
      action.piece.movedThisTurn = true;
      const cap = ev.captured.length ? '吃' + ev.captured.map(x => x.name).join('、') : '';
      logBattle(battle, SIDE_NAME[BLACK] + '·' + action.piece.name + ' (' + (from[1] + 1) + ',' + (from[0] + 1) + ')→(' + (action.m.c + 1) + ',' + (action.m.r + 1) + ') ' + cap + (ev.texts.length ? ' [' + ev.texts.join(';') + ']' : ''));
      if (generalCaptured(battle.board, RED)) { battle.over = true; battle.winner = BLACK; battle.reason = 'capture'; break; }
    } else {
      const ev = performRangedAttack(battle.board, action.piece, action.target, battle);
      action.piece.movedThisTurn = true;
      logBattle(battle, SIDE_NAME[BLACK] + '·' + action.piece.name + '远程攻击' + action.target.name + ': ' + ev.texts.join(';'));
      if (generalCaptured(battle.board, RED)) { battle.over = true; battle.winner = BLACK; battle.reason = 'capture'; break; }
    }
    actions++;
    if (battle.extraMoves[side] > 0) {
      battle.extraMoves[side]--;
      maxActions = Math.min(maxActions + 1, 3);
    }
  }
  if (!battle.over) {
    await sleep(420);
    tryUseSkill(battle);
  }
  if (!battle.over) endSideTurn(battle);
}
