'use strict';
// ===== 캐릭터 픽셀 그림 (16칸 × 24칸) =====
// 부위별로 따로 그려서 겹침: 몸 → 바지 → 신발 → 상의 → 얼굴 → 머리 (뒤에 그린 것이 위로)
// 그림은 글자 한 칸 = 픽셀 하나. 글자가 색을 뜻함:
//   .  비움(투명)        o  테두리
//   s  피부   S 피부 그늘   e 눈   c 볼   m 입
//   h  머리색 H 머리 그늘   t 상의색 T 상의 그늘   p 바지색 P 바지 그늘   b 신발색
// 대소문자 그늘색은 자동으로 조금 어둡게 만듦. 옷 모양 하나로 색만 바꿔 여러 아이템을 만들 수 있음.
// at = 몇 번째 줄부터 그리는지 (0 = 맨 위). front = 앞(아래쪽을 볼 때), back = 뒤(위쪽을 볼 때).
// 그림은 오른쪽을 보는 모습이고, 왼쪽을 볼 때는 좌우를 뒤집어 그림.
// 19번째 줄부터는 다리: 걸을 때 왼다리·오른다리가 번갈아 1칸씩 올라감(자동).
const SPRITE = { w: 16, h: 24, legsFrom: 19 };

const PARTS = {
  body: {
    base: {
      front: { at: 2, rows: [
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
    },
  },
  face: {
    basic: {
      front: { at: 6, rows: [
        '.......e..e.....',
        '.......e..e.....',
        '......c....c....',
        '.........mm.....',
      ] },
      back: { at: 0, rows: [] },   // 뒤에서는 얼굴이 안 보임
    },
  },
  hair: {
    short: {
      front: { at: 1, rows: [
        '.....oooooo.....',
        '...ohhhhhhhho...',
        '..ohhhhhhhhhho..',
        '..ohHhhhhhhhho..',
        '..ohho....ohho..',
        '..oho......oho..',
        '..oho...........',
        '..oho...........',
      ] },
      back: { at: 1, rows: [
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
    },
  },
  top: {
    tee: {
      front: { at: 13, rows: [
        '...otttttttto...',
        '..oTttttttttTo..',
        '..oTttttttttTo..',
        '..oTttttttttTo..',
        '..osttttttttso..',
        '...oTTTTTTTTo...',
      ] },
    },
  },
  bottom: {
    pants: {
      front: { at: 19, rows: [
        '....oppo.oppo...',
        '....oPpo.oPpo...',
      ] },
    },
  },
  shoes: {
    sneakers: {
      front: { at: 21, rows: [
        '....obbo.obbo...',
        '....obbbo.obbbo.',
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
