/* ============================================================
 * 战役数据 —— 敌方军队生成、难度随胜场缩放、Boss 战
 * ============================================================ */
'use strict';

const BATTLE_THEMES = [
  { name: '黄巾残党', boss: false },
  { name: '山越流寇', boss: false },
  { name: '西凉铁骑', boss: false },
  { name: '虎牢关·吕布', boss: 'lvbu' },
  { name: '袁绍残军', boss: false },
  { name: '荆州水贼', boss: false },
  { name: '汉中天师道', boss: false },
  { name: '铜雀台·曹操', boss: 'caocao' },
  { name: '五溪蛮兵', boss: false },
  { name: '幽冥鬼兵', boss: false },
  { name: '魔化禁军', boss: false },
  { name: '涿鹿之野·蚩尤', boss: 'chiyou', final: true }
];
const TOTAL_BATTLES = BATTLE_THEMES.length;

/* 稀有度权重: [凡,精,珍,神],battleNo=0 为开局选将
 * 规则: 前5关(含开局)不产神品; 第6关起逐步解锁;
 *       全局神品期望 ≈ 1.5 枚/局(开局6张 + 11次奖励×3张×85%棋子) */
function rarityWeights(battleNo) {
  if (battleNo <= 0) return [60, 35, 5, 0];
  if (battleNo <= 2) return [62, 33, 5, 0];
  if (battleNo <= 5) return [50, 40, 10, 0];
  if (battleNo <= 7) return [40, 40, 15, 5];
  if (battleNo <= 9) return [32, 40, 18, 10];
  return [28, 38, 20, 14];
}

function weightedRarity(battleNo, rng) {
  const w = rarityWeights(battleNo);
  const total = w[0] + w[1] + w[2] + w[3];
  let roll = (rng ? rng() : Math.random()) * total;
  for (let i = 0; i < 4; i++) { roll -= w[i]; if (roll < 0) return i + 1; }
  return 1;
}

function randomPieceId(battleNo, rng) {
  for (let tries = 0; tries < 30; tries++) {
    const r = weightedRarity(battleNo, rng);
    const ids = DRAFT_POOL.filter(id => P_DEFS[id].r === r);
    if (ids.length) return ids[Math.floor((rng ? rng() : Math.random()) * ids.length)];
  }
  return DRAFT_POOL[0];
}

/* 事件/突发奖励: 稀有度偏移,但不超过当前关卡的稀有度上限(前5关无神品) */
function maxRarityFor(battleNo) {
  return battleNo <= 5 ? 3 : 4;
}
function randomPieceIdShift(battleNo, shift, rng) {
  for (let tries = 0; tries < 30; tries++) {
    const base = weightedRarity(battleNo, rng);
    const r = Math.max(1, Math.min(maxRarityFor(battleNo), base + (shift || 0)));
    const ids = DRAFT_POOL.filter(id => P_DEFS[id].r === r);
    if (ids.length) return ids[Math.floor((rng ? rng() : Math.random()) * ids.length)];
  }
  return DRAFT_POOL[0];
}

/* 部署区镜像(黑方视角) */
function mirrorZone(dep) {
  switch (dep) {
    case 'palace': return 'palaceB';
    case 'back2': return 'back2B';
    case 'back3': return 'back3B';
    case 'ownHalf': return 'ownHalfB';
    case 'river': return 'riverB';
    case 'enemyHalf': return 'enemyHalfB';
    default: return 'ownHalfB';
  }
}

function zoneSquares(dep, side) {
  const out = [];
  const isRed = side === 'red';
  if (!isRed) dep = mirrorZone(dep);
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    let ok = false;
    switch (dep) {
      case 'palace': ok = r >= 7 && r <= 9 && c >= 3 && c <= 5; break;
      case 'palaceB': ok = r >= 0 && r <= 2 && c >= 3 && c <= 5; break;
      case 'back2': ok = r >= 8; break;
      case 'back2B': ok = r <= 1; break;
      case 'back3': ok = r >= 7; break;
      case 'back3B': ok = r <= 2; break;
      case 'ownHalf': ok = r >= 5; break;
      case 'ownHalfB': ok = r <= 4; break;
      case 'river': ok = r >= 5 && r <= 6; break;
      case 'riverB': ok = r >= 3 && r <= 4; break;
      case 'enemyHalf': ok = r <= 2; break;      // 红方间谍潜伏敌阵
      case 'enemyHalfB': ok = r >= 7; break;      // 黑方间谍潜入红方
      default: ok = r >= 5;
    }
    if (ok) out.push([r, c]);
  }
  return out;
}

/* 生成敌方军队规格 */
function enemyArmySpec(battleNo, playerDeployed, rng) {
  const theme = BATTLE_THEMES[battleNo - 1];
  let count = Math.min(playerDeployed + battleNo - 1, 28);
  count = Math.max(count, 9);
  if (theme.final) count = Math.min(playerDeployed + 4, 28);
  if (theme.boss && !theme.final) count = Math.min(count + 1, 26);

  /* 标准骨架 */
  const base = ['s_ju', 's_ma', 's_xiang', 's_shi', 's_jiang', 's_shi', 's_xiang', 's_ma', 's_ju', 's_pao', 's_pao', 's_bing', 's_bing', 's_bing', 's_bing', 's_bing'];
  let ids = [];
  if (theme.final) {
    ids = base.filter(x => x !== 's_jiang'); // 蚩尤代替将
  } else {
    ids = base.slice();
  }
  /* 削/增卒与炮以凑基础数 */
  while (ids.length > Math.min(count, 16)) {
    const i = ids.lastIndexOf('s_bing');
    if (i >= 0) ids.splice(i, 1);
    else { const j = ids.lastIndexOf('s_pao'); if (j >= 0) ids.splice(j, 1); else ids.pop(); }
  }

  /* 特色棋子数量随关数增加 */
  let specialCount = Math.min(2 + battleNo, 12);
  if (theme.final) specialCount = Math.min(14, Math.max(specialCount, 9));
  for (let i = 0; i < specialCount; i++) {
    ids.push(randomPieceId(battleNo, rng));
  }
  if (theme.boss === 'lvbu' && ids.indexOf('lvbu') < 0) ids.push('lvbu');
  if (theme.boss === 'caocao' && ids.indexOf('caocao') < 0) ids.push('caocao');
  if (theme.final) {
    let legends = ids.filter(id => P_DEFS[id].r === 4 && id !== 'chiyou');
    while (legends.length < 3) { const l = randomPieceId(battleNo, rng); if (P_DEFS[l].r === 4) { ids.push(l); legends.push(l); } }
    ids.push('chiyou');
  }

  /* 数量裁剪/补充(将帅与Boss棋子不可被裁,否则会出现"无王"关卡) */
  const PROTECTED = ['chiyou', 'lvbu', 'caocao', 's_jiang'];
  while (ids.length > count) {
    const removable = ids.map((x, i) => i).filter(i => PROTECTED.indexOf(ids[i]) < 0);
    if (!removable.length) break;
    const idx = removable[Math.floor((rng ? rng() : Math.random()) * removable.length)];
    ids.splice(idx, 1);
  }
  while (ids.length < count) ids.push(randomPieceId(battleNo, rng));

  const atkBonus = (battleNo >= 7 ? 1 : 0) + (battleNo >= 11 ? 1 : 0) + (theme.final ? 1 : 0) + (theme.boss && !theme.final && battleNo >= 8 ? 1 : 0);
  const qiStart = (battleNo >= 4 ? 1 : 0) + (theme.boss ? 1 : 0);
  const skillProb = theme.final ? 1 : Math.min(0.3 + battleNo * 0.05, 0.95);

  return { theme, ids, count, atkBonus, qiStart, skillProb };
}

/* 敌方棋子落点: 在镜像部署区内随机取空位 */
function enemyPlacement(board, ids, rng, atkBonus) {
  atkBonus = atkBonus || 0;
  const used = {};
  const placed = [];
  /* 将/蚩尤 固定九宫中央 */
  const leaderIdx = ids.indexOf('chiyou') >= 0 ? ids.indexOf('chiyou') : ids.indexOf('s_jiang');
  if (leaderIdx >= 0) {
    const lid = ids[leaderIdx];
    const pos = [0, 4];
    const p = makePiece(lid, 'black', { atkBonus });
    placeAt(board, pos[0], pos[1], p);
    used[pos[0] + ',' + pos[1]] = true;
    placed.push(p);
    ids.splice(leaderIdx, 1);
  }
  for (const id of ids) {
    const def = P_DEFS[id];
    const sqs = zoneSquares(def.dep, 'black');
    /* 随机顺序,选第一个空位 */
    const order = sqs.slice().sort(() => (rng ? rng() : Math.random()) - 0.5);
    let spot = order.find(s => !used[s[0] + ',' + s[1]] && !board.grid[s[0]][s[1]]);
    if (!spot) spot = sqs.find(s => !board.grid[s[0]][s[1]]);
    if (!spot) { /* 全满: 任意空位 */
      for (let r = 0; r < 4 && !spot; r++) for (let c = 0; c < 9 && !spot; c++) if (!board.grid[r][c]) spot = [r, c];
    }
    if (!spot) continue;
    const p = makePiece(id, 'black', { atkBonus });
    placeAt(board, spot[0], spot[1], p);
    used[spot[0] + ',' + spot[1]] = true;
    placed.push(p);
  }
  return placed;
}
