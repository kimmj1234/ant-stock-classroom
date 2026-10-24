'use strict';
// ===== 도시 모습 (서울 느낌): 끝없이 이어지는 도시 =====
// 땅은 "큰 블록"(가로 34칸 × 세로 26칸)이 끝없이 반복됨. 칸 = 바닥 사각형 한 칸(32×32픽셀), 칸 번호는 마이너스도 됨.
//   큰 블록 위·왼쪽 4줄 = 4차선 대로(가운데 노란 중앙선, 차선 사이 흰 점선, 차선 1개 = 1칸 → 나중에 차가 다닐 자리).
//   대로 옆 보도 2줄(가로수·가로등·신호등·벤치·쓰레기통·버스 정류장).
//   큰 블록 안은 블록마다 다르게: 2차선 골목길이 세로·가로로 있을 수도 없을 수도(위치도 제각각) → T자 길·네거리.
//   골목으로 나뉜 땅마다 건물 앞면이 길을 보도록 줄지어 서고(너비 2~5칸, 사이사이 틈), 뒤쪽 빈 땅은 주차장·잔디·광장.
//   앞 건물이 뒤 건물을 가리지 않게, 뒷줄은 앞 건물 키만큼 띄워서 세움.
// 모든 배치는 큰 블록 번호로 정해지는 "고정된 무작위"(같은 자리 = 늘 같은 모습, 새로고침해도 같음).
// SPECIAL은 직접 정한 블록(남산타워 공원). 처음 서는 곳은 START.
// 물건(건물·나무 등)은 캐릭터와 같은 굵기의 픽셀(그림 1칸 = 바닥 2픽셀)로 그림.
const TILE = 32;                        // 바닥 한 칸(사각형)의 픽셀 크기
const ART = 2;                          // 물건 그림 1칸 = 바닥 2픽셀 → 바닥 한 칸 = 그림 16칸
const SX = 34, SY = 26;                 // 큰 블록 크기(칸)
const MAIN = 4;                         // 대로 폭(칸) = 4차선
const START = { x: 16 * TILE + 16, y: 24 * TILE + 16 };   // 처음 서는 자리(픽셀): 남산타워 공원 아래 보도
const SPECIAL = { '0,0': 'namsan' };    // 직접 정한 큰 블록: "x,y" → 종류

const mod = (a, n) => ((a % n) + n) % n;
// 큰 블록 번호 + 번호로 늘 같은 값이 나오는 0~1 사이 수
function rand(a, b, c) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ----- 건물 종류: 너비(칸) 범위, 키(칸, 바닥 2줄 포함) -----
const KINDS = {
  shop: { w: [2, 3] }, villa: { w: [3, 4] }, office: { w: [3, 4] }, apt: { w: [4, 5] },
  market: { w: [4, 5] }, hanok: { w: [4, 4] }, cafe: { w: [3, 3] }, store: { w: [3, 3] },
};
const PICK = ['shop', 'shop', 'shop', 'villa', 'villa', 'villa', 'office', 'apt', 'market', 'hanok', 'cafe', 'store'];
const SIGNS = [['약국', '#2f9e5a'], ['치킨', '#e8454b'], ['분식', '#f2a03d'], ['빵집', '#b5653f'], ['꽃집', '#d4537e'], ['PC방', '#3d7fd6'], ['안경', '#4bb3a0'], ['떡집', '#7b5bd6']];

// ----- 칸 종류 -----
//   대로: 'X' 교차로, 'H0'~'H3' 가로 대로 차선(위→아래), 'V0'~'V3' 세로 대로 차선(왼→오), 'ZH'/'ZV' 대로 횡단보도
//   골목: 'x' 골목 교차로, 'h0'/'h1', 'v0'/'v1' 차선, 'zh'/'zv' 골목 입구 횡단보도
//   그 밖: '.' 보도, 'g' 잔디, 'p' 주차장
const ROAD = new Set(['X', 'x', 'H0', 'H1', 'H2', 'H3', 'V0', 'V1', 'V2', 'V3', 'ZH', 'ZV', 'h0', 'h1', 'v0', 'v1', 'zh', 'zv']);
const isRoad = k => ROAD.has(k);

// ----- 큰 블록 하나 만들기: 칸 종류(ground), 못 지나가는 칸(solid), 서 있는 물건(things), 바닥 무늬(decals) -----
const sbCache = new Map();
function superblock(sx, sy) {
  const key = sx + ',' + sy;
  if (sbCache.has(key)) return sbCache.get(key);
  const R = i => rand(sx, sy, i);
  const ground = new Map(), solid = new Set(), things = [];
  const set = (x, y, k) => ground.set(x + ',' + y, k);
  const get = (x, y) => ground.get(x + ',' + y) || '.';
  const wx = x => (sx * SX + x) * TILE, wy = y => (sy * SY + y) * TILE;   // 블록 안 칸 → 마을 픽셀
  // 물건 놓기: (x, y) = 왼쪽 위 칸, w×d칸 차지(block이면 못 지나감). 그림은 차지한 칸의 아래 가운데에 세움
  const place = (type, v, x, y, w, d, block = true) => {
    for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) if (block) solid.add(xx + ',' + yy);
    things.push({ type, v, w, x: wx(x) + w * TILE / 2, y: wy(y + d) });
  };
  const decal = (type, x, y) => things.push({ type, v: 0, w: 1, x: wx(x) + TILE / 2, y: wy(y + 1), ground: true });
  const free = (x, y) => !solid.has(x + ',' + y) && !isRoad(get(x, y));

  // 대로 + 대로 횡단보도(보도 2줄과 이어지게 2칸 폭)
  for (let y = 0; y < SY; y++) for (let x = 0; x < SX; x++) {
    if (y < MAIN && x < MAIN) set(x, y, 'X');
    else if (y < MAIN) set(x, y, x < MAIN + 2 || x >= SX - 2 ? 'ZH' : 'H' + y);
    else if (x < MAIN) set(x, y, y < MAIN + 2 || y >= SY - 2 ? 'ZV' : 'V' + x);
  }
  const special = SPECIAL[key];
  // 골목길: 세로 하나·가로 하나가 있을 수도 없을 수도, 위치도 블록마다 다름 (남산 공원 블록은 없음)
  const mv = !special && R(1) < 0.65 ? 13 + Math.floor(R(2) * 10) : null;   // 세로 골목 왼쪽 칸
  const mh = !special && R(3) < 0.55 ? 12 + Math.floor(R(4) * 5) : null;    // 가로 골목 위쪽 칸
  if (mv !== null) for (let y = MAIN; y < SY; y++) for (const i of [0, 1]) set(mv + i, y, y < MAIN + 2 || y >= SY - 2 ? 'zv' : 'v' + i);
  if (mh !== null) for (let x = MAIN; x < SX; x++) for (const i of [0, 1]) {
    if (mv !== null && (x === mv || x === mv + 1)) set(x, mh + i, 'x');
    else set(x, mh + i, x < MAIN + 2 || x >= SX - 2 ? 'zh' : 'h' + i);
  }

  // 대로 보도 시설: 차도 쪽 줄(위·아래 줄, 왼·오른 줄)에 가로수·가로등을 불규칙한 간격으로
  const curbRows = [[MAIN, 'row'], [SY - 1, 'row'], [MAIN, 'col'], [SX - 1, 'col']];
  curbRows.forEach(([line, dir], li) => {
    let n = 0;
    for (let i = MAIN + 4; i < (dir === 'row' ? SX : SY) - 4; i++) {
      const [x, y] = dir === 'row' ? [i, line] : [line, i];
      if (!free(x, y) || isRoad(get(x, y))) continue;
      if (dir === 'row' ? isRoad(get(x - 1, y)) || isRoad(get(x + 1, y)) : isRoad(get(x, y - 1)) || isRoad(get(x, y + 1))) continue;   // 골목 입구 옆은 비움
      const r = R(100 + li * 50 + i);
      if (n <= 0 && r < 0.55) { place('tree', R(200 + li * 50 + i) < 0.3 ? 1 : 0, x, y, 1, 1); n = 3 + Math.floor(R(300 + i) * 3); }
      else if (n === 2 && r < 0.5) place('lamp', 0, x, y, 1, 1);
      else if (r > 0.95) place('bin', 0, x, y, 1, 1);
      n--;
    }
  });
  // 신호등: 대로 횡단보도 옆 모퉁이 / 볼라드: 횡단보도 앞
  place('signal', 0, MAIN + 2, MAIN, 1, 1); place('signal', 0, MAIN, MAIN + 2, 1, 1);
  for (const x of [MAIN, MAIN + 1]) things.push({ type: 'bollard', v: 0, w: 1, x: wx(x) + TILE / 2, y: wy(MAIN) + 10 });
  // 버스 정류장 (아래 보도 안쪽 줄, 가끔)
  if (!special && R(9) < 0.6) {
    const bx = MAIN + 6 + Math.floor(R(10) * (SX - MAIN - 14));
    if (free(bx, SY - 2) && free(bx + 1, SY - 2) && (mv === null || bx + 1 < mv || bx > mv + 1)) place('busstop', 0, bx, SY - 2, 2, 1);
  }
  // 맨홀 (차도 위 바닥 무늬)
  for (let i = 0; i < 3; i++) decal('manhole', MAIN + 3 + Math.floor(R(400 + i) * (SX - MAIN - 6)), Math.floor(R(410 + i) * MAIN));

  if (special === 'namsan') {
    // 남산타워 공원: 잔디 + 가운데 타워 + 아래 보도에서 타워까지 길 + 나무·벤치
    for (let y = MAIN + 2; y < SY - 2; y++) for (let x = MAIN + 2; x < SX - 2; x++) set(x, y, 'g');
    for (let y = 19; y < SY - 2; y++) for (const x of [16, 17]) set(x, y, '.');
    place('namsan', 0, 16, 17, 2, 2);
    place('bench', 0, 13, 20, 2, 1); place('bench', 0, 19, 20, 2, 1);   // 벤치를 먼저 놓아 나무와 겹치지 않게
    for (let i = 0; i < 16; i++) {
      const x = MAIN + 3 + Math.floor(R(500 + i) * (SX - MAIN - 6)), y = MAIN + 3 + Math.floor(R(520 + i) * (SY - MAIN - 6));
      if (free(x, y) && Math.abs(x - 16.5) > 2.5 && get(x, y) === 'g') place('tree', R(540 + i) < 0.3 ? 1 : 0, x, y, 1, 1);
    }
  } else {
    // 골목으로 나뉜 땅들 (대로 보도 2줄, 골목 보도 1줄을 뺀 나머지)
    const xs = mv === null ? [[MAIN + 2, SX - 3]] : [[MAIN + 2, mv - 2], [mv + 3, SX - 3]];
    const ys = mh === null ? [[MAIN + 2, SY - 3]] : [[MAIN + 2, mh - 2], [mh + 3, SY - 3]];
    let seed = 1000;
    for (const [x0, x1] of xs) for (const [y0, y1] of ys) { fillLot(x0, y0, x1, y1, seed); seed += 100; }
  }

  // 땅 하나: 앞줄 건물(앞면이 아래 길을 봄) + (깊으면) 뒷줄 건물 + 남는 땅은 주차장·잔디·광장
  function fillLot(x0, y0, x1, y1, s) {
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    const row = (bottom, s2) => {   // 한 줄에 건물을 왼쪽부터 이어 붙임 (너비 제각각, 사이사이 틈)
      let x = x0 + (R(s2) < 0.3 ? 1 : 0), i = 0;
      while (x <= x1) {
        let type = PICK[Math.floor(R(s2 + 1 + i * 7) * PICK.length)];
        const [lo, hi] = KINDS[type].w;
        let w = lo + Math.floor(R(s2 + 2 + i * 7) * (hi - lo + 1));
        if (x + w - 1 > x1) { type = 'shop'; w = x1 - x + 1; if (w < 2) break; w = Math.min(w, 3); }
        place(type, Math.floor(R(s2 + 3 + i * 7) * 16), x, bottom - 1, w, 2);
        x += w;
        if (R(s2 + 4 + i * 7) < 0.35) {   // 틈: 가끔 나무나 쓰레기통
          if (x <= x1 && R(s2 + 5 + i * 7) < 0.5) place(R(s2 + 6 + i * 7) < 0.7 ? 'tree' : 'bin', 0, x, bottom, 1, 1);
          x++;
        }
        i++;
      }
    };
    row(y1, s);
    const back = y1 - 6;   // 뒷줄 아래 끝: 앞 건물(최대 5.5칸 키)에 가리지 않을 만큼 위
    if (back - 1 >= y0) row(back, s + 50);
    // 앞줄과 뒷줄 사이(또는 앞줄 뒤) 빈 땅
    const top = back - 1 >= y0 ? back + 1 : y0, bottom = y1 - 2;
    if (bottom < top) return;
    const r = R(s + 90);
    for (let y = top; y <= bottom; y++) for (let x = x0; x <= x1; x++) {
      if (r < 0.4) set(x, y, 'p');            // 주차장
      else if (r < 0.75) set(x, y, 'g');      // 잔디
    }
    if (r < 0.4) for (let x = x0 + 1; x <= x1; x += 2) decal('parkingP', x, top);
    else if (r < 0.75) for (let i = 0; i < 3; i++) {
      const x = x0 + Math.floor(R(s + 91 + i) * (x1 - x0 + 1)), y = top + Math.floor(R(s + 95 + i) * (bottom - top + 1));
      if (free(x, y)) place('tree', 0, x, y, 1, 1);
    } else if (x1 - x0 >= 3 && free(x0 + 1, top)) place('bench', 0, x0 + 1, top, 2, 1);
  }

  const sb = { ground, solid, things };
  sbCache.set(key, sb);
  return sb;
}

const sbOf = (tx, ty) => superblock(Math.floor(tx / SX), Math.floor(ty / SY));
const tileAt = (tx, ty) => sbOf(tx, ty).ground.get(mod(tx, SX) + ',' + mod(ty, SY)) || '.';
const blockedTile = (tx, ty) => sbOf(tx, ty).solid.has(mod(tx, SX) + ',' + mod(ty, SY));

// 화면 근처 큰 블록들의 물건·바닥 무늬 (건물은 위로 솟아 있으니 한 블록씩 더)
function thingsAround(x0, y0, x1, y1) {
  const out = [];
  for (let by = Math.floor(y0 / (SY * TILE)) - 1; by <= Math.floor(y1 / (SY * TILE)) + 1; by++)
    for (let bx = Math.floor(x0 / (SX * TILE)) - 1; bx <= Math.floor(x1 / (SX * TILE)) + 1; bx++)
      out.push(...superblock(bx, by).things);
  return out;
}

// ----- 그림 -----
const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const INK = '#2f2b38';   // 물건 테두리 색 (캐릭터 테두리처럼 아주 검지 않게)

// 바닥 한 칸 그림: 칸 종류(+ 보도는 차도와 닿는 쪽)마다 한 번만 그려 저장해 두고 다시 씀
const tileCache = new Map();
function tileImage(tx, ty) {
  const k = tileAt(tx, ty);
  const curb = isRoad(k) ? '' : [isRoad(tileAt(tx, ty - 1)), isRoad(tileAt(tx, ty + 1)), isRoad(tileAt(tx - 1, ty)), isRoad(tileAt(tx + 1, ty))].map(Number).join('');
  const key = k + curb;
  if (tileCache.has(key)) return tileCache.get(key);
  const c = makeCanvas(TILE, TILE), g = c.getContext('2d');
  const box = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  const WHITE = '#f1f1ec', YEL = '#f2c94c';
  const dashH = y => { box(4, y, 12, 2, WHITE); box(20, y, 8, 2, WHITE); };   // 가로 점선 (칸마다 이어짐)
  const dashV = x => { box(x, 4, 2, 12, WHITE); box(x, 20, 2, 8, WHITE); };
  if (isRoad(k)) {
    box(0, 0, TILE, TILE, '#4f4f58');   // 아스팔트
    for (const [px, py] of [[5, 7], [19, 3], [26, 21], [11, 25], [22, 13]]) box(px, py, 2, 2, '#585862');
    // 대로: 0|1 흰 점선, 1|2 노란 중앙선(겹선), 2|3 흰 점선 / 골목: 0|1 노란 중앙선
    if (k === 'H0' || k === 'H2') dashH(TILE - 1);
    if (k === 'H1') box(0, TILE - 3, TILE, 2, YEL);
    if (k === 'H2') box(0, 1, TILE, 2, YEL);
    if (k === 'V0' || k === 'V2') dashV(TILE - 1);
    if (k === 'V1') box(TILE - 3, 0, 2, TILE, YEL);
    if (k === 'V2') box(1, 0, 2, TILE, YEL);
    if (k === 'h0') box(0, TILE - 2, TILE, 2, YEL);
    if (k === 'h1') box(0, 0, TILE, 2, YEL);
    if (k === 'v0') box(TILE - 2, 0, 2, TILE, YEL);
    if (k === 'v1') box(0, 0, 2, TILE, YEL);
    if (k === 'ZH' || k === 'zh') for (let x = 2; x < TILE; x += 8) box(x, 3, 5, TILE - 6, WHITE);   // 횡단보도: 차가 달리는 방향과 나란한 흰 막대
    if (k === 'ZV' || k === 'zv') for (let y = 2; y < TILE; y += 8) box(3, y, TILE - 6, 5, WHITE);
  } else if (k === 'g') {   // 잔디
    box(0, 0, TILE, TILE, '#7cbf5a');
    for (const [px, py] of [[6, 7], [20, 11], [13, 22], [25, 25], [9, 16]]) box(px, py, 2, 2, '#68a84a');
  } else if (k === 'p') {   // 주차장: 아스팔트 + 칸 나누는 흰 선
    box(0, 0, TILE, TILE, '#5a5a63');
    box(0, 0, 2, TILE, WHITE); box(0, 0, TILE, 2, WHITE);
  } else {                  // 보도: 베이지 판석 2×2장, 판석마다 밝은 위·왼쪽 + 어두운 줄눈
    box(0, 0, TILE, TILE, '#d6c29b');
    for (const [x, y, t] of [[0, 0, '#ead8b4'], [16, 0, '#e6d3ae'], [0, 16, '#e4d1ab'], [16, 16, '#ecdab7']]) {
      box(x, y, 15, 15, t); box(x, y, 15, 1, '#f4e6c8'); box(x, y, 1, 15, '#f4e6c8');
    }
  }
  if (curb) {   // 연석: 차도와 닿는 쪽에 밝은 돌 + 그림자
    const [up, down, left, right] = [...curb].map(Number);
    if (up) box(0, 0, TILE, 3, '#cfc6b4'), box(0, 3, TILE, 1, '#9b927f');
    if (down) box(0, TILE - 4, TILE, 1, '#f2e6cc'), box(0, TILE - 3, TILE, 3, '#9b927f');
    if (left) box(0, 0, 3, TILE, '#cfc6b4'), box(3, 0, 1, TILE, '#9b927f');
    if (right) box(TILE - 4, 0, 1, TILE, '#f2e6cc'), box(TILE - 3, 0, 3, TILE, '#9b927f');
  }
  tileCache.set(key, c);
  return c;
}

// ----- 물건 그림 (그림 1칸 = 바닥 2픽셀). 종류·색 번호(v)·너비(w)마다 한 번만 그려 저장 -----
// 간판 글씨는 픽셀 폰트(갈무리11). 글꼴이 늦게 오면 받은 뒤 다시 그림
const artCache = new Map();
document.fonts?.load('11px Galmuri11').then(() => artCache.clear()).catch(() => {});
function thingArt(t) {
  const key = t.type + t.v + '/' + t.w;
  if (!artCache.has(key)) artCache.set(key, ARTS[t.type](t.v, t.w));
  return artCache.get(key);
}
function painter(w, h) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const box = (x, y, bw, bh, color) => { g.fillStyle = color; g.fillRect(x, y, bw, bh); };
  const text = (s, x, y, color) => { g.font = '11px Galmuri11, monospace'; g.fillStyle = color; g.textBaseline = 'top'; g.fillText(s, x, y); };
  const center = (s, cx, y, color) => { g.font = '11px Galmuri11, monospace'; text(s, Math.round(cx - g.measureText(s).width / 2), y, color); };
  // 창문: 테두리 + 유리 + 반사 한 줄 (+ 창가 화분)
  const window_ = (x, y, w, h, flowers) => {
    box(x, y, w, h, INK); box(x + 1, y + 1, w - 2, h - 2, '#8fc3e6'); box(x + 1, y + 1, w - 2, 2, '#cfe9f8');
    box(x + Math.floor(w / 2), y + 1, 1, h - 2, INK);
    if (flowers) { box(x - 1, y + h, w + 2, 3, '#8a5a3b'); box(x, y + h - 1, 2, 2, '#e8454b'); box(x + w - 3, y + h - 1, 2, 2, '#f2c94c'); box(x + 3, y + h - 1, 2, 1, '#5dbb4a'); }
  };
  const door = (x, y, h, color = '#9a6b45') => { box(x, y, 10, h, INK); box(x + 1, y + 1, 8, h - 1, color); box(x + 7, y + h / 2, 1, 2, '#f2c94c'); };
  return { c, g, box, text, center, window_, door };
}
const shadeHex = (hex, k = 0.8) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
const ACCENT = ['#3d7fd6', '#4bb3a0', '#e8454b', '#f2a03d'];
const WALLS = ['#e9c46a', '#d9a066', '#c97b63', '#a8c0a0', '#e6d5c3', '#b9a3c7', '#9fb7cf', '#d98c6a'];
const ARTS = {
  // 작은 가게(2~3칸): 2층 창문(화분) + 1층 간판·줄무늬 차양·쇼윈도·문. v로 간판 종류(약국·치킨…)·벽 색
  shop(v, w) {
    const W = w * 16, { c, box, center, window_, door } = painter(W, 60), [name, col] = SIGNS[v % 8], wall = WALLS[v % 8];
    box(0, 0, W, 60, INK); box(1, 5, W - 2, 54, wall); box(1, 1, W - 2, 4, shadeHex(wall, 0.7));   // 지붕 끝
    for (let x = 5; x + 9 < W; x += 13) window_(x, 9, 9, 10, true);
    box(1, 26, W - 2, 10, INK); box(2, 27, W - 4, 8, col); center(name, W / 2, 26, '#ffffff');      // 간판
    for (let x = 1; x < W - 1; x += 4) box(x, 37, 2, 4, col); box(1, 41, W - 2, 1, shadeHex(col, 0.7));   // 차양
    box(3, 44, W - 18, 12, INK); box(4, 45, W - 20, 10, '#cfe9f8');                                  // 쇼윈도
    door(W - 13, 43, 16);
    return c;
  },
  // 빌라: 붉은 벽돌 3층 + 창문(화분) + 에어컨 실외기 + 유리 현관 (3~4칸)
  villa(v, w) {
    const W = w * 16, { c, box, window_, door } = painter(W, 72), brick = ['#b5653f', '#c98a5e', '#9a5a4a', '#d9b48a'][v % 4];
    box(0, 0, W, 72, INK); box(1, 6, W - 2, 65, brick); box(1, 1, W - 2, 5, '#6f6a73');            // 옥상
    box(W - 12, -1 + 2, 8, 4, '#6fa8dc');                                                           // 옥상 물탱크
    for (let y = 9; y < 70; y += 3) box(1, y, W - 2, 1, '#00000018');                               // 벽돌 줄
    for (const fy of [10, 28]) for (let x = 5; x + 10 < W; x += 15) window_(x, fy, 10, 11, (x + fy) % 2 === 0);
    box(4, 48, 9, 7, INK); box(5, 49, 7, 5, '#e4e4e4'); box(6, 50, 3, 3, '#9a9a9a');                // 실외기
    door(Math.floor(W / 2) - 5, 52, 19, '#cfe9f8');
    return c;
  },
  // 오피스 빌딩: 파란 유리 격자 (3~4칸, 높이 5.5칸)
  office(v, w) {
    const W = w * 16, { c, box } = painter(W, 88), glass = ['#5b86c2', '#4f9fae', '#6f7fb8', '#5a8fa8'][v % 4];
    box(0, 0, W, 88, INK); box(1, 5, W - 2, 82, glass); box(1, 1, W - 2, 4, '#3a3a48');
    for (let y = 12; y < 72; y += 8) box(1, y, W - 2, 1, INK + '66');
    for (let x = 9; x < W - 1; x += 8) box(x, 5, 1, 67, INK + '66');
    for (let i = 0; i < 4; i++) box(6 + i * 2, 18 + i * 13, 6, 1, '#d7e8fb');
    box(1, 72, W - 2, 15, '#d9d6cf'); box(W / 2 - 8, 73, 16, 14, INK); box(W / 2 - 7, 74, 14, 13, '#bfe0f5'); box(W / 2, 74, 1, 13, INK);
    return c;
  },
  // 아파트: 흰 벽 + 층마다 창문·베란다 + 색 띠 + "1XX동" (4~5칸, 높이 5.5칸). v: 색 = v % 4, 동 번호 = 101 + v
  apt(v, w) {
    const W = w * 16, { c, box, text, door } = painter(W, 88), acc = ACCENT[v % 4];
    box(0, 2, W, 86, INK); box(1, 3, W - 2, 84, '#f3efe6');
    box(1, 3, W - 2, 5, '#d9d3c6'); box(1, 8, W - 2, 1, INK);
    box(1, 9, 6, 78, acc);
    text(`${101 + v}동`, W - 36, 10, acc);
    for (let fy = 24; fy <= 64; fy += 10) {
      for (let x = 11; x + 7 < W - 3; x += 10) { box(x, fy, 7, 6, '#2f3b55'); box(x + 1, fy + 1, 5, 2, '#8fb3de'); }
      box(9, fy + 7, W - 12, 1, '#c9c2b4');
    }
    box(8, 75, W - 10, 12, '#e4ddd0'); box(W / 2 - 7, 74, 14, 3, acc); door(W / 2 - 5, 77, 10, '#a9d6f2');
    return c;
  },
  // 마트: 초록 지붕 띠 + "마트" 간판 + 줄무늬 차양 + 큰 유리창 (4~5칸)
  market(v, w) {
    const W = w * 16, { c, box, center, door } = painter(W, 56), roof = ['#3f8a5a', '#2f7a8a', '#8a3f3f', '#4f6a9a'][v % 4];
    box(0, 0, W, 56, INK); box(1, 1, W - 2, 12, roof); box(1, 13, W - 2, 42, '#b5653f');
    for (let y = 16; y < 54; y += 3) box(1, y, W - 2, 1, '#00000018');
    box(W / 2 - 20, 6, 40, 13, INK); box(W / 2 - 19, 7, 38, 11, '#f7f7f2'); center('마트', W / 2, 7, roof);
    for (let x = 1; x < W - 1; x += 6) { box(x, 21, 3, 6, roof); box(x + 3, 21, 3, 6, '#f7f3e8'); }
    for (const x of [4, W - 26]) { box(x, 30, 22, 14, INK); box(x + 1, 31, 20, 12, '#cfe9f8'); box(x + 1, 31, 20, 2, '#e8f5fc'); }
    door(W / 2 - 5, 36, 19, '#cfe9f8');
    return c;
  },
  // 편의점: 흰 건물 + 색 띠 간판 "편의점" + 유리창 + 자동문 (3칸)
  store(v, w) {
    const { c, box, center } = painter(48, 48);
    box(0, 2, 48, 46, INK); box(1, 3, 46, 44, '#f7f7f2');
    box(1, 3, 46, 3, ['#2f7fd6', '#5dbb4a', '#e8454b', '#7b5bd6'][v % 4]); box(1, 17, 46, 2, '#5dbb4a');
    center('편의점', 24, 5, '#2b2b2b');
    box(3, 22, 42, 18, INK); box(4, 23, 40, 16, '#9fd3f0'); box(4, 23, 40, 2, '#d7eefa');
    for (const x of [13, 33]) box(x, 23, 1, 16, INK);
    box(19, 25, 10, 22, INK); box(20, 26, 8, 21, '#cfe6f7');
    return c;
  },
  // 카페: 벽돌 벽 + 줄무늬 차양 + 나무 간판 "카페" + 따뜻한 창 (3칸)
  cafe(v, w) {
    const { c, box, center } = painter(48, 50), brick = ['#b5653f', '#9a6b45', '#c27b5a', '#8a5a4a'][v % 4];
    box(0, 2, 48, 48, INK); box(1, 3, 46, 46, brick);
    for (let y = 6; y < 48; y += 4) box(1, y, 46, 1, '#00000022');
    box(11, 5, 26, 12, INK); box(12, 6, 24, 10, '#3a2a22'); center('카페', 24, 6, '#f6e3b4');
    for (let x = 1; x < 47; x += 6) { box(x, 19, 3, 6, '#5a9a5a'); box(x + 3, 19, 3, 6, '#f7f3e8'); }
    box(4, 28, 18, 14, INK); box(5, 29, 16, 12, '#f6e3b4'); box(8, 35, 4, 5, '#5a9a5a');
    box(28, 28, 12, 21, INK); box(29, 29, 10, 20, '#7a4f33'); box(36, 38, 1, 2, '#f2c94c');
    return c;
  },
  // 한옥: 휘어 올라간 기와지붕 + 나무 기둥 + 한지 창 + 돌 기단 (4칸)
  hanok() {
    const { c, box } = painter(64, 56);
    box(2, 46, 60, 10, INK); box(3, 47, 58, 8, '#a8a49c'); for (let x = 3; x < 61; x += 8) box(x, 47, 1, 8, '#8f8b84');
    box(6, 26, 52, 21, INK); box(7, 27, 50, 19, '#efe3c8');
    for (const x of [7, 23, 40, 54]) box(x, 27, 3, 19, '#8a5a3b');
    for (const x of [11, 27, 44]) {
      box(x, 30, 9, 12, '#fbf6ea');
      for (let i = 0; i <= 9; i += 3) box(x + i, 30, 1, 12, '#a87a55');
      for (let j = 0; j <= 12; j += 4) box(x, 30 + j, 9, 1, '#a87a55');
    }
    for (let y = 6; y < 27; y++) {
      const half = 18 + Math.floor((y - 6) * 0.65), x = 32 - half;
      box(x, y, half * 2, 1, y % 3 === 0 ? '#5a5e68' : '#3d4048');
    }
    box(0, 22, 4, 3, '#3d4048'); box(60, 22, 4, 3, '#3d4048'); box(0, 20, 2, 2, '#3d4048'); box(62, 20, 2, 2, '#3d4048');
    box(12, 3, 40, 4, '#2a2c33'); box(10, 1, 4, 4, '#2a2c33'); box(50, 1, 4, 4, '#2a2c33');
    return c;
  },
  // 가로수: 둥근 잎 + 줄기 + 네모 돌 화분. v=0 초록, v=1 노란 은행잎
  tree(v) {
    const { c, box } = painter(16, 30), [leaf, dark, light] = v ? ['#f2c94c', '#d9a42c', '#f8e08a'] : ['#5fae4a', '#3f8a37', '#8fd16a'];
    const rows = [[5, 6], [3, 10], [2, 12], [1, 14], [1, 14], [1, 14], [1, 14], [2, 12], [2, 12], [3, 10], [5, 6]];
    rows.forEach(([x, w], i) => { box(x - 1, 1 + i * 1.5 | 0, w + 2, 2, INK); });
    rows.forEach(([x, w], i) => { box(x, 2 + i * 1.5 | 0, w, 2, leaf); box(x + w / 2, 2 + i * 1.5 | 0, w / 2, 2, dark); });
    box(4, 5, 3, 3, light); box(8, 4, 2, 2, light);
    box(6, 17, 4, 7, INK); box(7, 17, 2, 7, '#7a5236');
    box(2, 23, 12, 7, INK); box(3, 24, 10, 5, '#b9b1a3'); box(3, 24, 10, 1, '#6b5a43');   // 화분 + 흙
    return c;
  },
  // 가로등
  lamp() {
    const { c, box } = painter(16, 44);
    box(6, 0, 6, 9, INK); box(7, 1, 4, 7, '#fff1b8'); box(5, 9, 8, 2, INK);
    box(7, 11, 3, 30, INK); box(8, 11, 1, 30, '#6b7080');
    box(5, 40, 8, 4, INK);
    return c;
  },
  // 신호등 + 파란 보행자 표지판
  signal() {
    const { c, box } = painter(16, 48);
    box(5, 0, 7, 17, INK); box(6, 1, 5, 15, '#3a3a44');
    box(7, 2, 3, 3, '#e8454b'); box(7, 7, 3, 3, '#f2c94c'); box(7, 12, 3, 3, '#5dbb4a');
    box(7, 17, 3, 27, INK); box(8, 17, 1, 27, '#6b7080');
    box(3, 22, 11, 10, INK); box(4, 23, 9, 8, '#3d7fd6'); box(7, 24, 3, 2, '#ffffff'); box(7, 26, 3, 4, '#ffffff');   // 보행자 표지
    box(5, 44, 7, 4, INK);
    return c;
  },
  // 볼라드(작은 기둥, 지나갈 수 있음)
  bollard() {
    const { c, box } = painter(16, 12);
    box(6, 2, 5, 10, INK); box(7, 3, 3, 8, '#b9b9c2'); box(7, 4, 3, 1, '#f2c94c');
    return c;
  },
  // 벤치 (2칸)
  bench() {
    const { c, box } = painter(32, 18);
    box(1, 2, 30, 6, INK); box(2, 3, 28, 4, '#b5803f');
    box(1, 9, 30, 4, INK); box(2, 10, 28, 2, '#c9944f');
    box(3, 13, 3, 5, INK); box(26, 13, 3, 5, INK);
    return c;
  },
  // 쓰레기통 (초록)
  bin() {
    const { c, box } = painter(16, 20);
    box(2, 2, 12, 4, INK); box(3, 3, 10, 2, '#4f9a3c');
    box(3, 6, 10, 13, INK); box(4, 7, 8, 11, '#5fae4a'); box(5, 9, 6, 1, '#3f8a37');
    return c;
  },
  // 버스 정류장 (2칸): 파란 지붕 + 유리 칸막이 + "버스" 표지
  busstop() {
    const { c, box, center } = painter(32, 40);
    box(0, 4, 32, 5, INK); box(1, 5, 30, 3, '#3d7fd6');
    box(2, 9, 2, 29, INK); box(28, 9, 2, 29, INK);
    box(4, 12, 24, 20, '#cfe9f8aa'); box(4, 12, 24, 1, '#ffffff');
    box(6, 31, 20, 4, INK); box(7, 32, 18, 2, '#9a6b45');
    box(19, 0, 12, 10, INK); box(20, 1, 10, 8, '#ffffff'); center('B', 25, -1, '#3d7fd6');
    return c;
  },
  // 바닥 무늬: 맨홀 뚜껑
  manhole() {
    const { c, box } = painter(16, 16);
    box(4, 3, 8, 10, '#3a3a42'); box(3, 4, 10, 8, '#3a3a42');
    box(5, 5, 6, 1, '#55555f'); box(5, 7, 6, 1, '#55555f'); box(5, 9, 6, 1, '#55555f');
    return c;
  },
  // 바닥 무늬: 주차 P
  parkingP() {
    const { c, box } = painter(16, 16);
    box(4, 3, 8, 10, '#f1f1ec'); box(6, 5, 2, 6, '#5a5a63'); box(8, 5, 2, 1, '#5a5a63'); box(9, 6, 1, 2, '#5a5a63'); box(8, 8, 2, 1, '#5a5a63');
    return c;
  },
  // 남산타워: 흰 기둥 + 전망대 + 빨강·흰 안테나 + 아래 건물 (2칸)
  namsan() {
    const { c, box } = painter(32, 150);
    for (let y = 0; y < 26; y += 4) box(15, y, 2, 4, y % 8 ? '#f4f4f0' : '#e8454b');
    box(13, 24, 6, 6, INK); box(14, 25, 4, 5, '#e4e4ea');
    box(7, 30, 18, 14, INK); box(8, 31, 16, 12, '#e9e9ef'); box(8, 35, 16, 3, '#5b6f8a'); box(8, 31, 16, 2, '#ffffff');
    box(12, 44, 8, 92, INK); box(13, 44, 6, 92, '#efeff3'); box(16, 44, 2, 92, '#cfd0d8');
    box(4, 130, 24, 20, INK); box(5, 131, 22, 18, '#d9d6cf'); box(5, 136, 22, 3, '#9fd3f0'); box(13, 141, 6, 8, '#7a7a86');
    return c;
  },
};
