'use strict';
// ===== 일 모듈: 일터(회사·가게·학교·병원·관공서) · 채용 · 매출 · 해고 =====
// 일터마다 자리 수(cap)가 있고, 구직자는 매일 아침 자기 지역(없으면 다른 지역으로 이사)의 빈자리에 지원 → 실력 좋은 사람부터 뽑힘
// 돈의 흐름(모두 장부로): 바깥 수요 → 산업 일터(어업·농업·공장…) → 품삯 → 사람 → 가게(밥·장보기) / 세금 → 나라 → 학교·병원·버스·공무원 품삯·연금
// 무너짐 방지: 산업 매출 = 직원 품삯 × 1.15 × 경기 × 날씨 (경기는 사회 모듈이 평균으로 되돌림), 돈이 모자란 일터는 사람을 줄이고 많으면 다시 뽑음
const { weatherOf } = require('../world.js');
const { REGIONS, OCC, COMMON_JOBS } = require('./data.js');

// 상장 회사 일터 (economy.js의 회사와 연결) — 주가 뉴스의 근거가 됨
const COMPANY_EMP = {   // 지역 → [회사 아이디, 일터 이름, 직업]
  한가람: [['hanulbank', '한울금융', 'banker'], ['nuri', '누리소프트', 'dev'], ['daehan', '대한건설', 'builder'], ['garamstore', '가람유통', 'office'],
    ['hanulgames', '한울게임즈', 'dev'], ['hanultel', '한울통신', 'office'], ['haneul', '하늘항공', 'office'], ['hanulmedia', '한울방송', 'office']],
  단비: [['hanbit', '한빛전자 본사·공장', 'factory'], ['saebom', '새봄화학 본사·공장', 'factory']],
  별하항: [['byeolhafish', '별하수산', 'fisher']], 누리벌: [['nurigrain', '누리곡산', 'farmer']], 마루: [['byeolbit', '별빛제약 본사·연구소', 'researcher'], ['nuri', '누리소프트 연구소', 'dev']],
  아라항: [['bada', '바다해운 부두', 'docker'], ['bada', '바다해운 본사', 'office']], 푸른들: [['pureun', '푸른식품', 'farmer']],
  은빛포: [['eunbit', '은빛조선', 'shipbuilder']], 바람골: [['baram', '바람에너지', 'engineer']], 솔내: [['solnae', '솔내광업', 'miner']], 늘봄: [['neulbom', '늘봄리조트', 'hotel']],
};
const PLACE_NAME = { trucker: '물류센터', clerk: '마트', barista: '카페', cook: '식당', teacher: '학교', nurse: '병원', doctor: '병원', driver: '버스', civil: '시청', vendor: '전통시장', banker: '한울은행', hotel: '리조트', farmer: '농장', fisher: '선단', forester: '산림조합', miner: '광업소', shipbuilder: '조선소', engineer: '풍력발전소', docker: '부두', saltworker: '염전', office: '상사' };

function createWork() {
  function init(ctx) {
    const W = { emps: {}, local: {}, next: 1 };
    const add = (region, occ, cap, name, company) => {
      const key = `${region}:${name}`, ex = Object.values(W.emps).find(e => e.key === key && e.occ === occ);
      if (ex) { ex.cap += cap; return ex; }
      const e = { id: W.next++, key, region, occ, cap: Math.max(1, Math.round(cap)), name, company: company || null, gov: !!OCC[occ].gov, morale: 70 };
      W.emps[e.id] = e; ctx.ledger.open('e:' + e.id, e.cap * OCC[occ].wage * 20);   // 처음 운영 자금: 품삯 20일치
      return e;
    };
    for (const [region, R] of Object.entries(REGIONS)) {
      const jobs = R.pop * 0.6;   // 일하는 나이 사람 수만큼쯤
      const common = { clerk: 0.06, barista: 0.04, cook: 0.05, teacher: 0.05, nurse: 0.04, doctor: 0.015, driver: 0.03, civil: 0.03 };
      const loc = W.local[region] = {};
      for (const occ of COMMON_JOBS) { const e = add(region, occ, jobs * common[occ], `${region} ${PLACE_NAME[occ]}`); loc[{ clerk: 'mart', barista: 'cafe', cook: 'restaurant', nurse: 'hospital' }[occ]] = 'e:' + e.id; }
      const spec = jobs * 0.62 / R.jobs.length, companies = COMPANY_EMP[region] || [];
      R.jobs.forEach(occ => {
        const c = companies.filter(([, , o]) => o === occ);
        if (c.length) c.forEach(([cid, name]) => add(region, occ, spec / c.length, name, cid));
        else add(region, occ, spec, `${region} ${PLACE_NAME[occ] || OCC[occ].name}`);
      });
      if (R.jobs.includes('vendor')) loc.market = 'e:' + Object.values(W.emps).find(e => e.region === region && e.occ === 'vendor').id;
    }
    // 처음 사람들을 일터에 앉힘 (일하는 나이의 92%쯤)
    hire(ctx, W, true);
    return W;
  }
  const staffOf = (ctx, W) => {   // 일터별 지금 직원 수 (사람 쪽 emp가 기준)
    const c = {};
    for (const n of Object.values(ctx.S.people.list)) if (n.emp) c[n.emp] = (c[n.emp] || 0) + 1;
    return c;
  };
  // 채용: 지역마다 빈자리 ↔ 구직자. 실력(skill)+성실(c) 높은 사람부터. 자기 지역에 자리가 없으면 가끔 다른 지역으로 이사해서 지원
  function hire(ctx, W, first) {
    const staff = staffOf(ctx, W), P = ctx.S.people.list;
    const seekers = Object.values(P).filter(n => n.occ === 'jobless' && !n.emp).sort((a, b) => (b.skill + b.tr.c) - (a.skill + a.tr.c));
    const open = Object.values(W.emps).filter(e => (staff[e.id] || 0) < e.cap * (first ? 0.93 : 1));
    let hired = 0;
    for (const n of seekers) {
      if (!first && ctx.rnd(ctx.day, n.id, 81) > 0.06) continue;   // 일자리 찾기는 시간이 걸림 (하루 6%쯤 → 평균 2~3주)
      let e = open.find(e => e.region === n.region && (staff[e.id] || 0) < e.cap * (first ? 0.93 : 1));
      if (!e && !first && !n.spouse && ctx.day - (n.joblessSince ?? ctx.day) > 20 && ctx.rnd(ctx.day, n.id, 80) < 0.1) {
        e = open.find(e => (staff[e.id] || 0) < e.cap);
        if (e) { n.mem.unshift({ d: ctx.day, t: `일자리를 찾아 ${e.region}로 이사했다`, w: 5 }); n.region = e.region; }
      }
      if (!e) continue;
      const occ = OCC[e.occ];
      n.occ = e.occ; n.emp = e.id; n.wage = Math.round(occ.wage * (0.85 + n.skill * 0.3)); n.since = ctx.day; n.joblessSince = null;
      n.look.hat = null;
      if (!first) { n.mem.unshift({ d: ctx.day, t: `${e.name}에 취직했다`, w: 20 }); hired++; }
      staff[e.id] = (staff[e.id] || 0) + 1;
    }
    return hired;
  }
  // 하루 장사: 산업 일터는 바깥 수요에서 매출, 나라 일터는 나라에서 운영비. 돈이 모자라면 해고, 넉넉하면 자리 늘림
  function daily(ctx) {
    const W = ctx.S.work, staff = staffOf(ctx, W), econ = ctx.S.society || {}, demand = econ.demand ?? 1;
    const wx = weatherOf(ctx.day), seeking = {};
    for (const n of Object.values(ctx.S.people.list)) if (n.occ === 'jobless') seeking[n.region] = (seeking[n.region] || 0) + 1;
    for (const e of Object.values(W.emps)) {
      const occ = OCC[e.occ], s = staff[e.id] || 0, payroll = s * occ.wage, acc = 'e:' + e.id;
      if (e.gov) ctx.ledger.move('gov', acc, payroll);                                                         // 나라 일터
      else if (!['clerk', 'barista', 'cook', 'vendor'].includes(e.occ)) {                                      // 산업 일터: 바깥 수요
        const weatherK = occ.weather?.includes(wx) ? 0.15 : 1, sectorK = econ.sector?.[occ.sector] ?? 1;
        const sales = payroll * 1.15 * demand * weatherK * sectorK * (econ.extK ?? 1) * (0.9 + ctx.rnd(ctx.day, e.id, 90) * 0.2);
        ctx.ledger.move('ext', acc, sales); ctx.ledger.move(acc, 'gov', sales * 0.08);   // 매출의 8%는 세금(법인세·부가세)
      }
      const bal = ctx.ledger.bal(acc), unpaid = e.unpaid || 0; e.unpaid = 0;
      e.morale = ctx.clamp(e.morale * 0.9 + (bal > payroll * 5 ? 75 : bal > payroll ? 55 : 25) * 0.1 - unpaid * 2, 0, 100, 60);
      // 어려우면 실력 낮은 사람부터 내보냄 (하루 최대 10%), 넉넉하면 자리 늘림 (처음 자리의 1.5배까지)
      if (!e.gov && bal < payroll * 2 && s > 1) {
        const out = Object.values(ctx.S.people.list).filter(n => n.emp === e.id).sort((a, b) => a.skill - b.skill).slice(0, Math.max(1, Math.floor(s * 0.1)));
        for (const n of out) { n.mem.unshift({ d: ctx.day, t: `${e.name}에서 일자리를 잃었다`, w: -20 }); n.occ = 'jobless'; n.emp = null; n.wage = 0; n.joblessSince = ctx.day; }
        if (e.company && out.length >= 3) ctx.emit({ type: 'layoff', scale: 'regional', region: e.region, text: `${e.name}, 경영난에 직원 ${out.length}명 내보내`, up: false, fx: { [e.company]: -3 } });
      } else if (bal > payroll * 30 && seeking[e.region] > 0 && e.cap < (e.cap0 ??= e.cap) * 1.5) e.cap++;
      // 가게·일터에 쌓인 돈은 재료비·임대료·주인 몫으로 바깥에 (운영 자금 10일치를 넘는 만큼의 20%)
      if (!e.gov && bal > payroll * 10 + 100000) { const out = (bal - payroll * 10) * 0.2; ctx.ledger.move(acc, 'ext', out * 0.7); ctx.ledger.move(acc, 'gov', out * 0.3); }
      // 직원 사기가 바닥이면 파업 (상장 회사면 주가에도)
      if (e.company && e.morale < 15 && ctx.rnd(ctx.day, e.id, 91) < 0.2) ctx.emit({ type: 'strike', scale: 'regional', region: e.region, text: `${e.name} 직원들 파업… 월급 밀려`, up: false, fx: { [e.company]: -5 } });
    }
    const hired = hire(ctx, W, false);
    W.hiredToday = hired;
  }
  // 매일 검사: 없는 일터를 가리키는 사람·일하는 나이가 아닌데 일터가 있는 사람
  function check(ctx) {
    let fixed = 0;
    for (const n of Object.values(ctx.S.people.list)) {
      if (n.emp && !ctx.S.work.emps[n.emp]) { n.emp = null; n.occ = 'jobless'; n.joblessSince = ctx.day; fixed++; }
      if (n.emp && !OCC[n.occ]) { n.emp = null; fixed++; }
    }
    return fixed;
  }
  return { name: 'work', every: 1440, init, daily, check, coarse(ctx, days) { for (let i = 0; i < Math.min(days, 7); i++) daily({ ...ctx, day: ctx.day + i }); } };
}

module.exports = { createWork };
