'use strict';
// ===== 도시 모습: 바닥과 그 위에 놓이는 물건(건물·나무 등)의 배치와 그림 =====
// 땅은 끝없이 이어지는 보도블록이고, 그 위에 아래 배치 목록(칸 번호)에 적은 것만 놓임. 칸 = 바닥 사각형 한 칸(32×32픽셀).
// 칸 번호는 마이너스도 됨(처음 서는 곳의 왼쪽·위). 처음 서는 곳은 START.
// 물건은 캐릭터와 같은 굵기의 픽셀(그림 1칸 = 바닥 2픽셀)로 그려서 어울리게 함.
// 지나갈 수 없는 칸(blockedTile)은 못 지나가고, 캐릭터가 물건 뒤(위쪽)로 가면 가려짐(발밑이 아래쪽인 것을 나중에 그림).
const TILE = 32;                        // 바닥 한 칸(사각형)의 픽셀 크기
const START = { x: 20 * TILE, y: 10 * TILE };   // 처음 서는 자리(픽셀)
const ART = 2;                          // 물건 그림 1칸 = 바닥 2픽셀

// ----- 칸 지도: 적지 않은 칸은 모두 '.' 보도블록. 도시를 하나씩 지으면서 칸 종류를 늘려 감 -----
const TILES = new Map();   // "x,y" → 글자
const tileAt = (x, y) => TILES.get(x + ',' + y) || '.';
const setTile = (x, y, k) => TILES.set(x + ',' + y, k);
const SOLID = '';          // 지나갈 수 없는 칸 글자들 (건물 등을 넣으면 여기에 추가)
const blockedTile = (tx, ty) => SOLID.includes(tileAt(tx, ty));

// ----- 그림 -----
const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
// 글자 그림 → 캔버스 (글자 한 칸 = 픽셀 하나, pal = 글자별 색). 물건 그림을 글자로 그릴 때 씀
function artCanvas(rows, pal) {
  const c = makeCanvas(rows[0].length, rows.length), g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}

// 바닥 한 칸 그림: 칸 종류마다 한 번만 그려 저장해 두고 다시 씀
const tileCache = new Map();
function tileImage(tx, ty) {
  const k = tileAt(tx, ty);
  if (tileCache.has(k)) return tileCache.get(k);
  const c = makeCanvas(TILE, TILE), g = c.getContext('2d');
  const box = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  // 보도블록: 16×8 블록을 줄마다 반 칸씩 엇갈려 쌓음. 블록마다 위·왼쪽은 밝게, 아래·오른쪽 줄눈은 어둡게
  box(0, 0, TILE, TILE, '#a9a69f');   // 줄눈
  const tone = ['#cbc8c1', '#c4c1ba', '#d1cec7', '#c7c4bd'];
  for (let row = 0; row < 4; row++) for (let col = -1; col < 2; col++) {
    const x = col * 16 + (row % 2 ? 8 : 0), y = row * 8;
    box(x, y, 15, 7, tone[(row + col + 4) % 4]);   // 블록 (오른쪽·아래 1줄은 줄눈으로 비워 둠)
    box(x, y, 15, 1, '#dad7d0'); box(x, y, 1, 7, '#dad7d0');   // 밝은 모서리
  }
  tileCache.set(k, c);
  return c;
}

// 바닥 위에 서 있는 물건들 { img, x, y }: x = 가운데, y = 발밑(바닥에 닿는 줄) 픽셀 → y로 캐릭터와 앞뒤 순서를 정함
const THINGS = [];
