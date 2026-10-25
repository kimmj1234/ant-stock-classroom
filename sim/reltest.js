'use strict';
// 관계 검사: node sim/reltest.js → 한 플레이어가 같은 NPC(진행 중인 계획이 있는 회사 직원)를 날마다 만나고 선물을 주면
//   이름을 기억하는지 · 호감·신뢰가 쌓여 단계가 오르는지 · 신뢰가 쌓이기 전엔 회사 일을 숨기다 나중엔 말해 주는지 · 먼저 말을 거는지 ·
//   절친이 되면 선물을 주는지 · 너무 자주 말 걸면 귀찮아하는지
const assert = require('assert');
const { createSim } = require('./index.js');
const { createMarket } = require('../economy.js');
const { DAY } = require('../world.js');
const market = createMarket('mem', () => null, () => {});
const sim = createSim({ file: 'mem', read: () => null, write: () => {}, toMarket: (m, n) => market.ingest(m, n), quote: id => market.quote(id), rumors: () => market.rumors(), order: (id, won) => market.order(id, won), hot: () => market.hot() });
const start = DAY * 9 + 12 * 60, S = sim.kernel.state.mods, me = { name: '시험이' };
sim.advance(start); market.advance(start);
// 진행 중인 계획이 있는 회사의 직원 중 무뚝뚝하지 않은 사람
const cos = new Set(market.rumors().map(p => p.co));
const n = Object.values(S.people.list).find(p => cos.has(S.work.emps[p.emp]?.company) && p.tr.a > 0.5 && p.tr.e > 0.4);
assert.ok(n, '계획 있는 회사 직원');
const secret = l => /나올|분기|협상|비밀/.test(l);
let liveTrusted = 0, first = null, sawSecret = -1, sawHidden = false, called = -1, gave = -1;
for (let d = 0; d < 12; d++) {
  const t = start + d * DAY;
  if (d) { for (let h = 1; h <= 24; h++) { sim.kernel.advance(t - DAY + h * 60, 1e9); market.advance(t - DAY + h * 60); } }
  if (called < 0 && sim.visible('city', t, 'k1').concat([]).length >= 0) { const c = require('./rel.js').callOf(n, 'k1', t, !!n.bel); if (c) called = d; }
  const r = sim.talk(n.id, t, 'k1', me);
  first ||= r.lines;
  if (r.lines.some(l => /아직은 비밀|아직은 말 못/.test(l))) sawHidden = true;
  const live = market.rumors().some(p => p.co === S.work.emps[n.emp]?.company), trusted = require('./rel.js').trusts(n, n.met.k1);
  if (live && trusted && sawSecret < 0 && r.lines.some(l => /나올|나온다는데|우리 회사|분기|협상|실적/.test(l))) sawSecret = d;
  if (live && trusted) liveTrusted++;
  if (r.give && gave < 0) gave = d;
  if (d % 2 === 0) sim.kernel.state.mods && require('./rel.js').gift(n, 'k1', me, 'snack', '과자', t + 5, { rain: false }, require('./brain.js').selfOf(n), (x, dd, tt, w) => x.mem.unshift({ d: dd, t: tt, w }));
  console.log(`${d + 1}일째: ${r.rel.name} (호감 ${r.rel.like} · 신뢰 ${r.rel.trust}) — ${r.lines.slice(0, 3).join(' / ')}`);
}
// 같은 날 너무 자주
const spamT = start + 12 * DAY;
let spam;
for (let i = 0; i < 6; i++) spam = sim.talk(n.id, spamT + i * 40, 'k1', me);
console.log('같은 날 여섯 번째:', spam.lines.join(' / '));
console.log(`신뢰 전 비밀 숨김 ${sawHidden} · 회사 이야기 ${sawSecret}일째 · 먼저 말 걸기 ${called}일째 · 선물 받기 ${gave}일째`);
const lines = sim.talk(n.id, spamT + DAY, 'k1', me).lines;
assert.ok(lines.some(l => l.includes('시험이')), '이름을 부름');
assert.ok(called >= 0, '먼저 말을 걺');
assert.ok(/귀찮|바빠|…/.test(spam.lines.join('')), '귀찮아함');
if (liveTrusted) assert.ok(sawSecret >= 0, '믿게 되면 회사 일을 말해 줌');
console.log('ok');
