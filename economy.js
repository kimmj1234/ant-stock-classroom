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
const RELEASE_AT = 10 * 60;   // 발표 시각 10:00 (실적은 장 열기 전 08:00)

// ===== 상태 (data/market.json): 회사마다 지금 가격·전날 종가·오늘 시가·고가·저가·오늘 1분 가격들·지난 종가들 + 반영 중인 뉴스 + 뉴스 목록 =====
function createMarket(file, read, write) {
  const fresh = () => ({ lastMin: null, stocks: Object.fromEntries(COMPANIES.map(c => [c.id, { price: c.price, prev: c.price, open: c.price, high: c.price, low: c.price, hist: [], daily: [] }])), pending: [], news: [] });
  const st = read(file) || fresh();
  st.plans ||= []; st.planN ||= 1;
  let macro = { health: {}, demand: 1 };   // 세계 시뮬레이션이 알려 주는 회사 사정(직원 사기)·경기
  for (const c of COMPANIES) st.stocks[c.id] ||= fresh().stocks[c.id];   // 새로 상장한 회사
  let dirty = false, savedAt = 0;

  // 뉴스: fx의 키가 업종이면 그 업종 회사 모두, 회사 아이디면 그 회사. 영향은 30분(장 시간)에 걸쳐 반영
  function addNews(min, n) {
    const ids = new Set();
    for (const [k, v] of Object.entries(n.fx)) for (const id of k === '*' ? COMPANIES.map(c => c.id) : BY_ID[k] ? [k] : inSector(k)) { ids.add(id); st.pending.push({ id, left: v / 100, ticks: 30, gap: !marketOpen(min) }); }
    const up = n.up ?? Object.values(n.fx).reduce((a, b) => a + b, 0) >= 0;
    st.news.unshift({ min, text: n.text, ids: [...ids], up });
    st.news = st.news.slice(0, 40);
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
      if (p.announce && !p.announced && min >= p.announce) { p.announced = true; p.bump = rand(1, 2.5); addNews(min, { text: `${c.name}, 이틀 뒤 ${eul(p.item)} 공개한다고 예고… 기대감`, fx: { [p.co]: p.bump } }); }
      if (p.done || min < p.release) continue;
      p.done = true;
      const sell = (p.bump || 0) * 0.8;   // 예고 때 오른 만큼은 발표 날 빠짐
      if (p.kind === 'product') addNews(min, { text: p.q > 0.4 ? `${c.name} ${p.item} 대박 조짐… 첫날 주문 폭주` : p.q > 0 ? `${c.name} ${p.item} 출시, 반응 무난` : p.q > -0.4 ? `${c.name} ${p.item} 출시했지만 반응 미지근` : `${c.name} ${p.item} 혹평 쏟아져… 실망 매물`, fx: { [p.co]: p.q * rand(7, 14) - sell }, up: p.q > 0 });
      if (p.kind === 'contract') addNews(min, p.q > 0 ? { text: `${c.name}, ${p.item} 최종 성사`, fx: { [p.co]: rand(3, 8) * (0.5 + v) } } : { text: `${c.name} ${p.item} 협상 결국 무산`, fx: { [p.co]: -rand(3, 7) * (0.5 + v) } });
      if (p.kind === 'earnings') addNews(min, { text: p.q > 0.4 ? `${c.name} 분기 실적 '깜짝 성적'… 시장 예상 크게 넘어` : p.q > 0.1 ? `${c.name} 분기 실적 예상보다 조금 좋아` : p.q > -0.1 ? `${c.name} 분기 실적 예상 수준` : p.q > -0.4 ? `${c.name} 분기 실적 기대에 조금 못 미쳐` : `${c.name} 분기 실적 '어닝 쇼크'… 이익 크게 줄어`, fx: { [p.co]: p.q * rand(5, 10) }, up: p.q >= 0 });
      if (p.kind === 'rate') addNews(min, p.q > 0 ? { text: '한울은행, 기준금리 0.25%p 올려… 대출 부담 커져', fx: { '*': -1, 금융: 2.5, 건설: -2.5 }, up: false } : p.q < 0 ? { text: '한울은행, 기준금리 0.25%p 내려… 경기 살리기', fx: { '*': 1, 건설: 2.5, 금융: -1.5 }, up: true } : { text: '한울은행, 기준금리 동결', fx: {} });
    }
    st.plans = st.plans.filter(p => !p.done || min - p.release < DAY);
  }
  // 장 마감 시황: 한울종합지수(처음 가격 = 1000) · 오른/내린 종목 수
  const indexNow = () => 1000 * COMPANIES.reduce((a, c) => a + st.stocks[c.id].price / BASE_INDEX[c.id], 0) / COMPANIES.length;
  function closeNews(min) {
    const idx = indexNow(), prev = st.idxPrev || idx, ch = (idx / prev - 1) * 100;
    const ups = COMPANIES.filter(c => st.stocks[c.id].price > st.stocks[c.id].prev).length, downs = COMPANIES.filter(c => st.stocks[c.id].price < st.stocks[c.id].prev).length;
    st.news.unshift({ min, text: `[마감] 한울종합지수 ${idx.toFixed(1)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%) · 오른 종목 ${ups}개, 내린 종목 ${downs}개`, ids: [], up: ch >= 0 });
    st.news = st.news.slice(0, 40); st.idxPrev = idx;
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
        if (s.hday != null) { s.daily.push({ day: s.hday, close: s.price }); s.daily = s.daily.slice(-60); s.prev = s.price; }
        s.hday = day; s.open = s.high = s.low = s.price; s.hist = [];
      }
      const len = MARKET_CLOSE - MARKET_OPEN, beta = BETA[c.sector] ?? 1;
      let r = gauss() * c.vol * 0.85 / 100 / Math.sqrt(len) + beta * (st.mood / 100 / len + common * 0.6 / 100 / Math.sqrt(len));   // 종목만의 흔들림 + 시장 전체를 따라감
      for (const p of st.plans) if (p.co === c.id && !p.done && p.kind !== 'rate') r += p.q * 0.000014;   // 아는 사람들이 먼저 사고팖 (발표 전까지 q 방향으로 1~3%쯤)
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
    if (!st.planned) { st.planned = true; for (let i = 0; i < 4; i++) planDay(Math.floor(now / DAY)); }   // 처음(또는 이 기능 전 세계): 진행 중인 계획 몇 개로 시작
    while (st.lastMin < now) { st.lastMin++; step(st.lastMin); dirty = true; }
    if (dirty && Date.now() - savedAt > 10000) { write(file, st); dirty = false; savedAt = Date.now(); }
  }

  // 화면에 보낼 시세: 회사마다 지금 가격·전날 종가·시가·고가·저가·오늘 1분 가격(최대 390개) + 뉴스 20개
  const view = () => ({
    stocks: COMPANIES.map(c => { const s = st.stocks[c.id]; return { id: c.id, name: c.name, sector: c.sector, region: c.region, price: s.price, prev: s.prev, open: s.open, high: s.high, low: s.low, hist: s.hist, daily: s.daily.slice(-20) }; }),
    news: st.news.slice(0, 20), index: +indexNow().toFixed(1),
  });
  // 아직 발표 안 된 계획 (NPC 대화에 씀 — 결과 q는 서버 밖으로 안 나감, 대화가 흐릿하게만 흘림)
  const rumors = () => st.plans.filter(p => !p.done).map(p => ({ id: p.id, co: p.co, name: BY_ID[p.co]?.name, kind: p.kind, item: p.item, q: p.q, release: p.release, announced: !!p.announced }));
  const setMacro = m => { macro = { ...macro, ...m }; };
  const priceOf = id => st.stocks[id]?.price;
  // 바깥(세계 시뮬레이션)에서 온 뉴스: 영향은 ±10% 안으로만 받음 (한 사건이 시장을 뒤집지 않게)
  const ingest = (min, n) => { const fx = Object.fromEntries(Object.entries(n.fx).filter(([k]) => BY_ID[k] || inSector(k).length).map(([k, v]) => [k, Math.max(-10, Math.min(10, v))])); if (Object.keys(fx).length) { addNews(min, { text: n.text, fx }); dirty = true; } };
  const quote = id => { const c = BY_ID[id], s = st.stocks[id]; return c && s ? { name: c.name, price: s.price, prev: s.prev } : null; };   // 회사 하나의 지금 시세 (사람들 대화에 씀)
  return { advance, view, priceOf, BY_ID, ingest, quote, rumors, setMacro };
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
  assert.ok(v.news.some(n => n.text.startsWith('[마감]')), '마감 시황');
  console.log('지수', v.index);
  console.log('뉴스', v.news.length, '건:', v.news.slice(0, 4).map(n => n.text).join(' | '));
  console.log('ok');
}
