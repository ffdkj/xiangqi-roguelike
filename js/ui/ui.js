/* ============================================================
 * UI 层 —— 棋盘渲染/交互、选将卡牌、部署、侧栏、弹窗
 * ============================================================ */
'use strict';

const UI = {
  mode: 'menu',
  battle: null,
  run: null,
  sel: null, selMoves: [], selTargets: [],
  skillPending: null,
  deploy: null,
  deployCb: null,
  rewardCb: null,
  thinking: false,
  lastMove: null,
  inspect: null, inspectMoves: [], inspectTargets: [],
  detailModal: null
};

function $(s) { return document.querySelector(s); }
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------------- 文案助手 ---------------- */
function moveLabel(def) {
  const mv = def.mv;
  if (!mv) return '—';
  switch (mv.t) {
    case 'horse': return '日字' + (mv.noLeg ? '·无蹩腿' : '');
    case 'elephant': return '田字' + (mv.cross ? '·可过河' : '') + (mv.noEye ? '·无塞眼' : '');
    case 'chariot': return '直线任意驰骋';
    case 'diag': return '斜线任意驰骋';
    case 'cannon': return mv.screens === 0 ? '炮·无需炮架' : mv.screens === 2 ? '炮·隔两子轰击' : '炮·隔一子轰击';
    case 'pawn': return '兵·前进' + (mv.fwd2 ? '一二格' : '一步') + '·过河横行';
    case 'advisor': return '斜行一步·限九宫';
    case 'general': return '直行一步·限九宫';
    case 'steps': {
      const diag = mv.s.some(o => o[0] !== 0 && o[1] !== 0);
      return '一步·' + (diag ? '八面' : '横直') + (mv.palace ? '·限宫内' : '');
    }
    case 'leap': return mv.s === 'any2' ? '二格跳跃·任意方向' : '直跳两格';
    case 'fly': return '全盘飞行(不食将)';
    case 'union': return mv.m.map(m => moveLabel({ mv: m })).join(' / ');
    default: return '';
  }
}
function pasLabel(p) {
  switch (p.id) {
    case 'extraMove': return '吃子后可再动' + p.n + '次';
    case 'qiTurn': return '每回合气力+' + p.n;
    case 'qiCapture': return '吃子+气力' + p.n;
    case 'qiStart': return '开战气力+' + p.n;
    case 'auraAtk': return '光环: ' + (p.scope === 2 ? '2格内' : '相邻') + '友军伤害+' + p.n;
    case 'auraDef': return '光环: 相邻友军受伤害-' + p.n;
    case 'auraHeal': return '光环: 每回合治疗相邻友军' + p.n;
    case 'healAllEvery': return '每' + p.every + '回合全体友军回复' + p.n;
    case 'healMost': return '每回合自动治疗伤势最重友军' + p.n;
    case 'stunImmune': return '免疫眩晕/冻结';
    case 'poisonImmune': return '免疫中毒';
    case 'skillImmune': return '免疫技能伤害';
    case 'thorns': return '反震: 攻击者受' + p.n + '点伤害';
    case 'dmgBonus': return '攻击伤害+' + p.n;
    case 'onDeath':
      if (p.type === 'explode') return '阵亡自爆: ' + p.dist + '格内敌人受' + p.dmg + '点伤害';
      if (p.type === 'reborn') return '涅槃: 本场首次阵亡原地复活';
      if (p.type === 'healAllies') return '阵亡时全体友军回复' + p.n;
      return '阵亡效果';
    case 'onCapture':
      if (p.type === 'dmgAdj') return '吃子时目标相邻敌受' + p.n + '点伤害';
      if (p.type === 'stunAdj') return '吃子时眩晕相邻敌' + p.turns + '回合';
      if (p.type === 'poisonAdj') return '吃子时相邻敌中毒' + p.turns + '回合';
      if (p.type === 'freezeAdj') return '吃子时冻结相邻敌' + p.turns + '回合';
      if (p.type === 'qi') return '吃子+气力' + p.n;
      if (p.type === 'dmgBehind') return '吃子时其身后敌受' + p.n + '点伤害';
      if (p.type === 'healSelf') return '吃子回复' + p.n + '点生命';
      if (p.type === 'extraMove') return '吃子后可再动' + p.n + '次';
      return '吃子效果';
    case 'auraCharm': return '魅惑: 相邻敌伤害-1且无法使用技能';
    case 'auraWeaken': return '狐魅: 相邻敌伤害-1';
    case 'rageAllyDeath': return '友军阵亡时本场伤害+' + p.n;
    case 'infiltrate': return '无间: 前' + p.turns + '回合敌方不可吃它';
    case 'auraCleanse': return '每回合解除相邻友军眩晕/中毒';
    case 'firstStrike': return '本场首次攻击伤害+' + p.n;
    case 'chain': return '连锁: 伤害后对目标' + p.dist + '格内随机敌再造成' + p.n + '点伤害';
    default: return p.id;
  }
}
function depLabel(dep) {
  return { palace: '九宫内', back2: '底线两排', back3: '底线三排', ownHalf: '己方半场', river: '河边两排', enemyHalf: '敌方后三排' }[dep] || dep;
}
function atkLabel(piece) {
  let t = '';
  if (piece.def.attack) {
    const a = piece.def.attack;
    if (a.type === 'any') t = '可射击全场(将帅除外,可狙最终Boss)' + (a.dmg ? '·伤害' + a.dmg : '');
    else if (a.type === 'line') t = '可直射' + a.len + '格' + (a.jump ? '(可越子)' : '') + (a.multi ? '·每回合' + a.multi + '次' : '');
    else if (a.type === 'box') t = '可原地射击' + a.dist + '格内';
  }
  return t;
}

/* ---------------- 构建界面骨架 ---------------- */
function buildShell() {
  const app = $('#app');
  app.innerHTML = `
  <div id="screen-menu" class="screen">
    <div class="menu-inner">
      <div class="menu-title">楚汉烽烟</div>
      <div class="menu-sub">—— 中国象棋 · 肉鸽闯关 ——</div>
      <div class="menu-features">
        <p>⚔️ 开局规则与象棋完全一致,十六子整装待发</p>
        <p>🎴 开局两次「三选一」招募奇兵,击败每关敌人后再得三选一</p>
        <p>⚡ 每两次战斗结束后触发「行军奇遇」: 五十余种事件,权衡利弊</p>
        <p>🪦 阵亡棋子永久消逝,每一步都是生死的抉择</p>
        <p>♟️ 上百种特色棋子: 各异行动轨迹、部署位置、主动技能与被动光环</p>
        <p>📈 敌军随胜场步步变强,小Boss与最终Boss「蚩尤」虎视眈眈</p>
        <p>💾 进度自动存档(单栏位),可随时保存退出、继续征战</p>
        <p>⚡ 气力与技能: 每回合可走一步 + 释放一次主动技能</p>
      </div>
      <div class="menu-btns">
        <button class="btn btn-primary btn-big" id="btn-start">开始征战</button>
        <button class="btn btn-big hidden" id="btn-continue">▶ 继续征战</button>
        <button class="btn" id="btn-codex-menu">棋子图鉴</button>
        <button class="btn" id="btn-help-menu">玩法说明</button>
      </div>
    </div>
  </div>
  <div id="screen-game" class="screen hidden">
    <div id="game-top">
      <div class="top-left">
        <span id="tb-battle">第1战</span>
        <span id="tb-wins">胜场 0</span>
        <span id="tb-qi">气力 0</span>
        <span id="tb-alive">存活 0</span>
        <span id="tb-dead">阵亡 0</span>
      </div>
      <div class="top-right">
        <button class="btn btn-sm" id="btn-codex">图鉴</button>
        <button class="btn btn-sm" id="btn-help">帮助</button>
        <button class="btn btn-sm" id="btn-savequit">保存退出</button>
        <button class="btn btn-sm btn-danger" id="btn-surrender">认输</button>
      </div>
    </div>
    <div id="game-main">
      <div id="board-wrap"><div id="board"></div><div id="board-msg" class="hidden"></div></div>
      <div id="sidebar">
        <div id="sb-intel" class="sb-box"></div>
        <div id="sb-skill" class="sb-box"></div>
        <div id="sb-actions" class="sb-box"></div>
        <div id="sb-roster" class="sb-box"></div>
        <div id="sb-log" class="sb-box"></div>
      </div>
    </div>
  </div>
  <div id="banner-root"></div>
  <div id="toast-root"></div>
  <div id="modal-root"></div>`;
  $('#btn-start').onclick = () => { hideMenu(); startGame(); };
  $('#btn-continue').onclick = () => { if (!continueGame()) { refreshContinueBtn(); toast('存档已失效'); return; } hideMenu(); };
  $('#btn-codex').onclick = showCodex;
  $('#btn-codex-menu').onclick = showCodex;
  $('#btn-help').onclick = showHelp;
  $('#btn-help-menu').onclick = showHelp;
  $('#btn-savequit').onclick = () => {
    if (!Run) return;
    if (UI.mode === 'battle' && UI.battle && !UI.battle.over && confirm('保存并退出?\n当前战斗将不保存胜负,进度存于本战开战前(战斗中阵亡的棋子将被计入阵亡)。')) {
      saveRun(Run); backToMenu(); toast('进度已保存,可随时继续征战');
    } else if (UI.mode === 'deploy') {
      saveRun(Run); backToMenu(); toast('进度已保存,可随时继续征战');
    }
  };
  $('#btn-surrender').onclick = () => {
    const b = UI.battle;
    if (b && !b.over && confirm('确定认输吗?此战将告负。')) finishBattle(b, BLACK);
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (UI.mode === 'over') return; /* 结算弹窗不可被ESC关闭 */
      UI.sel = null; UI.skillPending = null;
      UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = [];
      if (UI.detailModal) { closeModal(UI.detailModal); UI.detailModal = null; }
      refresh();
    }
  });
}
function hideMenu() { $('#screen-menu').classList.add('hidden'); $('#screen-game').classList.remove('hidden'); }
function showMenu() { $('#screen-menu').classList.remove('hidden'); $('#screen-game').classList.add('hidden'); }
function refreshContinueBtn() {
  const btn = $('#btn-continue');
  if (btn) btn.classList.toggle('hidden', !hasSave());
}
function backToMenu() {
  Run = null;
  UI.battle = null; UI.run = null; UI.mode = 'menu';
  UI.sel = null; UI.selMoves = []; UI.selTargets = [];
  UI.skillPending = null; UI.deploy = null; UI.deployCb = null; UI.rewardCb = null;
  UI.thinking = false; UI.lastMove = null; UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = []; UI.detailModal = null;
  closeAllModals();
  showMenu();
  refreshContinueBtn();
  refresh();
}

/* ---------------- 棋盘渲染 ---------------- */
const BOARD_SVG = `<svg viewBox="0 0 800 900" preserveAspectRatio="none" class="board-bg">
<rect x="5" y="5" width="790" height="890" rx="10" fill="none" stroke="#3d2410" stroke-width="12"/>
<g stroke="#4a2c12" stroke-width="4.5" fill="none">
  <line x1="0" y1="0" x2="0" y2="900"/><line x1="800" y1="0" x2="800" y2="900"/>
  <line x1="100" y1="0" x2="100" y2="400"/><line x1="100" y1="500" x2="100" y2="900"/>
  <line x1="200" y1="0" x2="200" y2="400"/><line x1="200" y1="500" x2="200" y2="900"/>
  <line x1="300" y1="0" x2="300" y2="400"/><line x1="300" y1="500" x2="300" y2="900"/>
  <line x1="400" y1="0" x2="400" y2="400"/><line x1="400" y1="500" x2="400" y2="900"/>
  <line x1="500" y1="0" x2="500" y2="400"/><line x1="500" y1="500" x2="500" y2="900"/>
  <line x1="600" y1="0" x2="600" y2="400"/><line x1="600" y1="500" x2="600" y2="900"/>
  <line x1="700" y1="0" x2="700" y2="400"/><line x1="700" y1="500" x2="700" y2="900"/>
  <line x1="0" y1="0" x2="800" y2="0"/><line x1="0" y1="100" x2="800" y2="100"/>
  <line x1="0" y1="200" x2="800" y2="200"/><line x1="0" y1="300" x2="800" y2="300"/>
  <line x1="0" y1="400" x2="800" y2="400"/><line x1="0" y1="500" x2="800" y2="500"/>
  <line x1="0" y1="600" x2="800" y2="600"/><line x1="0" y1="700" x2="800" y2="700"/>
  <line x1="0" y1="800" x2="800" y2="800"/><line x1="0" y1="900" x2="800" y2="900"/>
  <line x1="300" y1="0" x2="500" y2="200"/><line x1="500" y1="0" x2="300" y2="200"/>
  <line x1="300" y1="700" x2="500" y2="900"/><line x1="500" y1="700" x2="300" y2="900"/>
</g>
<text x="200" y="458" text-anchor="middle" font-size="46" fill="#8a5a2b" opacity="0.75">楚 河</text>
<text x="600" y="458" text-anchor="middle" font-size="46" fill="#8a5a2b" opacity="0.75">汉 界</text>
<g fill="#4a2c12">
  <circle cx="100" cy="200" r="7"/><circle cx="700" cy="200" r="7"/>
  <circle cx="100" cy="700" r="7"/><circle cx="700" cy="700" r="7"/>
  <circle cx="0" cy="300" r="7"/><circle cx="200" cy="300" r="7"/><circle cx="400" cy="300" r="7"/><circle cx="600" cy="300" r="7"/><circle cx="800" cy="300" r="7"/>
  <circle cx="0" cy="600" r="7"/><circle cx="200" cy="600" r="7"/><circle cx="400" cy="600" r="7"/><circle cx="600" cy="600" r="7"/><circle cx="800" cy="600" r="7"/>
</g>
</svg>`;

function pieceClass(p) {
  let cls = 'pc side-' + p.side;
  if (p.def.r === 0) cls += ' rar-std';
  else cls += ' rar-' + p.def.r;
  if (p.isGeneral && !p.isBoss) cls += ' gen';
  if (p.isBoss) cls += ' boss';
  return cls;
}
function pieceHtml(p, small) {
  const name = displayName(p.defId, p.side);
  let badge = '';
  if (p.maxHp > 1) badge = '<span class="hp-badge">' + Math.max(0, p.hp) + '/' + p.maxHp + '</span>';
  if (p.isGeneral) badge += '<span class="king-badge">' + (p.defId === 'chiyou' ? '王' : esc(name)) + '</span>';
  let st = '';
  if (p.status.stun > 0) st += '<span class="st-icon">💫</span>';
  if (p.status.poison > 0) st += '<span class="st-icon">☠️</span>';
  const dmg = attackPower(p, UI.battle);
  return `<div class="${pieceClass(p)}${small ? ' sm' : ''}" style="left:${p.c / 8 * 100}%;top:${p.r / 9 * 100}%" title="${esc(name)}">` +
    `<span class="pc-ch">${esc(name.length > 1 ? name.slice(0, 1) : name)}</span>` +
    (name.length > 1 ? `<span class="pc-sub">${esc(name.slice(1))}</span>` : '') +
    (dmg > 1 ? `<span class="atk-badge">${dmg}</span>` : '') +
    badge + st + '</div>';
}

function renderBoard() {
  const bEl = $('#board');
  bEl.innerHTML = BOARD_SVG;
  const board = UI.battle ? UI.battle.board : (UI.mode === 'deploy' ? UI.deploy.board : null);
  if (!board) return;
  /* 部署区高亮 */
  if (UI.mode === 'deploy' && UI.deploy.sel) {
    for (const [r, c] of UI.deploy.zone) {
      if (!board.grid[r][c]) bEl.appendChild(marker(r, c, 'sq-zone'));
    }
  }
  /* 技能目标高亮 */
  if (UI.skillPending) {
    const sk = UI.skillPending;
    const tg = skillTargets(sk.piece, UI.battle, sk.act);
    if (sk.act && SKILLS[sk.act.id] && SKILLS[sk.act.id].need === 'square') {
      for (const t of tg) bEl.appendChild(marker(t.r, t.c, 'sq-skill'));
    } else {
      for (const t of tg) {
        if (t.side === RED) bEl.appendChild(marker(t.r, t.c, 'ring-ally'));
        else bEl.appendChild(marker(t.r, t.c, 'ring-skill'));
      }
    }
  }
  /* 选中棋子 */
  if (UI.sel && UI.mode === 'battle') {
    bEl.appendChild(marker(UI.sel.r, UI.sel.c, 'sel-glow'));
    for (const m of UI.selMoves) {
      if (m.cap) bEl.appendChild(marker(m.r, m.c, 'ring-cap'));
      else bEl.appendChild(marker(m.r, m.c, 'dot-move'));
    }
    for (const t of UI.selTargets) bEl.appendChild(marker(t.r, t.c, 'ring-shot'));
  }
  /* 敌情查看(只读): 高亮被查看的敌人,并显示其行动范围与吃子对象 */
  if (UI.inspect && !UI.inspect.dead && UI.inspect.r >= 0) {
    bEl.appendChild(marker(UI.inspect.r, UI.inspect.c, 'ring-inspect'));
    for (const m of UI.inspectMoves || []) {
      if (m.cap) bEl.appendChild(marker(m.r, m.c, 'ring-cap'));
      else bEl.appendChild(marker(m.r, m.c, 'dot-move'));
    }
    for (const t of UI.inspectTargets || []) bEl.appendChild(marker(t.r, t.c, 'ring-shot'));
  }
  /* 上一步落点 */
  if (UI.lastMove) {
    bEl.appendChild(marker(UI.lastMove[0], UI.lastMove[1], 'lastmove'));
    bEl.appendChild(marker(UI.lastMove[2], UI.lastMove[3], 'lastmove'));
  }
  /* 棋子 */
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = board.grid[r][c];
    if (p) bEl.insertAdjacentHTML('beforeend', pieceHtml(p));
  }
  /* 被将军警示 */
  if (UI.battle && !UI.battle.over && UI.battle.turn === RED && isInCheck(board, RED, UI.battle)) {
    const g = sideGeneral(board, RED);
    if (g) bEl.appendChild(marker(g.r, g.c, 'check-glow'));
  }
}
function marker(r, c, cls) {
  const d = document.createElement('div');
  d.className = 'mk ' + cls;
  d.style.left = (c / 8 * 100) + '%';
  d.style.top = (r / 9 * 100) + '%';
  return d;
}

function boardPosFromEvent(e) {
  const rect = $('#board').getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const c = Math.round(x * 8), r = Math.round(y * 9);
  if (c < 0 || c > 8 || r < 0 || r > 9) return null;
  const dx = Math.abs(x * 8 - c), dy = Math.abs(y * 9 - r);
  if (dx > 0.45 || dy > 0.45) return null;
  return { r, c };
}

/* ---------------- 战斗交互 ---------------- */
/* 行动权限: 主行动(走子/远程射击)一次 + 吃子奖励的再动次数 */
function canActNow() {
  const b = UI.battle;
  if (!b || b.over || b.turn !== RED || UI.thinking) return { ok: false, reason: '' };
  if (!b.movedDone[RED]) return { ok: true, extra: false };
  if (b.extraMoves[RED] > 0) return { ok: true, extra: true };
  return { ok: false, reason: '本回合行动已用完,请点「结束回合」' };
}
function consumeAction(b) {
  if (!b.movedDone[RED]) b.movedDone[RED] = true;
  else b.extraMoves[RED] = Math.max(0, b.extraMoves[RED] - 1);
}

function battleClick(r, c) {
  const b = UI.battle;
  if (!b || b.over || b.turn !== RED || UI.thinking) return;
  const piece = b.board.grid[r][c];
  /* 技能瞄准中 */
  if (UI.skillPending) {
    const sk = UI.skillPending;
    const need = SKILLS[sk.act.id].need;
    const tg = skillTargets(sk.piece, b, sk.act);
    if (need === 'enemy' && piece && piece.side === BLACK && tg.includes(piece)) {
      const res = playerSkill(b, sk.piece, sk.idx, piece);
      toast(res.texts.join(';'));
      UI.skillPending = null; UI.sel = null; refresh();
      return;
    }
    if (need === 'ally' && piece && piece.side === RED && tg.includes(piece)) {
      const res = playerSkill(b, sk.piece, sk.idx, piece);
      toast(res.texts.join(';'));
      UI.skillPending = null; UI.sel = null; refresh();
      return;
    }
    if (need === 'square' && tg.some(s => s.r === r && s.c === c)) {
      const res = playerSkill(b, sk.piece, sk.idx, { r, c });
      toast(res.texts.join(';'));
      UI.skillPending = null; UI.sel = null; refresh();
      return;
    }
    UI.skillPending = null; UI.sel = null; refresh();
    return;
  }
  /* 远程攻击 */
  if (UI.sel) {
    if (piece && UI.selTargets.includes(piece)) {
      const gate = canActNow();
      if (!gate.ok) { if (gate.reason) toast(gate.reason); UI.sel = null; refresh(); return; }
      consumeAction(b);
      UI.lastMove = [UI.sel.r, UI.sel.c, UI.sel.r, UI.sel.c];
      const ev = playerRanged(b, UI.sel, piece);
      toast(ev.texts.join(';'));
      UI.sel = null; afterAction(); return;
    }
    const m = UI.selMoves.find(x => x.r === r && x.c === c);
    if (m) {
      const gate = canActNow();
      if (!gate.ok) { if (gate.reason) toast(gate.reason); UI.sel = null; refresh(); return; }
      consumeAction(b);
      UI.lastMove = [UI.sel.r, UI.sel.c, r, c];
      const ev = playerMove(b, UI.sel, m);
      if (ev.texts.length) toast(ev.texts.join(';'));
      UI.sel = null; afterAction(); return;
    }
  }
  /* 选中己方棋子 */
  if (piece && piece.side === RED && piece.status.stun === 0) {
    if (piece.skilledThisTurn) {
      toast(piece.name + '本回合已使用过技能,不能再行动');
      UI.sel = null; refresh();
      return;
    }
    UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = [];
    UI.sel = piece;
    UI.selMoves = genLegalMoves(b.board, piece, { battle: b });
    UI.selTargets = genRangedTargets(b.board, piece);
    refresh();
    return;
  }
  /* 点击敌军: 只读查看其行动范围/吃子对象/技能 */
  if (piece && piece.side === BLACK && !piece.dead) {
    UI.sel = null; UI.selMoves = []; UI.selTargets = [];
    UI.skillPending = null;
    UI.inspect = piece;
    UI.inspectMoves = genLegalMoves(b.board, piece, { battle: b });
    UI.inspectTargets = genRangedTargets(b.board, piece);
    refresh();
    return;
  }
  UI.sel = null;
  UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = [];
  refresh();
}
function afterAction() {
  battleTick();
  if (!UI.battle.over && UI.battle.extraMoves[RED] > 0 && UI.battle.movedDone[RED]) {
    banner('再动!', '剩余' + UI.battle.extraMoves[RED] + '次行动,可继续走子,或结束回合');
  }
  refresh();
}

/* ---------------- 侧栏 ---------------- */
function renderSidebar() {
  const b = UI.battle;
  const run = Run;
  /* 顶部状态 */
  $('#tb-battle').textContent = '第' + (run ? run.battleNo : 1) + '战 · ' + (b && b.theme ? b.theme.name : '');
  $('#tb-wins').textContent = '胜场 ' + (run ? run.wins : 0);
  $('#tb-qi').textContent = '气力 ' + (b ? b.qi.red : 0);
  $('#tb-alive').textContent = '存活 ' + (run ? run.roster.length : 0);
  $('#tb-dead').textContent = '阵亡 ' + (run ? run.graveyard.length : 0);

  /* 敌情 */
  const intel = $('#sb-intel');
  if (b) {
    let phaseTxt = '';
    if (b.theme.final) phaseTxt = ' · Boss第' + (b.phase === 1 ? '一' : b.phase === 2 ? '二' : '三') + '阶段';
    const enemies = alivePieces(b.board, BLACK);
    intel.innerHTML = '<div class="sb-title">⚔️ 敌军' + phaseTxt + ' <span class="dim">(' + enemies.length + '子 · 点击查看行动与技能)</span></div><div class="enemy-grid">' +
      enemies.sort((a, c) => (a.isGeneral || a.isBoss ? -1 : 0) - (c.isGeneral || c.isBoss ? -1 : 0) || c.def.val - a.def.val)
        .map(p => `<div class="enemy-chip rar-${p.def.r || 'std'}" data-id="${p.id}" title="点击查看行动方式与技能">${p.isGeneral ? '👑' : ''}${esc(p.isGeneral ? displayName(p.defId, p.side) : p.name)}${p.maxHp > 1 ? '<i>' + Math.max(0, p.hp) + '/' + p.maxHp + '</i>' : ''}${p.status.stun ? '💫' : ''}${p.status.poison ? '☠️' : ''}</div>`).join('') +
      '</div>';
    intel.querySelectorAll('.enemy-chip').forEach(chip => {
      chip.onclick = () => {
        const p = b.enemyPieces.find(x => x.id === chip.dataset.id);
        if (p && !p.dead) showEnemyDetail(p);
      };
    });
  } else intel.innerHTML = '';

  /* 技能面板 */
  const sk = $('#sb-skill');
  if (UI.inspect && b && !UI.inspect.dead) {
    const p = UI.inspect;
    sk.innerHTML = '<div class="sb-title">👁 ' + esc(displayName(p.defId, p.side)) + ' <span class="dim">(敌军 · 只读)</span></div>' +
      '<div class="dim">生命 ' + p.hp + '/' + p.maxHp + ' · 伤害 ' + attackPower(p, b) + ' · 行: ' + esc(moveLabel(p.def)) + '</div>' +
      (p.def.attack ? '<div class="dim">远程: ' + esc(atkLabel(p)) + '</div>' : '') +
      (p.isGeneral ? '<div class="warn">👑 主将: 击倒它即可获胜!</div>' : '') +
      (p.status.stun > 0 ? '<div class="warn">💫 眩晕中,无法行动</div>' : '') +
      (p.def.pas ? '<div class="pas-line">被动: ' + p.def.pas.map(pasLabel).join('; ') + '</div>' : '') +
      (p.def.act ? '<div class="pas-line">主动: ' + p.def.act.map((a, i) => esc(skillLabel(a)) + (((p.cdLeft[i] || 0) > 0 ? ' <span class="dim">(冷却' + p.cdLeft[i] + '回合)</span>' : ''))).join('; ') + '</div>' : '') +
      '<div class="dim sm">仅供查看,不能操作敌军;点棋盘他处可关闭</div>';
  } else if (UI.sel && b && b.turn === RED && UI.sel.side === RED && UI.sel.def.act) {
    let html = '<div class="sb-title">' + esc(displayName(UI.sel.defId, UI.sel.side)) + ' 的技能</div>';
    UI.sel.def.act.forEach((act, idx) => {
      const rd = skillReady(b, UI.sel, idx);
      html += `<button class="btn btn-skill ${rd.ok ? '' : 'disabled'} ${UI.skillPending && UI.skillPending.idx === idx ? 'active' : ''}" data-idx="${idx}">${esc(skillLabel(act))}</button>`;
      if (!rd.ok && rd.reason) html += `<div class="dim sm">(${esc(rd.reason)})</div>`;
    });
    if (UI.sel.def.pas) {
      html += '<div class="pas-line">被动: ' + UI.sel.def.pas.map(pasLabel).join('; ') + '</div>';
    }
    sk.innerHTML = html;
    sk.querySelectorAll('.btn-skill').forEach(btn => {
      btn.onclick = () => {
        const idx = +btn.dataset.idx;
        const act = UI.sel.def.act[idx];
        const rd = skillReady(b, UI.sel, idx);
        if (!rd.ok) { toast(rd.reason); return; }
        if (!skillNeedsTarget(act)) {
          const res = playerSkill(b, UI.sel, idx, null);
          toast(res.texts.join(';'));
          UI.sel = null; refresh();
        } else {
          UI.skillPending = { piece: UI.sel, idx, act };
          refresh();
        }
      };
    });
  } else if (UI.sel && UI.mode === 'battle') {
    sk.innerHTML = '<div class="sb-title">' + esc(displayName(UI.sel.defId, UI.sel.side)) + '</div>' +
      '<div class="dim">生命 ' + UI.sel.hp + '/' + UI.sel.maxHp + ' · 伤害 ' + attackPower(UI.sel, b) + ' · ' + esc(moveLabel(UI.sel.def)) + '</div>' +
      (UI.sel.def.pas ? '<div class="pas-line">被动: ' + UI.sel.def.pas.map(pasLabel).join('; ') + '</div>' : '');
  } else sk.innerHTML = '';

  /* 行动区 */
  const act = $('#sb-actions');
  if (b && !b.over && b.turn === RED) {
    const canEnd = b.movedDone[RED] || b.skillUsed[RED];
    let hint;
    if (!b.movedDone[RED]) {
      hint = b.skillUsed[RED] ? '技能已用,还可走一步(或直接结束回合)' : '请行动: 走一步或使用技能(同一棋子二者只能择一)';
    } else if (b.extraMoves[RED] > 0) {
      hint = '再动剩余 ' + b.extraMoves[RED] + ' 次 — 可继续行动,或结束回合';
    } else {
      hint = '本回合行动完毕,请结束回合';
    }
    const hasSel = UI.sel || UI.skillPending || UI.inspect;
    act.innerHTML = `<div class="turn-hint ${b.movedDone[RED] ? '' : 'pulse'}">${hint}</div>
      ${hasSel ? '<button class="btn" id="btn-cancel">取消选择</button>' : ''}
      <button class="btn btn-primary" id="btn-end">结束回合</button>`;
    const cancelBtn = $('#btn-cancel');
    if (cancelBtn) cancelBtn.onclick = () => { UI.sel = null; UI.selMoves = []; UI.selTargets = []; UI.skillPending = null; UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = []; refresh(); };
    $('#btn-end').onclick = () => {
      if (!canEnd) { toast('请先走子或使用技能'); return; }
      UI.sel = null; UI.skillPending = null; UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = [];
      playerEndTurn(b);
      UI.thinking = true;
      refresh();
    };
  } else if (b && !b.over) {
    act.innerHTML = '<div class="turn-hint">敌方行动中…</div>';
  } else if (b && b.over) {
    act.innerHTML = '<div class="turn-hint">战斗结束</div>';
  } else act.innerHTML = '';

  /* 我方名册 */
  const ros = $('#sb-roster');
  if (run) {
    const list = alivePieces(b ? b.board : null, RED);
    const onBoard = new Set(list.map(p => p.id));
    ros.innerHTML = '<div class="sb-title">🎖️ 我方名册 (' + run.roster.length + ')</div><div class="roster-grid">' +
      run.roster.map(p => `<div class="roster-chip rar-${p.def.r || 'std'} ${onBoard.has(p.id) ? 'on' : 'off'} ${UI.sel === p ? 'sel' : ''}" data-id="${p.id}">
        ${esc(p.def.ch)}<i>${p.maxHp > 1 ? p.hp + '/' + p.maxHp : ''}</i></div>`).join('') +
      '</div>';
    ros.querySelectorAll('.roster-chip').forEach(chip => {
      chip.onclick = () => {
        const p = run.roster.find(x => x.id === chip.dataset.id);
        if (!p || p.r < 0) return;
        UI.sel = (UI.sel === p ? null : p);
        if (UI.sel) {
          UI.selMoves = [];
          UI.selTargets = [];
          banner(p.name, (p.def.desc || '') + (p.def.pas ? ' [被动: ' + p.def.pas.map(pasLabel).join('; ') + ']' : ''));
        }
        refresh();
      };
    });
  } else ros.innerHTML = '';

  /* 日志 */
  const lg = $('#sb-log');
  if (b) {
    lg.innerHTML = '<div class="sb-title">📜 战报</div>' + b.logs.slice(-14).reverse().map(l => `<div class="log-line">${esc(l)}</div>`).join('');
  } else lg.innerHTML = '';
}

function refresh() {
  battleTick();
  renderBoard();
  renderSidebar();
  const msg = $('#board-msg');
  if (UI.thinking && UI.battle && !UI.battle.over) {
    msg.classList.remove('hidden');
    msg.textContent = '敌方行动中…';
  } else msg.classList.add('hidden');
}

/* ---------------- 弹窗/横幅/提示 ---------------- */
function banner(title, text) {
  const root = $('#banner-root');
  const d = el('div', 'banner');
  d.innerHTML = `<b>${esc(title)}</b>${text ? '<span>' + esc(text) + '</span>' : ''}`;
  root.appendChild(d);
  setTimeout(() => d.classList.add('out'), 3200);
  setTimeout(() => d.remove(), 3900);
}
function toast(text) {
  const root = $('#toast-root');
  const d = el('div', 'toast', esc(text));
  root.appendChild(d);
  setTimeout(() => d.classList.add('out'), 2600);
  setTimeout(() => d.remove(), 3200);
}
function modal(inner, opts) {
  opts = opts || {};
  const root = $('#modal-root');
  const box = el('div', 'modal-box');
  box.innerHTML = inner;
  root.appendChild(box);
  if (!opts.noOutside) box.addEventListener('click', e => { if (e.target === box) closeModal(box); });
  return box;
}
function closeModal(box) { box.remove(); }
function closeAllModals() { $('#modal-root').innerHTML = ''; }

/* ---------------- 选将/奖励卡 ---------------- */
function cardHtml(card) {
  if (card.type === 'consumable') {
    const c = CONSUMABLES.find(x => x.id === card.id);
    return `<div class="card card-consume">
      <div class="card-ch">${c ? '✨' : ''}</div>
      <div class="card-name">${esc(c ? c.name : '')}</div>
      <div class="card-desc">${esc(c ? c.desc : '')}</div>
    </div>`;
  }
  const d = P_DEFS[card.defId];
  const cls = d.r >= 4 ? 'card-legend' : d.r === 3 ? 'card-epic' : d.r === 2 ? 'card-rare' : 'card-common';
  const pas = (d.pas || []).map(pasLabel).join('; ');
  const act = (d.act || []).map(skillLabel).join('; ');
  const atkTxt = atkLabel({ def: d });
  return `<div class="card ${cls}">
    <div class="card-head"><span class="card-ch">${esc(d.ch)}</span><span class="card-rarity">${RARITY[d.r]}</span></div>
    <div class="card-name">${esc(d.name)}</div>
    <div class="card-stats">生命${d.hp} · 伤害${d.atk} · 价值${d.val} · 部署:${depLabel(d.dep)}</div>
    <div class="card-move">行: ${esc(moveLabel(d))}${atkTxt ? ' · ' + esc(atkTxt) : ''}</div>
    <div class="card-desc">${esc(d.desc)}</div>
    ${pas ? `<div class="card-pas">被动: ${esc(pas)}</div>` : ''}
    ${act ? `<div class="card-act">主动: ${esc(act)}</div>` : ''}
  </div>`;
}
function showDraft(cards, round, total, cb) {
  UI.mode = 'draft';
  closeAllModals();
  const m = modal(`<div class="modal-title">开局选将 (${round}/${total})</div>
    <div class="modal-sub">从三位奇兵中选择一位加入你的军队</div>
    <div class="cards">${cards.map(cardHtml).join('')}</div>`, { noOutside: true });
  m.querySelectorAll('.card').forEach((c, i) => c.onclick = () => { closeModal(m); cb(cards[i]); });
}
function showReward(cards, cb) {
  UI.mode = 'reward';
  closeAllModals();
  const m = modal(`<div class="modal-title">🎉 大捷! 三选一战利品</div>
    <div class="modal-sub">选择一位新棋子或一件军需品(阵亡的棋子不会复活)</div>
    <div class="cards">${cards.map(cardHtml).join('')}</div>`, { noOutside: true });
  m.querySelectorAll('.card').forEach((c, i) => c.onclick = () => {
    closeModal(m);
    const card = cards[i];
    const cons = card.type === 'consumable' ? CONSUMABLES.find(x => x.id === card.id) : null;
    if (cons && cons.needTarget) {
      showPickPieces(Run, cons.needTarget, cons.name, cons.desc, picks => cb(card, picks));
    } else {
      cb(card);
    }
  });
}

/* ---------------- 行军奇遇 ---------------- */
function showEvent(ev, cb) {
  UI.mode = 'event';
  const m = modal(`<div class="modal-title">⚡ 行军奇遇 · ${esc(ev.title)}</div>
    <div class="event-intro">${esc(ev.intro)}</div>
    <div class="event-opts">${ev.opts.map((o, i) => `<button class="event-opt" data-i="${i}"><b>${esc(o.label)}</b><span>${esc(o.desc)}</span></button>`).join('')}</div>`, { noOutside: true });
  m.querySelectorAll('.event-opt').forEach(b => b.onclick = () => { closeModal(m); cb(+b.dataset.i); });
}
function showEventReward(cards, title, cb) {
  const m = modal(`<div class="modal-title">${esc(title)}</div>
    <div class="modal-sub">从三位奇兵中选择一位加入军队</div>
    <div class="cards">${cards.map(cardHtml).join('')}</div>`, { noOutside: true });
  m.querySelectorAll('.card').forEach((c, i) => c.onclick = () => { closeModal(m); cb(cards[i]); });
}
function showPickPieces(run, n, title, note, cb) {
  closeAllModals();
  const picks = [];
  const candidates = run.roster.filter(p => p.defId !== 's_jiang');
  const m = modal(`<div class="modal-title">${esc(title)}</div>
    <div class="modal-sub">${esc(note)} <span class="dim">(已选 <b id="pick-count">0</b>/${n})</span></div>
    <div class="pick-grid">${candidates.map(p => `<div class="pick-chip rar-${p.def.r || 'std'}" data-id="${p.id}">${esc(p.def.ch)}<i>${p.maxHp > 1 ? '❤' + p.hp + '/' + p.maxHp : '❤1'}${(p.permAtk || 0) > 0 ? '⚔' + p.atk : ''}</i></div>`).join('')}</div>
    <div class="menu-btns"><button class="btn btn-primary" id="btn-pick-ok" disabled>确定 (0/${n})</button>
    <button class="btn" id="btn-pick-cancel">取消</button></div>`, { noOutside: true });
  function sync() {
    const cnt = m.querySelector('#pick-count');
    if (cnt) cnt.textContent = picks.length;
    const ok = m.querySelector('#btn-pick-ok');
    if (ok) { ok.disabled = picks.length !== n; ok.textContent = '确定 (' + picks.length + '/' + n + ')'; }
    m.querySelectorAll('.pick-chip').forEach(ch => ch.classList.toggle('sel', picks.some(p => p.id === ch.dataset.id)));
  }
  m.querySelectorAll('.pick-chip').forEach(chip => {
    chip.onclick = () => {
      const p = candidates.find(x => x.id === chip.dataset.id);
      if (!p) return;
      const idx = picks.indexOf(p);
      if (idx >= 0) picks.splice(idx, 1);
      else if (picks.length < n) picks.push(p);
      else { toast('最多选择' + n + '名棋子'); }
      sync();
    };
  });
  m.querySelector('#btn-pick-ok').onclick = () => { if (picks.length === n) { closeModal(m); cb(picks.slice()); } };
  m.querySelector('#btn-pick-cancel').onclick = () => { closeModal(m); cb(null); };
}
function showPickGrave(run, title, cb) {
  closeAllModals();
  if (!run.graveyard.length) { cb(null); return; }
  const m = modal(`<div class="modal-title">${esc(title)}</div>
    <div class="modal-sub">选择一名阵亡棋子复活</div>
    <div class="pick-grid">${run.graveyard.map(g => `<div class="pick-chip rar-std" data-id="${esc(g.name)}">${esc(g.name.slice(0, 1))}<i>${esc(g.name)}</i></div>`).join('')}</div>
    <div class="menu-btns"><button class="btn" id="btn-grave-cancel">放弃</button></div>`, { noOutside: true });
  m.querySelectorAll('.pick-chip').forEach((chip, i) => chip.onclick = () => { closeModal(m); cb(run.graveyard[i]); });
  m.querySelector('#btn-grave-cancel').onclick = () => { closeModal(m); cb(null); };
}

/* ---------------- 部署 ---------------- */
function showDeploy(run, battleNo, cb) {
  UI.mode = 'deploy';
  UI.run = run;
  UI.battle = null;
  UI.deployCb = cb;
  UI.sel = null;
  /* 默认布阵 */
  const placed = defaultDeploy(run, battleNo);
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (const pl of placed) { grid[pl.r][pl.c] = pl.piece; pl.piece.r = pl.r; pl.piece.c = pl.c; }
  for (const p of run.roster) if (p.r < 0) { /* 未部署 */ }
  UI.deploy = { board: { grid }, run, battleNo };
  refresh();
  const spec0 = enemyArmySpec(battleNo, placed.length);
  banner('第' + battleNo + '战 · ' + spec0.theme.name, '部署你的军队,然后开战!');
}
function deployClick(r, c) {
  const board = UI.deploy.board;
  const piece = board.grid[r][c];
  const run = UI.run;
  if (UI.deploy.sel) {
    const p = UI.deploy.sel;
    if (UI.deploy.zone.some(s => s[0] === r && s[1] === c) && !board.grid[r][c]) {
      if (p.r >= 0) board.grid[p.r][p.c] = null;
      board.grid[r][c] = p; p.r = r; p.c = c;
      UI.deploy.sel = null;
      refresh();
      return;
    }
    UI.deploy.sel = null; refresh(); return;
  }
  if (piece && piece.side === RED) {
    UI.deploy.sel = piece;
    UI.deploy.zone = zoneSquares(piece.def.dep, RED);
    refresh();
    return;
  }
  UI.deploy.sel = null; refresh();
}
function renderDeploySidebar() {
  const b = UI.deploy;
  const run = UI.run;
  if (!b) return;
  const placed = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (b.board.grid[r][c]) placed.push(b.board.grid[r][c]);
  const spec = enemyArmySpec(b.battleNo, placed.length);
  $('#tb-battle').textContent = '第' + b.battleNo + '战 · ' + spec.theme.name;
  $('#tb-wins').textContent = '胜场 ' + run.wins;
  $('#tb-qi').textContent = '存活 ' + run.roster.length;
  $('#tb-alive').textContent = '已部署 ' + placed.length + '/' + MAX_DEPLOY;
  $('#tb-dead').textContent = '阵亡 ' + run.graveyard.length;
  $('#sb-intel').innerHTML = `<div class="sb-title">🏴 敌情</div>
    <div class="dim">预计敌军 ${spec.ids.length} 子(随你的兵力增减)</div>
    <div class="dim">👑 敌军主帅: ${spec.ids.indexOf('chiyou') >= 0 ? '蚩尤(王)' : '将'} — 击倒主帅即胜</div>
    ${spec.theme.boss === 'chiyou' ? '<div class="warn">⚠️ 最终Boss「蚩尤」坐镇中军!</div>' : spec.theme.boss ? '<div class="warn">⚠️ 敌方猛将「' + P_DEFS[spec.theme.boss].name + '」参战!</div>' : ''}
    ${spec.atkBonus ? '<div class="warn">敌方伤害+' + spec.atkBonus + '</div>' : ''}
    <div class="dim">精英棋子: ' + spec.ids.filter(id => P_DEFS[id].r >= 3).slice(0, 8).map(id => P_DEFS[id].name).join('、') + '</div>`;
  $('#sb-skill').innerHTML = UI.deploy.sel ?
    `<div class="sb-title">${esc(UI.deploy.sel.name)}</div><div class="dim">部署区: ${depLabel(UI.deploy.sel.def.dep)} — 点击棋盘高亮处落位</div>` : '';
  $('#sb-actions').innerHTML = `<button class="btn" id="btn-rand">随机布阵</button>
    <button class="btn btn-primary" id="btn-fight">⚔️ 开战</button>
    ${placed.length >= MAX_DEPLOY ? '<div class="warn">已达部署上限 ' + MAX_DEPLOY + ' 子</div>' : ''}`;
  $('#btn-rand').onclick = () => {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const p = b.board.grid[r][c];
      if (p) { p.r = -1; p.c = -1; }
    }
    for (let r = 0; r < ROWS; r++) b.board.grid[r].fill(null);
    const placed2 = defaultDeploy(run, b.battleNo);
    for (const pl of placed2) { b.board.grid[pl.r][pl.c] = pl.piece; pl.piece.r = pl.r; pl.piece.c = pl.c; }
    UI.deploy.sel = null;
    refresh();
  };
  $('#btn-fight').onclick = () => {
    /* 确保帅已落位 */
    const gen = run.roster.find(p => p.defId === 's_jiang');
    if (gen && gen.r < 0) {
      const spot = zoneSquares('palace', RED).find(s => !b.board.grid[s[0]][s[1]]);
      if (!spot) { toast('九宫已满,无法安置帅!'); return; }
      b.board.grid[spot[0]][spot[1]] = gen; gen.r = spot[0]; gen.c = spot[1];
    }
    const placed2 = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const p = b.board.grid[r][c];
      if (p) placed2.push({ piece: p, r, c });
    }
    if (placed2.length > MAX_DEPLOY) { toast('部署超出上限!'); return; }
    UI.deploy = null;
    UI.deployCb(placed2);
  };
  /* 名册 */
  const onBoard = new Set(placed.map(p => p.id));
  $('#sb-roster').innerHTML = '<div class="sb-title">🎖️ 兵力部署 (' + placed.length + '/' + Math.min(MAX_DEPLOY, run.roster.length) + ')</div><div class="roster-grid">' +
    run.roster.map(p => `<div class="roster-chip rar-${p.def.r || 'std'} ${onBoard.has(p.id) ? 'on' : 'off'} ${UI.deploy.sel === p ? 'sel' : ''}" data-id="${p.id}">
      ${esc(p.def.ch)}<i>${p.maxHp > 1 ? p.hp + '/' + p.maxHp : ''}</i></div>`).join('') + '</div>' +
    '<div class="dim sm">点击棋子→棋盘高亮区落位; 点击已落位棋子可拾起; 点击名册中未部署棋子拾起。</div>';
  $('#sb-roster').querySelectorAll('.roster-chip').forEach(chip => {
    chip.onclick = () => {
      const p = run.roster.find(x => x.id === chip.dataset.id);
      if (p.defId === 's_jiang' && p.r >= 0) { toast('帅不可离阵'); return; }
      if (p.r >= 0) {
        b.board.grid[p.r][p.c] = null; p.r = -1; p.c = -1;
        UI.deploy.sel = null;
      } else {
        if (placed.length >= MAX_DEPLOY && onBoard.has(p.id) === false) { toast('已达部署上限'); return; }
        UI.deploy.sel = p;
        UI.deploy.zone = zoneSquares(p.def.dep, RED);
      }
      refresh();
    };
  });
  $('#sb-log').innerHTML = '<div class="sb-title">📜 部署提示</div>' +
    '<div class="log-line">· 部署数量决定敌军规模,量力而行</div>' +
    '<div class="log-line">· 各有部署区域限制,善用间谍潜伏敌后</div>' +
    '<div class="log-line">· 阵亡棋子永久消逝,但「还魂丹」可救回</div>';
}

/* ---------------- 战斗开场/结束 ---------------- */
function onBattleStart(battle) {
  if (UI.battle !== battle) {
    UI.battle = battle;
    UI.run = battle.run;
    UI.mode = 'battle';
    UI.sel = null; UI.skillPending = null; UI.lastMove = null; UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = []; UI.detailModal = null;
    UI.thinking = false;
    const spec = enemyArmySpec(battle.no, battle.playerPieces.length);
    if (battle.ambush) {
      banner('⚡ 突发战斗 · ' + battle.theme.name, '敌军' + spec.ids.length + '子,击破来敌可得特殊奖励!');
    } else {
      banner('第' + battle.no + '战 · ' + battle.theme.name, '敌军' + spec.ids.length + '子,击败敌方主帅即可获胜!');
    }
    if (battle.theme.final) {
      setTimeout(() => banner('最终决战 · 蚩尤', '战胜兵主,光复汉室!蚩尤有三阶段形态,善用技能与光环!'), 1800);
    }
  } else {
    UI.thinking = false;
  }
  refresh();
}
function onBattleEnd(battle) {
  UI.lastMove = null;
  UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = [];
  if (UI.detailModal) { closeModal(UI.detailModal); UI.detailModal = null; }
}
function showGameOver(result, run) {
  UI.mode = 'over';
  closeAllModals();
  const win = result === 'victory';
  modal(`<div class="modal-title ${win ? 'gold' : ''}">${win ? '🏆 天下归一!' : '💀 出师未捷…'}</div>
    <div class="modal-sub">${win ? '你击败了蚩尤,光复汉室江山!' : '将士们永远倒在了 ' + (run.battleNo > TOTAL_BATTLES ? TOTAL_BATTLES : run.battleNo) + ' 关。'}</div>
    <div class="result-grid">
      <div>胜场<b>${run.wins}</b></div><div>存活棋子<b>${run.roster.length}</b></div>
      <div>阵亡棋子<b>${run.graveyard.length}</b></div><div>击杀敌军<b>${run.kills}</b></div>
    </div>
    <div class="menu-btns">
      <button class="btn btn-primary btn-big" id="btn-again">再战一局</button>
      <button class="btn" id="btn-back-menu">返回主菜单</button>
    </div>`, { noOutside: true });
  $('#btn-again').onclick = () => { location.reload(); };
  $('#btn-back-menu').onclick = () => { backToMenu(); };
}

/* ---------------- 敌情详情 ---------------- */
function pieceDetailHtml(p) {
  const d = p.def;
  const name = displayName(p.defId, p.side);
  const st = [];
  if (p.status.stun > 0) st.push('💫眩晕' + p.status.stun + '回合');
  if (p.status.poison > 0) st.push('☠️中毒' + p.status.poison + '回合');
  return `<div class="modal-title">${esc(name)} <span class="sm">${d.r ? RARITY[d.r] : '标准'}</span></div>
    <div class="detail-box">
      <div class="detail-row"><b>生命</b> ${p.hp}/${p.maxHp}　<b>伤害</b> ${attackPower(p, UI.battle)}　<b>价值</b> ${d.val}${d.r ? '　<b>部署</b> ' + esc(depLabel(d.dep)) : ''}</div>
      <div class="detail-row"><b>行动</b> ${esc(moveLabel(d))}${atkLabel(p) ? ' · ' + esc(atkLabel(p)) : ''}</div>
      ${(d.pas || []).length ? `<div class="detail-row"><b>被动</b> ${d.pas.map(pasLabel).map(esc).join('; ')}</div>` : ''}
      ${(d.act || []).length ? `<div class="detail-row"><b>主动</b> ${d.act.map(skillLabel).map(esc).join('; ')}</div>` : ''}
      ${p.isGeneral ? `<div class="detail-row warn"><b>👑 主将</b> 击倒它即可获胜!</div>` : ''}
      ${st.length ? `<div class="detail-row warn"><b>状态</b> ${st.join(' ')}</div>` : ''}
      <div class="detail-row dim">${esc(d.desc || '')}</div>
    </div>
    <div class="menu-btns"><button class="btn" id="btn-detail-close">关闭</button></div>`;
}
function showEnemyDetail(p) {
  closeAllModals();
  UI.inspect = p;
  const m = modal(pieceDetailHtml(p));
  UI.detailModal = m;
  const close = () => { UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = []; UI.detailModal = null; closeModal(m); refresh(); };
  m.addEventListener('click', e => { if (e.target === m) close(); });
  const btn = m.querySelector('#btn-detail-close');
  if (btn) btn.onclick = close;
  refresh();
}

/* ---------------- 图鉴/帮助 ---------------- */
function showCodex() {
  closeAllModals();
  const all = Object.keys(P_DEFS).filter(id => P_DEFS[id].r > 0);
  const box = modal(`<div class="modal-title">📖 棋子图鉴 (${all.length + 7}种)</div>
    <div class="modal-sub">含7种标准棋子与全部特色棋子</div>
    <div class="filter-row">${[0, 1, 2, 3, 4].map(i => `<button class="btn btn-sm filter-btn" data-f="${i}">${i === 0 ? '全部' : RARITY[i]}</button>`).join('')}</div>
    <div class="codex-grid"></div>`);
  const grid = box.querySelector('.codex-grid');
  let filter = 0;
  function renderCodex() {
    const ids = Object.keys(P_DEFS).filter(id => {
      const d = P_DEFS[id];
      if (filter === 0) return d.r >= 0;
      return d.r === filter;
    }).sort((a, b) => P_DEFS[b].r - P_DEFS[a].r || P_DEFS[a].name.localeCompare(P_DEFS[b].name, 'zh'));
    grid.innerHTML = ids.map(id => {
      const d = P_DEFS[id];
      const cls = d.r >= 4 ? 'card-legend' : d.r === 3 ? 'card-epic' : d.r === 2 ? 'card-rare' : d.r === 1 ? 'card-common' : 'card-std';
      return `<div class="codex-card ${cls}">
        <div class="card-head"><span class="card-ch">${esc(d.ch)}</span><span class="card-rarity">${d.r ? RARITY[d.r] : '标准'}</span></div>
        <div class="card-name">${esc(d.name)}</div>
        <div class="card-stats">生命${d.hp} · 伤害${d.atk} · 价值${d.val} · 部署:${d.r ? depLabel(d.dep) : '—'}</div>
        <div class="card-move">行: ${esc(moveLabel(d))}${d.attack ? ' · ' + esc(atkLabel({ def: d })) : ''}</div>
        <div class="card-desc">${esc(d.desc)}</div>
      </div>`;
    }).join('');
  }
  box.querySelectorAll('.filter-btn').forEach(btn => btn.onclick = () => { filter = +btn.dataset.f; renderCodex(); });
  renderCodex();
}
function showHelp() {
  closeAllModals();
  modal(`<div class="modal-title">📜 玩法说明</div><div class="help-body">
    <h3>基本规则</h3>
    <p>开局与象棋完全一致: 红方十六子按经典阵型部署,帅仕相马车炮兵各司其职,蹩马腿、塞象眼、炮架、飞将、九宫等规则全部保留。每关以「吃将/将死」定胜负。带金色「将/帅/王」标记的棋子就是主帅,<b>击倒它即可获胜</b>(第12关的主帅是蚩尤)。<b>点击任意敌军棋子</b>,可像查看己方棋子一样看到它的行动范围、吃子对象与技能(只读,不能替它行动)。</p>
    <h3>肉鸽玩法</h3>
    <p>开局两次「三选一」招募特色棋子;每击败一关敌人再获一次三选一(棋子或军需)。<b>阵亡棋子永久消逝</b>,还魂丹可随机复活一名。稀有度随关卡递进: <b>前5关不出神品</b>,前期以凡品为主辅以精品,第6关起逐步解锁珍品/神品,全局神品期望约1.5枚。共12关: 第4关吕布、第8关曹操、第12关三阶段Boss蚩尤。敌军数量与你的部署挂钩,能力随胜场飙升。</p>
    <h3>军需强化</h3>
    <p>虎骨膏/淬锋石: 选择<b>一名</b>棋子生命上限/伤害+1(每子至多+3)。祈福签: 选择<b>3名</b>棋子,各50%概率成功升级生命/伤害,失败无变化。另有还魂丹、锦囊妙计、真龙龙袍。</p>
    <h3>行军奇遇</h3>
    <p><b>每两次战斗结束后</b>触发一次随机事件(五十余种,整局不重复),每个事件都有完整故事与多个选项,须权衡利弊: 概率强化、突发战斗(胜利有稀有度提升的特殊奖励)、献祭换将、替换棋子、指定复活阵亡者等。突发战斗不计入关卡,胜利后仍回主线。</p>
    <h3>存档与继续</h3>
    <p>进度自动保存(单栏位): 每次进入部署时自动存档;战斗中可点「保存退出」,下次从主菜单「继续征战」接着打(本场战斗从头再战,战斗中已阵亡的棋子计入阵亡)。<b>战败或通关后存档清除</b>。结算弹窗不可点外关闭,请用弹窗内按钮返回。</p>
    <h3>回合流程</h3>
    <p>每回合<b>至多走一步 + 使用一次主动技能</b>,且<b>同一棋子一回合只能「移动/远程」或「放技能」,不可兼得</b>(吃子触发的「再动」仍算同一步的延续;技能消耗气力,每回合自动+1)。走完后必须点「结束回合」,不可无限行动。</p>
    <h3>生命与远程</h3>
    <p>生命超过1的棋子被吃时先扣血,攻击者被弹回原地;远程棋子可原地射击,不移动自身。</p>
    <h3>部署</h3>
    <p>每关开战前自由布阵,棋子各有部署区域(九宫/底线/半场/河边/敌后)。部署越多,敌军也越多。</p>
    <h3>状态</h3>
    <p>💫眩晕/冻结(无法行动) · ☠️中毒(每回合受1伤) · 光环(相邻增益) · 反震(攻击者受反伤)。</p>
    <h3>移动端</h3>
    <p>全部操作已适配触屏: 点按走子/技能/查看敌军,右侧「取消选择」可代替右键取消;界面与弹窗在小屏自动缩放滚动。</p>
    </div>`);
}

/* ---------------- 主刷新 ---------------- */
function refresh() {
  battleTick();
  if (UI.mode === 'deploy') {
    renderBoard();
    renderDeploySidebar();
    return;
  }
  renderBoard();
  renderSidebar();
  const msg = $('#board-msg');
  if (UI.thinking && UI.battle && !UI.battle.over) {
    msg.classList.remove('hidden');
    msg.textContent = '敌方行动中…';
  } else msg.classList.add('hidden');
}

function boot() {
  buildShell();
  refreshContinueBtn();
  const boardEl = $('#board');
  boardEl.addEventListener('click', e => {
    const pos = boardPosFromEvent(e);
    if (!pos) return;
    if (UI.mode === 'battle') battleClick(pos.r, pos.c);
    else if (UI.mode === 'deploy') deployClick(pos.r, pos.c);
  });
  boardEl.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (UI.skillPending || UI.sel || UI.inspect) { UI.skillPending = null; UI.sel = null; UI.inspect = null; UI.inspectMoves = []; UI.inspectTargets = []; refresh(); }
  });
}
