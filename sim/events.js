'use strict';
// ===== 사건 모듈: 작은 동네 일부터 나라 전체 일까지 =====
// 규모: micro(사람 하나의 일상, 사람 모듈이 만듦) < local(동네) < regional(지역 산업) < national(나라 경제)
// 큰 사건일수록 드물고, 지역 분위기(기분)·경기·업종 사정·주가에 영향. 영향은 매일 조금씩 사라짐(평균으로 되돌아감) → 한 번의 사건이 영원히 남지 않음
// 커널의 사건 버스가 하루 횟수 제한·연쇄 감쇠를 해 줌
const { weatherOf } = require('../world.js');
const { REGIONS, LOCAL, REGIONAL, NATIONAL } = require('./data.js');

function createEvents({ toMarket }) {
  return {
    name: 'events', every: 60,
    init: () => ({ mood: {} }),
    // 매시간: 지역마다 동네 사건(낮 시간), 가끔 큰 지역 사건, 아주 가끔 나라 사건
    tick(ctx) {
      const E = ctx.my, h = Math.floor(ctx.t / 60), wx = weatherOf(ctx.day);
      if (h < 7 || h > 21) return;
      Object.keys(REGIONS).forEach((r, i) => {
        if (ctx.rnd(ctx.min, i, 100) < 0.25 / 15) {
          const ev = LOCAL[Math.floor(ctx.rnd(ctx.min, i, 101) * LOCAL.length)];
          ctx.emit({ type: 'local', scale: 'local', region: r, text: ev.text(r), up: ev.mood >= 0, mood: ev.mood });
        }
        if (ctx.rnd(ctx.min, i, 102) < 0.04 / 15) {
          const ok = REGIONAL.filter(ev => ev.when(r, wx));
          if (ok.length) { const ev = ok[Math.floor(ctx.rnd(ctx.min, i, 103) * ok.length)]; ctx.emit({ type: 'regional', scale: 'regional', region: r, text: ev.text(r), up: ev.mood >= 0, mood: ev.mood, fx: ev.fx }); }
        }
      });
      if (ctx.rnd(ctx.min, 0, 104) < 0.012 / 15) {
        const ev = NATIONAL[Math.floor(ctx.rnd(ctx.min, 0, 105) * NATIONAL.length)];
        ctx.emit({ type: 'national', scale: 'national', text: ev.text, up: ev.demand >= 0, demand: ev.demand, fx: ev.fx });
      }
      E.mood ||= {};
    },
    // 매일: 지역 분위기는 0 쪽으로 30%씩 되돌아감
    daily(ctx) { for (const r in ctx.my.mood) { ctx.my.mood[r] *= 0.7; if (Math.abs(ctx.my.mood[r]) < 0.3) delete ctx.my.mood[r]; } },
    check(ctx) { let f = 0; for (const r in ctx.my.mood) if (!Number.isFinite(ctx.my.mood[r])) { delete ctx.my.mood[r]; f++; } return f; },
    // 버스 구독: 사건의 결과를 반영
    wire(kernel) {
      kernel.on('*', (e, ctx) => {
        const E = ctx.S.events;
        if (e.mood && e.region) E.mood[e.region] = ctx.clamp((E.mood[e.region] || 0) + e.mood * e.energy, -15, 15, 0);   // 지역 분위기 (±15 안)
        if (e.demand) { const so = ctx.S.society; so.demand = ctx.clamp((so.demand ?? 1) + e.demand * e.energy, 0.7, 1.3, 1); }
        if (e.fx && Object.keys(e.fx).length) {
          toMarket(ctx.min, { text: e.text, fx: Object.fromEntries(Object.entries(e.fx).map(([k, v]) => [k, v * e.energy])) });   // 주식 시장 뉴스로
          const so = ctx.S.society; so.sector ||= {};
          for (const [k, v] of Object.entries(e.fx)) so.sector[k] = ctx.clamp((so.sector[k] ?? 1) + v / 100 * e.energy, 0.7, 1.3, 1);   // 업종 사정 (그 업종 일터 매출)
        }
        // 연쇄: 공장 파업 → (힘이 절반인) 그 지역 분위기 하락 사건 하나 — 감쇠 때문에 더 번지지 않음
        if (e.type === 'strike') return { type: 'local', region: e.region, text: `${e.region} 상인들, 파업 길어질까 걱정`, mood: -3, up: false };
        return null;
      });
    },
  };
}

module.exports = { createEvents };
