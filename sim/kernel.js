'use strict';
// ===== 세계 시뮬레이션 커널 =====
// 모듈(사람·일·사건·사회 …)을 정해진 순서와 주기로 돌리는 심장. 모듈끼리는 서로 직접 부르지 않고 "사건 버스"와 "돈 장부"로만 주고받음
//
// 24시간 쉬지 않고 돌아도 무너지지 않게:
//   1) 결정적 난수 — 난수는 (시각, 대상, 용도)로 정해지는 고정값. 같은 상태에서 다시 돌리면 같은 결과(재현·디버깅 가능)
//   2) 시간 예산 — 한 번에 쓰는 시간을 정해 두고(기본 40ms) 넘으면 다음 차례로 미룸 → 서버가 멈추지 않음
//   3) 고장 격리 — 모듈 하나가 오류를 내도 그 모듈만 멈춤(하루 5번 넘게 실패하면 다음 날까지 끔), 나머지는 계속 돔
//   4) 사건 감쇠 — 사건이 다른 사건을 부를 때마다 힘(energy)이 절반으로 줄고, 약하면 버림 + 종류마다 하루 횟수 제한 → 작은 일이 끝없이 커지지 않음
//   5) 돈 보존 — 모든 돈은 장부의 계좌 사이를 옮겨 다닐 뿐 저절로 생기거나 사라지지 않음(합계 검사)
//   6) 매일 건강 검사 — 모듈마다 자기 상태를 검사·자동 수리(check), 커널은 결과를 기록
//   7) 따라잡기 — 서버가 오래 꺼져 있었으면 하루 단위로 굵게 건너뜀(coarse), 그 뒤 분 단위로
//   8) 안전한 저장 — 임시 파일에 쓰고 바꿔 넣기 + 하루 한 번 백업 3개를 돌려 가며 보관, 깨진 파일이면 백업에서 불러옴
const { hash, DAY } = require('../world.js');

// 결정적 난수 0~1: rnd(시각 또는 날짜, 대상 번호, 용도 번호)
const rnd = (a, b, c = 0) => hash(a | 0, b | 0, c | 0);
// 범위 안으로 (NaN이면 기본값)
const clamp = (v, lo, hi, dflt = lo) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

function createKernel({ file, read, write, backups = 3 }) {
  const loaded = read(file);
  const state = loaded && loaded.v === 1 ? loaded : (() => {   // 깨졌거나 없으면 백업에서
    for (let i = 0; i < backups; i++) { const b = read(`${file}.bak${i}`); if (b && b.v === 1) return b; }
    return { v: 1, min: null, mods: {}, ledger: {}, news: [], health: [] };
  })();
  const modules = [], subs = new Map(), queue = [];
  const runtime = { fails: {}, off: {}, deferred: 0, lastMs: 0, savedAt: 0, dirty: false };

  // ----- 돈 장부: 계좌(문자열) → 원(정수). 옮기기만 가능, 합계는 늘 같음 -----
  const ledger = {
    bal: id => state.ledger[id] || 0,
    open(id, amount = 0) { if (!(id in state.ledger)) { state.ledger[id] = 0; if (amount) ledger.move('ext', id, amount); } },   // 새 계좌: 처음 돈은 바깥(ext)에서
    move(from, to, amount) {   // 성공하면 true. 돈이 모자라면 옮기지 않음(ext·gov는 빚을 질 수 있음)
      amount = Math.round(amount);
      if (!(amount > 0) || from === to) return false;
      if (from !== 'ext' && from !== 'gov' && ledger.bal(from) < amount) return false;
      state.ledger[from] = ledger.bal(from) - amount; state.ledger[to] = ledger.bal(to) + amount;
      return true;
    },
    close(id, heir = 'gov') { const b = ledger.bal(id); if (b > 0) ledger.move(id, heir, b); else if (b < 0) ledger.move(heir, id, -b); delete state.ledger[id]; },
    total: () => Object.values(state.ledger).reduce((a, b) => a + b, 0),
  };
  if (!('ext' in state.ledger)) { state.ledger.ext = 0; state.ledger.gov = 0; }

  // ----- 사건 버스: emit → 하루 횟수 제한·감쇠를 거쳐 구독자에게. 구독자가 돌려준 사건은 힘이 절반인 후속 사건 -----
  const LIMIT = { micro: 400, local: 6, regional: 3, national: 1 };   // 규모마다 하루 최대
  const SCALE_NEWS = new Set(['local', 'regional', 'national']);
  function emit(e) { queue.push({ energy: 1, depth: 0, scale: 'micro', ...e }); }
  function on(type, fn) { if (!subs.has(type)) subs.set(type, []); subs.get(type).push(fn); }
  function flush(ctx) {
    let guard = 0;
    while (queue.length && guard++ < 200) {
      const e = queue.shift();
      if (e.energy < 0.15 || e.depth > 3) continue;                                    // 약해진 후속 사건은 버림
      const day = Math.floor(ctx.min / DAY), key = `${day}:${e.scale}`;
      state.count ||= {}; if (!state.count[key]) { for (const k of Object.keys(state.count)) if (!k.startsWith(day + ':')) delete state.count[k]; state.count[key] = 0; }
      if (++state.count[key] > LIMIT[e.scale]) continue;                                 // 규모마다 하루 횟수 제한
      if (SCALE_NEWS.has(e.scale) && e.text) { state.news.unshift({ min: ctx.min, scale: e.scale, region: e.region || null, text: e.text, up: e.up ?? null }); state.news.length = Math.min(state.news.length, 80); }
      for (const fn of [...(subs.get(e.type) || []), ...(subs.get('*') || [])]) {
        try {
          const follow = fn(e, ctx);
          for (const f of [].concat(follow || [])) queue.push({ scale: e.scale, ...f, energy: e.energy * 0.5 * (f.energy ?? 1), depth: e.depth + 1 });
        } catch (err) { console.error('[sim] 사건 처리 오류', e.type, err.message); }
      }
    }
    queue.length = 0;
  }

  // ----- 모듈 -----
  // { name, every: 몇 분마다 tick, init(ctx) → 처음 상태, tick(ctx), daily(ctx), coarse(ctx, days), check(ctx) → 고친 수 }
  function use(mod) { modules.push(mod); }
  const ctxOf = (min, mod) => ({ min, day: Math.floor(min / DAY), t: min - Math.floor(min / DAY) * DAY, S: state.mods, my: mod && state.mods[mod.name], rnd, clamp, emit, ledger, kernel: api });
  function run(mod, step, min, ...args) {
    if (!mod[step] || runtime.off[mod.name] === Math.floor(min / DAY)) return;
    try { mod[step](ctxOf(min, mod), ...args); }
    catch (err) {
      const n = runtime.fails[mod.name] = (runtime.fails[mod.name] || 0) + 1;
      console.error(`[sim] ${mod.name}.${step} 오류 (${n}번째):`, err.stack || err.message);
      if (n >= 5) { runtime.off[mod.name] = Math.floor(min / DAY); runtime.fails[mod.name] = 0; addHealth(min, `${mod.name} 모듈이 계속 실패해 오늘은 멈춤`); }
    }
  }
  function init(nowMin) {
    for (const m of modules) if (!state.mods[m.name]) { state.mods[m.name] = {}; if (m.init) state.mods[m.name] = m.init(ctxOf(Math.floor(nowMin), m)) || {}; }
    if (state.min == null) state.min = Math.floor(nowMin) - 1;
    state.total0 ??= ledger.total();
  }
  const addHealth = (min, text) => { state.health.unshift({ min, text }); state.health.length = Math.min(state.health.length, 30); };

  // 매일 0시: 모듈별 하루 일 + 건강 검사(자동 수리) + 돈 합계 검사
  function dailyCheck(min) {
    let fixed = 0;
    for (const m of modules) if (m.check) { try { fixed += m.check(ctxOf(min, m)) || 0; } catch (err) { console.error('[sim] 검사 오류', m.name, err.message); } }
    const drift = ledger.total() - state.total0;
    if (drift) { state.ledger.ext -= drift; fixed++; addHealth(min, `돈 합계가 ${drift}원 어긋나 바로잡음`); }
    if (fixed) addHealth(min, `건강 검사: ${fixed}곳 자동 수리`);
    state.lastCheck = { min, fixed };
  }

  // 세계 시각(분)까지 진행. 예산(ms)을 넘으면 멈췄다가 다음 호출에서 이어감
  function advance(nowMin, budgetMs = 40) {
    const now = Math.floor(nowMin), t0 = Date.now();
    if (now - state.min > DAY * 2) {   // 오래 꺼져 있었음: 하루 단위로 굵게 건너뜀(최대 30일), 마지막 하루는 분 단위로
      const days = Math.min(30, Math.floor((now - state.min) / DAY) - 1);
      for (const m of modules) run(m, 'coarse', state.min, days);
      state.min = now - DAY;
      addHealth(now, `서버가 꺼져 있던 ${days}일을 하루 단위로 건너뜀`);
    }
    while (state.min < now) {
      if (Date.now() - t0 > budgetMs) { runtime.deferred++; break; }
      const min = ++state.min;
      if (min % DAY === 0) { for (const m of modules) run(m, 'daily', min); dailyCheck(min); }
      for (const m of modules) if (min % (m.every || 1) === 0) run(m, 'tick', min);
      flush(ctxOf(min));
      runtime.dirty = true;
    }
    runtime.lastMs = Date.now() - t0;
    if (runtime.dirty && Date.now() - runtime.savedAt > 15000) save();
  }
  function save() {
    write(file, state); runtime.dirty = false; runtime.savedAt = Date.now();
    const day = Math.floor(state.min / DAY);
    if (state.backupDay !== day) { state.backupDay = day; write(`${file}.bak${day % backups}`, state); }
  }
  const api = { state, use, on, emit, init, advance, save, ledger, runtime, rnd, clamp };
  return api;
}

module.exports = { createKernel, rnd, clamp };
