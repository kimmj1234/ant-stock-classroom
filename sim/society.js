'use strict';
// ===== 사회 모듈: 나라 통계 + 안정 장치(평균으로 되돌림·자동 정책) =====
// 매일 0시: 인구·취업률·평균 기분·평균 저축·출생·사망을 세고, 값이 정해 둔 범위를 벗어나면 정책으로 되돌림
//   경기(demand)·업종 사정(sector)은 매일 1.0 쪽으로 15%씩 되돌아감 (오르스타인-울렌벡 과정: 충격은 남지만 점점 사라짐)
//   실업률 > 10% → 공공 일자리 늘림 / 저축이 너무 적거나 많음 → 바깥 수요 조절 / 인구가 목표의 85% 아래 → 출산 지원 / 나라 빚이 크면 세금을 조금 올림
//   정책은 하루에 한 걸음씩만 (범위 안에서) → 고치려다 오히려 출렁이지 않게
const { REGIONS } = require('./data.js');

function createSociety() {
  const toward = (v, goal, k) => v + (goal - v) * k;
  function census(ctx) {
    const list = Object.values(ctx.S.people.list), day = ctx.day, ageOf = n => Math.floor((day - n.born) / 365);
    const work = list.filter(n => { const a = ageOf(n); return a >= 19 && a < 65; });
    const employed = work.filter(n => n.emp).length, savings = list.filter(n => ageOf(n) >= 19).map(n => ctx.ledger.bal('p:' + n.id));
    const byRegion = {};
    for (const n of list) { const r = byRegion[n.region] ||= { pop: 0, jobs: 0, mood: 0 }; r.pop++; if (n.emp) r.jobs++; r.mood += n.mood; }
    for (const r of Object.values(byRegion)) r.mood = Math.round(r.mood / Math.max(1, r.pop));
    return {
      day, pop: list.length, workAge: work.length, employment: work.length ? employed / work.length : 0,
      mood: list.reduce((a, n) => a + n.mood, 0) / Math.max(1, list.length), savings: savings.sort((a, b) => a - b)[Math.floor(savings.length / 2)] || 0,
      married: list.filter(n => n.spouse).length, byRegion,
    };
  }
  function daily(ctx) {
    const so = ctx.my, c = census(ctx), target = Object.values(REGIONS).reduce((a, r) => a + r.pop, 0), policy = [];
    so.births = (so.births || 0); so.deaths = (so.deaths || 0);
    c.births = so.birthsToday || 0; c.deaths = so.deathsToday || 0; so.birthsToday = so.deathsToday = 0;
    so.stats = c; so.history = [...(so.history || []), { day: c.day, pop: c.pop, emp: +c.employment.toFixed(3), mood: Math.round(c.mood), sav: c.savings }].slice(-60);
    // 평균으로 되돌림
    so.demand = toward(so.demand ?? 1, 1, 0.15);
    for (const k in so.sector || {}) { so.sector[k] = toward(so.sector[k], 1, 0.15); if (Math.abs(so.sector[k] - 1) < 0.005) delete so.sector[k]; }
    // 자동 정책 (하루 한 걸음, 범위 안)
    const W = ctx.S.work;
    if (c.employment < 0.9) {
      const civ = Object.values(W.emps).filter(e => e.occ === 'civil');
      civ.forEach(e => { e.cap = Math.min(e.cap + 1, (e.cap0 ??= e.cap) * 3); });
      policy.push('공공 일자리를 늘렸어요');
    }
    const want = 2000000;   // 어른 저축 가운뎃값 목표
    so.extK = ctx.clamp((so.extK ?? 1) + (c.savings < want * 0.5 ? 0.02 : c.savings > want * 3 ? -0.02 : (1 - (so.extK ?? 1)) * 0.05), 0.8, 1.25, 1);
    so.birthBoost = ctx.clamp((so.birthBoost ?? 1) + (c.pop < target * 0.85 ? 0.05 : c.pop > target * 1.15 ? -0.05 : (1 - (so.birthBoost ?? 1)) * 0.1), 0.3, 3, 1);
    const debt = -ctx.ledger.bal('gov');
    so.tax = ctx.clamp((so.tax ?? 0.1) + (debt > c.pop * 3000000 ? 0.002 : debt < 0 ? -0.002 : 0), 0.08, 0.2, 0.1);
    if (c.mood < -30) policy.push('기분 회복 지원금');
    if (policy.length && ctx.rnd(ctx.day, 1, 120) < 0.5) ctx.emit({ type: 'policy', scale: 'national', text: `정부, ${policy[0]}`, up: true });
  }
  return {
    name: 'society', every: 1440, daily,
    init(ctx) { return { demand: 1, sector: {}, tax: 0.1, extK: 1, birthBoost: 1, stats: null, history: [] }; },
    coarse(ctx, days) { daily(ctx); },
    check(ctx) {
      let f = 0; const so = ctx.my;
      for (const k of ['demand', 'tax', 'extK', 'birthBoost']) if (!Number.isFinite(so[k])) { so[k] = k === 'tax' ? 0.1 : 1; f++; }
      return f;
    },
    wire(kernel) { kernel.on('birth', (e, ctx) => { ctx.S.society.birthsToday = (ctx.S.society.birthsToday || 0) + 1; }); kernel.on('death', (e, ctx) => { ctx.S.society.deathsToday = (ctx.S.society.deathsToday || 0) + 1; }); },
    census,
  };
}

module.exports = { createSociety };
