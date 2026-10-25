'use strict';
// ===== NPC의 마음: 감정 · 인생 목표 · 하루 계획(약속) =====
// 뇌(brain.js)가 "지금 이 순간 뭘 할까"를 따진다면, 마음은 그 따지기에 무게를 얹음
//   감정: 일어난 일을 평가해 생김(기억이 생기면 그 무게만큼, 비 맞으면 짜증, 집에만 있으면 심심함…) → 이유와 함께 남고 시간이 지나면 가라앉음
//         → 먹을 것(슬프면 단것, 화나면 매운 것, 걱정되면 아낌, 심심하면 새로운 것)과 행동(심심하면 나감, 슬프면 친구)에 영향, 말로도 드러남
//   목표: 처지·성격에 맞는 인생 목표 하나(취직·내 집 마련·여행·연애·승진·건강) → 돈 쓰는 법·하루 계획이 달라지고, 이루면 기뻐하고 다음 목표로
//   하루 계획: 아침에 오늘 할 일을 세움(친구와 저녁 약속·주말 등산·장보기·운동·공부·면접·병원), 날씨를 보고 바꾸기도 함
//         → 그 시각이 되면 계획을 지키려 하고, 지키면 뿌듯, 못 지키면 아쉬움. 약속은 두 사람 모두에게 들어가고, 깨면 상대가 서운해함
const { hash, DAY } = require('../world.js');

// ----- 감정 -----
const EMO = ['joy', 'anger', 'sad', 'fear', 'bored'];
// 감정이 생김: 크기 × 그 사람의 예민함(신경성), 이유(말 줄기: "…거든요"로 이어짐)
function feel(n, k, v, why) {
  n.emo ||= {}; n.emoWhy ||= {};
  const sens = k === 'joy' ? 0.8 + n.tr.e * 0.4 : 0.6 + n.tr.n * 0.8;
  n.emo[k] = Math.min(100, (n.emo[k] || 0) + v * sens);
  if (why) n.emoWhy[k] = why;
}
// 다 하고 난 뒤에 오는 감정 (먹으러·만나러 가는 길에는 아직 '먹었다'고 하지 않게 다음 시간에 생김)
function savor(n, min, k, v, why) { n.later = [...(n.later || []), [min, k, v, why]].slice(-4); }
const top = n => { let b = null; for (const k of EMO) if ((n.emo?.[k] || 0) > 22 && (!b || n.emo[k] > n.emo[b])) b = k; return b; };
// 기억 → 감정 (어디서 생긴 기억이든: 취직·실직·승진·결혼·출생·이별·작은 일상)
function appraise(n) {
  const m = n.mem[0];
  if (!m || n.memSeen === m.d + m.t) return;
  n.memSeen = m.d + m.t;
  const stem = m.t.replace(/다!?$/, '');
  if (m.w >= 6) feel(n, 'joy', m.w * 1.6, stem);
  else if (m.w <= -15) { feel(n, 'sad', -m.w * 1.4, stem); if (/잃었|그만뒀/.test(m.t)) feel(n, 'fear', 25, stem); }
  else if (m.w <= -4) feel(n, /깨졌|놓쳤|늦|쏟|잃어버/.test(m.t) ? 'anger' : 'sad', -m.w * 2, stem);
}
// 한 시간: 감정이 가라앉고, 지금 처지가 새 감정을 만듦
function hourFeel(ctx, n, act, asleep) {
  appraise(n);
  if (n.later) { for (const [t, k, v, why] of n.later) if (t < ctx.min - 30) feel(n, k, v, why); n.later = n.later.filter(([t]) => t >= ctx.min - 30); if (!n.later.length) delete n.later; }
  for (const k of EMO) if (n.emo?.[k]) { n.emo[k] *= asleep ? 0.75 : 0.9; if (n.emo[k] < 3) { delete n.emo[k]; delete n.emoWhy[k]; } }
  if (asleep) return;
  n.homeH = act === 'home' ? (n.homeH || 0) + 1 : 0;
  if (n.homeH > 3 && n.need.fun < 45) feel(n, 'bored', 7, '하루 종일 집에만 있었');
  if (n.wet > 55) feel(n, 'anger', 8, '비를 쫄딱 맞았');
  if (n.stress > 75) feel(n, 'anger', 3, '일이 너무 많');
  if (n.occ === 'jobless' && ctx.day - (n.joblessSince ?? ctx.day) > 14) feel(n, 'fear', 1.5, '일자리를 아직 못 구했');
  if (n.need.food < 12) feel(n, 'anger', 4, '배가 너무 고팠');
}
// 감정이 판단에 주는 무게 (brain.weigh·행동 점수에서 씀)
const emo = (n, k) => n.emo?.[k] || 0;
// 기분 목표에 더할 값
const moodPull = n => (emo(n, 'joy') - emo(n, 'anger') - emo(n, 'sad') - emo(n, 'fear')) * 0.25 - emo(n, 'bored') * 0.1;
// 말로
function feelLine(n) {
  const k = top(n);
  if (!k) return null;
  const w = n.emoWhy?.[k], why = w ? ` ${w}거든요.` : '';
  return { joy: `오늘 기분 진짜 좋아요!${why}`, anger: `아, 오늘 좀 짜증 나요.${why}`, sad: `오늘은 좀 울적해요…${why}`, fear: `요즘 걱정이 많아요.${why}`, bored: '요즘 너무 심심해요. 뭔가 새로운 걸 해 보고 싶어요.' }[k];
}

// ----- 인생 목표 -----
const TRIP = ['늘봄', '새벽곶', '노을섬', '별하항'];
function pickGoal(ctx, n, age, bal) {
  const T = n.tr, r = k => hash(n.id, Math.floor(ctx.day / 30), 970 + k), c = [];
  if (n.occ === 'jobless' && age < 62) return { k: 'job' };
  if (age >= 27 && age <= 52 && !n.house) c.push(['house', 0.6 + T.c]);
  if (bal > 600000 && age >= 20) c.push(['travel', 0.3 + T.o]);
  if (!n.spouse && age >= 24 && age <= 42) c.push(['love', 0.4 + T.e]);
  if (n.emp && n.skill < 0.75 && age < 58) c.push(['promotion', 0.3 + T.c * 0.8]);
  if (age >= 45 || T.c > 0.75) c.push(['health', 0.3 + (age >= 60 ? 0.8 : 0)]);
  if (!c.length) return null;
  let x = r(1) * c.reduce((a, g) => a + g[1], 0), k = c[0][0];
  for (const [g, w] of c) if ((x -= w) < 0) { k = g; break; }
  if (k === 'house') return { k, target: Math.round(bal + 6000000 + r(2) * 6000000), since: ctx.day };
  if (k === 'travel') return { k, target: Math.round(bal + 500000 + r(2) * 900000), place: TRIP[Math.floor(r(3) * TRIP.length)], since: ctx.day };
  return { k, since: ctx.day };
}
// 매일: 목표가 없으면 세우고, 이뤘으면 기뻐하고, 너무 오래 안 되면 내려놓음
function reviewGoal(ctx, n, age, remember, pay) {
  const bal = ctx.ledger.bal('p:' + n.id), g = n.goal;
  if (age < 19) { n.goal = null; return; }
  if (g) {
    let done = null;
    if (g.k === 'job' && n.emp) done = '드디어 취직에 성공했다';
    if (g.k === 'love' && n.spouse) done = '좋은 사람을 만나 결혼까지 했다';
    if (g.k === 'promotion' && n.promoted > g.since) done = '목표였던 승진을 해냈다';
    if (g.k === 'house' && bal >= g.target) { if (pay(Math.round(g.target * 0.6), 'ext'))   // 계약금 (부동산 모듈이 생기면 그쪽으로)
 { n.house = true; done = '드디어 내 집 계약금을 모아서 집을 샀다'; } }
    if (g.k === 'travel' && bal >= g.target) { const cost = Math.round(400000 + hash(n.id, ctx.day, 977) * 700000), inn = Object.values(ctx.S.work.emps).find(e => e.region === g.place && (e.occ === 'hotel' || e.occ === 'cook')); if (pay(Math.min(cost, bal - 100000), inn ? 'e:' + inn.id : 'ext')) { n.trip = { until: ctx.day + 2, place: g.place }; done = `${g.place}로 여행을 떠났다`; } }
    if (g.k === 'health' && ctx.day - g.since > 60 && n.health > 85) done = '꾸준히 운동해서 몸이 확실히 좋아졌다';
    if (done) { remember(n, ctx.day, done, 25); n.goal = null; return; }
    if (ctx.day - g.since > 150 && hash(ctx.day, n.id, 975) < 0.02 && g.k !== 'job') { remember(n, ctx.day, `${GOAL_NAME[g.k]} 목표는 잠시 미뤄 두기로 했다`, -5); n.goal = null; }
    if (g.k === 'job' && !n.emp) return;
    if (g.k === 'job' && n.emp) n.goal = null;
    return;
  }
  if (hash(ctx.day, n.id, 976) < 0.15) n.goal = pickGoal(ctx, n, age, bal);   // 목표는 며칠에 걸쳐 천천히 생김
}
const GOAL_NAME = { job: '취직', house: '내 집 마련', travel: '여행', love: '연애', promotion: '승진', health: '건강' };
// 목표가 돈 쓰는 법에 주는 무게 (아끼는 정도에 곱함)
const thrift = n => (n.goal?.k === 'house' ? 1.6 : n.goal?.k === 'travel' ? 1.3 : 1) * (1 + emo(n, 'fear') / 80);
function goalLine(n, bal) {
  const g = n.goal;
  if (!g) return null;
  const pct = g.target ? Math.max(1, Math.min(99, Math.round(bal / g.target * 100))) : 0;
  return {
    job: '요즘 취직 준비 중이에요. 이번엔 꼭 붙고 싶어요.',
    house: `내 집 마련하려고 아끼는 중이에요. 목표의 ${pct}%쯤 모았어요.`,
    travel: `돈 모아서 ${g.place}로 여행 가려고요. 지금 ${pct}%쯤 모았어요.`,
    love: '좋은 사람 만나고 싶어요. 그래서 요즘 사람 많은 데 자주 나가요.',
    promotion: '승진하고 싶어서 퇴근하고 공부하고 있어요.',
    health: '건강 챙기려고 요즘 꾸준히 운동해요.',
  }[g.k];
}

// ----- 하루 계획 -----
// 계획 하나: { k, h(시각), act(할 행동), label(말·머리 위), food(먹을 것 아이디), with(같이 하는 사람), out(바깥), done, missed, cancel }
const sameDay = (n, day) => n.plan?.day === day ? n.plan : (n.plan = { day, items: [] });
function addItem(n, day, it) { const p = sameDay(n, day); if (!p.items.some(x => x.h === it.h)) p.items.push(it); }
// 아침(그날 처음 깼을 때) 한 번: 오늘 할 일을 세움. P = 사람 목록, se = 감각, job = 직업
function makePlan(ctx, n, se, age, job, P, workday) {
  const day = ctx.day, p = sameDay(n, day), T = n.tr, r = k => hash(day, n.id, 980 + k), weekend = se.wd >= 5;
  if (p.made || age < 15) return;
  p.made = true;
  const free = job && workday ? Math.max(job.to, 17) : 10;   // 일 끝나는 시각 (쉬는 날은 아침부터)
  // 친구와 약속: 금요일·주말·외로울 때·연애 목표·심심할 때 더 자주
  const want = 0.03 + T.e * 0.1 + (se.wd === 4 || weekend ? 0.08 : 0) + (n.goal?.k === 'love' ? 0.08 : 0) + emo(n, 'bored') / 300 + (n.need.social < 40 ? 0.05 : 0);   // 둘 다에게 들어가므로 실제로는 두 배쯤
  const friends = Object.entries(n.friends).sort((a, b) => b[1] - a[1]).map(([id]) => P[id]).filter(f => f && f.region === n.region && !(f.plan?.day === day && f.plan.items.some(x => x.with)));   // 같은 동네, 오늘 아직 약속 없는 친구
  if (r(1) < want && friends.length && age >= 17) {
    const f = friends[Math.floor(r(2) * Math.min(3, friends.length))], h = weekend && r(3) < 0.4 ? 12 : Math.min(21, free + 1);
    const food = h >= 17 && (se.wd >= 4) && r(4) < 0.5 ? 'bbq' : r(5) < 0.35 ? 'dessert' : r(6) < 0.5 ? 'bunsik' : 'gukbap';
    const label = { bbq: '고기 먹기', dessert: '카페 가기', bunsik: '떡볶이 먹기', gukbap: '밥 먹기' }[food];
    const act = food === 'dessert' ? 'cafe' : 'eatOut';
    addItem(n, day, { k: 'meet', h, act, food, label, with: f.id, withName: f.name, out: true });
    addItem(f, day, { k: 'meet', h, act, food, label, with: n.id, withName: n.name, out: true });
  }
  // 주말 나들이 (날씨를 보고 바꿈)
  if (weekend && r(7) < 0.2 + T.o * 0.3) {
    const hike = age >= 30 && age < 72 && r(8) < 0.5;
    if ((se.rain || se.snow) && selfRain(n) > 0.35) addItem(n, day, { k: 'movie', h: 14, act: 'home', label: '집에서 영화 보기', changed: hike ? '등산' : '공원 나들이' });
    else addItem(n, day, { k: hike ? 'hike' : 'park', h: 10, act: 'walk', label: hike ? '등산' : '공원 나들이', out: true });
  }
  if (n.groceries < 4) addItem(n, day, { k: 'shop', h: Math.min(20, free), act: 'shop', label: '장 보기', out: true });
  if (n.goal?.k === 'health') addItem(n, day, { k: 'exercise', h: T.c > 0.6 ? 6 : 20, act: 'walk', label: '운동', out: true });
  if (n.goal?.k === 'promotion' && !weekend) addItem(n, day, { k: 'study', h: 21, act: 'study', label: '공부' });
  if (n.goal?.k === 'job' && !weekend) addItem(n, day, { k: 'interview', h: 10, act: 'jobhunt', label: '면접', out: true });
  if (n.health < 55) addItem(n, day, { k: 'clinic', h: 10, act: 'hospital', label: '병원 가기', out: true });
}
const selfRain = n => hash(n.id, 900, 10);   // brain.selfOf(n).rainHate와 같은 값
// 지금 시각의 계획 (지난 계획은 놓친 것으로 → 아쉬움, 약속이면 상대가 서운함)
function planNow(ctx, n, h, P, remember) {
  const p = n.plan;
  if (!p || p.day !== ctx.day) return null;
  let now = null;
  for (const it of p.items) {
    if (it.done || it.missed) continue;
    if (h > it.h + 1) {
      it.missed = true;
      feel(n, 'sad', it.with ? 18 : 8, `${it.label}${it.with ? ' 약속' : ''}을 못 지켰`);
      const f = it.with && P[it.with];
      if (f) { const fi = f.plan?.day === ctx.day && f.plan.items.find(x => x.with === n.id); if (fi?.done) { feel(f, 'anger', 25, `${n.name}님이 약속을 안 지켰`); f.friends[n.id] = Math.max(0, (f.friends[n.id] || 0) - 12); remember(f, ctx.day, `${n.name}님이 약속을 어겼다`, -6); } }
      continue;
    }
    if (h >= it.h && !now) now = it;
  }
  return now;
}
// 계획한 걸 했으면
function planDone(ctx, n, it, remember) {
  it.done = true;
  if (it.with) { savor(n, ctx.min, 'joy', 24, `${it.withName}님이랑 ${it.label.replace(/ 먹기| 가기/, '')} ${it.food === 'dessert' ? '갔' : '먹었'}`); n.friends[it.with] = Math.min(100, (n.friends[it.with] || 0) + 6); n.need.social += 25; }
  else if (it.k === 'hike' || it.k === 'park') { feel(n, 'joy', 10, `${it.label} 다녀왔`); n.need.fun += 25; }
  else if (it.k === 'exercise') { n.health = Math.min(100, n.health + 1.5); feel(n, 'joy', 4, '운동하고 나니 개운하'); }
  else if (it.k === 'movie') { n.need.fun += 20; }
}
// 계획을 말로: 지금 하는 것 / 오늘 남은 것 / 못 한 것
function planLine(n, h, day) {
  const p = n.plan;
  if (!p || p.day !== day) return null;
  const doing = p.items.find(it => it.done && it.with && n.act === it.act && (it.h === h || it.h === h - 1));
  if (doing) return `오늘 ${doing.withName}님이랑 ${doing.label}로 해서 나왔어요!`;
  const was = p.items.filter(it => it.done && it.with).pop();
  if (was && h - was.h <= 4) return `아까 ${was.withName}님이랑 ${was.label.replace(/ 먹기$/, '').replace(/ 가기$/, '')} ${was.food === 'dessert' ? '갔다 왔어요' : '먹었어요'}. 즐거웠어요!`;
  const next = p.items.filter(it => !it.done && !it.missed && it.h > h).sort((a, b) => a.h - b.h)[0];
  if (next) {
    const when = hourText(next.h);
    return next.with ? `오늘 ${when}에 ${next.withName}님이랑 ${next.label}로 했어요.` : next.changed ? `원래 ${next.changed} 가려고 했는데, 날씨 때문에 ${next.label}로 했어요.` : `오늘 ${when}에 ${next.label} 하려고요.`;
  }
  const miss = p.items.find(it => it.missed);
  if (miss) return miss.with ? `원래 ${miss.withName}님이랑 약속이 있었는데 못 갔어요… 미안하네요.` : `원래 ${miss.label} 하려고 했는데 못 했어요.`;
  return null;
}
const hourText = h => h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : h < 18 ? `오후 ${h - 12}시` : `저녁 ${h - 12}시`;
// 거리에서 보일 때 (머리 위)
function planLabel(n, h, day) {
  const it = n.plan?.day === day && n.plan.items.find(x => x.done && (x.h === h || x.h === h - 1) && x.act === n.act);   // 지금도 그 일을 하는 중일 때만
  if (!it) return null;
  return it.with ? `${it.withName}님 만나러 가는 중` : { hike: '등산 가는 중', park: '공원 나들이 가는 중', exercise: '운동하는 중', interview: '면접 보러 가는 중', clinic: '병원 가는 중' }[it.k] || null;
}

module.exports = { feel, savor, hourFeel, emo, moodPull, feelLine, reviewGoal, thrift, goalLine, makePlan, planNow, planDone, planLine, planLabel, GOAL_NAME, EMO };
