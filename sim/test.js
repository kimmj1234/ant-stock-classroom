'use strict';
// 장기 안정성 검사: node sim/test.js [날수]
// 메모리에서 세계를 (기본) 180일 돌리며 10일마다 통계를 찍고, 무너짐이 없는지 확인
//   인구가 목표의 60~160% 안 · 취업률 60% 넘음 · 돈 합계가 그대로 · 이상한 값(NaN) 없음 · 하루 계산 시간
//   + 같은 시작으로 두 번 돌리면 같은 결과인지(결정성: 작은 차이가 생기지 않음)
const assert = require('assert');
const { createSim } = require('./index.js');
const { DAY } = require('../world.js');
const { REGIONS } = require('./data.js');

function run(days, quiet) {
  let saved = null;
  const sim = createSim({ file: 'mem', read: () => null, write: (f, s) => { if (f === 'mem') saved = s; }, toMarket: () => {} });
  const start = 480;
  sim.advance(start);
  const target = Object.values(REGIONS).reduce((a, r) => a + r.pop, 0), t0 = Date.now();
  for (let d = 1; d <= days; d++) {
    const td = Date.now();
    for (let m = start + (d - 1) * DAY; m < start + d * DAY; m += 120) { sim.kernel.advance(m + 120, 1e9); }
    const ms = Date.now() - td, so = sim.society();
    if (d % 10 === 0 && !quiet) console.log(`${String(d).padStart(3)}일: 인구 ${so.stats.pop} · 취업률 ${(so.stats.employment * 100).toFixed(1)}% · 기분 ${so.stats.mood.toFixed(1)} · 저축 가운데 ${Math.round(so.stats.savings / 10000)}만원 · 부부 ${so.stats.married} · 경기 ${so.econ.demand.toFixed(3)} · 세금 ${(so.econ.tax * 100).toFixed(1)}% · 소식 ${so.news.length} · 하루 계산 ${ms}ms`);
    assert.ok(so.stats.pop > target * 0.6 && so.stats.pop < target * 1.6, '인구 범위');
    assert.ok(so.stats.employment > 0.6, '취업률');
    assert.ok(so.health.money, '돈 합계 보존');
  }
  const S = sim.kernel.state;
  for (const n of Object.values(S.mods.people.list)) for (const v of [n.mood, n.health, n.stress, ...Object.values(n.need)]) assert.ok(Number.isFinite(v), 'NaN 없음');
  return { sim, ms: Date.now() - t0, sig: JSON.stringify(S.mods.society.history) };
}

const days = +process.argv[2] || 180;
const a = run(days);
console.log(`총 ${days}일 계산 ${a.ms}ms (현실로는 ${days * 8}시간 분량)`);
const b = run(30, true), c = run(30, true);
assert.strictEqual(b.sig, c.sig, '결정성: 같은 시작이면 같은 결과');
console.log('결정성 확인: 30일을 두 번 돌려 결과가 같음');
console.log('건강 기록:', a.sim.society().health.checks.map(h => h.text).join(' / ') || '(없음)');
console.log('최근 소식:', a.sim.society().news.slice(0, 5).map(n => `[${n.scale}] ${n.text}`).join(' | '));
console.log('ok');
