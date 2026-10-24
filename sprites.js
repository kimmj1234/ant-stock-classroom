'use strict';
// ===== 캐릭터 픽셀 그림 (16칸 × 24칸) =====
// 부위별로 따로 그려서 겹침: 몸 → 바지 → 신발 → 상의 → 얼굴 → 머리 (뒤에 그린 것이 위로)
// 그림은 글자 한 칸 = 픽셀 하나. 글자가 색을 뜻함:
//   .  비움(투명)        o  테두리
//   s  피부   S 피부 그늘   e 눈   c 볼   m 입
//   h  머리색 H 머리 그늘   t 상의색 T 상의 그늘   p 바지색 P 바지 그늘   b 신발색
// 대소문자 그늘색은 자동으로 조금 어둡게 만듦. 옷 모양 하나로 색만 바꿔 여러 아이템을 만들 수 있음.
// at = 몇 번째 줄부터 그리는지 (0 = 맨 위).
//
// 방향 5가지(오른쪽 기준):  s 정면(아래)   se 오른쪽 아래   e 오른쪽   ne 오른쪽 위   n 뒤(위)
// 왼쪽 세 방향(왼쪽 아래·왼쪽·왼쪽 위)은 오른쪽 그림을 좌우로 뒤집어 그림 → 모두 8방향.
// 어떤 방향 그림이 없으면 FALLBACK 순서대로 비슷한 방향 그림을 대신 씀(예: 몸통은 대부분 같아서 se 하나로 충분).
// 19번째 줄부터는 다리: 걸을 때 왼다리·오른다리가 번갈아 1칸씩 올라감(자동). 옆모습(e)은 다리가 겹쳐 있어서 대신 몸 전체가 1칸 들썩임.
const SPRITE = { w: 16, h: 24, legsFrom: 19 };
const FALLBACK = { s: ['se'], se: ['s'], e: ['se'], ne: ['n', 'se'], n: ['ne', 'se'] };

const PARTS = {
  body: {
    base: {
      se: { at: 2, rows: [
        '....oooooooo....',
        '...osssssssso...',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '..oSssssssssSo..',
        '...oSssssssSo...',
        '....oooooooo....',
        '......osso......',
        '...osssssssso...',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '..osssssssssso..',
        '...oossssssoo...',
        '....osso.osso...',
        '....osso.osso...',
        '....osso.osso...',
        '....oooo.oooo...',
      ] },
      e: { at: 2, rows: [
        '....oooooooo....',
        '...osssssssso...',
        '..osssssssssso..',
        '..ossssssssssso.',
        '..ossssssssssso.',
        '..osssssssssso..',
        '..osssssssssso..',
        '..oSssssssssso..',
        '...oSsssssssso..',
        '....ooooooooo...',
        '......osso......',
        '....osssssso....',
        '....osssssso....',
        '....osssssso....',
        '....osssssso....',
        '....osssssso....',
        '....oossssoo....',
        '.....osssso.....',
        '.....osssso.....',
        '.....osssso.....',
        '.....oooooo.....',
      ] },
    },
  },
  face: {
    basic: {
      s: { at: 6, rows: [
        '.....e....e.....',
        '.....e....e.....',
        '....c......c....',
        '.......mm.......',
      ] },
      se: { at: 6, rows: [
        '.......e..e.....',
        '.......e..e.....',
        '......c....c....',
        '.........mm.....',
      ] },
      e: { at: 6, rows: [
        '..........e.....',
        '..........e.....',
        '.........c......',
        '...........m....',
      ] },
      ne: { at: 0, rows: [] },   // 뒤쪽을 볼 때는 얼굴이 안 보임
      n: { at: 0, rows: [] },
    },
  },
  hair: {
    short: {
      s: { at: 1, rows: [
        '.....oooooo.....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohHhhhhhhHho..',
        '..ohhho..ohhho..',
        '..oho......oho..',
        '..oho......oho..',
        '..oho......oho..',
      ] },
      se: { at: 1, rows: [
        '.....oooooo.....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohHhhhhhhhho..',
        '..ohho....ohho..',
        '..oho......oho..',
        '..oho...........',
        '..oho...........',
      ] },
      e: { at: 1, rows: [
        '.....oooooo.....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhho...',
        '..ohhhhhho......',
        '..ohhhhho.......',
        '..ohhhhho.......',
        '..ohHHHo........',
        '...oHHo.........',
      ] },
      n: { at: 1, rows: [
        '.....oooooo.....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhhho..',
        '..ohHhhhhhhHho..',
        '..ohHHhhhhHHho..',
        '...oHHHHHHHHo...',
        '....oooooooo....',
      ] },
      ne: { at: 1, rows: [   // 오른쪽 위: 뒷머리 + 오른쪽 귀 옆 피부가 조금 보임
        '.....oooooo.....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhhho..',
        '..ohhhhhhhhho...',
        '..ohHhhhhhhho...',
        '..ohHHhhhhHo....',
        '...oHHHHHHo.....',
        '....oooooo......',
      ] },
    },
  },
  top: {
    tee: {
      se: { at: 13, rows: [
        '...otttttttto...',
        '..oTttttttttTo..',
        '..oTttttttttTo..',
        '..oTttttttttTo..',
        '..osttttttttso..',
        '...oTTTTTTTTo...',
      ] },
      e: { at: 13, rows: [
        '....otttttto....',
        '....otTtttto....',
        '....otTtttto....',
        '....otTtttto....',
        '....otstttto....',
        '....oTTTTTTo....',
      ] },
    },
  },
  bottom: {
    pants: {
      se: { at: 19, rows: [
        '....oppo.oppo...',
        '....oPpo.oPpo...',
      ] },
      e: { at: 19, rows: [
        '.....oppppo.....',
        '.....oPppPo.....',
      ] },
    },
  },
  shoes: {
    sneakers: {
      se: { at: 21, rows: [
        '....obbo.obbo...',
        '....obbbo.obbbo.',
      ] },
      e: { at: 21, rows: [
        '.....obbbbo.....',
        '.....obbbbbo....',
      ] },
      s: { at: 21, rows: [
        '....obbo.obbo...',
        '...obbbo.obbbo..',
      ] },
    },
  },
};
PARTS.shoes.sneakers.n = PARTS.shoes.sneakers.s;   // 뒤에서 본 신발은 앞과 같은 모양

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
