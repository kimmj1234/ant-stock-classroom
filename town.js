'use strict';
// ===== 마을 모습: 바닥(풀밭·길·꽃밭)과 물건(나무·집)의 배치와 그림 =====
// 땅은 끝없이 이어지는 풀밭이고, 그 위에 아래 목록(칸 번호)에 적은 것만 놓임. 칸 = 바닥 사각형 한 칸(32×32픽셀).
// 칸 번호는 마이너스도 됨(마을 중심 왼쪽·위). 처음 서는 곳은 START.
// 나무·집은 캐릭터와 같은 굵기의 픽셀(그림 1칸 = 바닥 2픽셀)로 그려서 어울리게 함.
// 나무·집 자리는 지나갈 수 없음. 캐릭터가 나무·집 뒤(위쪽)로 가면 가려짐(아래쪽에 있는 것을 나중에 그림).
const TILE = 32;                        // 바닥 한 칸(사각형)의 픽셀 크기
const START = { x: 20 * TILE, y: 10 * TILE };   // 처음 서는 자리(픽셀): 큰길 네거리
const ART = 2;                          // 나무·집 그림 1칸 = 바닥 2픽셀

// ----- 배치 -----
const ROADS = [   // 길: [시작 칸 x, y, 끝 칸 x, y] 직사각형
  [1, 9, 38, 10],     // 가운데 가로 큰길
  [19, 1, 20, 18],    // 가운데 세로 큰길
  [3, 16, 36, 16],    // 아래쪽 골목
];
const HOUSES = [  // 집: 왼쪽 위 칸 [x, y], 지붕 색. 집 하나 = 가로 3칸 × 세로 2칸, 문은 아래 가운데
  [4, 5, '#e8454b'], [10, 5, '#3d7fd6'], [26, 5, '#f2a03d'], [32, 5, '#7b5bd6'],
  [6, 13, '#4bb3a0'], [28, 13, '#d4537e'],
];
const TREES = [   // 나무 [x, y]
  [14, 3], [15, 6], [16, 3], [23, 3], [24, 6], [36, 2], [2, 3], [8, 2],
  [2, 12], [13, 12], [16, 14], [23, 13], [24, 12], [35, 12], [37, 14], [11, 14], [33, 18],
];
const FLOWERS = [ // 꽃밭 [x, y]
  [8, 3], [9, 3], [3, 7], [12, 12], [25, 15], [26, 15], [34, 8], [30, 3], [17, 12], [22, 7],
];

// ----- 칸 지도 만들기: '.' 풀밭(적지 않은 칸은 모두 풀밭), '=' 길, '*' 꽃밭, 'T' 나무, 'H' 집 -----
const TILES = new Map();   // "x,y" → 글자
const tileAt = (x, y) => TILES.get(x + ',' + y) || '.';
const setTile = (x, y, k) => TILES.set(x + ',' + y, k);
for (const [x0, y0, x1, y1] of ROADS) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setTile(x, y, '=');
for (const [hx, hy] of HOUSES) {
  for (let y = hy; y < hy + 2; y++) for (let x = hx; x < hx + 3; x++) setTile(x, y, 'H');
  for (let y = hy + 2, n = 0; tileAt(hx + 1, y) !== '=' && n < 20; y++, n++) setTile(hx + 1, y, '=');   // 문 앞에서 아래쪽 길까지 오솔길 (20칸 안에 길이 없으면 거기까지)
}
for (const [x, y] of FLOWERS) if (tileAt(x, y) === '.') setTile(x, y, '*');
for (const [x, y] of TREES) if ('.*'.includes(tileAt(x, y))) setTile(x, y, 'T');

// 지나갈 수 없는 칸인지
const blockedTile = (tx, ty) => 'TH'.includes(tileAt(tx, ty));

// ----- 그림 -----
const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
// 글자 그림 → 캔버스 (글자 한 칸 = 픽셀 하나, pal = 글자별 색)
function artCanvas(rows, pal) {
  const c = makeCanvas(rows[0].length, rows.length), g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}

// 나무 (16×18): 둥근 잎 + 줄기
const TREE_ART = artCanvas([
  '.....oooooo.....',
  '...oogggggGoo...',
  '..ogggggggggGo..',
  '.oggglgggggggGo.',
  '.ogglllgggggGGo.',
  'ogggllgggggggGGo',
  'oggggggggggggGGo',
  'ogggggggggggGGGo',
  'ogggggggggggGGGo',
  '.ogggggggggGGGo.',
  '.oGggggggGGGGGo.',
  '..oGGGgggGGGGo..',
  '...ooGGGGGGoo...',
  '......obbo......',
  '......obBo......',
  '......obBo......',
  '.....obbBBo.....',
  '.....oooooo.....',
], { o: '#33402f', g: '#5fae4a', G: '#3f8a37', l: '#8fd16a', b: '#9a6b45', B: '#6f4a30' });

// 집 (48×40): 지붕 + 벽 + 창문 두 개 + 가운데 문. 바닥 3칸 × 2칸을 차지하고 지붕이 위로 반 칸 솟음
function houseArt(roof) {
  const c = makeCanvas(48, 40), g = c.getContext('2d');
  const box = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  const dark = '#3a3340', shadeRoof = '#' + [1, 3, 5].map(i => Math.round(parseInt(roof.slice(i, i + 2), 16) * 0.72).toString(16).padStart(2, '0')).join('');
  // 벽
  box(3, 17, 42, 22, dark); box(4, 18, 40, 20, '#f3e6c8'); box(4, 34, 40, 4, '#e2d1ad');
  // 지붕: 위로 갈수록 좁아지는 사다리꼴 + 아래 처마 그늘
  for (let y = 0; y < 18; y++) {
    const inset = Math.max(0, 9 - Math.floor(y / 2));
    box(inset, y, 48 - inset * 2, 1, dark);
    if (y > 0) box(inset + 1, y, 46 - inset * 2, 1, y > 13 ? shadeRoof : roof);
  }
  for (let y = 3; y < 14; y += 3) box(10, y, 28, 1, shadeRoof);   // 지붕 기와 줄
  // 창문
  for (const wx of [8, 32]) { box(wx, 22, 8, 8, dark); box(wx + 1, 23, 6, 6, '#9fd3f0'); box(wx + 1, 23, 2, 2, '#e8f6ff'); box(wx + 4, 23, 1, 6, dark); }
  // 문
  box(19, 25, 10, 14, dark); box(20, 26, 8, 13, '#9a6b45'); box(26, 32, 1, 2, '#f2c94c');
  return c;
}

// 바닥 한 칸 그림: 칸 종류(+ 길은 이웃이 길인지)마다 한 번만 그려 저장해 두고 다시 씀
const tileCache = new Map();
function tileImage(tx, ty) {
  const k = tileAt(tx, ty);
  const road = (x, y) => tileAt(x, y) === '=';
  const key = k === '=' ? '=' + [road(tx, ty - 1), road(tx, ty + 1), road(tx - 1, ty), road(tx + 1, ty)].map(Number).join('') : k === '*' ? '*' : '.';
  if (tileCache.has(key)) return tileCache.get(key);
  const c = makeCanvas(TILE, TILE), g = c.getContext('2d');
  const box = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  if (k === '=') {   // 길: 흙색 + 작은 돌, 풀밭과 닿는 쪽만 테두리
    const [up, down, left, right] = [...key.slice(1)].map(Number);
    box(0, 0, TILE, TILE, '#dcbc85');
    if (!up) box(0, 0, TILE, 2, '#b98d55');
    if (!down) box(0, TILE - 2, TILE, 2, '#c9a36a');
    if (!left) box(0, 0, 2, TILE, '#b98d55');
    if (!right) box(TILE - 2, 0, 2, TILE, '#c9a36a');
    for (const [px, py] of [[7, 9], [21, 5], [14, 22], [26, 18]]) box(px, py, 2, 2, '#c49a5e');
  } else {           // 풀밭 (꽃밭·나무·집 아래도 풀)
    box(0, 0, TILE, TILE, '#7cbf5a');
    for (const [px, py] of [[6, 7], [20, 11], [13, 22], [25, 25], [9, 16]]) box(px, py, 2, 2, '#68a84a');
    if (k === '*') for (const [px, py, col] of [[6, 6, '#ffffff'], [18, 9, '#f5a3b5'], [10, 19, '#f2c94c'], [23, 22, '#ffffff'], [26, 4, '#f2c94c'], [4, 26, '#f5a3b5']]) {
      box(px - 2, py, 6, 2, col); box(px, py - 2, 2, 6, col); box(px, py, 2, 2, '#e8a33d');   // 꽃잎 + 가운데
    }
  }
  tileCache.set(key, c);
  return c;
}

// 바닥 위에 서 있는 물건들. y = 발밑(바닥에 닿는 줄) 픽셀 → 이 값으로 캐릭터와 앞뒤 순서를 정함
const THINGS = [
  ...TREES.filter(([x, y]) => tileAt(x, y) === 'T').map(([x, y]) => ({ img: TREE_ART, x: x * TILE + TILE / 2, y: (y + 1) * TILE })),
  ...HOUSES.map(([x, y, roof]) => ({ img: houseArt(roof), x: x * TILE + TILE * 1.5, y: (y + 2) * TILE })),
];
