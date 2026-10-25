'use strict';
// ===== NPC의 뇌: 모든 판단을 하나의 구조로 =====
//   감각(날씨·기온·시각·통장·냉장고·가게 문 연 시간) → 몸과 마음의 상태(욕구) → 선택지마다 "이걸 하면 어떨까"를 따져 봄 → 가장 나은 것 + 그 이유(생각)
// 따지는 방법은 모두 같음: 선택지의 좋은 점(채워지는 욕구 × 그 사람이 좋아하는 정도) − 나쁜 점(돈·수고·날씨·질림)
// 사람마다 생각이 다름: 사람 번호로 정해지는 개성(입맛·절약·우산 습관·날씨 민감도·새로움 추구·충동)과 성격(5가지)이 같은 상황에서 다른 답을 냄
// 새 판단(옷·여가·쇼핑·투자 …)을 더할 때도 선택지 목록 + 같은 따지기 함수로 더하면 됨
const { hash, DAY, weatherOf, weekdayOf, temperature } = require('../world.js');
const mind = require('./mind.js');

// ----- 개성: 사람 번호로 정해지는 고정값 (저장하지 않아도 늘 같음) -----
const selfCache = new Map();
function selfOf(n) {
  let s = selfCache.get(n.id);
  if (s) return s;
  const h = k => hash(n.id, 900, k), T = n.tr;
  s = {
    sweet: h(1) ** 0.8,                                 // 단것 좋아함
    spicy: h(2),                                        // 매운 것
    meat: h(3),                                         // 고기
    healthy: (h(4) + T.c) / 2,                          // 몸에 좋은 것 챙김
    coffee: h(5) < 0.55 ? 0.4 + h(6) * 0.6 : h(6) * 0.3, // 커피 (절반쯤은 커피 없으면 안 되는 사람)
    appetite: 0.75 + h(7) * 0.5,                        // 먹는 양 (배가 빨리 꺼짐)
    frugal: Math.min(1, 0.15 + T.c * 0.45 + h(8) * 0.4), // 아끼는 정도
    umbrella: 0.45 + T.c * 0.45 + h(9) * 0.1,           // 비 오는 날 우산을 챙길 확률 (덤벙대는 사람은 깜빡)
    rainHate: h(10), coldHate: h(11), heatHate: h(12), // 날씨를 싫어하는 정도
    variety: (T.o + h(13)) / 2,                         // 새로운 것 좋아함 (같은 걸 먹으면 질림)
    impulsive: Math.min(1, (1 - T.c) * 0.7 + h(14) * 0.4), // 그때그때 기분대로
    homebody: (T.n + 1 - T.e) / 2,                      // 집이 좋음
  };
  selfCache.set(n.id, s);
  return s;
}

// ----- 감각: 지금 바깥 형편 -----
let senseAt = null, senseMemo = null;   // 같은 분에는 모두 같은 바깥 형편
function senseOf(ctx) {
  if (senseAt === ctx.min) return senseMemo;
  senseAt = ctx.min;
  return senseMemo = senseNow(ctx);
}
function senseNow(ctx) {
  const wx = weatherOf(ctx.day), temp = temperature(ctx.min);
  return { wx, temp, h: Math.floor(ctx.t / 60), wd: weekdayOf(ctx.day), rain: wx === 'rain' || wx === 'storm', snow: wx === 'snow', storm: wx === 'storm' };
}
// 바깥에 나가는 부담 (점수): 비(우산 있으면 덜)·태풍·눈·추위·더위를 그 사람이 싫어하는 만큼
function outdoorCost(n, se, far = 1) {
  const s = selfOf(n), umb = n.umbToday;
  let c = 0;
  if (se.rain) c += (umb ? 6 : 26) * (0.5 + s.rainHate) * (se.storm ? 2.2 : 1);
  if (se.snow) c += 12 * (0.5 + s.coldHate);
  if (se.temp < 3) c += (3 - se.temp) * 1.1 * (0.4 + s.coldHate);
  if (se.temp > 29) c += (se.temp - 29) * 2 * (0.4 + s.heatHate);
  return c * far;
}
// 욕구가 급한 정도 0~1 (비면 빠르게 급해짐)
const urg = x => Math.max(0, (100 - x) / 100) ** 1.4;

// ----- 먹고 마실 것: 선택지 -----
//   act = 어디서 하는지(사람 모듈의 행동), to = 돈이 가는 동네 가게, far = 나가는 거리(0 집, 0.5 바로 앞 편의점, 1 동네)
//   food·sweet·caffeine·social = 채워 주는 양, spicy·meat·healthy = 맛의 성격, open = 여는 시각
const FOODS = [
  { id: 'homeMeal', name: '집밥', act: 'eatHome', far: 0, price: 0, grocery: 1, food: 55, sweet: 5, healthy: 0.85, effort: 14, meal: true, open: [5, 23] },
  { id: 'ramen', name: '라면', act: 'eatHome', far: 0, price: 0, grocery: 1, food: 40, spicy: 0.7, healthy: 0.1, effort: 3, meal: true, open: [0, 24] },
  { id: 'delivery', name: '배달 음식', act: 'eatHome', far: 0, price: 17000, to: 'restaurant', food: 62, meat: 0.7, healthy: 0.3, effort: 1, meal: true, open: [10, 24] },
  { id: 'gukbap', name: '국밥', act: 'eatOut', far: 1, price: 9000, to: 'restaurant', food: 62, healthy: 0.7, warm: true, meal: true, open: [6, 22] },
  { id: 'bunsik', name: '떡볶이', act: 'eatOut', far: 1, price: 6000, to: 'restaurant', food: 45, sweet: 15, spicy: 1, healthy: 0.2, open: [10, 22] },
  { id: 'bbq', name: '고기', act: 'eatOut', far: 1, price: 24000, to: 'restaurant', food: 70, meat: 1, social: 18, treat: true, healthy: 0.3, meal: true, open: [17, 23] },
  { id: 'cvs', name: '편의점 도시락', act: 'eatOut', far: 0.5, price: 5000, to: 'mart', food: 45, healthy: 0.2, effort: 0, meal: true, open: [0, 24] },
  { id: 'dessert', name: '디저트', act: 'cafe', far: 1, price: 6500, to: 'cafe', food: 8, sweet: 75, social: 8, open: [10, 22] },
  { id: 'coffee', name: '커피', act: 'cafe', far: 1, price: 4500, to: 'cafe', caffeine: 85, sweet: 8, social: 8, open: [7, 22] },
];
// 계절에 맞는 이름 (말할 때)
const dishName = (o, temp) => o.id === 'dessert' ? (temp >= 24 ? '빙수' : '케이크') : o.id === 'coffee' ? (temp >= 20 ? '아이스 아메리카노' : '따뜻한 라떼') : o.name;
const isMealTime = h => h === 7 || h === 8 || h === 12 || h === 13 || h === 18 || h === 19;

// 선택지 하나를 따져 봄 → { u: 점수, parts: 이유별 점수 }
function weigh(n, o, se, ctx, money) {
  const s = selfOf(n), N = n.need, P = {}, add = (k, v) => { P[k] = (P[k] || 0) + v; };
  // 좋은 점: 채워지는 욕구 × 급한 정도 × 좋아하는 정도
  add('hunger', urg(N.food) * (o.food || 0) * 2.3);
  add('sweet', urg(N.sweet) * (o.sweet || 0) * (0.2 + s.sweet * 1.1) * (1 + mind.emo(n, 'sad') / 60));   // 울적하면 단 게 더 당김
  add('caffeine', urg(N.caffeine) * (o.caffeine || 0) * s.coffee * 1.6);
  add('social', urg(N.social) * (o.social || 0) * (0.5 + n.tr.e));
  add('taste', ((o.spicy || 0) * (s.spicy - 0.45) + (o.meat || 0) * (s.meat - 0.45)) * 30 + ((o.healthy ?? 0.5) - 0.5) * (s.healthy - 0.5) * 30);
  if (o.spicy && mind.emo(n, 'anger') > 10) add('stress', mind.emo(n, 'anger') * 0.25 * o.spicy);   // 화나면 매운 거
  if (o.warm && se.temp < 8) add('warm', (8 - se.temp) * 1.2);                       // 추운 날 뜨끈한 국물
  if (o.id === 'dessert' && se.temp >= 26) add('cool', (se.temp - 26) * 2);           // 더운 날 빙수
  if (o.treat) add('treat', se.wd >= 4 ? 4 : -14);                                         // 고기는 금요일·주말에 (평일엔 아껴 둠)
  if (o.meal && isMealTime(se.h)) add('mealtime', 14 + n.tr.c * 10);                    // 밥때 (규칙적인 사람일수록)
  // 나쁜 점
  if ((o.food || 0) >= 30 && N.food > 70) add('full', -(N.food - 70) * 2.2);          // 배불러서 밥은 못 먹음 (디저트 배는 따로)
  if (o.price) add('money', -o.price / 1000 * (0.5 + s.frugal * 1.4) * (money < 200000 ? 3 : money < 1000000 ? 1.5 : 1.05) * mind.thrift(n));   // 목표(집·여행)를 위해 모으거나 걱정되면 더 아낌
  if (o.effort) add('effort', -o.effort * (0.6 + (100 - N.energy) / 60));                // 피곤하면 요리하기 귀찮음
  if (o.far) add('weather', -outdoorCost(n, se, o.far) - o.far * 6 * (0.5 + s.homebody)); // 나가는 수고 + 날씨
  const recent = n.ate || [];
  if (recent.includes(o.id)) add('bored', -(s.variety * 16) * (1 + mind.emo(n, 'bored') / 50) * (recent.filter(x => x === o.id).length));   // 요즘 계속 먹어서 질림
  else if (recent.length && s.variety < 0.35 && o.id === recent[0]) add('habit', 6);
  add('whim', (hash(ctx.min, n.id, 950 + o.id.length) - 0.5) * 16 * s.impulsive);    // 그때그때 끌림
  return { u: Object.values(P).reduce((a, b) => a + b, 0), parts: P };
}
// 먹을지·뭘 먹을지: 가능한 선택지 중 가장 나은 것과 그 이유
function chooseFood(ctx, n, se, age) {
  const money = ctx.ledger.bal('p:' + n.id);
  let best = null;
  for (const o of FOODS) {
    if (se.h < o.open[0] || se.h >= o.open[1]) continue;                       // 문 닫음
    if (o.grocery && !(n.groceries >= o.grocery)) continue;                    // 냉장고가 비었음
    if (o.price && money < o.price) continue;                                  // 돈이 없음
    if (age < 10 && o.price) continue;                                          // 어린아이는 사 먹으러 다니지 않음
    if (o.caffeine && age < 17) continue;
    const w = weigh(n, o, se, ctx, money);
    if (!best || w.u > best.u) best = { o, ...w };
  }
  return best;
}
// 이유 → 말 (가장 크게 작용한 좋은 점 하나 + 피한 나쁜 점 하나)
function reasonOf(n, best, se) {
  const P = best.parts, o = best.o, N = n.need, s = selfOf(n), why = [];
  const top = Object.entries(P).filter(([k, v]) => v > 4 && !['whim', 'habit'].includes(k)).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top === 'sweet' && mind.emo(n, 'sad') > 25) why.push('기분이 꿀꿀해서 단 거라도 먹으려고요');
  else if (top === 'stress') why.push('스트레스 받아서 매운 게 당겨서요');
  else if (top === 'hunger') why.push(N.food < 25 ? '배가 너무 고파서요' : '배가 좀 고파서요');
  else if (top === 'sweet') why.push(N.food > 65 ? '배는 부른데 단 게 당겨서요' : '단 게 너무 당겨서요');
  if (top === 'caffeine') why.push(s.coffee > 0.7 ? '커피 없으면 하루가 안 굴러가서요' : '잠 좀 깨려고요');
  if (top === 'social') why.push('사람 구경도 할 겸요');
  if (top === 'taste') why.push(o.spicy ? '매운 게 땡겨서요' : o.meat ? '고기가 먹고 싶어서요' : '몸 생각해서요');
  if (top === 'warm') why.push('날이 추워서 뜨끈한 게 먹고 싶어서요');
  if (top === 'cool') why.push('너무 더워서 시원한 게 먹고 싶어서요');
  if (top === 'mealtime') why.push('밥때가 돼서요');
  // 함께 작용한 사정
  if (!o.far && se.rain && (o.id === 'delivery' || o.id === 'ramen' || o.id === 'homeMeal')) why.push(o.id === 'delivery' ? '비 와서 나가기 싫어서 배달시켰어요' : '비 와서 그냥 집에서 먹으려고요');
  else if ((o.id === 'ramen' || o.id === 'cvs') && (P.money === undefined || s.frugal > 0.6)) why.push(o.id === 'cvs' ? '돈 아끼려고 도시락으로 때우려고요' : '간단하게 때우려고요');
  else if (o.id === 'ramen' && N.energy < 40) why.push('피곤해서 요리할 기운이 없어서요');
  if ((P.bored || 0) === 0 && n.ate?.length >= 2 && s.variety > 0.6 && !n.ate.includes(o.id)) why.push('요즘 같은 것만 먹어서 다른 걸 먹어 보려고요');
  return why.slice(0, 2);
}
// 그 선택을 실제로 함: 돈을 내고(동네 가게로) 욕구가 채워짐. 못 하면 false
function consume(ctx, n, o) {
  const N = n.need, loc = ctx.S.work.local?.[n.region];
  if (o.price && !ctx.ledger.move('p:' + n.id, loc?.[o.to] || 'ext', o.price)) return false;
  if (o.grocery) n.groceries -= o.grocery;
  N.food += o.food || 0; N.sweet += o.sweet || 0; N.caffeine += o.caffeine || 0; N.social += o.social || 0;
  if (o.food) N.sweet += 6;   // 뭘 먹으면 단것 생각도 조금 덜함
  n.ate = [o.id, ...(n.ate || [])].slice(0, 4);
  return true;
}

// ----- 날씨에 대한 몸의 반응 (한 시간마다) -----
//   비 오는 날 처음 나갈 때 우산을 챙길지(습관·성실함, 덤벙대면 깜빡) → 없으면 젖고, 젖으면 기분이 나쁘고 감기에 걸리기도. 아끼지 않는 사람은 편의점에서 우산을 삼
function packUmbrella(ctx, n, se) {   // 그날 처음 생각할 때 한 번: 비·눈이면 우산을 챙길지
  if (n.umbDay !== ctx.day) { n.umbDay = ctx.day; n.umbToday = (se.rain || se.snow) && hash(ctx.day, n.id, 960) < selfOf(n).umbrella; }
}
function weatherBody(ctx, n, se, outside, remember) {
  const s = selfOf(n), day = ctx.day;
  if (outside && (se.rain || se.snow) && !n.umbToday && (n.wet || 0) > 20 && hash(ctx.min, n.id, 961) > s.frugal * 0.8) {   // 젖기 시작하면 편의점 우산
    if (ctx.ledger.move('p:' + n.id, ctx.S.work.local?.[n.region]?.mart || 'ext', 5000)) { n.umbToday = true; remember(n, day, '비를 쫄딱 맞아서 편의점에서 우산을 샀다', -2); }
  }
  const wetBy = !outside ? -45 : se.storm ? (n.umbToday ? 25 : 55) : se.rain ? (n.umbToday ? 4 : 40) : se.snow ? (n.umbToday ? 3 : 18) : -25;
  n.wet = Math.max(0, Math.min(100, (n.wet || 0) + wetBy));
  if (n.wet > 50) { n.mood -= 3 * (0.5 + s.rainHate); if (hash(ctx.min, n.id, 962) < 0.04) { n.health -= 10; remember(n, day, '비를 맞아서 감기 기운이 있다', -6); } }
  if (outside && se.temp < -3 && hash(ctx.min, n.id, 963) < 0.02 * (0.5 + s.coldHate)) { n.health -= 6; remember(n, day, '너무 추워서 감기에 걸렸다', -5); }
}

// ----- 성향을 말로 (대화 주제) -----
function tasteTalk(n) {
  const s = selfOf(n), t = [];
  if (s.sweet > 0.85) t.push('저는 단 걸 정말 좋아해요. 하루에 한 번은 디저트를 먹어야 해요.');
  if (s.coffee > 0.85) t.push('커피 없으면 못 살아요. 하루에 몇 잔씩 마셔요.');
  if (s.spicy > 0.85) t.push('매운 게 최고예요. 떡볶이는 일주일에 세 번은 먹어요.');
  if (s.spicy < 0.1) t.push('저는 매운 걸 하나도 못 먹어요.');
  if (s.meat > 0.88) t.push('고기 없으면 밥 먹은 것 같지가 않아요.');
  if (s.frugal > 0.85) t.push('돈 모으는 중이라 웬만하면 사 먹지 않아요.');
  if (s.rainHate > 0.85) t.push('비 오는 날이 제일 싫어요. 그런 날은 집 밖에 안 나가요.');
  if (s.umbrella < 0.5) t.push('우산을 자꾸 깜빡해서 비만 오면 쫄딱 젖어요.');
  return t;
}

module.exports = { selfOf, senseOf, outdoorCost, chooseFood, reasonOf, consume, packUmbrella, weatherBody, dishName, tasteTalk, FOODS, urg };
