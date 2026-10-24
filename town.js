'use strict';
// ===== 도시 모습 (서울 느낌): 손으로 설계한 16×16칸 블록 하나 =====
// 칸 = 바닥 사각형 한 칸(32×32픽셀). 맵 밖으로는 못 나감.
// 바닥은 아래 GROUND 지도(글자 한 칸 = 바닥 한 칸)로, 서 있는 물건은 THINGS 목록(칸 번호)으로 정함 → 둘 다 고치기 쉬움.
// 물건은 캐릭터와 같은 굵기의 픽셀(그림 1칸 = 바닥 2픽셀)로 그림. 빛은 왼쪽 위에서 와서 그림자는 오른쪽 아래로 짐.
const TILE = 32;                        // 바닥 한 칸(사각형)의 픽셀 크기
const ART = 2;                          // 물건 그림 1칸 = 바닥 2픽셀 → 바닥 한 칸 = 그림 16칸
const COLS = 16, ROWS = 16;             // 맵 크기(칸)
const MAP_W = COLS * TILE, MAP_H = ROWS * TILE;
const START = { x: 5 * TILE + 16, y: 12 * TILE + 16 };   // 처음 서는 자리(픽셀): 큰길 남쪽 보도

// ----- 바닥 지도 -----
//   . 보도(베이지 판석)   k 점자블록(횡단보도 앞 노란 블록)   q 광장 돌바닥   g 잔디   p 주차장
//   R 차도   Z 횡단보도
//   가로 4차선 대로 = 7~10줄, 세로 2차선 골목 = 10~11칸 (차선 무늬·정지선은 위치로 자동)
const GROUND = [
  '..........RR....',
  '..........RR....',
  '..........RR....',
  '..........RR....',
  '..........RR....',
  '.........kZZk...',
  '........kkZZkk..',
  'RRRRRRRRZZRRZZRR',
  'RRRRRRRRZZRRZZRR',
  'RRRRRRRRZZRRZZRR',
  'RRRRRRRRZZRRZZRR',
  '........kkZZkk..',
  '.........kZZk...',
  '..........RR....',
  '..........RR....',
  '..........RR....',
];
const MAIN = [7, 10], SIDE = [10, 11];  // 대로 줄 범위, 골목 칸 범위
const inMap = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const tileAt = (x, y) => (inMap(x, y) ? GROUND[y][x] : null);
const isRoad = k => k === 'R' || k === 'Z';

// ----- 서 있는 물건 -----
const THINGS = [], SOLID = new Set();
// (x, y) = 왼쪽 위 칸, w×d칸 차지. block이면 못 지나감. 그림은 차지한 칸의 아래 가운데에 세움
function place(type, v, x, y, w = 1, d = 1, block = true) {
  if (block) for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) SOLID.add(xx + ',' + yy);
  THINGS.push({ type, v, w, d, x: (x + w / 2) * TILE, y: (y + d) * TILE });
}
const decal = (type, x, y, v = 0) => THINGS.push({ type, v, w: 1, d: 1, x: (x + 0.5) * TILE, y: (y + 1) * TILE, ground: true });   // 바닥 무늬(지나갈 수 있음)
const deco = (type, x, y, v = 0, dy = 0) => THINGS.push({ type, v, w: 1, d: 1, x: (x + 0.5) * TILE, y: (y + 1) * TILE + dy });     // 작은 장식(지나갈 수 있음)

// 지금은 도로만: 건물·나무·구조물은 하나씩 정해서 다시 올릴 예정 (그림은 아래 ARTS에 남아 있어 place(...) 한 줄로 바로 놓을 수 있음)
//   예) place('shop', 0, 3, 2, 2, 3)  → 약국을 3칸·2줄부터 가로 2칸 × 세로 3줄로
// 차도 위 바닥 무늬: 맨홀 · 배수구
decal('manhole', 3, 8); decal('manhole', 11, 2); decal('manhole', 13, 9);
decal('drain', 5, 7, 0); decal('drain', 1, 10, 1); decal('drain', 14, 10, 1); decal('drain', 10, 14, 2);

const blockedTile = (tx, ty) => !inMap(tx, ty) || SOLID.has(tx + ',' + ty);   // 맵 밖·물건 자리는 못 지나감
const thingsAround = () => THINGS;

// ----- 그림 -----
const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const INK = '#2f2b38';   // 물건 테두리 색 (캐릭터 테두리처럼 아주 검지 않게)
const hash = (x, y, s = 0) => { let h = Math.imul(x + 1013, 374761393) ^ Math.imul(y + 7, 668265263) ^ Math.imul(s + 3, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// 차도 칸 무늬: 위치로 정함 (차선 점선·중앙선·정지선)
function roadMarks(x, y) {
  const m = [];
  const onMain = y >= MAIN[0] && y <= MAIN[1], onSide = x >= SIDE[0] && x <= SIDE[1];
  if (onMain && !onSide) {   // 가로 대로: 7|8 흰 점선, 8|9 노란 중앙선, 9|10 흰 점선
    if (y === 7 || y === 9) m.push('dashB');
    if (y === 8) m.push('yelB');
    if (y === 9) m.push('yelT');
    if (x === 7 && y >= 9) m.push('stopR');    // 동쪽으로 가는 차(아래 두 차선) 정지선
    if (x === 14 && y <= 8) m.push('stopL');   // 서쪽으로 가는 차(위 두 차선) 정지선
  } else if (onSide && !onMain) {               // 세로 골목: 10|11 노란 중앙선
    m.push(x === 10 ? 'yelR' : 'yelL');
    if (x === 10 && y === 4) m.push('stopB');  // 남쪽으로 가는 차 정지선
    if (x === 11 && y === 13) m.push('stopT'); // 북쪽으로 가는 차 정지선
  }
  return m;
}

// 바닥 한 칸 그림: 칸 종류·무늬·이웃 차도·변화(금·얼룩 등)마다 한 번만 그려 저장
const tileCache = new Map();
function tileImage(tx, ty) {
  const k = tileAt(tx, ty);
  if (k === null) return null;
  const v = Math.floor(hash(tx, ty) * 6);   // 칸마다 조금씩 다른 모습 (0~5)
  const side = (dx, dy) => { const n = tileAt(tx + dx, ty + dy); return n === 'Z' ? 2 : n === 'R' ? 1 : 0; };   // 0 없음, 1 차도(연석), 2 횡단보도(경사로)
  const curb = isRoad(k) ? '' : [side(0, -1), side(0, 1), side(-1, 0), side(1, 0)].join('');
  const marks = k === 'R' ? roadMarks(tx, ty) : [];
  const zdir = k === 'Z' ? (ty >= MAIN[0] && ty <= MAIN[1] ? 'h' : 'v') : '';
  const key = [k, v, curb, marks.join('+'), zdir].join('|');
  if (tileCache.has(key)) return tileCache.get(key);
  const c = makeCanvas(TILE, TILE), g = c.getContext('2d');
  const box = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  const WHITE = '#efeee8', YEL = '#f2c94c';
  if (isRoad(k)) {
    box(0, 0, TILE, TILE, '#4c4c55');                                       // 아스팔트
    for (const [px, py] of [[5, 7], [19, 3], [26, 21], [11, 25], [22, 13], [2, 18], [29, 9]]) box(px, py, 1, 1, '#5a5a64');
    for (const [px, py] of [[14, 5], [8, 15], [24, 27]]) box(px, py, 1, 1, '#43434b');
    if (v === 1) { box(6, 20, 6, 1, '#3f3f47'); box(12, 19, 5, 1, '#3f3f47'); box(17, 18, 3, 1, '#3f3f47'); }   // 금
    if (v === 2) { box(4, 6, 12, 9, '#44444d'); box(4, 6, 12, 1, '#55555e'); }                                   // 땜질 자국
    if (v === 3) { box(18, 16, 7, 4, '#3d3d45'); box(19, 15, 5, 6, '#3d3d45'); }                                 // 기름 얼룩
    const dash = y => { box(4, y, 12, 2, WHITE); box(20, y, 8, 2, WHITE); };
    for (const m of marks) {
      if (m === 'dashB') dash(TILE - 1);
      if (m === 'yelB') { box(0, TILE - 4, TILE, 2, YEL); }
      if (m === 'yelT') { box(0, 1, TILE, 2, YEL); }
      if (m === 'yelR') box(TILE - 3, 0, 2, TILE, YEL);
      if (m === 'yelL') box(1, 0, 2, TILE, YEL);
      if (m === 'stopR') box(TILE - 5, 0, 4, TILE, WHITE);
      if (m === 'stopL') box(1, 0, 4, TILE, WHITE);
      if (m === 'stopB') box(0, TILE - 5, TILE, 4, WHITE);
      if (m === 'stopT') box(0, 1, TILE, 4, WHITE);
    }
    if (zdir === 'h') for (let y = 2; y < TILE; y += 8) { box(1, y, TILE - 2, 5, WHITE); box(1, y + 4, TILE - 2, 1, '#cfcfc8'); }   // 가로 대로 건너는 횡단보도: 가로 막대
    if (zdir === 'v') for (let x = 2; x < TILE; x += 8) { box(x, 1, 5, TILE - 2, WHITE); box(x + 4, 1, 1, TILE - 2, '#cfcfc8'); }
  } else if (k === 'g') {   // 잔디: 짧은 풀결 + 가끔 풀 무더기·작은 꽃
    box(0, 0, TILE, TILE, '#78bb55');
    for (let i = 0; i < 9; i++) { const px = Math.floor(hash(tx, ty, i) * 30), py = Math.floor(hash(tx, ty, i + 20) * 30); box(px, py, 1, 2, '#62a444'); box(px + 1, py, 1, 1, '#8fcc6a'); }
    if (v === 4) { box(10, 12, 2, 2, '#ffffff'); box(20, 22, 2, 2, '#f5a3b5'); box(24, 8, 2, 2, '#f2c94c'); }
    if (v === 5) { box(12, 16, 6, 3, '#5e9e41'); box(13, 15, 4, 1, '#5e9e41'); }
  } else if (k === 'p') {   // 주차장: 아스팔트 + 주차 칸 흰 선 + 바퀴 멈춤턱
    box(0, 0, TILE, TILE, '#55555e');
    for (const [px, py] of [[7, 9], [21, 18], [12, 26]]) box(px, py, 1, 1, '#61616a');
    box(0, 0, 2, TILE, WHITE); if (tx === COLS - 1) box(TILE - 2, 0, 2, TILE, WHITE);
    if (ty === 13) box(0, 0, TILE, 2, WHITE);
    if (ty === 15) { box(8, 24, 16, 4, '#9a9aa3'); box(8, 24, 16, 1, '#c4c4cc'); }
  } else if (k === 'q') {   // 광장 돌바닥: 큰 회색 돌을 엇갈려 깜
    box(0, 0, TILE, TILE, '#b9b2a4');
    for (const [x, y, w] of [[0, 0, 20], [21, 0, 11], [0, 11, 9], [10, 11, 22], [0, 22, 15], [16, 22, 16]]) { box(x, y, w - 1, 10, '#d8d1c3'); box(x, y, w - 1, 1, '#e8e2d5'); }
  } else if (k === 'k') {   // 점자블록: 노란 판에 볼록한 점
    box(0, 0, TILE, TILE, '#c9a62c');
    box(1, 1, 14, 14, '#ecc63a'); box(17, 1, 14, 14, '#ecc63a'); box(1, 17, 14, 14, '#ecc63a'); box(17, 17, 14, 14, '#ecc63a');
    for (let y = 3; y < TILE; y += 4) for (let x = 3; x < TILE; x += 4) if ((x % 16) && (y % 16)) { box(x, y, 2, 2, '#f8dc6a'); box(x + 1, y + 1, 1, 1, '#b8941f'); }
  } else {                  // 보도: 베이지 판석 2×2장 (밝은 위·왼쪽, 어두운 줄눈). 가끔 금 간 판석·색 다른 판석
    box(0, 0, TILE, TILE, '#cdb88f');
    const tones = ['#ead8b4', '#e6d3ae', '#e2cfa9', '#ecdab7'];
    [[0, 0], [16, 0], [0, 16], [16, 16]].forEach(([x, y], i) => {
      const t = v === 2 && i === 1 ? '#dcc8a2' : tones[(i + v) % 4];
      box(x, y, 15, 15, t); box(x, y, 15, 1, '#f5e8cc'); box(x, y, 1, 15, '#f5e8cc'); box(x + 14, y + 1, 1, 14, '#d8c39c');
    });
    if (v === 3) { box(20, 4, 1, 3, '#bfa97f'); box(21, 7, 1, 3, '#bfa97f'); box(22, 10, 3, 1, '#bfa97f'); }   // 금
    if (v === 5) box(5, 22, 2, 2, '#d4c099');                                                                 // 작은 얼룩
  }
  if (curb) {   // 연석: 차도와 닿는 쪽에 밝은 돌 + 그림자, 횡단보도 쪽은 낮춘 경사로(그림자 없음)
    const [up, down, left, right] = [...curb].map(Number);
    if (up === 1) { box(0, 0, TILE, 4, '#cfc6b4'); box(0, 0, TILE, 1, '#f0e8d8'); box(0, 4, TILE, 1, '#9b927f'); }
    if (up === 2) { box(0, 0, TILE, 3, '#ddd5c3'); }
    if (down === 1) { box(0, TILE - 5, TILE, 1, '#f2e6cc'); box(0, TILE - 4, TILE, 4, '#cfc6b4'); box(0, TILE - 1, TILE, 1, '#8f8673'); }
    if (down === 2) { box(0, TILE - 3, TILE, 3, '#ddd5c3'); }
    if (left === 1) { box(0, 0, 4, TILE, '#cfc6b4'); box(0, 0, 1, TILE, '#f0e8d8'); box(4, 0, 1, TILE, '#9b927f'); }
    if (left === 2) { box(0, 0, 3, TILE, '#ddd5c3'); }
    if (right === 1) { box(TILE - 5, 0, 1, TILE, '#f2e6cc'); box(TILE - 4, 0, 4, TILE, '#cfc6b4'); box(TILE - 1, 0, 1, TILE, '#8f8673'); }
    if (right === 2) { box(TILE - 3, 0, 3, TILE, '#ddd5c3'); }
  }
  tileCache.set(key, c);
  return c;
}

// ----- 그림자: 바닥을 다 그린 뒤, 물건보다 먼저 그림 (빛은 왼쪽 위) -----
const SHADE = 'rgba(32, 26, 52, 0.22)';
const BIG = new Set(['cafe', 'shop', 'villa']);
function drawShadows(ctx, S, cam) {
  ctx.fillStyle = SHADE;
  for (const t of THINGS) {
    if (t.ground) continue;
    const x = t.x * S - cam.x, y = t.y * S - cam.y, half = t.w * TILE / 2 * S;
    if (BIG.has(t.type)) {           // 건물: 오른쪽 벽 옆으로 비스듬한 그림자 + 앞쪽 얇은 그림자
      const h = t.d * TILE * S, sw = 12 * S;
      ctx.beginPath(); ctx.moveTo(x + half, y - h); ctx.lineTo(x + half + sw, y - h + sw); ctx.lineTo(x + half + sw, y + 3 * S); ctx.lineTo(x + half, y); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - half + 4 * S, y, half * 2, 3 * S);
    } else if (t.type !== 'bollard' && t.type !== 'aboard' && t.type !== 'pots') {   // 나머지: 발밑 오른쪽으로 둥근 그림자
      const rx = Math.max(8, t.w * TILE * 0.42) * S, ry = (t.type === 'car' ? 16 : t.type === 'fountain' ? 10 : 5) * S;
      ctx.beginPath(); ctx.ellipse(x + 5 * S, y - (t.type === 'car' ? 15 : t.type === 'fountain' ? 9 : 3) * S, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ----- 물건 그림 (그림 1칸 = 바닥 2픽셀). 종류·색 번호·너비마다 한 번만 그려 저장 -----
// 간판 글씨는 픽셀 폰트(갈무리11). 글꼴이 늦게 오면 받은 뒤 다시 그림
const artCache = new Map();
document.fonts?.load('11px Galmuri11').then(() => artCache.clear()).catch(() => {});
function thingArt(t) {
  const key = t.type + t.v + '/' + t.w;
  if (!artCache.has(key)) artCache.set(key, ARTS[t.type](t.v, t.w));
  return artCache.get(key);
}
const shadeHex = (hex, k = 0.8) => '#' + [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');
function painter(w, h) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const box = (x, y, bw, bh, color) => { g.fillStyle = color; g.fillRect(x, y, bw, bh); };
  // 간판 글씨: 따로 그린 뒤 반쯤 걸친 픽셀은 켜거나 끄기만 해서(흐린 테두리 없이) 픽셀 그림처럼 또렷하게
  const center = (s, cx, y, color) => {
    const t = makeCanvas(w, h), tg = t.getContext('2d');
    tg.font = '11px Galmuri11, monospace'; tg.textBaseline = 'top'; tg.fillStyle = color;
    tg.fillText(s, Math.round(cx - tg.measureText(s).width / 2), y);
    const img = tg.getImageData(0, 0, w, h), d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
    tg.putImageData(img, 0, 0);
    g.drawImage(t, 0, 0);
  };
  // 창문: 창틀 + 유리(위는 밝게) + 가운데 창살 (+ 창가 화분)
  const win = (x, y, w, h, flowers, glass = '#8fc3e6') => {
    box(x - 1, y - 1, w + 2, h + 2, INK); box(x, y, w, h, glass); box(x, y, w, 2, '#d4ecfa'); box(x, y + h - 2, w, 2, shadeHex(glass, 0.85));
    box(x + Math.floor(w / 2), y, 1, h, '#f4f1ea'); box(x, y + Math.floor(h / 2), w, 1, '#f4f1ea');
    box(x - 2, y + h + 1, w + 4, 1, '#f4f1ea');   // 창턱
    if (flowers) { box(x - 1, y + h + 2, w + 2, 3, '#8a5a3b'); box(x - 1, y + h + 2, w + 2, 1, '#a8774f'); [['#e8454b', 0], ['#f2c94c', 3], ['#f5a3b5', 6]].forEach(([col, dx]) => { if (dx < w) box(x + dx, y + h, 2, 2, col); }); box(x + 1, y + h + 1, w - 1, 1, '#5dbb4a'); }
  };
  const door = (x, y, h, color = '#9a6b45', glass = false) => {
    box(x - 1, y - 1, 12, h + 1, INK); box(x, y, 10, h, color); box(x, y, 10, 1, shadeHex(color, 1.2));
    if (glass) { box(x + 2, y + 2, 6, h - 6, '#cfe9f8'); box(x + 2, y + 2, 2, h - 6, '#eef8fd'); }
    box(x + 8, y + Math.floor(h / 2), 1, 2, '#f2c94c');
  };
  const ac = (x, y) => { box(x, y, 10, 7, INK); box(x + 1, y + 1, 8, 5, '#e6e6ea'); for (let i = 0; i < 3; i++) box(x + 2, y + 2 + i * 1, 4, 1, '#a9a9b2'); box(x + 6, y + 2, 2, 3, '#8a8a94'); };
  return { c, g, box, center, win, door, ac };
}
const SIGNS = [['약국', '#2f9e5a'], ['치킨', '#e8454b'], ['분식', '#f2a03d'], ['빵집', '#b5653f'], ['꽃집', '#d4537e'], ['PC방', '#3d7fd6'], ['안경', '#4bb3a0'], ['떡집', '#7b5bd6']];
const WALLS = ['#f1e6d0', '#e9c46a', '#cfe0d6', '#f0d0c0', '#dcd3ef', '#d8e4f0', '#f3dfb4', '#e8d0d8'];
const ARTS = {
  // 작은 가게(2칸, 키 4칸): 옥상 난간 / 2층(창문·화분·실외기) / 간판(테두리·조명) / 줄무늬 차양 / 1층(진열창·유리문·계단)
  shop(v, w) {
    const W = w * 16, H = 64, { c, box, center, win, door, ac } = painter(W, H), [name, col] = SIGNS[v % 8], wall = WALLS[v % 8];
    box(0, 0, W, H, INK);
    box(1, 1, W - 2, 4, '#9a96a2'); box(1, 1, W - 2, 1, '#c4c0cc'); box(1, 5, W - 2, 1, INK);                  // 옥상 난간
    box(1, 6, W - 2, 23, wall); box(W - 4, 6, 3, 23, shadeHex(wall, 0.9)); box(1, 6, 1, 23, shadeHex(wall, 1.08)); // 2층 벽 (오른쪽 그늘)
    win(5, 11, 10, 10, true); win(W - 15, 11, 10, 10, v % 2 === 0);
    if (v % 2) ac(W - 15, 22);
    box(1, 29, W - 2, 2, shadeHex(wall, 0.75));                                                                   // 층 사이 띠
    box(2, 31, W - 4, 13, INK); box(3, 32, W - 6, 11, col); box(3, 32, W - 6, 1, shadeHex(col, 1.3));            // 간판 (글씨 높이 11에 맞춤)
    center(name, W / 2, 32, '#ffffff');
    for (const x of [6, W - 8]) box(x, 29, 2, 2, '#fff1b8');                                                      // 간판 조명
    for (let x = 1; x < W - 1; x += 4) { box(x, 44, 2, 5, col); box(x + 2, 44, 2, 5, '#f7f3e8'); box(x, 49, 2, 1, col); }   // 차양 + 물결 끝
    box(1, 44, W - 2, 1, shadeHex(col, 0.7));
    box(1, 50, W - 2, H - 51, shadeHex(wall, 0.95));                                                              // 1층 벽
    box(3, 52, W - 18, 9, INK); box(4, 53, W - 20, 7, '#d8eef9');                                                  // 진열창
    for (let i = 0; i < (W - 20) / 4 - 1; i++) box(5 + i * 4, 57, 3, 3, ['#e8454b', '#f2c94c', '#5dbb4a', '#3d7fd6'][(i + v) % 4]);   // 진열품
    box(4, 53, W - 20, 1, '#ffffff');
    door(W - 13, 51, 12, '#7a5236', true);
    box(1, H - 2, W - 2, 1, '#b8b0a2');                                                                            // 계단
    return c;
  },
  // 카페(3칸, 키 4칸): 벽돌 / 2층 아치창 / 매달린 간판 / 초록 차양 / 따뜻한 큰 창(전구 줄) / 나무 유리문
  cafe(v) {
    const W = 48, H = 64, { c, box, center, win, door } = painter(W, H);
    box(0, 0, W, H, INK); box(1, 1, W - 2, 4, '#7a4f33'); box(1, 1, W - 2, 1, '#9a6b45'); box(1, 5, W - 2, 1, INK);
    box(1, 6, W - 2, H - 7, '#b5653f');
    for (let y = 8; y < H - 1; y += 4) { box(1, y, W - 2, 1, '#9e5535'); for (let x = (y / 4) % 2 ? 4 : 8; x < W - 1; x += 8) box(x, y - 3, 1, 3, '#9e5535'); }   // 벽돌 줄눈
    box(W - 4, 6, 3, H - 7, '#a35a36');
    for (const x of [6, 20, 34]) { box(x, 10, 8, 2, INK); win(x, 12, 8, 10, false, '#f6e3b4'); }               // 2층 창 (불 켜짐)
    box(1, 27, W - 2, 2, '#7a4f33');
    box(12, 28, 24, 13, INK); box(13, 29, 22, 11, '#3a2a22'); box(13, 29, 22, 1, '#5a4232'); center('카페', 24, 29, '#f6e3b4');   // 간판
    for (let x = 1; x < W - 1; x += 6) { box(x, 41, 3, 5, '#4f8f4f'); box(x + 3, 41, 3, 5, '#f7f3e8'); box(x, 46, 3, 1, '#4f8f4f'); }
    box(4, 49, 24, 12, INK); box(5, 50, 22, 10, '#f6d9a0'); box(5, 50, 22, 2, '#fbecc9');                      // 큰 창 (안쪽 불빛)
    for (let x = 6; x < 27; x += 3) box(x, 51, 1, 1, x % 2 ? '#fff1b8' : '#f2a03d');                             // 전구 줄
    box(8, 55, 3, 5, '#5a9a5a'); box(18, 56, 4, 3, '#ffffff'); box(19, 55, 2, 1, '#7a4f33');                      // 화분 · 커피잔
    door(33, 49, 13, '#7a4f33', true);
    return c;
  },
  // 빌라(3칸, 키 4.75칸): 옥상 물탱크·안테나 / 3층 벽돌 + 베란다 난간 / 실외기 · 가스관 / 유리 현관 + 차양 + 번지판
  villa(v, w) {
    const W = w * 16, H = 76, { c, box, win, door, ac } = painter(W, H), brick = ['#c98a5e', '#b5653f', '#d9b48a', '#a86a50'][v % 4];
    box(W - 16, 0, 12, 7, INK); box(W - 15, 1, 10, 5, '#6fa8dc'); box(W - 15, 1, 10, 1, '#a8d0f0');            // 물탱크
    box(6, 0, 1, 6, INK); box(4, 1, 5, 1, INK);                                                                   // 안테나
    box(0, 6, W, H - 6, INK); box(1, 7, W - 2, 3, '#8d8a94'); box(1, 10, W - 2, 1, INK);                           // 옥상 난간
    box(1, 11, W - 2, H - 12, brick);
    for (let y = 13; y < H - 1; y += 3) box(1, y, W - 2, 1, shadeHex(brick, 0.88));                               // 벽돌 줄
    box(W - 4, 11, 3, H - 12, shadeHex(brick, 0.85));
    for (const fy of [14, 34]) {
      win(5, fy, 11, 10, false); win(W - 16, fy, 11, 10, fy === 14);
      box(3, fy + 12, W - 6, 1, INK); for (let x = 4; x < W - 4; x += 3) box(x, fy + 12, 1, 4, INK); box(3, fy + 15, W - 6, 1, INK);   // 베란다 난간
    }
    ac(4, 56); box(W - 6, 12, 2, H - 14, '#e2b93b'); box(W - 6, 12, 2, 1, '#f2d36b');                            // 실외기 · 가스관
    box(Math.floor(W / 2) - 9, 52, 18, 3, '#6b7080'); box(Math.floor(W / 2) - 9, 52, 18, 1, '#8b90a0');            // 현관 차양
    door(Math.floor(W / 2) - 5, 56, 19, '#cfe9f8', true);
    box(Math.floor(W / 2) + 7, 58, 6, 4, '#3d7fd6'); box(Math.floor(W / 2) + 8, 59, 4, 1, '#ffffff');              // 번지판
    return c;
  },
  // 가로수(화분): 둥근 잎 덩어리 + 밝은 잎 + 줄기 + 네모 돌 화분. v=0 초록, v=1 노란 은행잎
  tree(v) { return treeArt(v, true); },
  // 공원 나무(화분 없음, 더 큼)
  ptree(v) { return treeArt(v, false); },
  // 가로등: 둥근 갓 + 노란 불빛 + 기둥 + 받침
  lamp() {
    const { c, box } = painter(16, 46);
    box(4, 0, 9, 3, INK); box(3, 3, 11, 3, INK); box(5, 3, 7, 4, '#fff6cf'); box(6, 4, 5, 2, '#ffffff');
    box(6, 7, 5, 2, INK); box(7, 9, 3, 33, INK); box(8, 9, 1, 33, '#7d8292');
    box(7, 24, 3, 6, INK); box(8, 25, 1, 4, '#3d7fd6');                                                             // 기둥 배너
    box(5, 41, 7, 5, INK); box(6, 42, 5, 2, '#5b6070');
    return c;
  },
  // 신호등 + 보행자 신호 + 파란 횡단보도 표지판
  signal() {
    const { c, box } = painter(16, 50);
    box(4, 0, 9, 19, INK); box(5, 1, 7, 17, '#2f2f38');
    for (const [y, col] of [[2, '#e8454b'], [7, '#4a3a20'], [12, '#2a4a2a']]) { box(6, y, 5, 4, col); }
    box(7, 3, 2, 1, '#ff9a9a');
    box(7, 19, 3, 27, INK); box(8, 19, 1, 27, '#7d8292');
    box(2, 24, 13, 11, INK); box(3, 25, 11, 9, '#2f6fc6'); box(6, 26, 4, 2, '#ffffff'); box(5, 28, 6, 1, '#ffffff'); box(6, 29, 2, 3, '#ffffff'); box(9, 30, 2, 2, '#ffffff');   // 보행자 표지
    box(5, 45, 7, 5, INK); box(6, 46, 5, 2, '#5b6070');
    return c;
  },
  bollard() {
    const { c, box } = painter(16, 14);
    box(5, 2, 6, 12, INK); box(6, 3, 4, 10, '#c4c4cc'); box(6, 3, 1, 10, '#e2e2e8'); box(6, 5, 4, 2, '#f2c94c');
    return c;
  },
  bench() {
    const { c, box } = painter(32, 20);
    box(1, 2, 30, 7, INK); for (let y = 3; y < 8; y += 2) box(2, y, 28, 1, '#c9944f'); box(2, 4, 28, 1, '#a8773a');
    box(1, 10, 30, 5, INK); box(2, 11, 28, 3, '#d9a45c'); box(2, 13, 28, 1, '#a8773a');
    for (const x of [3, 26]) { box(x, 15, 3, 5, INK); box(x + 1, 15, 1, 4, '#5b6070'); }
    return c;
  },
  bin() {
    const { c, box } = painter(16, 22);
    box(2, 2, 12, 5, INK); box(3, 3, 10, 3, '#4f9a3c'); box(3, 3, 10, 1, '#7cc05f');
    box(3, 7, 10, 14, INK); box(4, 8, 8, 12, '#5fae4a'); box(4, 8, 2, 12, '#7cc05f'); box(5, 11, 6, 1, '#3f8a37'); box(6, 13, 4, 3, '#ffffff'); box(7, 14, 2, 1, '#5fae4a');
    return c;
  },
  // 자판기: 빨간 몸통 + 음료 진열창 + 동전 넣는 곳 + 꺼내는 칸
  vending() {
    const { c, box } = painter(16, 32);
    box(1, 0, 14, 32, INK); box(2, 1, 12, 30, '#d8443f'); box(2, 1, 2, 30, '#ec6a5f');
    box(3, 3, 10, 13, INK); box(4, 4, 8, 11, '#e9f4fb');
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) box(4 + i * 2, 5 + r * 4, 1, 3, ['#3d7fd6', '#f2c94c', '#5dbb4a', '#e8454b'][(i + r) % 4]);
    box(10, 18, 3, 4, '#2f2b38'); box(11, 19, 1, 2, '#f2c94c');
    box(4, 25, 8, 4, INK); box(5, 26, 6, 2, '#3a3a44');
    return c;
  },
  // 입간판(작은 칠판): 지나갈 수 있음
  aboard() {
    const { c, box } = painter(16, 16);
    box(3, 1, 10, 13, INK); box(4, 2, 8, 9, '#3a4a3a'); box(5, 4, 5, 1, '#ffffff'); box(5, 6, 4, 1, '#f2c94c'); box(5, 8, 5, 1, '#ffffff');
    box(4, 12, 1, 4, INK); box(11, 12, 1, 4, INK);
    return c;
  },
  // 꽃집 앞 화분: 지나갈 수 있음
  pots(v) {
    const { c, box } = painter(16, 16);
    for (const [x, col] of [[2, v ? '#f2c94c' : '#e8454b'], [9, v ? '#f5a3b5' : '#ffffff']]) {
      box(x, 9, 6, 6, INK); box(x + 1, 10, 4, 4, '#b5653f'); box(x + 1, 10, 4, 1, '#d08a5f');
      box(x, 3, 6, 6, '#3f8a37'); box(x + 1, 2, 4, 2, col); box(x + 2, 4, 2, 2, col); box(x + 1, 5, 1, 1, '#5dbb4a');
    }
    return c;
  },
  // 버스 정류장(2칸): 파란 지붕 + 유리 칸막이 + 의자 + 노선 표지
  busstop() {
    const { c, box, center } = painter(32, 42);
    box(0, 6, 32, 6, INK); box(1, 7, 30, 4, '#2f6fc6'); box(1, 7, 30, 1, '#6fa8ec');
    box(2, 12, 2, 28, INK); box(28, 12, 2, 28, INK);
    box(4, 14, 24, 18, '#bfe2f4'); box(4, 14, 24, 2, '#e8f6fd'); box(4, 14, 1, 18, '#e8f6fd');
    box(6, 31, 20, 4, INK); box(7, 32, 18, 2, '#c9944f');
    box(9, 0, 23, 13, INK); box(10, 1, 21, 11, '#ffffff'); center('버스', 20.5, 1, '#2f6fc6');
    return c;
  },
  // 분수(3칸 × 2줄): 둥근 돌 테두리 + 물 + 가운데 물줄기
  fountain() {
    const { c, box } = painter(48, 40);
    const ring = [[10, 28], [6, 36], [4, 40], [2, 44], [2, 44], [2, 44], [4, 40], [6, 36], [10, 28]];
    ring.forEach(([x, w], i) => { box(x, 16 + i * 2.6 | 0, w, 4, INK); });
    ring.forEach(([x, w], i) => { box(x + 1, 17 + i * 2.6 | 0, w - 2, 3, '#c9c2b4'); });
    const water = [[12, 24], [8, 32], [6, 36], [6, 36], [8, 32], [12, 24]];
    water.forEach(([x, w], i) => { box(x, 20 + i * 2.8 | 0, w, 3, '#5fb4e0'); });
    box(14, 24, 6, 1, '#bfe6f8'); box(28, 29, 5, 1, '#bfe6f8'); box(18, 32, 4, 1, '#bfe6f8');
    box(21, 14, 6, 14, INK); box(22, 15, 4, 12, '#d9d2c4');                                                         // 가운데 기둥
    box(20, 4, 8, 10, '#8fd0f0'); box(22, 1, 4, 4, '#bfe6f8'); box(23, 0, 2, 2, '#ffffff'); box(18, 8, 2, 6, '#8fd0f0'); box(28, 8, 2, 6, '#8fd0f0');   // 물줄기
    return c;
  },
  // 주차된 차(1칸 × 2줄, 위에서 본 모습): 차체 + 앞유리 + 지붕 + 뒷유리 + 바퀴 + 헤드라이트
  car(v) {
    const { c, box } = painter(16, 32), body = ['#e8454b', '#f4f4f0', '#3d7fd6', '#3a3a44'][v % 4], dk = shadeHex(body, 0.78), lt = shadeHex(body, 1.15);
    for (const [x, y] of [[1, 6], [13, 6], [1, 22], [13, 22]]) box(x, y, 2, 5, '#1f1f24');                       // 바퀴
    box(2, 2, 12, 29, INK); box(3, 3, 10, 27, body); box(3, 3, 2, 27, lt); box(11, 3, 2, 27, dk);
    box(4, 8, 8, 5, '#2f3b55'); box(5, 9, 3, 1, '#8fb3de');                                                         // 앞유리
    box(4, 13, 8, 8, lt); box(4, 21, 8, 4, '#2f3b55');                                                              // 지붕 · 뒷유리
    box(4, 3, 2, 2, '#fff6cf'); box(10, 3, 2, 2, '#fff6cf'); box(4, 28, 2, 1, '#e8454b'); box(10, 28, 2, 1, '#e8454b');
    return c;
  },
  // 주차 표지판(P)
  psign() {
    const { c, box, center } = painter(16, 40);
    box(2, 0, 13, 13, INK); box(3, 1, 11, 11, '#2f6fc6'); center('P', 8.5, 0, '#ffffff');
    box(7, 13, 3, 23, INK); box(8, 13, 1, 23, '#9a9aa6');
    box(5, 35, 7, 5, INK);
    return c;
  },
  // 바닥 무늬
  manhole() {
    const { c, box } = painter(16, 16);
    box(4, 2, 8, 12, '#34343c'); box(2, 4, 12, 8, '#34343c'); box(3, 3, 10, 10, '#34343c');
    for (let y = 5; y < 12; y += 2) box(4, y, 8, 1, '#5a5a64');
    box(5, 3, 6, 1, '#5a5a64');
    return c;
  },
  drain(v) {   // 배수구: 연석 옆 차도 쇠창살 (v: 0 위쪽 연석, 1 아래쪽 연석, 2 왼쪽 연석)
    const { c, box } = painter(16, 16);
    const [x, y, w, h] = v === 0 ? [3, 1, 10, 5] : v === 1 ? [3, 10, 10, 5] : [1, 3, 5, 10];
    box(x, y, w, h, '#2a2a30');
    if (w > h) for (let i = x + 1; i < x + w; i += 2) box(i, y + 1, 1, h - 2, '#6a6a74');
    else for (let i = y + 1; i < y + h; i += 2) box(x + 1, i, w - 2, 1, '#6a6a74');
    return c;
  },
  flowers(v) {   // 꽃밭
    const { c, box } = painter(16, 16), cols = v ? ['#f5a3b5', '#ffffff', '#f2c94c'] : ['#e8454b', '#f2c94c', '#ffffff'];
    box(1, 3, 14, 11, '#5e9e41');
    [[3, 4], [8, 5], [12, 4], [5, 8], [10, 9], [3, 11], [12, 11], [7, 12]].forEach(([x, y], i) => { box(x, y, 2, 2, cols[i % 3]); box(x, y + 2, 1, 1, '#3f8a37'); });
    return c;
  },
};
function treeArt(v, planter) {
  const H = planter ? 34 : 38, { c, box } = painter(16, H), [leaf, dark, light, top] = v ? ['#f2c94c', '#d9a42c', '#f8e08a', '#fdf0b8'] : ['#5fae4a', '#3f8a37', '#86cc62', '#b4e494'];
  const crown = [[5, 6], [3, 10], [2, 12], [1, 14], [1, 14], [1, 14], [1, 14], [1, 14], [2, 12], [3, 10], [5, 6]];
  crown.forEach(([x, w], i) => box(x - 1, i * 2, w + 2, 2, INK));
  crown.forEach(([x, w], i) => { if (i) { box(x, i * 2, w, 2, leaf); box(x + Math.ceil(w * 0.55), i * 2, Math.floor(w * 0.45), 2, dark); } });
  box(4, 3, 4, 3, light); box(3, 6, 2, 2, light); box(9, 2, 3, 2, light); box(5, 3, 2, 1, top);                   // 밝은 잎
  box(6, 10, 2, 2, dark); box(10, 12, 2, 2, shadeHex(dark, 0.85)); box(4, 14, 3, 2, dark);                       // 잎 덩어리 그늘
  const tY = 22;
  box(6, tY, 4, H - tY - (planter ? 7 : 1), INK); box(7, tY, 2, H - tY - (planter ? 7 : 1), '#7a5236'); box(7, tY, 1, H - tY - (planter ? 7 : 1), '#9a6b45');
  if (planter) { box(1, H - 8, 14, 8, INK); box(2, H - 7, 12, 6, '#bdb5a6'); box(2, H - 7, 12, 1, '#dcd5c8'); box(3, H - 6, 10, 2, '#6b5a43'); box(12, H - 7, 2, 6, '#a79f90'); }
  else { box(4, H - 2, 8, 2, '#5e9e41'); }
  return c;
}
