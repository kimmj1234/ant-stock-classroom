'use strict';
// 기본 게임 화면: 대각선 시점(마름모 바닥) 마을을 픽셀 캐릭터가 걸어 다니고, 화면(카메라)이 따라감.
// 캐릭터 그림은 sprites.js(부위별 픽셀 그림), 여기서는 겹쳐 그리기·이동·바닥만 함
{
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const TILE_W = 32, TILE_H = 16;         // 바닥 한 칸(마름모)의 픽셀 크기
const COLS = 40, ROWS = 40;             // 마을 크기: 가로 40칸 × 세로 40칸(마름모를 엇갈려 쌓아 전체는 직사각형)
const MAP_W = COLS * TILE_W, MAP_H = ROWS * TILE_H;   // 마을 크기(픽셀): 1280 × 640
const SPEED = 240;                      // 화면에서 1초에 걷는 거리(px)
// 위치는 마을 픽셀 좌표(왼쪽 위 = 0, 0). 발밑 자리
const me = { name: '', x: MAP_W / 2, y: MAP_H / 2, look: DEFAULT_LOOK, back: false, left: false, moving: false };
let S = 3;                              // 픽셀 배율 (픽셀 1칸 = S px). 낮은 화면은 2

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
  S = cv.clientHeight < 420 ? 2 : 3;
}).observe(cv);

// ===== 픽셀 그림 만들기 =====
const shade = hex => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.72).toString(16).padStart(2, '0')).join('');
const pixelCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// 캐릭터 한 장: 부위를 차례로 겹침. 차림·방향·걸음이 같으면 다시 만들지 않고 저장해 둔 것을 씀
const spriteCache = new Map();
function sprite(look, back, step) {   // step: 0 = 서 있음, 1·2 = 걸음 (왼다리·오른다리 올림)
  const key = JSON.stringify(look) + back + step;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = pixelCanvas(SPRITE.w, SPRITE.h), g = c.getContext('2d');
  const pal = {
    o: '#2b2118', e: '#2b2118', c: '#f29a8a', m: '#b5523b', s: look.skin, S: shade(look.skin),
    h: look.hair.color, H: shade(look.hair.color), t: look.top.color, T: shade(look.top.color),
    p: look.bottom.color, P: shade(look.bottom.color), b: look.shoes.color,
  };
  const layers = [
    PARTS.body[look.body], PARTS.bottom[look.bottom.shape], PARTS.shoes[look.shoes.shape],
    PARTS.top[look.top.shape], PARTS.face[look.face], PARTS.hair[look.hair.shape],
  ];
  for (const part of layers) {
    const art = (back && part.back) || part.front;   // 뒷모습이 따로 없으면 앞모습 그대로
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

// 바닥 한 칸: 풀밭 마름모 (자리만 잡은 임시 그림 — 바닥 디자인이 정해지면 바꿀 곳)
const grass = (() => {
  const c = pixelCanvas(TILE_W, TILE_H), g = c.getContext('2d');
  for (let r = 0; r < TILE_H; r++) {
    const half = r < TILE_H / 2 ? (r + 1) * 2 : (TILE_H - r) * 2;   // 마름모 줄마다 너비
    const x0 = TILE_W / 2 - half;
    g.fillStyle = '#7cbf5a'; g.fillRect(x0, r, half * 2, 1);
    g.fillStyle = r < TILE_H / 2 ? '#93d16f' : '#5f9e45';            // 위쪽 테두리는 밝게, 아래쪽은 어둡게
    g.fillRect(x0, r, 2, 1); g.fillRect(x0 + half * 2 - 2, r, 2, 1);
  }
  g.fillStyle = '#5f9e45'; g.fillRect(12, 6, 1, 1); g.fillRect(20, 9, 1, 1); g.fillRect(15, 11, 1, 1);   // 풀 점
  return c;
})();

// ===== 마을 픽셀 좌표 → 화면 픽셀 =====
const toScreen = (x, y) => ({ x: x * S, y: y * S });

// ===== 그리기 =====
// 바닥: 마름모를 반 칸씩 엇갈려 쌓고, 직사각형 밖으로 나간 반쪽은 잘라 냄 → 마을 테두리가 반듯한 직사각형
function drawGround(cam) {
  ctx.save();
  ctx.beginPath(); ctx.rect(-cam.x, -cam.y, MAP_W * S, MAP_H * S); ctx.clip();
  for (let r = 0; r <= ROWS * 2; r++) for (let c = 0; c <= COLS; c++) {
    const x = (c * TILE_W - (r % 2 ? 0 : TILE_W / 2)) * S - cam.x, y = (r * TILE_H / 2 - TILE_H / 2) * S - cam.y;
    ctx.drawImage(grass, Math.round(x), Math.round(y), TILE_W * S, TILE_H * S);
  }
  ctx.restore();
}
function drawPlayer(p, cam, now) {
  const step = p.moving ? 1 + (Math.floor(now / 160) % 2) : 0;
  const img = sprite(p.look, p.back, step);
  const f = toScreen(p.x, p.y), x = Math.round(f.x - cam.x), y = Math.round(f.y - cam.y);   // 발밑 자리
  ctx.fillStyle = 'rgba(0, 0, 0, .22)';   // 그림자
  ctx.beginPath(); ctx.ellipse(x, y, 6 * S, 2.5 * S, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(x, y - (SPRITE.h - 1) * S);
  if (p.left) ctx.scale(-1, 1);           // 왼쪽을 볼 때는 좌우 뒤집기
  ctx.drawImage(img, -SPRITE.w / 2 * S, 0, SPRITE.w * S, SPRITE.h * S);
  ctx.restore();
  ctx.font = 'bold 14px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';   // 머리 위 닉네임
  ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(p.name, x, y - SPRITE.h * S - 6);
  ctx.fillStyle = '#000'; ctx.fillText(p.name, x, y - SPRITE.h * S - 6);
}
function drawToast(W) {
  if (performance.now() > toast.until) return;
  ctx.font = 'bold 15px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(toast.text).width + 32;
  ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - w / 2, 16, w, 36);
  ctx.fillStyle = '#fff'; ctx.fillText(toast.text, W / 2, 39);
}

// ===== 매 프레임: 움직이고 그리기 =====
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // 입력: 한 방향 키는 화면 방향(위 = 화면 위쪽). 두 키를 같이 누르면(↑→ 등) 바닥 마름모의 비스듬한 선을 따라 걸음(가로 2 : 세로 1)
  let vx = held.has('R') - held.has('L'), vy = held.has('D') - held.has('U');
  if (vx && vy) vy /= 2;
  vx += stick.x; vy += stick.y;
  const len = Math.hypot(vx, vy);
  if (len > 1) { vx /= len; vy /= len; }   // 대각선도 같은 빠르기
  me.moving = len > 0.1;
  if (me.moving) {
    if (Math.abs(vx) > 0.1) me.left = vx < 0;
    if (Math.abs(vy) > 0.1) me.back = vy < 0;
    const m = 6;   // 마을 끝에서 몸이 반쯤 나가지 않게 남기는 여백(픽셀)
    me.x = Math.min(MAP_W - m, Math.max(m, me.x + vx * SPEED / S * dt));
    me.y = Math.min(MAP_H - 2, Math.max(SPRITE.h / 2, me.y + vy * SPEED / S * dt));
  }

  const k = devicePixelRatio || 1, W = cv.width / k, H = cv.height / k;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;      // 픽셀이 번지지 않고 또렷하게
  ctx.fillStyle = '#1d2a1b'; ctx.fillRect(0, 0, W, H);   // 마을 바깥
  const f = toScreen(me.x, me.y);
  // 카메라: 나를 화면 가운데에. 마을 끝에 가까우면 바깥이 안 보이게 멈춤(마을이 화면보다 작으면 마을을 가운데에)
  const fitCam = (p, view, size) => Math.round(size > view ? Math.min(size - view, Math.max(0, p - view / 2)) : (size - view) / 2);
  const cam = { x: fitCam(f.x, W, MAP_W * S), y: fitCam(f.y - SPRITE.h * S / 2, H, MAP_H * S) };
  drawGround(cam);
  drawPlayer(me, cam, now);
  drawToast(W);
  requestAnimationFrame(frame);
}
cv.focus();
requestAnimationFrame(frame);
}
