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

function createSim({ file, read, write, toMarket = () => {} }) {
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
        ready = true;
      }
      kernel.advance(nowMin);
    },
    // 그 장면(지역)에서 밖을 걸어 다니는 사람들
    visible(scene, nowMin) { const r = regionOfScene[scene]; return r ? people.visible(S(), r, Math.floor(nowMin)) : []; },
    talk(id, nowMin) {
      const n = S().people.list[id];
      if (!n) return null;
      const near = kernel.state.news.filter(x => x.region === n.region || x.scale !== 'local').slice(0, 4), news = near[id % Math.max(1, near.length)];   // 사람마다 들은 소문이 다름
      return people.talk(S(), id, nowMin, news?.text);
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
    kernel,
  };
  function ctxLite(min) { return { min, day: Math.floor(min / DAY), t: min % DAY, S: S(), rnd: kernel.rnd, clamp: kernel.clamp, emit: kernel.emit, ledger: kernel.ledger }; }
}

module.exports = { createSim };
