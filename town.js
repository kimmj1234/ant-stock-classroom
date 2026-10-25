'use strict';
// ===== 장면(맵): 바깥 잔디밭 + 주택 안 =====
// 장면마다: 바닥 지도(글자 한 칸 = 바닥 한 칸), 서 있는 물건, 못 지나가는 칸, E로 할 수 있는 곳(문·NPC), 처음 서는 곳.
// useScene(이름)으로 장면을 바꾸면 크기·바닥·물건이 모두 그 장면 것으로 바뀜.
// 물건은 캐릭터와 같은 굵기의 픽셀(그림 1칸 = 바닥 2픽셀)로 그림. 빛은 왼쪽 위에서 와서 그림자는 오른쪽 아래로 짐.
const TILE = 32;                        // 바닥 한 칸(사각형)의 픽셀 크기
const ART = 2;                          // 물건 그림 1칸 = 바닥 2픽셀 → 바닥 한 칸 = 그림 16칸
// 지금 장면의 값들 (useScene이 채움)
let SCENE, COLS, ROWS, MAP_W, MAP_H, GROUND, THINGS, SOLID, SPOTS, NPCS, START;
const inMap = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const tileAt = (x, y) => (inMap(x, y) ? GROUND[y][x] : null);
const isRoad = k => k === 'R' || k === 'Z';
const WALL_TILES = 'wb';                // 벽 칸은 저절로 못 지나감

// 장면 만들기: build({ place, decal, deco, wallDeco, spot, npc })로 물건을 놓음
//   place(종류, 색번호, x, y, 가로칸, 세로줄, 막힘) — (x, y) = 왼쪽 위 칸. 그림은 차지한 칸의 아래 가운데에 세움
function makeScene(name, ground, start, build) {
  const sc = { name, cols: ground[0].length, rows: ground.length, ground, start, things: [], solid: new Set(), spots: [], npcs: [] };
  const place = (type, v, x, y, w = 1, d = 1, block = true) => {
    if (block) for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) sc.solid.add(xx + ',' + yy);
    sc.things.push({ type, v, w, d, x: (x + w / 2) * TILE, y: (y + d) * TILE });
  };
  const decal = (type, x, y, v = 0) => sc.things.push({ type, v, w: 1, d: 1, x: (x + 0.5) * TILE, y: (y + 1) * TILE, ground: true });   // 바닥 무늬(지나갈 수 있음)
  const deco = (type, x, y, v = 0, dy = 0) => sc.things.push({ type, v, w: 1, d: 1, x: (x + 0.5) * TILE, y: (y + 1) * TILE + dy });     // 작은 장식(지나갈 수 있음)
  const wallDeco = (type, x, w, bottom) => sc.things.push({ type, v: 0, w, d: 1, x: (x + w / 2) * TILE, y: bottom * TILE, ground: true });   // 벽에 거는 것(창문·액자·시계)
  // E로 할 수 있는 곳: (x, y) 픽셀 근처에 서서 E. 머리 위 "E" 표시는 (px, py)
  const spot = o => sc.spots.push(o);
  const npc = (n, tx, ty) => {   // NPC: 칸 (tx, ty)에 서 있음(못 지나감), 가까이서 E → 대화
    const o = { ...n, x: (tx + 0.5) * TILE, y: (ty + 1) * TILE - 2, dir: 's', left: false, moving: false };
    sc.npcs.push(o); sc.solid.add(tx + ',' + ty);
    spot({ type: 'npc', npc: o, x: o.x, y: o.y, px: o.x, py: o.y - 92, r: 42 });   // NPC는 옆에 붙어 설 수 없어서 말 거는 거리를 조금 넓게
  };
  build({ place, decal, deco, wallDeco, spot, npc });
  ground.forEach((row, y) => [...row].forEach((k, x) => { if (WALL_TILES.includes(k)) sc.solid.add(x + ',' + y); }));
  return sc;
}

// ===== 도시 맵 틀 =====
// 가로 80칸 × 세로 48칸. 도로 목록만 적으면 보도·차도·횡단보도·차선·정지선을 저절로 깔아 줌
//   대로(4차선, 보도 2칸): 가운데 가로(22~25줄)·세로(38~41칸) / 골목(2차선, 보도 1칸): 가로 10·36줄, 세로 16·62칸
//   도로로 나뉜 블록 16개는 빈 부지(e) + 들어설 곳 이름표, 오른쪽 가운데 블록은 공원(도시 입구 옆)
const CITY_ROADS = [
  { dir: 'h', at: 22, n: 4, sw: 2 }, { dir: 'v', at: 38, n: 4, sw: 2 },
  { dir: 'h', at: 10, n: 2, sw: 1 }, { dir: 'h', at: 36, n: 2, sw: 1 },
  { dir: 'v', at: 16, n: 2, sw: 1 }, { dir: 'v', at: 62, n: 2, sw: 1 },
];
const LOT_NAMES = ['주택가', '아파트', '상가', '카페거리', '학교', '회사', '병원', '은행', '마트', '시장', '주차장', '경찰서', '도서관', '체육관', '소방서', '공원'];
function cityPlan(W, H, roads) {
  const g = Array.from({ length: H }, () => Array(W).fill('e'));
  const inBand = (r, x, y, pad) => { const p = r.dir === 'h' ? y : x; return p >= r.at - pad && p < r.at + r.n + pad; };
  const each = fn => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fn(x, y); };
  each((x, y) => { if (roads.some(r => inBand(r, x, y, r.sw))) g[y][x] = '.'; });   // 보도
  each((x, y) => { if (roads.some(r => inBand(r, x, y, 0))) g[y][x] = 'R'; });      // 차도
  const marks = new Map(), zdir = new Map(), only = (x, y) => { const on = roads.filter(r => inBand(r, x, y, 0)); return on.length === 1 ? on[0] : null; };
  // 횡단보도: 차도 칸이 직각으로 만나는 도로의 보도 줄 위에 있으면 (교차로 바로 옆, 보도와 보도를 이음)
  each((x, y) => {
    const r = g[y][x] === 'R' && only(x, y);
    if (r && roads.some(o => o.dir !== r.dir && inBand(o, x, y, o.sw) && !inBand(o, x, y, 0))) { g[y][x] = 'Z'; zdir.set(x + ',' + y, r.dir); }
  });
  // 차선: 4차선 = 흰 점선·노란 중앙선(겹선)·흰 점선, 2차선 = 노란 중앙선 / 정지선: 횡단보도 바로 앞(오른쪽 통행)
  const LANES = { h4: [['dashB'], ['yelB'], ['yelT', 'dashB'], []], h2: [['yelB'], ['yelT']], v4: [['dashR'], ['yelR'], ['yelL', 'dashR'], []], v2: [['yelR'], ['yelL']] };
  each((x, y) => {
    const r = g[y][x] === 'R' && only(x, y);
    if (!r) return;
    const lane = r.dir === 'h' ? y - r.at : x - r.at, half = lane >= r.n / 2, m = [...LANES[r.dir + r.n][lane]];
    if (r.dir === 'h' && half && g[y][x + 1] === 'Z') m.push('stopR');       // 동쪽으로 가는 차선(아래쪽)
    if (r.dir === 'h' && !half && g[y][x - 1] === 'Z') m.push('stopL');      // 서쪽으로 가는 차선(위쪽)
    if (r.dir === 'v' && !half && g[y + 1]?.[x] === 'Z') m.push('stopB');    // 남쪽으로 가는 차선(왼쪽)
    if (r.dir === 'v' && half && g[y - 1]?.[x] === 'Z') m.push('stopT');     // 북쪽으로 가는 차선(오른쪽)
    if (m.length) marks.set(x + ',' + y, m);
  });
  // 블록: 도로·보도에 안 걸린 가로 칸 구간 × 세로 줄 구간
  const spans = (len, dir) => {
    const out = []; let start = null;
    for (let i = 0; i <= len; i++) {
      const free = i < len && !roads.some(r => r.dir === dir && i >= r.at - r.sw && i < r.at + r.n + r.sw);
      if (free && start === null) start = i;
      if (!free && start !== null) { out.push([start, i - 1]); start = null; }
    }
    return out;
  };
  const blocks = spans(H, 'h').flatMap(([y0, y1]) => spans(W, 'v').map(([x0, x1]) => ({ x0, x1, y0, y1 })));
  return { ground: g.map(row => row.join('')), marks, zdir, blocks };
}
const CITY = cityPlan(80, 48, CITY_ROADS);
const CITY_PARK = 7;   // 공원이 될 블록 번호 (오른쪽 가운데 위, 도시 입구 옆)
CITY.ground = CITY.ground.map((row, y) => [...row].map((k, x) => { const b = CITY.blocks[CITY_PARK]; return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 ? 'g' : k; }).join(''));

const SCENES = {
  // 튜토리얼 공간(처음 서는 곳): 가로 40칸 × 세로 24칸 잔디밭 + 가운데 주택(가로 6칸 × 세로 3줄). 문 앞에서 E → 집 안
  // l 흙길: 현관에서 내려와 처음 서는 곳을 지나 왼쪽 끝까지. 왼쪽 끝 표지판 앞에서 E → 떠날지 묻고, 떠나면 다시 못 돌아옴
  field: makeScene('field', Array.from({ length: 24 }, (_, y) => [...'g'.repeat(40)].map((k, x) => ((y === 14 || y === 15) && x <= 20) || ((y === 12 || y === 13) && (x === 19 || x === 20)) ? 'l' : k).join('')),
    { x: 20 * TILE, y: 15 * TILE }, ({ place, spot }) => {
    place('house', 0, 17, 9, 6, 3);
    // 길가 벤치 두 개 (2칸). 벤치마다 왼쪽·오른쪽 두 자리 → 앞에서 E로 앉음
    const bench = (x, y) => {
      place('bench', 0, x, y, 2, 1);
      const cx = (x + 1) * TILE, by = (y + 1) * TILE;   // 벤치 가운데, 발밑(앞쪽 끝)
      for (const side of [-1, 1]) spot({ type: 'seat', x: cx + side * 16, y: by + 12, px: cx + side * 16, py: by - 62, r: 26, sitY: by - 14, by });
    };
    bench(9, 12); bench(25, 12);
    // 나무: 맵 가장자리와 빈 풀밭에 네 종류(벚·은행·단풍·소나무)를 섞어 심음 (길·집·처음 서는 곳은 비움). 색 번호 = 나무마다 크기·얼룩
    const KINDS = ['cherry', 'pine', 'ginkgo', 'maple', 'cherry', 'ginkgo', 'pine', 'maple'];
    [[3, 3], [7, 1], [11, 5], [14, 2], [27, 2], [31, 5], [35, 2], [38, 7], [33, 10], [37, 13], [29, 17], [34, 20], [38, 22],
      [24, 21], [18, 20], [12, 19], [6, 21], [2, 18], [8, 17], [15, 22], [4, 8]]
      .forEach(([x, y], i) => place(KINDS[i % KINDS.length], i, x, y));
    spot({ type: 'door', x: 20 * TILE, y: 12 * TILE + 10, px: 20 * TILE, py: 12 * TILE - 98, to: 'home', at: { x: 10 * TILE, y: 10 * TILE } });
    place('signpost', 0, 2, 13);
    spot({ type: 'exit', x: 0.5 * TILE, y: 15 * TILE, px: 2.5 * TILE, py: 11 * TILE - 40, to: 'city', at: { x: 78.5 * TILE, y: 21 * TILE + 20 } });   // 도시 오른쪽 끝, 대로 위쪽 보도
  }),
  // 도시 입구: 튜토리얼을 떠나면 오는 곳(다음부터는 여기서 시작). 오른쪽 끝에서 흙길이 들어옴. 도시는 앞으로 하나씩 지음
  city: Object.assign(makeScene('city', CITY.ground, { x: 78.5 * TILE, y: 21 * TILE + 20 }, ({ place }) => {
    // 블록마다 가운데에 들어설 곳 이름표 (공원 블록은 "공원" + 나무·벤치)
    let n = 0;
    CITY.blocks.forEach((b, i) => {
      const cx = Math.floor((b.x0 + b.x1) / 2), cy = Math.floor((b.y0 + b.y1) / 2);
      place('lotsign', i === CITY_PARK ? LOT_NAMES.length - 1 : n++, cx - 1, cy, 3, 1);
      if (i !== CITY_PARK) return;
      const KINDS = ['cherry', 'maple', 'ginkgo', 'pine'];
      [[b.x0 + 1, b.y0 + 1], [b.x0 + 4, b.y0 + 4], [b.x1 - 1, b.y0 + 1], [b.x1 - 4, b.y1 - 1], [b.x0 + 1, b.y1 - 1], [b.x1 - 1, b.y1 - 2], [b.x0 + 9, b.y0 + 1]]
        .forEach(([x, y], k) => place(KINDS[k % 4], k + 30, x, y));
      place('bench', 0, cx - 1, cy + 2, 2, 1);
    });
    // 대로 보도에 가로등: 6칸마다 (교차로·횡단보도·골목 근처는 비움)
    for (let x = 2; x < 80; x += 6) if ((x < 33 || x > 46) && !(x >= 14 && x <= 19) && !(x >= 60 && x <= 65)) { place('lamp', 0, x, 20); place('lamp', 0, x, 27); }
    for (let y = 2; y < 48; y += 6) if (y < 17 || y > 30) { place('lamp', 0, 36, y); place('lamp', 0, 43, y); }
  }), { marks: CITY.marks, zdir: CITY.zdir }),
  // 집 안: 가로 20칸 × 세로 12칸. w 벽지 벽(위 3줄), b 벽 윗면(테두리), f 나무 마루, r 러그, d 현관 매트(여기서 E → 밖으로)
  home: makeScene('home', [
    'wwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwww',
    'bffffffffffffffffffb',
    'bffffffffrrrrrfffffb',
    'bffffffffrrrrrfffffb',
    'bffffffffrrrrrfffffb',
    'bffffffffrrrrrfffffb',
    'bffffffffrrrrrfffffb',
    'bffffffffffffffffffb',
    'bffffffffffffffffffb',
    'bbbbbbbbbddbbbbbbbbb',
  ], { x: 10 * TILE, y: 10 * TILE }, ({ place, wallDeco, spot, npc }) => {
    // 벽에 거는 것
    wallDeco('wwin', 7, 2, 2.4); wallDeco('wwin', 13, 2, 2.4);
    wallDeco('frame', 1, 2, 1.9); wallDeco('clock', 9, 1, 1.6);
    // 침실 쪽: 침대 · 협탁 · 책장
    place('bed', 0, 1, 3, 2, 3); place('nightstand', 0, 3, 3); place('shelf', 0, 5, 3, 2, 1);
    // 거실: TV · 커피 테이블 · 소파 (러그 위)
    place('tv', 0, 10, 3, 3, 1); place('ctable', 0, 10, 5, 3, 1); place('sofa', 0, 10, 7, 3, 1);
    // 주방: 조리대(싱크대·가스레인지) · 냉장고 · 식탁과 의자
    place('counter', 0, 15, 3, 3, 1); place('fridge', 0, 18, 3); place('dtable', 0, 14, 7, 4, 1);
    // 화분
    place('plant', 0, 1, 9); place('plant', 1, 18, 9);
    // 안내원 NPC: 처음 말을 걸면 기본 UI를 줌(gives, 마지막 말을 닫을 때 받음). 받은 뒤에는 after 대사
    npc({ name: '안내원 봄', look: { ...DEFAULT_LOOK, color: '#fff4dc', hat: { shape: 'sprout' } }, gives: 'basicUI', lines: [
      '어서 와! 여기는 안내소야.',
      '이곳 "나의 두번째 인생"에서 살아가려면 꼭 필요한 게 하나 있어.',
      '자, 기본 UI를 줄게! 앞으로 살아가는 데 필요한 정보를 한눈에 볼 수 있을 거야.',
      '준비가 되면 집을 나가서 왼쪽 길 끝 표지판으로 가 봐. 도시로 떠날 수 있어!',
    ], after: [
      '기본 UI는 잘 받았지?',
      '준비가 되면 집을 나가서 왼쪽 길 끝 표지판으로 가 봐. 한 번 떠나면 다시 못 돌아오니까 천천히 둘러보고 가!',
    ] }, 6, 7);
    // 현관 매트: E → 밖으로 (집 문 앞)
    spot({ type: 'door', x: 10 * TILE, y: 11 * TILE + 16, px: 10 * TILE, py: 11 * TILE - 40, to: 'field', at: { x: 20 * TILE, y: 12 * TILE + 40 } });
  }),
};
function useScene(name) {
  SCENE = SCENES[name];
  ({ cols: COLS, rows: ROWS, ground: GROUND, things: THINGS, solid: SOLID, spots: SPOTS, npcs: NPCS, start: START } = SCENE);
  MAP_W = COLS * TILE; MAP_H = ROWS * TILE;
}
useScene('field');

const blockedTile = (tx, ty) => !inMap(tx, ty) || SOLID.has(tx + ',' + ty);   // 맵 밖·물건·벽 자리는 못 지나감
const thingsAround = () => THINGS;
// (x, y) 픽셀 근처(보통 30픽셀, NPC는 42픽셀 안)에 E로 할 수 있는 곳이 있으면 그중 가장 가까운 것
function nearSpot(x, y) {
  let best = null, bd = Infinity;
  for (const sp of SPOTS) { if (sp.taken || sp.othersOn) continue; const d = Math.hypot(sp.x - x, sp.y - y); if (d < (sp.r || 30) && d < bd) { bd = d; best = sp; } }   // 누가 앉은 자리는 빼고
  return best;
}

// ----- 그림 -----
const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const INK = '#2f2b38';   // 물건 테두리 색 (캐릭터 테두리처럼 아주 검지 않게)
const hash = (x, y, s = 0) => { let h = Math.imul(x + 1013, 374761393) ^ Math.imul(y + 7, 668265263) ^ Math.imul(s + 3, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// 바닥 한 칸 그림: 칸 종류·무늬·이웃 차도·변화(금·얼룩 등)마다 한 번만 그려 저장
const tileCache = new Map();
// 잔디·흙길의 계절 모습 (game.js가 정함): spring 연두 + 꽃 많음 / summer 초록 / autumn 누런 풀 + 떨어진 잎 / winter 마른 풀
//   snow 눈 오는 날: 하얗게 덮임 / melt 눈 온 다음 날(겨울): 마른 풀 위에 녹다 남은 눈
let GROUND_LOOK = 'summer';
const GRASS = {   // [바탕, 풀결 어두운 색, 풀결 밝은 색, 풀 무더기]
  spring: ['#86c95a', '#6db346', '#a6dc7a', '#69ad48'],
  summer: ['#78bb55', '#62a444', '#8fcc6a', '#5e9e41'],
  autumn: ['#b9b45c', '#9c9440', '#d3c978', '#a38b3a'],
  winter: ['#a8a07a', '#8f8762', '#bdb592', '#857c58'],
  melt: ['#a8a07a', '#8f8762', '#bdb592', '#857c58'],
  snow: ['#eef2f8', '#d6dfec', '#ffffff', '#c9d4e4'],
};
const SEASONAL_TILES = 'gl';   // 계절 모습이 있는 바닥
function tileImage(tx, ty) {
  const k = tileAt(tx, ty);
  if (k === null) return null;
  const v = Math.floor(hash(tx, ty) * 6);   // 칸마다 조금씩 다른 모습 (0~5)
  const side = (dx, dy) => { const n = tileAt(tx + dx, ty + dy); return n === 'Z' ? 2 : n === 'R' ? 1 : 0; };   // 0 없음, 1 차도(연석), 2 횡단보도(경사로)
  const curb = isRoad(k) ? '' : [side(0, -1), side(0, 1), side(-1, 0), side(1, 0)].join('');
  const marks = (k === 'R' && SCENE.marks?.get(tx + ',' + ty)) || [];   // 차선 무늬·횡단보도 방향은 장면이 정함(도시 틀 cityPlan)
  const zdir = (k === 'Z' && SCENE.zdir?.get(tx + ',' + ty)) || '';
  // 집 안: 벽지는 맨 위·맨 아래 줄(몰딩·걸레받이), 러그는 가장자리, 벽 윗면은 안쪽 방향이 그림에 들어감
  const nb = ch => [tileAt(tx, ty - 1) !== ch, tileAt(tx, ty + 1) !== ch, tileAt(tx - 1, ty) !== ch, tileAt(tx + 1, ty) !== ch].map(Number).join('');
  const grassy = (dx, dy) => +(tileAt(tx + dx, ty + dy) === 'g');   // 흙길: 잔디와 닿는 쪽만 가장자리(맵 끝으로는 그대로 이어짐)
  const inner = k === 'w' ? (tileAt(tx, ty + 1) !== 'w' ? 'base' : tileAt(tx, ty - 1) !== 'w' ? 'top' : '') : k === 'r' ? nb('r') : k === 'b' ? nb('b')
    : k === 'l' ? [grassy(0, -1), grassy(0, 1), grassy(-1, 0), grassy(1, 0)].join('') : '';
  const look = SEASONAL_TILES.includes(k) ? GROUND_LOOK : '';
  const key = [k, v, curb, marks.join('+'), zdir, inner, look].join('|');
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
      if (m === 'dashB') dash(TILE - 2);
      if (m === 'dashR') { box(TILE - 2, 4, 2, 12, WHITE); box(TILE - 2, 20, 2, 8, WHITE); }   // 세로 도로 흰 점선
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
  } else if (k === 'e') {   // 빈 부지: 다진 흙 + 자갈, 가끔 풀 한 포기 (건물이 들어설 자리)
    box(0, 0, TILE, TILE, '#c4b592');
    for (let i = 0; i < 10; i++) { const px = Math.floor(hash(tx, ty, i + 30) * 30), py = Math.floor(hash(tx, ty, i + 31) * 30); box(px, py, 2, 1, i % 3 ? '#ad9e7b' : '#d8cba9'); }
    if (v === 2) { box(10, 14, 3, 2, '#9a9488'); box(10, 14, 3, 1, '#c9c3b6'); }
    if (v === 5) { box(20, 9, 1, 3, '#7aa45a'); box(22, 10, 1, 2, '#7aa45a'); box(21, 8, 1, 4, '#8cb86a'); }
  } else if (k === 'g') {   // 잔디: 짧은 풀결 + 가끔 풀 무더기·작은 꽃 (계절마다 색이 바뀜, 눈 오면 하얗게 덮임)
    const [base, dk, lt, tuft] = GRASS[look];
    box(0, 0, TILE, TILE, base);
    for (let i = 0; i < 9; i++) { const px = Math.floor(hash(tx, ty, i) * 30), py = Math.floor(hash(tx, ty, i + 20) * 30); box(px, py, 1, 2, dk); box(px + 1, py, 1, 1, lt); }
    if (look === 'snow') {   // 눈 위로 마른 풀끝이 가끔 삐죽
      for (let i = 0; i < 3; i++) box(Math.floor(hash(tx, ty, i + 70) * 30), Math.floor(hash(tx, ty, i + 80) * 30), 1, 2, '#9c946a');
    } else {
      if (look === 'melt') for (let i = 0; i < 3; i++) {   // 녹다 남은 눈 덩이
        const px = Math.floor(hash(tx, ty, i + 90) * 24), py = Math.floor(hash(tx, ty, i + 95) * 26);
        box(px, py, 7, 4, '#eef2f8'); box(px + 1, py - 1, 4, 1, '#eef2f8'); box(px + 1, py + 3, 6, 1, '#d6dfec');
      }
      if (v === 4 && (look === 'spring' || look === 'summer')) { box(10, 12, 2, 2, '#ffffff'); box(20, 22, 2, 2, '#f5a3b5'); box(24, 8, 2, 2, '#f2c94c'); }   // 작은 꽃
      if (look === 'spring' && v === 1) { box(6, 24, 2, 2, '#f2c94c'); box(26, 16, 2, 2, '#ffffff'); }   // 봄엔 꽃이 더 많음 (민들레·냉이꽃)
      if (look === 'autumn' && v < 3) [[6, 9, '#e0602a'], [22, 19, '#ecbc26'], [14, 26, '#bf3f28']].forEach(([x, y, c]) => box(x, y, 2, 1, c));   // 떨어진 잎
      if (v === 5) { box(12, 16, 6, 3, tuft); box(13, 15, 4, 1, tuft); }
    }
  } else if (k === 'l') {   // 흙길: 밝은 흙 + 자갈·발자국 얼룩, 잔디와 닿는 쪽은 풀이 삐죽 덮음 (눈 오면 눈이 얇게 덮임)
    box(0, 0, TILE, TILE, look === 'snow' ? '#e6e9f0' : '#d2ab72');
    for (let i = 0; i < 7; i++) { const px = Math.floor(hash(tx, ty, i + 40) * 29), py = Math.floor(hash(tx, ty, i + 60) * 29); box(px, py, 2, 2, i % 2 ? '#bf965d' : '#e2c08a'); }
    if (v === 2) { box(9, 12, 4, 3, '#a9a39a'); box(9, 12, 4, 1, '#cfc9bf'); }   // 돌멩이
    if (v === 4) box(18, 20, 6, 2, '#c49d64');
    if (look === 'snow') for (let i = 0; i < 6; i++) box(Math.floor(hash(tx, ty, i + 40) * 28), Math.floor(hash(tx, ty, i + 60) * 28), 4, 2, '#c9b08a');   // 눈 사이로 보이는 흙(발자국)
    if (look === 'melt') for (let i = 0; i < 2; i++) box(Math.floor(hash(tx, ty, i + 50) * 22), Math.floor(hash(tx, ty, i + 55) * 26), 8, 4, '#e6e9f0');   // 녹다 남은 눈
    const [up, down, left, right] = [...inner].map(Number), [G, G2] = GRASS[look];
    for (let i = 0; i < TILE; i += 4) {
      const j = Math.floor(hash(tx, ty, i) * 3);
      if (up) { box(i, 0, 4, 2 + j, G); box(i + 1, 2 + j, 1, 1, G2); }
      if (down) { box(i, TILE - 2 - j, 4, 2 + j, G); box(i + 2, TILE - 3 - j, 1, 1, G2); }
      if (left) { box(0, i, 2 + j, 4, G); box(2 + j, i + 1, 1, 1, G2); }
      if (right) { box(TILE - 2 - j, i, 2 + j, 4, G); box(TILE - 3 - j, i + 2, 1, 1, G2); }
    }
  } else if (k === 'f' || k === 'd') {   // 나무 마루: 가로 널빤지(8픽셀), 줄마다 이음새를 엇갈림 / d = 현관 매트
    box(0, 0, TILE, TILE, '#c98d5a');
    for (let y = 0; y < TILE; y += 8) {
      box(0, y, TILE, 1, '#a8703f'); box(0, y + 1, TILE, 1, '#d9a070');
      const off = ((ty * 4 + y / 8) % 3) * 11 + v * 3;
      box((off + 6) % TILE, y + 1, 1, 7, '#a8703f');
      box((off + 9) % TILE, y + 4, 4, 1, '#bb7f4c');   // 나뭇결
    }
    if (k === 'd') { box(2, 4, 28, 24, '#5a3a32'); box(3, 5, 26, 22, '#8a3f3f'); for (let x = 5; x < 28; x += 3) box(x, 7, 1, 18, '#a85a4a'); }
  } else if (k === 'w') {   // 벽지: 크림색 + 세로 줄무늬, 맨 위 몰딩, 맨 아래 나무 걸레받이
    box(0, 0, TILE, TILE, '#f1e4cc');
    for (let x = 3; x < TILE; x += 8) { box(x, 0, 2, TILE, '#e9d8b9'); box(x + 5, 0, 1, TILE, '#f7eedd'); }
    if (inner === 'top') { box(0, 0, TILE, 4, '#d9c39c'); box(0, 4, TILE, 1, '#bfa77f'); }
    if (inner === 'base') { box(0, TILE - 9, TILE, 1, '#6f4a30'); box(0, TILE - 8, TILE, 8, '#8a5a3b'); box(0, TILE - 8, TILE, 1, '#a8774f'); }
  } else if (k === 'b') {   // 벽 윗면(위에서 본 벽 두께): 어두운 나무색, 방 쪽 가장자리는 밝게
    box(0, 0, TILE, TILE, '#5f4a3e');
    for (let y = 4; y < TILE; y += 8) box(0, y, TILE, 1, '#544034');
    const [up, down, left, right] = [...inner].map(Number);
    if (up && tileAt(tx, ty - 1) === 'f') box(0, 0, TILE, 3, '#8a6f5c');
    if (down && tileAt(tx, ty + 1) === 'f') box(0, TILE - 3, TILE, 3, '#8a6f5c');
    if (left && tileAt(tx - 1, ty) === 'f') box(0, 0, 3, TILE, '#8a6f5c');
    if (right && tileAt(tx + 1, ty) === 'f') box(TILE - 3, 0, 3, TILE, '#8a6f5c');
  } else if (k === 'r') {   // 러그: 붉은 바탕 + 마름모 무늬, 가장자리는 크림색 테두리와 술
    box(0, 0, TILE, TILE, '#b8483e');
    for (let i = 0; i < TILE; i += 16) { box(i + 6, 6, 4, 4, '#d9a24a'); box(i + 6, 22, 4, 4, '#d9a24a'); box(i + 14, 14, 4, 4, '#e8c98a'); }
    const [up, down, left, right] = [...inner].map(Number);
    if (up) { box(0, 0, TILE, 4, '#f1e4cc'); box(0, 4, TILE, 1, '#8a3a32'); }
    if (down) { box(0, TILE - 4, TILE, 4, '#f1e4cc'); box(0, TILE - 5, TILE, 1, '#8a3a32'); }
    if (left) { box(0, 0, 4, TILE, '#f1e4cc'); box(4, 0, 1, TILE, '#8a3a32'); for (let y = 2; y < TILE; y += 4) box(0, y, 2, 2, '#f8f1e2'); }
    if (right) { box(TILE - 4, 0, 4, TILE, '#f1e4cc'); box(TILE - 5, 0, 1, TILE, '#8a3a32'); for (let y = 2; y < TILE; y += 4) box(TILE - 2, y, 2, 2, '#f8f1e2'); }
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
const BIG = new Set(['cafe', 'shop', 'villa', 'house']);
// 밤에 불이 켜지는 곳: 물건 그림 안의 [x, y, 가로, 세로] (그림 칸 단위). 창문은 창살 사이 유리 네 칸씩
// 바깥 하늘이 보이는 유리: 물건 그림 안의 [x, y, 가로, 세로] (집 안 창문은 창살 사이 네 칸) → 시간·날씨에 맞춰 색이 바뀜
const SKY_GLASS = { wwin: [[6, 4, 9, 9], [17, 4, 9, 9], [6, 15, 9, 9], [17, 15, 9, 9]] };
const LIGHTS = {
  house: [16, 66].flatMap(wx => [[wx, 53, 6, 6], [wx + 8, 53, 6, 6], [wx, 61, 6, 6], [wx + 8, 61, 6, 6]])
    .concat([[44, 60, 8, 4], [46, 47, 4, 3]]),   // 문 위 작은 창, 처마 밑 등
};   // 표지판처럼 가는 것은 아래에서 그림자 없음
function drawShadows(ctx, S, cam) {
  ctx.fillStyle = SHADE;
  for (const t of THINGS) {
    if (t.ground) continue;
    const x = t.x * S - cam.x, y = t.y * S - cam.y, half = t.w * TILE / 2 * S;
    if (BIG.has(t.type)) {           // 건물: 오른쪽 벽 옆으로 비스듬한 그림자 + 앞쪽 얇은 그림자
      const h = t.d * TILE * S, sw = 12 * S;
      ctx.beginPath(); ctx.moveTo(x + half, y - h); ctx.lineTo(x + half + sw, y - h + sw); ctx.lineTo(x + half + sw, y + 3 * S); ctx.lineTo(x + half, y); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - half + 4 * S, y, half * 2, 3 * S);
    } else if (!['bollard', 'aboard', 'pots', 'signpost'].includes(t.type)) {   // 나머지: 발밑 오른쪽으로 둥근 그림자
      const rx = Math.max(8, t.w * TILE * 0.42) * S, ry = (t.type === 'car' ? 16 : t.type === 'fountain' ? 10 : 5) * S;
      ctx.beginPath(); ctx.ellipse(x + 5 * S, y - (t.type === 'car' ? 15 : t.type === 'fountain' ? 9 : 3) * S, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ----- 물건 그림 (그림 1칸 = 바닥 2픽셀). 종류·색 번호·너비마다 한 번만 그려 저장 -----
// 간판 글씨는 픽셀 폰트(갈무리11). 글꼴이 늦게 오면 받은 뒤 다시 그림
const artCache = new Map();
document.fonts?.load('11px Galmuri11').then(() => artCache.clear()).catch(() => {});
// 계절마다 모습이 바뀌는 물건: 지금 계절(ART_SEASON, 0 봄 ~ 3 겨울, game.js가 정함)별로 그림을 따로 저장
let ART_SEASON = 0;
const SEASONAL = new Set(['pine', 'cherry', 'ginkgo', 'maple']);
function thingArt(t) {
  const key = t.type + t.v + '/' + t.w + (SEASONAL.has(t.type) ? '@' + ART_SEASON + GROUND_LOOK : '');
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
// ===== 계절 나무 그리기 =====
// 칸 격자(col)에 잎·줄기·가지 색을 채운 뒤, 바깥 테두리를 검게 두르고, 마지막에 발밑 떨어진 잎을 흩뿌림
const LEAF = {   // 밝은 → 어두운 5단계
  blossom: ['#fff0f5', '#fcd3e2', '#f5abc8', '#e483a8', '#c45f86'],
  fresh: ['#e2f29a', '#bde474', '#94cc54', '#6fb040', '#518f34'],
  green: ['#c8e05a', '#8cc848', '#4fae3a', '#2f8f34', '#1d6e2c'],
  orange: ['#ffc27a', '#f6913c', '#e0602a', '#bf3f28', '#8c2a20'],
  yellow: ['#fff3a6', '#f7da4a', '#ecbc26', '#cf961a', '#a87414'],
  red: ['#ff9a7a', '#f05a3a', '#d0302a', '#a8221e', '#7a1a18'],
  pine: ['#8cb84e', '#5e9c3c', '#3d8034', '#2a682c', '#1c5024'],
  pineWinter: ['#76a04a', '#4f8838', '#376f32', '#265a2c', '#184420'],
};
// 종류마다: 철마다 잎 색(없으면 잎이 짐), 그림 크기, 머리 모양(그 칸이 잎인지), 줄기 위치, 겨울 가지
const TREE_KINDS = {
  cherry: {
    leaves: ['blossom', 'green', 'orange', null], W: 34, H: 44, trunk: [26, 3],
    crown: (x, y, k) => [[17, 14, 11], [9, 19, 7], [25, 19, 7], [17, 7, 7]].some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < (r * k) ** 2),
    bare: [[17, 26, 17, 12, 3], [16, 22, 8, 14, 2], [18, 21, 26, 13, 2], [8, 14, 4, 10], [8, 14, 10, 8], [26, 13, 30, 9], [26, 13, 23, 7], [17, 12, 14, 4], [17, 12, 21, 4], [12, 18, 6, 19], [22, 17, 28, 18]],
  },
  ginkgo: {
    leaves: ['fresh', 'green', 'yellow', null], W: 24, H: 50, trunk: [34, 2],
    crown: (x, y, k) => ((x - 12) / (9 * k)) ** 2 + ((y - 18) / 17) ** 2 < 1,
    bare: [[12, 36, 12, 4, 2], [12, 26, 7, 12], [12, 22, 17, 9], [12, 30, 6, 22], [12, 28, 18, 19], [7, 12, 6, 6], [17, 9, 18, 4], [12, 16, 9, 8], [12, 14, 15, 7]],
  },
  maple: {
    leaves: ['fresh', 'green', 'red', null], W: 30, H: 42, trunk: [26, 3],
    crown: (x, y, k) => [[15, 12, 9], [8, 17, 6], [22, 16, 7], [15, 20, 8], [10, 9, 5], [21, 9, 5]].some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < (r * k) ** 2),
    bare: [[15, 26, 15, 13, 3], [14, 22, 7, 13, 2], [16, 21, 23, 12, 2], [7, 13, 4, 8], [7, 13, 10, 7], [23, 12, 26, 8], [23, 12, 20, 6], [15, 13, 15, 4], [15, 13, 12, 7]],
  },
  pine: {
    leaves: ['pine', 'pine', 'pine', 'pineWinter'], W: 28, H: 48, trunk: [36, 2],
    crown: (x, y, k) => {   // 세 층 원뿔: 층마다(12줄) 끝으로 갈수록 살짝 넓어지고 맨 아래는 둥글게
      if (y < 1 || y > 35) return false;
      let hw = (0.8 + y * 0.33 + (y % 12 > 8 ? 1 : 0)) * k;
      if (y > 32) hw -= (y - 32) * 1.5;
      return Math.abs(x + 0.5 - 13.5) <= Math.min(12.5, hw);
    },
  },
};
const BARK = ['#c07a3a', '#8a4a20', '#6a2e12'];
function seasonTree(kind, v) {
  const K = TREE_KINDS[kind], { W, H } = K, { c, box } = painter(W, H), season = ART_SEASON;
  const cx = W / 2, size = 0.92 + hash(v, 3, 11) * 0.12;   // 나무마다 크기 조금씩
  const col = Array.from({ length: H }, () => Array(W).fill(null));
  const set = (x, y, color) => { if (y >= 0 && y < H && x >= 0 && x < W) col[y][x] = color; };
  const line = (x0, y0, x1, y1, w = 1) => {   // 가지: 두 점을 칸으로 이음 (w = 굵기, 왼쪽 줄은 밝게)
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
      for (let k = 0; k < w; k++) set(x + k - (w >> 1), y, k === 0 && w > 1 ? BARK[0] : BARK[1]);
    }
  };
  const pal = K.leaves[season] && LEAF[K.leaves[season]];
  if (pal) {   // 잎: 위·왼쪽은 밝고 아래·오른쪽은 어둡게 + 칸마다 얼룩
    const top = K.trunk[0];
    for (let y = 0; y < top + 2; y++) for (let x = 0; x < W; x++) {
      if (!K.crown(x, y, size)) continue;
      const edge = !K.crown(x + 1, y, size) || !K.crown(x - 1, y, size) || !K.crown(x, y - 1, size);
      if (kind !== 'pine' && edge && hash(x, y, v + 21) < 0.35) continue;   // 활엽수는 가장자리를 들쭉날쭉하게 (잎 덩어리처럼)
      const t = 0.35 * (y / top) + 0.35 * (x / W) + 0.35 * hash(x, y, v + 50) + (kind === 'pine' ? 0.25 * ((y % 12) / 12) - 0.1 : 0);
      let color = pal[Math.max(0, Math.min(4, Math.floor(t * 4)))];
      if (season === 0 && kind === 'cherry' && hash(x, y, v + 7) < 0.07) color = LEAF.fresh[2];   // 벚꽃 사이 새잎
      if (season === 2 && kind !== 'pine' && hash(x, y, v + 7) < 0.06) color = pal[4];             // 단풍 사이 짙은 잎
      col[y][x] = color;
    }
    // 소나무: 눈 오는 날·눈 온 다음 날엔 층마다 위쪽 가장자리에 눈이 얹힘
    if (kind === 'pine' && (GROUND_LOOK === 'snow' || GROUND_LOOK === 'melt'))
      for (let y = 1; y < H; y++) for (let x = 0; x < W; x++)
        if (col[y][x] && !col[y - 1][x] && (GROUND_LOOK === 'snow' || hash(x, y, 4) < 0.5)) { col[y][x] = '#f4f7fb'; if (col[y + 1]?.[x] && hash(x, y, 5) < 0.6) col[y + 1][x] = '#dfe7f2'; }
  } else for (const [x0, y0, x1, y1, w] of K.bare) line(x0, y0, x1, y1, w);   // 겨울: 잎 없이 가지만
  // 줄기 + 벌어진 밑동 (줄기 굵기 K.trunk[1])
  for (let y = K.trunk[0]; y < H - 1; y++) {
    const hw = y > H - 5 ? K.trunk[1] + 1 + (y - (H - 5)) : K.trunk[1];
    for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) set(x, y, x < cx - 1 ? BARK[0] : hash(x, y, 9) < 0.2 ? BARK[2] : BARK[1]);
  }
  // 검은 테두리: 그림 바로 바깥 칸
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (col[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => col[y + b]?.[x + a] && col[y + b][x + a] !== 'edge')) col[y][x] = 'edge';
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (col[y][x]) box(x, y, 1, 1, col[y][x] === 'edge' ? '#1d1d1d' : col[y][x]);
  // 발밑에 떨어진 꽃잎(봄 벚나무)·잎(가을, 소나무 빼고): 테두리 없이 땅 위에 흩어짐
  if ((season === 0 && kind === 'cherry') || (season === 2 && kind !== 'pine')) {
    const fall = pal.slice(1, 4);
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(hash(i, v, 33) * (W - 4)) + 2, y = H - 1 - Math.floor(hash(i, v, 34) * 3);
      if (Math.abs(x + 0.5 - cx) < K.trunk[1] + 5) continue;   // 줄기·밑동 자리는 비움
      box(x, y, 1 + (i % 2), 1, fall[i % 3]);
    }
  }
  return c;
}

const ARTS = {
  // 주택(6칸 × 3줄, 키 5.5칸): 굴뚝 / 붉은 기와 박공지붕(기와 줄·용마루) + 흰 처마 띠 /
  // 크림색 나무 판자 벽 + 모서리 기둥 / 양쪽에 덧창 달린 창문(창가 화분) / 가운데 차양 + 현관문 + 처마 밑 등 / 돌 기단·계단
  house() {
    const W = 96, H = 88, { c, box } = painter(W, H);
    const ROOF = '#b5503c', ROOF_DK = '#8f3b2c', ROOF_LT = '#cf6a52', WALL = '#f3e6c8', WALL_DK = '#e2d1ad', WOOD = '#8a5a3b';
    // 굴뚝 (지붕보다 먼저 → 아래쪽은 지붕에 가려짐)
    box(68, 4, 12, 24, INK); box(69, 5, 10, 22, '#a8553f'); box(69, 5, 10, 1, '#c97a5f');
    for (let y = 9; y < 26; y += 4) box(69, y, 10, 1, '#8f3b2c');
    box(66, 2, 16, 4, INK); box(67, 3, 14, 2, '#6b6670');
    // 지붕: 용마루는 좁고 처마는 집 폭 그대로. 기와 줄은 4줄마다, 줄마다 이음새를 엇갈림
    const top = 10, bottom = 42;
    for (let y = top; y < bottom; y++) {
      const inset = Math.round(16 * (1 - (y - top) / (bottom - top - 1))), x0 = inset, w = W - inset * 2;
      box(x0, y, w, 1, INK);
      if (y === top) continue;
      const r = (y - top) % 4;
      box(x0 + 1, y, w - 2, 1, r === 0 ? ROOF_DK : r === 1 ? ROOF_LT : ROOF);
      if (r === 2) for (let x = x0 + 4 + ((y - top) >> 2) % 2 * 4; x < x0 + w - 2; x += 8) box(x, y, 1, 2, ROOF_DK);   // 기와 이음새
      box(x0 + w - 4, y, 3, 1, ROOF_DK);   // 오른쪽 끝 그늘
    }
    box(16, top - 2, W - 32, 3, INK); box(17, top - 1, W - 34, 1, '#5a2a20');   // 용마루
    box(0, bottom, W, 4, INK); box(1, bottom, W - 2, 2, '#f4efe4'); box(1, bottom + 2, W - 2, 1, '#cfc6b4');   // 흰 처마 띠
    // 벽: 나무 판자(4줄마다 그늘 줄) + 양 끝 모서리 기둥 + 처마 그늘
    box(3, 46, W - 6, 35, INK); box(4, 46, W - 8, 34, WALL);
    for (let y = 50; y < 80; y += 4) box(4, y, W - 8, 1, WALL_DK);
    box(4, 46, W - 8, 2, '#d9c8a4');
    box(4, 46, 3, 34, WOOD); box(W - 7, 46, 3, 34, '#6f4a30'); box(W - 10, 48, 3, 32, '#e8d7b4');
    // 창문 두 개(문 양쪽에 대칭): 창틀 + 유리(위 밝게) + 십자 창살 + 초록 덧창 + 창가 화분
    for (const wx of [16, W - 30]) {
      box(wx - 1, 52, 16, 16, INK); box(wx, 53, 14, 14, '#8fc3e6'); box(wx, 53, 14, 4, '#d4ecfa');
      box(wx + 6, 53, 2, 14, '#f4f1ea'); box(wx, 59, 14, 2, '#f4f1ea');
      box(wx - 6, 52, 5, 16, INK); box(wx - 5, 53, 3, 14, '#4f8f5a'); box(wx + 15, 52, 5, 16, INK); box(wx + 16, 53, 3, 14, '#3f7a4a');   // 덧창
      for (let y = 55; y < 66; y += 3) { box(wx - 5, y, 3, 1, '#3f7a4a'); box(wx + 16, y, 3, 1, '#2f6a3a'); }
      box(wx - 2, 68, 18, 4, INK); box(wx - 1, 69, 16, 2, WOOD);   // 화분 상자
      [['#e8454b', 0], ['#f2c94c', 4], ['#f5a3b5', 8], ['#ffffff', 11]].forEach(([col, dx]) => { box(wx + dx, 66, 3, 3, col); box(wx + dx + 1, 68, 1, 1, '#3f8a37'); });
    }
    // 현관: 처마 밑 등 + 차양 + 문(위 작은 창, 판넬, 손잡이)
    box(45, 46, 6, 5, INK); box(46, 47, 4, 3, '#fff1b8');
    box(37, 51, 22, 4, INK); box(38, 51, 20, 2, '#6b7080'); box(38, 53, 20, 1, '#4d5160');
    box(40, 56, 16, 25, INK); box(41, 57, 14, 23, '#9a6b45'); box(41, 57, 14, 1, '#b5824f');
    box(43, 59, 10, 6, INK); box(44, 60, 8, 4, '#f6e3b4');
    box(43, 67, 4, 7, '#86593a'); box(49, 67, 4, 7, '#86593a');
    box(51, 69, 2, 2, '#f2c94c');
    // 돌 기단 + 계단 두 단
    box(2, 80, W - 4, 4, INK); box(3, 80, W - 6, 3, '#b9b2a4'); box(3, 80, W - 6, 1, '#d8d1c3');
    box(37, 81, 22, 4, INK); box(38, 81, 20, 3, '#c9c2b4'); box(38, 81, 20, 1, '#e2dccf');
    box(35, 84, 26, 4, INK); box(36, 84, 24, 3, '#c9c2b4'); box(36, 84, 24, 1, '#e2dccf');
    return c;
  },
  // ===== 집 안 가구 (뒤 벽에 붙은 것은 위로 솟아 벽에 겹쳐 보임) =====
  signpost() {   // 길 안내 표지판: 긴 나무 기둥, 위 가로대와 버팀목, 주황 화살표 판 두 개(← 도시, 안내소 →). 글씨는 큰 픽셀 글꼴
    const W = 46, H = 76, { c, box, center } = painter(W, H);
    const DK = '#5a3020', WOOD = '#9a5a34', LT = '#c07a48';
    box(21, 0, 4, H, DK); box(22, 1, 2, H - 1, WOOD); box(22, 1, 1, H - 1, LT);                // 기둥
    box(7, 4, 32, 4, DK); box(8, 5, 30, 2, WOOD); box(8, 5, 30, 1, LT);                         // 가로대
    for (let i = 0; i < 8; i++) { box(11 + i, 8 + i, 2, 2, DK); box(33 - i, 8 + i, 2, 2, DK); }  // 버팀목
    // 화살표 판: 몸통 + 한쪽 끝이 뾰족함. 테두리 진한 주황, 안쪽 밝게, 윗줄 더 밝게
    const board = (y, x0, x1, left, fill, top, line, text, ink) => {
      for (let r = 0; r < 16; r++) {
        const tip = Math.min(r, 15 - r, 4), a = left ? x0 - tip : x0, b = left ? x1 : x1 + tip;
        box(a, y + r, b - a + 1, 1, line);
        if (r > 0 && r < 15) box(a + 1, y + r, b - a - 1, 1, r === 1 ? top : fill);
      }
      center(text, (x0 + x1) / 2 + 1, y + 3, ink);
    };
    board(18, 6, 41, true, '#f6c070', '#fde0a0', '#b8522a', '도시', '#4a1c0a');
    board(40, 2, 41, false, '#ee9248', '#f8b878', '#a8431a', '안내소', '#3a1406');
    return c;
  },
  // 나무 네 종류 (계절마다 모습이 바뀜, 색 번호 v마다 크기·얼룩이 조금씩 다름)
  //   벚나무(cherry): 넓고 둥근 머리 — 봄 벚꽃, 여름 초록, 가을 주홍 단풍, 겨울 앙상
  //   은행나무(ginkgo): 키 크고 갸름 — 봄 연두, 여름 초록, 가을 샛노랑, 겨울 위로 뻗은 가지만
  //   단풍나무(maple): 몽글몽글 덩어리 — 봄 연두, 여름 초록, 가을 새빨강, 겨울 앙상
  //   소나무(pine): 세 층 원뿔 — 늘푸른나무라 겨울에도 초록, 눈 오는 날엔 층마다 눈이 얹힘
  pine(v) { return seasonTree('pine', v); },
  cherry(v) { return seasonTree('cherry', v); },
  ginkgo(v) { return seasonTree('ginkgo', v); },
  maple(v) { return seasonTree('maple', v); },
  bed() {   // 침대(2칸 × 3줄): 나무 머리판 + 베개 + 체크 이불
    const W = 32, H = 54, { c, box } = painter(W, H);
    box(1, 0, 30, 12, INK); box(2, 1, 28, 10, '#8a5a3b'); box(2, 1, 28, 2, '#a8774f'); box(4, 4, 24, 5, '#7a4e32');   // 머리판
    box(2, 12, 28, 40, INK); box(3, 12, 26, 39, '#f7f3ea');
    box(5, 14, 22, 8, INK); box(6, 15, 20, 6, '#ffffff'); box(6, 19, 20, 2, '#e6e1d6');                               // 베개
    box(3, 24, 26, 27, '#6aa0d8'); box(3, 24, 26, 2, '#9cc4ea');                                                         // 이불
    for (let y = 28; y < 50; y += 6) box(3, y, 26, 2, '#5a8cc4');
    for (let x = 7; x < 29; x += 6) box(x, 26, 2, 25, '#5a8cc4');
    box(26, 24, 3, 27, '#4f7db3');
    box(2, 51, 28, 3, INK); box(3, 51, 26, 2, '#7a4e32');                                                               // 발판
    return c;
  },
  nightstand() {   // 협탁 + 스탠드
    const W = 14, H = 30, { c, box } = painter(W, H);
    box(4, 0, 6, 6, INK); box(5, 1, 4, 4, '#f6e3b4'); box(6, 6, 2, 5, INK);   // 스탠드
    box(0, 11, 14, 19, INK); box(1, 12, 12, 17, '#9a6b45'); box(1, 12, 12, 2, '#b5824f');
    box(2, 16, 10, 5, '#86593a'); box(2, 22, 10, 5, '#86593a'); box(6, 18, 2, 1, '#f2c94c'); box(6, 24, 2, 1, '#f2c94c');
    return c;
  },
  shelf() {   // 책장(2칸): 칸마다 색색 책
    const W = 30, H = 42, { c, box } = painter(W, H);
    box(0, 0, 30, 42, INK); box(1, 1, 28, 40, '#8a5a3b'); box(1, 1, 28, 2, '#a8774f');
    const BOOKS = ['#e8454b', '#3d7fd6', '#f2c94c', '#5dbb4a', '#7b5bd6', '#f2a03d', '#4bb3a0'];
    for (const [i, y] of [[0, 4], [1, 17], [2, 30]].map(([i, y]) => [i, y])) {
      box(3, y, 24, 10, '#5a3a28');
      let x = 4;
      for (let b = 0; x < 25; b++) { const w = 2 + ((b + i) % 3 === 0 ? 1 : 0), h = 8 - ((b * 3 + i) % 3); box(x, y + 10 - h, w, h, BOOKS[(b + i * 2) % 7]); x += w + 1; }
      box(1, y + 10, 28, 2, '#a8774f');
    }
    return c;
  },
  tv() {   // TV(3칸): 낮은 장식장 위 TV
    const W = 44, H = 34, { c, box } = painter(W, H);
    box(6, 0, 32, 20, INK); box(7, 1, 30, 18, '#2a3550'); box(8, 2, 12, 6, '#3d5078'); box(20, 21 - 4, 4, 4, INK);   // 화면 + 받침
    box(0, 20, 44, 14, INK); box(1, 21, 42, 12, '#c98d5a'); box(1, 21, 42, 2, '#d9a070');
    box(3, 25, 18, 6, '#a8703f'); box(23, 25, 18, 6, '#a8703f'); box(11, 27, 2, 1, '#f2c94c'); box(31, 27, 2, 1, '#f2c94c');
    return c;
  },
  ctable() {   // 거실 낮은 탁자 + 찻잔·과일 접시
    const W = 34, H = 16, { c, box } = painter(W, H);
    box(0, 2, 34, 9, INK); box(1, 3, 32, 7, '#a8703f'); box(1, 3, 32, 2, '#c98d5a');
    box(2, 11, 3, 5, INK); box(29, 11, 3, 5, INK);
    box(7, 0, 5, 4, INK); box(8, 1, 3, 2, '#ffffff');                                         // 찻잔
    box(19, 1, 9, 3, INK); box(20, 0, 2, 2, '#e8454b'); box(23, 0, 2, 2, '#f2c94c'); box(25, 1, 2, 2, '#5dbb4a');   // 과일 접시
    return c;
  },
  sofa() {   // 소파(3칸): TV를 보고 있어 등받이가 앞(아래)에 보임
    const W = 46, H = 24, { c, box } = painter(W, H);
    box(0, 0, 46, 24, INK);
    box(1, 1, 6, 22, '#4f8f5a'); box(39, 1, 6, 22, '#3f7a4a'); box(1, 1, 6, 2, '#6aab74');   // 팔걸이
    box(7, 1, 32, 9, '#5d9e68'); box(22, 1, 1, 9, '#4f8f5a');                              // 앉는 쿠션
    box(7, 10, 32, 13, '#4f8f5a'); box(7, 10, 32, 2, '#6aab74');                           // 등받이 (뒤에서 본 모습)
    box(9, 2, 6, 5, '#f2c94c');                                                             // 쿠션 하나
    return c;
  },
  counter() {   // 주방 조리대(3칸): 위 타일 벽 + 싱크대 + 가스레인지 + 아래 수납장
    const W = 48, H = 38, { c, box } = painter(W, H);
    box(0, 0, 48, 14, INK); box(1, 1, 46, 13, '#e6eef2');                                  // 벽 타일
    for (let x = 1; x < 47; x += 6) box(x, 1, 1, 13, '#c9d6dc'); box(1, 7, 46, 1, '#c9d6dc');
    box(30, 2, 12, 3, INK); box(31, 3, 10, 1, '#9a9aa3');                                  // 칼·국자 걸이
    box(33, 5, 1, 5, '#8a8a94'); box(37, 5, 1, 6, '#8a8a94');
    box(0, 14, 48, 24, INK); box(1, 15, 46, 4, '#d8d1c3'); box(1, 15, 46, 1, '#ece6d8');   // 상판
    box(4, 15, 14, 4, '#9aa6b0'); box(5, 16, 12, 2, '#7f8b96'); box(10, 13, 2, 3, '#8a8a94');   // 싱크대 + 수도꼭지
    for (const x of [26, 34]) { box(x, 16, 6, 2, '#2f2b38'); box(x + 2, 16, 2, 1, '#e8454b'); }   // 가스레인지
    box(1, 19, 46, 18, '#e9e4d8'); for (const x of [1, 17, 33]) { box(x, 19, 1, 18, '#c9c2b4'); box(x + 6, 26, 4, 1, '#8a8a94'); }   // 수납장
    return c;
  },
  fridge() {   // 냉장고
    const W = 16, H = 40, { c, box } = painter(W, H);
    box(0, 0, 16, 40, INK); box(1, 1, 14, 38, '#e8eef2'); box(1, 1, 2, 38, '#ffffff'); box(13, 1, 2, 38, '#c9d4dc');
    box(1, 14, 14, 1, INK); box(11, 6, 2, 6, '#8a8a94'); box(11, 18, 2, 10, '#8a8a94');
    box(4, 20, 3, 3, '#e8454b'); box(6, 26, 3, 3, '#f2c94c');   // 자석
    return c;
  },
  dtable() {   // 식탁(4칸) + 의자 네 개 (뒤 두 개는 식탁에 반쯤 가려짐)
    const W = 56, H = 30, { c, box } = painter(W, H);
    const chair = (x, y) => { box(x, y, 12, 10, INK); box(x + 1, y + 1, 10, 8, '#b5824f'); box(x + 1, y + 1, 10, 2, '#c99a62'); };
    chair(10, 0); chair(34, 0);
    box(2, 6, 52, 14, INK); box(3, 7, 50, 12, '#c98d5a'); box(3, 7, 50, 2, '#d9a070');
    box(20, 8, 16, 9, '#f7f3ea'); box(25, 10, 6, 5, INK); box(26, 11, 4, 3, '#e8454b');     // 식탁보 + 그릇
    box(4, 20, 3, 6, INK); box(49, 20, 3, 6, INK);
    chair(10, 20); chair(34, 20);
    return c;
  },
  plant(v) {   // 큰 화분
    const W = 16, H = 30, { c, box } = painter(W, H), leaf = v ? '#4bb3a0' : '#5dbb4a', dk = v ? '#3a8f80' : '#3f8a37';
    box(3, 0, 10, 20, INK); box(4, 1, 8, 18, leaf); box(1, 6, 14, 10, INK); box(2, 7, 12, 8, leaf);
    box(5, 2, 2, 6, dk); box(9, 4, 2, 8, dk); box(3, 9, 3, 2, dk); box(11, 10, 3, 2, dk); box(6, 1, 2, 2, '#9ad97a');
    box(3, 18, 10, 12, INK); box(4, 19, 8, 10, '#d9774a'); box(4, 19, 8, 2, '#e8945e'); box(10, 21, 2, 8, '#b85f38');
    return c;
  },
  // ===== 벽에 거는 것 =====
  wwin() {   // 창문(2칸) + 커튼
    const W = 32, H = 30, { c, box } = painter(W, H);
    box(2, 0, 28, 2, '#8a5a3b');                                                             // 커튼 봉
    box(5, 3, 22, 22, INK); box(6, 4, 20, 20, '#9fd0ee'); box(6, 4, 20, 6, '#d4ecfa');
    box(8, 14, 6, 3, '#ffffff'); box(17, 8, 7, 3, '#ffffff');                                 // 구름
    box(15, 4, 2, 20, '#f4f1ea'); box(6, 13, 20, 2, '#f4f1ea');
    box(3, 25, 26, 3, INK); box(4, 25, 24, 2, '#f4f1ea');                                     // 창턱
    for (const x of [1, 25]) { box(x, 2, 6, 24, INK); box(x + 1, 2, 4, 23, '#e8a0a8'); box(x + 2, 2, 1, 23, '#d4848e'); }   // 커튼
    return c;
  },
  frame() {   // 액자: 산과 해 그림
    const W = 14, H = 12, { c, box } = painter(W, H);
    box(0, 0, 14, 12, INK); box(1, 1, 12, 10, '#c99a62'); box(2, 2, 10, 8, '#bfe3f5');
    box(9, 3, 2, 2, '#f2c94c'); box(2, 7, 10, 3, '#5dbb4a'); box(4, 5, 3, 2, '#5dbb4a'); box(5, 4, 1, 1, '#5dbb4a');
    return c;
  },
  clock() {   // 벽시계: 둥근 판 + 12·3·6·9시 눈금 (바늘은 게임 시간에 맞춰 game.js가 그림)
    const W = 11, H = 11, { c, box } = painter(W, H);
    box(3, 0, 5, 11, INK); box(0, 3, 11, 5, INK); box(1, 1, 9, 9, INK);
    box(3, 1, 5, 9, '#ffffff'); box(1, 3, 9, 5, '#ffffff'); box(2, 2, 7, 7, '#ffffff');
    box(5, 1, 1, 1, '#9a9aa3'); box(9, 5, 1, 1, '#9a9aa3'); box(5, 9, 1, 1, '#9a9aa3'); box(1, 5, 1, 1, '#9a9aa3');
    return c;
  },
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
  lotsign(v) {   // 부지 이름표: 노란 안내판(위에 검정 줄무늬 띠) + 나무 다리 두 개, 가운데 큰 글씨로 들어설 곳 이름
    const W = 56, H = 30, { c, box, center } = painter(W, H);
    for (const x of [10, 43]) { box(x, 16, 3, 14, INK); box(x + 1, 16, 1, 14, '#8a5a3b'); }
    box(0, 0, W, 19, INK); box(1, 1, W - 2, 17, '#f6d32b'); box(1, 17, W - 2, 1, '#d9a91c');
    for (let x = 1; x < W - 1; x += 6) box(x, 1, 3, 3, INK);
    center(LOT_NAMES[v] || '', W / 2, 6, '#2f2b38');
    return c;
  },
  bench() {   // 공원 벤치(2칸): 회색 쇠기둥 두 개에 나무 등받이 두 줄, 앞으로 넓은 앉는 판, 쇠다리. 검은 테두리
    const W = 32, H = 26, { c, box } = painter(W, H);
    const K = '#141414', G = '#5b6470', GL = '#8a96a2', W1 = '#9a5a22', WL = '#c98a3a', WD = '#5e3412';
    for (const x of [6, 22]) { box(x, 0, 4, 15, K); box(x + 1, 1, 2, 14, G); box(x + 1, 1, 1, 14, GL); }   // 등받이 기둥
    for (const y of [3, 8]) { box(1, y, 30, 4, K); box(2, y + 1, 28, 2, W1); box(2, y + 1, 28, 1, WL); box(7, y + 1, 2, 2, WD); box(23, y + 1, 2, 2, WD); }   // 등받이 판
    box(3, 13, 26, 1, K); box(1, 14, 30, 1, K); box(0, 15, 32, 4, K);                              // 앉는 판 테두리
    box(4, 14, 24, 1, WL); box(1, 15, 30, 1, WL); box(1, 16, 30, 1, W1); box(1, 17, 30, 1, WD);
    for (const x of [5, 23]) { box(x, 19, 4, 7, K); box(x + 1, 19, 2, 6, G); box(x + 1, 19, 1, 6, GL); }   // 다리
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
