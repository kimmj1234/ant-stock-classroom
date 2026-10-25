'use strict';
// ===== 내 일자리 (서버): 구인 공고 · 지원 · 출퇴근 · 급여 · 지각/결근 · 승진/해고 =====
// 일터는 세계 시뮬레이션(sim/)의 실제 일터 중 맵에 출근 자리가 있는 곳(workplaces.js). 취직하면 그 일터 자리를 하나 차지하고 NPC 동료와 같이 일함
// 현실처럼:
//   · 근무 시간에 직접 일터 앞에 가서 출근해야 일한 것으로 침. 시작 10분 넘어 출근하면 지각, 근무일에 안 오면 결근
//   · 근무 끝 시각이 되면 자동 퇴근(창을 닫아도 일한 시간은 계산). 일찍 퇴근하면 일한 만큼만
//   · 급여: 정규직은 매달 25일 월급(4대보험·소득세 9.4% 공제), 알바는 매주 금요일 주급(3.3% 공제). 급여는 그 일터 돈에서 나감
//   · 30일 안에 결근 3번이면 해고, 월급날까지 결근 없이 20일 넘게 나오면 시급 5% 인상(처음의 1.5배까지)
const { DAY, doyOf, monthDay, weekdayOf } = require('./world.js');
const { OCC } = require('./sim/data.js');
const { WORKPLACES } = require('./workplaces.js');

const PART = new Set(['clerk', 'barista', 'cook', 'vendor']);   // 알바(시간제)
const MIN_WAGE = 10030;                                           // 최저시급
// 지원 조건 (능력치 레벨): 사무·전문직은 지능, 현장직은 근력
const REQ = { office: ['smarts', 2], dev: ['smarts', 3], banker: ['smarts', 3], researcher: ['smarts', 4], teacher: ['smarts', 3], nurse: ['smarts', 3], doctor: ['smarts', 6], civil: ['smarts', 2],
  builder: ['strength', 2], fisher: ['strength', 2], docker: ['strength', 2], factory: ['strength', 1], farmer: ['strength', 1], trucker: ['strength', 1], driver: ['strength', 1] };
const STAT_NAME = { smarts: '지능', strength: '근력' };
const WP = Object.fromEntries(WORKPLACES.map(w => [w.key, w]));
const REST = [0, 1];   // 주말에도 여는 일터(가게·병원·시장…)의 내 쉬는 날: 월·화

const won = n => Math.round(n).toLocaleString('ko-KR');
const hourlyOf = occ => Math.max(MIN_WAGE, Math.round(OCC[occ].wage / (OCC[occ].to - OCC[occ].from)));
const isWorkday = (job, day) => { const wd = weekdayOf(day); return OCC[job.occ].weekend ? !REST.includes(wd) : wd < 5; };
const shift = (job, day) => ({ start: day * DAY + job.from * 60, end: day * DAY + job.to * 60 });
const daysText = occ => (OCC[occ].weekend ? '수~일 (월·화 휴무)' : '월~금 (주말 휴무)');
const pad = n => String(n).padStart(2, '0');

function createJobs({ accounts, save, sim, lifeOf }) {
  // 알림함: 번호를 붙여 쌓고(최근 30개), 휴대폰·화면이 아직 안 본 번호부터 꺼내 감
  const inbox = (a, min, text) => { a.inboxN = (a.inboxN || 0) + 1; a.inbox = [...(a.inbox || []), { id: a.inboxN, min: Math.floor(min), text }].slice(-30); };

  // 구인 공고: 빈자리가 있는 일터 (지금 지역 먼저)
  function postings(a, region) {
    const stats = lifeOf(a).stats;
    return sim.employers().filter(e => WP[e.key] && e.staff < Math.floor(e.cap) && !(a.job && a.job.emp === e.id)).map(e => {
      const occ = OCC[e.occ], req = REQ[e.occ], hourly = hourlyOf(e.occ), part = PART.has(e.occ);
      return {
        emp: e.id, name: e.name, region: e.region, where: WP[e.key].where, title: occ.name, part, hourly,
        hours: `${pad(occ.from)}:00~${pad(occ.to)}:00`, days: daysText(e.occ), openings: Math.floor(e.cap) - e.staff,
        pay: part ? `시급 ${won(hourly)}원 · 주급` : `월 약 ${won(hourly * (occ.to - occ.from) * 21.7)}원 · 월급`,
        req: req ? `${STAT_NAME[req[0]]} Lv${req[1]} 이상` : '조건 없음', ok: !req || (stats[req[0]] || 0) >= req[1],
      };
    }).sort((x, y) => (y.region === region) - (x.region === region) || y.hourly - x.hourly);
  }

  // 날이 바뀐 만큼 정산: 자동 퇴근 · 결근 · 급여일 · 해고
  function settle(a, now) {
    const job = a.job;
    if (!job) return;
    if (a.work) { const { end } = shift(job, a.work.day); if (now >= end) clockOut(a, now, true); }
    const today = Math.floor(now / DAY);
    for (let d = (job.checked ?? job.since) + 1; d <= today; d++) {
      const prev = d - 1;   // 어제 근무일에 안 나왔으면 결근 (취직한 날은 빼고)
      if (prev > job.since && isWorkday(job, prev) && job.attended !== prev && !job.absentDays?.includes(prev)) {
        job.absentDays = [...(job.absentDays || []), prev].filter(x => x > d - 31);
        inbox(a, d * DAY, `${job.name}에 결근했어요. (최근 30일 ${job.absentDays.length}번)`);
        if (job.absentDays.length >= 3) { inbox(a, d * DAY, `결근이 잦아 ${job.name}에서 해고됐어요.`); payOut(a, d * DAY, '마지막 급여'); quit(a, d * DAY, true); return; }
      }
      const [, date] = monthDay(doyOf(d));
      if (job.part ? weekdayOf(d) === 4 : date === 25) payOut(a, d * DAY, job.part ? '주급' : '월급');
      job.checked = d;
    }
  }
  // 급여 지급: 쌓인 급여 - 공제 → 현금. 명세서를 남기고 승진 확인
  function payOut(a, min, label) {
    const job = a.job;
    if (!job || !(job.earned > 0)) return;
    const gross = Math.round(job.earned), rate = job.part ? 0.033 : 0.094, tax = Math.round(gross * rate), net = gross - tax;
    a.cash = lifeOf(a).cash + net;
    sim.payPlayer(job.emp, gross);
    a.payslips = [...(a.payslips || []), { min: Math.floor(min), label, name: job.name, hours: +(job.worked / 60).toFixed(1), gross, tax, net, rate }].slice(-12);
    inbox(a, min, `${label} ${won(net)}원이 들어왔어요! (${job.name}, 세금·보험 ${won(tax)}원 공제)`);
    if (!job.part && (job.daysSinceRaise || 0) >= 20 && !(job.absentDays || []).length && job.hourly < job.base * 1.5) {
      job.hourly = Math.round(job.hourly * 1.05); job.daysSinceRaise = 0;
      inbox(a, min, `성실하게 일해서 시급이 ${won(job.hourly)}원으로 올랐어요!`);
    }
    job.earned = 0; job.worked = 0;
  }
  function apply(a, who, empId, now) {
    if (a.job) return { ok: false, msg: `이미 ${a.job.name}에 다니고 있어요. 먼저 그만둬야 해요.` };
    const e = sim.employers().find(e => e.id === empId);
    if (!e || !WP[e.key]) return { ok: false, msg: '없는 공고예요.' };
    if (e.staff >= Math.floor(e.cap)) return { ok: false, msg: '방금 자리가 다 찼어요.' };
    const req = REQ[e.occ], stats = lifeOf(a).stats;
    if (req && (stats[req[0]] || 0) < req[1]) return { ok: false, msg: `${STAT_NAME[req[0]]}이 Lv${req[1]} 이상이어야 해요. (지금 Lv${stats[req[0]] || 0}) 가방의 능력치에서 키울 수 있어요.` };
    const occ = OCC[e.occ], day = Math.floor(now / DAY), hourly = hourlyOf(e.occ);
    a.job = { emp: e.id, key: e.key, name: e.name, occ: e.occ, title: occ.name, region: e.region, part: PART.has(e.occ), from: occ.from, to: occ.to, hourly, base: hourly, since: day, checked: day, earned: 0, worked: 0, late: 0, absentDays: [], attended: null, daysSinceRaise: 0 };
    a.work = null; a.whoKey = who;
    sim.hirePlayer(e.id, who);
    inbox(a, now, `${e.name}에 ${occ.name}(으)로 취직했어요! ${daysText(e.occ)} ${pad(occ.from)}:00~${pad(occ.to)}:00 근무예요.`);
    return { ok: true };
  }
  function quit(a, now, fired) {
    if (!a.job) return { ok: false, msg: '다니는 일터가 없어요.' };
    if (a.work) clockOut(a, now, true);
    if (!fired) payOut(a, now, '마지막 급여');
    sim.firePlayer(a.job.emp, a.whoKey);
    if (!fired) inbox(a, now, `${a.job.name}을(를) 그만뒀어요.`);
    a.job = null; a.work = null;
    return { ok: true };
  }
  function clockIn(a, now) {
    const job = a.job;
    if (!job) return { ok: false, msg: '다니는 일터가 없어요.' };
    if (a.work) return { ok: false, msg: '이미 근무 중이에요.' };
    const day = Math.floor(now / DAY), { start, end } = shift(job, day);
    if (!isWorkday(job, day)) return { ok: false, msg: `오늘은 쉬는 날이에요. (${daysText(job.occ)})` };
    if (now < start - 60) return { ok: false, msg: `아직 출근 시간이 아니에요. ${pad(job.from)}:00 근무 (한 시간 전부터 출근할 수 있어요)` };
    if (now >= end - 30) return { ok: false, msg: '오늘 근무가 거의 끝났어요. 내일 늦지 않게 와요!' };
    if (job.attended === day) return { ok: false, msg: '오늘은 이미 출근했다가 퇴근했어요.' };
    const late = now > start + 10;
    if (late) job.late = (job.late || 0) + 1;
    job.attended = day; job.daysSinceRaise = (job.daysSinceRaise || 0) + 1;
    a.work = { in: Math.floor(now), day };
    return { ok: true, late, msg: late ? `${Math.round(now - start)}분 지각이에요! 다음엔 일찍 와요.` : '출근했어요. 오늘도 힘내요!' };
  }
  // 퇴근: 근무 시간 안에서 일한 만큼 급여가 쌓임 (자동이면 근무 끝 시각으로)
  function clockOut(a, now, auto) {
    const job = a.job, w = a.work;
    if (!job || !w) return { ok: false, msg: '근무 중이 아니에요.' };
    const { start, end } = shift(job, w.day), out = Math.min(now, end), mins = Math.max(0, Math.round(out - Math.max(w.in, start)));
    const pay = Math.round(mins / 60 * job.hourly);
    job.worked += mins; job.earned += pay; a.work = null;
    const early = !auto && mins < (end - start) / 2;   // 반나절도 안 일하고 나가면 출근으로 안 쳐줌 (다시 와서 일하지 않으면 결근)
    if (early) { job.attended = null; job.daysSinceRaise = Math.max(0, (job.daysSinceRaise || 0) - 1); }
    const msg = `${auto ? '근무 시간이 끝나서 퇴근했어요.' : '퇴근했어요.'} ${Math.floor(mins / 60)}시간 ${mins % 60}분 일해서 ${won(pay)}원이 쌓였어요.${early ? ' 근무 시간의 절반도 안 돼서 오늘은 결근으로 쳐요. 다시 출근할 수 있어요.' : ''}`;
    if (auto) inbox(a, out, msg);
    return { ok: true, mins, pay, msg };
  }
  // 휴대폰 "내 일"·근무 화면에 보낼 것
  function view(a, now) {
    const job = a.job;
    if (!job) return { job: null, payslips: a.payslips || [] };
    const day = Math.floor(now / DAY), { start, end } = shift(job, day), wp = WP[job.key];
    let next = null;   // 다음 근무 시작 (오늘 아직이면 오늘)
    for (let d = day; d < day + 8 && !next; d++) if (isWorkday(job, d) && (d > day || (now < end - 30 && job.attended !== day))) next = shift(job, d).start;
    return {
      job: { ...job, where: wp?.where, scene: wp?.scene, x: wp?.x, y: wp?.y, days: daysText(job.occ), hours: `${pad(job.from)}:00~${pad(job.to)}:00`, coworkers: sim.coworkers(job.emp),
        workday: isWorkday(job, day), start, end, next, payday: job.part ? '매주 금요일 주급' : '매달 25일 월급' },
      work: a.work, payslips: a.payslips || [],
    };
  }
  // 새 알림(아직 안 본 것)을 꺼내고 본 것으로 표시
  function takeInbox(a) { const list = (a.inbox || []).filter(m => m.id > (a.inboxSeen || 0)); a.inboxSeen = a.inboxN || 0; return list; }
  // 서버를 켤 때: 일하는 계정을 세계 시뮬레이션 일터에 다시 앉힘(시뮬레이션이 새로 시작됐어도)
  function restore() { for (const [key, a] of Object.entries(accounts)) if (a.job) { a.whoKey = key; if (!sim.hirePlayer(a.job.emp, key)) { a.job = null; a.work = null; } } }
  return { postings, apply, quit, clockIn, clockOut, settle, view, takeInbox, restore };
}

module.exports = { createJobs };

// 스스로 검사: node jobs.js → 가짜 일터로 취직 → 지각 출근 → 자동 퇴근 → 월급날 → 결근 3번 해고
if (require.main === module) {
  const assert = require('assert');
  const emps = [{ id: 1, key: '한가람:한울금융', name: '한울금융', region: '한가람', occ: 'banker', cap: 10, staff: 5 }];
  let paid = 0;
  const sim = { employers: () => emps, hirePlayer: () => true, firePlayer: () => {}, payPlayer: (id, n) => { paid += n; return true; }, coworkers: () => ['가', '나'] };
  const a = { cash: 50000, stats: { smarts: 3, strength: 1 } }, lifeOf = x => ({ cash: x.cash ?? 50000, stats: x.stats });
  const J = createJobs({ accounts: { me: a }, sim, lifeOf });
  const d0 = 1;   // 1일째(화요일) 3월 2일
  assert.ok(J.postings(a, '한가람').length === 1);
  assert.ok(!J.apply({ stats: { smarts: 1 } }, 'x', 1, d0 * DAY).ok, '지능 모자라면 탈락');
  assert.ok(J.apply(a, 'me', 1, d0 * DAY + 480).ok, '취직');
  const d1 = d0 + 1;   // 수요일
  assert.ok(!J.clockIn(a, d1 * DAY + 6 * 60).ok, '너무 일찍은 안 됨');
  const r = J.clockIn(a, d1 * DAY + 9 * 60 + 20); assert.ok(r.ok && r.late, '20분 지각');
  J.settle(a, d1 * DAY + 17 * 60);   // 근무 끝(16시) 지나면 자동 퇴근
  assert.strictEqual(a.work, null); assert.ok(a.job.earned > 0, '급여 쌓임');
  const earned = a.job.earned;
  // 25일(월급날)까지: 3월 25일 = 24일째. 그 사이 근무일 결근이 3번 넘으면 해고되므로, 하루 빼고 출근
  for (let d = d1 + 1; d < 24; d++) { J.settle(a, d * DAY + 8 * 60); if (a.job && d !== d1 + 1) { const c = J.clockIn(a, d * DAY + 8 * 60 + 55); if (c.ok) J.clockOut(a, d * DAY + 16 * 60); } }
  J.settle(a, 24 * DAY + 60);
  assert.ok(a.payslips?.length === 1 && a.cash > 50000, '25일 월급 입금');
  assert.ok(paid > earned, '일터 돈에서 나감');
  for (let d = 25; d < 40 && a.job; d++) J.settle(a, d * DAY + 60);   // 이제 안 나감 → 결근 3번 → 해고
  assert.strictEqual(a.job, null, '결근 3번 해고');
  console.log('알림:', J.takeInbox(a).map(m => m.text).join(' / '));
  console.log('ok');
}
