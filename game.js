'use strict';
// 기본 게임 화면: 맵(장면)을 픽셀 캐릭터가 8방향으로 걸어 다니고, 화면(카메라)이 따라감. 문 앞에서 E → 다른 장면, NPC 앞에서 E → 대화.
// 캐릭터 그림은 sprites.js, 장면 배치·그림은 town.js. 여기서는 겹쳐 그리기·이동·부딪힘·앞뒤 순서·E 행동만 함
{
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const SPEED = 240;                      // 화면에서 1초에 걷는 거리(px)
// 위치는 도시 픽셀 좌표(왼쪽 위 = 0, 0). 발밑 자리
const me = { name: '', x: START.x, y: START.y, look: DEFAULT_LOOK, dir: 'se', left: false, moving: false };   // dir: 보는 방향(sprites.js의 s·se·e·ne·n), left: 좌우 뒤집기
let S = 2;                              // 픽셀 배율 (픽셀 1칸 = S px). 매 프레임 화면이 맵으로 꽉 차게 정함

// ===== 로그인 확인: 안 했거나 로그아웃하면 메인으로 =====
const onAuth = who => {
  if (!who) return location.replace('/#login');
  me.name = who.name;
  me.basicUI = !!who.basicUI;   // 안내원에게 기본 UI를 받았는지 (기본 UI 화면은 디자인 후 이 값으로 띄울 자리)
  if (who.tutorialDone && SCENE.name !== 'city') { useScene('city'); me.x = START.x; me.y = START.y; }   // 튜토리얼을 이미 떠났으면 다시 못 들어감
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

// ===== E: 가까운 문 → 화면이 어두워졌다 밝아지며 다른 장면으로 / 가까운 NPC → 대화창 =====
const talkBox = document.getElementById('talkWrap');
let talk = { npc: null, i: 0 };
let fade = null;   // 장면을 바꾸는 중: { t0: 시작 시각, sp: 들어간 문, done: 바꿨는지 }
const FADE = 220;  // 어두워지는 데(그리고 밝아지는 데) 걸리는 시간(ms)
// NPC가 줄 것(gives)이 있고 아직 안 받았으면 처음 대사(lines), 받았으면 다음 대사(after)
const linesOf = npc => (npc.gives && me[npc.gives] && npc.after) || npc.lines;
const GIFTS = { basicUI: '기본 UI' };
function say() {
  const { npc, i } = talk, lines = linesOf(npc);
  document.getElementById('talkName').textContent = npc.name;
  document.getElementById('talkText').textContent = lines[i];
  document.getElementById('talkMore').textContent = i < lines.length - 1 ? '▼' : '닫기';
}
// 받은 것 알림: 화면 위쪽 노란 띠가 2.5초 동안 뜸
const got = document.getElementById('got');
let gotTimer = 0;
function notify(text) { got.textContent = text; got.hidden = false; clearTimeout(gotTimer); gotTimer = setTimeout(() => (got.hidden = true), 2500); }
talkBox.addEventListener('click', () => {   // 대화창 누르기(또는 E·Enter·Space) = 다음 말, 마지막 말이면 닫기 (줄 것이 있으면 이때 받음)
  if (++talk.i < linesOf(talk.npc).length) return say();
  talkBox.hidden = true; cv.focus();
  const gift = talk.npc.gives;
  if (gift && !me[gift]) {
    me[gift] = true;
    fetch('/api/' + gift, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    notify(GIFTS[gift] + '를 받았어요!');
  }
});
function interact() {
  if (!talkBox.hidden) return talkBox.click();   // 휴대폰 E 버튼
  if (fade) return;
  const sp = nearSpot(me.x, me.y);
  if (!sp) return;
  held.clear();
  if (sp.type === 'door') return void (fade = { t0: performance.now(), sp, done: false });
  if (sp.type === 'exit') return window.askLeave(() => { fade = { t0: performance.now(), sp, done: false }; });   // 튜토리얼 떠나기: 확인 창에서 "떠나기"를 골라야 감
  face(sp.npc, me.x - sp.npc.x, me.y - sp.npc.y);   // NPC가 나를 봄
  talk = { npc: sp.npc, i: 0 };
  say(); talkBox.hidden = false;
}

// ===== 화면 크기: 캔버스 해상도를 실제 픽셀에 맞춰 흐리지 않게 =====
new ResizeObserver(() => {
  const k = devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * k); cv.height = Math.round(cv.clientHeight * k);
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

// ===== 도시 픽셀 좌표 → 화면 픽셀 =====
const toScreen = (x, y) => ({ x: x * S, y: y * S });

// ===== 그리기 =====
// 바닥: 화면에 보이는 칸만 그림 (칸 그림은 town.js의 tileImage, 맵 밖은 어두운 바탕)
function drawGround(cam, W, H) {
  const t = TILE * S;
  ctx.fillStyle = '#26232e'; ctx.fillRect(0, 0, W, H);
  for (let ty = Math.floor(cam.y / t); ty * t < cam.y + H; ty++)
    for (let tx = Math.floor(cam.x / t); tx * t < cam.x + W; tx++) {
      const img = tileImage(tx, ty);
      if (img) ctx.drawImage(img, tx * t - cam.x, ty * t - cam.y, t, t);
    }
}
// 건물·나무: 발밑(y) 가운데(x)를 기준으로 세움
function drawThing(t, cam) {
  const img = thingArt(t), k = S * ART, w = img.width * k, h = img.height * k;
  ctx.drawImage(img, Math.round(t.x * S - cam.x - w / 2), Math.round(t.y * S - cam.y - h), w, h);
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
// E 표시: 가까운 문·NPC 위에 자판 모양 "E" + 할 일 (들어가기·나가기·대화)
function drawPrompt(sp, cam) {
  const x = Math.round(sp.px * S - cam.x), y = Math.round(sp.py * S - cam.y);
  const label = sp.type === 'npc' ? '대화' : sp.type === 'exit' ? '도시로 떠나기' : sp.to === 'field' ? '나가기' : '들어가기';
  ctx.font = '14px Galmuri14, "Malgun Gothic", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const w = 26 + 6 + ctx.measureText(label).width + 10, left = x - Math.round(w / 2);
  ctx.fillStyle = '#000'; ctx.fillRect(left - 3, y - 16, w + 6, 32);
  ctx.fillStyle = '#fff'; ctx.fillRect(left, y - 13, w, 26);
  ctx.fillStyle = '#000'; ctx.fillRect(left + 3, y - 10, 22, 20);
  ctx.fillStyle = '#fff'; ctx.fillText('E', left + 9, y + 1); ctx.fillStyle = '#000'; ctx.fillText(label, left + 31, y + 1);
  ctx.textBaseline = 'alphabetic';
}

// 발밑 네모(가로 ±6, 세로 -4~0 픽셀)가 지나갈 수 없는 칸(나무·집)에 걸리는지
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
  // 장면 바꾸기: 다 어두워지면 장면을 바꾸고 문 앞(안이면 현관 매트 앞)에 섬 → 다시 밝아짐
  if (fade && !fade.done && now - fade.t0 >= FADE) { useScene(fade.sp.to); me.x = fade.sp.at.x; me.y = fade.sp.at.y; me.dir = fade.sp.to === 'home' ? 'n' : fade.sp.to === 'city' ? 'e' : 's'; me.left = fade.sp.to === 'city'; fade.done = true; }   // 도시 입구에서는 왼쪽(도시 쪽)을 봄
  if (fade && now - fade.t0 >= FADE * 2) fade = null;
  const busy = fade || !talkBox.hidden || !document.getElementById('leaveWrap').hidden;   // 장면을 바꾸거나 대화하는 동안은 못 걸음
  let vx = busy ? 0 : stick.x + held.has('R') - held.has('L'), vy = busy ? 0 : stick.y + held.has('D') - held.has('U');
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
  // 배율: 기본 2배(낮은 화면은 1배). 화면이 맵보다 크면(큰 모니터·브라우저 축소) 맵이 화면을 꽉 채울 때까지 정수 배로 키움 → 빈 공간 없음
  S = Math.max(H < 420 ? 1 : 2, Math.ceil(Math.max(W / MAP_W, H / MAP_H)));
  const f = toScreen(me.x, me.y);
  // 카메라: 나를 화면 가운데에. 맵 끝에 가까우면 바깥이 안 보이게 멈춤(맵이 화면보다 작으면 맵을 가운데에)
  const fitCam = (p, view, size) => Math.round(size > view ? Math.min(size - view, Math.max(0, p - view / 2)) : (size - view) / 2);
  const cam = { x: fitCam(f.x, W, MAP_W * S), y: fitCam(f.y - SPRITE.h * S * SPRITE.scale / 2, H, MAP_H * S) };
  drawGround(cam, W, H);
  drawShadows(ctx, S, cam);   // 물건 그림자 (바닥 위, 물건 아래)
  // 건물·나무·캐릭터를 발밑이 위쪽인 것부터 그림 → 아래쪽(앞)에 있는 것이 위에 겹침
  // 바닥 무늬(맨홀·주차 P)는 맨 먼저 → 무엇에든 가려짐
  const scene = [...thingsAround(cam.x / S, cam.y / S, (cam.x + W) / S, (cam.y + H) / S).map(t => ({ y: t.ground ? -Infinity : t.y, draw: () => drawThing(t, cam) })), ...NPCS.map(n => ({ y: n.y, draw: () => drawPlayer(n, cam, now) })), { y: me.y, draw: () => drawPlayer(me, cam, now) }];
  scene.sort((a, b) => a.y - b.y).forEach(o => o.draw());
  NPCS.forEach(n => drawName(n, cam)); drawName(me, cam);
  const sp = !busy && nearSpot(me.x, me.y);
  if (sp) drawPrompt(sp, cam);
  if (fade) {   // 검은 화면으로 어두워졌다 밝아짐
    const t = (now - fade.t0) / FADE;
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, t < 1 ? t : 2 - t))})`; ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}
cv.focus();
requestAnimationFrame(frame);
}
