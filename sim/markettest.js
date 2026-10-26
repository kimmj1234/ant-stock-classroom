'use strict';
// 소문·투자 검사: node sim/markettest.js → 세계 시뮬레이션 + 주식 시장(메모리)을 이어 2주를 돌리며
//   소문이 몇 명에게 퍼지는지 · 투자하는 사람 수 · 발표 전에 주가가 결과 쪽으로 먼저 움직이는지 · 기자 기사 · 돈 보존을 확인
const assert = require('assert');
const { createSim } = require('./index.js');
const { createMarket } = require('../economy.js');
const { DAY } = require('../world.js');
const market = createMarket('mem', () => null, () => {});
const sim = createSim({ file: 'mem', read: () => null, write: () => {}, toMarket: (m, n) => market.ingest(m, n), quote: id => market.quote(id), rumors: () => market.rumors(), order: (id, won) => market.order(id, won), hot: () => market.hot(), ipos: () => market.ipoView() });
const divs = []; market.onDividend((co, dps) => { divs.push(co); sim.dividend(co, dps); }); market.flushDividends();   // 배당: 세계 시뮬레이션의 주식 가진 사람에게
market.setIpoHooks({ npcApply: ipo => sim.ipoApply(ipo), allocate: (ipo, ratio) => sim.ipoAllocate(ipo, ratio) });   // 공모주: NPC 청약·배정
const start = DAY * (+process.argv[2] || 7) + 6 * 60, S = sim.kernel.state.mods;
sim.advance(start); market.advance(start);
const seen = {}, out = [];
let maxHeard = 0;
const DAYS = +process.argv[3] || 14;   // 시험 기간(일)
for (let hr = 1; hr <= 24 * DAYS; hr++) {
  const t = start + hr * 60;
  sim.kernel.advance(t, 1e9); market.advance(t); market.setMacro(sim.macro());
  const live = market.rumors();
  for (const p of live) if (p.co) { seen[p.id] ||= { ...p, p0: market.quote(p.co).price }; seen[p.id].p1 = market.quote(p.co).price; seen[p.id].heard = S.people.heard?.[p.id] || 0; maxHeard = Math.max(maxHeard, seen[p.id].heard); }
  for (const id of Object.keys(seen)) if (!live.some(p => p.id === +id) && !seen[id].out) { seen[id].out = true; out.push(seen[id]); }
}
const people = Object.values(S.people.list), investors = people.filter(n => n.port && Object.keys(n.port).length).length, believers = people.filter(n => n.bel).length;
const hops = {}; people.forEach(n => Object.values(n.bel || {}).forEach(b => hops[Math.min(b.hops, 3)] = (hops[Math.min(b.hops, 3)] || 0) + 1));
console.log(`소문을 아는 사람 ${believers}명 (직접 ${hops[0] || 0} · 한 다리 ${hops[1] || 0} · 두 다리 ${hops[2] || 0} · 세 다리 이상 ${hops[3] || 0}) · 한 소문 최대 ${maxHeard}명 · 주식 가진 사람 ${investors}명`);
let match = 0, moved = 0;
for (const p of out.filter(p => p.kind !== 'rate')) {
  const pre = (p.p1 / p.p0 - 1) * 100;
  if (Math.abs(p.q) > 0.2 && Math.abs(pre) > 0.3) { moved++; if (Math.sign(pre) === Math.sign(p.q)) match++; }
  console.log(`  ${p.name} ${p.item} 결과 ${p.q.toFixed(2)} · 아는 사람 ${p.heard}명 · 발표 전 주가 ${pre >= 0 ? '+' : ''}${pre.toFixed(1)}%`);
}
console.log(`발표 전 주가가 결과 쪽으로 움직인 계획 ${match}/${moved}`);
const news = market.view().news.map(n => n.text);
console.log('기사:', news.filter(t => t.startsWith('[소문]')).slice(0, 3).join(' | ') || '(없음)');
console.log('마감:', news.find(t => t.startsWith('[마감]')));
const talkers = people.filter(n => Object.values(n.bel || {}).some(b => b.hops > 0) || n.port && Object.keys(n.port).length).slice(0, 4);
for (const n of talkers) console.log(`[${n.name}]`, sim.talk(n.id, start + 24 * DAYS * 60, 'x').lines.filter(l => /들었는데|건너|주식/.test(l)).join(' / '));
assert.ok(hops[1] > 0 && maxHeard >= 10, '소문이 퍼짐');
assert.ok(investors > 20, '투자하는 사람');
assert.ok(match >= moved * 0.3, '발표 전 주가가 결과 쪽으로 기움 (무작위 요소가 있어 30% 이상이면 통과, 여러 번 돌리면 60%쯤)');
{ const ip = market.state.ipos, npcHold = people.filter(n => Object.keys(n.port || {}).some(c => ip.some(p => p.def.id === c))).length; console.log('공모', ip.map(p => p.def.name + ':' + p.stage + (p.ratio ? '(' + p.ratio + ':1)' : '')).join(' / '), '· 공모주를 가진 NPC', npcHold, '명'); }
console.log('배당 지급 회사', divs.length, '곳 (주식 가진 NPC에게 세후 지급)');
if (DAYS >= 24) assert.ok(divs.length > 0, '실적철에 배당이 나감 (24일 이상 돌릴 때)');
assert.strictEqual(sim.kernel.ledger.total(), sim.kernel.state.total0, '돈 보존');
console.log('ok');
