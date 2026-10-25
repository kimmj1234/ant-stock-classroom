'use strict';
// ===== 세계 자료: 지역 · 직업 · 일터 · 이름 · 사건 목록 =====
// 숫자만 바꾸면 세계가 바뀌게 자료는 여기에 모아 둠 (모듈 코드는 그대로)

// 지역 14곳 (country.js와 같은 이름): 목표 인구, 특산 일터. 열린 곳(open)은 지금 걸어 다닐 수 있는 맵이 있음
const REGIONS = {
  한가람: { pop: 320, open: 'city', jobs: ['office', 'office', 'dev', 'dev', 'banker', 'builder', 'vendor'] },
  누리벌: { pop: 110, open: 'nuribeol', jobs: ['farmer', 'farmer', 'farmer'] },
  별하항: { pop: 120, open: 'byeolha', jobs: ['fisher', 'fisher', 'vendor'] },
  단비: { pop: 150, open: 'danbi', jobs: ['factory', 'factory', 'factory', 'trucker'] },
  솔내: { pop: 70, jobs: ['forester', 'miner'] },
  마루: { pop: 80, jobs: ['researcher', 'researcher', 'dev'] },
  은빛포: { pop: 80, jobs: ['fisher', 'shipbuilder'] },
  바람골: { pop: 60, jobs: ['engineer'] },
  푸른들: { pop: 75, jobs: ['farmer', 'farmer'] },
  아라항: { pop: 100, jobs: ['docker', 'docker', 'office'] },
  늘봄: { pop: 85, jobs: ['hotel', 'hotel', 'cook'] },
  하늬: { pop: 55, jobs: ['saltworker'] },
  새벽곶: { pop: 60, jobs: ['hotel', 'fisher'] },
  노을섬: { pop: 65, jobs: ['farmer', 'hotel'] },
};

// 직업: 이름 · 업종 · 일하는 곳(장소 종류) · 근무 시각 · 하루 품삯(원) · 주말에도 일하는지 · 날씨에 못 하는 날 · 상장 회사
//   장소 종류 = 화면에 보이는지 정함: street·park·market·beach는 밖(맵에 걸어 다님), 나머지는 건물 안
const OCC = {
  office: { name: '회사원', sector: '사무', place: 'office', from: 9, to: 18, wage: 140000 },
  dev: { name: '개발자', sector: 'IT', place: 'office', from: 10, to: 19, wage: 165000 },
  researcher: { name: '연구원', sector: '제약', place: 'lab', from: 9, to: 18, wage: 160000 },
  banker: { name: '은행원', sector: '금융', place: 'office', from: 9, to: 16, wage: 150000 },
  builder: { name: '건설 노동자', sector: '건설', place: 'site', from: 7, to: 16, wage: 150000, weather: ['rain', 'storm', 'snow'] },
  vendor: { name: '시장 상인', sector: '상업', place: 'market', from: 6, to: 19, wage: 110000, weekend: true },
  farmer: { name: '농부', sector: '농업', place: 'field', from: 6, to: 17, wage: 100000, weekend: true, weather: ['storm'] },
  fisher: { name: '어부', sector: '수산', place: 'sea', from: 4, to: 12, wage: 120000, weekend: true, weather: ['rain', 'storm'] },
  factory: { name: '공장 노동자', sector: '제조', place: 'factory', from: 8, to: 17, wage: 130000 },
  trucker: { name: '화물차 기사', sector: '물류', place: 'street', from: 6, to: 15, wage: 125000 },
  forester: { name: '산림 관리인', sector: '임업', place: 'forest', from: 7, to: 16, wage: 105000, weather: ['storm'] },
  miner: { name: '광부', sector: '광업', place: 'mine', from: 7, to: 16, wage: 140000 },
  shipbuilder: { name: '조선소 기술자', sector: '제조', place: 'factory', from: 8, to: 17, wage: 145000 },
  engineer: { name: '풍력 기술자', sector: '에너지', place: 'site', from: 8, to: 17, wage: 150000, weather: ['storm'] },
  docker: { name: '항만 노동자', sector: '해운', place: 'port', from: 7, to: 16, wage: 135000, weekend: true, weather: ['storm'] },
  hotel: { name: '호텔 직원', sector: '관광', place: 'hotel', from: 8, to: 17, wage: 105000, weekend: true },
  saltworker: { name: '염전 일꾼', sector: '농업', place: 'field', from: 6, to: 15, wage: 95000, weather: ['rain', 'storm'] },
  // 어느 지역에나 있는 일
  clerk: { name: '마트 점원', sector: '상업', place: 'shop', from: 10, to: 20, wage: 95000, weekend: true },
  barista: { name: '바리스타', sector: '상업', place: 'cafe', from: 8, to: 17, wage: 95000, weekend: true },
  cook: { name: '요리사', sector: '상업', place: 'restaurant', from: 11, to: 21, wage: 110000, weekend: true },
  teacher: { name: '교사', sector: '교육', place: 'school', from: 8, to: 16, wage: 135000, gov: true },
  nurse: { name: '간호사', sector: '의료', place: 'hospital', from: 7, to: 19, wage: 130000, weekend: true, gov: true },
  doctor: { name: '의사', sector: '의료', place: 'hospital', from: 9, to: 18, wage: 260000, gov: true },
  driver: { name: '버스 기사', sector: '교통', place: 'street', from: 6, to: 15, wage: 120000, weekend: true, gov: true },
  civil: { name: '공무원', sector: '행정', place: 'office', from: 9, to: 18, wage: 130000, gov: true },
};
const COMMON_JOBS = ['clerk', 'barista', 'cook', 'teacher', 'nurse', 'doctor', 'driver', 'civil'];

// 이름 (성은 흔한 순서대로 더 자주)
const SURNAMES = '김김김김이이이박박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경'.split('');
const GIVEN1 = '민서지하도윤예수준현은재유시주건연채우다승태성정아가진나동혜소영보인세한경';
const GIVEN2 = '준윤우호민진서연아은희수현영원빈훈성재율린경혁찬규석혜나리솔';

// 아주 작은 일상 (사람마다 하루에 몇 %): [글, 기분 변화]
const MICRO = [
  ['길에서 귀여운 고양이를 만났다', 6], ['버스를 아슬아슬하게 놓쳤다', -4], ['오랜 친구에게서 연락이 왔다', 8], ['커피를 쏟았다', -3],
  ['복권 5천 원에 당첨됐다', 7], ['우산을 잃어버렸다', -4], ['맛있는 집을 새로 찾았다', 6], ['감기 기운이 있다', -5],
  ['낯선 사람에게 길을 알려 줬다', 4], ['동네 산책이 상쾌했다', 5], ['휴대폰 화면이 깨졌다', -6], ['좋아하는 노래가 라디오에서 나왔다', 4],
  ['이웃이 반찬을 나눠 줬다', 6], ['늦잠을 자서 허둥댔다', -3], ['화분에 꽃이 피었다', 5], ['택배가 늦게 와서 속상했다', -2],
];

// 지역 사건 (지역마다 하루 확률): 글 · 지역 분위기 변화 · 주가 영향(업종 %)
const LOCAL = [
  { text: r => `${r}에 새 빵집이 문을 열었어요`, mood: 3 }, { text: r => `${r} 동네 축제가 열렸어요`, mood: 6 },
  { text: r => `${r} 큰길에서 작은 교통사고가 났어요`, mood: -2 }, { text: r => `${r} 일대가 잠깐 정전됐어요`, mood: -3 },
  { text: r => `${r} 주민들이 길고양이 쉼터를 만들었어요`, mood: 4 }, { text: r => `${r} 동네 축구 대회가 열렸어요`, mood: 4 },
  { text: r => `${r}의 오래된 식당이 방송에 나와 줄이 길어졌어요`, mood: 3 }, { text: r => `${r}에서 수도관이 터져 물이 끊겼어요`, mood: -4 },
];
// 큰 지역 사건: 조건(날씨·지역)이 맞을 때만, 업종 주가 영향
const REGIONAL = [
  { when: (r, wx) => wx === 'rain' && ['누리벌', '푸른들', '한가람'].includes(r), text: r => `${r}에 큰비, 하천이 넘쳐 논밭이 잠겼어요`, mood: -6, fx: { 농업: -3, 건설: 1.5 } },
  { when: (r, wx) => wx === 'sun' && r === '솔내', text: () => '솔내 야산에 산불… 진화에 하루가 걸렸어요', mood: -6, fx: {} },
  { when: r => ['별하항', '은빛포'].includes(r), text: r => `${r} 앞바다에 적조가 번졌어요`, mood: -5, fx: { 수산: -4 } },
  { when: r => r === '단비', text: () => '단비 산업단지에 새 공장 착공… 일자리 늘어날 듯', mood: 4, fx: { 건설: 2, 화학: 1 } },
  { when: (r, wx) => wx === 'sun' && ['늘봄', '새벽곶', '노을섬'].includes(r), text: r => `${r}에 관광객이 몰려 숙소가 꽉 찼어요`, mood: 4, fx: { 항공: 1.5 } },
  { when: r => r === '아라항', text: () => '아라항 물동량 역대 최고… 항구가 밤새 붐벼요', mood: 3, fx: { 해운: 3 } },
];
// 나라 사건: 드물게, 경기·주가 전체에 영향
const NATIONAL = [
  { text: '한울은행, 기준금리 0.25%p 올려… 대출 부담 커져', demand: -0.04, fx: { 건설: -2, 금융: 1 } },
  { text: '한울은행, 기준금리 0.25%p 내려… 경기 살리기', demand: 0.04, fx: { 건설: 2 } },
  { text: '최저임금 5% 오른다… 가게 사장님들 걱정', demand: 0.02, fx: { 식품: -1 } },
  { text: '독감 크게 유행… 병원마다 붐벼요', demand: -0.03, fx: { 제약: 4, 항공: -2 } },
  { text: '수출 석 달째 늘어… 공장마다 바빠요', demand: 0.05, fx: { 전자: 3, 화학: 2, 해운: 2 } },
  { text: '경기 둔화 우려… 사람들이 지갑을 닫아요', demand: -0.05, fx: { 식품: -1, 항공: -2 } },
];

module.exports = { REGIONS, OCC, COMMON_JOBS, SURNAMES, GIVEN1, GIVEN2, MICRO, LOCAL, REGIONAL, NATIONAL };
