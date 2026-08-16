/* ============================================================
 * 技能系统 —— 主动技能注册、目标选择、执行
 * ============================================================ */
'use strict';

function fmtSkill(str, p) {
  return str.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? p[k] : m));
}

const SKILLS = {
  /* ---- 治疗 ---- */
  healAdj: {
    need: 'ally', dist: 1, name: '包扎',
    info: '治疗相邻友军{n}点生命',
    targets(piece, battle, p) { return alivePieces(battle.board, piece.side).filter(t => !t.dead && t !== piece && t.hp < t.maxHp && Math.max(Math.abs(t.r - piece.r), Math.abs(t.c - piece.c)) <= 1); },
    apply(piece, battle, p, t) { const n = healPiece(t, p.n); return [n > 0 ? piece.name + '治疗了' + t.name + ' ' + n + '点生命' : '无需治疗']; }
  },
  healAny: {
    need: 'ally', dist: 4, name: '妙手',
    info: '治疗{dist}格内友军{n}点生命',
    targets(piece, battle, p) { return alivePieces(battle.board, piece.side).filter(t => !t.dead && t !== piece && t.hp < t.maxHp && Math.max(Math.abs(t.r - piece.r), Math.abs(t.c - piece.c)) <= (p.dist || 99)); },
    apply(piece, battle, p, t) { const n = healPiece(t, p.n); return [n > 0 ? piece.name + '治疗了' + t.name + ' ' + n + '点生命' : '无需治疗']; }
  },
  healAll: {
    need: 'none', name: '圣疗',
    info: '全体友军回复{n}点生命',
    apply(piece, battle, p) {
      let n = 0;
      for (const m of alivePieces(battle.board, piece.side)) if (!m.dead) n += healPiece(m, p.n);
      return [piece.name + '施法,全体友军回复' + p.n + '点生命(实回' + n + ')'];
    }
  },
  /* ---- 伤害 ---- */
  snipe: {
    need: 'enemy', dist: 3, name: '狙击',
    info: '对{dist}格内任一敌人造成{dmg}点伤害',
    targets(piece, battle, p) { return alivePieces(battle.board, piece.side === RED ? BLACK : RED).filter(t => (t.isBoss || !t.isGeneral) && Math.max(Math.abs(t.r - piece.r), Math.abs(t.c - piece.c)) <= (p.dist || 99)); },
    apply(piece, battle, p, t) { return dealDamage(battle.board, t, p.dmg, { source: piece, isSkill: true, battle }).texts; }
  },
  snipeLine: {
    need: 'enemy', dist: 99, name: '天雷/拖刀',
    info: '对同线任一敌人造成{dmg}点伤害',
    targets(piece, battle) { return alivePieces(battle.board, piece.side === RED ? BLACK : RED).filter(t => (t.isBoss || !t.isGeneral) && (t.r === piece.r || t.c === piece.c)); },
    apply(piece, battle, p, t) { return dealDamage(battle.board, t, p.dmg, { source: piece, isSkill: true, battle }).texts; }
  },
  snipeAny: {
    need: 'enemy', dist: 99, name: '天雷',
    info: '对场上任意敌人造成{dmg}点伤害',
    targets(piece, battle) { return alivePieces(battle.board, piece.side === RED ? BLACK : RED).filter(t => t.isBoss || !t.isGeneral); },
    apply(piece, battle, p, t) { return dealDamage(battle.board, t, p.dmg, { source: piece, isSkill: true, battle }).texts; }
  },
  aoeBox: {
    need: 'square', dist: 3, name: '范围轰击',
    info: '{dist}格内任选中心,{size}×{size}范围敌人受{dmg}点伤害',
    targets(piece, battle, p) {
      const out = [];
      const d = p.dist || 3;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (Math.max(Math.abs(r - piece.r), Math.abs(c - piece.c)) <= d) out.push({ r, c });
      }
      return out;
    },
    apply(piece, battle, p, sq) {
      const lo = -Math.floor((p.size - 1) / 2), hi = Math.ceil((p.size - 1) / 2);
      const texts = [];
      for (const f of alivePieces(battle.board, piece.side === RED ? BLACK : RED)) {
        if (f.isGeneral && !f.isBoss) continue;
        const dr = f.r - sq.r, dc = f.c - sq.c;
        if (dr >= lo && dr <= hi && dc >= lo && dc <= hi) {
          texts.push(...dealDamage(battle.board, f, p.dmg, { source: piece, isSkill: true, battle }).texts);
        }
      }
      return texts.length ? texts : ['轰击落空'];
    }
  },
  lineDamage: {
    need: 'enemy', dist: 99, name: '纵列轰击',
    info: '对目标所在纵列所有敌人造成{dmg}点伤害',
    targets(piece, battle) { return alivePieces(battle.board, piece.side === RED ? BLACK : RED).filter(t => t.isBoss || !t.isGeneral); },
    apply(piece, battle, p, t) {
      const texts = [];
      for (const f of alivePieces(battle.board, piece.side === RED ? BLACK : RED)) {
        if (f.isGeneral && !f.isBoss) continue;
        if (f.c === t.c) texts.push(...dealDamage(battle.board, f, p.dmg, { source: piece, isSkill: true, battle }).texts);
      }
      return texts.length ? texts : ['纵列空无一人'];
    }
  },
  /* ---- 控制 ---- */
  stunTarget: {
    need: 'enemy', dist: 3, name: '定身',
    info: '令{dist}格内一名敌人眩晕{turns}回合',
    targets(piece, battle, p) { return alivePieces(battle.board, piece.side === RED ? BLACK : RED).filter(t => (t.isBoss || !t.isGeneral) && !hasPas(t, 'stunImmune') && Math.max(Math.abs(t.r - piece.r), Math.abs(t.c - piece.c)) <= (p.dist || 99)); },
    apply(piece, battle, p, t) { t.status.stun = Math.max(t.status.stun, p.turns); return [t.name + '被眩晕' + p.turns + '回合']; }
  },
  stunAdj: {
    need: 'none', name: '震慑',
    info: '眩晕相邻敌人{turns}回合',
    apply(piece, battle, p) {
      const foes = adjacentPieces(battle.board, piece.r, piece.c, piece.side === RED ? BLACK : RED, 1);
      let n = 0;
      for (const f of foes) {
        if ((f.isGeneral && !f.isBoss) || hasPas(f, 'stunImmune')) continue;
        f.status.stun = Math.max(f.status.stun, p.turns); n++;
      }
      return [n ? '眩晕了' + n + '名相邻敌人' : '身旁无敌可眩'];
    }
  },
  /* ---- 位移 ---- */
  teleport: {
    need: 'square', dist: 3, name: '瞬步/筋斗云',
    info: '瞬移至{dist}格内任意空格' + '',
    targets(piece, battle, p) {
      const out = [];
      if (p.half) {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          if (!battle.board.grid[r][c] && (piece.side === RED ? r >= 5 : r <= 4)) out.push({ r, c });
        }
        return out;
      }
      const d = p.dist || 3;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!battle.board.grid[r][c] && Math.max(Math.abs(r - piece.r), Math.abs(c - piece.c)) <= d && !(r === piece.r && c === piece.c)) out.push({ r, c });
      }
      return out;
    },
    apply(piece, battle, p, sq) { applyMoveRaw(battle.board, piece, sq.r, sq.c); return [piece.name + '瞬移成功']; }
  },
  dash: {
    need: 'square', dist: 99, name: '冲杀',
    info: '沿直线冲至多{len}格,路线上敌人受{dmg}点伤害',
    targets(piece, battle, p) {
      const out = [];
      const len = p.len || 99;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        for (let i = 1; i <= len; i++) {
          const rr = piece.r + dr * i, cc = piece.c + dc * i;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) break;
          const cell = battle.board.grid[rr][cc];
          if (cell && cell.side === piece.side) break;
          if (cell && cell.isGeneral) break; /* 冲杀不可直取将帅 */
          out.push({ r: rr, c: cc });
        }
      }
      return out;
    },
    apply(piece, battle, p, sq) {
      const texts = [];
      const dr = Math.sign(sq.r - piece.r), dc = Math.sign(sq.c - piece.c);
      let kills = 0, finalR = piece.r, finalC = piece.c;
      let rr = piece.r + dr, cc = piece.c + dc;
      while (rr !== sq.r + dr || cc !== sq.c + dc) {
        const cell = battle.board.grid[rr] ? battle.board.grid[rr][cc] : null;
        if (cell && cell.side === piece.side) break;
        if (cell && cell.isGeneral) break; /* 将帅不可被技能击杀 */
        if (cell && cell.side !== piece.side) {
          const de = dealDamage(battle.board, cell, p.dmg, { source: piece, isSkill: true, battle });
          texts.push(...de.texts);
          if (cell.dead) {
            kills++;
            if (kills >= (p.maxKills || 1)) { finalR = rr; finalC = cc; break; }
          } else {
            break; /* 撞不动了 */
          }
        }
        finalR = rr; finalC = cc;
        rr += dr; cc += dc;
      }
      applyMoveRaw(battle.board, piece, finalR, finalC);
      texts.push(piece.name + '冲杀至' + (finalC + 1) + '列' + (finalR + 1) + '行');
      return texts;
    }
  },
  pounce: {
    need: 'square', dist: 3, name: '猛扑',
    info: '跃至{dist}格内任意点(可越子,落点敌人受攻击)',
    targets(piece, battle, p) {
      const out = [];
      const d = p.dist || 3;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (Math.max(Math.abs(r - piece.r), Math.abs(c - piece.c)) <= d && !(r === piece.r && c === piece.c)) {
          const cell = battle.board.grid[r][c];
          if (!cell || cell.side !== piece.side) out.push({ r, c });
        }
      }
      return out;
    },
    apply(piece, battle, p, sq) {
      const texts = [];
      const cell = battle.board.grid[sq.r][sq.c];
      if (cell && cell.side !== piece.side) {
        const dmg = attackPower(piece, battle);
        texts.push(...dealDamage(battle.board, cell, dmg, { source: piece, isSkill: false, battle }).texts);
        if (!cell.dead) return texts.concat([cell.name + '挡住了' + piece.name]);
        if (cell.isGeneral) texts.push('擒王!');
      }
      applyMoveRaw(battle.board, piece, sq.r, sq.c);
      return texts;
    }
  },
  /* ---- 召唤 ---- */
  summon: {
    need: 'none', name: '召唤',
    info: '在身旁召唤援军',
    apply(piece, battle, p) {
      const texts = [];
      for (let i = 0; i < (p.n || 1); i++) {
        const spot = nearestEmpty(battle.board, piece.r, piece.c);
        if (!spot) { texts.push('无空位召唤'); break; }
        const s = makePiece(p.defId, piece.side, { temp: true, atkBonus: battle.enemyAtkBonus || 0 });
        placeAt(battle.board, spot[0], spot[1], s);
        battle.summoned.push(s);
        texts.push(piece.name + '召唤了' + s.name);
      }
      return texts;
    }
  },
  /* ---- 强化 ---- */
  buffSelf: {
    need: 'none', name: '强化',
    info: '本场自身伤害+{n}',
    apply(piece, battle, p) { piece.atkBoost += p.n; return [piece.name + '本场伤害+' + p.n]; }
  },
  buffAll: {
    need: 'none', name: '战吼',
    info: p => (p.thisTurn ? '本回合全体友军伤害+{n}' : '本场全体友军伤害+{n}'),
    apply(piece, battle, p) {
      if (p.thisTurn) { battle.turnAtkBonus[piece.side] += p.n; return [piece.name + '擂鼓助威,本回合全体友军伤害+' + p.n]; }
      let n = 0;
      for (const m of alivePieces(battle.board, piece.side)) if (!m.dead) { m.atkBoost += p.n; n++; }
      return [piece.name + '赐福' + n + '名友军,伤害+' + p.n];
    }
  },
  enemySkip: {
    need: 'none', name: '空城计',
    info: '敌方下回合无法行动',
    apply(piece, battle) {
      battle.skipNext[piece.side === RED ? BLACK : RED] = true;
      return ['空城计展开,敌方下回合无法行动!'];
    }
  },
  attackAdj: {
    need: 'none', name: '旋风斩',
    info: '对至多{n}名相邻敌人各造成{dmg}点伤害',
    apply(piece, battle, p) {
      const foes = adjacentPieces(battle.board, piece.r, piece.c, piece.side === RED ? BLACK : RED, 1)
        .filter(f => !f.isGeneral || f.isBoss).sort((a, b) => b.def.val - a.def.val).slice(0, p.n || 99);
      const texts = [];
      for (const f of foes) texts.push(...dealDamage(battle.board, f, p.dmg, { source: piece, isSkill: true, battle }).texts);
      return texts.length ? texts : ['身旁无敌'];
    }
  },
  pushRow: {
    need: 'enemy', dist: 99, name: '狂风',
    info: '将目标所在行的敌人推向其底线1格',
    targets(piece, battle) { return alivePieces(battle.board, piece.side === RED ? BLACK : RED).filter(t => !t.isGeneral); },
    apply(piece, battle, p, t) {
      const dir = t.side === RED ? 1 : -1;
      const row = alivePieces(battle.board, t.side).filter(f => f.r === t.r && !f.isGeneral);
      row.sort((a, b) => dir > 0 ? b.r - a.r : a.r - b.r);
      let n = 0;
      for (const f of row) {
        const rr = f.r + dir;
        if (rr < 0 || rr >= ROWS || battle.board.grid[rr][f.c]) continue;
        applyMoveRaw(battle.board, f, rr, f.c); n++;
      }
      return [n ? '狂风推走' + n + '名敌人' : '狂风受阻'];
    }
  },
  pushCol: {
    need: 'enemy', dist: 99, name: '呼风',
    info: '将目标所在列的敌人推向其底线1格',
    targets(piece, battle) { return alivePieces(battle.board, piece.side === RED ? BLACK : RED).filter(t => !t.isGeneral); },
    apply(piece, battle, p, t) {
      const dir = t.side === RED ? 1 : -1;
      const col = alivePieces(battle.board, t.side).filter(f => f.c === t.c && !f.isGeneral);
      col.sort((a, b) => dir > 0 ? b.r - a.r : a.r - b.r);
      let n = 0;
      for (const f of col) {
        const rr = f.r + dir;
        if (rr < 0 || rr >= ROWS || battle.board.grid[rr][f.c]) continue;
        applyMoveRaw(battle.board, f, rr, f.c); n++;
      }
      return [n ? '呼风吹走' + n + '名敌人' : '狂风受阻'];
    }
  }
};

/* ---------------- 技能就绪/目标/使用 ---------------- */
function skillReady(battle, piece, idx) {
  const act = piece.def.act[idx];
  if (!act) return { ok: false, reason: '' };
  if (battle.skillUsed[piece.side]) return { ok: false, reason: '本回合已使用过技能' };
  if ((piece.cdLeft[idx] || 0) > 0) return { ok: false, reason: '冷却中(剩' + piece.cdLeft[idx] + '回合)' };
  const used = piece.usesLeft[idx] == null ? 0 : (act.uses || 0) - (piece.usesLeft[idx] || 0);
  if (act.uses && used >= act.uses) return { ok: false, reason: '本场次数已用完' };
  if ((act.cost || 0) > battle.qi[piece.side]) return { ok: false, reason: '气力不足' };
  return { ok: true, reason: '' };
}
function skillTargets(piece, battle, act) {
  const s = SKILLS[act.id];
  if (!s) return [];
  return s.targets ? s.targets(piece, battle, act.p || {}) : [];
}
function skillNeedsTarget(act) {
  const s = SKILLS[act.id];
  return s && s.need !== 'none';
}
function skillUse(battle, piece, idx, target) {
  const act = piece.def.act[idx];
  const s = SKILLS[act.id];
  const rd = skillReady(battle, piece, idx);
  if (!rd.ok) return { ok: false, texts: [rd.reason] };
  const texts = [];
  if (s.need === 'ally') {
    if (!target || target.side !== piece.side) return { ok: false, texts: ['目标无效'] };
  } else if (s.need === 'enemy') {
    if (!target || target.side === piece.side) return { ok: false, texts: ['目标无效'] };
  } else if (s.need === 'square') {
    if (!target || target.r == null) return { ok: false, texts: ['目标无效'] };
  }
  const res = s.apply(piece, battle, act.p || {}, target);
  texts.push(...(Array.isArray(res) ? res : [res]));
  if (act.cost) { battle.qi[piece.side] -= act.cost; texts.push('消耗' + act.cost + '气力'); }
  battle.skillUsed[piece.side] = true;
  piece.cdLeft[idx] = (piece.cdOverride && piece.cdOverride[idx]) || (act.cd || 1);
  if (act.uses) {
    const used = (act.uses) - (piece.usesLeft[idx] == null ? act.uses : piece.usesLeft[idx]);
    piece.usesLeft[idx] = Math.max(0, (piece.usesLeft[idx] == null ? act.uses : piece.usesLeft[idx]) - 1);
  }
  return { ok: true, texts };
}
function skillLabel(act) {
  const s = SKILLS[act.id];
  if (!s) return '';
  const info = typeof s.info === 'function' ? s.info(act.p || {}) : s.info;
  let txt = (s.name || '') + ': ' + fmtSkill(info, act.p || {});
  if (act.cost) txt += '·耗' + act.cost + '气';
  if (act.cd) txt += '·冷却' + act.cd;
  if (act.uses) txt += '·限' + act.uses + '次';
  return txt;
}
