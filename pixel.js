'use strict';

// ===== 2D 픽셀 그래픽: 스프라이트는 문자 격자, 한 글자 = 한 픽셀 ('.' = 투명) =====
const PAL = {
  k: '#1b1b2f', r: '#c8553d', R: '#2f4f8f', w: '#ffffff', b: '#3b82f6', y: '#f7c948',
  o: '#f08a24', g: '#22a35a', u: '#e03e3e', p: '#4b3a6b', a: '#9aa3b5', c: '#bfe3ff', e: '#1b1b2f',
};

// 캐릭터 몸 색 (고양이 옆 색 발판에서 바꿈). e = 눈·입 (검은 몸일 때는 흰색)
const BODY = {
  red: { r: '#d94141' }, blue: { r: '#3b6fd9' }, yellow: { r: '#f2c230' },
  white: { r: '#f4f4f4' }, black: { r: '#33333d', e: '#ffffff' },
};
const BODY_NAME = { red: '빨간색', blue: '파란색', yellow: '노란색', white: '흰색', black: '검은색' };

// 정장 입은 개미 (16×16). 6~9행 얼굴만 기분에 따라 바뀜
const ANT_TOP = ['...k........k...', '....k......k....', '.....k....k.....', '....kkkkkkkk....', '...krrrrrrrrk...', '..krrrrrrrrrrk..'];
const ANT_BOTTOM = ['...krrrrrrrrk...', '....kkkkkkkk....', '...kkRRwwRRkk...', '..kRRRRwbwRRRk..', '..kRRRRwbwRRRk..', '...kkkkkkkkkk...'];
const ANT_FACES = {
  normal: ['..krrwkrrwkrrk..', '..krrkkrrkkrrk..', '..krrrrkkrrrrk..', '..krrrrrrrrrrk..'],
  happy:  ['..krrkkrrkkrrk..', '..krkrrkkrrkrk..', '..krrkrrrrkrrk..', '..krrrkkkkrrrk..'],
  sad:    ['..krrkkrrkkrrk..', '..krrkkrrkkrrk..', '..krrbkkkkrrrk..', '..krrkrrrrkrrk..'],
  shock:  ['..krkkrrrrkkrk..', '..krkkrrrrkkrk..', '..krrrrkkrrrrk..', '..krrrrkkrrrrk..'],
  sleep:  ['..krrrrrrrrrrk..', '..krkkkrrkkkrk..', '..krrrrkkrrrrk..', '..krrrrrrrrrrk..'],
};
for (const m in ANT_FACES) ANT_FACES[m] = ANT_FACES[m].map(row => row.slice(0, 3) + row.slice(3, 13).replace(/k/g, 'e') + row.slice(13));
const antRows = mood => [...ANT_TOP, ...ANT_FACES[mood], ...ANT_BOTTOM];

// 8×8 아이콘 (종목·뉴스)
const ICONS = {
  tech:   ['.k.kk.k.', 'kkkkkkkk', '.kbbbbk.', 'kkbyybkk', '.kbyybk.', 'kkbbbbkk', '.kkkkkk.', '.k.kk.k.'],
  food:   ['..w.w...', '...w.w..', '.wwwwww.', 'wwwwwwww', 'kooooook', '.kooook.', '..kkkk..', '........'],
  energy: ['...kk...', '..kppk..', '..kppk..', '.kppppk.', 'kppwpppk', 'kppwpppk', '.kppppk.', '..kkkk..'],
  bank:   ['...kk...', '..kyyk..', '.kyyyyk.', 'kkkkkkkk', '.a.aa.a.', '.a.aa.a.', '.a.aa.a.', 'kkkkkkkk'],
  up:     ['...uu...', '..uuuu..', '.uuuuuu.', 'uuuuuuuu', '..uuuu..', '..uuuu..', '..uuuu..', '..uuuu..'],
  cloud:  ['..aaa...', '.aaaaaa.', 'aaaaaaaa', 'aaaaaaaa', '........', '.b..b..b', 'b..b..b.', '........'],
  coin:   ['..kkkk..', '.kyyyyk.', 'kyoooyyk', 'kyoyyyyk', 'kyyyoyyk', 'kyoooyyk', '.kyyyyk.', '..kkkk..'],
  rumor:  ['.cccccc.', 'cckkkccc', 'cccckccc', 'ccckcccc', 'cccccccc', '.cckccc.', '.cc.....', 'c.......'],
  fire:   ['...o....', '..oo..o.', '..ooo.o.', '.ooyoooo', '.oyyyoo.', 'ooyyyyoo', '.oyyyyo.', '..oooo..'],
  crash:  ['..bbbb..', '..bbbb..', '..bbbb..', '..bbbb..', 'bbbbbbbb', '.bbbbbb.', '..bbbb..', '...bb...'],
  pill:   ['........', '........', '.kkkkkk.', 'kuuukwwk', 'kuuukwwk', '.kkkkkk.', '........', '........'],
  car:    ['........', '..kkkk..', '.kbbbbk.', 'kbcbbcbk', 'kbbbbbbk', 'kkkkkkkk', '.kk..kk.', '........'],
  bag:    ['..kkkk..', '..k..k..', '.kkkkkk.', '.kyyyyk.', '.kyoyyk.', '.kyyyyk.', '.kyyyyk.', '.kkkkkk.'],
  sun:    ['...y....', '.y.y.y..', '..yyy...', 'yyyyyyy.', '..yyy...', '.y.y.y..', '...y....', '........'],
  rain:   ['..aaa...', '.aaaaaa.', 'aaaaaaaa', '........', '.b..b...', 'b..b..b.', '..b..b..', '.b..b...'],
  snow:   ['...c....', '.c.c.c..', '..ccc...', 'ccccccc.', '..ccc...', '.c.c.c..', '...c....', '........'],
  storm:  ['..pppp..', '.pppppp.', 'pppppppp', '...yy...', '..yy....', '.yyyy...', '...yy...', '..y.....'],
  star:   ['...yy...', '...yy...', 'yyyyyyyy', '.yyyyyy.', '..yyyy..', '.yy..yy.', 'yy....yy', '........'],
  doc:    ['.kkkkk..', '.kwwwkk.', '.kwkkwk.', '.kwwwwk.', '.kwkkwk.', '.kwwwwk.', '.kkkkkk.', '........'],
  warn:   ['..uuuu..', '.uuuuuu.', 'uuuuuuuu', 'uwwwwwwu', 'uwwwwwwu', 'uuuuuuuu', '.uuuuuu.', '..uuuu..'],
};
// 날씨 사건 아이콘
Object.assign(ICONS, { w_heat: ICONS.sun, w_cold: ICONS.snow, w_downpour: ICONS.rain, w_typhoon: ICONS.storm, w_dust: ICONS.cloud });

// 3×5 픽셀 숫자
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];

function drawRows(ctx, rows, x, y, over) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '.') continue;
      ctx.fillStyle = over?.[row[i]] ?? PAL[row[i]];
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  });
}

function drawNum(ctx, n, x, y, color) {
  ctx.fillStyle = color;
  String(n).split('').forEach((d, k) => {
    const bits = DIGITS[d];
    for (let p = 0; p < 15; p++) if (bits[p] === '1') ctx.fillRect(x + k * 4 + p % 3, y + Math.floor(p / 3), 1, 1);
  });
}

// <img>에 쓰도록 스프라이트를 1배 크기 PNG로 만들어 캐시 (확대는 CSS pixelated)
const urlCache = new Map();
function spriteURL(key, rows) {
  if (!urlCache.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = rows[0].length; cv.height = rows.length;
    drawRows(cv.getContext('2d'), rows, 0, 0);
    urlCache.set(key, cv.toDataURL());
  }
  return urlCache.get(key);
}
const antURL = (mood, body = 'red') => {
  const key = 'ant-' + mood + '-' + body;
  if (!urlCache.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 16;
    drawRows(cv.getContext('2d'), antRows(mood), 0, 0, BODY[body]);
    urlCache.set(key, cv.toDataURL());
  }
  return urlCache.get(key);
};
const iconURL = name => spriteURL('icon-' + name, ICONS[name]);

// ===== 위에서 내려다본 사무실 (320×176, 1칸 = 16px) =====
const ROOM_W = 320, ROOM_H = 176, FLOOR_TOP = 32;
const DOOR = [104, 144]; // 칸막이 벽의 문 구간 (y)
const WALLS = [[116, 0, 8, DOOR[0]], [116, DOOR[1], 8, ROOM_H - DOOR[1]], [212, 0, 8, DOOR[0]], [212, DOOR[1], 8, ROOM_H - DOOR[1]]]
  .map(([x, y, w, h]) => ({ x, y, w, h }));
const C = {
  k: '#2b1d14', wood: '#8b5a2b', woodD: '#5a331b', woodL: '#b07a46', floorA: '#f3e3b8', floorB: '#e6d29e',
  wallA: '#e9d8a6', wallB: '#dcc690', brick: '#b5653a', mortar: '#93492a', rug: '#d8c38a', rugB: '#b39a5a',
  leaf: '#4f9a3f', leafD: '#2f6b2a', pot: '#c0673a', cream: '#f2e6c8',
};
const SKY = {
  sunny: ['#7ec8f0', '#a8dcf5'], cloudy: ['#9fb3c8', '#c3d0dd'], rain: ['#6f8297', '#8fa1b3'], downpour: ['#4b5a6b', '#66778a'],
  heat: ['#f59f45', '#f7c97a'], typhoon: ['#2f3a4a', '#4a5566'], snow: ['#c9d6e3', '#e3ebf3'], cold: ['#a9c4dc', '#d6e4f0'],
  dust: ['#c9b27a', '#ddc896'], crash: ['#c0392b', '#e06650'],
};

function R(ctx, c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function box(ctx, c, x, y, w, h) { R(ctx, C.k, x, y, w, h); R(ctx, c, x + 1, y + 1, w - 2, h - 2); }

function drawBookshelf(ctx, f) {
  box(ctx, C.wood, f.x, f.y, f.w, f.h);
  const colors = ['#c8553d', '#3b82f6', '#22a35a', '#f7c948', '#8a76b8', '#e08a3c'];
  for (let s = 0; s < 3; s++) {
    const base = f.y + 12 + s * 11;
    R(ctx, C.woodD, f.x + 2, base, f.w - 4, 2);
    for (let bx = f.x + 3, i = s * 5; bx < f.x + f.w - 4; bx += 4, i++) { const bh = 6 + (i * 7) % 3; R(ctx, colors[i % 6], bx, base - bh, 3, bh); }
  }
}
function drawCalendar(ctx, f, v) {
  box(ctx, '#ffffff', f.x, f.y, f.w, f.h);
  R(ctx, PAL.u, f.x + 1, f.y + 1, f.w - 2, 4);
  drawNum(ctx, v.day, f.x + Math.round((f.w - (String(v.day).length * 4 - 1)) / 2), f.y + 8, PAL.k);
}
// 창밖 = 오늘 날씨. anim: 비·눈이 내리는 정도 (움직임 줄이기면 0)
function drawWindow(ctx, f, v) {
  box(ctx, C.woodL, f.x, f.y, f.w, f.h);
  const w = v.weather, sky = SKY[v.flash ? 'crash' : w] || SKY.sunny, ix = f.x + 2, iy = f.y + 2, iw = f.w - 4, ih = f.h - 4;
  R(ctx, sky[0], ix, iy, iw, ih / 2); R(ctx, sky[1], ix, iy + ih / 2, iw, ih / 2);
  if (w === 'sunny' || w === 'heat' || w === 'cold') {
    const sz = w === 'heat' ? 6 : 5;
    R(ctx, w === 'heat' ? '#ff7a1a' : '#ffd23f', ix + (v.day * 3) % (iw - 6), iy + 3, sz, sz);
  }
  if (['cloudy', 'rain', 'downpour', 'typhoon', 'snow'].includes(w)) {
    const cc = w === 'typhoon' || w === 'downpour' ? '#3a4352' : '#e6ebf1';
    R(ctx, cc, ix + 2, iy + 2, 10, 4); R(ctx, cc, ix + 5, iy + 1, 6, 2); R(ctx, cc, ix + 16, iy + 4, 10, 3);
  }
  const drops = { rain: [PAL.c, 5], downpour: ['#9ec5ff', 3], typhoon: ['#9ec5ff', 2], snow: ['#ffffff', 5], cold: ['#ffffff', 7], dust: ['#a8925c', 4] }[w];
  if (drops) {
    const [col, gap] = drops, heavy = w === 'downpour' || w === 'typhoon';
    for (let x = 0; x < iw; x += gap) {
      const y = (x * 7 + v.anim * (w === 'typhoon' ? 2 : 1)) % (ih - 1);
      R(ctx, col, ix + (w === 'typhoon' ? (x + y) % iw : x), iy + y, 1, heavy ? 2 : 1);
    }
  }
  R(ctx, C.woodL, f.x + f.w / 2 - 1, f.y, 2, f.h); R(ctx, C.woodL, f.x, f.y + f.h / 2 - 1, f.w, 2);
}
function drawPlant(ctx, f) {
  const cx = f.x + f.w / 2;
  box(ctx, C.pot, f.x + 2, f.y + f.h - 8, f.w - 4, 8);
  R(ctx, C.leafD, cx - 6, f.y + 2, 12, 10);
  R(ctx, C.leaf, cx - 5, f.y, 4, 8); R(ctx, C.leaf, cx + 1, f.y + 1, 5, 7);
  R(ctx, C.leaf, cx - 7, f.y + 5, 4, 5); R(ctx, C.leaf, cx + 4, f.y + 6, 4, 5);
}
function drawRug(ctx, f) {
  R(ctx, C.rugB, f.x, f.y, f.w, f.h); R(ctx, C.rug, f.x + 2, f.y + 2, f.w - 4, f.h - 4);
  R(ctx, C.rugB, f.x + 5, f.y + 5, f.w - 10, 1); R(ctx, C.rugB, f.x + 5, f.y + f.h - 6, f.w - 10, 1);
}
// 책상 위 모니터에 선택한 종목의 최근 주가
function drawDesk(ctx, f, v) {
  R(ctx, C.woodD, f.x + 2, f.y + 10, 3, f.h - 10); R(ctx, C.woodD, f.x + f.w - 5, f.y + 10, 3, f.h - 10);
  box(ctx, C.wood, f.x, f.y + 4, f.w, 8); R(ctx, C.woodL, f.x + 1, f.y + 5, f.w - 2, 1);
  const mx = f.x + 14, my = f.y - 12;
  box(ctx, '#d9dde6', mx, my, 22, 15); R(ctx, '#0f1b2d', mx + 2, my + 2, 18, 10); R(ctx, '#9aa3b5', mx + 9, my + 15, 4, 2);
  const h = v.hist.slice(-18);
  if (h.length > 1) {
    const lo = Math.min(...h), sp = Math.max(...h) - lo || 1, col = h[h.length - 1] >= h[0] ? '#ff5c5c' : '#5c9dff';
    h.forEach((p, i) => R(ctx, col, mx + 2 + i, my + 11 - Math.round((p - lo) / sp * 8), 1, 1));
  }
  R(ctx, '#3a3f4b', mx + 3, f.y + 6, 16, 3); box(ctx, '#ffffff', f.x + 40, f.y + 3, 5, 5);
}
function drawCatBed(ctx, f) {
  box(ctx, '#c9a46b', f.x, f.y + 4, f.w, f.h - 4); R(ctx, '#e8d3a8', f.x + 3, f.y + 7, f.w - 6, f.h - 10);
  const cx = f.x + 7, cy = f.y + 7;
  R(ctx, '#f3ead8', cx, cy + 2, 12, 7); R(ctx, '#5a3b2a', cx + 9, cy, 6, 6);
  R(ctx, '#5a3b2a', cx + 9, cy - 2, 2, 2); R(ctx, '#5a3b2a', cx + 13, cy - 2, 2, 2); R(ctx, '#5a3b2a', cx - 2, cy + 6, 4, 2);
  R(ctx, PAL.b, cx + 10, cy + 2, 1, 1); R(ctx, PAL.b, cx + 13, cy + 2, 1, 1);
}
function drawChalkboard(ctx, f) {
  box(ctx, C.woodL, f.x, f.y, f.w, f.h); R(ctx, '#2f5d3a', f.x + 2, f.y + 2, f.w - 4, f.h - 5);
  for (let i = 0; i < 4; i++) R(ctx, '#dfe9df', f.x + 5, f.y + 5 + i * 4, 8 + (i * 9) % 14, 1);
}
// 읽지 않은 뉴스가 있으면 TV 위에 ! 말풍선
function drawTV(ctx, f, v) {
  box(ctx, C.wood, f.x, f.y + f.h - 10, f.w, 10);
  box(ctx, '#2a2a35', f.x + 2, f.y, f.w - 4, f.h - 10); R(ctx, '#1e3a5f', f.x + 4, f.y + 2, f.w - 8, f.h - 14);
  R(ctx, PAL.u, f.x + 4, f.y + f.h - 16, f.w - 8, 3);
  R(ctx, '#ffffff', f.x + 6, f.y + 5, 10, 1); R(ctx, '#ffffff', f.x + 6, f.y + 8, 16, 1); R(ctx, '#9ec5ff', f.x + 6, f.y + 11, 12, 1);
  if (v.unread) {
    const bx = f.x + f.w - 10, by = f.y - 11 - (v.blink ? 1 : 0);
    box(ctx, '#ffffff', bx, by, 9, 10); R(ctx, PAL.u, bx + 4, by + 2, 1, 4); R(ctx, PAL.u, bx + 4, by + 7, 1, 1);
  }
}
function drawTable(ctx, f) {
  R(ctx, C.woodD, f.x + 2, f.y + 8, 2, f.h - 8); R(ctx, C.woodD, f.x + f.w - 4, f.y + 8, 2, f.h - 8);
  box(ctx, C.wood, f.x, f.y, f.w, 9); box(ctx, '#ffffff', f.x + 6, f.y + 2, 5, 5); R(ctx, '#6b3f22', f.x + 7, f.y + 3, 3, 2);
  box(ctx, PAL.y, f.x + 16, f.y + 3, 8, 4);
}
function drawArmchair(ctx, f) {
  box(ctx, '#d9c9a3', f.x, f.y, f.w, f.h); R(ctx, C.cream, f.x + 3, f.y + 3, f.w - 6, f.h - 6); R(ctx, '#d9c9a3', f.x + 3, f.y + f.h - 8, f.w - 6, 1);
}
function drawCabinet(ctx, f) {
  box(ctx, '#9aa3b5', f.x, f.y, f.w, f.h);
  for (let i = 0; i < 3; i++) { const dy = f.y + 3 + i * 10; box(ctx, '#b8c0cf', f.x + 3, dy, f.w - 6, 9); R(ctx, PAL.k, f.x + f.w / 2 - 3, dy + 4, 6, 1); }
}
function drawBed(ctx, f, v) {
  box(ctx, C.wood, f.x, f.y, f.w, f.h); box(ctx, '#ffffff', f.x + 3, f.y + 3, f.w - 6, 12);
  box(ctx, '#e9d8b0', f.x + 2, f.y + 16, f.w - 4, f.h - 18);
  for (let i = 0; i < 3; i++) R(ctx, '#d6c08f', f.x + 4, f.y + 22 + i * 10, f.w - 8, 1);
  if (v.sleeping) { // Zz
    const zx = f.x + f.w - 12, zy = f.y - 10;
    ['1111', '0010', '0100', '1111'].forEach((row, j) => [...row].forEach((b, i) => b === '1' && R(ctx, '#3b2f6b', zx + i, zy + j, 1, 1)));
  }
}
function drawPad(ctx, f, v) {
  box(ctx, '#6b4226', f.x, f.y, f.w, f.h);
  R(ctx, BODY[f.color].r, f.x + 2, f.y + 2, f.w - 4, f.h - 4);
  if (v.myColor === f.color) R(ctx, '#ffd23f', f.x + 4, f.y + 4, f.w - 8, f.h - 8);
}
function drawLamp(ctx, f) {
  box(ctx, C.wood, f.x, f.y + 6, f.w, f.h - 6); R(ctx, C.woodD, f.x + 6, f.y + 2, 2, 5); box(ctx, '#f7e3a1', f.x + 3, f.y - 4, 8, 7);
}

// act: Space로 할 일, solid: 지나갈 수 없음, floor: 바닥에 깔림(항상 먼저 그림)
const FURN = [
  { id: 'rug1', x: 14, y: 58, w: 80, h: 50, floor: true, draw: drawRug },
  { id: 'rug2', x: 134, y: 70, w: 70, h: 52, floor: true, draw: drawRug },
  { id: 'bookshelf', x: 6, y: 6, w: 30, h: 38, solid: true, act: 'glossary', label: '📚 책장 — 주식 용어 사전', draw: drawBookshelf },
  { id: 'calendar', x: 42, y: 8, w: 16, h: 16, draw: drawCalendar },
  { id: 'window1', x: 66, y: 6, w: 34, h: 20, draw: drawWindow },
  { id: 'plant1', x: 100, y: 30, w: 14, h: 20, solid: true, draw: drawPlant },
  { id: 'desk', x: 26, y: 64, w: 50, h: 20, solid: true, act: 'trade', label: '💻 컴퓨터 켜기 (증권 HTS: 시세·차트·호가·주문) · 여기서 B/S로 1주 바로 거래', draw: drawDesk },
  { id: 'catbed', x: 6, y: 140, w: 28, h: 20, solid: true, draw: drawCatBed },
  ...['red', 'blue', 'yellow', 'white', 'black'].map((color, i) => ({
    id: 'pad-' + color, color, x: 42 + i * 14, y: 152, w: 12, h: 12, floor: true, act: 'color',
    label: '🎨 ' + BODY_NAME[color] + ' 발판 — 캐릭터를 ' + BODY_NAME[color] + '으로 바꾸기', draw: drawPad,
  })),
  { id: 'chalkboard', x: 130, y: 5, w: 34, h: 24, act: 'rules', label: '🧑‍🏫 칠판 — 게임 규칙', draw: drawChalkboard },
  { id: 'tv', x: 170, y: 14, w: 36, h: 30, solid: true, act: 'news', label: '📺 뉴스 TV — 배우기 읽기', draw: drawTV },
  { id: 'table', x: 152, y: 86, w: 28, h: 14, solid: true, draw: drawTable },
  { id: 'armchair', x: 186, y: 64, w: 20, h: 20, solid: true, draw: drawArmchair },
  { id: 'plant2', x: 128, y: 150, w: 14, h: 20, solid: true, draw: drawPlant },
  { id: 'window2', x: 234, y: 6, w: 34, h: 20, draw: drawWindow },
  { id: 'plant3', x: 224, y: 30, w: 14, h: 20, solid: true, draw: drawPlant },
  { id: 'cabinet', x: 288, y: 12, w: 28, h: 34, solid: true, act: 'records', label: '🗂 캐비닛 — 플레이 기록', draw: drawCabinet },
  { id: 'lamp', x: 250, y: 118, w: 14, h: 16, solid: true, draw: drawLamp },
  { id: 'bed', x: 268, y: 112, w: 48, h: 60, solid: true, draw: drawBed },
];
const SOLIDS = [...WALLS, ...FURN.filter(f => f.solid)];

// 발 위치(x, y) 기준 10×4 충돌 상자
function blocked(x, y) {
  const l = x - 5, r = x + 5, t = y - 4, b = y;
  if (l < 0 || r > ROOM_W || t < FLOOR_TOP || b > ROOM_H) return true;
  return SOLIDS.some(s => l < s.x + s.w && r > s.x && t < s.y + s.h && b > s.y);
}

function nearestObject(x, y) {
  let best = null, bd = 14;
  for (const f of FURN) {
    if (!f.act) continue;
    const dx = Math.max(f.x - x, 0, x - (f.x + f.w)), dy = Math.max(f.y - (y - 4), 0, (y - 4) - (f.y + f.h));
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function drawRoomBase(ctx) {
  for (let y = FLOOR_TOP; y < ROOM_H; y += 8) for (let x = 0; x < ROOM_W; x += 8) R(ctx, ((x + y) / 8) % 2 ? C.floorA : C.floorB, x, y, 8, 8);
  R(ctx, C.mortar, 0, 0, 116, FLOOR_TOP);
  for (let y = 0; y < FLOOR_TOP - 4; y += 5) for (let x = (y / 5) % 2 ? -6 : 0; x < 116; x += 12) R(ctx, C.brick, x + 1, y + 1, 10, 4);
  R(ctx, C.wallA, 124, 0, 88, FLOOR_TOP);
  for (let x = 124; x < 212; x += 6) R(ctx, C.wallB, x, 0, 2, FLOOR_TOP - 4);
  R(ctx, '#cfe0c8', 220, 0, 100, FLOOR_TOP);
  for (let x = 220; x < 320; x += 6) R(ctx, '#bcd3b3', x, 0, 2, FLOOR_TOP - 4);
  R(ctx, C.woodD, 0, FLOOR_TOP - 4, ROOM_W, 4); R(ctx, C.woodL, 0, FLOOR_TOP - 4, ROOM_W, 1);
  for (const w of WALLS) { R(ctx, C.woodD, w.x, w.y, w.w, w.h); R(ctx, C.wood, w.x + 1, w.y, w.w - 2, w.h); }
}

function drawAnt(ctx, a) {
  R(ctx, 'rgba(0,0,0,0.2)', Math.round(a.x) - 6, Math.round(a.y) - 2, 12, 3);
  drawRows(ctx, antRows(a.mood), Math.round(a.x) - 8, Math.round(a.y) - 16 - (a.bob ? 1 : 0), BODY[a.color] || BODY.red);
}

function drawHighlight(ctx, f, up) {
  ctx.fillStyle = '#ffd23f';
  for (let x = f.x - 1; x < f.x + f.w + 1; x += 3) { ctx.fillRect(x, f.y - 2, 2, 1); ctx.fillRect(x, f.y + f.h + 1, 2, 1); }
  for (let y = f.y - 1; y < f.y + f.h + 1; y += 3) { ctx.fillRect(f.x - 2, y, 1, 2); ctx.fillRect(f.x + f.w + 1, y, 1, 2); }
  const cx = Math.round(f.x + f.w / 2), ay = Math.max(1, f.y - 8) - (up ? 1 : 0);
  R(ctx, '#ffd23f', cx - 2, ay, 5, 1); R(ctx, '#ffd23f', cx - 1, ay + 1, 3, 1); R(ctx, '#ffd23f', cx, ay + 2, 1, 1);
}

// v: { day, weather, anim, flash, hist, unread, blink, near, myColor, ants: [{ x, y, mood, bob, color }] }
function drawRoom(ctx, v) {
  drawRoomBase(ctx);
  FURN.filter(f => f.floor).forEach(f => f.draw(ctx, f, v));
  const items = FURN.filter(f => !f.floor).map(f => ({ z: f.y + f.h, d: () => f.draw(ctx, f, v) }));
  for (const a of v.ants) items.push({ z: a.y, d: () => drawAnt(ctx, a) });
  items.sort((a, b) => a.z - b.z).forEach(it => it.d());
  if (v.near) drawHighlight(ctx, v.near, v.blink);
}

// ===== 픽셀 캔들 차트 (300×90): 빨강 = 상승, 파랑 = 하락 =====
function drawPixelChart(ctx, hist, avg, maxDay) {
  ctx.fillStyle = '#0f1b2d'; ctx.fillRect(0, 0, 300, 90);
  ctx.fillStyle = '#1f3350';
  for (let gy = 4; gy < 90; gy += 16) for (let gx = 0; gx < 300; gx += 3) ctx.fillRect(gx, gy, 1, 1);
  let min = Math.min(...hist, avg ?? Infinity), max = Math.max(...hist, avg ?? -Infinity);
  const pad = (max - min) * 0.1 || hist[hist.length - 1] * 0.05;
  min -= pad; max += pad;
  const y = val => Math.round(4 + (1 - (val - min) / (max - min)) * 82);
  const step = 290 / maxDay;
  let lastX = 4;
  hist.forEach((c, i) => {
    const o = i ? hist[i - 1] : c, x = Math.round(4 + i * step);
    const y1 = y(Math.max(o, c)), y2 = y(Math.min(o, c));
    ctx.fillStyle = c > o ? '#ff5c5c' : c < o ? '#5c9dff' : '#cfd6e4';
    ctx.fillRect(x, y1, 3, Math.max(1, y2 - y1 + 1));
    lastX = x;
  });
  if (avg) { ctx.fillStyle = '#f7a531'; for (let x = 0; x < 300; x += 4) ctx.fillRect(x, y(avg), 2, 1); }
  const ly = y(hist[hist.length - 1]);
  ctx.fillStyle = PAL.w; ctx.fillRect(lastX + 5, ly - 1, 1, 3); ctx.fillRect(lastX + 4, ly, 1, 1);
}
