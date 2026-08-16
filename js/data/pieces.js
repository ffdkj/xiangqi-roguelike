/* ============================================================
 * 棋子图鉴数据 —— 中国象棋肉鸽《楚汉烽烟》
 * 7 个标准棋子(与象棋规则完全一致) + 99 个特色棋子
 * 字段: id 名称 ch 显示字 r 稀有度(1凡2精3珍4神) dep 部署区
 *       hp 生命 atk 攻击 val AI价值 mv 行动轨迹 attack 远程攻击
 *       pas 被动 act 主动 desc 描述
 * ============================================================ */
'use strict';

const RARITY = { 1: '凡品', 2: '精品', 3: '珍品', 4: '神品' };
const RARITY_COLOR = { 1: 'c-common', 2: 'c-rare', 3: 'c-epic', 4: 'c-legend' };

const P_DEFS = {};

/* 部署区: palace=九宫 back2=底线两排 back3=底线三排 ownHalf=己方半场 river=河边两排 enemyHalf=敌方后三排 */
function D(id, name, ch, r, dep, hp, atk, val, mv, pas, act, desc, attack) {
  P_DEFS[id] = { id, name, ch, r, dep, hp, atk, val, mv, pas: pas || null, act: act || null, desc, attack: attack || null };
}

/* ---------------- 标准棋子(开局规则与象棋完全一致) ---------------- */
D('s_jiang', '帅', '帅', 0, 'palace', 1, 1, 1000, { t: 'general' }, null, null, '统领全军。只能在九宫内直行一步,两帅不可照面。');
D('s_shi', '仕', '仕', 0, 'palace', 1, 1, 2, { t: 'advisor' }, null, null, '拱卫九宫。斜行一步,不可出宫。');
D('s_xiang', '相', '相', 0, 'ownHalf', 1, 1, 2, { t: 'elephant' }, null, null, '防守重臣。田字斜飞,塞象眼不可行,不过楚河。');
D('s_ma', '马', '马', 0, 'back3', 1, 1, 4, { t: 'horse' }, null, null, '铁蹄纵横。日字行走,蹩马腿不可行。');
D('s_ju', '车', '车', 0, 'back3', 1, 1, 9, { t: 'chariot' }, null, null, '纵横无敌。直线任意驰骋。');
D('s_pao', '炮', '炮', 0, 'back3', 1, 1, 4.5, { t: 'cannon', screens: 1 }, null, null, '隔山打牛。行走如车,吃子须隔一子作炮架。');
D('s_bing', '兵', '兵', 0, 'river', 1, 1, 1, { t: 'pawn' }, null, null, '勇往直前。过河前只进不退,过河后可横行。');

/* ---------------- 马系骑兵 ---------------- */
D('tianma', '天马', '天', 2, 'back3', 1, 1, 4.5, { t: 'horse', noLeg: 1 }, null, null, '行空: 不受蹩马腿限制,日字任意驰骋。');
D('tieji', '铁骑', '铁', 1, 'back3', 2, 1, 3.5, { t: 'horse' }, null, null, '铁甲: 身披重甲,拥有2点生命。');
D('lianhuanma', '连环马', '环', 3, 'back3', 1, 1, 5, { t: 'horse' }, [{ id: 'onCapture', type: 'extraMove', n: 1 }], null, '连环: 吃子后可再行动一次(每回合限一次)。');
D('chitu', '赤兔', '兔', 2, 'back3', 1, 1, 4.5, { t: 'union', m: [{ t: 'horse', noLeg: 1 }, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }] }, null, null, '人中吕布,马中赤兔: 日字如飞,亦可横直一步。');
D('zhuifeng', '追风', '追', 3, 'back3', 1, 1, 5.5, { t: 'union', m: [{ t: 'horse', noLeg: 1 }, { t: 'elephant', cross: 1, noEye: 1 }] }, null, null, '追风逐日: 可走日亦可走田,无视蹩腿塞眼,田字可过河。');

/* ---------------- 象系 ---------------- */
D('zhanxiang', '战象', '战', 2, 'back2', 1, 1, 3, { t: 'elephant', cross: 1 }, null, null, '南征: 田字飞行且可越过楚河。');
D('mengma', '猛犸', '犸', 3, 'back2', 2, 1, 5, { t: 'elephant', cross: 1, noEye: 1 }, [{ id: 'onCapture', type: 'dmgAdj', n: 1 }], null, '践踏: 吃子时对目标相邻的敌人各造成1点伤害;皮糙肉厚。');
D('shenxiang', '神象', '瑞', 3, 'back2', 1, 1, 5.5, { t: 'elephant' }, [{ id: 'auraHeal', n: 1 }], [{ id: 'healAll', cd: 4, cost: 0, p: { n: 1 } }], '圣光: 每回合开始治疗相邻友军1点;圣疗: 全体友军回复1点。');
D('yuxiang', '玉象', '玉', 2, 'back2', 1, 1, 3.5, { t: 'elephant' }, [{ id: 'auraDef', n: 1 }], null, '玉璧: 相邻友军受到的伤害-1(最低1)。');

/* ---------------- 车系 ---------------- */
D('tiejiaju', '铁甲车', '甲', 2, 'back3', 2, 1, 5, { t: 'chariot' }, null, null, '铁甲: 装甲战车,拥有2点生命。');
D('lianhuanju', '连环车', '连', 3, 'back3', 1, 1, 6.5, { t: 'chariot' }, [{ id: 'onCapture', type: 'extraMove', n: 1 }], null, '连环: 吃子后可再行动一次(每回合限一次)。');
D('fenghuo', '风火车', '烽', 3, 'back3', 1, 1, 6, { t: 'chariot' }, null, [{ id: 'dash', cd: 3, cost: 0, p: { len: 4, dmg: 1, maxKills: 99 } }], '烽火连城: 沿直线冲杀4格,撞上的敌人受1点伤害(阵亡则继续冲)。');
D('nuju', '弩车', '弩', 1, 'back2', 1, 1, 3, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, null, '驻射: 缓慢移动,但可原地射击2格内任意敌人。', { type: 'box', dist: 2, jump: 1 });
D('gongcheng', '攻城车', '攻', 3, 'back3', 1, 1, 5, { t: 'chariot' }, null, [{ id: 'lineDamage', cd: 4, cost: 0, p: { dmg: 1 } }], '攻城: 对目标所在纵列的所有敌人造成1点伤害。');
D('chongchui', '冲城锤', '锤', 2, 'back3', 1, 1, 4.5, { t: 'chariot' }, [{ id: 'onCapture', type: 'dmgBehind', n: 1 }], null, '撞击: 吃子时,对其身后紧邻的敌人造成1点伤害。');

/* ---------------- 炮系 ---------------- */
D('shenpao', '神炮', '神', 3, 'back3', 1, 1, 6.5, { t: 'cannon', screens: 0 }, null, null, '无架自鸣: 无需炮架即可隔空吃子,如同车一般。');
D('lianzhupao', '连珠炮', '珠', 3, 'back3', 1, 1, 6, { t: 'cannon' }, [{ id: 'onCapture', type: 'extraMove', n: 1 }], null, '连发: 吃子后可再行动一次(每回合限一次)。');
D('hongyi', '红衣大炮', '轰', 3, 'back3', 1, 1, 6, { t: 'cannon' }, null, [{ id: 'aoeBox', cd: 4, cost: 1, p: { dist: 3, size: 3, dmg: 1 } }], '炮轰: 3格内任选中心,3×3范围敌人受1点伤害。');
D('paijipao', '迫击炮', '迫', 2, 'back3', 1, 1, 5, { t: 'cannon', screens: 2 }, null, null, '曲射: 隔两子亦可轰击目标。');
D('bingshuang', '冰霜炮', '冰', 3, 'back3', 1, 1, 5.5, { t: 'cannon' }, [{ id: 'onCapture', type: 'freezeAdj', turns: 1 }], null, '冰封: 吃子时冻结目标相邻敌人1回合(无法行动)。');
D('leishen', '雷神炮', '霆', 4, 'back3', 1, 2, 7, { t: 'cannon' }, null, [{ id: 'snipeLine', cd: 5, cost: 2, p: { dmg: 2 } }], '天雷: 对同线任一敌人造成2点伤害(无需炮架);炮击伤害2。');
D('duyan', '毒烟炮', '毒', 3, 'back3', 1, 1, 5.5, { t: 'cannon' }, [{ id: 'onCapture', type: 'poisonAdj', turns: 2 }], null, '毒烟: 吃子时使目标相邻敌人中毒2回合(每回合受1点伤害)。');

/* ---------------- 兵卒系 ---------------- */
D('changqiang', '长枪兵', '枪', 1, 'ownHalf', 1, 1, 2.5, { t: 'pawn', fwd2: 1 }, null, null, '长枪: 未过河时可前进两格(不食),吃子仍走一格。');
D('tengjia', '藤甲兵', '藤', 2, 'ownHalf', 2, 1, 3, { t: 'pawn' }, null, null, '藤甲: 刀枪不入,拥有2点生命。');
D('feidao', '飞刀兵', '刀', 2, 'ownHalf', 1, 1, 3.5, { t: 'pawn' }, null, [{ id: 'snipe', cd: 3, cost: 0, p: { dist: 3, dmg: 1 } }], '飞刀: 每3回合一次,对3格内任意敌人造成1点伤害。');
D('baopo', '爆破兵', '爆', 2, 'ownHalf', 1, 1, 3, { t: 'pawn' }, [{ id: 'onDeath', type: 'explode', dmg: 2, dist: 2 }], null, '自爆: 阵亡时对2格内所有敌人造成2点伤害。');
D('gansi', '敢死队', '敢', 2, 'ownHalf', 1, 1, 3, { t: 'pawn' }, [{ id: 'dmgBonus', n: 1 }], null, '舍身: 攻击伤害+1,不畏生死。');
D('jinjun', '禁军', '禁', 2, 'ownHalf', 1, 1, 3.5, { t: 'union', m: [{ t: 'pawn' }, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]], palace: 1 }] }, [{ id: 'auraDef', n: 1 }], null, '护驾: 身处九宫内时如卫士八面行走,相邻友军受伤害-1。');

/* ---------------- 远程步战 ---------------- */
D('gongshou', '弓手', '弓', 1, 'back2', 1, 1, 2.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, null, '直射: 直线射击2格内的敌人(不可越子)。', { type: 'line', len: 2 });
D('shenshe', '神射手', '射', 2, 'back2', 1, 1, 3.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, null, '精准: 直线射击3格内的敌人(不可越子)。', { type: 'line', len: 3 });
D('liannu', '连弩手', '矢', 3, 'back2', 1, 1, 4.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, null, '连射: 直线射击3格,每回合可攻击两个目标(各一次)。', { type: 'line', len: 3, multi: 2 });
D('huochong', '火铳手', '铳', 2, 'back2', 1, 1, 3, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, [{ id: 'qiCapture', n: 2 }], null, '火铳: 直射2格;击杀敌人+2气力。', { type: 'line', len: 2 });
D('zhidan', '掷弹兵', '弹', 3, 'back2', 1, 1, 4.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, [{ id: 'aoeBox', cd: 3, cost: 0, p: { dist: 3, size: 2, dmg: 1 } }], '投弹: 3格内任选中心,2×2范围敌人受1点伤害。');
D('dunwei', '盾卫', '盾', 2, 'back2', 2, 1, 4, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, [{ id: 'auraDef', n: 1 }], null, '盾墙: 相邻友军受到的伤害-1(最低1);自身2点生命。');
D('daofu', '刀斧手', '斧', 2, 'ownHalf', 1, 1, 3.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'onCapture', type: 'dmgAdj', n: 1 }], null, '连斩: 吃子时对目标相邻的敌人各造成1点伤害。');
D('cike', '刺客', '刺', 2, 'back2', 1, 1, 4, { t: 'diag' }, [{ id: 'firstStrike', n: 1 }], null, '影袭: 本场首次攻击伤害+1;斜线任意驰骋。');
D('renzhe', '忍者', '忍', 3, 'ownHalf', 1, 1, 4.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, [{ id: 'teleport', cd: 2, cost: 0, p: { dist: 3 } }], '瞬步: 瞬移至3格内任意空格(可越子)。');
D('feizei', '飞贼', '贼', 2, 'ownHalf', 1, 1, 4, { t: 'leap', s: 'any2' }, [{ id: 'qiCapture', n: 2 }], null, '妙手空空: 2格任意方向跳跃(可越子),吃子+2气力。');
D('jiandie', '间谍', '谍', 3, 'enemyHalf', 1, 1, 4.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'infiltrate', turns: 2 }], null, '无间: 潜伏敌阵(部署在敌方后三排),前2回合敌人无法吃它。');
D('chuanling', '传令兵', '令', 2, 'ownHalf', 1, 1, 3, { t: 'pawn' }, [{ id: 'qiStart', n: 2 }], null, '军令: 开战时气力+2。');
D('qishou', '旗手', '旗', 3, 'back2', 1, 1, 4.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'auraAtk', scope: 1, n: 1 }], null, '战旗: 相邻友军造成的伤害+1。');
D('gushou', '鼓手', '鼓', 2, 'back2', 1, 1, 3.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, [{ id: 'buffAll', cd: 4, cost: 1, p: { n: 1, thisTurn: 1 } }], '助威: 擂鼓助威,本回合全体友军伤害+1。');
D('yueshi', '乐师', '乐', 2, 'back2', 1, 1, 3, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'auraCleanse' }], null, '清心: 每回合开始解除相邻友军的眩晕/冻结与中毒。');
D('junyi', '军医', '医', 1, 'back2', 1, 1, 2.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, [{ id: 'healAdj', cd: 2, cost: 0, p: { n: 1 } }], '包扎: 治疗一名相邻友军1点生命。');
D('shenyi', '神医', '圣', 3, 'back2', 1, 1, 4.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, [{ id: 'healAny', cd: 4, cost: 0, p: { n: 2, dist: 4 } }], '妙手: 治疗4格内任意友军2点生命。');
D('liandan', '炼丹师', '丹', 3, 'back2', 1, 1, 5, { t: 'steps', s: [[-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'healMost', n: 1 }], null, '丹炉: 每回合开始自动治疗伤势最重的一名友军1点。');
D('daoshi', '道士', '道', 3, 'back2', 1, 1, 4.5, { t: 'steps', s: [[-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, [{ id: 'stunTarget', cd: 4, cost: 0, p: { dist: 3, turns: 1 } }], '定身符: 令3格内一名敌人眩晕1回合。');
D('fangshi', '方士', '符', 3, 'back2', 1, 1, 4.5, { t: 'steps', s: [[-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, [{ id: 'aoeBox', cd: 5, cost: 1, p: { dist: 3, size: 3, dmg: 1 } }], '雷符阵: 3格内任选中心,3×3范围敌人受1点伤害。');

/* ---------------- 神兽 ---------------- */
D('qinglong', '青龙', '龙', 4, 'back2', 2, 1, 8, { t: 'chariot' }, null, [{ id: 'lineDamage', cd: 6, cost: 2, p: { dmg: 2 } }], '龙息: 对目标所在纵列所有敌人造成2点伤害;行如车。');
D('baihu', '白虎', '虎', 4, 'back2', 2, 1, 7.5, { t: 'union', m: [{ t: 'horse', noLeg: 1 }, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }] }, [{ id: 'dmgBonus', n: 1 }], [{ id: 'pounce', cd: 3, cost: 0, p: { dist: 3 } }], '虎噬: 攻击伤害+1;猛扑: 跃至3格内任意点(可越子,落点敌人受攻击)。');
D('zhuque', '朱雀', '雀', 4, 'back2', 1, 1, 7.5, { t: 'elephant', cross: 1, noEye: 1 }, [{ id: 'onDeath', type: 'reborn', hp: 1 }], [{ id: 'aoeBox', cd: 6, cost: 2, p: { dist: 2, size: 3, dmg: 2 } }], '涅槃: 本场首次阵亡时以1点生命原地复活;焚天: 2格内3×3范围2点伤害。');
D('xuanwu', '玄武', '玄', 4, 'back2', 3, 1, 7, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, [{ id: 'thorns', n: 1 }, { id: 'auraDef', n: 1 }], [{ id: 'stunAdj', cd: 5, cost: 0, p: { turns: 1 } }], '龟甲: 攻击它的敌人反受1点伤害,相邻友军受伤害-1;镇岳: 眩晕相邻敌人1回合。');
D('qilin', '麒麟', '麟', 4, 'back2', 2, 1, 8, { t: 'union', m: [{ t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, { t: 'leap', s: 'any2' }] }, [{ id: 'healAllEvery', n: 1, every: 2 }], [{ id: 'buffAll', cd: 10, cost: 3, p: { n: 1 } }], '祥瑞: 每2回合全体友军回复1点;赐福: 本场全体友军伤害+1。');
D('zhulong', '烛龙', '烛', 4, 'back2', 2, 1, 8, { t: 'fly' }, [{ id: 'qiTurn', n: 1 }], [{ id: 'pushCol', cd: 4, cost: 0, p: {} }], '烛照: 每回合气力+1;呼风: 将一列敌人推向敌方底线1格。');
D('leigong', '雷公', '雷', 4, 'back2', 1, 2, 7.5, { t: 'cannon' }, null, [{ id: 'snipeAny', cd: 5, cost: 2, p: { dmg: 2 } }], '天雷: 对场上任意敌人造成2点伤害。');
D('dianmu', '电母', '电', 4, 'back2', 1, 1, 7, { t: 'cannon' }, [{ id: 'chain', n: 1, dist: 2 }], [{ id: 'aoeBox', cd: 4, cost: 1, p: { dist: 9, size: 2, dmg: 1 } }], '连锁: 造成伤害时,对目标2格内随机另一敌人造成1点伤害;电网: 任选2×2范围1点伤害。');

/* ---------------- 神话名将 ---------------- */
D('fengbo', '风伯', '风', 3, 'back2', 1, 1, 6, { t: 'chariot' }, null, [{ id: 'pushRow', cd: 4, cost: 0, p: {} }], '狂风: 将一行敌人推向敌方底线1格;行如车。');
D('yushi', '雨师', '雨', 3, 'back2', 1, 1, 5.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, [{ id: 'healAll', cd: 6, cost: 1, p: { n: 1 } }], '甘霖: 全体友军回复1点生命。');
D('houyi', '后羿', '羿', 4, 'back2', 1, 2, 8, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, null, '射日: 攻击场上任意敌人(帅将除外,最终Boss可狙),伤害1。', { type: 'any', dmg: 1 });
D('nezha', '哪吒', '吒', 4, 'back3', 1, 1, 8, { t: 'union', m: [{ t: 'horse', noLeg: 1 }, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }] }, null, [{ id: 'attackAdj', cd: 5, cost: 1, p: { dmg: 1, n: 3 } }], '三头六臂: 对至多3名相邻敌人各造成1点伤害。');
D('wukong', '悟空', '空', 4, 'ownHalf', 1, 1, 8, { t: 'leap', s: 'any2' }, [{ id: 'onDeath', type: 'reborn', hp: 1 }], [{ id: 'teleport', cd: 5, cost: 0, p: { half: 1 } }], '毫毛: 本场首次阵亡时以1点生命复活;筋斗云: 瞬移至己方半场任意空格。');
D('erlang', '二郎神', '郎', 4, 'back2', 2, 1, 8, { t: 'chariot' }, null, [{ id: 'summon', cd: 8, cost: 2, p: { defId: 'tiangou' } }], '哮天犬: 在身旁召唤一只天狗助战(临时)。');
D('tiangou', '天狗', '犬', 0, 'none', 2, 1, 4, { t: 'union', m: [{ t: 'horse', noLeg: 1 }, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }] }, null, null, '吞月: 二郎神召唤的神犬,日字如飞。');
D('xiangyu', '项羽', '羽', 4, 'back3', 3, 1, 8.5, { t: 'union', m: [{ t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, { t: 'leap', s: 'any2' }] }, [{ id: 'dmgBonus', n: 1 }, { id: 'onCapture', type: 'dmgAdj', n: 1 }], [{ id: 'buffSelf', cd: 8, cost: 0, p: { n: 1 } }], '霸王: 伤害+1,吃子时相邻敌人受1点伤害;破釜沉舟: 本场伤害再+1。');
D('hanxin', '韩信', '信', 4, 'back2', 2, 1, 8, { t: 'cannon' }, [{ id: 'qiTurn', n: 1 }], [{ id: 'stunTarget', cd: 5, cost: 0, p: { dist: 4, turns: 1 } }], '兵仙: 每回合气力+1;十面埋伏: 定身4格内一名敌人1回合。');
D('guanyu', '关羽', '关', 4, 'back3', 2, 1, 8.5, { t: 'chariot' }, [{ id: 'stunImmune' }], [{ id: 'snipeLine', cd: 6, cost: 2, p: { dmg: 3 } }], '武圣: 免疫眩晕/冻结;拖刀计: 对同线任一敌人造成3点伤害。');
D('zhangfei', '张飞', '飞', 4, 'back3', 2, 1, 8, { t: 'union', m: [{ t: 'horse', noLeg: 1 }, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }] }, [{ id: 'onCapture', type: 'stunAdj', turns: 1 }], [{ id: 'stunTarget', cd: 5, cost: 0, p: { dist: 3, turns: 1 } }], '咆哮: 吃子时眩晕目标相邻敌人1回合;当阳断喝: 定身3格内一名敌人。');
D('zhaoyun', '赵云', '云', 4, 'back3', 2, 1, 8.5, { t: 'chariot' }, [{ id: 'skillImmune' }], [{ id: 'dash', cd: 5, cost: 2, p: { len: 99, dmg: 2, maxKills: 2 } }], '龙胆: 免疫敌人技能伤害;七进七出: 沿直线冲杀,连撞至多2名敌人(各2点伤害)。');
D('lvbu', '吕布', '吕', 4, 'back3', 2, 1, 9, { t: 'union', m: [{ t: 'horse', noLeg: 1 }, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }] }, [{ id: 'onCapture', type: 'extraMove', n: 2 }], [{ id: 'snipe', cd: 4, cost: 0, p: { dist: 3, dmg: 2 } }], '无双: 吃子后可再行动,每回合至多两次;辕门射戟: 3格内任一敌人受2点伤害。');
D('zhugeliang', '诸葛亮', '亮', 4, 'back2', 1, 1, 8, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'qiTurn', n: 1 }], [{ id: 'enemySkip', cd: 10, cost: 4, p: {} }], '借东风: 每回合气力+1;空城计: 敌方下回合无法行动。');
D('simayi', '司马懿', '懿', 4, 'back2', 2, 1, 7.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'rageAllyDeath', n: 1 }], [{ id: 'lineDamage', cd: 6, cost: 2, p: { dmg: 2 } }], '隐忍: 每当友军阵亡,本场伤害+1;火攻: 对目标所在纵列敌人造成2点伤害。');
D('zhouyu', '周瑜', '瑜', 4, 'back2', 1, 1, 7.5, { t: 'cannon' }, null, [{ id: 'aoeBox', cd: 6, cost: 2, p: { dist: 3, size: 3, dmg: 2 } }], '赤壁火计: 3格内任选中心,3×3范围2点伤害。');
D('huangzhong', '黄忠', '忠', 4, 'back2', 1, 2, 7.5, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, null, '烈弓: 直线射击3格内敌人(可越子),伤害2。', { type: 'line', len: 3, jump: 1 });
D('machao', '马超', '超', 4, 'back3', 2, 1, 8, { t: 'horse', noLeg: 1 }, [{ id: 'qiCapture', n: 2 }], [{ id: 'dash', cd: 4, cost: 0, p: { len: 4, dmg: 1, maxKills: 1 } }], '神威: 吃子+2气力;冲阵: 沿直线冲4格,撞击首个敌人(1点伤害)。');
D('dianwei', '典韦', '韦', 3, 'back2', 3, 1, 6, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'auraDef', n: 1 }], [{ id: 'attackAdj', cd: 5, cost: 0, p: { dmg: 2, n: 99 } }], '铁壁: 相邻友军受伤害-1;恶来: 对所有相邻敌人造成2点伤害。');
D('xuchu', '许褚', '褚', 3, 'back2', 3, 1, 6, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'thorns', n: 1 }], [{ id: 'buffSelf', cd: 8, cost: 0, p: { n: 2 } }], '虎痴: 攻击它的敌人反受1点伤害;裸衣: 本场伤害+2。');
D('diaochan', '貂蝉', '蝉', 4, 'back2', 1, 1, 7, { t: 'steps', s: [[-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'auraCharm' }], [{ id: 'stunTarget', cd: 8, cost: 0, p: { dist: 3, turns: 2 } }], '魅惑: 相邻敌人伤害-1且无法使用技能;离间: 3格内一名敌人眩晕2回合。');
D('daji', '妲己', '妲', 3, 'back2', 1, 1, 6, { t: 'steps', s: [[-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'auraWeaken' }], [{ id: 'stunAdj', cd: 5, cost: 0, p: { turns: 1 } }], '狐魅: 相邻敌人伤害-1;倾城: 眩晕相邻敌人1回合。');
D('mulan', '木兰', '兰', 3, 'back3', 1, 1, 6.5, { t: 'union', m: [{ t: 'horse', noLeg: 1 }, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }] }, [{ id: 'auraAtk', scope: 2, n: 1 }], [{ id: 'buffSelf', cd: 6, cost: 0, p: { n: 1 } }], '巾帼: 2格内友军伤害+1;从军: 本场自身伤害+1。');
D('muguiying', '穆桂英', '穆', 3, 'back3', 1, 1, 6.5, { t: 'chariot' }, null, [{ id: 'aoeBox', cd: 6, cost: 2, p: { dist: 3, size: 3, dmg: 2 } }], '破天门阵: 3格内任选中心,3×3范围2点伤害。');
D('baiqi', '白起', '起', 4, 'back3', 2, 1, 8, { t: 'cannon' }, [{ id: 'onCapture', type: 'healSelf', n: 1 }, { id: 'qiCapture', n: 1 }], [{ id: 'snipe', cd: 4, cost: 0, p: { dist: 2, dmg: 2 } }], '杀神: 吃子回复1点生命并+1气力;人屠: 2格内任一敌人受2点伤害。');

/* ---------------- 凡品补强(基础兵种) ---------------- */
D('yima', '驿马', '驿', 1, 'back3', 1, 1, 3.2, { t: 'horse' }, [{ id: 'qiStart', n: 1 }], null, '驿传: 开战时气力+1,日字驰骋。');
D('tanma', '探马', '探', 1, 'back3', 1, 1, 3.4, { t: 'horse' }, null, null, '军前侦骑: 日字纵横,来去如风。');
D('qingche', '轻车', '轻', 1, 'back3', 1, 1, 5.5, { t: 'chariot' }, null, null, '轻装战车: 纵横任意驰骋,无坚不摧。');
D('shipao', '石炮', '石', 1, 'back3', 1, 1, 4.2, { t: 'cannon', screens: 1 }, null, null, '投石机: 规则同炮,隔一子轰击。');
D('huobing', '伙兵', '伙', 1, 'river', 1, 1, 1.8, { t: 'pawn' }, [{ id: 'onCapture', type: 'qi', n: 1 }], null, '伙夫: 缴获敌粮,吃子+1气力。');
D('xianfeng', '先锋', '先', 1, 'back3', 1, 1, 2.8, { t: 'pawn' }, [{ id: 'dmgBonus', n: 1 }], null, '陷阵: 攻击伤害+1。');
D('minfu', '民夫', '民', 1, 'river', 1, 1, 1.8, { t: 'pawn' }, [{ id: 'onDeath', type: 'healAllies', n: 1 }], null, '民夫: 阵亡时全体友军回复1点生命。');
D('yongshi', '勇士', '勇', 1, 'river', 1, 1, 2.5, { t: 'pawn' }, [{ id: 'thorns', n: 1 }], null, '视死如归: 攻击它的敌人反受1点伤害。');
D('duandao', '短刀手', '短', 1, 'ownHalf', 1, 1, 2.2, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, null, '近身搏杀: 横直一步。');
D('changmao', '长矛手', '矛', 1, 'ownHalf', 1, 1, 2.0, { t: 'steps', s: [[-1, 0], [-1, -1], [-1, 1]] }, null, null, '长矛: 只进不退,向前三向刺击一步。');
D('jibing', '戟兵', '戟', 1, 'ownHalf', 1, 1, 2.4, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, null, '长戟: 八面行走一步。');
D('biaoshi', '镖师', '镖', 1, 'back2', 1, 1, 2.6, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, [{ id: 'snipe', cd: 3, cost: 0, p: { dist: 2, dmg: 1 } }], '飞镖: 2格内任一敌人受1点伤害。');
D('bukkuai', '捕快', '捕', 1, 'back2', 1, 1, 2.8, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, [{ id: 'stunTarget', cd: 4, cost: 0, p: { dist: 2, turns: 1 } }], '铁索: 2格内一名敌人眩晕1回合。');
D('jianshi', '剑士', '剑', 1, 'ownHalf', 1, 1, 3.0, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, [{ id: 'attackAdj', cd: 5, cost: 0, p: { dmg: 1, n: 99 } }], '剑气: 对所有相邻敌人各造成1点伤害。');
D('lishi', '力士', '力', 1, 'ownHalf', 1, 1, 2.8, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, [{ id: 'buffSelf', cd: 8, cost: 0, p: { n: 1 } }], '蛮力: 本场自身伤害+1。');
D('sishi', '死士', '死', 1, 'ownHalf', 1, 1, 2.6, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'onDeath', type: 'explode', dmg: 1, dist: 1 }], null, '自殉: 阵亡时对相邻敌人造成1点伤害。');
D('weibing', '卫兵', '卫', 1, 'back2', 1, 1, 3.2, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, [{ id: 'auraDef', n: 1 }], null, '护卫: 相邻友军受到的伤害-1(最低1)。');
D('laozu', '老卒', '老', 1, 'river', 1, 1, 2.2, { t: 'pawn' }, [{ id: 'firstStrike', n: 1 }], null, '沙场老兵: 本场首次攻击伤害+1。');
D('shiwei', '侍卫', '侍', 1, 'palace', 1, 1, 3.4, { t: 'advisor' }, [{ id: 'auraDef', n: 1 }], null, '贴身侍卫: 斜行护宫,相邻友军受伤害-1。');
D('mubing', '募兵', '募', 1, 'river', 1, 1, 1.6, { t: 'pawn' }, [{ id: 'qiStart', n: 1 }], null, '新募之卒: 开战时气力+1。');
D('zhuangshi', '壮士', '壮', 1, 'ownHalf', 2, 1, 3.0, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, null, null, '壮士: 身强力壮,拥有2点生命。');

/* ---------------- Boss 专用 ---------------- */
D('caocao', '曹操', '曹', 4, 'back2', 3, 1, 8, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, [{ id: 'qiTurn', n: 1 }], [{ id: 'attackAdj', cd: 4, cost: 0, p: { dmg: 2, n: 99 } }], '魏武: 每回合气力+1;献刀: 对所有相邻敌人造成2点伤害。');
D('chiyou', '蚩尤', '尤', 4, 'palace', 8, 2, 500, { t: 'union', m: [{ t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }] }, [{ id: 'stunImmune' }, { id: 'poisonImmune' }, { id: 'thorns', n: 1 }], [{ id: 'lineDamage', cd: 4, cost: 1, p: { dmg: 2 } }, { id: 'summon', cd: 6, cost: 2, p: { defId: 'mobing', n: 2 } }], '兵主: 涿鹿魔神,三阶段进化。魔躯: 免疫眩晕/中毒,攻击者反受1伤;裂地: 同列敌人受2伤;召魔: 召唤魔兵。', null, true);
D('mobing', '魔兵', '魔', 0, 'none', 1, 1, 2, { t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] }, null, null, '蚩尤麾下的魔兵,八面行走。');
D('taotie', '饕餮', '餮', 0, 'none', 3, 1, 6, { t: 'union', m: [{ t: 'steps', s: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, { t: 'leap', s: 'ortho2' }] }, [{ id: 'dmgBonus', n: 1 }], null, '凶兽: 直行一步或直跳两格,伤害+1。');

/* ---------------- 池子与工具 ---------------- */
/* 三选一可招募池(不含召唤物与Boss专属) */
const DRAFT_POOL = Object.keys(P_DEFS).filter(id => {
  const d = P_DEFS[id];
  return d.r >= 1 && d.r <= 4 && ['tiangou', 'caocao', 'chiyou', 'mobing', 'taotie'].indexOf(id) < 0 && d.mv.t !== 'general';
});

/* 标准开局十六子 */
const STD_SET = ['s_ju', 's_ma', 's_xiang', 's_shi', 's_jiang', 's_shi', 's_xiang', 's_ma', 's_ju', 's_pao', 's_pao', 's_bing', 's_bing', 's_bing', 's_bing', 's_bing'];

const GENERAL_NAMES = { s_jiang: ['帅', '将'], s_shi: ['仕', '士'], s_xiang: ['相', '象'], s_bing: ['兵', '卒'] };

function displayName(defId, side) {
  const g = GENERAL_NAMES[defId];
  if (g) return g[side === 'red' ? 0 : 1];
  return P_DEFS[defId] ? P_DEFS[defId].name : '?';
}
