'use strict';
// ===== 사람 모듈: 인구 · 자율 행동 · 삶의 사건 · 대화 =====
// 사람마다: 이름·나이·사는 지역·직업과 일터·성격(5가지)·욕구(배고픔·기운·사람·재미)·기분·건강·스트레스·가족·친구·기억
// 행동: 게임 1시간마다 할 수 있는 일들의 점수를 매겨 가장 높은 것을 함(효용 AI)
//   점수 = 욕구가 얼마나 급한지 × 성격 + 시간대(밤엔 잠) + 의무(근무 시간) + 날씨(비 오면 밖에 안 나감) + 사람마다 작은 차이
//   → 정해진 대본 없이도 출근·점심·퇴근 후 카페·주말 산책·병원·구직 같은 하루가 저절로 생김
// 계산 나누기: 사람 번호로 60분에 고르게 나눠 매 분 1/60만 계산(한 시간에 한 번씩 모두) → 인구가 늘어도 부하가 고름
// 무너짐 방지: 욕구·기분·스트레스는 0~100 범위 + 기분은 천천히 따라감(급변 없음), 출생률은 목표 인구 쪽으로 당김, 매일 검사로 끊긴 관계·NaN을 고침
const { DAY, weatherOf } = require('../world.js');
const { REGIONS, OCC, SURNAMES, GIVEN1, GIVEN2, MICRO } = require('./data.js');
const { makeTalk } = require('./talk.js');
const brain = require('./brain.js');
const mind = require('./mind.js');
const belief = require('./belief.js');   // 믿음·소문·투자
const { marketOpen } = require('../world.js');     // 마음: 감정·인생 목표·하루 계획(약속)   // 뇌: 먹을 것 고르기·날씨 반응·성향 (모든 판단을 한 구조로)

const OUTDOOR = new Set(['commute', 'walk', 'market', 'jobhunt', 'shop', 'cafe', 'eatOut', 'visit']);   // 맵에 걸어 다니는 모습으로 보이는 행동 (가게·카페·식당·친구 집은 '가는 중'으로)
// 거리에서 보일 때의 이름 (가게 안이 아니라 가는 길이므로)
const OUT_WORK = new Set(['street', 'site', 'field', 'sea', 'port', 'market', 'forest']);   // 바깥에서 하는 일 (비 맞음)
const STREET_NAME = { shop: '장 보러 가는 중', cafe: '카페 가는 중', eatOut: '밥 먹으러 가는 중', visit: '친구 만나러 가는 중', walk: '산책하는 중' };
const ACT_NAME = {
  sleep: '자는 중', work: '일하는 중', school: '학교에서 공부 중', eatHome: '집에서 밥 먹는 중', eatOut: '식당에서 밥 먹는 중', cafe: '카페에서 쉬는 중',
  walk: '산책하는 중', shop: '마트에서 장 보는 중', market: '시장 구경하는 중', visit: '친구 집에 놀러 간 중', hospital: '병원에 간 중',
  jobhunt: '일자리 찾는 중', home: '집에서 쉬는 중', commute: '오가는 중', study: '공부하는 중', trip: '여행 중',
};
const actName = (act, min) => act === 'commute' ? (min % DAY < 720 ? '출근하는 중' : '퇴근하는 중') : ACT_NAME[act];
const ageOf = (n, day) => Math.floor((day - n.born) / 365);
const hashOut = (n, min) => (n.id + Math.floor(min / 60)) % 3 === 0;   // 집에서 먹으려는 사람 셋 중 하나는 아직 집에 가는 길 (거리에 보임)
const acct = id => 'p:' + id;
// 받침에 맞는 조사
const jong = s => { const c = s.charCodeAt(s.length - 1) - 0xac00; return c >= 0 && c <= 11171 ? c % 28 : 0; };

const COLORS = ['#f7f7f7', '#fff4dc', '#f3efe6', '#e8eef5', '#f7efe0', '#f5e6ea', '#e9f3e6', '#efe9f7'];
const HAT = { fisher: '#2f6fc6', farmer: '#c9951c', builder: '#f2a03d', factory: '#3d7fd6', docker: '#e8454b', vendor: '#7a4a2a', student: '#5dbb4a' };

function createPeople() {
  let meet = new Map();   // 이번 시간에 사람을 만나러 나온 사람들 (지역 → 번호들), 시간마다 비움
  let slots = null;       // 분(0~59) → 그 분에 계산할 사람 번호들

  function makeName(ctx, seed) {
    const r = k => ctx.rnd(seed, 7, k);
    return SURNAMES[Math.floor(r(1) * SURNAMES.length)] + GIVEN1[Math.floor(r(2) * GIVEN1.length)] + GIVEN2[Math.floor(r(3) * GIVEN2.length)];
  }
  function newPerson(ctx, P, region, ageDays, extra = {}) {
    const id = P.next++, r = k => ctx.rnd(id, 11, k);
    const n = {
      id, name: makeName(ctx, id), born: ctx.day - ageDays, region, occ: 'child', emp: null, wage: 0, since: ctx.day, skill: r(1) * 0.6,
      tr: { o: r(2), c: r(3), e: r(4), a: r(5), n: r(6) }, need: { food: 70, energy: 70, social: 60, fun: 60, sweet: 70, caffeine: 70 },
      mood: 10, health: 90, stress: 20, act: 'home', spouse: null, kids: [], parents: [], friends: {}, mem: [], groceries: 6, joblessSince: null, worked: 0,
      look: { color: COLORS[id % COLORS.length] }, ...extra,
    };
    P.list[id] = n;
    ctx.ledger.open(acct(id));
    return n;
  }
  const remember = (n, day, text, w) => { n.mem.unshift({ d: day, t: text, w }); n.mem.length = Math.min(n.mem.length, 6); };
  // 나이에 맞는 처지(아이·학생·구직·은퇴)로 바꿈. 일 있는 어른은 그대로
  function lifeStage(n, day) {
    const a = ageOf(n, day);
    if (a < 7) n.occ = 'child';
    else if (a < 19) n.occ = 'student';
    else if (a >= 65 && n.occ !== 'retired') { n.occ = 'retired'; n.emp = null; n.wage = 0; }
    else if (n.occ === 'child' || n.occ === 'student') { n.occ = 'jobless'; n.joblessSince = day; }
    n.look.hat = HAT[n.occ] ? { shape: 'cap', color: HAT[n.occ] } : null;
  }

  // ----- 한 사람의 한 시간 -----
  function hourOf(ctx, n) {
    const h = Math.floor(ctx.t / 60), wd = ((ctx.day % 7) + 7) % 7, weekend = wd >= 5, wx = weatherOf(ctx.day), wet = ['rain', 'storm', 'snow'].includes(wx);
    const job = OCC[n.occ], N = n.need, T = n.tr, asleep = n.act === 'sleep';
    const se = brain.senseOf(ctx), me = brain.selfOf(n);   // 감각(날씨·기온·시각) · 개성
    brain.packUmbrella(ctx, n, se);
    N.sweet ??= 70; N.caffeine ??= 70;
    // 욕구가 시간이 지나며 줄어듦 (사람마다 빠르기가 다름: 먹는 양·단것·커피)
    N.food -= (asleep ? 2 : 7.5) * me.appetite; N.energy += asleep ? 13 : -4.5; N.social -= 2.5; N.fun -= 2.5;
    N.sweet -= asleep ? 0.5 : 1 + me.sweet * 2.2 + n.stress * 0.02;   // 스트레스 받으면 단 게 당김
    N.caffeine -= asleep ? 1 : me.coffee * (h < 11 ? 11 : 6);       // 커피 좋아하는 사람은 아침에 특히
    const R = (k, s = 8) => ctx.rnd(ctx.min, n.id, k) * s;   // 사람마다·시간마다 다른 작은 차이
    const age = ageOf(n, ctx.day);
    const dawn = h >= 5 && h < 7 && (n.occ === 'retired' || T.c > 0.7);              // 새벽 산책·운동: 어르신과 부지런한 사람
    const night = h >= 21 && h < 24 && age >= 19 && age < 40 && T.e > 0.6;              // 밤에도 밖에 있는 젊고 활발한 사람
    const workday = job && (!weekend || job.weekend && (n.id + ctx.day) % 7 < 5);   // 오늘 일하는 날인지
    const shift = job && (!weekend || job.weekend && (n.id + ctx.day) % 7 < 5) && h >= job.from && h < job.to;
    const blocked = job?.weather?.includes(wx);                                           // 날씨 때문에 일 못 하는 날 (어부·건설 등)
    const out = brain.outdoorCost(n, se);                                                  // 바깥 나가는 부담
    let food = brain.chooseFood(ctx, n, se, age);                                           // 먹을 것 (뇌가 따져 봄)
    const P = ctx.S.people.list;
    if (h >= 6) mind.makePlan(ctx, n, se, age, job, P, workday);                             // 아침에 오늘 할 일을 세움 (한 번)
    let plan = mind.planNow(ctx, n, h, P, remember);                                        // 지금 할 차례인 계획
    if (plan && plan.out && !plan.with && plan.k !== 'shop' && (se.rain || se.snow) && me.rainHate > 0.35) { plan.missed = true; mind.feel(n, 'sad', 12, `비 때문에 ${plan.label} 못 갔`); plan = null; }   // 비 오면 나들이는 접음
    if (plan?.food) { const o = brain.FOODS.find(f => f.id === plan.food); if (o && ctx.ledger.bal('p:' + n.id) >= o.price) food = { o, u: 170, parts: {} }; }   // 약속한 메뉴
    const E = k => mind.emo(n, k);
    const score = {
      sleep: (h >= 23 || h < 5 ? 95 : h < 6 ? 55 : h < 7 ? 38 : h < 8 ? 20 : 0) + (100 - N.energy) * 0.7 - (N.energy > 92 ? 40 : 0) + R(1),   // 밤엔 잠이 끈질김 → 보통 6~7시에 일어남
      work: shift && !blocked && n.health > 35 ? 92 + T.c * 20 + R(2) - (h === 12 && job.to - job.from >= 7 ? 70 : 0) : -1,   // 12시는 점심시간
      school: n.occ === 'student' && !weekend && h >= 8 && h < 16 ? 95 : -1,
      eat: food ? food.u : -1,   // 먹고 마시기: 뇌가 고른 가장 나은 선택지의 점수 (집밥·라면·배달·국밥·떡볶이·고기·편의점·디저트·커피)
      cafe: (100 - N.social) * 0.55 + T.e * 22 + (h >= 10 && h < 21 ? 10 : night ? 0 : -80) - out + R(5),
      walk: (100 - N.fun) * 0.55 + T.o * 14 + (h >= 7 && h < 21 ? 12 : dawn ? 22 : night ? 4 : -80) + (weekend ? 12 : 0) - out * 1.6 + R(6),   // 산책은 날씨를 가장 많이 탐
      visit: (100 - N.social) * 0.6 + T.a * 15 + (h >= 18 && h < 22 || weekend && h >= 11 && h < 22 ? 10 : -60) - (Object.keys(n.friends).length ? 0 : 200) - out * 0.7 + R(7),
      shop: n.groceries < 3 && h >= 10 && h < 21 ? 55 - out * 0.4 + R(8) : -1,
      market: h >= 8 && h < 18 && ctx.rnd(ctx.day, n.id, 9) < 0.15 ? 40 + (100 - N.fun) * 0.3 - out + R(9) : -1,
      hospital: n.health < 40 && h >= 9 && h < 18 ? 120 : -1,
      commute: workday && !blocked && n.health > 35 && job.place !== 'street' && (h === (job.from + 23) % 24 ? 96 : h === job.to ? 62 + T.c * 10 : -1),
      jobhunt: n.occ === 'jobless' && !weekend && h >= 9 && h < 17 ? 50 + n.stress * 0.3 + T.c * 10 + R(10) : -1,
      home: 30 + (100 - N.fun) * 0.2 + T.n * 8 + R(11) + E('sad') * 0.2 * (1 - T.e) - E('bored') * 0.3,
      study: -1, trip: -1,
    };
    // 감정이 행동에 주는 무게: 심심하면 나감, 화나면 걸으며 식힘, 슬프면 (활발한 사람은) 친구를 찾음
    score.walk += E('bored') * 0.35 + E('anger') * 0.2; score.cafe += E('bored') * 0.3; score.visit += E('sad') * 0.3 * T.e + E('bored') * 0.2;
    if (n.goal?.k === 'job') score.jobhunt += 15;
    if (plan && !plan.food) score[plan.act] = Math.max(score[plan.act] ?? -1, 0) + 85;   // 계획한 일을 하려 함
    if (plan?.food && food?.u === 170) score.eat = 170;
    if (n.occ === 'child') { score.work = score.jobhunt = score.school = -1; score.cafe -= 60; }
    let act = 'home', best = -Infinity;
    for (const [k, v] of Object.entries(score)) if (v > best) { best = v; act = k; }
    if (n.trip) { if (ctx.day >= n.trip.until) { remember(n, ctx.day, `${n.trip.place} 여행에서 돌아왔다`, 12); n.trip = null; } else act = h >= 7 && h < 23 ? 'trip' : 'sleep'; }
    // 먹기: 고른 것을 실제로 함(돈 내고 먹음) + 왜 그랬는지 생각을 남김 (말 걸면 그대로 말함)
    n.dish = null;
    if (act === 'eat') {
      if (brain.consume(ctx, n, food.o)) { act = food.o.act; n.dish = food.o.id; n.thought = { min: ctx.min, act, id: food.o.id, dish: brain.dishName(food.o, se.temp), why: plan?.food === food.o.id ? [`${plan.withName}님이랑 약속이 있어서요`] : brain.reasonOf(n, food, se) };
        if (food.parts.taste > 6 || food.parts.sweet > 25 || food.parts.warm > 8 || food.parts.cool > 6) mind.savor(n, ctx.min, 'joy', 14, `${n.thought.dish} 먹었`);   // 먹고 싶던 걸 먹으면 기분 좋음
      }
      else act = 'home';
    }
    n.act = act;
    applyAct(ctx, n, act, job, h);
    brain.weatherBody(ctx, n, se, OUTDOOR.has(act) || act === 'work' && OUT_WORK.has(job?.place), remember);   // 비·눈·추위에 몸이 반응
    if (plan && n.act === plan.act) mind.planDone(ctx, n, plan, remember);                 // 계획을 지킴
    if (n.act === 'work') { belief.learn(ctx, n); belief.scoop(ctx, n); }                 // 일하면서 회사 일을 알게 됨 / 기자는 퍼진 소문을 기사로
    if (plan?.with && plan.done) { belief.share(ctx, n, P[plan.with]); belief.share(ctx, P[plan.with], n); }   // 약속 자리에서 수다
    if (h === 21 && n.act === 'home' && P[n.spouse]?.act === 'home') belief.share(ctx, n, P[n.spouse]);        // 저녁에 집에서 배우자에게
    if (h === 9 + n.id % 6 && marketOpen(ctx.min)) belief.invest(ctx, n, age, remember);   // 하루 한 번 휴대폰으로 주식 확인
    mind.hourFeel(ctx, n, n.act, n.act === 'sleep');                                        // 감정: 가라앉고, 지금 처지로 새로 생김
    // 일 끝나는 시각: 하루 품삯 (그날 반 넘게 일했으면)
    if (job && h === job.to - 1 && n.worked >= (job.to - job.from) / 2) payday(ctx, n, job);
    if (h === 0) n.worked = 0;
    for (const k in N) N[k] = ctx.clamp(N[k], 0, 100, 60);
    // 기분: 욕구·스트레스·건강·최근 기억·지역 분위기가 정한 목표로 천천히 다가감 (갑자기 바뀌지 않음)
    const memW = n.mem.reduce((a, m) => a + m.w * Math.max(0, 1 - (ctx.day - m.d) / 7), 0);
    const target = (N.food + N.energy + N.social + N.fun) / 4 - 50 - n.stress * 0.3 + (n.health - 70) * 0.3 + memW + (ctx.S.events?.mood?.[n.region] || 0) + mind.moodPull(n);
    n.mood = ctx.clamp(n.mood * 0.8 + target * 0.2, -100, 100, 0);
    n.stress = ctx.clamp(n.stress, 0, 100, 20);
  }
  function applyAct(ctx, n, act, job, h) {
    const N = n.need, pay = (amount, to) => ctx.ledger.move(acct(n.id), to, amount);
    if (act === 'commute') { N.energy -= 1; }
    if (act === 'work') { n.worked++; n.stress += job.to - job.from > 9 ? 2 : 1; N.fun -= 1.5; N.energy -= 1.5; }
    if (act === 'school') { N.social += 6; N.fun -= 1; }
    if (act === 'cafe' && n.dish) meetSomeone(ctx, n);   // 디저트·커피 (돈·욕구는 뇌의 consume에서)
    if (act === 'cafe' && !n.dish) { if (pay(5000, ctx.S.work.local?.[n.region]?.cafe || 'ext')) { N.social += 22; N.fun += 10; N.caffeine += 40; meetSomeone(ctx, n); } }   // 사람 만나러 카페
    if (act === 'walk') { N.fun += 22; n.stress -= 3; if (ctx.rnd(ctx.min, n.id, 21) < 0.3) meetSomeone(ctx, n); }
    if (act === 'visit') { N.social += 30; N.fun += 10; n.stress -= 2; meetSomeone(ctx, n, true); }
    if (act === 'market') { N.fun += 12; if (pay(8000, ctx.S.work.local?.[n.region]?.market || 'ext')) n.groceries += 2; }
    if (act === 'shop') { if (pay(30000, ctx.S.work.local?.[n.region]?.mart || 'ext')) n.groceries += 12; }
    if (act === 'hospital') { if (pay(15000, ctx.S.work.local?.[n.region]?.hospital || 'gov')) n.health += 8; }
    if (act === 'jobhunt') { n.stress += 1; }
    if (act === 'study') { n.skill = Math.min(1, n.skill + 0.002); N.fun -= 2; n.stress += 0.5; }
    if (act === 'trip') { N.fun += 15; N.social += 5; n.stress -= 4; }
    if (act === 'home' || act === 'sleep') { n.stress -= 1.5; N.fun += act === 'home' ? 8 : 0; }
  }
  // 같은 시간·같은 지역에 사람을 만나러 나온 사람끼리 친해짐 (친구 10명까지, 가장 덜 친한 친구가 밀려남)
  function meetSomeone(ctx, n, friendsOnly) {
    const P = ctx.S.people, key = n.region, pool = meet.get(key) || [];
    let other = null;
    if (friendsOnly) { const ids = Object.keys(n.friends); other = P.list[ids[Math.floor(ctx.rnd(ctx.min, n.id, 31) * ids.length)]]; }
    else if (pool.length) other = P.list[pool[Math.floor(ctx.rnd(ctx.min, n.id, 32) * pool.length)]];
    if (!friendsOnly) { pool.push(n.id); meet.set(key, pool.slice(-30)); }
    if (!other || other.id === n.id) return;
    const gain = 3 + (n.tr.a + other.tr.a) * 3 + ctx.rnd(ctx.min, n.id, 33) * 3;
    for (const [a, b] of [[n, other], [other, n]]) {
      a.friends[b.id] = Math.min(100, (a.friends[b.id] || 0) + gain); a.need.social += 10;
      belief.share(ctx, a, b);   // 만나면 소문을 전함
      const ids = Object.keys(a.friends);
      if (ids.length > 10) delete a.friends[ids.reduce((x, y) => (a.friends[x] < a.friends[y] ? x : y))];
    }
  }
  function payday(ctx, n, job) {
    const emp = ctx.S.work.emps[n.emp];
    if (!emp) return;
    const gross = Math.round(n.wage), tax = Math.round(gross * (ctx.S.society?.tax ?? 0.1));
    if (ctx.ledger.move('e:' + emp.id, acct(n.id), gross)) { ctx.ledger.move(acct(n.id), 'gov', tax); n.skill = Math.min(1, n.skill + 0.002); }
    else { n.stress += 8; remember(n, ctx.day, '월급이 밀렸다', -8); emp.unpaid = (emp.unpaid || 0) + 1; }
  }

  // ----- 하루에 한 번: 나이·삶의 사건(작은 일·병·승진·결혼·출생·죽음·이사) -----
  function dayOf(ctx) {
    const P = ctx.S.people, day = ctx.day, list = Object.values(P.list), byRegion = {};
    const live = new Set(belief.liveIds());                                                  // 아직 발표 안 된 계획 (끝난 소문은 잊음)
    if (P.heard) for (const id of Object.keys(P.heard)) if (!live.has(+id)) delete P.heard[id];
    for (const n of list) (byRegion[n.region] ||= []).push(n);
    for (const n of list) {
      const r = k => ctx.rnd(day, n.id, 40 + k), age = ageOf(n, day);
      lifeStage(n, day);
      mind.reviewGoal(ctx, n, age, remember, (amount, to) => ctx.ledger.move(acct(n.id), to, amount));
      belief.daily(ctx, n, live);
      for (const id in n.friends) if (Number(id) !== n.spouse && (n.friends[id] -= 0.6) < 5) delete n.friends[id];   // 안 만나면 조금씩 멀어짐
      if ((day - n.born) % 365 === 0 && age > 0) remember(n, day, `${age}번째 생일이었다`, 8);
      n.health = ctx.clamp(n.health + (n.health < 100 ? 4 : 0), 0, 100, 80);
      if (r(1) < 0.0015 + n.stress / 100 * 0.004 + Math.max(0, age - 60) * 0.0002) { n.health -= 25 + r(2) * 20; remember(n, day, '몸살이 나서 앓아누웠다', -10); }
      if (r(3) < 0.06) { const [t, w] = MICRO[Math.floor(r(4) * MICRO.length)]; remember(n, day, t, w); ctx.emit({ type: 'micro', scale: 'micro', region: n.region }); }
      // 일: 오래 다니고 실력이 좋으면 승진, 너무 힘들면 그만둠
      if (OCC[n.occ] && day - n.since > 120 && n.skill > 0.7 && r(5) < 0.004 * (n.goal?.k === 'promotion' ? 2.5 : 1)) { n.wage = Math.round(n.wage * 1.08); n.since = day; n.promoted = day; remember(n, day, '승진했다!', 15); }
      if (OCC[n.occ] && n.stress > 85 && r(6) < 0.01) leaveJob(ctx, n, '일이 너무 힘들어서 회사를 그만뒀다', -10);
      else if (OCC[n.occ] && r(6) < 0.0012) leaveJob(ctx, n, '새로운 일을 해 보려고 회사를 그만뒀다', 2);   // 자연스러운 이직
      // 연금·실업급여 (정부 → 사람)
      if (n.occ === 'retired') ctx.ledger.move('gov', acct(n.id), 40000);
      if (n.occ === 'jobless' && day - (n.joblessSince ?? day) < 120) ctx.ledger.move('gov', acct(n.id), 30000);
      // 집세·생활비 (사람 → 바깥) : 어른만
      // 집세·생활비(사람 → 바깥) + 여윳돈의 0.4%는 쇼핑·여가로 동네 가게에 (돈이 많을수록 더 씀 → 저축이 끝없이 쌓이지 않음)
      if (age >= 19) {
        if (!ctx.ledger.move(acct(n.id), 'ext', 40000)) n.stress += 4;
        const spare = ctx.ledger.bal(acct(n.id)) - 1000000, loc = ctx.S.work.local?.[n.region];
        if (spare > 0) ctx.ledger.move(acct(n.id), loc?.mart || 'ext', spare * 0.004);
      }
      // 결혼: 서로 아주 친한 싱글 어른 둘 (같은 지역)
      if (!n.spouse && age >= 24 && age <= 45) for (const [fid, aff] of Object.entries(n.friends)) {
        const f = P.list[fid];
        if (aff >= 95 && f && !f.spouse && f.region === n.region && ageOf(f, day) >= 24 && r(7) < 0.002 * (n.goal?.k === 'love' ? 3 : 1)) {
          n.spouse = f.id; f.spouse = n.id; remember(n, day, `${f.name}님과 결혼했다`, 25); remember(f, day, `${n.name}님과 결혼했다`, 25);
          ctx.emit({ type: 'wedding', scale: 'micro', region: n.region }); break;
        }
      }
    }
    // 출생: 결혼한 부부(24~42세), 지역 인구가 목표보다 적으면 더 잘 태어나고 많으면 덜 (인구가 폭발하거나 사라지지 않게)
    for (const n of list) {
      const s = P.list[n.spouse];
      if (!s || n.id > s.id) continue;
      const a1 = ageOf(n, day), a2 = ageOf(s, day), pull = Math.min(3, Math.max(0.2, ((REGIONS[n.region]?.pop || 80) / Math.max(1, byRegion[n.region]?.length || 1)) ** 2));
      if (a1 >= 24 && a1 <= 42 && a2 >= 24 && a2 <= 42 && n.kids.length < 3 && ctx.rnd(day, n.id, 60) < 0.0011 * pull * (ctx.S.society?.birthBoost ?? 1)) {
        const baby = newPerson(ctx, P, n.region, 0, { parents: [n.id, s.id] });
        lifeStage(baby, day);
        n.kids.push(baby.id); s.kids.push(baby.id);
        const born = `아기 ${baby.name}${jong(baby.name) ? '이' : ''}가 태어났다`;
        remember(n, day, born, 30); remember(s, day, born, 30);
        ctx.emit({ type: 'birth', scale: 'micro', region: n.region });
      }
    }
    // 죽음: 나이가 많을수록 (곰페르츠 법칙: 해마다 위험이 약 9%씩 커짐) + 아주 아프면
    for (const n of list) {
      const age = ageOf(n, day), hazard = 0.0004 * Math.exp(0.09 * (age - 20)) / 365 + (n.health < 10 ? 0.01 : 0);
      if (ctx.rnd(day, n.id, 70) < hazard) die(ctx, n);
    }
  }
  function leaveJob(ctx, n, why, w) {
    remember(n, ctx.day, why, w);
    n.occ = 'jobless'; n.emp = null; n.wage = 0; n.joblessSince = ctx.day;
  }
  function die(ctx, n) {
    const P = ctx.S.people, heir = P.list[n.spouse] || n.kids.map(k => P.list[k]).find(Boolean);
    belief.liquidate(ctx, n);                                                                  // 가진 주식은 팔아서 돈으로
    ctx.ledger.close(acct(n.id), heir ? acct(heir.id) : 'gov');   // 남은 돈은 배우자·자녀에게 (없으면 나라)
    for (const id of [n.spouse, ...n.kids, ...n.parents]) { const f = P.list[id]; if (f) remember(f, ctx.day, `${n.name}님을 떠나보냈다`, -30); }
    if (P.list[n.spouse]) P.list[n.spouse].spouse = null;
    for (const o of Object.values(P.list)) { delete o.friends[n.id]; if (o.kids.includes(n.id)) o.kids = o.kids.filter(k => k !== n.id); }   // 관계 정리
    delete P.list[n.id];
    ctx.emit({ type: 'death', scale: 'micro', region: n.region });
  }

  // ----- 처음 세계: 지역마다 목표 인구만큼 (나이 분포는 한국과 비슷하게), 가족을 맺어 줌 -----
  function init(ctx) {
    const P = { next: 1, list: {} };
    for (const [region, R] of Object.entries(REGIONS)) {
      const made = [];
      for (let i = 0; i < R.pop; i++) {
        const u = ctx.rnd(P.next, 3, 1), age = u < 0.06 ? u / 0.06 * 7 : u < 0.18 ? 7 + (u - 0.06) / 0.12 * 12 : u < 0.82 ? 19 + (u - 0.18) / 0.64 * 46 : 65 + (u - 0.82) / 0.18 * 25;
        const n = newPerson(ctx, P, region, Math.floor(age * 365 + ctx.rnd(P.next, 3, 2) * 365));
        lifeStage(n, ctx.day);
        if (age >= 19) ctx.ledger.move('ext', acct(n.id), Math.round(300000 + ctx.rnd(n.id, 3, 3) * 3000000));   // 처음 저축
        made.push(n);
      }
      // 30~70세 어른의 절반쯤은 부부, 부부의 자식으로 아이·학생을 이어 줌
      const adults = made.filter(n => { const a = ageOf(n, ctx.day); return a >= 28 && a <= 70; }), young = made.filter(n => ageOf(n, ctx.day) < 19);
      for (let i = 0; i + 1 < adults.length; i += 2) if (ctx.rnd(adults[i].id, 5, 1) < 0.6) {
        const [a, b] = [adults[i], adults[i + 1]]; a.spouse = b.id; b.spouse = a.id; a.friends[b.id] = b.friends[a.id] = 95;
      }
      const couples = adults.filter(a => a.spouse && a.id < a.spouse);
      young.forEach((k, i) => { const p = couples[i % Math.max(1, couples.length)]; if (!p) return; const s = P.list[p.spouse]; k.parents = [p.id, s.id]; p.kids.push(k.id); s.kids.push(k.id); });
    }
    return P;
  }

  // ----- 매일 검사(자동 수리): 없는 사람을 가리키는 관계·한쪽만 맺은 부부·NaN 값 -----
  function check(ctx) {
    const P = ctx.S.people; let fixed = 0;
    for (const n of Object.values(P.list)) {
      if (n.spouse && P.list[n.spouse]?.spouse !== n.id) { n.spouse = null; fixed++; }
      for (const id of Object.keys(n.friends)) if (!P.list[id]) { delete n.friends[id]; fixed++; }
      const kids = n.kids.filter(id => P.list[id]); if (kids.length !== n.kids.length) { n.kids = kids; fixed++; }
      for (const k of ['mood', 'health', 'stress', 'skill', 'wage']) if (!Number.isFinite(n[k])) { n[k] = { mood: 0, health: 80, stress: 20, skill: 0.3, wage: 0 }[k]; fixed++; }
      for (const k in n.need) if (!Number.isFinite(n.need[k])) { n.need[k] = 60; fixed++; }
      if (!Number.isFinite(n.groceries) || n.groceries < 0) { n.groceries = 0; fixed++; }
    }
    return fixed;
  }

  return {
    name: 'people', every: 1, init, check,
    // 매 분: 번호를 60으로 나눈 나머지가 이번 분인 사람만 (한 시간에 모두 한 번)
    tick(ctx) {
      if (ctx.t % 60 === 0 || !slots) { meet = new Map(); slots = Array.from({ length: 60 }, () => []); for (const n of Object.values(ctx.S.people.list)) slots[n.id % 60].push(n.id); }   // 시간마다 60칸으로 나눠 둠
      for (const id of slots[ctx.t % 60]) { const n = ctx.S.people.list[id]; if (n) hourOf(ctx, n); }
    },
    daily: dayOf,
    coarse(ctx, days) { for (let i = 0; i < days; i++) dayOf({ ...ctx, day: ctx.day + i }); },
    // ----- 밖에서 보이는 사람들 (그 지역 맵에 걸어 다님) -----
    visible(S, region, min) {
      const day = Math.floor(min / DAY), wx = weatherOf(day), rainy = ['rain', 'storm', 'snow'].includes(wx);
      const label = n => {
        if (n.occ === 'reporter' && n.act === 'work') return '취재 중';
        if (rainy && n.wet > 45 && !n.umbToday) return '비 피해 뛰어가는 중';
        const pl = mind.planLabel(n, Math.floor((min % DAY) / 60), day);
        if (pl) return pl;
        const th = n.thought;
        if (n.dish && th?.act === n.act) return th.id === 'cvs' ? '편의점 가는 중' : n.act === 'eatHome' ? (th.id === 'delivery' ? '배달 시키러 집에 가는 중' : '집에 밥 먹으러 가는 중') : `${th.dish} ${th.id === 'coffee' ? '마시러' : '먹으러'} 가는 중`;
        return STREET_NAME[n.act] || actName(n.act, min);
      };
      return Object.values(S.people.list).filter(n => n.region === region && (OUTDOOR.has(n.act) || n.act === 'work' && (OCC[n.occ]?.place === 'market' || n.occ === 'reporter') || n.act === 'eatHome' && n.dish && hashOut(n, min))).slice(0, 60).map(n => ({
        id: n.id, name: n.name, age: ageOf(n, day), job: OCC[n.occ]?.name || { child: '어린이', student: '학생', retired: '은퇴', jobless: '구직 중' }[n.occ], act: label(n), umbrella: rainy && !!n.umbToday, run: rainy && n.wet > 45 && !n.umbToday, look: { body: 'blob', face: 'dot', suit: null, ...n.look },
      }));
    },
    // ----- 말 걸기: 지금 상태로 대사를 만듦 -----
    // ----- 말 걸기: talk.js가 그 사람의 지금 삶·말투로 대사를 만듦 -----
    talk(S, id, min, news, quote, who, rumors = [], bal = 0) {
      const n = S.people.list[id];
      if (!n) return null;
      const job = OCC[n.occ], emp = S.work.emps[n.emp];
      n.met ||= {};
      const met = n.met[who] || { times: 0, last: null };   // 이 사람(플레이어)을 만난 횟수·마지막 시각
      const lines = makeTalk({ S, n, min, age: ageOf(n, Math.floor(min / DAY)), empName: emp?.name, ageOf, news, quote, met, rumors, bal, doing: n.occ === 'reporter' && n.act === 'work' ? '취재 중' : STREET_NAME[n.act] || actName(n.act, min) });
      n.met[who] = { times: met.times + 1, last: Math.floor(min) };
      const keys = Object.keys(n.met);
      if (keys.length > 8) delete n.met[keys.reduce((a, b) => (n.met[a].last < n.met[b].last ? a : b))];   // 가장 오래전에 만난 사람부터 잊음
      return { name: n.name, job: job?.name, lines };
    },
    ageOf, OUTDOOR,
  };
}

module.exports = { createPeople, ageOf };
