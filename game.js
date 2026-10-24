'use strict';
// 기본 게임 화면: 넓은 마을 바닥 위를 내 캐릭터가 걸어 다니고, 화면(카메라)이 따라감.
// 그림은 모두 자리만 잡아 둔 임시 모양(회색 바닥·검은 동그라미). 디자인이 정해지면 draw* 함수만 바꾸면 됨
{
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const TILE = 48, WORLD = { w: 40 * TILE, h: 30 * TILE };   // 마을 크기: 40×30칸
const SPEED = 240;                                          // 1초에 걷는 거리(px)
const me = { name: '', x: WORLD.w / 2, y: WORLD.h / 2, r: 18 };

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
const fit = () => {
  const k = devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * k); cv.height = Math.round(cv.clientHeight * k);
};
new ResizeObserver(fit).observe(cv);

// ===== 그리기 (임시 모양) =====
function drawGround(cam, W, H) {
  ctx.fillStyle = '#e4e4e2';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#cfcfcc'; ctx.lineWidth = 1;   // 칸 줄: 움직이는 게 보이도록
  ctx.beginPath();
  for (let x = Math.ceil(cam.x / TILE) * TILE; x < cam.x + W; x += TILE) { ctx.moveTo(x - cam.x + .5, 0); ctx.lineTo(x - cam.x + .5, H); }
  for (let y = Math.ceil(cam.y / TILE) * TILE; y < cam.y + H; y += TILE) { ctx.moveTo(0, y - cam.y + .5); ctx.lineTo(W, y - cam.y + .5); }
  ctx.stroke();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 4;      // 마을 끝 테두리
  ctx.strokeRect(-cam.x, -cam.y, WORLD.w, WORLD.h);
}
function drawPlayer(p, cam) {
  const x = p.x - cam.x, y = p.y - cam.y;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 14px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';   // 머리 위 닉네임
  ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(p.name, x, y - p.r - 10);
  ctx.fillStyle = '#000'; ctx.fillText(p.name, x, y - p.r - 10);
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
  let vx = stick.x + held.has('R') - held.has('L'), vy = stick.y + held.has('D') - held.has('U');
  const len = Math.hypot(vx, vy);
  if (len > 1) { vx /= len; vy /= len; }   // 대각선도 같은 빠르기
  me.x = Math.min(WORLD.w - me.r, Math.max(me.r, me.x + vx * SPEED * dt));
  me.y = Math.min(WORLD.h - me.r, Math.max(me.r, me.y + vy * SPEED * dt));

  const k = devicePixelRatio || 1, W = cv.width / k, H = cv.height / k;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  // 카메라: 나를 가운데에. 마을이 화면보다 작으면 마을을 가운데에
  const cam = {
    x: WORLD.w > W ? Math.min(WORLD.w - W, Math.max(0, me.x - W / 2)) : (WORLD.w - W) / 2,
    y: WORLD.h > H ? Math.min(WORLD.h - H, Math.max(0, me.y - H / 2)) : (WORLD.h - H) / 2,
  };
  drawGround(cam, W, H);
  drawPlayer(me, cam);
  drawToast(W);
  requestAnimationFrame(frame);
}
cv.focus();
requestAnimationFrame(frame);
}
