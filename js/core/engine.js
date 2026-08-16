/* ============================================================
 * 核心引擎 —— 棋盘、象棋标准规则、通用移动生成、伤害/状态/效果
 * ============================================================ */
'use strict';

const RED = 'red', BLACK = 'black';
const ROWS = 10, COLS = 9;
const SIDE_NAME = { red: '红方', black: '黑方' };
let pieceSeq = 0;

/* Boss/将 标记 */
P_DEFS.s_jiang.isGeneral = true;
P_DEFS.chiyou.isGeneral = true;
P_DEFS.chiyou.isBoss = true;

/* ---------------- 棋盘与棋子 ---------------- */
function newBoard() {
  return { grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)) };
}
function cloneBoard(b) {
  const nb = newBoard();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b.grid[r][c];
    if (!p) continue;
    nb.grid[r][c] = clonePiece(p);
  }
  return nb;
}
function clonePiece(p) {
  return Object.assign({}, p, { status: Object.assign({}, p.status), cdLeft: Object.assign({}, p.cdLeft) });
}
function makePiece(defId, side, opts) {
  opts = opts || {};
  const def = P_DEFS[defId];
  const hp = (def.hp || 1) + (opts.hpBonus || 0) + (defId === 's_jiang' ? (opts.generalHp || 0) : 0) + (opts.permHp || 0);
  return {
    id: 'p' + (++pieceSeq), defId, def, side, name: displayName(defId, side), ch: def.ch,
    hp, maxHp: hp,
    atk: (def.atk || 1) + (opts.atkBonus || 0) + (opts.permAtk || 0),
    permHp: opts.permHp || 0, permAtk: opts.permAtk || 0,
    atkBoost: 0, rage: 0,
    status: { stun: 0, poison: 0 },
    rebornUsed: false, firstStrikeUsed: false,
    cdLeft: {}, usesLeft: {}, temp: !!opts.temp,
    isGeneral: !!def.isGeneral, isBoss: !!def.isBoss,
    attacksLeft: 0,
    /* 同棋子一回合只能「走步/远程」或「放技能」,二者不可兼得 */
    movedThisTurn: false, skilledThisTurn: false,
    r: -1, c: -1, dead: false
  };
}
function placeAt(board, r, c, piece) {
  board.grid[r][c] = piece;
  piece.r = r; piece.c = c;
}
function removeFromBoard(board, piece) {
  if (piece.r >= 0 && board.grid[piece.r][piece.c] === piece) board.grid[piece.r][piece.c] = null;
  piece.r = -1; piece.c = -1;
}
function hasPas(piece, id) {
  return piece.def.pas && piece.def.pas.some(p => p.id === id);
}
function getPas(piece, id) {
  if (!piece.def.pas) return null;
  return piece.def.pas.find(p => p.id === id) || null;
}
function inPalace(side, r, c) {
  const rb = side === RED ? 7 : 0;
  return r >= rb && r <= rb + 2 && c >= 3 && c <= 5;
}
function crossedRiver(piece) {
  return piece.side === RED ? piece.r <= 4 : piece.r >= 5;
}
function sideGeneral(board, side) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = board.grid[r][c];
    if (p && p.side === side && p.isGeneral && !p.dead) return p;
  }
  return null;
}
function alivePieces(board, side) {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = board.grid[r][c];
    if (p && p.side === side && !p.dead) out.push(p);
  }
  return out;
}
function adjacentPieces(board, r, c, side, dist) {
  const out = [];
  for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
    const p = board.grid[rr][cc];
    if (!p || p.dead) continue;
    if (side && p.side !== side) continue;
    if (Math.max(Math.abs(rr - r), Math.abs(cc - c)) <= dist && !(rr === r && cc === c)) out.push(p);
  }
  return out;
}
function nearestEmpty(board, r, c) {
  if (!board.grid[r][c]) return [r, c];
  for (let d = 1; d <= 10; d++) {
    let best = null;
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
      const dd = Math.max(Math.abs(rr - r), Math.abs(cc - c));
      if (dd === d && !board.grid[rr][cc]) { best = [rr, cc]; break; }
    }
    if (best) return best;
  }
  return null;
}
function logBattle(battle, text) {
  if (battle && battle.logs) battle.logs.push(text);
  if (battle && battle.logs.length > 200) battle.logs.splice(0, battle.logs.length - 200);
}

/* ---------------- 行动轨迹生成 ---------------- */
function genPseudoMoves(board, piece, ctx) {
  const out = [];
  if (!piece || piece.dead || piece.status.stun > 0) return out;
  collectMoves(board, piece, piece.def.mv, out);
  /* Boss 二阶段: 增加2格跳跃 */
  if (piece.isBoss && ctx && ctx.battle && ctx.battle.phase >= 2) {
    collectMoves(board, piece, { t: 'leap', s: 'any2' }, out);
  }
  return out;
}

function collectMoves(board, piece, mv, out) {
  if (!mv) return;
  const { r, c, side } = piece;
  const push = (rr, cc, cap) => {
    if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return;
    const cell = board.grid[rr][cc];
    if (cell && cell.side === side) return;
    out.push({ r: rr, c: cc, cap: !!cell, target: cell || null });
  };
  switch (mv.t) {
    case 'horse': {
      const offs = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (const [dr, dc] of offs) {
        if (!mv.noLeg) {
          const lr = r + (Math.abs(dr) === 2 ? dr / 2 : 0);
          const lc = c + (Math.abs(dc) === 2 ? dc / 2 : 0);
          if (lr < 0 || lr >= ROWS || lc < 0 || lc >= COLS || board.grid[lr][lc]) continue;
        }
        push(r + dr, c + dc, false);
      }
      break;
    }
    case 'elephant': {
      const offs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
      for (const [dr, dc] of offs) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        if (!mv.cross) {
          if (side === RED && rr < 5) continue;
          if (side === BLACK && rr > 4) continue;
        }
        if (!mv.noEye && board.grid[r + dr / 2][c + dc / 2]) continue;
        push(rr, cc, false);
      }
      break;
    }
    case 'chariot':
    case 'diag': {
      const dirs = mv.t === 'chariot' ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const cell = board.grid[rr][cc];
          if (!cell) { out.push({ r: rr, c: cc, cap: false, target: null }); }
          else if (cell.side !== side) { out.push({ r: rr, c: cc, cap: true, target: cell }); break; }
          else break;
          rr += dr; cc += dc;
        }
      }
      break;
    }
    case 'cannon': {
      const s = mv.screens == null ? 1 : mv.screens;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc, screens = 0, armed = false;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const cell = board.grid[rr][cc];
          if (!cell) {
            if (!armed) out.push({ r: rr, c: cc, cap: false, target: null });
            rr += dr; cc += dc; continue;
          }
          /* 炮架可为任意棋子(含己方),吃子须隔满指定数量的炮架 */
          screens++;
          if (s === 0) {
            if (cell.side !== side) out.push({ r: rr, c: cc, cap: true, target: cell });
            break;
          }
          if (screens === s + 1) {
            if (cell.side !== side) out.push({ r: rr, c: cc, cap: true, target: cell });
            break;
          }
          if (screens === 1) armed = true;
          rr += dr; cc += dc;
        }
      }
      break;
    }
    case 'pawn': {
      const dir = side === RED ? -1 : 1;
      const cr = crossedRiver(piece);
      push(r + dir, c, false);
      if (mv.fwd2 && !cr && !board.grid[r + dir][c] && !board.grid[r + 2 * dir][c]) {
        push(r + 2 * dir, c, false);
      }
      if (cr) { push(r, c - 1, false); push(r, c + 1, false); }
      break;
    }
    case 'advisor': {
      const offs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of offs) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        if (!inPalace(side, rr, cc)) continue;
        push(rr, cc, false);
      }
      break;
    }
    case 'general': {
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || !inPalace(side, rr, cc)) continue;
        push(rr, cc, false);
      }
      /* 飞将: 两帅照面可直取 */
      const other = sideGeneral(board, side === RED ? BLACK : RED);
      if (other && other.c === c) {
        let clear = true;
        const lo = Math.min(r, other.r), hi = Math.max(r, other.r);
        for (let rr = lo + 1; rr < hi; rr++) if (board.grid[rr][c]) { clear = false; break; }
        if (clear && other.r !== r) out.push({ r: other.r, c: other.c, cap: true, target: other });
      }
      break;
    }
    case 'steps': {
      for (const [dr, dc] of mv.s) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        if (mv.palace && !inPalace(side, rr, cc)) continue;
        push(rr, cc, false);
      }
      break;
    }
    case 'leap': {
      let offs = mv.s;
      if (offs === 'any2') {
        offs = [];
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (Math.max(Math.abs(dr), Math.abs(dc)) <= 2) offs.push([dr, dc]);
        }
      } else if (offs === 'ortho2') {
        offs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
      }
      for (const [dr, dc] of offs) push(r + dr, c + dc, false);
      break;
    }
    case 'fly': {
      for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
        if (rr === r && cc === c) continue;
        const cell = board.grid[rr][cc];
        if (cell && cell.side !== side && cell.isGeneral) continue; /* 飞行不可直取将帅 */
        push(rr, cc, false);
      }
      break;
    }
    case 'union': {
      for (const sub of mv.m) collectMoves(board, piece, sub, out);
      break;
    }
  }
}

/* ---------------- 远程攻击 ---------------- */
function genRangedTargets(board, piece) {
  const out = [];
  const atk = piece.def.attack;
  if (!atk || piece.dead || piece.status.stun > 0) return out;
  const foes = alivePieces(board, piece.side === RED ? BLACK : RED);
  for (const e of foes) {
    if (e.isGeneral && !e.isBoss) continue; /* 远程不可锁定帅将(最终Boss除外) */
    if (atk.type === 'any') { out.push(e); continue; }
    if (atk.type === 'box') {
      if (Math.max(Math.abs(e.r - piece.r), Math.abs(e.c - piece.c)) <= atk.dist) out.push(e);
      continue;
    }
    if (atk.type === 'line') {
      if (e.r !== piece.r && e.c !== piece.c) continue;
      const d = Math.abs(e.r - piece.r) + Math.abs(e.c - piece.c);
      if (d > atk.len) continue;
      if (!atk.jump) {
        const dr = Math.sign(e.r - piece.r), dc = Math.sign(e.c - piece.c);
        let clear = true;
        let rr = piece.r + dr, cc = piece.c + dc;
        while (rr !== e.r || cc !== e.c) {
          if (board.grid[rr][cc]) { clear = false; break; }
          rr += dr; cc += dc;
        }
        if (!clear) continue;
      }
      out.push(e);
    }
  }
  return out;
}

/* ---------------- 攻击力 ---------------- */
function attackPower(piece, battle) {
  let v = piece.atk + piece.atkBoost;
  if (piece.def.pas) for (const p of piece.def.pas) {
    if (p.id === 'dmgBonus') v += p.n;
    if (p.id === 'rageAllyDeath') v += piece.rage * p.n;
  }
  if (battle && battle.turnAtkBonus && battle.turnAtkBonus[piece.side]) v += battle.turnAtkBonus[piece.side];
  return v;
}

/* ---------------- 合法性/将军 ---------------- */
function isSquareAttacked(board, r, c, bySide, battle) {
  const foes = alivePieces(board, bySide);
  for (const f of foes) {
    if (f.status.stun > 0) continue;
    for (const m of genPseudoMoves(board, f, { battle })) {
      if (m.r === r && m.c === c && m.cap) return true;
    }
  }
  return false;
}
function isInCheck(board, side, battle) {
  const g = sideGeneral(board, side);
  if (!g || g.dead) return false;
  return isSquareAttacked(board, g.r, g.c, side === RED ? BLACK : RED, battle);
}
function generalsFace(board) {
  const gR = sideGeneral(board, RED), gB = sideGeneral(board, BLACK);
  if (!gR || !gB || gR.c !== gB.c) return false;
  const lo = Math.min(gR.r, gB.r), hi = Math.max(gR.r, gB.r);
  for (let rr = lo + 1; rr < hi; rr++) if (board.grid[rr][gR.c]) return false;
  return true;
}

function applyMoveRaw(board, piece, r, c) {
  removeFromBoard(board, piece);
  placeAt(board, r, c, piece);
}

function genLegalMoves(board, piece, ctx) {
  if (!piece || piece.dead || piece.status.stun > 0) return [];
  const battle = ctx && ctx.battle;
  const out = [];
  for (const m of genPseudoMoves(board, piece, ctx)) {
    /* 间谍无间: 前N回合敌方不可吃它 */
    if (m.cap && m.target) {
      const ip = getPas(m.target, 'infiltrate');
      if (ip && battle && battle.turnNo <= ip.turns && m.target.side !== piece.side) continue;
    }
    const sim = cloneBoard(board);
    const p2 = sim.grid[piece.r][piece.c];
    const cap = sim.grid[m.r][m.c];
    applyMoveRaw(sim, p2, m.r, m.c);
    if (cap && cap.isGeneral) { out.push(m); continue; } /* 擒王即胜 */
    if (generalsFace(sim)) continue;
    if (isInCheck(sim, piece.side, battle)) continue;
    out.push(m);
  }
  return out;
}
function sideHasLegalMoves(board, side, battle) {
  for (const p of alivePieces(board, side)) {
    if (p.status.stun > 0) continue;
    if (genLegalMoves(board, p, { battle }).length > 0) return true;
  }
  return false;
}

/* ---------------- 伤害/击杀/效果 ---------------- */
function dealDamage(board, target, amount, opts) {
  opts = opts || {};
  const ev = { killed: false, blocked: false, dmg: 0, texts: [] };
  if (!target || target.dead || amount <= 0) return ev;
  let dmg = amount;
  const src = opts.source;
  /* 技能免疫(赵云) */
  if (opts.isSkill && hasPas(target, 'skillImmune')) { ev.blocked = true; ev.texts.push(target.name + '免疫了技能伤害'); return ev; }
  /* 护盾光环 */
  if (!opts.ignoreAura) {
    const guards = adjacentPieces(board, target.r, target.c, target.side, 1);
    let defSum = 0;
    for (const g of guards) {
      const ad = getPas(g, 'auraDef');
      if (ad) defSum += ad.n;
    }
    if (defSum > 0 && dmg > 0) dmg = Math.max(1, dmg - defSum);
    /* 魅惑/削弱: 攻击者身旁的貂蝉/妲己 */
    if (src && !src.dead && dmg > 0) {
      const charm = adjacentPieces(board, src.r, src.c, src.side === RED ? BLACK : RED, 1);
      for (const ch of charm) {
        if (hasPas(ch, 'auraCharm') || hasPas(ch, 'auraWeaken')) dmg = Math.max(1, dmg - 1);
      }
    }
  }
  /* 先手(刺客) */
  if (src && !src.dead) {
    const fs = getPas(src, 'firstStrike');
    if (fs && !src.firstStrikeUsed) { dmg += fs.n; src.firstStrikeUsed = true; }
  }
  dmg = Math.max(0, dmg);
  if (dmg <= 0) { ev.dmg = 0; return ev; }
  ev.dmg = dmg;
  target.hp -= dmg;
  ev.texts.push(target.name + '受到' + dmg + '点伤害(剩' + Math.max(0, target.hp) + '/' + target.maxHp + ')');
  if (target.hp <= 0) {
    killPiece(board, target, src, opts.battle);
    ev.killed = true;
  } else if (opts.battle) {
    checkBossPhaseHook(opts.battle);
  }
  /* 连锁(电母) */
  if (src && !src.dead && !opts.chainGuard) {
    const ch = getPas(src, 'chain');
    if (ch) {
      const cands = alivePieces(board, target.side).filter(x => x !== target && !x.dead &&
        Math.max(Math.abs(x.r - target.r), Math.abs(x.c - target.c)) <= ch.dist);
      if (cands.length) {
        const t2 = cands[Math.floor(Math.random() * cands.length)];
        const ev2 = dealDamage(board, t2, ch.n, { source: src, isSkill: false, chainGuard: true, battle: opts.battle });
        ev.texts.push('连锁: ' + ev2.texts.join(''));
      }
    }
  }
  /* 反震(玄武/许褚/蚩尤): 任何伤害均触发 */
  if (!opts.noThorns && src && !src.dead && src !== target) {
    const th = getPas(target, 'thorns');
    if (th) {
      const ev3 = dealDamage(board, src, th.n, { source: target, isSkill: false, noThorns: true, battle: opts.battle });
      if (ev3.dmg > 0) ev.texts.push('反震: ' + ev3.texts.join(''));
    }
  }
  return ev;
}

function killPiece(board, piece, source, battle) {
  if (piece.dead) return;
  const pr = piece.r, pc = piece.c;
  piece.dead = true;
  removeFromBoard(board, piece);
  /* 友军阵亡怒气(司马懿) */
  const mates = alivePieces(board, piece.side);
  for (const m of mates) if (hasPas(m, 'rageAllyDeath')) m.rage += 1;
  const od = getPas(piece, 'onDeath');
  if (od) {
    if (od.type === 'explode') {
      logBattle(battle, piece.name + '自爆!');
      const foes = alivePieces(board, piece.side === RED ? BLACK : RED);
      for (const f of foes) {
        if (f.isGeneral) continue;
        if (Math.max(Math.abs(f.r - pr), Math.abs(f.c - pc)) <= od.dist) {
          dealDamage(board, f, od.dmg, { source: piece, isSkill: false, battle });
        }
      }
    } else if (od.type === 'reborn') {
      if (!piece.rebornUsed) {
        piece.rebornUsed = true;
        const spot = nearestEmpty(board, pr >= 0 ? pr : (piece.side === RED ? 9 : 0), pc >= 0 ? pc : 4);
        if (spot) {
          piece.hp = od.hp || 1;
          piece.dead = false;
          placeAt(board, spot[0], spot[1], piece);
          logBattle(battle, piece.name + '涅槃重生!');
        }
      }
    } else if (od.type === 'healAllies') {
      for (const m of alivePieces(board, piece.side)) healPiece(m, od.n);
    }
  }
}

function checkBossPhaseHook(battle) {
  if (battle && battle.checkPhase) battle.checkPhase();
}

/* ---------------- 走子(真实) ---------------- */
function applyMove(board, piece, m, battle) {
  const ev = { captured: [], bounced: false, texts: [], winByCapture: false };
  const srcR = piece.r, srcC = piece.c;
  const target = m.target;
  if (target && !target.dead) {
    const dmg = attackPower(piece, battle);
    if (target.hp > dmg) {
      /* 打不死: 攻击者留在原地 */
      const de = dealDamage(board, target, dmg, { source: piece, isSkill: false, battle });
      ev.bounced = true;
      ev.texts = de.texts;
      return ev;
    }
    const de = dealDamage(board, target, dmg, { source: piece, isSkill: false, battle });
    ev.texts = de.texts;
    if (de.killed) {
      ev.captured.push(target);
      if (target.isGeneral) ev.winByCapture = true;
    }
    if (piece.dead) { ev.texts.push(piece.name + '阵亡'); return ev; } /* 反震致死等 */
    /* 落地 */
    applyMoveRaw(board, piece, m.r, m.c);
    /* 吃子效果 */
    for (const pas of (piece.def.pas || [])) {
      if (pas.id !== 'onCapture') continue;
      switch (pas.type) {
        case 'dmgAdj': {
          const foes = adjacentPieces(board, m.r, m.c, piece.side === RED ? BLACK : RED, 1);
          for (const f of foes) { if (!f.isGeneral) dealDamage(board, f, pas.n, { source: piece, isSkill: false, battle }); }
          break;
        }
        case 'stunAdj': {
          const foes = adjacentPieces(board, m.r, m.c, piece.side === RED ? BLACK : RED, 1);
          for (const f of foes) {
            if (f.isGeneral || hasPas(f, 'stunImmune')) continue;
            f.status.stun = pas.turns; ev.texts.push(f.name + '被眩晕' + pas.turns + '回合');
          }
          break;
        }
        case 'poisonAdj': {
          const foes = adjacentPieces(board, m.r, m.c, piece.side === RED ? BLACK : RED, 1);
          for (const f of foes) {
            if (f.isGeneral || hasPas(f, 'poisonImmune')) continue;
            f.status.poison = Math.max(f.status.poison, pas.turns); ev.texts.push(f.name + '中毒');
          }
          break;
        }
        case 'freezeAdj': {
          const foes = adjacentPieces(board, m.r, m.c, piece.side === RED ? BLACK : RED, 1);
          for (const f of foes) {
            if (f.isGeneral || hasPas(f, 'stunImmune')) continue;
            f.status.stun = Math.max(f.status.stun, pas.turns); ev.texts.push(f.name + '被冻结');
          }
          break;
        }
        case 'qi': addQi(battle, piece.side, pas.n); break;
        case 'healSelf': healPiece(piece, pas.n); break;
        case 'dmgBehind': {
          const dr = Math.sign(m.r - srcR), dc = Math.sign(m.c - srcC);
          const br = m.r + dr, bc = m.c + dc;
          if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) {
            const b = board.grid[br][bc];
            if (b && b.side !== piece.side && !b.isGeneral) dealDamage(board, b, pas.n, { source: piece, isSkill: false, battle });
          }
          break;
        }
        case 'extraMove': {
          if (battle) {
            battle.extraMoves[piece.side] = Math.min(battle.extraMoves[piece.side] + pas.n, 2);
            ev.texts.push('再动!');
          }
          break;
        }
      }
    }
  } else {
    applyMoveRaw(board, piece, m.r, m.c);
  }
  return ev;
}

/* ---------------- 远程攻击执行 ---------------- */
function performRangedAttack(board, piece, target, battle) {
  const atk = piece.def.attack;
  const dmg = (atk.dmg || attackPower(piece, battle));
  const ev = dealDamage(board, target, dmg, { source: piece, isSkill: false, battle });
  if (atk.multi) {
    piece.attacksLeft = (piece.attacksLeft || atk.multi) - 1;
    if (piece.attacksLeft > 0 && battle) {
      battle.extraMoves[piece.side] = Math.min(battle.extraMoves[piece.side] + 1, 2);
      ev.texts.push('连射!');
    }
  }
  return ev;
}

/* ---------------- 治疗/气力 ---------------- */
function healPiece(piece, n) {
  if (!piece || piece.dead) return 0;
  const before = piece.hp;
  piece.hp = Math.min(piece.maxHp, piece.hp + n);
  return piece.hp - before;
}
function addQi(battle, side, n) {
  if (battle) battle.qi[side] += n;
}

/* ---------------- 回合管理 ---------------- */
function startSideTurn(battle, side) {
  battle.turn = side;
  if (side === RED) {
    battle.turnNo++;
    if (battle.turnNo > 400) {
      battle.over = true; battle.winner = BLACK; battle.reason = 'draw';
      logBattle(battle, '大战四百回合,我军久攻不下,士气耗尽…');
      return;
    }
  }
  if (battle.over) return;
  const mine = alivePieces(battle.board, side);

  /* 中毒结算 */
  for (const p of mine) {
    if (p.status.poison > 0) {
      dealDamage(battle.board, p, 1, { source: null, isSkill: false, battle });
      p.status.poison--;
      if (battle.over) return;
      if (p.dead) { logBattle(battle, p.name + '毒发身亡'); if (battle.over) return; }
    }
  }
  /* 眩晕递减 */
  for (const p of mine) if (p.status.stun > 0) p.status.stun--;
  /* 技能冷却递减 */
  for (const p of mine) if (!p.dead) for (const k in p.cdLeft) if (p.cdLeft[k] > 0) p.cdLeft[k]--;

  /* 光环: 圣光/清心 */
  for (const p of mine) {
    if (p.dead) continue;
    const ah = getPas(p, 'auraHeal');
    if (ah) {
      for (const a of adjacentPieces(battle.board, p.r, p.c, side, 1)) healPiece(a, ah.n);
    }
    if (hasPas(p, 'auraCleanse')) {
      for (const a of adjacentPieces(battle.board, p.r, p.c, side, 1)) {
        a.status.stun = 0; a.status.poison = 0;
      }
    }
  }
  /* 炼丹师: 治疗伤势最重者 */
  const doc = mine.find(p => !p.dead && hasPas(p, 'healMost'));
  if (doc) {
    const wounded = mine.filter(p => !p.dead && p.hp < p.maxHp)
      .sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp));
    if (wounded.length) { healPiece(wounded[0], getPas(doc, 'healMost').n); }
  }
  /* 麒麟祥瑞 */
  if (side === RED) {
    for (const p of mine) {
      const he = getPas(p, 'healAllEvery');
      if (he && battle.turnNo % he.every === 0) {
        for (const m of mine) if (!m.dead) healPiece(m, he.n);
      }
    }
  }
  /* 气力 */
  let qiGain = 1;
  for (const p of mine) if (!p.dead) { const q = getPas(p, 'qiTurn'); if (q) qiGain += q.n; }
  if (side === RED && battle.run && battle.run.buffs.qiPerTurn) qiGain += battle.run.buffs.qiPerTurn;
  battle.qi[side] += qiGain;

  /* 空城计 */
  if (battle.skipNext[side]) {
    battle.skipNext[side] = false;
    logBattle(battle, '空城计生效,' + SIDE_NAME[side] + '无法行动!');
    endSideTurn(battle);
    return;
  }
  /* 无子可动判负 */
  if (!sideHasLegalMoves(battle.board, side, battle)) {
    battle.over = true;
    battle.winner = side === RED ? BLACK : RED;
    battle.reason = 'noMoves';
    return;
  }
}
function endSideTurn(battle) {
  if (battle.over) return;
  battle.turnAtkBonus[battle.turn] = 0;
  battle.extraMoves[battle.turn] = 0;
  battle.skillUsed[battle.turn] = false;
  battle.movedDone[battle.turn] = false;
  /* 远程连弩计数复位; 每回合「走步/技能」标记复位 */
  for (const p of alivePieces(battle.board, battle.turn)) {
    p.attacksLeft = 0;
    p.movedThisTurn = false;
    p.skilledThisTurn = false;
  }
  startSideTurn(battle, battle.turn === RED ? BLACK : RED);
}

/* 帅将是否被擒 */
function generalCaptured(board, side) {
  const g = sideGeneral(board, side);
  return !g || g.dead;
}
