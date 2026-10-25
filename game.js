'use strict';
// 기본 게임 화면: 맵(장면)을 픽셀 캐릭터가 8방향으로 걸어 다니고, 화면(카메라)이 따라감. 문 앞에서 E → 다른 장면, NPC 앞에서 E → 대화.
// 캐릭터 그림은 sprites.js, 장면 배치·그림은 town.js. 여기서는 겹쳐 그리기·이동·부딪힘·앞뒤 순서·E 행동만 함
{
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const SPEED = 240;                      // 화면에서 1초에 걷는 거리(px)
// 위치는 도시 픽셀 좌표(왼쪽 위 = 0, 0). 발밑 자리
const me = { name: '', x: START.x, y: START.y, look: DEFAULT_LOOK, dir: 'se', left: false, moving: false };   // dir: 보는 방향(sprites.js의 s·se·e·ne·n), left: 좌우 뒤집기
let S = 2;                              // 픽셀 배율 (픽셀 1칸 = S px). 매 프레임 화면이 맵으로 꽉 차게 정함

// ===== 게임 시간: 현실 1시간 = 게임 3시간 (현실 20초 = 게임 1분, 게임 하루 = 현실 8시간) =====
// 달력은 실제와 같음: 게임 하루 = 달력 하루, 1년 365일, 처음은 3월 1일 오전 8시. 계절은 달로 정함(봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 12~2월)
// 창(메뉴·안내·가방 등)이 떠 있는 동안은 멈춤. 서버에 저장되어 이어짐
const DAY = 1440, TIME_SPEED = 3;   // 현실 1초에 게임 3초
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const SEASONS = [['봄', '#f5a3b5'], ['여름', '#7ed36a'], ['가을', '#f2a03d'], ['겨울', '#bfe3f5']];
// ===== 한국(서울) 같은 계절: 해 뜨고 지는 시각, 날씨, 기온 =====
// 게임 날짜마다 "1년 중 며칠째"(1월 1일 = 0)를 구해서, 그날의 서울 해·날씨·기온을 씀. 게임 0일째 = 3월 1일(59)
const doyOf = day => (59 + day) % 365;
function monthDay(doy) {   // 1년 중 며칠째 → [월, 일]
  let m = 0;
  while (doy >= MONTH_DAYS[m]) doy -= MONTH_DAYS[m++];
  return [m + 1, doy + 1];
}
// 해 뜨고 지는 시각(분): 하지(6월 21일) 5:11·19:57 → 낮이 가장 김 / 동지(12월 22일) 7:43·17:17 → 낮이 가장 짧음 / 춘분·추분 무렵 6:27·18:37
function sunTimes(day) {
  const c = Math.cos(2 * Math.PI * (doyOf(day) - 172) / 365);
  return { rise: 387 - 76 * c, set: 1117 + 80 * c };
}
// 날씨 확률표 [날씨, 확률] (나머지는 맑음)
//   3~4월 황사가 잦음 / 6월 하순~7월 하순 장마(비가 거의 매일) / 한여름 소나기 / 8~9월 태풍 / 가을은 맑고 건조 / 겨울은 눈
function weatherTable(d) {
  if (d >= 59 && d < 121) return [['dust', 0.2], ['cloud', 0.2], ['rain', 0.15]];        // 3~4월
  if (d >= 121 && d < 151) return [['cloud', 0.2], ['rain', 0.2], ['dust', 0.05]];        // 5월
  if (d >= 151 && d < 172) return [['cloud', 0.25], ['rain', 0.25]];                      // 6월 초·중순
  if (d >= 172 && d <= 208) return [['rain', 0.6], ['cloud', 0.25]];                      // 장마 (6월 21일 ~ 7월 27일)
  if (d > 208 && d < 243) return [['rain', 0.3], ['cloud', 0.15], ['storm', 0.1]];       // 한여름: 소나기·태풍
  if (d >= 243 && d < 273) return [['cloud', 0.2], ['rain', 0.12], ['storm', 0.08]];     // 9월: 늦은 태풍
  if (d >= 273 && d < 334) return [['cloud', 0.2], ['rain', 0.12]];                       // 10~11월: 맑고 건조
  return [['snow', 0.3], ['cloud', 0.2]];                                                  // 겨울
}
const JANGMA = d => d >= 172 && d <= 208;
// 그날의 날씨: 날짜로 정해져서 같은 날은 늘 같음. 35%는 어제 날씨가 이어짐(그 철에 있는 날씨일 때) → 비 오는 날·맑은 날이 며칠씩 이어지기도 함
const wxCache = new Map();
function weatherOf(day) {
  if (day <= 0) return 'sun';   // 첫날은 늘 맑음
  if (wxCache.has(day)) return wxCache.get(day);
  const table = weatherTable(doyOf(day));
  let wx = null;
  if (hash(day, 78) < 0.35) { const y = weatherOf(day - 1); if (y === 'sun' || table.some(([w]) => w === y)) wx = y; }
  if (!wx) { let r = hash(day, 77); wx = 'sun'; for (const [w, p] of table) { if (r < p) { wx = w; break; } r -= p; } }
  wxCache.set(day, wx);
  return wx;
}
// 기온(°C): 서울 월평균 기온을 날짜에 맞게 이어 붙이고 + 하루 변화(해 뜰 무렵 가장 춥고 오후 3시 무렵 가장 더움) + 날마다 조금씩 다름 + 날씨(비·눈 오면 서늘하고 하루 변화가 작음)
const MONTH_TEMP = [-2.4, 0.4, 5.7, 12.5, 17.8, 22.2, 24.9, 25.7, 21.2, 14.8, 7.2, 0.4];   // 1월 ~ 12월 (각 달 15일 무렵)
function temperature(min) {
  const day = Math.floor(min / DAY), d = doyOf(day), m = min % DAY, wx = weatherOf(day);
  const f = (d - 14 + 365) % 365 / 30.42, i = Math.floor(f) % 12, mean = MONTH_TEMP[i] + (MONTH_TEMP[(i + 1) % 12] - MONTH_TEMP[i]) * (f - Math.floor(f));
  const swing = (d >= 59 && d < 151) || (d >= 243 && d < 334) ? 5 : 4;   // 봄·가을은 일교차가 큼
  const k = { sun: 1, dust: 0.9, cloud: 0.6, rain: 0.35, storm: 0.3, snow: 0.5 }[wx];
  const wet = { rain: -1.5, storm: -2, snow: -1 }[wx] || 0;
  return Math.round(mean + wet + (hash(day, 91) - 0.5) * 4 + swing * k * Math.cos(2 * Math.PI * (m - 900) / DAY));
}
const WX_NAME = { sun: '맑음', cloud: '흐림', rain: '비', snow: '눈', storm: '태풍', dust: '황사' };
const clock = { min: 480, sent: '', ready: false };   // sent: 마지막으로 서버에 보낸 시간·자리
function today(min) {
  const day = Math.floor(min / DAY), year = Math.floor(day / 365) + 1, [month, date] = monthDay(doyOf(day));
  const season = [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][month - 1];   // 1·2월 겨울, 3~5월 봄, 6~8월 여름, 9~11월 가을, 12월 겨울
  const wx = weatherOf(day), m = Math.floor(min % DAY), h = Math.floor(m / 60);   // 시각은 1분 단위 (현실 20초마다 바뀜)
  return {
    year, season, month, date, wx, ...sunTimes(day),
    wxName: wx === 'rain' && JANGMA(doyOf(day)) ? '장마' : WX_NAME[wx],
    time: `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,   // 24시간제 (자정 00:00, 정오 12:00)
  };
}
// 진행 저장: 게임 시간 + 서 있던 자리(장면·위치). 바뀐 게 있을 때만 보냄 → 새로고침(F5)해도 그 자리에서 이어서 시작
// 보내는 때: 걷다가 멈춘 순간, 문으로 장면을 바꾼 순간, 5초마다, 페이지를 떠나거나 탭을 가릴 때
// keepalive: 새로고침·창 닫기로 페이지가 사라지는 중에도 요청이 끝까지 감
const saveProgress = () => {
  if (!clock.ready) return;
  const at = me.sit ? me.sit.sp : me;   // 벤치에 앉아 있으면 벤치 앞(일어날 자리)을 저장
  const body = JSON.stringify({ minutes: Math.floor(clock.min), place: { scene: SCENE.name, x: Math.round(at.x), y: Math.round(at.y) } });
  if (body === clock.sent) return;
  clock.sent = body;
  fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
};
setInterval(saveProgress, 5000);
addEventListener('pagehide', saveProgress);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });

// ===== 기본 UI 그림: 픽셀 아이콘 (글자 한 칸 = 픽셀 한 칸) =====
const ICON_PAL = {
  d: '#4a4d60', h: '#d9b56a',   // 태풍 먹구름, 황사 먼지
  y: '#f2c94c', o: '#e0902a', w: '#ffffff', g: '#7c7f96', u: '#3d7fd6', c: '#8fc3e6', k: '#2f2b38',
  // 가방(파란 배낭)
  K: '#1e1b3a', B: '#5b8cf0', D: '#4459d6', C: '#5fcfe6', L: '#8fe3f2', W: '#ffffff', Y: '#f6d32b', O: '#e88a1c', P: '#f2a6cf', R: '#c8323a',
};
const ICONS = {
  sun: ['y...y...y.', '.y..y..y..', '..oooooo..', '..oyyyyo..', 'yyoyyyyoyy', '..oyyyyo..', '..oyyyyo..', '..oooooo..', '.y..y..y..', 'y...y...y.'],
  cloud: ['..........', '..........', '...ggg....', '..gwwwg...', '.gwwwwwgg.', 'gwwwwwwwwg', 'gwwwwwwwwg', '.gggggggg.', '..........', '..........'],
  rain: ['...ggg....', '..gwwwg...', '.gwwwwwgg.', 'gwwwwwwwwg', '.gggggggg.', '..........', '.u..u..u..', 'u..u..u...', '..........', '.u..u..u..'],
  moon: ['...yyyy...', '..yyy.....', '.yyy......', '.yyy......', 'yyyy......', 'yyyy......', '.yyy......', '.yyyy.....', '..yyyyyy..', '...yyyy...'],
  storm: ['...ddd....', '..dkkkd...', '.dkkkkkdd.', 'dkkkkkkkkd', '.dddddddd.', '...y......', '..yy.u..u.', '...y..u...', '..y.u...u.', '.u...u....'],
  dust: ['h...h...h.', '..h.hhh.h.', '.h.hyyyh..', '..hyyyyyh.', 'h.hyyyyyh.', '..hyyyyyh.', '.h.hyyyh.h', '..h.hhh...', 'h.h...h..h', '...h...h..'],
  snow: ['...ggg....', '..gwwwg...', '.gwwwwwgg.', 'gwwwwwwwwg', '.gggggggg.', '..........', '.c...c...c', 'ccc.ccc...', '.c...c...c', '..........'],
  coin: ['...oooo...', '..oyyyyo..', '.oyywwyyo.', 'oyywyyyyyo', 'oyyyyyyyyo', 'oyyyyyyyyo', 'oyyyyyyyyo', '.oyyyyyyo.', '..oyyyyo..', '...oooo...'],
  bag: [   // 파란 배낭: 손잡이, 별·고양이·웃는 얼굴 스티커, 하늘색 띠, 앞주머니 자물쇠, 하트 장식, 양옆 주머니
    '........KKKKKKKK........',
    '.......KCLLLLLLCK.......',
    '.......KCWWWWWWCK.......',
    '......KKKKBBBBKKKK......',
    '.....KCLBBBBBBBBBDK.....',
    '....KCBBBYBBBBBBBBDK....',
    '....KCBOYYYOBPBBPBDK....',
    '....KCBBYYYBBPPPPBDK....',
    '....KCBBOBOBBPKPKBDK....',
    '....KCBBBBBBBPPPPBDK....',
    '..KKKCBBYYYBBBBBBBDKKK..',
    '.KDDKCBYKYKYBBBBBBDKDDK.',
    '.KDDKCBBYKYBBBBBBBDKDDK.',
    '.KDDKCCCCCCCCCCCCCDKDDK.',
    '.KDDKCBBBBBKKBBKBBDKDDK.',
    '.KDDKCDDDDDYYDDKDDDKDDK.',
    '.KDDKCBBBBBOORRBRRDKDDK.',
    '.KDDKCBBBBBBBRRRRRDKDDK.',
    '.KDDKCDBBBBBBBRRRBDKDDK.',
    '..KKKCDDDDDDDDDRDDDKKK..',
    '....KKKKKKKKKKKKKKKK....',
  ],
};
function drawIcon(id, name) {
  const c = document.getElementById(id), rows = ICONS[name], g = c.getContext('2d');
  c.width = rows[0].length; c.height = rows.length;
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ICON_PAL[ch]) { g.fillStyle = ICON_PAL[ch]; g.fillRect(x, y, 1, 1); } }));
}
drawIcon('hudCoin', 'coin'); drawIcon('hudBag', 'bag');
const hudEl = document.getElementById('hud'), $hud = id => document.getElementById(id);
let hudLast = '';
function showHud() { hudEl.hidden = !me.basicUI; }
function updateHud() {   // 글자가 바뀔 때만 고침
  const t = today(clock.min), m = clock.min % DAY, icon = t.wx === 'sun' && (m < t.rise || m >= t.set) ? 'moon' : t.wx;   // 맑은 밤(해 진 뒤 ~ 해 뜨기 전)엔 달
  const temp = temperature(clock.min);
  const key = [t.year, t.season, t.month, t.date, icon, t.time, temp, me.cash].join('|');
  if (key === hudLast) return;
  hudLast = key;
  const [name, color] = SEASONS[t.season];
  $hud('hudSeason').textContent = name; $hud('hudSeason').style.background = color;
  $hud('hudDay').textContent = (t.year > 1 ? t.year + '년 ' : '') + t.month + '월 ' + t.date + '일';   // 2년째부터는 몇 년째인지도
  $hud('hudWxText').textContent = t.wxName; drawIcon('hudWx', icon);
  $hud('hudTemp').textContent = temp + '°C';
  $hud('hudClock').textContent = t.time;
  $hud('hudCash').textContent = (me.cash || 0).toLocaleString('ko-KR');
}

// ===== 로그인 확인: 안 했거나 로그아웃하면 메인으로 =====
// ===== 함께 돌아다니기(멀티플레이) =====
// 받기: 서버와 실시간 연결(EventSource)로 같은 장면에 있는 다른 사람 목록을 0.1초마다 받음 → others
// 보내기: 내 자리·방향·걷는지·앉은 벤치 자리·차림을 0.1초마다(바뀐 게 없으면 3초마다) 서버에 알림
// 그리기: 받은 자리로 부드럽게 따라가며(멀리 떨어지면 바로 이동) 같은 캐릭터 그림·이름표로 그림. 벤치에 앉아 있으면 앉은 모양
const others = new Map();   // id → { name, look, x, y(지금 그리는 자리), tx, ty(받은 자리), dir, left, moving, seat }
let live = null, sentMove = '', sentAt = 0;
const safeLook = l => (l && PARTS.body[l.body] && PARTS.face[l.face] && (!l.hat || PARTS.hat[l.hat.shape]) && (!l.suit || PARTS.suit[l.suit.shape]) ? l : DEFAULT_LOOK);   // 모르는 차림은 기본 차림으로
function startLive() {
  if (live) return;
  live = new EventSource('/api/live');   // 끊기면 브라우저가 알아서 다시 연결
  live.onmessage = e => {
    const seen = new Set();
    for (const p of JSON.parse(e.data)) {
      seen.add(p.id);
      const o = others.get(p.id);
      others.set(p.id, Object.assign(o || { x: p.x, y: p.y }, p, { x: o ? o.x : p.x, y: o ? o.y : p.y, tx: p.x, ty: p.y, look: safeLook(p.look) }));
    }
    for (const id of others.keys()) if (!seen.has(id)) others.delete(id);
  };
}
function sendMove(now) {
  if (!live || now - sentAt < 100) return;
  const seat = me.sit && me.sit.phase === 'on' ? SPOTS.indexOf(me.sit.sp) : null;
  const body = JSON.stringify({ scene: SCENE.name, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, left: me.left, moving: me.moving, seat, look: me.look });
  if (body === sentMove && now - sentAt < 3000) return;   // 그대로면 3초마다만 (접속해 있다고 알림)
  sentMove = body; sentAt = now;
  fetch('/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
}
function updateOthers(dt, now) {
  for (const sp of SPOTS) sp.othersOn = false;
  for (const o of others.values()) {
    if (Math.hypot(o.tx - o.x, o.ty - o.y) > 160) { o.x = o.tx; o.y = o.ty; }   // 멀리 떨어지면(장면을 바꾼 직후 등) 바로 그 자리로
    else { const k = Math.min(1, dt * 12); o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
    const sp = o.seat != null && SPOTS[o.seat];
    o.sit = sp && sp.type === 'seat' ? sp : null;
    if (o.sit) { sp.othersOn = true; o.pose = 'sit'; o.swing = Math.floor((now + o.x * 7) / 450) % 2 + 1; o.bob = Math.floor((now + o.x * 7) / 900) % 2; }
    else o.pose = o.swing = o.bob = null;
  }
}

const onAuth = who => {
  if (!who) return location.replace('/#login');
  me.name = who.name;
  me.basicUI = !!who.basicUI;   // 안내원에게 기본 UI를 받았는지 → 받았으면 화면 테두리에 기본 UI
  if (who.life) { clock.min = who.life.minutes; me.cash = who.life.cash; me.bag = who.life.bag; me.stats = who.life.stats; clock.ready = true; }
  showHud();
  startLive();
  // 서 있던 자리에서 이어서 시작. 튜토리얼을 이미 떠났으면 튜토리얼 쪽 자리는 무시하고 도시 입구로(다시 못 들어감)
  const pl = who.life?.place;
  if (pl && SCENES[pl.scene] && (!who.tutorialDone || pl.scene === 'city')) {
    useScene(pl.scene);
    ({ x: me.x, y: me.y } = blockedAt(pl.x, pl.y) ? START : pl);   // 그 자리가 막혔으면(맵이 바뀐 경우 등) 처음 자리
    me.dir = 's';
  } else if (who.tutorialDone && SCENE.name !== 'city') { useScene('city'); me.x = START.x; me.y = START.y; }
};
document.addEventListener('auth', e => onAuth(e.detail));
if (window.authState) onAuth(window.authState.me);

// ===== 가방 창 채우기 (play.html이 열 때 'bagopen'을 보냄) =====
// 캐릭터: 지금 차림을 정면으로 크게 / 자금: 현금 / 능력치: 막대 셋 + 레벨 셋 / 가방: 쓸 수 있는 칸(처음 가방 3칸) + 잠긴 칸
const BAG_SLOTS = 3, BAG_MAX = 12;
// 능력치: 체력·배고픔·기분 = 게이지 / 지능·근력 = 레벨 + 돈으로 강화 버튼(Lv n → n+1에 n × 10,000원, 서버가 확인) / 매력 = 인기도(다른 사람이 +1·-1)
const STAT_ROWS = [
  ['health', '체력', '#e8454b'], ['hunger', '배고픔', '#f2a03d'], ['mood', '기분', '#f2c94c'],
  ['smarts', '지능', 'up'], ['strength', '근력', 'up'], ['charm', '매력', 'fame'],
];
const won = n => n.toLocaleString('ko-KR');
function statRow([k, name, kind], st) {
  const v = st[k] ?? 0;
  if (kind === 'up') {
    const cost = v * 10000;
    return `<li><span>${name}</span><span class="lv">Lv ${v}</span><button type="button" data-up="${k}" ${(me.cash || 0) < cost || v >= 99 ? 'disabled' : ''} title="${name} 강화: ${won(cost)}원">강화 ${won(cost)}원</button></li>`;
  }
  if (kind === 'fame') return `<li><span>${name}</span><span class="lv">인기도 ${v}</span><span></span></li>`;
  return `<li><span>${name}</span><span class="bar"><i style="width:${v}%;background:${kind}"></i></span><span>${v}</span></li>`;
}
function fillStats() { $hud('invStats').innerHTML = STAT_ROWS.map(r => statRow(r, me.stats || {})).join(''); }
// 강화 버튼: 서버에 요청 → 새 현금·능력치로 창·기본 UI를 고침
$hud('invStats').addEventListener('click', async e => {
  const btn = e.target.closest('[data-up]');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const r = await fetch('/api/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stat: btn.dataset.up }) }).then(r => r.json()).catch(() => ({ ok: false, msg: '서버와 연결이 안 돼요.' }));
  if (r.ok) {
    me.cash = r.cash; me.stats = r.stats;
    $hud('invCash').textContent = won(me.cash);
    const [, name] = STAT_ROWS.find(([k]) => k === btn.dataset.up);
    notify(`${name} 강화! Lv ${me.stats[btn.dataset.up]} 달성`);
  } else notify(r.msg);
  fillStats();
  $hud('invStats').querySelector(`[data-up="${btn.dataset.up}"]`)?.focus();
});
document.addEventListener('bagopen', () => {
  const c = $hud('invChar'), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height); g.drawImage(sprite(me.look, 's', 0), 0, 0);
  $hud('invName').textContent = me.name;
  drawIcon('invCoin', 'coin');
  $hud('invCash').textContent = (me.cash || 0).toLocaleString('ko-KR');
  fillStats();
  const items = me.bag || [];
  $hud('bagGrid').innerHTML = Array.from({ length: BAG_MAX }, (_, i) => i < BAG_SLOTS ? `<span class="slot">${items[i]?.name || ''}</span>` : '<span class="slot locked" title="더 큰 가방이 필요해요">잠김</span>').join('');
  $hud('bagEmpty').textContent = items.length ? `${items.length} / ${BAG_SLOTS}칸` : '아직 비어 있어요 · 3칸';
});

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
    showHud();
  }
});
function interact() {
  if (!talkBox.hidden) return talkBox.click();   // 휴대폰 E 버튼
  if (fade) return;
  if (me.sit) { if (me.sit.phase === 'on') standUp(performance.now()); return; }   // 앉아 있으면 E = 일어나기
  const sp = nearSpot(me.x, me.y);
  if (!sp) return;
  held.clear();
  if (sp.type === 'seat') return sitDown(sp);
  if (sp.type === 'door') return void (fade = { t0: performance.now(), sp, done: false });
  if (sp.type === 'exit' && !me.basicUI) return notify('안내소에서 기본 UI를 받아야 도시로 갈 수 있어요!');   // 기본 UI 없이는 못 떠남
  if (sp.type === 'exit') return window.askLeave(() => { fade = { t0: performance.now(), sp, done: false }; });   // 튜토리얼 떠나기: 확인 창에서 "떠나기"를 골라야 감
  face(sp.npc, me.x - sp.npc.x, me.y - sp.npc.y);   // NPC가 나를 봄
  talk = { npc: sp.npc, i: 0 };
  say(); talkBox.hidden = false;
}

// ===== 벤치에 앉기 =====
// 앉기(in): 벤치 앞에서 자리로 폴짝 뛰어 올라앉음 / 앉아 있기(on): 숨 쉬듯 들썩이고 발을 흔듦 / 일어나기(out): 벤치 앞으로 폴짝 내려옴
// 앉은 자리는 다른 사람이 못 앉음(sp.taken). 일어나기: E 또는 방향키
const SIT_TIME = 280;   // 폴짝 뛰는 시간(ms)
function sitDown(sp) {
  sp.taken = me;
  me.sit = { sp, phase: 'in', t0: performance.now(), from: { x: me.x, y: me.y }, to: { x: sp.x, y: sp.sitY } };
  me.moving = false;
}
function standUp(now) {
  const st = me.sit;
  Object.assign(st, { phase: 'out', t0: now, from: { x: me.x, y: me.y }, to: { x: st.sp.x, y: st.sp.y } });
}
function updateSit(now) {
  me.pose = null; me.swing = 0; me.bob = 0;
  const st = me.sit;
  if (!st) return;
  if (st.phase === 'on') {   // 앉아 있는 동안: 발을 번갈아 흔들고(0.45초), 몸이 1칸씩 들썩임(0.9초)
    me.pose = 'sit'; me.swing = Math.floor(now / 450) % 2 + 1; me.bob = Math.floor(now / 900) % 2;
    return;
  }
  const p = Math.min(1, (now - st.t0) / SIT_TIME), e = p * p * (3 - 2 * p);   // 부드럽게 시작·끝
  me.x = st.from.x + (st.to.x - st.from.x) * e;
  me.y = st.from.y + (st.to.y - st.from.y) * e - Math.sin(p * Math.PI) * 10;   // 폴짝: 가운데서 10픽셀 위로
  me.dir = 's'; me.left = false;   // 앉을 때는 정면을 봄
  if (st.phase === 'in' ? p > 0.6 : p < 0.4) me.pose = 'sit';   // 뛰는 중간에 앉은 모양으로 바뀜
  if (p < 1) return;
  if (st.phase === 'in') st.phase = 'on';
  else { st.sp.taken = null; me.sit = null; me.pose = null; saveProgress(); }
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
function sprite(look, dir, step, pose) {   // step: 0 = 서 있음, 1·2 = 걸음 (왼다리·오른다리 올림) / pose 'sit' = 앉은 모양
  const key = JSON.stringify(look) + dir + step + pose;
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
      if (pose === 'sit') {   // 앉음: 몸은 1칸 내려앉고, 다리 윗줄은 몸에 묻혀 발만 보임
        if (y < SPRITE.legsFrom) y += 1;
        else if (y === SPRITE.legsFrom) return;
      }
      if (y >= SPRITE.legsFrom && step && (x < SPRITE.w / 2) === (step === 1)) y -= 1;   // 걸음(앉으면 발 흔들기): 한쪽 다리 1칸 올림
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
  const step = p.moving ? 1 + (Math.floor(now / 160) % 2) : p.swing || 0;
  const img = sprite(p.look, p.dir, step, p.pose);
  const f = toScreen(p.x, p.y), x = Math.round(f.x - cam.x), y = Math.round(f.y - cam.y);   // 발밑 자리
  if (!p.sit) {   // 그림자 (벤치에 앉아 있으면 벤치 그림자로 충분)
    ctx.fillStyle = 'rgba(0, 0, 0, .22)';
    ctx.beginPath(); ctx.ellipse(x, y, SPRITE.w / 3 * k, SPRITE.w / 9 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y - SPRITE.foot * k + (p.bob || 0) * k);   // 발바닥 줄이 발밑 자리에 오게 (앉아서 들썩이면 1칸 아래)
  if (p.left) ctx.scale(-1, 1);           // 왼쪽을 볼 때는 좌우 뒤집기
  ctx.drawImage(img, -SPRITE.w / 2 * k, 0, SPRITE.w * k, SPRITE.h * k);
  ctx.restore();
}
// 머리 위 닉네임: 나무·집에 가려지지 않게 맨 마지막에 그림
function drawName(p, cam) {
  const y = Math.round(p.y * S - cam.y) - SPRITE.foot * S * SPRITE.scale - 8;
  ctx.font = 'bold 14px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';
  const half = ctx.measureText(p.name).width / 2 + 4, viewW = cv.width / (devicePixelRatio || 1);
  const x = Math.max(half, Math.min(viewW - half, Math.round(p.x * S - cam.x)));   // 화면 끝에서도 잘리지 않게
  ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(p.name, x, y);
  ctx.fillStyle = '#000'; ctx.fillText(p.name, x, y);
}
// E 표시: 가까운 문·NPC 위에 자판 모양 "E" + 할 일 (들어가기·나가기·대화)
function drawPrompt(sp, cam) {
  // NPC: 그 NPC 이름표 바로 위 / 도시로 떠나기: 내 캐릭터 이름표 바로 위 / 문: 정해 둔 자리(px, py)
  const who = sp.type === 'npc' ? sp.npc : sp.type === 'exit' || sp.type === 'stand' ? me : null;
  const x = Math.round((who ? who.x : sp.px) * S - cam.x);
  const y = who ? Math.round(who.y * S - cam.y) - SPRITE.foot * S * SPRITE.scale - 8 - 32 : Math.round(sp.py * S - cam.y);
  const label = { npc: '대화', exit: '도시로 떠나기', seat: '앉기', stand: '일어나기' }[sp.type] || (sp.to === 'field' ? '나가기' : '들어가기');
  ctx.font = '14px Galmuri14, "Malgun Gothic", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const w = 26 + 6 + ctx.measureText(label).width + 10, viewW = cv.width / (devicePixelRatio || 1);
  const left = Math.max(8, Math.min(viewW - w - 8, x - Math.round(w / 2)));   // 화면 끝에서도 잘리지 않게
  ctx.fillStyle = '#000'; ctx.fillRect(left - 3, y - 16, w + 6, 32);
  ctx.fillStyle = '#fff'; ctx.fillRect(left, y - 13, w, 26);
  ctx.fillStyle = '#000'; ctx.fillRect(left + 3, y - 10, 22, 20);
  ctx.fillStyle = '#fff'; ctx.fillText('E', left + 9, y + 1); ctx.fillStyle = '#000'; ctx.fillText(label, left + 31, y + 1);
  ctx.textBaseline = 'alphabetic';
}

// ===== 벽시계: 게임 시각대로 바늘을 그림 (시침 짧은 검정, 분침 긴 검정, 가운데 빨간 점) =====
function drawClocks(cam) {
  const k = S * ART, m = clock.min % DAY;
  for (const th of THINGS) {
    if (th.type !== 'clock') continue;
    const img = thingArt(th), ox = th.x * S - cam.x - img.width * k / 2, oy = th.y * S - cam.y - img.height * k;
    const hand = (turn, len) => {
      ctx.fillStyle = INK;
      for (let r = 0; r <= len; r += 0.5) ctx.fillRect(Math.round(ox + Math.floor(5.5 + Math.sin(turn * 2 * Math.PI) * r) * k), Math.round(oy + Math.floor(5.5 - Math.cos(turn * 2 * Math.PI) * r) * k), k, k);
    };
    hand((m % 720) / 720, 2.8);   // 시침
    hand((m % 60) / 60, 3.9);     // 분침
    ctx.fillStyle = '#e8454b'; ctx.fillRect(Math.round(ox + 5 * k), Math.round(oy + 5 * k), k, k);
  }
}

// ===== 하늘: 게임 시간·날씨에 따라 맵 위에 덧그림 (이름표·E 표시·기본 UI는 그 위라 늘 잘 보임) =====
//   밤: 오후 5시부터 어두워져 8시~새벽 4시 가장 어둡고 오전 7시까지 밝아짐. 해 질 녘(오후 6시 무렵)엔 주황빛
//   흐림·비·눈: 바깥이 조금 흐려짐. 비·눈은 화면에 알갱이가 내림(걸으면 맵과 같이 밀려 땅에 내리는 것처럼 보임)
//   집 안: 비·눈은 안 보이고, 밤에도 불이 켜져 있어 조금만 어두움
const drops = [];
let skyCam = null;
function drawSky(cam, W, H, dt, now) {
  const t = today(clock.min), m = clock.min % DAY, out = SCENE.name !== 'home';
  const ramp = (a, b) => Math.min(1, Math.max(0, (m - a) / (b - a)));
  // 밤 정도 0(낮) ~ 1(한밤): 해 뜨기 40분 전부터 밝아져 해 뜬 30분 뒤 완전히 낮, 해 지기 30분 전부터 어두워져 해 진 50분 뒤 완전히 밤
  const { rise, set } = t;
  const dark = m < rise - 40 ? 1 : m < rise + 30 ? 1 - ramp(rise - 40, rise + 30) : m < set - 30 ? 0 : m < set + 50 ? ramp(set - 30, set + 50) : 1;
  const evening = Math.max(0, 1 - Math.abs(m - set) / 80, (1 - Math.abs(m - rise) / 60) * 0.6);   // 노을: 해 질 녘(가장 큼)·해 뜰 녘(조금)
  const night = dark * (out ? 0.55 : 0.2);
  const dusk = out ? evening * 0.14 : 0;
  // 집 안 창문: 바깥과 같은 하늘 — 밤엔 남색과 별, 해 질 녘엔 주황, 흐리면 회색, 비·눈이 내림
  if (!out) {
    const k = S * ART;
    for (const th of THINGS) {
      const G = SKY_GLASS[th.type];
      if (!G) continue;
      const img = thingArt(th), ox = th.x * S - cam.x - img.width * k / 2, oy = th.y * S - cam.y - img.height * k;
      for (const [x, y, w, h] of G) {
        const px = Math.round(ox + x * k), py = Math.round(oy + y * k), pw = w * k, ph = h * k;
        const pane = color => { ctx.fillStyle = color; ctx.fillRect(px, py, pw, ph); };
        if (t.wx === 'dust') pane('rgba(205, 165, 90, 0.5)');
        else if (t.wx !== 'sun') pane(`rgba(130, 140, 160, ${{ cloud: 0.45, storm: 0.75 }[t.wx] || 0.6})`);
        if (evening) pane(`rgba(255, 140, 70, ${evening * 0.55})`);
        if (dark) pane(`rgba(18, 24, 66, ${dark * 0.92})`);
        ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
        if (dark > 0.6 && t.wx === 'sun') {   // 별
          ctx.fillStyle = `rgba(255, 250, 210, ${dark})`;
          for (let i = 0; i < 3; i++) ctx.fillRect(px + Math.floor(hash(x, y, i) * w) * k, py + Math.floor(hash(x, y, i + 9) * h) * k, k, k);
        }
        if (t.wx === 'rain' || t.wx === 'storm' || t.wx === 'snow') {   // 창밖에 내리는 비·눈
          const rain = t.wx !== 'snow';
          ctx.fillStyle = rain ? 'rgba(210, 228, 255, 0.8)' : 'rgba(255, 255, 255, 0.95)';
          for (let i = 0; i < 4; i++) {
            const fx = (hash(x, i, 3) * w + (rain ? -now / 120 : Math.sin(now / 600 + i) * 0.6)) % w, fy = (hash(y, i, 4) * h + now / (rain ? 40 : 300)) % h;
            const qx = px + Math.floor((fx + w) % w) * k, qy = py + Math.floor(fy) * k;
            ctx.fillRect(qx, qy, k, rain ? k * 2 : k);
          }
        }
        ctx.restore();
      }
    }
  }
  const gloom = out ? { cloud: 0.08, rain: 0.16, storm: 0.3, snow: 0.06 }[t.wx] || 0 : 0;
  const fill = color => { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); };
  if (gloom) fill(`rgba(70, 78, 100, ${gloom})`);
  if (out && t.wx === 'dust') fill('rgba(205, 160, 80, 0.24)');   // 황사: 누렇고 뿌연 하늘
  if (dusk) fill(`rgba(255, 130, 50, ${dusk})`);
  if (night) fill(`rgba(16, 20, 56, ${night})`);
  // 불빛: 어두운 만큼 창문·등이 노랗게 켜지고 둘레가 은은하게 밝음 (어둠 위에 그려서 밤에 또렷함)
  const lit = out ? night / 0.55 : 0;
  if (lit > 0.05) {
    const k = S * ART;
    for (const t of THINGS) {
      const L = LIGHTS[t.type];
      if (!L) continue;
      const img = thingArt(t), ox = t.x * S - cam.x - img.width * k / 2, oy = t.y * S - cam.y - img.height * k;
      for (const [x, y, w, h] of L) {
        const cx = ox + (x + w / 2) * k, cy = oy + (y + h / 2) * k, r = Math.max(w, h) * k * 1.6;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255, 200, 110, ${0.28 * lit})`); g.addColorStop(1, 'rgba(255, 200, 110, 0)');
        ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = `rgba(255, 214, 120, ${0.9 * lit})`; ctx.fillRect(Math.round(ox + x * k), Math.round(oy + y * k), w * k, h * k);
        ctx.fillStyle = `rgba(255, 240, 190, ${0.9 * lit})`; ctx.fillRect(Math.round(ox + x * k), Math.round(oy + y * k), w * k, k);   // 위쪽 한 줄은 더 밝게
      }
    }
  }
  // 비·눈·황사 알갱이 (화면 넓이에 맞춰 개수를 정함). 태풍은 빗줄기가 두 배 넘게 많고 세게 기울어짐 + 가끔 번개
  const kind = out && { rain: 'rain', storm: 'rain', snow: 'snow', dust: 'dust' }[t.wx] || null, storm = t.wx === 'storm';
  const want = kind ? Math.round(W * H / { rain: storm ? 2000 : 5000, snow: 8000, dust: 9000 }[kind]) : 0;
  while (drops.length < want) drops.push({ x: Math.random() * W, y: Math.random() * H, v: 0.7 + Math.random() * 0.6 });
  drops.length = want;
  const mx = skyCam ? cam.x - skyCam.x : 0, my = skyCam ? cam.y - skyCam.y : 0;
  skyCam = { x: cam.x, y: cam.y };
  const wrap = (v, size) => ((v % size) + size) % size;
  for (const d of drops) {
    if (kind === 'rain') { d.x -= (storm ? 420 : 160) * d.v * dt + mx; d.y += (storm ? 980 : 760) * d.v * dt - my; }
    else if (kind === 'dust') { d.x += 70 * d.v * dt - mx; d.y += Math.sin(now / 900 + d.v * 7) * 10 * dt - my; }   // 황사: 옆으로 흘러가는 먼지
    else { d.x += Math.sin(now / 700 + d.v * 9) * 24 * dt - mx; d.y += 50 * d.v * dt - my; }
    d.x = wrap(d.x, W); d.y = wrap(d.y, H);
  }
  if (kind === 'rain') {   // 빗줄기: 비스듬한 2픽셀 굵기 선
    ctx.fillStyle = 'rgba(200, 220, 255, 0.55)';
    for (const d of drops) for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(d.x - i), Math.round(d.y + i * 3), 2, 3);
    if (storm && hash(Math.floor(now / 3000), 5) < 0.25 && now % 3000 < 140) fill('rgba(235, 240, 255, 0.55)');   // 번개: 가끔 화면이 번쩍
  } else if (kind === 'dust') {   // 황사 먼지: 작은 누런 점
    ctx.fillStyle = 'rgba(190, 150, 80, 0.55)';
    for (const d of drops) ctx.fillRect(Math.round(d.x), Math.round(d.y), 2, 2);
  } else if (kind === 'snow') {   // 눈송이: 작은 흰 네모(가까운 것일수록 크게)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    for (const d of drops) { const z = d.v > 1 ? 4 : 3; ctx.fillRect(Math.round(d.x), Math.round(d.y), z, z); }
  }
}

// 발밑 네모(가로 ±6, 세로 -4~0 픽셀)가 지나갈 수 없는 칸(나무·집)이나 NPC에 걸리는지
function blockedAt(x, y) {
  if (NPCS.some(n => Math.abs(x - n.x) < 30 && Math.abs(y - n.y) < 12)) return true;   // NPC 몸·이름표와 겹쳐 서지 않게
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
  if (clock.ready && !document.querySelector('.guide-wrap:not([hidden])')) clock.min += dt * TIME_SPEED / 60;   // 게임 시간: 현실 1초에 게임 3초 (창이 떠 있으면 멈춤)
  updateHud();
  // 계절마다 바뀌는 그림 (town.js): 나무, 잔디·흙길(눈 오는 날은 눈이 쌓이고, 다음 날까지 녹다 남은 눈)
  const td = today(clock.min), tday = Math.floor(clock.min / DAY);
  ART_SEASON = td.season;
  GROUND_LOOK = td.wx === 'snow' ? 'snow' : td.season === 3 && weatherOf(tday - 1) === 'snow' ? 'melt' : ['spring', 'summer', 'autumn', 'winter'][td.season];
  // 입력: 방향키 방향 그대로(위 = 화면 위쪽). 두 키를 같이 누르면(↑→ 등) 45도 대각선
  // 장면 바꾸기: 다 어두워지면 장면을 바꾸고 문 앞(안이면 현관 매트 앞)에 섬 → 다시 밝아짐
  if (fade && !fade.done && now - fade.t0 >= FADE) { useScene(fade.sp.to); me.x = fade.sp.at.x; me.y = fade.sp.at.y; me.dir = fade.sp.to === 'home' ? 'n' : fade.sp.to === 'city' ? 'e' : 's'; me.left = fade.sp.to === 'city'; fade.done = true; saveProgress(); }   // 도시 입구에서는 왼쪽(도시 쪽)을 봄
  if (fade && now - fade.t0 >= FADE * 2) fade = null;
  const busy = fade || !talkBox.hidden || !document.getElementById('leaveWrap').hidden;   // 장면을 바꾸거나 대화하는 동안은 못 걸음
  let vx = busy ? 0 : stick.x + held.has('R') - held.has('L'), vy = busy ? 0 : stick.y + held.has('D') - held.has('U');
  if (me.sit) {   // 벤치: 앉아 있을 때 방향키를 누르면 일어남. 앉는 중·일어나는 중·앉아 있는 동안은 못 걸음
    if (me.sit.phase === 'on' && Math.hypot(vx, vy) > 0.1) standUp(now);
    vx = vy = 0;
  }
  updateSit(now);
  updateOthers(dt, now); sendMove(now);
  const len = Math.hypot(vx, vy);
  if (len > 1) { vx /= len; vy /= len; }   // 대각선도 같은 빠르기
  if (me.moving && len <= 0.1) saveProgress();   // 걷다가 멈추면 바로 저장
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
  const scene = [...thingsAround(cam.x / S, cam.y / S, (cam.x + W) / S, (cam.y + H) / S).map(t => ({ y: t.ground ? -Infinity : t.y, draw: () => drawThing(t, cam) })), ...NPCS.map(n => ({ y: n.y, draw: () => drawPlayer(n, cam, now) })), ...[...others.values()].map(o => ({ y: o.sit ? o.sit.by + 1 : o.y, draw: () => drawPlayer(o, cam, now) })), { y: me.sit ? me.sit.sp.by + 1 : me.y, draw: () => drawPlayer(me, cam, now) }];   // 앉아 있으면 벤치보다 앞에 그림
  scene.sort((a, b) => a.y - b.y).forEach(o => o.draw());
  drawClocks(cam);
  drawSky(cam, W, H, dt, now);
  NPCS.forEach(n => drawName(n, cam)); others.forEach(o => drawName(o, cam)); drawName(me, cam);
  const sp = !busy && (me.sit ? me.sit.phase === 'on' && { type: 'stand' } : nearSpot(me.x, me.y));
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
