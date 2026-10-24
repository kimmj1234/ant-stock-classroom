'use strict';
// ===== 개미 증권시장: 종목·날씨·사건·주가 알고리즘 =====
// 서버에서만 실행합니다. 모든 참가자가 같은 시장을 봅니다. AI 없이 '사건 틀 + 무작위 값'으로 매일 자동 생성됩니다.

// 카드 3에서 비교할 값 하나: 종목 고유의 하루 변동성
const VOL = 0.012;
const MARKET_VOL = 0.008;   // 시장 전체가 같이 움직이는 폭
const SECTOR_VOL = 0.006;   // 같은 업종끼리 같이 움직이는 폭
const DRIFT_DECAY = 0.7;    // 사건의 여파가 다음 날로 남는 비율
// 상장폐지 방지: 기준가(처음 가격)로 끌어당기는 힘은 없고(한 기업만 계속 높아져도 됨), 너무 떨어졌을 때만 받쳐 줌
const FLOOR = 0.3;          // 처음 가격의 30% 아래로 떨어지면 다시 올라오려는 힘이 생김
const FLOOR_PULL = 0.3;     // 그 힘의 세기 (하루 기준)
const MIN_PRICE = 0.1;      // 처음 가격의 10% 아래로는 절대 내려가지 않음

const SECTORS = {
  tech:    { name: 'IT·반도체',   icon: 'tech' },
  bio:     { name: '바이오·제약', icon: 'pill' },
  food:    { name: '식품·생활',   icon: 'food' },
  energy:  { name: '에너지·화학', icon: 'energy' },
  auto:    { name: '자동차·운송', icon: 'car' },
  leisure: { name: '유통·레저',   icon: 'bag' },
};

// tags: 어떤 사건·날씨에 반응하는지
const TAG_LABEL = {
  export: '수출 비중이 큼 (환율이 오르면 유리)', rate: '금리에 민감한 성장주', chip: '반도체 가격에 민감',
  defensive: '경기방어주 (덜 흔들림)', hot: '더울수록 잘 팔림', cold: '추울수록 잘 팔림', rainUp: '비 오는 날 수요 증가',
  outdoor: '야외 활동이 줄면 불리', travel: '여행 수요에 민감', ship: '태풍·항로에 민감', oil: '유가가 오르면 유리',
  oilUser: '유가가 오르면 불리 (연료·원료비)', farm: '날씨 피해에 약함 (농산물)', dust: '미세먼지가 심하면 잘 팔림',
  ev: '전기차 정책에 민감', green: '친환경 정책에 민감', flu: '감염병이 돌면 수요 증가',
};

const STOCK_DEFS = [
  { sym: 'HBE', sector: 'tech', name: '한빛전자', price: 72000, beta: 1.2, tags: ['export', 'rate', 'chip'], desc: '스마트폰과 반도체를 만드는 대표 수출 기업.' },
  { sym: 'BSC', sector: 'tech', name: '별빛반도체', price: 54000, beta: 1.4, tags: ['export', 'chip', 'rate'], desc: '메모리 반도체 전문 기업. 반도체 가격에 따라 실적이 크게 바뀝니다.' },
  { sym: 'NRS', sector: 'tech', name: '누리소프트', price: 31000, beta: 1.1, tags: ['rate'], desc: '클라우드 업무용 소프트웨어 회사.' },
  { sym: 'BDT', sector: 'tech', name: '바다통신', price: 23000, beta: 0.7, tags: ['defensive'], desc: '휴대폰·인터넷 통신사. 매달 요금이 들어와 실적이 안정적입니다.' },
  { sym: 'GRG', sector: 'tech', name: '구름게임즈', price: 46000, beta: 1.3, tags: ['rate', 'rainUp'], desc: '모바일·PC 게임 회사. 사람들이 집에 머물수록 이용자가 늘어납니다.' },
  { sym: 'SSP', sector: 'bio', name: '새싹제약', price: 88000, beta: 1.0, tags: ['flu'], desc: '감기약부터 신약까지 만드는 전통 제약사.' },
  { sym: 'PRB', sector: 'bio', name: '푸른바이오', price: 41000, beta: 1.5, tags: ['rate'], desc: '신약을 개발하는 바이오 벤처. 아직 이익은 없고 임상 결과에 기대를 걸고 있습니다.' },
  { sym: 'HNM', sector: 'bio', name: '하늘의료기', price: 27000, beta: 0.9, tags: ['export'], desc: '초음파·혈당 측정기 같은 의료기기를 수출합니다.' },
  { sym: 'DKH', sector: 'bio', name: '들꽃헬스', price: 19000, beta: 0.8, tags: ['dust', 'defensive'], desc: '건강기능식품과 마스크를 만듭니다.' },
  { sym: 'MRJ', sector: 'bio', name: '미르진단', price: 15000, beta: 1.3, tags: ['flu'], desc: '감염병 진단키트 회사. 유행병이 돌 때 주목받습니다.' },
  { sym: 'PRF', sector: 'food', name: '푸른식품', price: 38000, beta: 0.6, tags: ['defensive'], desc: '라면·간편식 회사. 불황에도 꾸준히 팔리는 경기방어주입니다.' },
  { sym: 'HSD', sector: 'food', name: '햇살음료', price: 26000, beta: 0.7, tags: ['hot'], desc: '음료·아이스크림 회사. 여름 날씨에 실적이 좌우됩니다.' },
  { sym: 'GSJ', sector: 'food', name: '고소제과', price: 33000, beta: 0.6, tags: ['defensive', 'oilUser'], desc: '과자 회사. 밀가루·설탕·포장재 값이 오르면 이익이 줄어듭니다.' },
  { sym: 'MGS', sector: 'food', name: '맑은생활', price: 21000, beta: 0.5, tags: ['defensive', 'dust'], desc: '세제·물티슈·공기청정 필터 같은 생활용품 회사.' },
  { sym: 'PNN', sector: 'food', name: '풍년농산', price: 12000, beta: 0.9, tags: ['farm'], desc: '채소·과일을 키워 파는 농업 회사. 날씨 피해에 약합니다.' },
  { sym: 'BBE', sector: 'energy', name: '별빛에너지', price: 115000, beta: 1.5, tags: ['oil'], desc: '석유를 정제해 파는 정유사. 유가가 오르면 이익이 늘어납니다.' },
  { sym: 'HNS', sector: 'energy', name: '해님태양광', price: 18000, beta: 1.3, tags: ['green', 'rate'], desc: '태양광 패널 회사. 친환경 정책의 영향을 크게 받습니다.' },
  { sym: 'BRE', sector: 'energy', name: '바람에너지', price: 22000, beta: 1.2, tags: ['green'], desc: '바다 위 풍력 발전소를 짓고 운영합니다.' },
  { sym: 'DDC', sector: 'energy', name: '단단화학', price: 64000, beta: 1.1, tags: ['oilUser', 'export'], desc: '석유로 플라스틱 원료를 만드는 화학 회사. 원료인 유가가 오르면 불리합니다.' },
  { sym: 'TDG', sector: 'energy', name: '따뜻가스', price: 29000, beta: 0.7, tags: ['cold', 'defensive'], desc: '도시가스로 집을 데우는 난방 회사. 추울수록 많이 팔립니다.' },
  { sym: 'JJA', sector: 'auto', name: '질주자동차', price: 95000, beta: 1.1, tags: ['export', 'ev'], desc: '자동차를 만들어 전 세계에 수출합니다.' },
  { sym: 'SSB', sector: 'auto', name: '씽씽배터리', price: 140000, beta: 1.6, tags: ['ev', 'rate', 'export'], desc: '전기차 배터리 회사. 성장 기대가 커서 많이 흔들립니다.' },
  { sym: 'HNA', sector: 'auto', name: '하늘항공', price: 17000, beta: 1.3, tags: ['oilUser', 'travel', 'ship'], desc: '항공사. 비행기 연료비와 여행 수요, 태풍에 민감합니다.' },
  { sym: 'BDG', sector: 'auto', name: '바닷길해운', price: 24000, beta: 1.4, tags: ['ship', 'export'], desc: '큰 배로 수출 화물을 나르는 해운사.' },
  { sym: 'GBL', sector: 'auto', name: '길벗물류', price: 36000, beta: 0.9, tags: ['rainUp', 'oilUser'], desc: '택배·배달 회사. 비 오는 날 주문이 늘어납니다.' },
  { sym: 'NJY', sector: 'leisure', name: '놀자여행', price: 14000, beta: 1.4, tags: ['travel', 'outdoor'], desc: '여행 패키지와 숙소를 파는 회사.' },
  { sym: 'PGF', sector: 'leisure', name: '포근패션', price: 25000, beta: 1.0, tags: ['cold'], desc: '패딩·코트 같은 겨울옷이 주력인 의류 회사.' },
  { sym: 'SWG', sector: 'leisure', name: '시원가전', price: 52000, beta: 1.0, tags: ['hot', 'dust', 'export'], desc: '에어컨·공기청정기를 만드는 가전 회사.' },
  { sym: 'MDM', sector: 'leisure', name: '모두마트', price: 61000, beta: 0.7, tags: ['defensive'], desc: '전국 대형마트 체인. 생필품이 많아 경기를 덜 탑니다.' },
  { sym: 'BBN', sector: 'leisure', name: '별밤엔터', price: 33000, beta: 1.5, tags: ['rate', 'outdoor'], desc: 'K-팝 가수와 콘서트를 기획하는 엔터테인먼트 회사.' },
];

// ===== 도구 =====
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
function weighted(table) {
  let r = Math.random() * Object.values(table).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(table)) if ((r -= w) < 0) return k;
  return Object.keys(table)[0];
}
// 한국 주식시장 호가 단위
const tickSize = p => (p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : 500);
const roundTick = p => { const t = tickSize(p); return Math.max(t, Math.round(p / t) * t); };

const bySector = (...secs) => STOCK_DEFS.filter(s => secs.includes(s.sector));
const byTag = tag => STOCK_DEFS.filter(s => s.tags.includes(tag));
// 사건이 종목에 주는 영향: j = 당일 즉시 변동, d = 다음 날부터 서서히 줄어드는 여파
const hit = (stocks, jMin, jMax, dMin = 0, dMax = 0) => [].concat(stocks).map(s => ({ sym: s.sym, j: rand(jMin, jMax), d: rand(dMin, dMax) }));

// ===== 날씨: 계절별 확률 + 전날 날씨가 이어질 확률 =====
const WEATHER = {
  sunny:    { name: '맑음' },     cloudy: { name: '흐림' },   rain: { name: '비' },
  downpour: { name: '폭우', extreme: true }, heat: { name: '폭염', extreme: true }, typhoon: { name: '태풍', extreme: true },
  snow:     { name: '눈' },       cold:   { name: '한파', extreme: true }, dust: { name: '미세먼지', extreme: true },
};
const SEASON_WEATHER = {
  spring: { sunny: 5, cloudy: 3, rain: 2, dust: 1.5 },
  summer: { sunny: 4, cloudy: 2, rain: 2, downpour: 1.2, heat: 1.5, typhoon: 0.5 },
  fall:   { sunny: 6, cloudy: 3, rain: 1.5, typhoon: 0.4 },
  winter: { sunny: 4, cloudy: 3, snow: 2, cold: 1.5, dust: 0.6 },
};
const seasonOf = month => (month >= 3 && month <= 5 ? 'spring' : month <= 8 && month >= 6 ? 'summer' : month >= 9 && month <= 11 ? 'fall' : 'winter');
function nextWeather(prev, season) {
  const table = SEASON_WEATHER[season];
  if (prev && table[prev] && chance(0.5)) return prev;
  return weighted(table);
}

// 극단적인 날씨가 시작된 날 → 날씨 사건
const WEATHER_EVENTS = {
  heat: {
    title: () => `전국 폭염 특보… 낮 최고 ${36 + Math.floor(rand(0, 4))}도`,
    hits: () => [...hit(byTag('hot'), .03, .07, .003, .008), ...hit(byTag('farm'), -.05, -.02), ...hit(byTag('outdoor'), -.03, -.01)],
    lesson: '날씨가 바뀌면 사람들이 사는 물건이 바뀝니다. 폭염에는 음료·에어컨이 잘 팔리고, 농작물 피해와 야외 활동 감소로 손해 보는 회사도 생깁니다.',
  },
  cold: {
    title: () => `영하 ${12 + Math.floor(rand(0, 6))}도 한파 몰아쳐`,
    hits: () => [...hit(byTag('cold'), .03, .07, .003, .008), ...hit(byTag('travel'), -.04, -.01), ...hit(byTag('outdoor'), -.03, -.01)],
    lesson: '추위가 오면 난방·겨울옷 수요가 늘어 관련 회사의 실적 기대가 커집니다. 같은 날씨가 어떤 회사에는 호재, 어떤 회사에는 악재입니다.',
  },
  downpour: {
    title: () => '장마전선 북상, 곳곳에 시간당 80mm 물폭탄',
    hits: () => [...hit(byTag('rainUp'), .02, .05, .002, .006), ...hit(byTag('outdoor'), -.04, -.01), ...hit(byTag('farm'), -.06, -.02), ...hit(byTag('travel'), -.03, -.01)],
    lesson: '비가 많이 오면 사람들이 집에 머물러 배달·게임 이용이 늘고, 여행·농업은 피해를 봅니다.',
  },
  typhoon: {
    title: () => `${pick(['매미', '루사', '힌남노', '카눈'])}급 대형 태풍 상륙… 항구·공항 운항 중단`,
    hits: () => [...hit(byTag('ship'), -.07, -.03, -.004, -.001), ...hit(byTag('travel'), -.06, -.02), ...hit(byTag('farm'), -.06, -.02), ...hit(byTag('outdoor'), -.03, -.01)],
    lesson: '태풍처럼 피할 수 없는 자연재해는 운송·여행 회사에 큰 손실을 줍니다. 이런 위험은 여러 업종에 나눠 투자해 줄입니다.',
  },
  dust: {
    title: () => '최악의 미세먼지, 외출 자제 권고',
    hits: () => [...hit(byTag('dust'), .03, .08, .002, .006), ...hit(byTag('outdoor'), -.03, -.01)],
    lesson: '미세먼지가 심하면 마스크·공기청정기가 팔립니다. 사회 문제가 새로운 수요를 만들기도 합니다.',
  },
};

// ===== 사건 틀: weight가 클수록 자주 일어남. make()가 매번 새 제목과 영향을 만듦 =====
const PRODUCTS = {
  tech: ['폴더블폰 Z', 'AI 반도체 N1', '초고속 공유기', '클라우드 오피스', 'VR 게임기'],
  bio: ['관절 영양제', '수면 패치', '혈당 측정기', '비염 스프레이', '탈모 샴푸'],
  food: ['불꽃 매운 라면', '제로 콜라', '단백질 쿠키', '친환경 세제', '꿀 사과즙'],
  energy: ['고효율 태양광 패널', '수소 연료', '친환경 플라스틱', '가정용 배터리', '저탄소 휘발유'],
  auto: ['전기 SUV', '자율주행 택시', '초급속 충전기', '전기 오토바이', '드론 택배'],
  leisure: ['우주 여행 패키지', '구스 패딩', '무풍 에어컨', '24시 무인 마트', 'K-팝 월드 투어'],
};
const EVENTS = [
  {
    key: 'newProduct', icon: 'star', weight: 6, name: '신제품 출시',
    lesson: '신제품의 반응은 앞으로의 매출 기대를 바꿉니다. 같은 "출시" 소식도 반응이 좋으면 오르고, 실망스러우면 떨어집니다.',
    make() {
      const s = pick(STOCK_DEFS), p = pick(PRODUCTS[s.sector]);
      return chance(0.6)
        ? { title: `${s.name}, 신제품 '${p}' 출시 첫날 완판`, hits: hit(s, .03, .08, .004, .01) }
        : { title: `${s.name} 신제품 '${p}' 출시… 소비자 반응은 '글쎄'`, hits: hit(s, -.07, -.03, -.006, -.002) };
    },
  },
  {
    // 가끔 터지는 대박 호재: 한 번에 20~40% 뛰고, 며칠 동안 더 오르려는 힘(하루 2~4%, 매일 30%씩 약해짐)이 남음
    key: 'breakthrough', icon: 'star', weight: 1.5, name: '대박 호재',
    lesson: '세상을 바꿀 만한 신제품·신약·신기술은 회사의 미래 이익 기대를 통째로 바꿔, 주가가 하루에 수십 % 뛰고 며칠 더 오르기도 합니다. 다만 이미 크게 오른 뒤에 뛰어들면 비싸게 살 수 있습니다.',
    make() {
      const s = pick(STOCK_DEFS), r = Math.random();
      const title = s.sector === 'bio'
        ? `${s.name}, ${pick(['치매', '비만', '폐암', '당뇨', '탈모'])} 완치 신약 세계 첫 승인… 블록버스터 기대`
        : ['tech', 'energy', 'auto'].includes(s.sector) && r < 0.5
          ? `${s.name}, 세계 최초 '${pick(['10분 완충 배터리', '상온 초전도체', '양자 컴퓨터 칩', '무한 동력 엔진', '투명 태양전지'])}' 기술 개발 성공`
          : `${s.name} 신제품 '${pick(PRODUCTS[s.sector])}' 전 세계 품절 대란… 주문 1년 치 밀려`;
      return { title, hits: hit(s, .2, .4, .02, .04) };
    },
  },
  {
    key: 'earnings', icon: 'up', weight: 5, name: '실적 발표',
    lesson: '주가는 실적 자체보다 "시장이 예상한 것보다" 좋은지 나쁜지에 반응합니다. 예상보다 좋으면 어닝 서프라이즈, 나쁘면 어닝 쇼크라고 합니다.',
    make() {
      const s = pick(STOCK_DEFS);
      return chance(0.5)
        ? { title: `${s.name}, 분기 영업이익 시장 예상 ${Math.round(rand(20, 50))}% 웃돌아`, hits: hit(s, .04, .09, .004, .008) }
        : { title: `${s.name}, 분기 실적 예상치 크게 밑돌아 '어닝 쇼크'`, hits: hit(s, -.09, -.04, -.008, -.003) };
    },
  },
  {
    key: 'drug', icon: 'pill', weight: 3, name: '신약 개발',
    lesson: '신약은 개발에 10년 넘게 걸리고, 사람 대상 시험(임상)에 실패하면 그동안의 기대가 한꺼번에 사라집니다. 그래서 바이오 주식은 크게 오르기도, 크게 떨어지기도 하는 고위험 종목입니다.',
    make() {
      const s = pick(bySector('bio')), d = pick(['치매', '비만', '폐암', '당뇨', '탈모', '독감']), r = Math.random();
      if (r < 0.45) return { title: `${s.name}, ${d} 신약 임상 3상 성공`, hits: hit(s, .1, .22, .005, .012) };
      if (r < 0.6) return { title: `${s.name}, ${d} 신약 판매 허가 획득`, hits: hit(s, .06, .12, .003, .008) };
      return { title: `${s.name}, ${d} 신약 임상 3상 실패`, hits: hit(s, -.28, -.15, -.01, -.004) };
    },
  },
  {
    key: 'contract', icon: 'doc', weight: 4, name: '대규모 수주',
    lesson: '큰 계약(수주)은 앞으로 몇 년 치 매출을 미리 확보했다는 뜻이라 주가에 좋은 소식입니다.',
    make() {
      const s = pick(bySector('tech', 'bio', 'auto', 'energy'));
      return { title: `${s.name}, ${pick(['미국', '유럽', '중동', '동남아', '일본'])}에서 ${Math.round(rand(3, 30))}천억 원 규모 수주`, hits: hit(s, .05, .11, .004, .009) };
    },
  },
  {
    key: 'accident', icon: 'fire', weight: 2, name: '사고',
    lesson: '한 회사에만 생긴 악재(개별 위험)는 여러 종목에 나눠 담는 분산투자로 줄일 수 있습니다.',
    make() {
      const s = pick(bySector('energy', 'food', 'tech', 'auto'));
      return { title: `${s.name} ${pick(['공장', '물류센터', '연구소'])}에서 화재 발생`, hits: hit(s, -.1, -.05, -.006, -.002) };
    },
  },
  {
    key: 'recall', icon: 'warn', weight: 2, name: '리콜',
    lesson: '리콜(결함 제품 회수)은 수리 비용과 브랜드 신뢰 하락이라는 두 가지 손실을 남깁니다.',
    make() {
      const s = pick(bySector('auto', 'food', 'leisure', 'bio'));
      return { title: `${s.name}, '${pick(PRODUCTS[s.sector])}' 결함으로 대규모 리콜`, hits: hit(s, -.08, -.04, -.005, -.002) };
    },
  },
  {
    key: 'lawsuit', icon: 'doc', weight: 2, name: '특허 소송',
    lesson: '특허는 기술을 일정 기간 혼자 쓸 수 있는 권리입니다. 소송 결과에 따라 앞으로 벌어들일 이익이 달라집니다.',
    make() {
      const s = pick(bySector('tech', 'bio'));
      return chance(0.5)
        ? { title: `${s.name}, 해외 경쟁사와의 특허 소송 승소`, hits: hit(s, .03, .07, .002, .005) }
        : { title: `${s.name}, 특허 소송 패소… 배상금 ${Math.round(rand(1, 9))}천억 원`, hits: hit(s, -.08, -.04, -.004, -.001) };
    },
  },
  {
    key: 'buyback', icon: 'coin', weight: 2, name: '주주 환원',
    lesson: '회사가 자기 주식을 사들이거나(자사주 매입) 배당을 늘리면, 번 돈을 주주에게 돌려준다는 신호라 주가에 좋습니다.',
    make() {
      const s = pick(STOCK_DEFS);
      return { title: `${s.name}, ${pick(['자사주 매입', '배당 확대'])} 발표`, hits: hit(s, .02, .045, .001, .003) };
    },
  },
  {
    key: 'rumor', icon: 'rumor', weight: 2, name: '소문',
    lesson: '확인되지 않은 소문으로 오른 주가는 되돌아가기 쉽습니다. 소문만 믿고 뒤늦게 따라 사는 것은 위험합니다.',
    make() {
      const s = pick(STOCK_DEFS);
      return { title: `${s.name}, 대기업 인수설 '솔솔'… 회사는 "사실무근"`, hits: hit(s, .05, .1, -.015, -.008) };
    },
  },
  {
    key: 'scandal', icon: 'warn', weight: 1.5, name: '경영 리스크',
    lesson: '경영진의 부정은 회사가 믿을 만한지에 대한 의심을 낳습니다. 신뢰를 잃은 회사의 주가는 오래 눌려 있기 쉽습니다.',
    make() {
      const s = pick(STOCK_DEFS);
      return { title: `${s.name} 경영진 회계 부정 의혹 수사`, hits: hit(s, -.13, -.07, -.008, -.003) };
    },
  },
  {
    key: 'chipCycle', icon: 'tech', weight: 2, name: '반도체 업황',
    lesson: '반도체처럼 값이 올랐다 내렸다를 반복하는 산업은 "업황(경기 순환)"에 따라 관련 회사들이 함께 움직입니다.',
    make() {
      return chance(0.5)
        ? { title: `메모리 반도체 가격 ${Math.floor(rand(2, 5))}개월 연속 상승`, hits: hit(byTag('chip'), .03, .06, .003, .006) }
        : { title: '반도체 재고 쌓여… 가격 하락 전환', hits: hit(byTag('chip'), -.06, -.03, -.006, -.003) };
    },
  },
  {
    key: 'evPolicy', icon: 'car', weight: 1.5, name: '친환경 정책',
    lesson: '정부 정책은 한 산업 전체의 판을 바꿉니다. 보조금이 늘면 그 산업의 회사들이 함께 오릅니다.',
    make() {
      return chance(0.55)
        ? { title: '정부, 전기차·재생에너지 보조금 대폭 확대', hits: [...hit(byTag('ev'), .03, .07, .002, .005), ...hit(byTag('green'), .03, .07, .002, .005)] }
        : { title: '전기차 보조금 축소 발표', hits: [...hit(byTag('ev'), -.06, -.03), ...hit(byTag('green'), -.04, -.01)] };
    },
  },
  {
    key: 'flu', icon: 'pill', weight: 1, name: '감염병 유행',
    lesson: '감염병이 돌면 진단키트·약은 잘 팔리고, 사람들이 모이는 여행·공연은 타격을 받습니다.',
    make() {
      return { title: '독감 대유행… 병원마다 북새통', hits: [...hit(byTag('flu'), .05, .12, .004, .01), ...hit(byTag('travel'), -.06, -.03), ...hit(byTag('outdoor'), -.03, -.01)] };
    },
  },
  {
    key: 'rate', icon: 'bank', weight: 2, name: '금리',
    lesson: '금리가 오르면 돈을 빌리는 비용이 커지고 미래 이익의 현재 가치가 낮아집니다. 그래서 미래 기대가 큰 성장주가 더 크게 흔들립니다.',
    make() {
      return chance(0.5)
        ? { title: '중앙은행, 기준금리 0.5%p 인상', hits: hit(byTag('rate'), -.06, -.03, -.004, -.001), market: { j: -.01, d: -.002 }, rateDelta: .0005 }
        : { title: '중앙은행, 기준금리 전격 인하', hits: hit(byTag('rate'), .03, .06, .001, .004), market: { j: .01, d: .002 }, rateDelta: -.0005 };
    },
  },
  {
    key: 'fx', icon: 'coin', weight: 1.5, name: '환율',
    lesson: '환율이 오르면(원화 약세) 같은 1달러를 팔아도 원화로 더 많이 받아 수출 기업이 유리해지고, 해외여행·연료 수입은 비싸집니다.',
    make() {
      return chance(0.5)
        ? { title: `원·달러 환율 ${Math.round(rand(1400, 1500))}원 돌파 (원화 약세)`, hits: [...hit(byTag('export'), .02, .05), ...hit(byTag('travel'), -.04, -.02), ...hit(byTag('oilUser'), -.03, -.01)] }
        : { title: '환율 급락, 원화 강세 전환', hits: [...hit(byTag('export'), -.04, -.02), ...hit(byTag('travel'), .02, .04)] };
    },
  },
  {
    key: 'oil', icon: 'energy', weight: 2, name: '유가',
    lesson: '같은 유가 뉴스도 업종마다 반대로 작용합니다. 기름을 파는 정유사에는 호재, 기름을 쓰는 항공·화학·물류에는 악재입니다.',
    make() {
      return chance(0.5)
        ? { title: '중동 긴장 고조, 국제 유가 급등', hits: [...hit(byTag('oil'), .04, .08, .003, .007), ...hit(byTag('oilUser'), -.06, -.03)] }
        : { title: '산유국 증산 합의, 유가 급락', hits: [...hit(byTag('oil'), -.08, -.04), ...hit(byTag('oilUser'), .02, .05)] };
    },
  },
  {
    key: 'crash', icon: 'crash', weight: 0.6, crash: true, name: '시장 급락',
    lesson: '시장 전체가 함께 떨어지는 위험(체계적 위험)은 분산투자로도 피하기 어렵습니다. 공포에 휩쓸려 팔면 손실이 확정되고, 급락 뒤에는 반등이 오기도 합니다.',
    make() {
      return { title: '해외 증시 폭락 여파… 공포의 하루', hits: [], market: { j: rand(-.07, -.04), d: .004 } };
    },
  },
  {
    key: 'rally', icon: 'up', weight: 0.8, name: '외국인 매수',
    lesson: '큰손(외국인·기관)이 한꺼번에 사면 시장 전체가 오릅니다. 사고파는 힘의 균형을 "수급"이라고 합니다.',
    make() {
      return { title: `외국인 투자자 ${Math.round(rand(1, 3))}조 원 대규모 순매수`, hits: [], market: { j: rand(.02, .04), d: .002 } };
    },
  },
];
const EVENT_WEIGHTS = Object.fromEntries(EVENTS.map((e, i) => [i, e.weight]));

// TV '배우기'에서 셀 수 있는 개념 목록 (사건 종류 + 날씨 사건 종류)
const LESSON_KEYS = [...EVENTS.map(e => ({ key: e.key, name: e.name })), ...Object.keys(WEATHER_EVENTS).map(k => ({ key: 'w_' + k, name: WEATHER[k].name }))];

// ===== 시장 =====
// 장은 닫히지 않습니다. 실제 1초마다 한 번(게임 하루 = 실제 48분 = 2880번) 조금씩 움직이고, 자정~자정 하루가 일봉 하나가 됩니다.
// 한 번 움직이는 크기를 √2880로 나누므로, 횟수를 바꿔도 하루 변동성은 같습니다.
const TICKS_PER_DAY = 2880;
const DEPOSIT_RATE = { base: 0.001, min: 0.0003, max: 0.003, step: 0.0005 };   // 은행 예금 하루 이자율

function createMarket() {
  const month0 = 1 + Math.floor(Math.random() * 12);
  return {
    day: 0, month0, weather: nextWeather(null, seasonOf(month0)), marketDrift: 0, newsId: 0, news: [],
    open: false, tick: 0, pending: [], clock: 8 * 60 + 30, depositRate: DEPOSIT_RATE.base,
    stocks: STOCK_DEFS.map(s => ({ sym: s.sym, price: s.price, raw: s.price, hist: [s.price], drift: 0 })), index: [1000],
  };
}
const monthOf = m => ((m.month0 - 1 + Math.floor(m.day / 20)) % 12) + 1; // 20거래일 ≈ 한 달
const indexOf = m => +(1000 * m.stocks.reduce((a, st, i) => a + st.price / STOCK_DEFS[i].price, 0) / m.stocks.length).toFixed(2);
function setPrice(m, st, raw) {
  st.raw = Math.max(raw, STOCK_DEFS.find(d => d.sym === st.sym).price * MIN_PRICE);   // 바닥 (상장폐지 없음)
  raw = st.raw;
  st.price = roundTick(raw);
  if (m.open) st.hist[st.hist.length - 1] = st.price;   // 오늘 일봉의 현재가
}

function applyEvent(m, e, key, icon) {
  const impact = {};
  for (const h of e.hits) {
    const st = m.stocks.find(s => s.sym === h.sym);
    setPrice(m, st, st.raw * (1 + h.j));
    st.drift += h.d;
    impact[h.sym] = (impact[h.sym] || 0) + h.j;
  }
  if (e.market) {
    m.stocks.forEach((st, i) => {
      const j = e.market.j * STOCK_DEFS[i].beta;
      setPrice(m, st, st.raw * (1 + j));
      impact[st.sym] = (impact[st.sym] || 0) + j;
    });
    m.marketDrift += e.market.d;
  }
  if (e.rateDelta) m.depositRate = Math.min(DEPOSIT_RATE.max, Math.max(DEPOSIT_RATE.min, m.depositRate + e.rateDelta));
  if (m.open) m.index[m.index.length - 1] = indexOf(m);
  const def = EVENTS.find(x => x.key === key);
  const item = {
    id: ++m.newsId, key, icon, title: e.title, crash: !!def?.crash, day: m.day, clock: m.clock,   // 언제 일어났는지 (종목별 "오늘 왜 움직였나"에 씀)
    lesson: def ? def.lesson : WEATHER_EVENTS[key.slice(2)].lesson,
    impacts: Object.entries(impact).map(([sym, j]) => ({ sym, j: +j.toFixed(4) })).sort((a, b) => Math.abs(b.j) - Math.abs(a.j)),
  };
  m.news.unshift(item);
  if (m.news.length > 40) m.news.pop();
  return item;
}

// 뉴스는 게임 8시간마다 하루 3번: 자정(0시)·오전 8시·오후 4시. 시세 횟수가 아니라 게임 시계(분)로 정함
const NEWS_AT = [8 * 60, 16 * 60];
// 새 하루(자정): 오늘 날씨 → 자정 뉴스(날씨 사건이 있으면 그것, 없으면 일반 사건), 8시·16시 사건을 미리 정함, 새 일봉 시작
function openDay(m) {
  m.day++;
  m.open = true; m.tick = 0;
  m.stocks.forEach(st => { st.hist.push(st.price); if (st.hist.length > 61) st.hist.shift(); });
  m.index.push(indexOf(m)); if (m.index.length > 61) m.index.shift();
  const happened = [];
  const prev = m.weather;
  m.weather = nextWeather(prev, seasonOf(monthOf(m)));
  if (WEATHER[m.weather].extreme && m.weather !== prev) {
    const w = WEATHER_EVENTS[m.weather];
    happened.push(applyEvent(m, { title: w.title(), hits: w.hits() }, 'w_' + m.weather, 'w_' + m.weather));
  } else {
    const def = EVENTS[weighted(EVENT_WEIGHTS)];
    happened.push(applyEvent(m, def.make(), def.key, def.icon));
  }
  scheduleNews(m);
  return happened;
}
// 오늘 남은 뉴스(8시·16시) 중 아직 지나지 않은 것만 정함. 서버를 켤 때도 불러서, 예전 규칙으로 저장된 날도 바로 이 규칙을 따르게
function scheduleNews(m) {
  m.pending = NEWS_AT.filter(at => at > m.clock).map(at => ({ at, e: weighted(EVENT_WEIGHTS) }));
}

// 실제 1초마다: 예정 시각이 된 사건 → 시장·업종·종목 고유 움직임을 하루치의 1/TICKS_PER_DAY만큼
function stepTick(m) {
  if (!m.open) return [];
  m.tick++;
  const happened = [];
  for (const p of m.pending.filter(p => p.at <= m.clock)) {
    const def = EVENTS[p.e];
    happened.push(applyEvent(m, def.make(), def.key, def.icon));
  }
  m.pending = m.pending.filter(p => p.at > m.clock);
  const s = Math.sqrt(TICKS_PER_DAY);
  const mk = gauss() * MARKET_VOL / s + m.marketDrift / TICKS_PER_DAY;
  const sec = Object.fromEntries(Object.keys(SECTORS).map(k => [k, gauss() * SECTOR_VOL / s]));
  m.stocks.forEach((st, i) => {
    const def = STOCK_DEFS[i];
    const r = def.beta * mk + sec[def.sector] + gauss() * VOL / s + (st.drift + floorPull(def, st)) / TICKS_PER_DAY;
    setPrice(m, st, st.raw * Math.exp(r));
  });
  m.index[m.index.length - 1] = indexOf(m);
  return happened;
}

// 처음 가격의 30% 아래일 때만 위로 받치는 힘 (하루 기준), 그 위에서는 0
const floorPull = (def, st) => (st.raw < def.price * FLOOR ? FLOOR_PULL * Math.log(def.price * FLOOR / st.raw) : 0);

// 종목마다 지금 작용하는 힘 (stepTick 식의 무작위가 아닌 부분, 하루 기준):
// news = 지난 사건이 남긴 여파(종목 여파 + 베타 × 시장 여파), pull = 상장폐지를 막는 바닥 힘
const forcesOf = m => m.stocks.map((st, i) => ({
  news: +(st.drift + STOCK_DEFS[i].beta * m.marketDrift).toFixed(4),
  pull: +floorPull(STOCK_DEFS[i], st).toFixed(4),
}));

// 하루 마감(자정): 사건 여파가 하루만큼 줄어듦
function closeDay(m) {
  m.open = false; m.pending = [];
  m.stocks.forEach(st => { st.drift *= DRIFT_DECAY; });
  m.marketDrift *= DRIFT_DECAY;
}

// 하루 전체 (점검용)
function stepDay(m) {
  m.clock = 0;
  const happened = openDay(m);
  for (let t = 0; t < TICKS_PER_DAY; t++) { m.clock = Math.floor(t * 1440 / TICKS_PER_DAY); happened.push(...stepTick(m)); }
  closeDay(m);
  return happened;
}

const SEASON_NAME = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };
const seasonName = m => SEASON_NAME[seasonOf(monthOf(m))];

module.exports = {
  VOL, SECTORS, TAG_LABEL, STOCK_DEFS, WEATHER, LESSON_KEYS, TICKS_PER_DAY,
  createMarket, openDay, stepTick, closeDay, stepDay, monthOf, seasonName, tickSize, forcesOf, scheduleNews,
};

// ===== 점검: node market.js → 60거래일 × 100판 모의 실행 (1초 시세라 하루 2880번, 약 1분 30초 걸림) =====
const GAMES = 100;
if (require.main === module) {
  const assert = require('assert');
  const seen = new Set(), weatherSeen = new Set(), idxRet = [], stockRet = [];
  let events = 0;
  for (let g = 0; g < GAMES; g++) {
    const m = createMarket();
    for (let d = 0; d < 60; d++) { stepDay(m); weatherSeen.add(m.weather); }
    events += m.newsId;
    m.news.forEach(n => seen.add(n.key));
    m.stocks.forEach((st, i) => {
      assert.strictEqual(st.hist.length, 61);
      st.hist.forEach(p => assert.ok(Number.isFinite(p) && p >= STOCK_DEFS[i].price * MIN_PRICE * 0.99, `가격 오류·바닥 아래 ${st.sym} ${p}`));
      assert.strictEqual(st.price % tickSize(st.price), 0, '호가 단위');
      assert.strictEqual(st.hist[st.hist.length - 1], st.price, '오늘 일봉 = 현재가');
      stockRet.push(st.price / STOCK_DEFS[i].price - 1);
    });
    assert.ok(m.depositRate >= DEPOSIT_RATE.min && m.depositRate <= DEPOSIT_RATE.max);
    idxRet.push(m.index[m.index.length - 1] / 1000 - 1);
  }
  assert.strictEqual(STOCK_DEFS.length, 30);
  assert.strictEqual(new Set(STOCK_DEFS.map(s => s.sym)).size, 30);
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return (s[Math.floor(p * (s.length - 1))] * 100).toFixed(1) + '%'; };
  console.log(`판당 사건 ${(events / GAMES).toFixed(1)}건, 나온 사건 종류 ${seen.size}/${LESSON_KEYS.length}, 날씨 ${[...weatherSeen].join(' ')}`);
  console.log(`60일 지수 수익률: 하위10% ${q(idxRet, .1)} · 중앙 ${q(idxRet, .5)} · 상위10% ${q(idxRet, .9)}`);
  console.log(`60일 종목 수익률: 하위10% ${q(stockRet, .1)} · 중앙 ${q(stockRet, .5)} · 상위10% ${q(stockRet, .9)}`);
  console.log('점검 통과');
}
