'use strict';
// ===== 캐릭터 픽셀 그림 (24칸 × 48칸, 4등신: 머리 12줄 + 몸 36줄) =====
// 스킨(옷·머리)을 갈아입히기 좋게: 기본 몸은 마네킹처럼 팔·몸통·다리 자리가 또렷하게 나뉘어 있고,
// 옷은 그 자리를 정확히 덮도록 같은 줄·칸에 그림. 그래서 옷 그림만 새로 그리면 어떤 옷이든 몸에 맞음.
//
// 부위별로 겹침: 몸 → 바지 → 신발 → 상의 → 얼굴 → 머리 (뒤에 그린 것이 위로)
// 그림은 글자 한 칸 = 픽셀 하나. 글자가 색을 뜻함:
//   .  비움(투명)        o  테두리
//   s  피부   S 피부 그늘   e 눈   c 볼   m 입
//   h  머리색 H 머리 그늘   t 상의색 T 상의 그늘   p 바지색 P 바지 그늘   b 신발색
// 대문자 그늘색은 자동으로 조금 어둡게 만듦. 옷 모양 하나로 색만 바꿔 여러 아이템을 만들 수 있음.
// at = 몇 번째 줄부터 그리는지 (0 = 맨 위).
// 줄 위치: 머리 0~11, 목 12~13, 어깨 14, 팔·몸통 15~26(소매 15~18), 엉덩이 27~28, 다리 29~41, 발 42~45
//
// 방향 5가지(오른쪽 기준):  s 정면(아래)   se 오른쪽 아래   e 오른쪽   ne 오른쪽 위   n 뒤(위)
// 왼쪽 세 방향은 오른쪽 그림을 좌우로 뒤집어 그림 → 모두 8방향.
// 어떤 방향 그림이 없으면 FALLBACK 순서대로 비슷한 방향 그림을 대신 씀. 몸통·옷은 정면(s)과 옆(e)만 있으면 됨.
// legsFrom 줄부터는 다리: 걸을 때 왼다리·오른다리가 번갈아 1칸씩 올라감(자동). 옆모습(e)은 몸 전체가 1칸 들썩임.
const SPRITE = { w: 24, h: 48, legsFrom: 29, foot: 45 };   // foot = 발바닥 줄 (땅에 닿는 자리)
const FALLBACK = { s: ['se'], se: ['s'], e: ['se', 's'], ne: ['n', 'se', 's'], n: ['ne', 's'] };

// 좌우 대칭 그림: 왼쪽 반(12글자)만 적으면 오른쪽 반은 뒤집어 붙임
const sym = (...halves) => halves.map(h => h + [...h].reverse().join(''));
const repeat = (n, ...rows) => Array(n).fill(rows).flat();

// 머리 모양(정면·옆 공통). 옆모습 코는 얼굴 그림에서 덧그림
const HEAD = sym(
  '........oooo',
  '......oossss',
  '.....ossssss',
  '....osssssss',
  '....osssssss',
  '....osssssss',
  '....osssssss',
  '....osssssss',
  '....oSssssss',
  '.....oSsssss',
  '......ooSsss',
  '........oooo',
);

const PARTS = {
  body: {
    base: {
      s: { at: 0, rows: [
        ...HEAD,
        ...sym(
          '.........oss',          // 목
          '.........oSs',
          '.....oooosss',          // 어깨
          '....osssssss',
          ...repeat(9, '...ossosssss'),   // 팔(바깥 테두리·피부 2칸·안쪽 선) + 몸통
          '...oSSosssss',          // 손
          '....oo.ossss',
          '.......ossss',          // 엉덩이
          '.......ossss',
          ...repeat(13, '.......ossso'),  // 다리 (가운데 두 줄 테두리로 두 다리가 나뉨)
          '......osssso',          // 발
          '......oooooo',
        ),
      ] },
      e: { at: 0, rows: [
        ...HEAD,
        '..........osso..........',
        '..........oSso..........',
        '........oooossoo........',
        '.......osssssssso.......',
        ...repeat(9, '.......ossossosso.......'),   // 등 · 팔 · 가슴
        '.......ossoSSosso.......',
        '.......ossoooosso.......',
        '........osssssso........',
        '........osssssso........',
        ...repeat(13, '.........osssso.........'),
        '.........ossssso........',
        '.........ooooooo........',
      ] },
    },
  },
  face: {
    basic: {
      s: { at: 6, rows: sym(
        '.........e..',
        '.........e..',
        '........c...',
        '...........m',
      ) },
      se: { at: 6, rows: [
        '...........e...e........',
        '...........e...e........',
        '..........c.....c.......',
        '.............mm.........',
      ] },
      e: { at: 5, rows: [   // 옆모습: 눈 하나 + 코(머리 테두리 밖으로 1칸)
        '..................o.....',
        '...............e.sso....',
        '...............e.sso....',
        '..............c...o.....',
        '................m.......',
      ] },
      ne: { at: 0, rows: [] },   // 뒤쪽을 볼 때는 얼굴이 안 보임
      n: { at: 0, rows: [] },
    },
  },
  hair: {
    short: {
      s: { at: 0, rows: sym(
        '.......ooooo',
        '.....oohhhhh',
        '....ohhhhhhh',
        '...ohhhhhhhh',
        '...ohhHhhhhh',
        '...ohhhho...',
        '...ohho.....',
        '...ohho.....',
        '...oHho.....',
        '....oo......',
      ) },
      se: { at: 0, rows: [
        ...sym('.......ooooo', '.....oohhhhh', '....ohhhhhhh', '...ohhhhhhhh', '...ohhHhhhhh'),
        '...ohhhhho..........o...',
        '...ohhhho...............',
        '...ohhho................',
        '...oHho.................',
        '....oo..................',
      ] },
      e: { at: 0, rows: [
        ...sym('.......ooooo', '.....oohhhhh', '....ohhhhhhh', '...ohhhhhhhh', '...ohhhhhhhh'),
        '...ohhhhhhhhhhho........',
        '...ohhhhhhhhho..........',
        '...ohhhhhhhho...........',
        '...oHhhhhhho............',
        '....oHHHHHo.............',
        '.....ooooo..............',
      ] },
      ne: { at: 0, rows: [   // 오른쪽 위: 뒷머리 + 오른쪽 귀 옆 피부가 조금 보임
        ...sym('.......ooooo', '.....oohhhhh', '....ohhhhhhh', '...ohhhhhhhh', '...ohhhhhhhh', '...ohhhhhhhh'),
        '...ohhhhhhhhhhhhhhho....',
        '...ohhHhhhhhhhhhhho.....',
        '...ohHHhhhhhhhhHHo......',
        '....oHHHHHHHHHHo........',
        '.....oooooooooo.........',
      ] },
      n: { at: 0, rows: sym(
        '.......ooooo',
        '.....oohhhhh',
        '....ohhhhhhh',
        '...ohhhhhhhh',
        '...ohhhhhhhh',
        '...ohhhhhhhh',
        '...ohhhhhhhh',
        '...ohhHhhhhh',
        '...ohHHhhhhh',
        '....oHHHHHHH',
        '.....ooooooo',
      ) },
    },
  },
  top: {
    tee: {   // 반팔 티: 소매 아래로 팔이 보임
      s: { at: 14, rows: sym(
        '.....oooottt',
        '....ottttttt',
        '...ottottttt',
        '...ottottttt',
        '...oTTottttt',
        ...repeat(7, '......ottttt'),
        '......oTTTTT',
      ) },
      e: { at: 14, rows: [
        '........oooottoo........',
        '.......otttttttto.......',
        '.......ottottotto.......',
        '.......ottottotto.......',
        '.......ottoTTotto.......',
        ...repeat(7, '.......otto..otto.......'),
        '.......oTTo..oTTo.......',
      ] },
    },
  },
  bottom: {
    pants: {
      s: { at: 27, rows: sym(
        '.......opppp',
        '.......opppp',
        ...repeat(13, '.......oPppo'),
      ) },
      e: { at: 27, rows: [
        '........oppppppo........',
        '........oppppppo........',
        ...repeat(13, '.........oPppPo.........'),
      ] },
    },
  },
  shoes: {
    sneakers: {
      s: { at: 42, rows: sym(
        '.......obbbo',
        '.......obbbo',
        '......obbbbo',
        '......oooooo',
      ) },
      e: { at: 42, rows: [
        '.........obbbbo.........',
        '.........obbbbo.........',
        '.........obbbbbbo.......',
        '.........oooooooo.......',
      ] },
    },
  },
};

// 기본 차림 (처음 들어온 사람). 나중에 계정마다 저장하고 상점에서 바꿀 자리
const DEFAULT_LOOK = {
  skin: '#f2c49b',
  body: 'base',
  face: 'basic',
  hair: { shape: 'short', color: '#4a3426' },
  top: { shape: 'tee', color: '#3d7fd6' },
  bottom: { shape: 'pants', color: '#2f3a55' },
  shoes: { shape: 'sneakers', color: '#2b2b2b' },
};
