'use strict';
// ===== 도시 모습 (서울 느낌): 끝없이 이어지는 바둑판 도시 =====
// 땅은 블록(가로 16칸 × 세로 12칸)이 끝없이 반복됨. 칸 = 바닥 사각형 한 칸(32×32픽셀), 칸 번호는 마이너스도 됨.
//   블록 안: 위·왼쪽 2줄 = 2차선 도로(가운데 노란 겹선), 교차로 바로 옆 = 횡단보도, 나머지 = 보도블록,
//            보도 안쪽에 건물 4채(위 2 · 아래 2, 사이는 골목)와 가로수(은행나무).
// 건물 종류·색은 블록 번호로 정해지는 "고정된 무작위"라서, 같은 자리에는 늘 같은 건물이 있음(새로고침해도 같음).
// SPECIAL 블록은 직접 정함(예: 남산타워 공원). 처음 서는 곳은 START.
// 물건(건물·나무)은 캐릭터와 같은 굵기의 픽셀(그림 1칸 = 바닥 2픽셀)로 그림. 건물·나무 자리는 지나갈 수 없음.
const TILE = 32;                        // 바닥 한 칸(사각형)의 픽셀 크기
const ART = 2;                          // 물건 그림 1칸 = 바닥 2픽셀 → 바닥 한 칸 = 그림 16칸
const BW = 16, BH = 12;                 // 블록 크기(칸)
const START = { x: 18 * TILE + 16, y: 14 * TILE + 16 };   // 처음 서는 자리(픽셀): 남산타워 공원 아래 교차로 모퉁이 보도
const SPECIAL = { '1,0': 'namsan' };    // 직접 정한 블록: "블록x,블록y" → 종류

const mod = (a, n) => ((a % n) + n) % n;
// 블록 번호 + 칸 번호로 늘 같은 값이 나오는 0~1 사이 수 (같은 자리 = 같은 건물)
function rand(a, b, c) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ----- 건물 종류: 바닥에서 차지하는 칸(w × 2줄) -----
const KINDS = {
  apt: { w: 4 }, hanok: { w: 4 }, office: { w: 3 }, store: { w: 3 }, cafe: { w: 3 },
};
const PICK = ['apt', 'office', 'store', 'apt', 'cafe', 'hanok', 'office', 'apt'];   // 고를 때의 비율(아파트·오피스가 많음)

// ----- 블록 하나의 배치: 칸 지도(건물 'B', 나무 'T', 잔디 'g')와 서 있는 물건 목록 -----
const blockCache = new Map();
function block(bx, by) {
  const key = bx + ',' + by;
  if (blockCache.has(key)) return blockCache.get(key);
  const tiles = new Map(), things = [];
  const set = (x, y, k) => tiles.set(x + ',' + y, k);
  const put = (type, v, x, y, w) => {   // 물건: 블록 안 칸 (x, y) = 왼쪽 위, 가로 w칸 × 세로 (그림 아래쪽) 줄
    things.push({ type, v, x: ((bx * BW + x) + w / 2) * TILE, y: (by * BH + y) * TILE });
  };
  const tree = (x, y) => {   // 은행나무: 노란 잎 60% · 초록 잎 40%
    if (tiles.has(x + ',' + y) && tiles.get(x + ',' + y) !== 'g') return;
    set(x, y, 'T'); put('tree', rand(bx, by, x * 31 + y) < 0.6 ? 0 : 1, x, y + 1, 1);
  };
  if (SPECIAL[key] === 'namsan') {
    // 남산타워 공원: 잔디 + 가운데 타워 + 둘레 나무
    for (let y = 3; y <= 10; y++) for (let x = 3; x <= 14; x++) set(x, y, 'g');
    for (let x = 8; x <= 9; x++) set(x, 7, 'B');
    put('namsan', 0, 8, 8, 2);
    for (const [x, y] of [[4, 4], [6, 9], [11, 4], [13, 9], [4, 7], [13, 6]]) tree(x, y);
  } else if (rand(bx, by, 99) < 0.12) {
    // 가끔 동네 공원: 잔디 + 나무
    for (let y = 3; y <= 10; y++) for (let x = 3; x <= 14; x++) set(x, y, 'g');
    for (let i = 0; i < 7; i++) tree(4 + Math.floor(rand(bx, by, i) * 10), 4 + Math.floor(rand(bx, by, i + 50) * 6));
  } else {
    // 건물 4채: 위 줄(5~6줄), 아래 줄(9~10줄) × 왼쪽(3칸부터) · 오른쪽(9칸부터). 사이 7~8줄은 걸어 다니는 골목
    let slot = 0;
    for (const row of [5, 9]) for (const x0 of [3, 9]) {
      const type = PICK[Math.floor(rand(bx, by, slot) * PICK.length)], w = KINDS[type].w;
      const x = x0 + (4 - w);   // 좁은 건물은 오른쪽으로 붙임
      for (let y = row; y < row + 2; y++) for (let xx = x; xx < x + w; xx++) set(xx, y, 'B');
      put(type, Math.floor(rand(bx, by, slot + 10) * (type === 'apt' ? 16 : 4)), x, row + 2, w);   // 아파트는 색 4가지 × 동 번호 4가지
      slot++;
    }
  }
  // 가로수: 아래쪽 도로 앞 보도에 은행나무 세 그루
  for (const x of [4, 9, 14]) if (!tiles.has(x + ',11')) tree(x, 11);
  const b = { tiles, things };
  blockCache.set(key, b);
  return b;
}

// ----- 칸 종류: 도로·횡단보도는 블록 안 위치로 정하고, 나머지는 블록 배치에서 -----
//   'h0'/'h1' 가로 도로 위·아래 차선, 'v0'/'v1' 세로 도로 왼쪽·오른쪽 차선, '+' 교차로, 'zh'/'zv' 횡단보도(가로/세로 도로 위),
//   '.' 보도블록, 'g' 잔디, 'B' 건물, 'T' 나무
function tileAt(tx, ty) {
  const mx = mod(tx, BW), my = mod(ty, BH), hr = my < 2, vr = mx < 2;
  if (hr && vr) return '+';
  if (hr) return mx === 2 || mx === BW - 1 ? 'zh' : 'h' + my;
  if (vr) return my === 2 || my === BH - 1 ? 'zv' : 'v' + mx;
  return block(Math.floor(tx / BW), Math.floor(ty / BH)).tiles.get(mx + ',' + my) || '.';
}
const isRoad = k => k === '+' || k[0] === 'h' || k[0] === 'v' || k[0] === 'z';
const blockedTile = (tx, ty) => 'BT'.includes(tileAt(tx, ty));   // 건물·나무는 못 지나감

// 화면 근처 블록들의 물건 (건물은 위로 솟아 있으니 위·아래로 한 블록씩 더)
function thingsAround(x0, y0, x1, y1) {
  const out = [];
  for (let by = Math.floor(y0 / (BH * TILE)) - 1; by <= Math.floor(y1 / (BH * TILE)) + 1; by++)
    for (let bx = Math.floor(x0 / (BW * TILE)) - 1; bx <= Math.floor(x1 / (BW * TILE)) + 1; bx++)
      out.push(...block(bx, by).things);
  return out;
}

// ----- 그림 -----
const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const INK = '#2f2b38';   // 물건 테두리 색 (캐릭터 테두리처럼 아주 검지 않게)

// 바닥 한 칸 그림: 칸 종류(+ 보도는 도로와 닿는 쪽)마다 한 번만 그려 저장해 두고 다시 씀
const tileCache = new Map();
function tileImage(tx, ty) {
  const k = tileAt(tx, ty);
  // 보도·잔디는 도로와 닿는 쪽에 연석을 그림 → 이웃 도로 여부를 열쇠에 넣음
  const curb = isRoad(k) ? '' : [isRoad(tileAt(tx, ty - 1)), isRoad(tileAt(tx, ty + 1)), isRoad(tileAt(tx - 1, ty)), isRoad(tileAt(tx + 1, ty))].map(Number).join('');
  const key = k + curb;
  if (tileCache.has(key)) return tileCache.get(key);
  const c = makeCanvas(TILE, TILE), g = c.getContext('2d');
  const box = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  if (isRoad(k)) {
    box(0, 0, TILE, TILE, '#4b4b55');   // 아스팔트
    for (const [px, py] of [[5, 7], [19, 3], [26, 21], [11, 25], [22, 13]]) box(px, py, 2, 2, '#55555f');
    const YEL = '#f2c94c', WHITE = '#f4f4f0';
    if (k === 'h0') box(0, TILE - 5, TILE, 2, YEL), box(0, TILE - 2, TILE, 2, YEL);   // 가운데 노란 겹선 (위 차선 아래 끝)
    if (k === 'h1') box(0, 0, TILE, 2, YEL), box(0, 3, TILE, 2, YEL);                 // (아래 차선 위 끝) — 둘이 붙어 한 줄 겹선
    if (k === 'v0') box(TILE - 5, 0, 2, TILE, YEL), box(TILE - 2, 0, 2, TILE, YEL);
    if (k === 'v1') box(0, 0, 2, TILE, YEL), box(3, 0, 2, TILE, YEL);
    if (k === 'zh') for (let y = 3; y < TILE; y += 8) box(4, y, TILE - 8, 4, WHITE);   // 횡단보도: 가로 도로 위에는 가로 막대
    if (k === 'zv') for (let x = 3; x < TILE; x += 8) box(x, 4, 4, TILE - 8, WHITE);   // 세로 도로 위에는 세로 막대
  } else if (k === 'g') {   // 잔디
    box(0, 0, TILE, TILE, '#7cbf5a');
    for (const [px, py] of [[6, 7], [20, 11], [13, 22], [25, 25], [9, 16]]) box(px, py, 2, 2, '#68a84a');
  } else {                  // 보도블록 (건물·나무 아래도 보도): 16×8 블록을 줄마다 반 칸씩 엇갈려 쌓음
    box(0, 0, TILE, TILE, '#a9a69f');   // 줄눈
    const tone = ['#cbc8c1', '#c4c1ba', '#d1cec7', '#c7c4bd'];
    for (let row = 0; row < 4; row++) for (let col = -1; col < 2; col++) {
      const x = col * 16 + (row % 2 ? 8 : 0), y = row * 8;
      box(x, y, 15, 7, tone[(row + col + 4) % 4]);
      box(x, y, 15, 1, '#dad7d0'); box(x, y, 1, 7, '#dad7d0');
    }
  }
  if (curb) {   // 연석: 도로와 닿는 쪽에 밝은 돌 + 그림자 한 줄
    const [up, down, left, right] = [...curb].map(Number);
    if (up) box(0, 0, TILE, 3, '#e4e2dc'), box(0, 3, TILE, 1, '#8f8c85');
    if (down) box(0, TILE - 4, TILE, 1, '#f0eee8'), box(0, TILE - 3, TILE, 3, '#8f8c85');
    if (left) box(0, 0, 3, TILE, '#e4e2dc'), box(3, 0, 1, TILE, '#8f8c85');
    if (right) box(TILE - 4, 0, 1, TILE, '#f0eee8'), box(TILE - 3, 0, 3, TILE, '#8f8c85');
  }
  tileCache.set(key, c);
  return c;
}

// ----- 물건 그림 (그림 1칸 = 바닥 2픽셀). 종류·색 번호(v)마다 한 번만 그려 저장 -----
// 간판 글씨는 픽셀 폰트(갈무리11). 글꼴이 늦게 오면 받은 뒤 다시 그림
const artCache = new Map();
document.fonts?.load('11px Galmuri11').then(() => artCache.clear()).catch(() => {});
function thingArt(t) {
  const key = t.type + t.v;
  if (!artCache.has(key)) artCache.set(key, ARTS[t.type](t.v));
  return artCache.get(key);
}
function painter(w, h) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const box = (x, y, bw, bh, color) => { g.fillStyle = color; g.fillRect(x, y, bw, bh); };
  const text = (s, x, y, color) => { g.font = '11px Galmuri11, monospace'; g.fillStyle = color; g.textBaseline = 'top'; g.fillText(s, x, y); };
  return { c, g, box, text };
}
const ACCENT = ['#3d7fd6', '#4bb3a0', '#e8454b', '#f2a03d'];
const ARTS = {
  // 아파트: 흰 벽 + 층마다 창문·베란다 + 왼쪽 색 띠 + "1XX동" 번호 + 1층 유리 현관 (바닥 4칸 × 2줄, 높이 5.5칸)
  // v: 0~15 → 색 = v % 4, 동 번호 = 101 + v
  apt(v) {
    const { c, box, text } = painter(64, 88), acc = ACCENT[v % 4];
    box(0, 2, 64, 86, INK); box(1, 3, 62, 84, '#f3efe6');
    box(1, 3, 62, 5, '#d9d3c6'); box(1, 8, 62, 1, INK);               // 옥상 난간
    box(1, 9, 6, 78, acc);                                           // 색 띠
    text(`${101 + v}동`, 30, 10, acc);
    for (let fy = 24; fy <= 64; fy += 10) {
      for (const wx of [11, 21, 31, 41, 51]) { box(wx, fy, 7, 6, '#2f3b55'); box(wx + 1, fy + 1, 5, 2, '#8fb3de'); }
      box(9, fy + 7, 52, 1, '#c9c2b4');                               // 베란다 난간 줄
    }
    box(8, 75, 54, 12, '#e4ddd0');
    box(26, 74, 14, 3, acc); box(27, 77, 12, 10, INK); box(28, 78, 10, 9, '#a9d6f2'); box(33, 78, 1, 9, INK);   // 현관
    return c;
  },
  // 오피스 빌딩: 파란 유리 격자 + 빛 반사 + 꼭대기 (바닥 3칸 × 2줄, 높이 6.5칸)
  office(v) {
    const { c, box } = painter(48, 104), glass = ['#5b86c2', '#4f9fae', '#6f7fb8', '#5a8fa8'][v];
    box(0, 0, 48, 104, INK); box(1, 5, 46, 98, glass); box(1, 1, 46, 4, '#3a3a48');
    for (let y = 12; y < 88; y += 8) box(1, y, 46, 1, INK + '66');
    for (let x = 9; x < 47; x += 8) box(x, 5, 1, 83, INK + '66');
    for (let i = 0; i < 5; i++) box(6 + i * 2, 18 + i * 13, 6, 1, '#d7e8fb');   // 빛 반사
    box(1, 88, 46, 15, '#d9d6cf'); box(16, 89, 16, 14, INK); box(17, 90, 14, 13, '#bfe0f5'); box(24, 90, 1, 13, INK);   // 1층 로비
    return c;
  },
  // 편의점: 흰 건물 + 파랑·초록 띠 간판 "편의점" + 큰 유리창 (바닥 3칸 × 2줄)
  store(v) {
    const { c, box, text } = painter(48, 46);
    box(0, 4, 48, 42, INK); box(1, 5, 46, 40, '#f7f7f2');
    box(1, 5, 46, 3, ['#2f7fd6', '#5dbb4a', '#e8454b', '#7b5bd6'][v]); box(1, 17, 46, 2, '#5dbb4a');
    text('편의점', 8, 6, '#2b2b2b');
    box(3, 22, 42, 17, INK); box(4, 23, 40, 15, '#9fd3f0'); box(4, 23, 40, 2, '#d7eefa');
    for (const x of [13, 33]) box(x, 23, 1, 15, INK);
    box(19, 24, 10, 21, INK); box(20, 25, 8, 20, '#cfe6f7');           // 자동문
    box(1, 40, 46, 5, '#d9d6cf');
    return c;
  },
  // 카페: 벽돌 벽 + 줄무늬 차양 + 나무 간판 "카페" + 따뜻한 창 (바닥 3칸 × 2줄)
  cafe(v) {
    const { c, box, text } = painter(48, 48), brick = ['#b5653f', '#9a6b45', '#c27b5a', '#8a5a4a'][v];
    box(0, 2, 48, 46, INK); box(1, 3, 46, 44, brick);
    for (let y = 6; y < 46; y += 4) box(1, y, 46, 1, '#00000022');
    box(11, 5, 26, 11, INK); box(12, 6, 24, 9, '#3a2a22'); text('카페', 15, 6, '#f6e3b4');
    for (let x = 1; x < 47; x += 6) { box(x, 18, 3, 6, '#5a9a5a'); box(x + 3, 18, 3, 6, '#f7f3e8'); }   // 차양 줄무늬
    for (let x = 1; x < 47; x += 6) box(x, 24, 3, 1, '#5a9a5a');
    box(4, 27, 18, 14, INK); box(5, 28, 16, 12, '#f6e3b4'); box(8, 34, 4, 5, '#5a9a5a');   // 창 + 화분
    box(28, 27, 12, 20, INK); box(29, 28, 10, 19, '#7a4f33'); box(36, 37, 1, 2, '#f2c94c'); // 나무 문
    return c;
  },
  // 한옥: 휘어 올라간 기와지붕 + 나무 기둥 + 한지 창 + 돌 기단 (바닥 4칸 × 2줄)
  hanok(v) {
    const { c, box } = painter(64, 56);
    box(2, 46, 60, 10, INK); box(3, 47, 58, 8, '#a8a49c'); for (let x = 3; x < 61; x += 8) box(x, 47, 1, 8, '#8f8b84');   // 기단
    box(6, 26, 52, 21, INK); box(7, 27, 50, 19, '#efe3c8');
    for (const x of [7, 23, 40, 54]) box(x, 27, 3, 19, '#8a5a3b');    // 기둥
    for (const x of [11, 27, 44]) {                                     // 한지 창살
      box(x, 30, 9, 12, '#fbf6ea');
      for (let i = 0; i <= 9; i += 3) box(x + i, 30, 1, 12, '#a87a55');
      for (let j = 0; j <= 12; j += 4) box(x, 30 + j, 9, 1, '#a87a55');
    }
    // 기와지붕: 아래로 갈수록 넓어지고, 양 끝은 위로 살짝 들림
    for (let y = 6; y < 27; y++) {
      const half = 18 + Math.floor((y - 6) * 0.65), x = 32 - half;
      box(x, y, half * 2, 1, y % 3 === 0 ? '#5a5e68' : '#3d4048');
    }
    box(0, 22, 4, 3, '#3d4048'); box(60, 22, 4, 3, '#3d4048'); box(0, 20, 2, 2, '#3d4048'); box(62, 20, 2, 2, '#3d4048');   // 들린 처마 끝
    box(12, 3, 40, 4, '#2a2c33'); box(10, 1, 4, 4, '#2a2c33'); box(50, 1, 4, 4, '#2a2c33');   // 용마루
    return c;
  },
  // 은행나무: 위로 좁고 아래로 넓은 잎 + 가는 줄기. 노란색·초록색 (바닥 1칸)
  tree(v) {
    const { c, box } = painter(16, 30), [leaf, dark, light] = v === 0 ? ['#f2c94c', '#d9a42c', '#f8e08a'] : ['#6dbb4f', '#4f9a3c', '#9fd67e'];
    for (let y = 1; y < 22; y++) {
      const half = Math.min(7, 1 + Math.floor(y / 2.6)), x = 8 - half;
      box(x - 1, y, half * 2 + 2, 1, INK); box(x, y, half * 2, 1, leaf); box(8, y, half, 1, dark);
    }
    box(7, 0, 2, 1, INK); box(5, 6, 2, 2, light); box(4, 12, 2, 2, light); box(9, 3, 1, 2, light);
    box(6, 22, 4, 8, INK); box(7, 22, 2, 8, '#7a5236');
    return c;
  },
  // 남산타워: 흰 기둥 + 전망대 + 빨강·흰 안테나 + 아래 건물 (바닥 2칸 × 1줄, 높이 약 9칸)
  namsan() {
    const { c, box } = painter(32, 150);
    for (let y = 0; y < 26; y += 4) box(15, y, 2, 4, y % 8 ? '#f4f4f0' : '#e8454b');   // 안테나
    box(13, 24, 6, 6, INK); box(14, 25, 4, 5, '#e4e4ea');
    box(7, 30, 18, 14, INK); box(8, 31, 16, 12, '#e9e9ef'); box(8, 35, 16, 3, '#5b6f8a'); box(8, 31, 16, 2, '#ffffff');   // 전망대
    box(12, 44, 8, 92, INK); box(13, 44, 6, 92, '#efeff3'); box(16, 44, 2, 92, '#cfd0d8');   // 기둥
    box(4, 130, 24, 20, INK); box(5, 131, 22, 18, '#d9d6cf'); box(5, 136, 22, 3, '#9fd3f0'); box(13, 141, 6, 8, '#7a7a86');   // 아래 건물
    return c;
  },
};
