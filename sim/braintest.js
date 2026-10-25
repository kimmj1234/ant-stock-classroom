'use strict';
// 뇌 검사: node sim/braintest.js → 처음 세계에서 열흘을 돌리며
//   하루에 몇 번 먹는지·무엇을 고르는지(사람마다 다른지)·비 오는 날 밖에 덜 나가는지·우산을 챙기는지·생각(이유)이 남는지 확인
const assert = require('assert');
const { createSim } = require('./index.js');
const { DAY, weatherOf } = require('../world.js');
const sim = createSim({ file: 'mem', read: () => null, write: () => {} });
const start = DAY * (+process.argv[2] || 118);   // 기본: 장마철 (비 오는 날 포함)
sim.advance(start);
const S = sim.kernel.state.mods, adults = () => Object.values(S.people.list).filter(n => n.occ !== 'child' && n.occ !== 'student');
const dish = {}, perPerson = {}, outside = { wet: [0, 0], dry: [0, 0] }, why = {};
let umb = [0, 0];
const planStat = { kept: 0, both: 0, missed: 0, rainCancel: 0 };
for (let hr = 0; hr < 24 * 10; hr++) {
  const min = start + hr * 60 + 59;
  sim.kernel.advance(min, 1e9);
  const wet = ['rain', 'storm'].includes(weatherOf(Math.floor(min / DAY))), h = hr % 24;
  for (const n of adults()) {
    if (n.dish && n.thought?.min > min - 60) { dish[n.dish] = (dish[n.dish] || 0) + 1; (perPerson[n.id] ||= {})[n.dish] = (perPerson[n.id][n.dish] || 0) + 1; for (const w of n.thought.why) why[w] = (why[w] || 0) + 1; }
    if (h >= 10 && h < 20 && n.act !== 'work') { const o = outside[wet ? 'wet' : 'dry']; o[1]++; if (['walk', 'cafe', 'market', 'eatOut', 'visit', 'shop'].includes(n.act)) o[0]++; }
  }
  if (h === 23) { const P = S.people.list; Object.assign(planStat, { kept: 0, both: 0, missed: 0, rainCancel: 0 }); for (const n of Object.values(P)) for (const it of n.plan?.items || []) { if (it.with && it.done) { planStat.kept++; const f = P[it.with]; if (f?.plan?.items.find(x => x.with === n.id)?.done) planStat.both++; } if (it.with && it.missed) planStat.missed++; if (it.missed && !it.with && it.out) planStat.rainCancel++; } }
  if (wet && h === 12) for (const n of adults()) { umb[1]++; if (n.umbToday) umb[0]++; }
}
const people = adults().length, meals = Object.values(dish).reduce((a, b) => a + b, 0) / people / 10;
console.log('사람', people, '· 하루 평균 먹고 마신 횟수', meals.toFixed(2));
console.log('고른 것', Object.entries(dish).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' / '));
const fav = Object.values(perPerson).map(p => Object.entries(p).sort((a, b) => b[1] - a[1])[0][0]), favCount = {};
fav.forEach(f => favCount[f] = (favCount[f] || 0) + 1);
console.log('사람마다 가장 자주 고른 것', JSON.stringify(favCount));
const rate = o => o[1] ? (o[0] / o[1] * 100).toFixed(1) + '%' : '-';
console.log('낮에 밖에 나간 비율: 맑은 날', rate(outside.dry), '/ 비 오는 날', rate(outside.wet), '· 비 오는 날 우산 챙긴 사람', rate(umb));
console.log('이유', Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}(${v})`).join(' / '));
// 마음: 약속(둘 다 나왔는지)·목표·감정
const meets = {}, goals = {}, emos = {};
let kept = 0, both = 0, missed = 0;
for (const n of Object.values(S.people.list)) {
  if (n.goal) goals[n.goal.k] = (goals[n.goal.k] || 0) + 1;
  const tk = Object.entries(n.emo || {}).sort((a, b) => b[1] - a[1])[0]; if (tk && tk[1] > 22) emos[tk[0]] = (emos[tk[0]] || 0) + 1;
}
console.log('목표', JSON.stringify(goals), '· 지금 가장 큰 감정', JSON.stringify(emos));
console.log('약속: 오늘(마지막 날) 지킨 약속', planStat.kept, '· 둘 다 나온 약속', planStat.both, '· 놓친 약속', planStat.missed, '· 비 때문에 접은 나들이', planStat.rainCancel);
const sample = Object.values(S.people.list).filter(n => n.plan?.items.some(i => i.with) || n.emo && Object.values(n.emo).some(v => v > 30)).slice(0, 4);
for (const n of sample) console.log('[' + n.name + ']', sim.talk(n.id, start + 240 * 60 - 60, 'x').lines.slice(1, -1).join(' / '));
assert.ok(Object.keys(goals).length >= 4, '목표가 여러 가지');
assert.ok(planStat.both > 0, '약속한 두 사람이 모두 나옴');
assert.ok(meals > 2 && meals < 5.5, '하루 먹는 횟수');
assert.ok(Object.keys(favCount).length >= 5, '사람마다 좋아하는 게 다름');
if (outside.wet[1]) assert.ok(outside.wet[0] / outside.wet[1] < outside.dry[0] / outside.dry[1], '비 오면 덜 나감');
console.log('ok');
