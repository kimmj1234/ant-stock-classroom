'use strict';
// ===== 믿음 · 소문 · 투자 =====
// 믿음: 사람마다 "그 회사 일이 잘될까"에 대한 생각(v: -1 나쁨 ~ +1 좋음)과 확신(c), 누구에게 들었는지, 몇 다리 건넜는지
//   생김: 직원은 자기 회사 계획을, 기자는 취재로 여러 회사 계획을 직접 앎(사람마다 조금씩 다르게 느낌)
//   퍼짐: 사람을 만나면(카페·산책·약속·집에서 배우자) 가장 큰 소문을 전함. 수다스러운 사람일수록 잘 전하고, 전할 때마다 조금씩 부풀려지거나 바뀌며
//         확신은 줄어듦(친한 사람 말일수록 믿음). 같은 걸 여러 번 들으면 확신이 커짐. 기자는 많이 퍼진 소문을 기사로 씀
//   투자: 투자하는 사람(모험을 좋아할수록)은 믿음대로 사고팖 + 오르면 팔아 이익을 챙기고, 겁나면 손절, 오늘 크게 오른 종목은 덜컥 따라 삼
//         → 그 주문이 실제로 주가를 움직임(발표 전에 소문이 퍼지면 주가가 먼저 움직임). 돈은 장부(사람 ↔ 바깥)로 옮겨 다님
const { hash } = require('../world.js');
const brain = require('./brain.js');
const mind = require('./mind.js');

// 주식 시장과 잇기 (sim/index.js가 연결): 시세·주문·진행 중인 회사 계획
let M = { quote: () => null, order: () => {}, rumors: () => [], ipos: () => [] };
const connect = m => { M = { ...M, ...m }; };
const clamp = v => Math.max(-1, Math.min(1, v));

function believe(n, p, v, c, from, hops, day) {
  n.bel ||= {};
  const b = n.bel[p.id];
  if (b) {
    const w = c / (c + b.c);
    b.v = clamp(b.v * (1 - w) + v * w); b.c = Math.min(0.95, Math.max(b.c, c) + c * 0.15);   // 또 들으면 더 믿음
    if (hops < b.hops) { b.from = from; b.hops = hops; }
    return false;
  }
  n.bel[p.id] = { co: p.co, name: p.name, kind: p.kind, item: p.item, v: clamp(v), c, from, hops, d: day };
  const ids = Object.keys(n.bel);
  if (ids.length > 4) delete n.bel[ids.reduce((a, x) => (n.bel[a].c < n.bel[x].c ? a : x))];   // 머릿속엔 소문 네 개쯤
  return true;
}
// 직접 알게 됨 (하루 한 번): 직원 = 자기 회사 계획, 기자 = 여러 회사 계획 (talk.js의 느낌과 같은 값)
function learn(ctx, n) {
  if (n.learned === ctx.day) return;
  n.learned = ctx.day;
  const co = ctx.S.work.emps[n.emp]?.company;
  for (const p of M.rumors()) {
    if (p.kind === 'rate' || !p.co) continue;
    const feel = k => p.q + (hash(n.id, p.id, 61) - 0.5) * k;
    if (p.co === co) count(ctx, p, believe(n, p, feel(0.6), 0.75, '회사 사람들', 0, ctx.day));
    else if (n.occ === 'reporter' && hash(n.id, p.id, 62) < 0.6) count(ctx, p, believe(n, p, feel(0.9), 0.55, '취재', 0, ctx.day));
  }
}
// 그 소문을 아는 사람 수 (기자가 기사로 쓸지 정함)
function count(ctx, p, isNew) { if (!isNew) return; const H = ctx.S.people.heard ||= {}; H[p.id] = (H[p.id] || 0) + 1; }
// a가 b에게 가장 큰 소문을 전함
function share(ctx, a, b) {
  if (!a?.bel || !b || a.id === b.id) return;
  if (hash(ctx.min, a.id, 991) > 0.25 + a.tr.e * 0.55) return;                           // 수다스러운 사람일수록 잘 전함
  const best = Object.entries(a.bel).filter(([, x]) => x.c > 0.2).sort((x, y) => Math.abs(y[1].v) * y[1].c - Math.abs(x[1].v) * x[1].c)[0];
  if (!best) return;
  const [id, x] = best, trust = Math.min(1, (b.friends?.[a.id] || 15) / 80);
  const v = x.v * (0.85 + hash(ctx.min, a.id, 992) * 0.5);                                // 전할 때마다 조금씩 부풀려지거나 줄어듦
  const c = x.c * (0.45 + trust * 0.35) * (0.7 + b.tr.a * 0.3);                            // 친한 사람 말, 잘 믿는 사람일수록
  count(ctx, { id }, believe(b, { id, co: x.co, name: x.name, kind: x.kind, item: x.item }, v, c, a.name, x.hops + 1, ctx.day));
}
// 매일: 끝난 계획(발표됨)의 소문은 잊고, 확신은 조금씩 흐려짐
function daily(ctx, n, live) {
  if (!n.bel) return;
  for (const id of Object.keys(n.bel)) { const b = n.bel[id]; b.c *= 0.93; if (!live.has(+id) || b.c < 0.08) delete n.bel[id]; }
  if (!Object.keys(n.bel).length) delete n.bel;
}

// ----- 투자 (장 열린 평일, 사람마다 정해진 시각에 한 번 휴대폰을 봄) -----
const isInvestor = n => { const s = brain.selfOf(n); return hash(n.id, 990) < 0.22 + (s.impulsive + n.tr.o) / 2 * 0.35; };
function invest(ctx, n, age, remember) {
  if (age < 23 || !isInvestor(n)) return;
  const s = brain.selfOf(n), risk = (s.impulsive + n.tr.o) / 2, acct = 'p:' + n.id, port = n.port ||= {}, cost = n.cost ||= {};
  const bal = () => ctx.ledger.bal(acct), fear = mind.emo(n, 'fear');
  const buy = (co, won, why) => {
    const q = M.quote(co);
    if (!q || won < q.price) return;
    const sh = Math.floor(won / q.price), pay = sh * q.price;
    if (bal() - pay < 300000 || !ctx.ledger.move(acct, 'ext', pay)) return;               // 생활비는 남겨 둠
    cost[co] = ((cost[co] || 0) * (port[co] || 0) + pay) / ((port[co] || 0) + sh); port[co] = (port[co] || 0) + sh;
    M.order(co, pay); n.trade = { d: ctx.day, co, name: q.name, side: 'buy', why };
  };
  const sell = (co, why) => {
    const q = M.quote(co), sh = port[co];
    if (!q || !sh) return;
    const got = sh * q.price, gain = got - sh * cost[co];
    ctx.ledger.move('ext', acct, got); M.order(co, -got);
    delete port[co]; delete cost[co];
    n.trade = { d: ctx.day, co, name: q.name, side: 'sell', why, gain };
    if (Math.abs(gain) > 30000) remember(n, ctx.day, gain > 0 ? `${q.name} 주식으로 ${Math.round(gain / 10000)}만 원을 벌었다` : `${q.name} 주식으로 ${Math.round(-gain / 10000)}만 원을 날렸다`, gain > 0 ? 10 : -10);
  };
  // 1) 가진 주식: 많이 오르면 이익 챙기기, 많이 떨어지면 (겁나거나 성급하면) 손절, 수익률에 따라 기분
  for (const co of Object.keys(port)) {
    const q = M.quote(co);
    if (!q) continue;
    const ret = q.price / cost[co] - 1;
    if (ret > 0.1 + risk * 0.25 && hash(ctx.day, n.id, 993) < 0.6) sell(co, 'profit');
    else if (ret < -(0.07 + risk * 0.15) && (fear > 15 || s.impulsive > 0.6 || hash(ctx.day, n.id, 994) < 0.3)) sell(co, 'cut');
    else if (n.bel && Object.values(n.bel).some(b => b.co === co && b.v * b.c < -0.15)) sell(co, 'rumor');   // 나쁜 소문을 들음
    if (ret > 0.08) mind.feel(n, 'joy', 6, `${q.name} 주식이 올랐`);
    if (ret < -0.08) mind.feel(n, 'fear', 8, `${q.name} 주식이 물렸`);
  }
  // 2) 믿음대로: 좋은 소문을 믿으면 삼 (확신·모험심만큼), 집·여행 돈을 모으는 중이면 조금만
  const spend = bal() * (0.04 + risk * 0.18) * (n.goal?.k === 'house' ? 0.5 : 1) * (1 - Math.min(0.7, fear / 100));
  for (const b of Object.values(n.bel || {})) {
    const score = b.v * b.c;
    if (score > 0.22 && !port[b.co]) buy(b.co, spend * Math.min(1, score * 1.6), 'rumor');
  }
  // 3) 덜컥 따라 사기: 오늘 크게 오른 종목 (성급한 사람)
  if (s.impulsive > 0.72 && hash(ctx.day, n.id, 995) < 0.15) for (const co of M.hot?.() || []) if (!port[co]) { buy(co, spend * 0.5, 'fomo'); break; }
}

// ----- 기자: 많이 퍼진 소문을 기사로 (하루 한 번, 그 소문을 직접 들은 기자만) -----
function scoop(ctx, n) {
  if (n.occ !== 'reporter' || !n.bel || n.scooped === ctx.day) return;
  n.scooped = ctx.day;
  const H = ctx.S.people.heard || {}, done = ctx.S.people.scoops ||= [];
  const [id, b] = Object.entries(n.bel).filter(([id]) => (H[id] || 0) >= 20 && !done.includes(+id)).sort((x, y) => (H[y[0]] || 0) - (H[x[0]] || 0))[0] || [];
  if (!b || Math.abs(b.v) < 0.2) return;
  done.push(+id); if (done.length > 40) done.shift();
  const what = b.kind === 'earnings' ? '이번 분기 실적 두고' : `${b.item} 두고`;
  ctx.emit({ type: 'scoop', scale: 'regional', region: '한가람', text: `[소문] ${b.name} ${what} ${b.v > 0 ? '"대박 조짐"이라는' : '"불안하다"는'} 말 돌아… 한울방송 ${n.name} 기자`, up: b.v > 0, fx: { [b.co]: b.v * 3 } });
}

// ----- 말: 들은 소문 · 산 주식 -----
const ga = s => s + ((s.charCodeAt(s.length - 1) - 0xac00) % 28 ? '이' : '가');
function talkLines(n, ownCo) {
  const out = [], port = n.port || {};
  const b = Object.values(n.bel || {}).filter(x => x.hops > 0 && x.co !== ownCo && x.c > 0.15).sort((x, y) => Math.abs(y.v) * y.c - Math.abs(x.v) * x.c)[0];
  if (b) {
    const good = b.v > 0.15, bad = b.v < -0.15, who = b.hops === 1 ? `${b.from}님한테 들었는데,` : '건너 건너 들은 얘긴데,';
    const what = b.kind === 'product' ? `${b.name} ${b.item}${good ? ' 대박 날 거래요' : bad ? ' 잘 안 될 거래요' : ' 나온대요'}` : b.kind === 'earnings' ? `${b.name} 이번 실적이 ${good ? '좋대요' : bad ? '안 좋대요' : '그냥 그렇대요'}` : `${ga(b.name)} ${b.item} ${good ? '거의 따냈대요' : bad ? '놓칠 것 같대요' : '협상 중이래요'}`;
    const did = n.trade && n.trade.co === b.co ? (n.trade.side === 'buy' ? ' 그래서 저도 조금 샀어요.' : ' 그래서 가진 거 팔았어요.') : b.c > 0.5 ? ' 확실하대요.' : b.c < 0.25 ? ' 믿거나 말거나지만요.' : '';
    out.push(`${who} ${what}.${did}`);
  }
  const held = Object.keys(port);
  if (held.length) {
    const co = held[0], q = M.quote(co);
    if (q) { const ret = (q.price / n.cost[co] - 1) * 100; out.push(ret > 3 ? `요즘 ${q.name} 주식으로 ${ret.toFixed(0)}% 벌었어요!` : ret < -3 ? `${q.name} 주식에 물려서 ${(-ret).toFixed(0)}% 손해 보고 있어요…` : `${q.name} 주식 조금 갖고 있어요. 아직은 본전이에요.`); }
  } else if (n.trade?.side === 'sell' && n.trade.gain) out.push(n.trade.gain > 0 ? `얼마 전에 ${n.trade.name} 주식 팔아서 ${Math.round(n.trade.gain / 10000)}만 원 벌었어요.` : `${n.trade.name} 주식으로 ${Math.round(-n.trade.gain / 10000)}만 원 날렸어요. 다신 안 해요…`);
  const ip = Object.entries(n.ipo || {})[0], info = ip && M.ipos().find(x => x.id === ip[0]);
  if (info) out.push(`${info.name} 공모주 청약을 ${ip[1].qty}주 넣어 놨어요. ${info.ratio ? '결과가 곧 나와요.' : '경쟁률이 꽤 높다던데, 몇 주나 받을지 모르겠어요.'}`);
  else { const act = M.ipos().find(x => x.stage === 'booked' || x.stage === 'subscribe'); if (act && hash(n.id, 3003) < 0.5) out.push(`요즘 ${act.name} 공모주 청약이 화제예요. 공모가는 ${act.price.toLocaleString('ko-KR')}원이래요.`); }
  return out;
}

// 세상을 떠나면 가진 주식은 팔아서 돈으로 (상속은 돈으로)
function liquidate(ctx, n) { for (const [co, sh] of Object.entries(n.port || {})) { const q = M.quote(co); if (q) { ctx.ledger.move('ext', 'p:' + n.id, sh * q.price); M.order(co, -sh * q.price); } } n.port = null; }
const liveIds = () => M.rumors().map(p => p.id);
module.exports = { liquidate, liveIds, connect, learn, share, daily, invest, scoop, talkLines, isInvestor };
