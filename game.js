'use strict';
// 기본 게임 화면: 마을(길·나무·집)을 픽셀 캐릭터가 8방향으로 걸어 다니고, 화면(카메라)이 따라감.
// 캐릭터 그림은 sprites.js, 마을 배치·그림은 town.js. 여기서는 겹쳐 그리기·이동·부딪힘·앞뒤 순서만 함
{
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const SPEED = 240;                      // 화면에서 1초에 걷는 거리(px)
// 위치는 마을 픽셀 좌표(왼쪽 위 = 0, 0). 발밑 자리
const me = { name: '', x: MAP_W / 2, y: MAP_H / 2, look: DEFAULT_LOOK, dir: 'se', left: false, moving: false };   // dir: 보는 방향(sprites.js의 s·se·e·ne·n), left: 좌우 뒤집기
let S = 2;                              // 픽셀 배율 (픽셀 1칸 = S px). 가로로 눕힌 낮은 휴대폰 화면은 1

// ===== 로그인 확인: 안 했거나 로그아웃하면 메인으로 =====
const onAuth = who => {
  if (!who) return location.replace('/#login');
  me.name = who.name;
  document.getElementById('who').textContent = who.name;
};
document.addEventListener('auth', e => onAuth(e.detail));
if (window.authState) onAuth(window.authState.me);

// ===== 입력: 방향키·WASD, 조이스틱 =====
const held = new Set();
const KEYS = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ArrowUp: 'U', w: 'U', W: 'U', ArrowDown: 'D', s: 'D', S: 'D' };
addEventListener('keydown', e => {
  if (KEYS[e.key]) { held.add(KEYS[e.key]); e.preventDefault(); }
  else if (e.key === 'e' || e.key === 'E') interact();
  // 임시 스킨 미리 보기 — 상점이 생기면 지울 자리: 숫자 키 0~9 = 모자, Q = 전신 스킨 차례로
  else if (HATS[e.key] !== undefined) me.look = { ...me.look, hat: HATS[e.key] };
  else if (e.key === 'q' || e.key === 'Q') me.look = { ...me.look, suit: SUITS[(SUITS.indexOf(me.look.suit) + 1) % SUITS.length] };
});
addEventListener('keyup', e => held.delete(KEYS[e.key]));
addEventListener('blur', () => held.clear());   // 창을 벗어나면 계속 걷지 않게

const stick = { x: 0, y: 0 };   // 조이스틱 기울기 (-1~1). 많이 밀수록 빨리
const pad = document.getElementById('stick'), knob = document.getElementById('knob');
const moveStick = e => {
  const b = pad.getBoundingClientRect(), R = b.width / 2;
  let dx = e.clientX - b.left - R, dy = e.clientY - b.top - R;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  stick.x = dx / R; stick.y = dy / R;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
};
const endStick = () => { stick.x = stick.y = 0; knob.style.transform = ''; };
pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); moveStick(e); });
pad.addEventListener('pointermove', e => { if (pad.hasPointerCapture(e.pointerId)) moveStick(e); });
pad.addEventListener('pointerup', endStick);
pad.addEventListener('pointercancel', endStick);
document.getElementById('ebtn').addEventListener('click', interact);

// 휴대폰: 게임 화면을 처음 누르면 전체화면 + (되는 브라우저면) 가로 고정. 아이폰 사파리는 지원 안 함
cv.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
});

// E: 아직 물건이 없어서 안내만 (물건을 만들면 가까운 물건을 찾아 쓰게 바꿀 자리)
let toast = { text: '', until: 0 };
function interact() { toast = { text: '아직 상호작용할 물건이 없어요', until: performance.now() + 1500 }; }

// ===== 화면 크기: 캔버스 해상도를 실제 픽셀에 맞춰 흐리지 않게 =====
new ResizeObserver(() => {
  const k = devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * k); cv.height = Math.round(cv.clientHeight * k);
  S = cv.clientHeight < 420 ? 1 : 2;
}).observe(cv);

// ===== 픽셀 그림 만들기 =====
const shade = (hex, k = 0.72) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
const pixelCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// 캐릭터 한 장: 부위를 차례로 겹침. 차림·방향·걸음이 같으면 다시 만들지 않고 저장해 둔 것을 씀
const spriteCache = new Map();
function sprite(look, dir, step) {   // step: 0 = 서 있음, 1·2 = 걸음 (왼다리·오른다리 올림)
  const key = JSON.stringify(look) + dir + step;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = pixelCanvas(SPRITE.w, SPRITE.h), g = c.getContext('2d');
  const pal = {
    o: '#7c7f96', e: '#1f1f24', w: look.color, W: shade(look.color, 0.84),
    y: '#f2c94c', r: '#e8454b', g: '#5dbb4a', p: '#f5a3b5', k: '#2b2b2b',
  };
  // 칸마다 [그림, 스킨 색]. 스킨 색(a·A)은 그 칸의 스킨 색으로 바뀜
  const layers = [
    [PARTS.body[look.body]], [look.suit && PARTS.suit[look.suit.shape], look.suit?.color],
    [PARTS.face[look.face]], [look.hat && PARTS.hat[look.hat.shape], look.hat?.color],
  ].filter(([part]) => part);
  for (const [part, color = '#ffffff'] of layers) {
    pal.a = color; pal.A = shade(color);
    const art = part[dir] || part[FALLBACK[dir].find(v => part[v])];   // 이 방향 그림이 없으면 비슷한 방향 그림
    art.rows.forEach((row, i) => [...row].forEach((ch, x) => {
      if (!pal[ch]) return;
      let y = art.at + i;
      if (y >= SPRITE.legsFrom && step && (x < SPRITE.w / 2) === (step === 1)) y -= 1;   // 걸음: 한쪽 다리 1칸 올림
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    }));
  }
  spriteCache.set(key, c);
  return c;
}

// ===== 마을 픽셀 좌표 → 화면 픽셀 =====
const toScreen = (x, y) => ({ x: x * S, y: y * S });

// ===== 그리기 =====
// 바닥: 미리 그려 둔 마을 바닥 한 장(town.js의 GROUND)을 배율대로
function drawGround(cam) {
  ctx.drawImage(GROUND, -cam.x, -cam.y, MAP_W * S, MAP_H * S);
}
// 나무·집: 발밑(y) 가운데(x)를 기준으로 세움
function drawThing(t, cam) {
  const k = S * ART, w = t.img.width * k, h = t.img.height * k;
  ctx.drawImage(t.img, Math.round(t.x * S - cam.x - w / 2), Math.round(t.y * S - cam.y - h), w, h);
}
function drawPlayer(p, cam, now) {
  const k = S * SPRITE.scale;   // 캐릭터 픽셀 1칸 = k px
  const step = p.moving ? 1 + (Math.floor(now / 160) % 2) : 0;
  const img = sprite(p.look, p.dir, step);
  const f = toScreen(p.x, p.y), x = Math.round(f.x - cam.x), y = Math.round(f.y - cam.y);   // 발밑 자리
  ctx.fillStyle = 'rgba(0, 0, 0, .22)';   // 그림자
  ctx.beginPath(); ctx.ellipse(x, y, SPRITE.w / 3 * k, SPRITE.w / 9 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(x, y - SPRITE.foot * k);   // 발바닥 줄이 발밑 자리에 오게
  if (p.left) ctx.scale(-1, 1);           // 왼쪽을 볼 때는 좌우 뒤집기
  ctx.drawImage(img, -SPRITE.w / 2 * k, 0, SPRITE.w * k, SPRITE.h * k);
  ctx.restore();
}
// 머리 위 닉네임: 나무·집에 가려지지 않게 맨 마지막에 그림
function drawName(p, cam) {
  const x = Math.round(p.x * S - cam.x), y = Math.round(p.y * S - cam.y) - SPRITE.foot * S * SPRITE.scale - 8;
  ctx.font = 'bold 14px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';
  ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(p.name, x, y);
  ctx.fillStyle = '#000'; ctx.fillText(p.name, x, y);
}
function drawToast(W) {
  if (performance.now() > toast.until) return;
  ctx.font = 'bold 15px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(toast.text).width + 32;
  ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - w / 2, 16, w, 36);
  ctx.fillStyle = '#fff'; ctx.fillText(toast.text, W / 2, 39);
}

// 발밑 네모(가로 ±6, 세로 -4~0 픽셀)가 지나갈 수 없는 칸(나무·집·마을 밖)에 걸리는지
function blockedAt(x, y) {
  for (const px of [x - 6, x + 6]) for (const py of [y - 4, y]) if (blockedTile(Math.floor(px / TILE), Math.floor(py / TILE))) return true;
  return false;
}

// 걷는 방향 → 8방향 중 가장 가까운 쪽 (45도씩). 왼쪽 셋은 오른쪽 그림을 뒤집음, 정면·뒤는 뒤집기 그대로
const DIRS = [['e', false], ['se', false], ['s', null], ['se', true], ['e', true], ['ne', true], ['n', null], ['ne', false]];
function face(p, vx, vy) {
  const [dir, left] = DIRS[((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % 8) + 8) % 8];
  p.dir = dir;
  if (left !== null) p.left = left;
}

// ===== 매 프레임: 움직이고 그리기 =====
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // 입력: 방향키 방향 그대로(위 = 화면 위쪽). 두 키를 같이 누르면(↑→ 등) 45도 대각선
  let vx = stick.x + held.has('R') - held.has('L'), vy = stick.y + held.has('D') - held.has('U');
  const len = Math.hypot(vx, vy);
  if (len > 1) { vx /= len; vy /= len; }   // 대각선도 같은 빠르기
  me.moving = len > 0.1;
  if (me.moving) {
    face(me, vx, vy);
    // 가로·세로를 따로 움직여 봄 → 나무·집에 부딪혀도 벽을 따라 미끄러지듯 걸음
    const step = SPEED / S * dt, nx = me.x + vx * step, ny = me.y + vy * step;
    if (!blockedAt(nx, me.y)) me.x = nx;
    if (!blockedAt(me.x, ny)) me.y = ny;
  }

  const k = devicePixelRatio || 1, W = cv.width / k, H = cv.height / k;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;      // 픽셀이 번지지 않고 또렷하게
  ctx.fillStyle = '#1d2a1b'; ctx.fillRect(0, 0, W, H);   // 마을 바깥
  const f = toScreen(me.x, me.y);
  // 카메라: 나를 화면 가운데에. 마을 끝에 가까우면 바깥이 안 보이게 멈춤(마을이 화면보다 작으면 마을을 가운데에)
  const fitCam = (p, view, size) => Math.round(size > view ? Math.min(size - view, Math.max(0, p - view / 2)) : (size - view) / 2);
  const cam = { x: fitCam(f.x, W, MAP_W * S), y: fitCam(f.y - SPRITE.h * S * SPRITE.scale / 2, H, MAP_H * S) };
  drawGround(cam);
  // 나무·집·캐릭터를 발밑이 위쪽인 것부터 그림 → 아래쪽(앞)에 있는 것이 위에 겹침
  const scene = [...THINGS.map(t => ({ y: t.y, draw: () => drawThing(t, cam) })), { y: me.y, draw: () => drawPlayer(me, cam, now) }];
  scene.sort((a, b) => a.y - b.y).forEach(o => o.draw());
  drawName(me, cam);
  drawToast(W);
  requestAnimationFrame(frame);
}
cv.focus();
requestAnimationFrame(frame);
}
