'use strict';
// ===== 내가 일할 수 있는 일터: 세계 시뮬레이션 일터(sim/work.js, key = "지역:일터 이름") ↔ 맵의 출근 자리 =====
// 브라우저(town.js가 출근 자리 E를 놓음)와 서버(jobs.js가 이 목록에 있는 일터만 구인 공고로 냄)가 같이 씀
// x·y = 출근 자리(칸 단위, 건물 정문 앞 보도). where = 휴대폰에 보여 줄 위치 설명
const WORKPLACES = [
  // 한가람 도심 회사 빌딩
  { key: '한가람:한울금융', scene: 'city', x: 65, y: 7, where: '도심 북쪽 한울금융 빌딩' },
  { key: '한가람:누리소프트', scene: 'city', x: 72, y: 7, where: '도심 북쪽 누리소프트 빌딩' },
  { key: '한가람:대한건설', scene: 'city', x: 79, y: 7, where: '도심 북쪽 대한건설 빌딩' },
  { key: '한가람:가람유통', scene: 'city', x: 86, y: 7, where: '도심 북쪽 가람유통 빌딩' },
  { key: '한가람:한울게임즈', scene: 'city', x: 65, y: 18, where: '도심 골목 한울게임즈 빌딩' },
  { key: '한가람:한울통신', scene: 'city', x: 72, y: 18, where: '도심 골목 한울통신 빌딩' },
  { key: '한가람:하늘항공', scene: 'city', x: 79, y: 18, where: '도심 골목 하늘항공 빌딩' },
  { key: '한가람:한울방송', scene: 'city', x: 86, y: 18, where: '도심 골목 한울방송 빌딩' },
  // 한가람 공공·가게
  { key: '한가람:한가람 시청', scene: 'city', x: 67, y: 27, where: '중앙대로 한가람시청' },
  { key: '한가람:한가람 학교', scene: 'city', x: 29, y: 6, where: '북쪽 한가람 학교' },
  { key: '한가람:한가람 병원', scene: 'city', x: 106.5, y: 7, where: '동부대로 동쪽 병원' },
  { key: '한가람:한가람 카페', scene: 'city', x: 42.5, y: 13, where: '카페거리 첫 카페' },
  { key: '한가람:한가람 식당', scene: 'city', x: 28, y: 13, where: '상가 분식집' },
  { key: '한가람:한가람 전통시장', scene: 'city', x: 30, y: 23, where: '전통시장 입구' },
  { key: '한가람:한가람 마트', scene: 'mart', x: 17.5, y: 9, where: '한가람 마트 계산대 옆 직원 자리' },
  { key: '한가람:한가람 버스', scene: 'city', x: 113, y: 77, where: '강 건너 고속버스터미널 버스 대기실' },
  // 다른 지역
  { key: '별하항:별하수산', scene: 'byeolha', x: 9, y: 18, where: '별하항 수산시장' },
  { key: '별하항:별하항 전통시장', scene: 'byeolha', x: 5, y: 18, where: '별하항 수산시장 왼쪽' },
  { key: '단비:한빛전자 본사·공장', scene: 'danbi', x: 7, y: 11, where: '단비 한빛전자 공장' },
  { key: '단비:새봄화학 본사·공장', scene: 'danbi', x: 32, y: 11, where: '단비 새봄화학 공장' },
  { key: '단비:단비 물류센터', scene: 'danbi', x: 42, y: 27, where: '단비 물류창고' },
  { key: '누리벌:누리곡산', scene: 'nuribeol', x: 3.5, y: 11, where: '누리벌 빨간 헛간' },
];

if (typeof module === 'object') module.exports = { WORKPLACES };
