'use strict';
// ===== 캐릭터 픽셀 그림 (16칸 × 18칸) =====
// 하얗고 동글동글한 작은 캐릭터 + 스킨 두 가지:
//   모자 스킨(hat): 머리 위(0~5줄)와 머리 테두리에 겹쳐 그림
//   전신 스킨(suit): 몸 전체를 옷 색으로 덮고 얼굴 자리만 뚫림(개구리·곰·공룡 옷). makeSuit가 몸 모양에서 자동으로 만듦
// 몸은 모두 같아서 스킨 그림 한 장이면 누구에게나 맞음.
// 그리는 순서: 몸 → 전신 스킨 → 얼굴 → 모자 스킨 (뒤에 그린 것이 위로)
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
    beanie: {   // 털모자 (a = 모자 색, 꼭대기 방울은 흰색)
      s: { at: 1, rows: [
        '.......oo.......',
        '......owwo......',
        '....oaaaaaao....',
        '...oaaaaaaaao...',
        '..oAAAAAAAAAAo..',
      ] },
    },
    wizard: {   // 마법사 모자 (a = 모자 색, 금색 별)
      s: { at: 0, rows: [
        '.......oo.......',
        '......oaao......',
        '.....oaayao.....',
        '....oaaaaaao....',
        '..ooAAAAAAAAoo..',
      ] },
    },
    headphones: {   // 헤드폰 (a = 색). 머리띠 + 양쪽 귀
      s: { at: 3, rows: [
        '....oooooooo....',
        '...oa......ao...',
        '..oa........ao..',
        '..oa........ao..',
        '.oaao......oaao.',
        '.oAAo......oAAo.',
        '.oaao......oaao.',
        '..oo........oo..',
      ] },
    },
  },
  suit: {},   // 전신 스킨: 아래에서 makeSuit로 채움
};

// ===== 전신 스킨 만들기 =====
// 몸 그림을 그대로 옷 색(a·A)으로 바꾸고, 방향마다 얼굴 자리(눈 둘레)를 몸색으로 뚫음. 뒤(n)는 안 뚫림.
// head = 머리 위 장식(귀·눈·뿔)만 직접 그리면 됨 (at 0부터, 16글자)
function makeSuit(head) {
  const body = PARTS.body.blob.s, out = {};
  const HOLE = { s: [7.5, 3], se: [8.5, 3], e: [10.5, 2], n: null };   // 얼굴 구멍 가운데 칸, 반쪽 너비
  for (const [dir, hole] of Object.entries(HOLE)) {
    const grid = Array.from({ length: SPRITE.h }, () => Array(SPRITE.w).fill('.'));
    body.rows.forEach((row, i) => [...row].forEach((ch, x) => { grid[body.at + i][x] = { w: 'a', W: 'A' }[ch] || ch; }));
    head.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') grid[y][x] = ch; }));
    if (hole) {
      const [cx, hw] = hole;
      for (let y = 8; y <= 12; y++) for (let x = 0; x < SPRITE.w; x++) {
        const edge = y === 8 || y === 12 ? 1 : 0;   // 위아래 줄은 1칸 좁게 → 둥근 구멍
        if (Math.abs(x - cx) <= hw - edge && 'aA'.includes(grid[y][x])) grid[y][x] = 'w';
      }
    }
    out[dir] = { at: 0, rows: grid.map(r => r.join('')) };
  }
  return out;
}
PARTS.suit.frog = makeSuit([   // 개구리 옷: 머리 위 툭 튀어나온 두 눈
  '................',
  '................',
  '...ooo....ooo...',
  '..owkwo..owkwo..',
  '..oaaao..oaaao..',
]);
PARTS.suit.bear = makeSuit([   // 곰 옷: 둥근 귀 (안쪽 분홍)
  '................',
  '................',
  '..ooo......ooo..',
  '.oapao....oapao.',
  '.oaaao....oaaao.',
]);
PARTS.suit.dino = makeSuit([   // 공룡 옷: 머리 위 뾰족한 등 가시
  '................',
  '......o...o.....',
  '.....oAo.oAo....',
  '.....oAAoAAo....',
]);

// 스킨 목록 (미리 보기 키로 바꿔 봄, 나중에 상점에서 팔 자리). null = 아무것도 안 입음
const HATS = [   // 숫자 키 0~9
  null,
  { shape: 'sprout' },
  { shape: 'cat', color: '#f5a3b5' },
  { shape: 'cap', color: '#3d7fd6' },
  { shape: 'cap', color: '#e8454b' },
  { shape: 'chef' },
  { shape: 'crown' },
  { shape: 'beanie', color: '#f2a03d' },
  { shape: 'wizard', color: '#7b5bd6' },
  { shape: 'headphones', color: '#e8454b' },
];
const SUITS = [   // Q 키로 차례로
  null,
  { shape: 'frog', color: '#6cc04a' },
  { shape: 'bear', color: '#a0714f' },
  { shape: 'dino', color: '#4bb3a0' },
];

// 기본 차림 (처음 들어온 사람). 나중에 계정마다 저장하고 상점에서 바꿀 자리
const DEFAULT_LOOK = { body: 'blob', color: '#f7f7f7', face: 'dot', suit: null, hat: null };
