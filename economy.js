'use strict';
// ===== 경제: 회사 주식 시장 (서버만 씀, 모든 사람이 같은 시세) =====
// 게임 1분마다(현실 20초) 장이 열려 있으면 회사마다 가격이 조금씩 움직임 = 업종마다 다른 흔들림 + 뉴스(날씨·사건) 영향
// 현실 한국 거래소처럼: 평일 09:00~15:30만 거래, 호가 단위(가격대마다 1·5·10·50·100·500·1000원), 하루 상한·하한 ±30%
// 장이 닫혀 있을 때 난 뉴스는 다음 날 장이 열릴 때 한꺼번에 반영(갭) → 그 뒤 30분쯤에 걸쳐 나머지가 반영됨
const { DAY, doyOf, monthDay, weekdayOf, weatherOf, JANGMA, MARKET_OPEN, MARKET_CLOSE, marketOpen } = require('./world.js');

// 상장 회사: 아이디 → 이름 · 업종 · 본사 지역 · 처음 가격 · 하루 변동성(%)
// 회사마다 어울리는 지역에 본사: 수도 한가람은 금융·통신·방송·유통·게임·IT·건설·항공, 나머지는 그 지역 산업 (country.js 지역 특색과 같음)
const COMPANIES = [
  { id: 'nuri', name: '누리소프트', sector: 'IT', region: '한가람', price: 38500, vol: 2.6 },
  { id: 'daehan', name: '대한건설', sector: '건설', region: '한가람', price: 18200, vol: 2.0 },
  { id: 'haneul', name: '하늘항공', sector: '항공', region: '한가람', price: 15600, vol: 2.0 },
  { id: 'hanulbank', name: '한울금융', sector: '금융', region: '한가람', price: 42000, vol: 1.4 },
  { id: 'hanultel', name: '한울통신', sector: '통신', region: '한가람', price: 28500, vol: 1.1 },
  { id: 'hanulmedia', name: '한울방송', sector: '미디어', region: '한가람', price: 12300, vol: 2.4 },
  { id: 'garamstore', name: '가람유통', sector: '유통', region: '한가람', price: 21800, vol: 1.6 },
  { id: 'hanulgames', name: '한울게임즈', sector: '게임', region: '한가람', price: 51200, vol: 3.2 },
  { id: 'hanbit', name: '한빛전자', sector: '전자', region: '단비', price: 72000, vol: 1.8 },
  { id: 'saebom', name: '새봄화학', sector: '화학', region: '단비', price: 31000, vol: 1.8 },
  { id: 'bada', name: '바다해운', sector: '해운', region: '아라항', price: 23400, vol: 2.2 },
  { id: 'byeolbit', name: '별빛제약', sector: '제약', region: '마루', price: 54000, vol: 3.0 },
  { id: 'pureun', name: '푸른식품', sector: '식품', region: '푸른들', price: 9800, vol: 1.2 },
  { id: 'byeolhafish', name: '별하수산', sector: '수산', region: '별하항', price: 6450, vol: 2.2 },
  { id: 'nurigrain', name: '누리곡산', sector: '농업', region: '누리벌', price: 4820, vol: 2.0 },
  { id: 'eunbit', name: '은빛조선', sector: '조선', region: '은빛포', price: 26700, vol: 2.3 },
  { id: 'baram', name: '바람에너지', sector: '에너지', region: '바람골', price: 8900, vol: 2.4 },
  { id: 'solnae', name: '솔내광업', sector: '광업', region: '솔내', price: 3650, vol: 2.6 },
  { id: 'neulbom', name: '늘봄리조트', sector: '관광', region: '늘봄', price: 15400, vol: 2.2 },
];
const BY_ID = Object.fromEntries(COMPANIES.map(c => [c.id, c]));
const inSector = (...sectors) => COMPANIES.filter(c => sectors.includes(c.sector)).map(c => c.id);

// 호가 단위 (한국 거래소 기준)
const tickOf = p => p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000;
const toTick = p => { const t = tickOf(p); return Math.max(t, Math.round(p / t) * t); };
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];

// ===== 날씨 → 업종 영향 (하루 %, 아침 8시에 날씨 뉴스) =====
// 비: 고기잡이·공사 쉼 / 장마: 공사·농사 피해 / 태풍: 배·비행기 못 뜸 / 눈: 공사·비행기 / 황사: 마스크·약 잘 팔림 / 가뭄(맑은 날 6일 넘게, 4~8월): 농사 피해
function weatherNews(day) {
  const wx = weatherOf(day), d = doyOf(day), [m] = monthDay(d);
  if (wx === 'storm') return { text: '태풍 상륙… 배·비행기 발 묶여 해운·항공·수산주 약세, 공사 현장도 멈춰', fx: { 수산: -6, 해운: -4, 항공: -4, 건설: -2, 농업: -3, 관광: -3, 조선: -1.5 } };
  if (wx === 'rain' && JANGMA(d)) return { text: '장마 이어져… 공사 지연·농작물 피해 우려에 건설·농업주 약세', fx: { 건설: -1.5, 농업: -1.2, 수산: -1.5 } };
  if (wx === 'rain') return { text: '전국에 비… 고깃배 출항 못 해 수산주 약세', fx: { 수산: -2.5, 건설: -0.8, 항공: -0.5, 관광: -1 } };
  if (wx === 'snow') return { text: '눈 쌓여 공사 현장 멈추고 항공편 지연… 건설·항공주 약세', fx: { 건설: -2, 항공: -1.5, 유통: 0.5 } };
  if (wx === 'dust') return { text: '황사 기승… 마스크·호흡기 약 판매 늘어 제약주 강세', fx: { 제약: 1.5, 항공: -0.8 } };
  if (wx === 'sun' && m >= 4 && m <= 8) {
    let n = 0; while (n < 30 && weatherOf(day - n) === 'sun') n++;
    if (n >= 6) return { text: `맑은 날 ${n}일째 이어져 가뭄 걱정… 농업·식품주 약세`, fx: { 농업: -2, 식품: -1 } };
  }
  return null;
}

// ===== 사건 뉴스: 게임 하루에 한두 번쯤 무작위로 (장이 닫혀 있어도 남, 영향은 장이 열릴 때) =====
// 영향(%)은 범위 안에서 무작위. ids를 고르는 함수로 어느 회사(업종)가 영향을 받는지 정함
const TECH = { 전자: ['차세대 반도체', '접는 화면', '초고속 메모리'], IT: ['인공지능 비서', '보안 기술', '클라우드 서비스'], 제약: ['신약 후보 물질', '독감 치료제', '새 백신'], 통신: ['초고속 통신망', '위성 인터넷'], 게임: ['대작 게임', '가상현실 게임'] };
const EVENTS = [
  { w: 3, make: () => { const c = pick(COMPANIES.filter(c => TECH[c.sector])); const v = rand(6, 15); return { text: `${c.name}, ${pick(TECH[c.sector])} 개발 성공 발표`, fx: { [c.id]: v } }; } },
  { w: 2, make: () => { const c = BY_ID.byeolbit, ok = Math.random() < 0.55, v = rand(10, 22); return ok ? { text: `${c.name} 신약 임상시험 성공… 기대감 커져`, fx: { [c.id]: v } } : { text: `${c.name} 신약 임상시험 실패`, fx: { [c.id]: -v } }; } },
  { w: 2, make: () => { const c = pick([BY_ID.saebom, BY_ID.hanbit]); return { text: `${c.name} 단비공장 화재… 생산 차질`, fx: { [c.id]: -rand(5, 12) } }; } },
  { w: 2, make: () => { const c = pick([BY_ID.daehan, BY_ID.bada]); return { text: `${c.name}, 해외에서 대형 ${c.sector === '건설' ? '공사' : '운송'} 계약 따내`, fx: { [c.id]: rand(5, 10) } }; } },
  { w: 3, make: () => { const c = pick(COMPANIES), up = Math.random() < 0.55, v = rand(3, 8); return { text: `${c.name} 분기 실적 ${up ? '예상보다 좋아' : '기대에 못 미쳐'}`, fx: { [c.id]: up ? v : -v } }; } },
  { w: 2, make: () => { const up = Math.random() < 0.5, k = up ? -1 : 1; return { text: `국제 기름값 ${up ? '급등' : '하락'}… 항공·해운·화학 ${up ? '부담' : '숨통'}`, fx: { 항공: 4 * k, 해운: 3 * k, 화학: 2 * k } }; } },
  { w: 2, make: () => Math.random() < 0.5 ? { text: '별하항 앞바다 고등어 풍어… 어획량 크게 늘어', fx: { 수산: rand(4, 8) } } : { text: '서해 적조 번져… 양식장·어장 피해', fx: { 수산: -rand(4, 8) } } },
  { w: 2, make: () => Math.random() < 0.5 ? { text: '누리벌 풍년 기대… 벼 작황 좋아', fx: { 농업: rand(3, 6), 식품: 1.5 } } : { text: '누리벌 논에 병충해 번져', fx: { 농업: -rand(4, 7) } } },
  { w: 1, make: () => ({ text: '정부, 주택 공급 늘리는 대책 발표… 건설주 기대감', fx: { 건설: rand(3, 6) } }) },
  { w: 1, make: () => ({ text: '해외 여행객 크게 늘어… 항공 수요 회복', fx: { 항공: rand(3, 6), 관광: rand(2, 4) } }) },
  { w: 2, make: () => Math.random() < 0.5 ? { text: '은빛조선, 대형 화물선 10척 수주', fx: { eunbit: rand(5, 10) } } : { text: '은빛조선, 납기 늦어져 배상금 물어', fx: { eunbit: -rand(4, 8) } } },
  { w: 1, make: () => Math.random() < 0.6 ? { text: '바람골에 바람 좋아 풍력 발전량 최고 기록', fx: { baram: rand(3, 6) } } : { text: '바람에너지 발전기 고장… 수리비 부담', fx: { baram: -rand(3, 6) } } },
  { w: 1, make: () => Math.random() < 0.4 ? { text: '솔내광업 갱도 붕괴 사고… 작업 중단', fx: { solnae: -rand(6, 12) } } : { text: '솔내광업, 새 광맥 발견', fx: { solnae: rand(6, 14) } } },
  { w: 2, make: () => { const up = Math.random() < 0.55; return { text: `한울방송 새 드라마 시청률 ${up ? '대박' : '기대 이하'}`, fx: { hanulmedia: up ? rand(4, 9) : -rand(3, 6) } }; } },
  { w: 1, make: () => ({ text: '가람유통, 한가람 백화점 새 단장… 손님 몰려', fx: { garamstore: rand(3, 6) } }) },
  { w: 1, make: () => ({ text: '늘봄 온천 축제에 관광객 북적', fx: { neulbom: rand(3, 7) } }) },
];
const EVENTS_PER_DAY = 1.5;

// ===== 상태 (data/market.json): 회사마다 지금 가격·전날 종가·오늘 시가·고가·저가·오늘 1분 가격들·지난 종가들 + 반영 중인 뉴스 + 뉴스 목록 =====
function createMarket(file, read, write) {
  const fresh = () => ({ lastMin: null, stocks: Object.fromEntries(COMPANIES.map(c => [c.id, { price: c.price, prev: c.price, open: c.price, high: c.price, low: c.price, hist: [], daily: [] }])), pending: [], news: [] });
  const st = read(file) || fresh();
  for (const c of COMPANIES) st.stocks[c.id] ||= fresh().stocks[c.id];   // 새로 상장한 회사
  let dirty = false, savedAt = 0;

  // 뉴스: fx의 키가 업종이면 그 업종 회사 모두, 회사 아이디면 그 회사. 영향은 30분(장 시간)에 걸쳐 반영
  function addNews(min, n) {
    const ids = new Set();
    for (const [k, v] of Object.entries(n.fx)) for (const id of BY_ID[k] ? [k] : inSector(k)) { ids.add(id); st.pending.push({ id, left: v / 100, ticks: 30, gap: !marketOpen(min) }); }
    const up = Object.values(n.fx).reduce((a, b) => a + b, 0) >= 0;
    st.news.unshift({ min, text: n.text, ids: [...ids], up });
    st.news = st.news.slice(0, 40);
  }

  // 게임 1분 진행
  function step(min) {
    const day = Math.floor(min / DAY), t = min - day * DAY;
    if (t === 8 * 60) { const n = weatherNews(day); if (n) addNews(min, n); }                     // 아침 8시 날씨 뉴스
    if (Math.random() < EVENTS_PER_DAY / DAY) {                                                     // 사건 뉴스
      const total = EVENTS.reduce((a, e) => a + e.w, 0); let r = Math.random() * total;
      const e = EVENTS.find(e => (r -= e.w) < 0) || EVENTS[0];
      addNews(min, e.make());
    }
    if (!marketOpen(min)) return;
    for (const c of COMPANIES) {
      const s = st.stocks[c.id];
      if (s.hday !== day) {   // 그날 첫 거래: 지난 거래일 종가를 기록하고 오늘 시가·고가·저가를 새로 (서버가 마감 때 꺼져 있었어도 맞음)
        if (s.hday != null) { s.daily.push({ day: s.hday, close: s.price }); s.daily = s.daily.slice(-60); s.prev = s.price; }
        s.hday = day; s.open = s.high = s.low = s.price; s.hist = [];
      }
      let r = gauss() * c.vol / 100 / Math.sqrt(MARKET_CLOSE - MARKET_OPEN);                    // 업종마다 다른 흔들림
      for (const p of st.pending) {
        if (p.id !== c.id) continue;
        const take = p.gap ? p.left * 0.5 : p.left / p.ticks;                                       // 장 닫혀 있을 때 난 뉴스: 장 열리자마자 절반
        r += take; p.left -= take; p.gap = false; p.ticks = Math.max(1, p.ticks - 1);
      }
      const lim = [toTick(s.prev * 0.7), toTick(s.prev * 1.3)];                                       // 하루 상한·하한 ±30%
      s.price = Math.min(lim[1], Math.max(lim[0], toTick(s.price * (1 + r))));
      s.high = Math.max(s.high, s.price); s.low = Math.min(s.low, s.price);
      s.hist.push(s.price);
    }
    st.pending = st.pending.filter(p => Math.abs(p.left) > 0.0005);
  }

  // 지금 세계 시각까지 밀린 분을 진행 (서버가 꺼져 있던 동안은 최대 3일치만)
  function advance(nowMin) {
    const now = Math.floor(nowMin);
    if (st.lastMin == null || now - st.lastMin > DAY * 3) st.lastMin = now - 1;
    while (st.lastMin < now) { st.lastMin++; step(st.lastMin); dirty = true; }
    if (dirty && Date.now() - savedAt > 10000) { write(file, st); dirty = false; savedAt = Date.now(); }
  }

  // 화면에 보낼 시세: 회사마다 지금 가격·전날 종가·시가·고가·저가·오늘 1분 가격(최대 390개) + 뉴스 20개
  const view = () => ({
    stocks: COMPANIES.map(c => { const s = st.stocks[c.id]; return { id: c.id, name: c.name, sector: c.sector, region: c.region, price: s.price, prev: s.prev, open: s.open, high: s.high, low: s.low, hist: s.hist, daily: s.daily.slice(-20) }; }),
    news: st.news.slice(0, 20),
  });
  const priceOf = id => st.stocks[id]?.price;
  // 바깥(세계 시뮬레이션)에서 온 뉴스: 영향은 ±10% 안으로만 받음 (한 사건이 시장을 뒤집지 않게)
  const ingest = (min, n) => { const fx = Object.fromEntries(Object.entries(n.fx).filter(([k]) => BY_ID[k] || inSector(k).length).map(([k, v]) => [k, Math.max(-10, Math.min(10, v))])); if (Object.keys(fx).length) { addNews(min, { text: n.text, fx }); dirty = true; } };
  const quote = id => { const c = BY_ID[id], s = st.stocks[id]; return c && s ? { name: c.name, price: s.price, prev: s.prev } : null; };   // 회사 하나의 지금 시세 (사람들 대화에 씀)
  return { advance, view, priceOf, BY_ID, ingest, quote };
}

module.exports = { createMarket, COMPANIES, BY_ID, tickOf };

// 스스로 검사: node economy.js → 메모리에서 2주를 돌려 가격이 호가 단위·상하한(±30%)을 지키는지, 장 시간에만 움직이는지 확인
if (require.main === module) {
  const assert = require('assert');
  const m = createMarket('x', () => null, () => {});
  const start = 480;   // 1일째 월요일 08:00
  m.advance(start);
  for (let min = start + 1; min < start + DAY * 14; min += 7) {
    const before = m.view().stocks.map(s => s.price);
    m.advance(min);
    const v = m.view().stocks;
    v.forEach((s, i) => {
      assert.strictEqual(s.price % tickOf(s.price), 0, s.name + ' 호가 단위');
      assert.ok(s.price <= Math.ceil(s.prev * 1.3) && s.price >= Math.floor(s.prev * 0.7), s.name + ' 상하한');
      if (!marketOpen(min) && !marketOpen(min - 6)) assert.strictEqual(s.price, before[i], s.name + ' 장 닫힘');
    });
  }
  const v = m.view();
  console.log(v.stocks.map(s => `${s.name} ${s.price} (${((s.price / COMPANIES.find(c => c.id === s.id).price - 1) * 100).toFixed(1)}%)`).join(' / '));
  console.log('뉴스', v.news.length, '건:', v.news.slice(0, 4).map(n => n.text).join(' | '));
  console.log('ok');
}
