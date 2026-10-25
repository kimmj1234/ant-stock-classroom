'use strict';
// ===== 플레이어와의 관계: NPC가 나를 기억하고, 호감·신뢰가 쌓이고, 먼저 말을 걺 =====
// 사람마다 플레이어(계정)별로: 만난 횟수·마지막 만남·이름(두 번째부터 부름)·호감(-100~100)·신뢰(0~100)·받은 선물·오늘 말 건 횟수
//   호감: 말 걸 때마다 조금씩(상냥하고 활발한 사람일수록 빨리, 친할수록 천천히), 하루에 너무 자주 걸면 귀찮아해서 떨어짐, 오래 못 보면 조금씩 멀어짐
//   신뢰: 천천히 쌓임. 같은 일터 동료면 처음부터 조금 있음. 신뢰가 쌓여야 회사 일·소문·취재 내용을 알려 줌(깐깐한 사람일수록 더 필요)
//   선물: 가방의 물건을 줌 → 그 사람 입맛·처지(배고픔·비 맞는 중)에 맞을수록 크게 기뻐함, 기억에 남아 나중에 고마워함
//   친해지면: 이름을 부르며 반기고, 거리에서 먼저 다가와 말을 걸고, 가끔 작은 선물을 줌
const { hash, DAY } = require('../world.js');

const relOf = (n, who) => ((n.met ||= {})[who] ||= { times: 0, last: null });
const level = r => !r || !r.times ? 'new' : (r.like || 0) < -15 ? 'cold' : (r.like || 0) >= 60 && (r.trust || 0) >= 35 ? 'close' : (r.like || 0) >= 25 ? 'friend' : 'known';
const LEVEL_NAME = { new: '처음 만남', known: '아는 사이', friend: '친구', close: '절친', cold: '서먹함' };
// 비밀(회사 일·소문)을 말해 줄 만큼 믿는지: 상냥할수록 쉽게, 무뚝뚝하면 더 깐깐
const trusts = (n, r, blunt) => (r?.trust || 0) >= 8 + (1 - n.tr.a) * 25 + (blunt ? 15 : 0);

// 말 걸 때 (대사를 만들기 전): 호감·신뢰 변화
function onTalk(n, who, me, min) {
  const r = relOf(n, who), day = Math.floor(min / DAY);
  if (me?.name) r.name = me.name;
  if (r.day !== day) { r.day = day; r.today = 0; }
  r.today++;
  if (r.today > 4) r.like = Math.max(-100, (r.like || 0) - 3 * (1.3 - n.tr.a));   // 귀찮게 자꾸 말 걸면
  else if (!r.last || min - r.last > 30) {                                           // 잠깐 사이에 또 말 걸면 그대로
    r.like = Math.min(100, (r.like || 0) + (2 + n.tr.a * 3 + n.tr.e * 2) / (1 + Math.max(0, r.like || 0) / 40));
    r.trust = Math.min(100, (r.trust || 0) + 1 + n.tr.a * 2);
  }
  if (me?.emp && me.emp === n.emp) r.trust = Math.max(r.trust || 0, 25), r.coworker = true;   // 같은 일터 동료
  return r;
}
// 매일: 오래(사흘 넘게) 못 보면 조금씩 멀어짐
function daily(n, day) {
  for (const r of Object.values(n.met || {})) {
    if (r.like > 0) r.like *= day - Math.floor((r.last || 0) / DAY) > 3 ? 0.98 : 0.996;
    if (r.trust) r.trust *= 0.998;
  }
}

// ----- 선물 -----
// 물건마다: 채워 주는 것 · 그 사람이 좋아하는 정도(입맛에 따라 0~1)
const GIFT = {
  bread: { food: 25, sweet: 20, likes: s => 0.35 + s.sweet * 0.6 },
  milk: { food: 10, likes: s => 0.25 + s.healthy * 0.7 },
  apple: { food: 10, likes: s => 0.3 + s.healthy * 0.7 },
  ramen: { food: 30, likes: s => 0.25 + s.spicy * 0.4 + s.frugal * 0.3 },
  kimbap: { food: 40, likes: () => 0.6 },
  drink: { sweet: 25, likes: s => 0.3 + s.sweet * 0.5 },
  snack: { sweet: 35, likes: s => 0.15 + s.sweet * 0.85 },
  umbrella: { likes: () => 0.25 },
};
const josa = (s, a, b) => s + ((s.charCodeAt(s.length - 1) - 0xac00) % 28 ? a : b);
function gift(n, who, me, item, itemName, min, se, self, remember) {
  const r = relOf(n, who), day = Math.floor(min / DAY), g = GIFT[item] || { likes: () => 0.3 }, N = n.need;
  r.name = me.name;
  if (r.giftDay !== day) { r.giftDay = day; r.giftsToday = 0; }
  r.giftsToday++;
  let v = g.likes(self), line;
  const raining = se.rain || se.snow;
  if (item === 'umbrella' && raining && !n.umbToday) { v = 1.3; n.umbToday = true; line = n.wet > 30 ? '어머, 우산이요? 안 그래도 비 쫄딱 맞고 있었는데… 정말 고마워요!' : '우산이요? 오늘 깜빡하고 안 가져왔는데, 살았어요! 고마워요.'; }
  if (g.food && N.food < 40) { v += 0.3; line ||= `마침 배고팠는데! ${itemName} 잘 먹을게요, 고마워요!`; }
  if (r.giftsToday > 2) { v *= 0.2; line = '오늘 벌써 몇 번째예요… 이제 괜찮아요! 마음만 받을게요.'; }
  const stranger = (r.times || 0) < 2;
  line ||= v > 0.75 ? `와, ${itemName}! 제가 이거 정말 좋아하는 거 어떻게 알았어요? 고마워요!` : v > 0.45 ? `${josa(itemName, '이네요', '네요')}. 고마워요, 잘 먹을게요.` : `아, ${josa(itemName, '이요', '요')}? …그래도 마음은 고마워요.`;
  if (stranger) line = (n.tr.e < 0.35 ? '어… 처음 보는 분이 이걸 왜…? ' : '어머, 처음 뵙는데 이런 걸 다… ') + line;
  const gain = (4 + v * 14) / (1 + Math.max(0, r.like || 0) / 60) * (stranger ? 0.6 : 1);
  r.like = Math.min(100, (r.like || 0) + gain); r.trust = Math.min(100, (r.trust || 0) + (2 + v * 5) * (stranger ? 0.5 : 1));
  N.food = Math.min(100, N.food + (g.food || 0)); N.sweet = Math.min(100, (N.sweet ?? 70) + (g.sweet || 0));
  if (v > 0.4) { r.gift = { item: itemName, day, umbrella: item === 'umbrella' }; remember(n, day, `${me.name}님이 ${josa(itemName, '을', '를')} 줬다`, Math.round(3 + v * 6)); }
  r.last = Math.floor(min);
  return { lines: [line], like: Math.round(r.like), level: level(r) };
}

// ----- 친해지면 먼저 말을 걺 (거리에서 다가와서): 그날 한 번 -----
function callOf(n, who, min, hasNews) {
  const r = n.met?.[who], lv = level(r), day = Math.floor(min / DAY);
  if (!r?.name || (lv !== 'friend' && lv !== 'close') || r.callDay === day) return null;
  if (hash(day, n.id, 2001) > (lv === 'close' ? 0.9 : 0.5)) return null;   // 친구는 반쯤, 절친은 거의 늘
  return `${r.name}님! ${hasNews && trusts(n, r) ? '들은 얘기 있는데 잠깐만요!' : lv === 'close' ? '여기예요! 반가워요!' : '안녕하세요!'}`;
}
// 절친이면 가끔 작은 선물 (그날 한 번, 그 사람이 좋아하는 것으로)
function giveBack(n, who, min, self, pay) {
  const r = n.met?.[who], day = Math.floor(min / DAY);
  if (level(r) !== 'close' || r.gaveDay === day || hash(day, n.id, 2002) > 0.25) return null;
  const item = self.sweet > 0.6 ? 'snack' : self.healthy > 0.6 ? 'apple' : 'drink';
  if (!pay(1500)) return null;
  r.gaveDay = day;
  return item;
}

module.exports = { relOf, level, LEVEL_NAME, trusts, onTalk, daily, gift, callOf, giveBack };
