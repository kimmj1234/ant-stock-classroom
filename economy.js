'use strict';
// ===== 경제: 회사 주식 시장 (서버만 씀, 모든 사람이 같은 시세) =====
// 게임 1분마다(현실 2.5초) 장이 열려 있으면 회사마다 가격이 조금씩 움직임 = 업종마다 다른 흔들림 + 뉴스(날씨·사건) 영향
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
// 회사 재무 (처음 상장할 때): [시가총액(억 원), 업종 평균 PER, 배당성향]. 시가총액 = 가격 × 발행주식수, 연 순이익 = 시가총액 ÷ PER
//   → 가격이 오르내려도 발행주식수는 그대로, 분기 실적이 나올 때마다 순이익(EPS)이 바뀌고 PER·배당이 따라 바뀜
const FUND = { nuri: [18000, 22, 0.12], daehan: [9000, 10, 0.25], haneul: [7000, 11, 0.15], hanulbank: [30000, 6, 0.35], hanultel: [20000, 9, 0.5], hanulmedia: [3500, 14, 0.2], garamstore: [6000, 12, 0.3],
  hanulgames: [25000, 24, 0.08], hanbit: [80000, 14, 0.2], saebom: [12000, 11, 0.25], bada: [8000, 9, 0.3], byeolbit: [15000, 30, 0.05], pureun: [2500, 12, 0.35], byeolhafish: [800, 10, 0.3],
  nurigrain: [500, 12, 0.25], eunbit: [9000, 13, 0.15], baram: [2000, 18, 0.1], solnae: [600, 8, 0.3], neulbom: [3500, 14, 0.2] };
const setFund = (c, cap, per, payout) => { c.shares = Math.max(10000, Math.round(cap * 1e8 / c.price / 10000) * 10000); c.per0 = per; c.profit = cap * 1e8 / per; c.payout = payout; };
for (const c of COMPANIES) setFund(c, ...(FUND[c.id] || [3000, 12, 0.2]));
const MARKET_MIN = 390;
const inSector = (...sectors) => COMPANIES.filter(c => sectors.includes(c.sector)).map(c => c.id);

// 호가 단위 (한국 거래소 기준)
const tickOf = p => p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000;
const toTick = p => { const t = tickOf(p); return Math.max(t, Math.round(p / t) * t); };
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
const eul = s => s + ((s.charCodeAt(s.length - 1) - 0xac00) % 28 ? '을' : '를');

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
const EVENTS_PER_DAY = 1.2;

// ===== 회사 계획: 앞으로 일어날 일이 미리 정해져 있고(결과 q: -1 나쁨 ~ +1 좋음), 아는 사람(직원·기자)에게서 새어 나감 =====
// 현실처럼: ① 아는 사람이 먼저 사고팔아 발표 전부터 주가가 조금씩 그쪽으로 움직임(정보 유출)
//           ② 공개 예고가 나면 기대감에 오름("소문에 사라") ③ 발표 날 결과만큼 움직이되 예고 때 오른 만큼은 빠짐("뉴스에 팔아라")
// 신제품(업종마다) · 대형 계약 협상 · 분기 실적(1·4·7·10월, 회사 사정 = 세계 시뮬레이션의 직원 사기) · 한울은행 금리 회의(매달 12일, 경기에 따라)
const PRODUCTS = { IT: ['인공지능 비서', '보안 프로그램', '클라우드 서비스'], 건설: ['새 아파트 단지', '스마트 주택'], 항공: ['새 국제선 노선', '저가 항공 브랜드'], 금융: ['새 모바일 은행 앱', '새 적금 상품'],
  통신: ['초고속 요금제', '위성 인터넷'], 미디어: ['새 대작 드라마', '새 예능 프로그램'], 유통: ['새 대형 할인점', '새벽 배송 서비스'], 게임: ['신작 게임', '가상현실 게임'],
  전자: ['새 스마트폰', '접는 화면 태블릿', '차세대 반도체'], 화학: ['친환경 플라스틱', '배터리 소재'], 해운: ['새 유럽 항로'], 제약: ['신약', '독감 치료제'], 식품: ['신제품 라면', '건강 음료'],
  수산: ['간편 생선 요리'], 농업: ['새 품종 쌀'], 조선: ['친환경 화물선'], 에너지: ['해상 풍력 단지'], 광업: ['새 광구 개발 계획'], 관광: ['새 온천 리조트'] };
const CONTRACTS = { 건설: '해외 공항 공사', 조선: '대형 화물선 수주', 해운: '장기 운송 계약', 전자: '해외 반도체 공급 계약', 에너지: '정부 발전 계약', 화학: '해외 소재 공급 계약', IT: '정부 전산망 사업', 항공: '해외 항공사 제휴' };
const BETA = { IT: 1.3, 게임: 1.4, 전자: 1.2, 금융: 1.1, 건설: 1.1, 통신: 0.6, 식품: 0.5, 관광: 0.9 };   // 시장 전체 분위기를 얼마나 따라가는지
const BASE_INDEX = Object.fromEntries(COMPANIES.map(c => [c.id, c.price]));
const clampQ = v => Math.max(-1, Math.min(1, v));
const IMPACT = 400000000;   // 순매수 4억 원 ≈ 가격 +100% 압력 (400만 원 ≈ 1%) · 시가총액 3,000억 원 회사 기준 (큰 회사일수록 덜, 작은 회사일수록 더 움직임)
const nextTrading = d => { d++; while (weekdayOf(d) >= 5) d++; return d; };
const RELEASE_AT = 10 * 60;   // 발표 시각 10:00 (실적은 장 열기 전 08:00)

// ===== 상태 (data/market.json): 회사마다 지금 가격·전날 종가·오늘 시가·고가·저가·오늘 1분 가격들·지난 종가들 + 반영 중인 뉴스 + 뉴스 목록 =====
function createMarket(file, read, write) {
  const fresh = () => ({ lastMin: null, stocks: Object.fromEntries(COMPANIES.map(c => [c.id, { price: c.price, prev: c.price, open: c.price, high: c.price, low: c.price, hist: [], daily: [], vol: 0, amt: 0 }])), pending: [], news: [] });
  const st = read(file) || fresh();
  st.plans ||= []; st.planN ||= 1; st.flow ||= {}; st.dayFlow ||= {};   // NPC 주문: 아직 가격에 반영 안 된 돈 · 오늘 순매수
  st.fin ||= {}; st.idxHist ||= [];
  for (const c of COMPANIES) {   // 회사 재무 상태: 최근 네 분기 순이익 · 최근 배당 네 번 · 결정된 배당(배당락일)
    if (st.fin[c.id]) continue;
    const q = c.profit / 4;
    st.fin[c.id] = { q: [0.96, 1.02, 0.99, 1.03].map(k => q * k), divs: Array(4).fill(Math.floor(q / c.shares * c.payout / 10) * 10), pend: null };
  }
  const divListeners = [], divBacklog = [];   // 배당이 나갈 때 계정·세계 시뮬레이션에 알림 (듣는 쪽이 없을 땐 쌓아 뒀다가 flushDividends로)
  const fireDividend = (c, dps, min) => { if (divListeners.length) divListeners.forEach(fn => fn(c.id, dps, min, c.name)); else divBacklog.push([c.id, dps, min, c.name]); };
  let macro = { health: {}, demand: 1 };   // 세계 시뮬레이션이 알려 주는 회사 사정(직원 사기)·경기
  for (const c of COMPANIES) st.stocks[c.id] ||= fresh().stocks[c.id];   // 새로 상장한 회사
  if (st.idxPrev == null) st.idxPrev = 1000 * COMPANIES.reduce((a, c) => a + st.stocks[c.id].price / BASE_INDEX[c.id], 0) / COMPANIES.length;
  let dirty = false, savedAt = 0;

  // 뉴스: fx의 키가 업종이면 그 업종 회사 모두, 회사 아이디면 그 회사. 영향은 30분(장 시간)에 걸쳐 반영
  function addNews(min, n) {
    const ids = new Set();
    for (const [k, v] of Object.entries(n.fx)) for (const id of k === '*' ? COMPANIES.map(c => c.id) : BY_ID[k] ? [k] : inSector(k)) { ids.add(id); st.pending.push({ id, left: v / 100, ticks: 30, gap: !marketOpen(min) }); }
    const up = n.up ?? Object.values(n.fx).reduce((a, b) => a + b, 0) >= 0;
    st.news.unshift({ min, text: n.text, ids: [...ids], up });
    st.news = st.news.slice(0, 40);
  }

  // 분기 실적이 나오면: 그 분기 순이익(결과 q 따라 ±45%) → 최근 네 분기 합(EPS)이 바뀜 → 배당 결정 (실적이 크게 나쁘면 무배당) · 배당락일은 닷새 거래일 뒤
  function onEarnings(min, p, c) {
    const f = st.fin[c.id], newQ = c.profit / 4 * (1 + p.q * 0.45 + gauss() * 0.03), s = st.stocks[c.id];
    f.q = [...f.q.slice(-3), newQ];
    const eps = newQ / c.shares, dps = p.q < -0.5 ? 0 : Math.floor(eps * c.payout * rand(0.8, 1.2) / 10) * 10;
    if (dps > 0) {
      let d = Math.floor(min / DAY); for (let i = 0; i < 5; i++) d = nextTrading(d);
      f.pend = { dps, exDay: d }; const [m, dd] = monthDay(doyOf(d));
      addNews(min, { text: `[배당] ${c.name} 분기 배당 주당 ${dps.toLocaleString('ko-KR')}원 결정 (시가배당률 ${(dps * 4 / s.price * 100).toFixed(1)}%) · 배당락일 ${m}월 ${dd}일`, fx: { [c.id]: dps * 4 / s.price * 100 * 0.3 }, up: true });
    } else { f.pend = null; addNews(min, { text: `[배당] ${c.name}, 이번 분기 배당 없음… 실적 악화`, fx: { [c.id]: -1 }, up: false }); }
  }
  const plan = (min, p) => st.plans.push({ id: st.planN++, made: min, ...p });
  function planDay(day) {
    const c = pick(COMPANIES.filter(c => !st.plans.some(p => p.co === c.id && !p.done && p.kind !== 'earnings'))), r = Math.random();   // 한 회사에 신제품·계약은 한 번에 하나
    if (c && r < 0.6 && PRODUCTS[c.sector]) { const rel = (day + 4 + Math.floor(Math.random() * 6)) * DAY + RELEASE_AT; plan(day * DAY, { co: c.id, kind: 'product', item: pick(PRODUCTS[c.sector]), q: clampQ(gauss() * 0.55), announce: rel - 2 * DAY - 60, release: rel }); }
    else if (c && r < 0.85 && CONTRACTS[c.sector]) { const rel = (day + 3 + Math.floor(Math.random() * 6)) * DAY + RELEASE_AT + 120; plan(day * DAY, { co: c.id, kind: 'contract', item: CONTRACTS[c.sector], q: clampQ(gauss() * 0.6), release: rel }); }
    // 10일 뒤가 실적 발표일인 회사들 (1·4·7·10월 15~28일, 회사마다 날이 다름)
    const [m, date] = monthDay(doyOf(day + 10));
    COMPANIES.forEach((c, i) => { if ([1, 4, 7, 10].includes(m) && date === 15 + (i * 5) % 14) plan(day * DAY, { co: c.id, kind: 'earnings', item: '분기 실적', q: clampQ((macro.health[c.id] ?? 0) * 0.7 + gauss() * 0.45), release: (day + 10) * DAY + 8 * 60 }); });
    // 10일 뒤 12일이면 금리 회의 (경기가 뜨거우면 올리고 식으면 내림)
    if (date === 12) { const d = macro.demand - 1 + gauss() * 0.04; plan(day * DAY, { co: null, kind: 'rate', item: '기준금리', q: d > 0.05 ? 1 : d < -0.05 ? -1 : 0, release: (day + 10) * DAY + RELEASE_AT }); }
  }
  function runPlans(min) {
    for (const p of st.plans) {
      const c = BY_ID[p.co], v = Math.abs(p.q);
      if (p.co && p.p0 == null) p.p0 = st.stocks[p.co].price;   // 계획이 생길 때 가격 (발표 날 기준)
      if (p.announce && !p.announced && min >= p.announce) { p.announced = true; p.bump = rand(1, 2.5); addNews(min, { text: `${c.name}, 이틀 뒤 ${eul(p.item)} 공개한다고 예고… 기대감`, fx: { [p.co]: p.bump } }); }
      if (p.done || min < p.release) continue;
      p.done = true;
      // 발표 날 주가는 "계획이 생길 때 가격 × 결과"로 다시 맞춰짐: 소문에 미리 오른(내린) 만큼은 되돌려짐 (거품이면 꺼짐)
      const fair = v => ((p.p0 || st.stocks[p.co].price) * (1 + v / 100) / st.stocks[p.co].price - 1) * 100;
      const sell = 0;
      if (p.kind === 'product') addNews(min, { text: p.q > 0.4 ? `${c.name} ${p.item} 대박 조짐… 첫날 주문 폭주` : p.q > 0 ? `${c.name} ${p.item} 출시, 반응 무난` : p.q > -0.4 ? `${c.name} ${p.item} 출시했지만 반응 미지근` : `${c.name} ${p.item} 혹평 쏟아져… 실망 매물`, fx: { [p.co]: fair(p.q * rand(7, 14)) }, up: p.q > 0 });
      if (p.kind === 'contract') addNews(min, p.q > 0 ? { text: `${c.name}, ${p.item} 최종 성사`, fx: { [p.co]: fair(rand(3, 8) * (0.5 + v)) }, up: true } : { text: `${c.name} ${p.item} 협상 결국 무산`, fx: { [p.co]: fair(-rand(3, 7) * (0.5 + v)) }, up: false });
      if (p.kind === 'earnings') addNews(min, { text: p.q > 0.4 ? `${c.name} 분기 실적 '깜짝 성적'… 시장 예상 크게 넘어` : p.q > 0.1 ? `${c.name} 분기 실적 예상보다 조금 좋아` : p.q > -0.1 ? `${c.name} 분기 실적 예상 수준` : p.q > -0.4 ? `${c.name} 분기 실적 기대에 조금 못 미쳐` : `${c.name} 분기 실적 '어닝 쇼크'… 이익 크게 줄어`, fx: { [p.co]: fair(p.q * rand(5, 10)) }, up: p.q >= 0 }), onEarnings(min, p, c);
      if (p.kind === 'rate') addNews(min, p.q > 0 ? { text: '한울은행, 기준금리 0.25%p 올려… 대출 부담 커져', fx: { '*': -1, 금융: 2.5, 건설: -2.5 }, up: false } : p.q < 0 ? { text: '한울은행, 기준금리 0.25%p 내려… 경기 살리기', fx: { '*': 1, 건설: 2.5, 금융: -1.5 }, up: true } : { text: '한울은행, 기준금리 동결', fx: {} });
    }
    st.plans = st.plans.filter(p => !p.done || min - p.release < DAY);
  }
  // 장 마감 시황: 한울종합지수(처음 가격 = 1000) · 오른/내린 종목 수
  const indexNow = () => 1000 * COMPANIES.reduce((a, c) => a + st.stocks[c.id].price / BASE_INDEX[c.id], 0) / COMPANIES.length;
  function closeNews(min) {
    const idx = indexNow(), prev = st.idxPrev || idx, ch = (idx / prev - 1) * 100;
    const ups = COMPANIES.filter(c => st.stocks[c.id].price > st.stocks[c.id].prev).length, downs = COMPANIES.filter(c => st.stocks[c.id].price < st.stocks[c.id].prev).length;
    const flows = Object.entries(st.dayFlow).sort((a, b) => b[1] - a[1]), man = v => `${Math.round(Math.abs(v) / 10000).toLocaleString()}만 원`;
    const buyTop = flows[0]?.[1] > 100000 ? ` · 개인 순매수 1위 ${BY_ID[flows[0][0]].name}(${man(flows[0][1])})` : '', sellTop = flows.at(-1)?.[1] < -100000 ? ` · 순매도 1위 ${BY_ID[flows.at(-1)[0]].name}(${man(flows.at(-1)[1])})` : '';
    st.news.unshift({ min, text: `[마감] 한울종합지수 ${idx.toFixed(1)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%) · 오른 종목 ${ups}개, 내린 종목 ${downs}개${buyTop}${sellTop}`, ids: [], up: ch >= 0 });
    st.dayFlow = {};
    st.news = st.news.slice(0, 40); st.idxPrev = idx; st.idxHist = [...st.idxHist, +idx.toFixed(1)].slice(-60);
  }

  // 게임 1분 진행
  function step(min) {
    const day = Math.floor(min / DAY), t = min - day * DAY;
    if (t === 0) planDay(day);                                                                       // 자정: 새 계획
    runPlans(min);
    if (t === MARKET_CLOSE && marketOpen(min - 1)) closeNews(min);
    if (t === 8 * 60) { const n = weatherNews(day); if (n) addNews(min, n); }                     // 아침 8시 날씨 뉴스
    if (Math.random() < EVENTS_PER_DAY / DAY) {                                                     // 사건 뉴스
      const total = EVENTS.reduce((a, e) => a + e.w, 0); let r = Math.random() * total;
      const e = EVENTS.find(e => (r -= e.w) < 0) || EVENTS[0];
      addNews(min, e.make());
    }
    if (!marketOpen(min)) return;
    if (st.moodDay !== day) { st.moodDay = day; st.mood = (st.mood || 0) * 0.4 + gauss() * 0.7 + (macro.demand - 1) * 3; }   // 오늘 시장 분위기(%): 어제를 조금 이어받고 경기를 따라감
    const common = gauss();                                                                          // 이번 분 모든 종목이 같이 받는 흔들림
    for (const c of COMPANIES) {
      const s = st.stocks[c.id];
      if (s.hday !== day) {   // 그날 첫 거래: 지난 거래일 종가를 기록하고 오늘 시가·고가·저가를 새로 (서버가 마감 때 꺼져 있었어도 맞음)
        if (s.hday != null) { s.daily.push({ day: s.hday, open: s.open, high: s.high, low: s.low, close: s.price, vol: s.vol || 0 }); s.daily = s.daily.slice(-60); s.prev = s.price; }
        s.hday = day; s.open = s.high = s.low = s.price; s.hist = []; s.vol = 0; s.amt = 0; s.viUntil = 0;
      }
      const fin = st.fin[c.id];
      if (fin.pend && fin.pend.exDay <= day) {   // 배당락: 그날 장 열 때 주식을 가진 사람이 배당을 받고, 가격(기준가)에서 배당금만큼 빠짐
        const dps = fin.pend.dps, tk = tickOf(s.price);
        s.prev = Math.max(tk, toTick(s.prev - dps)); s.price = Math.max(tk, toTick(s.price - dps)); s.open = s.high = s.low = s.price;
        fin.divs = [...fin.divs.slice(-3), dps]; fin.pend = null;
        addNews(min, { text: `[배당락] ${c.name} 오늘 배당락… 주당 ${dps.toLocaleString('ko-KR')}원 (그만큼 주가에서 빠짐)`, fx: {}, up: false });
        fireDividend(c, dps, min);
      }
      if (min < (st.cbUntil || 0) || min < (s.viUntil || 0)) { s.hist.push(s.price); continue; }   // 매매 정지 중: 가격 그대로 (사람들의 주문은 쌓였다가 다시 열리면 반영)
      const len = MARKET_CLOSE - MARKET_OPEN, beta = BETA[c.sector] ?? 1;
      let r = gauss() * c.vol * 0.85 / 100 / Math.sqrt(len) + beta * (st.mood / 100 / len + common * 0.6 / 100 / Math.sqrt(len));   // 종목만의 흔들림 + 시장 전체를 따라감
      const f = st.flow[c.id];
      let moved = 0;
      if (f) { const take = Math.abs(f) < 20000 ? f : f * 0.2; moved = Math.abs(take); r += take / IMPACT * (3e11 / (c.shares * s.price)) ** 0.3; st.flow[c.id] -= take; if (Math.abs(st.flow[c.id]) < 1) delete st.flow[c.id]; }   // 사람들의 주문이 몇 분에 걸쳐 가격에 반영 (작은 회사일수록 크게)
      for (const p of st.pending) {
        if (p.id !== c.id) continue;
        const take = p.gap ? p.left * 0.5 : p.left / p.ticks;                                       // 장 닫혀 있을 때 난 뉴스: 장 열리자마자 절반
        r += take; p.left -= take; p.gap = false; p.ticks = Math.max(1, p.ticks - 1);
      }
      const fair = fin.q.reduce((a, b) => a + b, 0) / c.shares * c.per0;                              // 실적(EPS)에 걸맞은 가격: 가격이 그쪽으로 아주 천천히 끌림
      const gap = fair / s.price - 1;                                                                  // 실적에 비해 너무 비싸거나 싸면 더 강하게 끌림 (거품은 꺼지고 저평가는 오름)
      r += Math.max(-0.002, Math.min(0.002, gap * 0.00005 * (1 + Math.abs(gap) * 4)));
      const lim = [toTick(s.prev * 0.7), toTick(s.prev * 1.3)];                                       // 하루 상한·하한 ±30%
      s.price = Math.min(lim[1], Math.max(lim[0], toTick(s.price * (1 + r))));
      s.high = Math.max(s.high, s.price); s.low = Math.min(s.low, s.price);
      s.hist.push(s.price);
      // 거래량: 하루 발행주식의 0.3~1%쯤(변동성 큰 회사일수록 많이), 장 시작·마감 직전에 몰리고, 가격이 크게 움직이면 늘고, 사람들의 주문만큼 더해짐
      const um = 1 + 1.4 * Math.exp(-(t - MARKET_OPEN) / 18) + 1.0 * Math.exp(-(MARKET_CLOSE - t) / 18);
      const vv = Math.max(0, Math.round(c.shares * (0.003 + c.vol * 0.0008) / len * um * (0.4 + Math.random() * 1.2) * (1 + Math.abs(r) * 120) + moved / s.price));
      s.vol = (s.vol || 0) + vv; s.amt = (s.amt || 0) + vv * s.price;
      // 변동성 완화 장치(VI): 5분 사이 5% 넘게, 또는 시가보다 12% 넘게 움직이면 그 종목만 2분간 매매 정지 (20분에 한 번만)
      const ref = s.hist.length > 5 ? s.hist[s.hist.length - 6] : null;
      if (((ref && Math.abs(s.price / ref - 1) >= 0.05) || Math.abs(s.price / s.open - 1) >= 0.12) && min - (s.viLast ?? -999) > 20) {
        s.viUntil = min + 2; s.viLast = min;
        addNews(min, { text: `${c.name} 변동성 완화장치(VI) 발동… ${s.price > s.prev ? '급등' : '급락'}에 2분간 매매 정지`, fx: {}, up: s.price > s.prev });
      }
    }
    // 서킷브레이커: 한울종합지수가 전날보다 8% 넘게 떨어지면 하루에 한 번 20분간 모든 종목 매매 정지
    const idx = indexNow();
    if (st.idxPrev && idx / st.idxPrev - 1 <= -0.08 && st.cbDay !== day) {
      st.cbDay = day; st.cbUntil = min + 20;
      addNews(min, { text: `[서킷브레이커] 한울종합지수 ${((idx / st.idxPrev - 1) * 100).toFixed(1)}% 급락… 20분간 모든 매매 정지`, fx: {}, up: false });
    }
    st.pending = st.pending.filter(p => Math.abs(p.left) > 0.0005);
  }

  // 지금 세계 시각까지 밀린 분을 진행 (서버가 꺼져 있던 동안은 최대 3일치만)
  function advance(nowMin) {
    const now = Math.floor(nowMin);
    if (st.lastMin == null || now - st.lastMin > DAY * 3) st.lastMin = now - 1;
    if (!st.planned) { st.planned = true; for (let i = 0; i < 4; i++) planDay(Math.floor(now / DAY)); }   // 처음(또는 이 기능 전 세계): 진행 중인 계획 몇 개로 시작
    while (st.lastMin < now) { st.lastMin++; step(st.lastMin); dirty = true; }
    if (dirty && Date.now() - savedAt > 10000) { write(file, st); dirty = false; savedAt = Date.now(); }
  }

  // 화면에 보낼 시세: 회사마다 지금 가격·전날 종가·시가·고가·저가 + 시가총액·EPS·PER·배당·거래량·상하한가·VI.
  //   sel(고른 종목)만 오늘 1분 가격(최대 390개)과 일봉(최근 40일)을 같이 보냄 → 목록은 가볍게
  const view = sel => ({
    stocks: COMPANIES.map(c => {
      const s = st.stocks[c.id], f = st.fin[c.id], eps = f.q.reduce((a, b) => a + b, 0) / c.shares, dsum = f.divs.reduce((a, b) => a + b, 0);
      const days = s.daily.slice(-59), hi = Math.max(s.high, ...days.map(d => d.high ?? d.close)), lo = Math.min(s.low, ...days.map(d => d.low ?? d.close));
      return { id: c.id, name: c.name, sector: c.sector, region: c.region, price: s.price, prev: s.prev, open: s.open, high: s.high, low: s.low,
        shares: c.shares, cap: s.price * c.shares, eps: Math.round(eps), per: eps > 0 ? +(s.price / eps).toFixed(1) : null, dps: dsum, yield: dsum / s.price, nextDiv: f.pend || null,
        tick: tickOf(s.price), vol: s.vol || 0, amt: s.amt || 0, avgVol: Math.round(c.shares * (0.003 + c.vol * 0.0008)), hi60: hi, lo60: lo,
        up: toTick(s.prev * 1.3), dn: toTick(s.prev * 0.7), vi: (st.lastMin ?? 0) < (s.viUntil || 0),
        hist: c.id === sel ? s.hist : [], daily: c.id === sel ? s.daily.slice(-40).map(d => [d.day, d.open ?? d.close, d.high ?? d.close, d.low ?? d.close, d.close, d.vol || 0]) : [] };
    }),
    news: st.news.slice(0, 20), index: +indexNow().toFixed(1), idxChg: st.idxPrev ? +((indexNow() / st.idxPrev - 1) * 100).toFixed(2) : 0, idxDaily: st.idxHist.slice(-30),
    halt: (st.lastMin ?? 0) < (st.cbUntil || 0) ? st.cbUntil : null,
  });
  // 아직 발표 안 된 계획 (NPC 대화에 씀 — 결과 q는 서버 밖으로 안 나감, 대화가 흐릿하게만 흘림)
  const rumors = () => st.plans.filter(p => !p.done).map(p => ({ id: p.id, co: p.co, name: BY_ID[p.co]?.name, kind: p.kind, item: p.item, q: p.q, release: p.release, announced: !!p.announced }));
  const setMacro = m => { macro = { ...macro, ...m }; };
  // NPC(또는 사람)의 주문: won > 0 사기, < 0 팔기. 장이 열려 있을 때만 받음
  const order = (id, won) => { if (!BY_ID[id] || !Number.isFinite(won)) return; st.flow[id] = (st.flow[id] || 0) + won; st.dayFlow[id] = (st.dayFlow[id] || 0) + won; dirty = true; };
  // 오늘 많이 오른 종목 (따라 사기)
  const hot = () => COMPANIES.filter(c => { const s = st.stocks[c.id]; return s.prev && s.price / s.prev > 1.08; }).map(c => c.id);
  // 매매 정지 중인지(서킷브레이커·VI) · 가격 제한 · 주문 뒤 오늘 가격이 지나간 길(지정가 체결 판단)
  const haltOf = id => (st.lastMin ?? 0) < (st.cbUntil || 0) ? '서킷브레이커로 모든 매매가 정지돼 있어요.' : (st.lastMin ?? 0) < (st.stocks[id]?.viUntil || 0) ? '변동성 완화장치(VI) 발동 중이에요. 잠시 뒤에 주문해 주세요.' : null;
  const limitsOf = id => { const s = st.stocks[id]; return s ? { up: toTick(s.prev * 1.3), dn: toTick(s.prev * 0.7), tick: tickOf(s.price), price: s.price } : null; };
  const pathSince = (id, hday, idx) => { const s = st.stocks[id]; if (!s || s.hday !== hday) return null; const seg = s.hist.slice(idx); return { lo: Math.min(s.price, ...seg), hi: Math.max(s.price, ...seg), last: s.price }; };
  const histLen = id => st.stocks[id]?.hist.length || 0;
  const onDividend = fn => { divListeners.push(fn); };
  const flushDividends = () => { while (divBacklog.length) { const d = divBacklog.shift(); divListeners.forEach(fn => fn(...d)); } };
  const priceOf = id => st.stocks[id]?.price;
  // 바깥(세계 시뮬레이션)에서 온 뉴스: 영향은 ±10% 안으로만 받음 (한 사건이 시장을 뒤집지 않게)
  const ingest = (min, n) => { const fx = Object.fromEntries(Object.entries(n.fx).filter(([k]) => BY_ID[k] || inSector(k).length).map(([k, v]) => [k, Math.max(-10, Math.min(10, v))])); if (Object.keys(fx).length) { addNews(min, { text: n.text, fx }); dirty = true; } };
  const quote = id => { const c = BY_ID[id], s = st.stocks[id]; return c && s ? { name: c.name, price: s.price, prev: s.prev } : null; };   // 회사 하나의 지금 시세 (사람들 대화에 씀)
  return { advance, view, priceOf, BY_ID, ingest, quote, rumors, setMacro, order, hot, haltOf, limitsOf, pathSince, histLen, onDividend, flushDividends, state: st };
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
  assert.ok(v.news.some(n => /예고|출시|성사|무산|실적|금리/.test(n.text)), '계획 발표 뉴스');
  assert.ok(v.stocks.every(s => s.shares > 0 && s.cap > 0 && s.eps !== undefined && s.tick > 0 && s.up > s.dn), '재무·호가 단위·상하한가');
  assert.ok(v.stocks.some(s => s.vol > 0 || s.daily.length), '거래량');
  assert.ok(m.state.fin && Object.values(m.state.fin).every(f => f.q.length === 4 && f.divs.length === 4), '재무 상태');
  assert.ok(v.news.some(n => n.text.startsWith('[마감]')), '마감 시황');
  console.log('지수', v.index);
  console.log('뉴스', v.news.length, '건:', v.news.slice(0, 4).map(n => n.text).join(' | '));
  console.log('ok');
}
