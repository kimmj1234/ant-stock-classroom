'use strict';
// ===== 세계 시뮬레이션 조립: 커널 + 모듈(사람 → 일 → 사건 → 사회 순서) =====
// 모듈을 더하려면: { name, every, init, tick, daily, coarse, check, wire } 모양으로 만들어 use()에 넣으면 됨
//   (예: 교통·범죄·선거·학교 성적 …) 다른 모듈과는 ctx.S(상태 읽기)·emit(사건)·ledger(돈)로만 이어짐
const { DAY } = require('../world.js');
const { createKernel } = require('./kernel.js');
const { createPeople } = require('./people.js');
const { createWork } = require('./work.js');
const { createEvents } = require('./events.js');
const { createSociety } = require('./society.js');
const { REGIONS } = require('./data.js');
const belief = require('./belief.js');

function createSim({ file, read, write, toMarket = () => {}, quote = () => null, rumors = () => [], order = () => {}, hot = () => [] }) {
  belief.connect({ quote, order, rumors, hot });   // 믿음·투자 모듈이 시세를 보고 주문을 냄
  const kernel = createKernel({ file, read, write });
  const people = createPeople(), work = createWork(), events = createEvents({ toMarket }), society = createSociety();
  // 사회 모듈 상태를 다른 모듈이 먼저 읽으므로 사회를 먼저 만들어 둠(init 순서), 매일 돌리는 순서는 사람 → 일 → 사건 → 사회
  for (const m of [society, people, work, events]) kernel.use(m);
  events.wire(kernel); society.wire(kernel);
  let ready = false;
  const S = () => kernel.state.mods;
  const regionOfScene = { city: '한가람', byeolha: '별하항', danbi: '단비', nuribeol: '누리벌' };
  return {
    advance(nowMin) {
      if (!ready) {   // 처음 만든 세계는 3시간 앞에서 시작해 따라잡음 → 모두 집에 있는 어색한 첫 화면 없이 지금 시각의 모습으로
        const fresh = kernel.state.min == null;
        kernel.init(fresh ? nowMin - 180 : nowMin);
        if (!S().society.stats) society.daily({ ...ctxLite(nowMin), my: S().society });
        work.ensure(ctxLite(nowMin));
        ready = true;
      }
      kernel.advance(nowMin);
    },
    // 그 장면(지역)에서 밖을 걸어 다니는 사람들
    visible(scene, nowMin) { const r = regionOfScene[scene]; return r ? people.visible(S(), r, Math.floor(nowMin)) : []; },
    talk(id, nowMin, who = 'guest') {
      const n = S().people.list[id];
      if (!n) return null;
      const near = kernel.state.news.filter(x => x.region === n.region || x.scale !== 'local').slice(0, 4), news = near[id % Math.max(1, near.length)];   // 사람마다 들은 소문이 다름
      return people.talk(S(), id, nowMin, news?.text, quote, who, rumors(), kernel.ledger.bal('p:' + id));
    },
    // 휴대폰 "세상" 탭: 나라 통계 · 지역별 · 사건 소식 · 시스템 건강
    society() {
      const so = S().society, st = so.stats;
      return {
        stats: st && { pop: st.pop, employment: st.employment, mood: st.mood, savings: st.savings, married: st.married, births: st.births, deaths: st.deaths },
        regions: st && Object.entries(st.byRegion).map(([name, r]) => ({ name, ...r, target: REGIONS[name]?.pop })),
        econ: { demand: so.demand, tax: so.tax }, history: so.history,
        news: kernel.state.news.slice(0, 25),
        health: { checks: kernel.state.health.slice(0, 5), lastMs: kernel.runtime.lastMs, deferred: kernel.runtime.deferred, money: kernel.ledger.total() === kernel.state.total0 },
      };
    },
    // 주식 시장에 알려 줄 회사 사정(-1~1: 상장 회사 일터들의 직원 사기 평균)과 경기
    macro() {
      const sum = {}, cnt = {};
      for (const e of Object.values(S().work.emps)) if (e.company) { sum[e.company] = (sum[e.company] || 0) + e.morale; cnt[e.company] = (cnt[e.company] || 0) + 1; }
      return { health: Object.fromEntries(Object.keys(sum).map(k => [k, Math.max(-1, Math.min(1, (sum[k] / cnt[k] - 60) / 30))])), demand: S().society.demand ?? 1 };
    },
    // ----- 플레이어 일자리 (server jobs.js가 씀) -----
    // 일터 목록: 지금 직원 수(NPC + 플레이어)와 자리 수
    employers() {
      const W = S().work, count = {};
      for (const n of Object.values(S().people.list)) if (n.emp) count[n.emp] = (count[n.emp] || 0) + 1;
      return Object.values(W.emps).map(e => ({ id: e.id, key: e.key, name: e.name, region: e.region, occ: e.occ, company: e.company, cap: e.cap, staff: (count[e.id] || 0) + (e.players?.length || 0), morale: Math.round(e.morale) }));
    },
    // 플레이어를 일터 직원으로 넣고 빼기 (who = 계정)
    hirePlayer(empId, who) { const e = S().work.emps[empId]; if (!e) return false; e.players = [...new Set([...(e.players || []), who])]; return true; },
    firePlayer(empId, who) { const e = S().work.emps[empId]; if (e) e.players = (e.players || []).filter(p => p !== who); },
    // 플레이어 월급: 그 일터 돈에서 나감(세계 경제와 맞물림). 일터 돈이 모자라도 플레이어는 받음(나머지는 바깥에서 — 돈 합계는 그대로)
    payPlayer(empId, amount) { const ok = kernel.ledger.move('e:' + empId, 'ext', amount); return ok; },
    // 같은 일터 NPC 동료 몇 명 (이름)
    coworkers(empId, n = 3) { return Object.values(S().people.list).filter(p => p.emp === empId).slice(0, n).map(p => p.name); },
    kernel,
  };
  function ctxLite(min) { return { min, day: Math.floor(min / DAY), t: min % DAY, S: S(), rnd: kernel.rnd, clamp: kernel.clamp, emit: kernel.emit, ledger: kernel.ledger }; }
}

module.exports = { createSim };
