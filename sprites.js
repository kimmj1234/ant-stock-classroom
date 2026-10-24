'use strict';
// ===== 캐릭터 픽셀 그림 (16칸 × 18칸) =====
// 하얗고 동글동글한 작은 캐릭터 + 머리에 쓰는 스킨(모자·귀·왕관 등).
// 몸은 모두 같고, 스킨은 머리 위(0~5줄)와 머리 테두리에 겹쳐 그림 → 스킨 그림 한 장이면 누구에게나 맞음.
// 그리는 순서: 몸 → 얼굴 → 모자(스킨) (뒤에 그린 것이 위로)
// 그림은 글자 한 칸 = 픽셀 하나. 글자가 색을 뜻함:
//   .  비움(투명)   o 테두리   w 몸색   W 몸 그늘   e 눈
//   a  스킨 색     A 스킨 그늘   (스킨마다 색을 정함 → 모양 하나로 여러 색 스킨)
//   y  금색   r  빨강   g 초록   p 분홍   k 검정   (색이 고정된 장식)
// at = 몇 번째 줄부터 그리는지 (0 = 맨 위). 줄 위치: 모자 0~5, 머리·몸 4~15, 다리 16~17
//
// 방향 5가지(오른쪽 기준):  s 정면(아래)   se 오른쪽 아래   e 오른쪽   ne 오른쪽 위   n 뒤(위)
// 왼쪽 세 방향은 오른쪽 그림을 좌우로 뒤집어 그림 → 모두 8방향.
// 어떤 방향 그림이 없으면 FALLBACK 순서대로 비슷한 방향 그림을 대신 씀(몸·대칭 모자는 한 장으로 충분).
// legsFrom 줄부터는 다리: 걸을 때 왼다리·오른다리가 번갈아 1칸씩 올라감(자동).
// scale: 바닥 픽셀보다 몇 배로 키워 그릴지 (캐릭터가 작아서 2배)
const SPRITE = { w: 16, h: 18, legsFrom: 16, foot: 17, scale: 2 };
const FALLBACK = { s: ['se'], se: ['s'], e: ['se', 's'], ne: ['n', 'se', 's'], n: ['ne', 's'] };

const PARTS = {
  body: {
    blob: {
      s: { at: 4, rows: [
        '.....oooooo.....',
        '....owwwwwwo....',
        '...owwwwwwwwo...',
        '..owwwwwwwwwWo..',
        '..owwwwwwwwwWo..',
        '..owwwwwwwwwWo..',
        '..owwwwwwwwwWo..',
        '..owwwwwwwwWWo..',
        '...owwwwwwwWo...',
        '...owwwwwwwWo...',
        '...owwwwwwWWo...',
        '...oowwwwwWoo...',
        '....owo..oWo....',
        '....ooo..ooo....',
      ] },
    },
  },
  face: {
    dot: {
      s:  { at: 9, rows: ['......e..e......', '......e..e......'] },
      se: { at: 9, rows: ['.......e..e.....', '.......e..e.....'] },
      e:  { at: 9, rows: ['..........e.e...', '..........e.e...'] },
      ne: { at: 0, rows: [] },   // 뒤쪽을 볼 때는 얼굴이 안 보임
      n:  { at: 0, rows: [] },
    },
  },
  hat: {   // 머리 스킨. 모든 몸에 맞음
    sprout: {   // 새싹
      s: { at: 0, rows: [
        '.....gg.gg......',
        '......ggg.......',
        '.......g........',
        '.......g........',
      ] },
    },
    cat: {   // 고양이 귀 (a = 귀 안쪽 색)
      s: { at: 2, rows: [
        '...o........o...',
        '...oo......oo...',
        '...oao....oao...',
      ] },
    },
    cap: {   // 야구 모자 (a = 모자 색)
      s: { at: 2, rows: [
        '.....oooooo.....',
        '....oaaaaaao....',
        '...oaaayaaaao...',
        '..oAAAAAAAAAAo..',
      ] },
      se: { at: 2, rows: [
        '.....oooooo.....',
        '....oaaaaaao....',
        '...oaaaaayaao...',
        '...oaaaaaAAAAAAo',
      ] },
      n: { at: 2, rows: [
        '.....oooooo.....',
        '....oaaaaaao....',
        '...oaaaaaaaao...',
        '..oaaaaaaaaaao..',
      ] },
    },
    chef: {   // 요리사 모자
      s: { at: 0, rows: [
        '.....oooooo.....',
        '....owwwwwwo....',
        '...owwwwwwwwo...',
        '...owwwwwwwwo...',
        '....oWWWWWWo....',
        '....owwwwwwo....',
      ] },
    },
    crown: {   // 왕관
      s: { at: 1, rows: [
        '....y..yy..y....',
        '....yy.yy.yy....',
        '....yyyyyyyy....',
        '....yryyyyry....',
      ] },
    },
  },
};

// 스킨 목록 (숫자 키로 미리 보기, 나중에 상점에서 팔 자리). null = 아무것도 안 씀
const HATS = [
  null,
  { shape: 'sprout' },
  { shape: 'cat', color: '#f5a3b5' },
  { shape: 'cap', color: '#3d7fd6' },
  { shape: 'cap', color: '#e8454b' },
  { shape: 'chef' },
  { shape: 'crown' },
];

// 기본 차림 (처음 들어온 사람). 나중에 계정마다 저장하고 상점에서 바꿀 자리
const DEFAULT_LOOK = { body: 'blob', color: '#f7f7f7', face: 'dot', hat: null };
