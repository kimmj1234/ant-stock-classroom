'use strict';
// 기본 게임 화면: 맵(장면)을 픽셀 캐릭터가 8방향으로 걸어 다니고, 화면(카메라)이 따라감. 문 앞에서 E → 다른 장면, NPC 앞에서 E → 대화.
// 캐릭터 그림은 sprites.js, 장면 배치·그림은 town.js. 여기서는 겹쳐 그리기·이동·부딪힘·앞뒤 순서·E 행동만 함
{
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const SPEED = 240;                      // 화면에서 1초에 걷는 거리(px)
// 위치는 도시 픽셀 좌표(왼쪽 위 = 0, 0). 발밑 자리
const me = { name: '', x: START.x, y: START.y, look: DEFAULT_LOOK, dir: 'se', left: false, moving: false };   // dir: 보는 방향(sprites.js의 s·se·e·ne·n), left: 좌우 뒤집기
let S = 2;                              // 픽셀 배율 (픽셀 1칸 = S px). 매 프레임 화면이 맵으로 꽉 차게 정함

// ===== 게임 시간: 현실 1시간 = 게임 하루 (현실 2.5초 = 게임 1분, 현실 30분 = 게임 12시간) — 모든 사람이 같은 세계 시간 =====
// 서버가 정한 세계 시각을 접속할 때 받아서(/api/me의 world), 그 뒤로는 이 컴퓨터의 시계로 흘려 보냄 → 모두 같은 시각·날씨. 창을 열어도 멈추지 않음
// 달력은 실제와 같음: 게임 하루 = 달력 하루, 1년 365일, 처음은 3월 1일 오전 8시. 계절은 달로 정함(봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 12~2월)
const TIME_SPEED = 24;   // 현실 1초에 게임 24초 (서버 WORLD_SPEED와 같음) (달력·날씨·요일은 world.js)
const SEASONS = [['봄', '#f5a3b5'], ['여름', '#7ed36a'], ['가을', '#f2a03d'], ['겨울', '#bfe3f5']];
// ===== 한국(서울) 같은 계절: 해 뜨고 지는 시각, 날씨, 기온 =====
// 게임 날짜마다 "1년 중 며칠째"(1월 1일 = 0)를 구해서, 그날의 서울 해·날씨·기온을 씀. 게임 0일째 = 3월 1일(59)
// 해 뜨고 지는 시각(분): 하지(6월 21일) 5:11·19:57 → 낮이 가장 김 / 동지(12월 22일) 7:43·17:17 → 낮이 가장 짧음 / 춘분·추분 무렵 6:27·18:37
function sunTimes(day) {
  const c = Math.cos(2 * Math.PI * (doyOf(day) - 172) / 365);
  return { rise: 387 - 76 * c, set: 1117 + 80 * c };
}
const WX_NAME = { sun: '맑음', cloud: '흐림', rain: '비', snow: '눈', storm: '태풍', dust: '황사' };
const clock = { min: 480, base: 480, baseAt: 0, sent: '', ready: false };   // base: 받은 세계 시각(분), baseAt: 받은 순간, sent: 마지막으로 보낸 자리
function today(min) {
  const day = Math.floor(min / DAY), year = Math.floor(day / 365) + 1, [month, date] = monthDay(doyOf(day));
  const season = [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][month - 1];   // 1·2월 겨울, 3~5월 봄, 6~8월 여름, 9~11월 가을, 12월 겨울
  const wx = weatherOf(day), m = Math.floor(min % DAY), h = Math.floor(m / 60);   // 시각은 1분 단위 (현실 2.5초마다 바뀜)
  return {
    year, season, month, date, wx, ...sunTimes(day), weekday: WEEKDAYS[weekdayOf(day)],
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
  const body = JSON.stringify({ place: { scene: SCENE.name, x: Math.round(at.x), y: Math.round(at.y) } });
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
  b: '#a8703f', t: '#e8c58a', r: '#e8454b', n: '#5dbb4a', m: '#f7f8fa', s: '#3d7fd6', e: '#1f2a1f',   // 상품 그림
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
  // 마트 상품
  bread: ['..........', '..bbbbbb..', '.bttttttb.', 'bttbttbttb', 'bttttttttb', 'bttttttttb', '.bbbbbbbb.', '..........', '..........', '..........'],
  milk: ['...kkkk...', '..kmmmmk..', '.kmmmmmmk.', '.kssssssk.', '.kmmsmmmk.', '.kmmmmmmk.', '.kmsssmmk.', '.kmmmmmmk.', '.kkkkkkkk.', '..........'],
  apple: ['....bn....', '.....n....', '..rrrrrr..', '.rrwrrrrr.', '.rrrrrrrr.', '.rrrrrrrr.', '.rrrrrrrr.', '..rrrrrr..', '...r..r...', '..........'],
  ramen: ['..........', '.kkkkkkkk.', '.kwwwwwwk.', '.krrrrrrk.', '.krwwwwrk.', '.krrrrrrk.', '..krrrrk..', '..kwwwwk..', '..kkkkkk..', '..........'],
  kimbap: ['..........', '..eeeeee..', '.eewwwwee.', '.ewyrnwwe.', '.ewwnywwe.', '.eewwwwee.', '..eeeeee..', '..........', '..........', '..........'],
  drink: ['...kkkk...', '..kcccck..', '..kssssk..', '..kswwsk..', '..kssssk..', '..kssssk..', '..kswwsk..', '..kssssk..', '..kcccck..', '...kkkk...'],
  snack: ['..........', '..oooooo..', '.oyyyyyyo.', '.oyrryyyo.', '.oyrryyyo.', '.oyyyyyyo.', '.oyyyyyyo.', '..oooooo..', '..........', '..........'],
  umbrella: ['....k.....', '..ssssss..', '.ssssssss.', 'ssssssssss', 's..s..s..s', '....k.....', '....k.....', '....k.....', '..k.k.....', '...k......'],
  phone: ['.KKKKKKKKKKKK.', 'KKKKKKKKKKKKKK', 'KKKKKggggKKKKK', 'KKCCCCCCCCCCKK', 'KKCLLCCCCCCCKK', 'KKCLCCCCCCCCKK', 'KKCCCCCCCCCCKK', 'KKCCCCCCCRCCKK', 'KKCCCCCCRRCCKK', 'KKCCCCCRRRCCKK',
    'KKCCCRCRRRCCKK', 'KKCCRRRRRRCCKK', 'KKCRRRRRRRCCKK', 'KKCCCCCCCCCCKK', 'KKCCCCCCCCCCKK', 'KKCCCCCCCCCCKK', 'KKKKKKKKKKKKKK', 'KKKKKWWWWKKKKK', 'KKKKKKKKKKKKKK', '.KKKKKKKKKKKK.'],   // 휴대폰 (화면에 오르는 막대)
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
drawIcon('hudCoin', 'coin'); drawIcon('hudBag', 'bag'); drawIcon('hudPhone', 'phone');
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
  $hud('hudDay').textContent = (t.year > 1 ? t.year + '년 ' : '') + t.month + '월 ' + t.date + '일 (' + t.weekday + ')';   // 2년째부터는 몇 년째인지도
  $hud('hudWxText').textContent = t.wxName; drawIcon('hudWx', icon);
  $hud('hudTemp').textContent = temp + '°C';
  $hud('hudClock').textContent = t.time;
  $hud('hudCash').textContent = (me.cash || 0).toLocaleString('ko-KR');
}

// ===== 로그인 확인: 안 했거나 로그아웃하면 메인으로 =====
// ===== 함께 돌아다니기(멀티플레이) =====
// 0.15초마다 내 자리·방향·걷는지·앉은 벤치 자리·차림을 서버에 알리고(/api/move), 답장으로 같은 장면에 있는 다른 사람 목록을 받음 → others
// (앞 요청의 답장이 오기 전에는 새로 보내지 않아서, 느린 인터넷에서도 요청이 쌓이지 않음)
// 그리기: 받은 자리로 부드럽게 따라가며(멀리 떨어지면 바로 이동) 같은 캐릭터 그림·이름표로 그림. 벤치에 앉아 있으면 앉은 모양
const others = new Map();   // id → { name, look, x, y(지금 그리는 자리), tx, ty(받은 자리), dir, left, moving, seat }
let online = false, moveBusy = false, sentAt = 0;
const safeLook = l => (l && PARTS.body[l.body] && PARTS.face[l.face] && (!l.hat || PARTS.hat[l.hat.shape]) && (!l.suit || PARTS.suit[l.suit.shape]) ? l : DEFAULT_LOOK);   // 모르는 차림은 기본 차림으로
function gotOthers(list) {
  const seen = new Set();
  for (const p of list) {
    seen.add(p.id);
    const o = others.get(p.id);
    others.set(p.id, Object.assign(o || { x: p.x, y: p.y }, p, { x: o ? o.x : p.x, y: o ? o.y : p.y, tx: p.x, ty: p.y, look: safeLook(p.look) }));
  }
  for (const id of others.keys()) if (!seen.has(id)) others.delete(id);
}
function sendMove(now) {
  if (!online || moveBusy || now - sentAt < 150) return;
  moveBusy = true; sentAt = now;
  const seat = me.sit && me.sit.phase === 'on' ? SPOTS.indexOf(me.sit.sp) : null;
  const body = JSON.stringify({ scene: SCENE.name, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, left: me.left, moving: me.moving, seat, look: me.look });
  fetch('/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    .then(r => r.json()).then(r => { if (r.ok) gotOthers(r.others || []); })
    .catch(() => {}).finally(() => { moveBusy = false; });
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
  if (who.world != null) { clock.base = clock.min = who.world; clock.baseAt = performance.now(); }
  if (who.life) { me.cash = who.life.cash; me.bag = who.life.bag; me.stats = who.life.stats; clock.ready = true; }
  showHud();
  online = true;   // 이제부터 내 자리를 알리고 다른 사람을 받음
  // 서 있던 자리에서 이어서 시작. 튜토리얼을 이미 떠났으면 튜토리얼 쪽 자리는 무시하고 도시 입구로(다시 못 들어감)
  const pl = who.life?.place;
  if (pl && SCENES[pl.scene] && !(who.tutorialDone && TUTORIAL_SCENES.includes(pl.scene))) {
    useScene(pl.scene);
    ({ x: me.x, y: me.y } = blockedAt(pl.x, pl.y) ? START : pl);   // 그 자리가 막혔으면(맵이 바뀐 경우 등) 처음 자리
    me.dir = 's';
  } else if (who.tutorialDone && TUTORIAL_SCENES.includes(SCENE.name)) { useScene('city'); me.x = START.x; me.y = START.y; }
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
// ===== 마트 창: 상품 목록은 서버에서 받아(값은 서버가 정함) 줄마다 그림·이름·값·사기 버튼. 돈이 모자라거나 가방이 차면 버튼이 흐려짐 =====
let shopItems = null, shopBagSize = BAG_SLOTS;
function fillShop() {
  const bagN = (me.bag || []).length;
  $hud('shopCash').textContent = won(me.cash || 0);
  $hud('shopBag').textContent = `가방 ${bagN} / ${shopBagSize}칸`;
  $hud('shopList').innerHTML = shopItems.map(it => `<li><canvas id="shopIco-${it.id}"></canvas><span>${it.name}</span><span class="price">${won(it.price)}원</span><button type="button" data-buy="${it.id}" ${(me.cash || 0) < it.price || bagN >= shopBagSize ? 'disabled' : ''}>사기</button></li>`).join('');
  shopItems.forEach(it => ICONS[it.id] && drawIcon('shopIco-' + it.id, it.id));
}
document.addEventListener('shopopen', async () => {
  if (!shopItems) {
    const r = await fetch('/api/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()).catch(() => null);
    if (!r?.ok) return notify('마트 상품을 불러오지 못했어요.');
    shopItems = r.items; shopBagSize = r.bagSize;
  }
  fillShop(); document.dispatchEvent(new Event('shopready'));
});
$hud('shopList').addEventListener('click', async e => {
  const btn = e.target.closest('[data-buy]');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const r = await fetch('/api/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: btn.dataset.buy }) }).then(r => r.json()).catch(() => ({ ok: false, msg: '서버와 연결이 안 돼요.' }));
  if (r.ok) { me.cash = r.cash; me.bag = r.bag; notify(`${r.bag[r.bag.length - 1].name}을(를) 샀어요! 가방에 넣었어요.`); } else notify(r.msg);
  fillShop();
  ($hud('shopList').querySelector(`[data-buy="${btn.dataset.buy}"]:not(:disabled)`) || $hud('shopList').querySelector('button:not(:disabled)') || $hud('shopClose')).focus();
});
// ===== 고속버스 표 창: 행선지와 요금은 서버가 정함. 표를 사면 돈을 내고 그 지역 터미널 앞으로 (화면이 어두워졌다 밝아짐) =====
let routes = [];
function fillTravel(here) {
  $hud('travelCash').textContent = won(me.cash || 0);
  $hud('travelHere').textContent = '출발: ' + here;
  $hud('travelList').innerHTML = routes.map(r => `<li><span><b>${r.name}</b><small>${COUNTRY.INFO[r.name] || ''}</small></span><span class="price">${won(r.fare)}원</span><button type="button" data-go="${r.name}" ${(me.cash || 0) < r.fare ? 'disabled' : ''}>가기</button></li>`).join('');
}
const post = (name, body) => fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json()).catch(() => ({ ok: false, msg: '서버와 연결이 안 돼요.' }));
document.addEventListener('travelopen', async () => {
  const r = await post('routes');
  if (!r.ok) { window.closeTravel(); return notify(r.msg); }
  routes = r.routes; fillTravel(r.here); document.dispatchEvent(new Event('travelready'));
});
$hud('travelList').addEventListener('click', async e => {
  const btn = e.target.closest('[data-go]');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const r = await post('travel', { to: btn.dataset.go });
  if (!r.ok) { notify(r.msg); return fillTravel(SCENE.region || '한가람'); }
  me.cash = r.cash; window.closeTravel();
  notify(`${r.region}행 고속버스를 탔어요! (${won(r.fare)}원)`);
  fade = { t0: performance.now(), sp: { to: r.place.scene, at: { x: r.place.x, y: r.place.y }, face: 's' }, done: false };
});
// ===== 휴대폰 주식 앱 "한울증권": 시세 · 종목(차트·사고팔기) · 내 주식 · 뉴스 =====
// 시세와 뉴스는 서버(economy.js)가 정함. 휴대폰이 열려 있으면 2초마다, 닫혀 있어도 15초마다 받아서 새 뉴스는 화면 위에 [속보]로 알림
// 한국 증권 앱처럼 오르면 빨강(▲), 내리면 파랑(▼)
const phone = { tab: 'list', sel: null, data: null, seen: null };
const pct = (a, b) => b ? (a - b) / b * 100 : 0;
const tone = d => d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
const signed = (n, f = won) => (n > 0 ? '▲' : n < 0 ? '▼' : '') + f(Math.abs(n));
const whenOf = min => { const t = today(min); return `${t.month}월 ${t.date}일 ${t.time}`; };
async function loadMarket() {
  const r = await post('market', { sel: phone.tab === 'detail' ? phone.sel : null });   // 고른 종목만 오늘 가격·일봉을 같이 받음
  if (!r.ok) return;
  phone.data = r; me.cash = r.cash; me.holdings = r.holdings;
  (r.notes || []).forEach((n, i) => setTimeout(() => notify(n), i * 2700));   // 예약 주문 체결·취소, 배당 알림
  const latest = r.news[0] && r.news[0].min + r.news[0].text;
  if (phone.seen !== null && latest && latest !== phone.seen && $hud('phoneWrap').hidden) notify('[속보] ' + r.news[0].text);   // 휴대폰을 안 보고 있을 때 새 뉴스
  phone.seen = latest || '';
  if (!$hud('phoneWrap').hidden && phone.app === 'stock') renderPhone();
}
setInterval(() => { if (me.basicUI && online) loadMarket(); }, 15000);
document.addEventListener('phoneopen', () => { renderPhone(); if (phone.app === 'stock') loadMarket(); if (phone.app === 'job') loadJob(); });
setInterval(() => { if (!$hud('phoneWrap').hidden && phone.app === 'stock') loadMarket(); }, 2000);

// ===== 한울증권: 시세(정렬·관심) · 종목(재무·호가·분봉/일봉·주문) · 관심 · 내 주식 · 내역 · 뉴스 =====
const capText = v => v >= 1e12 ? (v / 1e12).toFixed(1) + '조' : won(Math.round(v / 1e8)) + '억';
const volText = v => v >= 1e6 ? (v / 1e6).toFixed(1) + '백만' : v >= 1e4 ? (v / 1e4).toFixed(1) + '만' : won(v);
const idNum = id => [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
const starred = id => (phone.data?.watch || []).includes(id);
const tagsOf = s => (s.vi ? '<em class="mk-tag tv">VI</em>' : '') + (s.price >= s.up ? '<em class="mk-tag tu">상한가</em>' : s.price <= s.dn ? '<em class="mk-tag td">하한가</em>' : '') + (s.nextDiv ? '<em class="mk-tag tg">배당</em>' : '') + (s.listDay != null && Math.floor(clock.min / DAY) - s.listDay < 5 ? '<em class="mk-tag tn">신규</em>' : '');
const SORTS = [['def', '기본'], ['up', '상승률'], ['down', '하락률'], ['amt', '거래대금'], ['cap', '시가총액']];
function sortedStocks(d) {
  const f = { up: s => -(s.price / s.prev), down: s => s.price / s.prev, amt: s => -s.amt, cap: s => -s.cap }[phone.sort || 'def'], a = d.stocks.slice();
  return f ? a.sort((x, y) => f(x) - f(y)) : a;
}
function stockRow(s) {
  const ch = s.price - s.prev, w = starred(s.id);
  return `<li class="mk-li"><button type="button" class="mk-star" data-watch="${s.id}" aria-label="${s.name} 관심 종목" aria-pressed="${w}">${w ? '★' : '☆'}</button><button type="button" class="mk-row" data-stock="${s.id}"><span>${s.name} ${tagsOf(s)}<small>${s.sector} · 시총 ${capText(s.cap)} · 거래 ${volText(s.vol)}주</small></span><span class="mk-price ${tone(ch)}">${won(s.price)}<small class="${tone(ch)}">${signed(ch)} (${pct(s.price, s.prev).toFixed(2)}%)</small></span></button></li>`;
}
const orderRows = (d, only) => (d.orders || []).filter(o => !only || o.id === only).map(o => `<li class="mk-ord"><span><b class="${o.side === 'buy' ? 'up' : 'down'}">${o.side === 'buy' ? '매수' : '매도'}</b> ${o.name} ${o.qty}주 · ${won(o.limit)}원<small>오늘 자정까지 기다려요</small></span><button type="button" data-cancel="${o.oid}">취소</button></li>`).join('');
function renderStock() {
  const d = phone.data, scr = $hud('phoneScreen');
  if (!d) { scr.innerHTML = '<p class="mk-empty">시세를 불러오는 중…</p>'; return; }
  const st = $hud('mkStatus'), nx = today(d.next), idx = `한울종합 ${won(d.index)} (${d.idxChg >= 0 ? '+' : ''}${d.idxChg.toFixed(2)}%) · `;
  st.className = 'phone-status ' + (d.open && !d.halt ? 'open' : '');
  st.textContent = idx + (d.halt ? '서킷브레이커 발동 중 · 모든 매매 정지' : d.open ? '24시간 거래 중' : `장 마감 · 다음 개장 ${nx.month}월 ${nx.date}일 (${nx.weekday}) 09:00`);
  $hud('phoneClock').textContent = today(clock.min).time;
  if (phone.tab === 'detail') return renderDetail();
  if (phone.tab === 'list' || phone.tab === 'watch') {
    const list = phone.tab === 'watch' ? sortedStocks(d).filter(s => starred(s.id)) : sortedStocks(d), ups = d.stocks.filter(s => s.price > s.prev).length, downs = d.stocks.filter(s => s.price < s.prev).length;
    const sub = (d.ipos || []).find(p => p.stage === 'subscribe');
    scr.innerHTML = (sub ? `<button type="button" class="mk-banner" data-tabgo="ipo">공모주 청약 중 · ${sub.name} (공모가 ${won(sub.price)}원) ›</button>` : '') + `<div class="mk-chips" role="group" aria-label="정렬">${SORTS.map(([k, label]) => `<button type="button" data-sort="${k}" aria-pressed="${(phone.sort || 'def') === k}">${label}</button>`).join('')}<small>오른 ${ups} · 내린 ${downs}</small></div>`
      + (list.length ? '<ul class="mk-list">' + list.map(stockRow).join('') + '</ul>' : '<p class="mk-empty">관심 종목이 없어요. 시세에서 ☆를 눌러 넣어 보세요.</p>');
  } else if (phone.tab === 'mine') {
    const rows = d.stocks.filter(s => d.holdings[s.id]).map(s => ({ s, h: d.holdings[s.id], val: s.price * d.holdings[s.id].qty }));
    const val = rows.reduce((a, r) => a + r.val, 0), cost = rows.reduce((a, r) => a + r.h.cost, 0);
    scr.innerHTML = `<div class="mk-sum"><span>주식 평가금액</span><b>${won(val)}원</b><span>평가 손익</span><b class="${tone(val - cost)}">${signed(val - cost)}원 (${pct(val, cost).toFixed(2)}%)</b><span>실현 손익</span><b class="${tone(d.realized)}">${signed(d.realized)}원</b><span>받은 배당</span><b>${won(d.divIncome)}원</b><span>현금</span><b>${won(d.cash)}원</b></div>`
      + (rows.length ? '<ul class="mk-list">' + rows.map(({ s, h, val: v }) => `<li><button type="button" class="mk-row" data-stock="${s.id}"><span>${s.name}<small>${h.qty}주 · 평균 ${won(Math.round(h.cost / h.qty))}원${s.dps ? ' · 배당 ' + (s.yield * 100).toFixed(1) + '%' : ''}</small></span><span class="mk-price ${tone(v - h.cost)}">${won(v)}<small class="${tone(v - h.cost)}">${signed(v - h.cost)} (${pct(v, h.cost).toFixed(2)}%)</small></span></button></li>`).join('') + '</ul>'
        : '<p class="mk-empty">아직 가진 주식이 없어요. 시세에서 회사를 골라 사 보세요.</p>')
      + ((d.orders || []).length ? '<h3 class="mk-h">예약 주문</h3><ul class="mk-list">' + orderRows(d) + '</ul>' : '');
  } else if (phone.tab === 'ipo') {
    renderIpo(d, scr);
  } else if (phone.tab === 'hist') {
    const tr = (d.trades || []).slice().reverse();
    scr.innerHTML = `<div class="mk-sum"><span>실현 손익</span><b class="${tone(d.realized)}">${signed(d.realized)}원</b><span>받은 배당(세후)</span><b>${won(d.divIncome)}원</b><span>낸 수수료·세금</span><b>${won(d.fees)}원</b></div>`
      + (tr.length ? '<ul class="mk-news">' + tr.map(t => t.side === 'ipo' ? `<li><small>${whenOf(t.min)}</small><b class="gold">공모 배정</b> ${t.name} ${t.qty}주 × ${won(t.price)}원<small>상장일부터 거래할 수 있어요</small></li>` : t.side === 'div' ? `<li><small>${whenOf(t.min)}</small><b class="gold">배당</b> ${t.name} ${t.qty}주 × ${won(t.price)}원 <b>+${won(t.pnl)}원</b><small>세금 ${won(t.tax)}원 뗌</small></li>`
        : `<li><small>${whenOf(t.min)}</small><b class="${t.side === 'buy' ? 'up' : 'down'}">${t.side === 'buy' ? '매수' : '매도'}</b> ${t.name} ${t.qty}주 × ${won(t.price)}원${t.pnl != null ? ` <b class="${tone(t.pnl)}">${signed(t.pnl)}원</b>` : ''}<small>수수료 ${won(t.fee)}원${t.tax ? ' · 세금 ' + won(t.tax) + '원' : ''}</small></li>`).join('') + '</ul>' : '<p class="mk-empty">아직 거래가 없어요.</p>');
  } else {
    scr.innerHTML = d.news.length ? '<ul class="mk-news">' + d.news.map(n => `<li><small>${whenOf(n.min)}</small><span class="${n.up ? 'up' : 'down'}">${n.up ? '▲' : '▼'}</span> ${n.text}<small>${n.ids.map(id => d.stocks.find(s => s.id === id)?.name).filter(Boolean).join(' · ')}</small></li>`).join('') + '</ul>'
      : '<p class="mk-empty">아직 뉴스가 없어요.</p>';
  }
}
// ===== 공모(신규 상장): 단계 · 공모가 · 경쟁률 · 청약 · 배정 · 상장 =====
const IPO_NAME = { announce: '수요예측 전', booked: '청약 대기', subscribe: '청약 중', closed: '배정 대기', allocated: '상장 대기', listed: '상장', withdrawn: '철회' };
const IPO_CUR = { announce: 1, booked: 2, subscribe: 2, closed: 3, allocated: 4, listed: 5, withdrawn: -1 };
const dayText = m => { const t = today(m); return t.month + '/' + t.date; };
phone.ipoQty = {};
function ipoEst(p, d, qty) {
  const dep = Math.ceil(qty * p.price * 0.5);
  return `${qty}주 × 공모가 ${won(p.price)}원 = ${won(qty * p.price)}원 · 증거금 50% ${won(dep)}원을 맡겨요 (배정 뒤 남는 돈은 환불) · 현금 ${won(d.cash)}원`;
}
function ipoCard(p, d) {
  const app = (d.ipoApps || {})[p.id], s = d.stocks.find(x => x.id === p.id), have = d.holdings[p.id], mid = (p.band[0] + p.band[1]) / 2, cap = (p.price ?? mid) * p.shares, cur = IPO_CUR[p.stage];
  const steps = [['공시', p.t.ann], ['수요예측', p.t.book], ['청약', p.t.subS], ['배정·환불', p.t.alloc], ['상장', p.t.list]];
  const rows = [['희망 공모가', won(p.band[0]) + '~' + won(p.band[1]) + '원'], ['확정 공모가', p.price ? '<b>' + won(p.price) + '원</b>' : '수요예측 뒤 확정'], ['공모 주식', won(p.offered) + '주'], ['일반 청약 물량', won(p.pub) + '주'],
    ['시가총액(공모가)', capText(cap)], ['PER(공모가)', (Math.round(cap / p.profit * 10) / 10) + '배'], ['기관 경쟁률', p.inst ? won(p.inst) + ':1' : '-'], ['일반 경쟁률', p.ratio != null ? won(p.ratio) + ':1' + (p.ratio < 1 ? ' 미달' : '') : '-']];
  let act = '';
  if (p.stage === 'subscribe') {
    const q = phone.ipoQty[p.id] ?? 1;
    act = app ? `<p class="ipo-msg">청약 완료: ${won(app.qty)}주 · 증거금 ${won(app.deposit)}원을 맡겼어요. 배정은 ${dayText(p.t.alloc)} 9시에 알려 드려요.</p><button type="button" class="ipo-btn cancel" data-ipocancel="${p.id}">청약 취소 (증거금 돌려받기)</button>`
      : `<div class="mk-order"><button type="button" class="mk-step" data-ipostep="${p.id}" data-d="-1" aria-label="1주 빼기">−</button><input type="number" min="1" max="${p.maxQty}" value="${q}" data-ipoqty="${p.id}" inputmode="numeric" aria-label="청약 수량(주)"><button type="button" class="mk-step" data-ipostep="${p.id}" data-d="1" aria-label="1주 더하기">+</button></div>
        <div class="mk-est" data-ipoest="${p.id}">${ipoEst(p, d, q)}</div><button type="button" class="ipo-btn" data-ipoapply="${p.id}" ${d.cash < Math.ceil(q * p.price * 0.5) ? 'disabled' : ''}>청약하기 (최대 ${won(p.maxQty)}주)</button>`;
  } else if (p.stage === 'closed' || p.stage === 'allocated') act = '<p class="ipo-msg">청약이 끝났어요. ' + (p.stage === 'closed' ? dayText(p.t.alloc) + ' 배정·환불' : '배정·환불 완료, ' + dayText(p.t.list) + ' 상장') + '이에요.' + (have && !s ? ' 내가 배정받은 주식: <b>' + have.qty + '주</b> (상장일부터 거래)' : '') + '</p>';
  else if (p.stage === 'listed') act = `<p class="ipo-msg">시초가 ${won(p.open)}원 (공모가의 ${Math.round(p.openMult * 100)}%)${s ? ' · 지금 ' + won(s.price) + '원 (<span class="' + tone(s.price - p.price) + '">공모가 대비 ' + (s.price >= p.price ? '+' : '') + pct(s.price, p.price).toFixed(1) + '%</span>)' : ''}${have ? ' · 내 주식 <b>' + have.qty + '주</b>' : ''}</p>${s ? `<button type="button" class="ipo-btn" data-stock="${p.id}">시세·주문 보기</button>` : ''}`;
  else if (p.stage === 'withdrawn') act = '<p class="ipo-msg">수요예측이 부진해 상장을 철회했어요.</p>';
  else act = '<p class="ipo-msg">수요예측(' + dayText(p.t.book) + ') 결과로 공모가가 정해져요. 기관 경쟁률이 높을수록 공모가가 밴드 상단으로 올라가요.</p>';
  return `<section class="ipo-card"><div class="ipo-head"><b>${p.name}</b> <em class="mk-tag ${p.stage === 'subscribe' ? 'tu' : p.stage === 'withdrawn' ? 'td' : 'tg'}">${IPO_NAME[p.stage]}</em><small>${p.sector} · ${p.region}</small></div><p class="ipo-desc">${p.desc}</p>
    <ol class="ipo-steps">${steps.map(([k, m], i) => `<li class="${p.stage === 'withdrawn' ? '' : i < cur ? 'done' : i === cur ? 'now' : ''}"><b>${k}</b><small>${dayText(m)}</small></li>`).join('')}</ol>
    <div class="mk-grid">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>${act}</section>`;
}
function renderIpo(d, scr) {
  if (scr.contains(document.activeElement) && document.activeElement.matches?.('input')) return;   // 수량을 적는 중엔 화면을 다시 그리지 않음
  const list = d.ipos || [], active = list.filter(p => p.stage !== 'listed' && p.stage !== 'withdrawn'), done = list.filter(p => p.stage === 'listed' || p.stage === 'withdrawn');
  scr.innerHTML = '<p class="ipo-help">신규 상장(IPO): 공시 → 수요예측(공모가 확정) → 일반 청약 이틀(증거금 50%) → 배정·환불 → 상장. 경쟁률이 높으면 신청한 양과 관계없이 조금만 배정받고, 미달이면 신청한 만큼 모두 받아요.</p>'
    + (active.length ? active.map(p => ipoCard(p, d)).join('') : '<p class="mk-empty">지금 공모 중인 회사가 없어요. 새로 상장하려는 회사가 생기면 여기에 공시돼요.</p>')
    + (done.length ? '<h3 class="mk-h">최근 상장</h3>' + done.map(p => ipoCard(p, d)).join('') : '');
}
// 호가창: 매도 호가 다섯(위, 파랑) · 매수 호가 다섯(아래, 빨강). 물량은 그 종목의 하루 거래량에 맞춰 시각마다 조금씩 달라짐
function bookHTML(s) {
  const base = s.avgVol / 390, slot = Math.floor(clock.min / 2), n = idNum(s.id), size = (k, side) => Math.max(1, Math.round(base * (0.3 + hash(slot, n * 13 + k, side) * 1.6) * (1 + (5 - k) * 0.12))), rows = [];
  for (let k = 5; k >= 1; k--) { const p = s.price + k * s.tick; if (p <= s.up) rows.push(['a', p, size(k, 1)]); }
  for (let k = 0; k < 5; k++) { const p = s.price - k * s.tick; if (p >= s.dn) rows.push(['b', p, size(k + 6, 2)]); }
  const mx = Math.max(...rows.map(r => r[2]));
  return rows.map(([side, p, q]) => `<div class="bk ${side}"><span>${won(p)}</span><i style="width:${Math.max(6, q / mx * 100)}%"></i><b>${won(q)}</b></div>`).join('');
}
// 종목 화면: 처음 한 번 틀을 만들고, 그 뒤엔 숫자·차트만 바꿈(적고 있는 수량·가격이 지워지지 않게)
function renderDetail() {
  const d = phone.data, s = d.stocks.find(s => s.id === phone.sel), scr = $hud('phoneScreen');
  if (!s) { phone.tab = 'list'; return renderPhone(); }
  if (!scr.querySelector('#mkChart') || scr.dataset.shown !== s.id) {
    scr.dataset.shown = s.id; phone.limitSet = false;
    scr.innerHTML = `<div class="mk-detail"><div class="mk-top"><button type="button" class="mk-back" data-back>‹ 시세</button><button type="button" class="mk-star" data-watch="${s.id}" id="mkStar" aria-label="관심 종목"></button></div>
      <div><b class="mk-name">${s.name}</b> <span id="mkTags"></span> <small>${s.sector} · 본사 ${s.region}</small></div>
      <div><b class="mk-big" id="mkPrice"></b> <span id="mkChange"></span></div>
      <div class="mk-seg" role="group" aria-label="차트 종류"><button type="button" data-chart="min">오늘</button><button type="button" data-chart="day">일봉</button></div>
      <canvas id="mkChart" aria-label="가격 차트"></canvas>
      <div class="mk-grid" id="mkGrid"></div>
      <div class="mk-div" id="mkDiv"></div>
      <div class="mk-book" id="mkBook" aria-label="호가"></div>
      <div class="mk-own" id="mkOwn"></div>
      <div class="mk-seg" role="group" aria-label="주문 방법"><button type="button" data-ot="market">시장가</button><button type="button" data-ot="limit">지정가</button></div>
      <div class="mk-order" id="mkLimitRow"><button type="button" class="mk-step" data-lstep="-1" aria-label="한 호가 내리기">−</button><input id="mkLimit" type="number" min="1" inputmode="numeric" aria-label="주문 가격(원)"><button type="button" class="mk-step" data-lstep="1" aria-label="한 호가 올리기">+</button></div>
      <div class="mk-order"><button type="button" class="mk-step" data-step="-1" aria-label="1주 빼기">−</button><input id="mkQty" type="number" min="1" max="100000" value="1" inputmode="numeric" aria-label="주문 수량(주)"><button type="button" class="mk-step" data-step="1" aria-label="1주 더하기">+</button></div>
      <div class="mk-est" id="mkEst"></div>
      <div class="mk-btns"><button type="button" class="mk-buy" data-side="buy">사기</button><button type="button" class="mk-sell" data-side="sell">팔기</button></div>
      <p class="mk-msg" id="mkMsg" role="status"></p><ul class="mk-list" id="mkOrders"></ul></div>`;
  }
  const ch = s.price - s.prev, h = d.holdings[s.id], ot = phone.ot || 'market', qty = Math.max(1, Math.floor(+$hud('mkQty').value || 1));
  const locked = (d.orders || []).filter(o => o.id === s.id && o.side === 'sell').reduce((n, o) => n + o.qty, 0), halted = s.vi || d.halt;
  if (ot === 'limit' && !phone.limitSet) { $hud('mkLimit').value = s.price; phone.limitSet = true; }
  const limit = Math.round(+$hud('mkLimit').value / s.tick) * s.tick, limitOk = limit >= s.dn && limit <= s.up;
  $hud('mkStar').textContent = starred(s.id) ? '★' : '☆'; $hud('mkStar').setAttribute('aria-pressed', starred(s.id));
  $hud('mkTags').innerHTML = tagsOf(s);
  $hud('mkPrice').textContent = won(s.price) + '원'; $hud('mkPrice').className = 'mk-big ' + tone(ch);
  $hud('mkChange').innerHTML = `<span class="${tone(ch)}">${signed(ch)} (${pct(s.price, s.prev).toFixed(2)}%)</span>`;
  document.querySelectorAll('[data-chart]').forEach(b => b.setAttribute('aria-pressed', b.dataset.chart === (phone.chart || 'min')));
  document.querySelectorAll('[data-ot]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ot === ot));
  $hud('mkLimitRow').hidden = ot !== 'limit';
  $hud('mkGrid').innerHTML = [['시가', won(s.open)], ['전일 종가', won(s.prev)], ['고가', won(s.high), 'up'], ['저가', won(s.low), 'down'], ['거래량', volText(s.vol) + '주'], ['거래대금', won(Math.round(s.amt / 1e6)) + '백만'],
    ['시가총액', capText(s.cap)], ['PER', s.per ? s.per + '배' : '적자'], ['EPS', won(s.eps) + '원'], ['배당(연)', s.dps ? won(s.dps) + '원 (' + (s.yield * 100).toFixed(1) + '%)' : '없음'], ['60일 최고', won(s.hi60), 'up'], ['60일 최저', won(s.lo60), 'down'], ['상한가', won(s.up), 'up'], ['하한가', won(s.dn), 'down']]
    .map(([k, v, c]) => `<span>${k}</span><b class="${c || ''}">${v}</b>`).join('');
  const nd = s.nextDiv && today(s.nextDiv.exDay * DAY);
  $hud('mkDiv').textContent = nd ? `배당 예정: 주당 ${won(s.nextDiv.dps)}원 · 배당락일 ${nd.month}월 ${nd.date}일 (그날 0시에 가진 주식에 지급, 세금 15.4%)` : '';
  $hud('mkBook').innerHTML = bookHTML(s);
  $hud('mkOwn').innerHTML = h ? `가진 주식 <b>${h.qty}주</b>${locked ? ' (예약에 ' + locked + '주 묶임)' : ''} · 평균 ${won(Math.round(h.cost / h.qty))}원 · <span class="${tone(s.price * h.qty - h.cost)}">${signed(s.price * h.qty - h.cost)}원</span>` : '가진 주식 없음';
  const marketable = ot === 'market' || limit >= s.price, px = ot === 'market' ? s.price : limit;
  const nx = today(d.next);
  $hud('mkEst').textContent = !d.open ? `장이 닫혀 있어서 지금은 주문할 수 없어요. 다음 개장: ${nx.month}월 ${nx.date}일 (${nx.weekday}) 09:00 (곧 열려요)` : halted ? (d.halt ? '서킷브레이커로 모든 매매가 정지돼 있어요.' : 'VI 발동 중: 2분간 주문할 수 없어요.')
    : `${qty}주 × ${won(px)}원 = ${won(px * qty)}원 (수수료 0.015%, 팔 때 세금 0.18%)${ot === 'limit' ? (limitOk ? (limit === s.price ? ' · 지금 가격이라 바로 체결' : ' · 가격이 닿으면 체결, 오늘 자정까지') : ' · 가격은 ' + won(s.dn) + '~' + won(s.up) + '원 사이') : ''} · 현금 ${won(d.cash)}원`;
  const buy = document.querySelector('.mk-buy'), sell = document.querySelector('.mk-sell');
  buy.textContent = ot === 'limit' && limit < s.price ? '예약 사기' : '사기'; sell.textContent = ot === 'limit' && limit > s.price ? '예약 팔기' : '팔기';
  buy.disabled = !d.open || halted || (ot === 'limit' && !limitOk) || d.cash < px * qty;
  sell.disabled = !d.open || halted || (ot === 'limit' && !limitOk) || !h || h.qty - locked < qty;
  $hud('mkOrders').innerHTML = orderRows(d, s.id) ? '<h3 class="mk-h">내 예약 주문</h3>' + orderRows(d, s.id) : '';
  drawChart(s);
}
// 차트: 오늘(1분 가격 선, 전일 종가 점선) / 일봉(최근 40일 캔들 + 5일 평균선 + 거래량). 빨강 = 전일·시가보다 높음, 파랑 = 낮음
function drawChart(s) {
  const c = $hud('mkChart'), dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (!w) return;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.fillStyle = '#6a6680'; g.font = "11px Galmuri11, monospace";
  if ((phone.chart || 'min') === 'day') {
    const days = s.daily.concat([[0, s.open, s.high, s.low, s.price, s.vol]]), n = days.length;
    if (n < 2) { g.fillText('일봉은 하루가 지나면 쌓여요', 6, 13); return; }
    const lo = Math.min(...days.map(d => d[3])), hi = Math.max(...days.map(d => d[2])), pad = (hi - lo) * 0.08 || hi * 0.01, ch = h * 0.74, vmax = Math.max(...days.map(d => d[5]), 1);
    const y = v => 6 + (hi + pad - v) / (hi - lo + pad * 2) * (ch - 8), bw = (w - 8) / n, x = i => 4 + (i + 0.5) * bw;
    days.forEach((d, i) => {
      const up = d[4] >= d[1], col = up ? '#d32f2f' : '#1e5bd8';
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(x(i), y(d[2])); g.lineTo(x(i), y(d[3])); g.stroke();
      const top = y(Math.max(d[1], d[4])), bot = y(Math.min(d[1], d[4]));
      g.fillRect(x(i) - Math.max(1, bw * 0.3), top, Math.max(2, bw * 0.6), Math.max(1, bot - top));
      g.globalAlpha = 0.35; g.fillRect(x(i) - Math.max(1, bw * 0.3), h - 2 - d[5] / vmax * (h * 0.2), Math.max(2, bw * 0.6), d[5] / vmax * (h * 0.2)); g.globalAlpha = 1;
    });
    g.strokeStyle = '#f2a03d'; g.lineWidth = 1.5; g.beginPath();
    days.forEach((d, i) => { if (i < 4) return; const ma = days.slice(i - 4, i + 1).reduce((a, b) => a + b[4], 0) / 5; i === 4 ? g.moveTo(x(i), y(ma)) : g.lineTo(x(i), y(ma)); }); g.stroke();
    g.fillStyle = '#6a6680'; g.fillText('일봉 (최근 ' + n + '일) · 주황 = 5일 평균', 6, 13);
    return;
  }
  const pts = s.hist.length > 1 ? s.hist : [s.prev, s.price];
  const lo = Math.min(...pts, s.prev), hi = Math.max(...pts, s.prev), pad = (hi - lo) * 0.1 || hi * 0.01;
  const y = v => h - 8 - (v - lo + pad) / (hi - lo + pad * 2) * (h - 16), x = i => 4 + i / 1439 * (w - 8);
  g.strokeStyle = '#9a96a8'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, y(s.prev)); g.lineTo(w, y(s.prev)); g.stroke(); g.setLineDash([]);
  const col = s.price >= s.prev ? '#d32f2f' : '#1e5bd8';
  g.beginPath(); pts.forEach((v, i) => i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)));
  g.strokeStyle = col; g.lineWidth = 2; g.stroke();
  g.lineTo(x(pts.length - 1), h); g.lineTo(x(0), h); g.closePath(); g.fillStyle = col + '22'; g.fill();
  g.fillStyle = '#6a6680'; g.fillText('오늘 (00:00~24:00)', 6, 13);
}
$hud('phoneScreen').addEventListener('click', async e => {
  const t = e.target;
  const w = t.closest('[data-watch]');
  if (w) { const r = await post('watch', { id: w.dataset.watch }); if (r.ok) { phone.data.watch = r.watch; renderPhone(); } return; }
  const tg = t.closest('[data-tabgo]'); if (tg) { phone.tab = tg.dataset.tabgo; return renderPhone(); }
  const ia = t.closest('[data-ipoapply]');
  if (ia) { const id = ia.dataset.ipoapply, q = Math.floor(+document.querySelector(`[data-ipoqty="${id}"]`).value); ia.disabled = true; const r = await post('ipoapply', { id, qty: q }); notify(r.ok ? '청약했어요! 증거금을 맡겼어요. 배정 결과는 알림으로 알려 드려요.' : r.msg); return loadMarket(); }
  const ic = t.closest('[data-ipocancel]');
  if (ic) { const r = await post('ipocancel', { id: ic.dataset.ipocancel }); notify(r.ok ? '청약을 취소했어요. 증거금을 돌려받았어요.' : r.msg); return loadMarket(); }
  const is = t.closest('[data-ipostep]');
  if (is) { const id = is.dataset.ipostep, p = phone.data.ipos.find(x => x.id === id), inp = document.querySelector(`[data-ipoqty="${id}"]`); phone.ipoQty[id] = Math.max(1, Math.min(p.maxQty, (+inp.value || 1) + +is.dataset.d)); return renderPhone(); }
  const so = t.closest('[data-sort]');
  if (so) { phone.sort = so.dataset.sort; return renderPhone(); }
  if (t.closest('[data-stock]')) { phone.sel = t.closest('[data-stock]').dataset.stock; phone.tab = 'detail'; renderPhone(); return loadMarket(); }
  if (t.closest('[data-back]')) { phone.tab = 'list'; return renderPhone(); }
  const ch = t.closest('[data-chart]'); if (ch) { phone.chart = ch.dataset.chart; return renderDetail(); }
  const ot = t.closest('[data-ot]'); if (ot) { phone.ot = ot.dataset.ot; return renderDetail(); }
  if (t.closest('[data-step]')) { const q = $hud('mkQty'); q.value = Math.max(1, (+q.value || 1) + +t.closest('[data-step]').dataset.step); return renderDetail(); }
  const ls = t.closest('[data-lstep]');
  if (ls) { const s = phone.data.stocks.find(s => s.id === phone.sel), l = $hud('mkLimit'); l.value = Math.min(s.up, Math.max(s.dn, (Math.round(+l.value / s.tick) || Math.round(s.price / s.tick)) * s.tick + +ls.dataset.lstep * s.tick)); return renderDetail(); }
  const cn = t.closest('[data-cancel]');
  if (cn) { const r = await post('cancelorder', { oid: +cn.dataset.cancel }); notify(r.ok ? '예약 주문을 취소했어요. 묶어 둔 돈을 돌려받았어요.' : r.msg); return loadMarket(); }
  const side = t.closest('[data-side]')?.dataset.side;
  if (!side) return;
  const s = phone.data.stocks.find(s => s.id === phone.sel), qty = Math.floor(+$hud('mkQty').value), type = phone.ot || 'market', body = { id: phone.sel, side, qty, type };
  if (type === 'limit') body.limit = +$hud('mkLimit').value;
  t.disabled = true;
  const r = await post('trade', body);
  $hud('mkMsg').textContent = r.ok ? (r.pending ? `예약 주문을 걸었어요 (${side === 'buy' ? '매수' : '매도'} ${qty}주 · ${won(r.order.limit)}원, 오늘 자정까지)` : `${s.name} ${r.qty}주 ${side === 'buy' ? '샀어요' : '팔았어요'} (${won(r.price)}원)`) : r.msg;
  if (r.ok) { me.cash = r.cash; notify(r.pending ? `${s.name} ${side === 'buy' ? '매수' : '매도'} 예약 접수 · ${won(r.order.limit)}원` : `${s.name} ${r.qty}주 ${side === 'buy' ? '매수' : '매도'} 체결 · ${won(r.price)}원`); }
  loadMarket();
});
$hud('phoneScreen').addEventListener('input', e => {
  if (e.target.id === 'mkQty' || e.target.id === 'mkLimit') renderDetail();
  const id = e.target.dataset?.ipoqty;
  if (id) {   // 청약 수량: 화면을 다시 그리지 않고 설명 글만 바꿈 (적는 중에 커서가 사라지지 않게)
    const p = phone.data.ipos.find(x => x.id === id), q = Math.max(1, Math.min(p.maxQty, Math.floor(+e.target.value) || 1));
    phone.ipoQty[id] = q; document.querySelector(`[data-ipoest="${id}"]`).textContent = ipoEst(p, phone.data, q);
    document.querySelector(`[data-ipoapply="${id}"]`).disabled = phone.data.cash < Math.ceil(q * p.price * 0.5);
  }
});
document.querySelector('.phone-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { phone.tab = b.dataset.tab; renderPhone(); } });
// ===== 세계 사람들: 서버 시뮬레이션(sim/)에서 지금 밖에 나와 있는 사람(출근·산책·장보기·구직 …)을 10초마다 받아 맵을 걸어 다니게 함 =====
// 걷는 모습은 화면 꾸밈이라 이 컴퓨터에서만 정함(보도·잔디·흙길 위를 천천히 돌아다님). 가까이서 E → 그 사람의 지금 삶으로 만든 대사
const walkers = new Map();   // 번호 → { id, name, job, act, look, x, y, tx, ty, dir, left, moving, wait }
const WALK_SCENES = ['city', 'byeolha', 'danbi', 'nuribeol'], WALK_GROUND = '.glnoqkcep';
let walkScene = null, walkTiles = null;
function walkTilesOf() {   // 이 장면에서 사람이 서 있을 수 있는 칸들 (차도·물·벽·물건 자리 빼고)
  if (walkTiles) return walkTiles;
  walkTiles = [];
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (WALK_GROUND.includes(tileAt(tx, ty)) && !SOLID.has(tx + ',' + ty)) walkTiles.push([tx, ty]);
  return walkTiles;
}
// 걷는 위치는 화면 꾸밈이라, 밖에 나온 사람들은 내 근처(14칸 안)에서 걸어 다님. 내가 멀리 가면(25칸 넘게) 화면 밖 근처로 옮겨 옴 → 넓은 도시 어디서나 거리가 살아 있음
// 화면에 보이는 범위 (월드 좌표, 매 프레임) — 사람이 보는 앞에서 나타나거나 사라지지 않게
let view = { x0: 0, y0: 0, x1: 0, y1: 0 };
const offView = (x, y, m = TILE * 1.5) => x < view.x0 - m || x > view.x1 + m || y < view.y0 - m || y > view.y1 + m + TILE;
// 내 근처(minT~maxT칸)의 걸을 수 있는 칸. hidden이면 화면 밖 칸만 (없으면 null)
function tileNearMe(minT, maxT, hidden) {
  const tiles = walkTilesOf();
  for (let i = 0; i < 80; i++) {
    const t = tiles[Math.floor(Math.random() * tiles.length)];
    if (!t) break;
    const x = (t[0] + 0.5) * TILE, y = (t[1] + 0.7) * TILE, d = Math.hypot(x - me.x, y - me.y) / TILE;
    if (hidden ? offView(x, y) && !offView(x, y, TILE * 7) : d >= minT && d <= maxT) return t;   // 숨김: 화면 가장자리 바로 바깥 (7칸 안)
  }
  return hidden ? null : tiles[Math.floor(Math.random() * tiles.length)] || [0, 0];
}
async function loadWalkers(first) {
  first ||= !walkers.size;   // 아무도 없을 때(처음·로그인 직후)는 이미 거리에 있는 것으로
  if (!online || !me.basicUI) return;
  const scene = SCENE.name;
  if (!WALK_SCENES.includes(scene)) return;
  const r = await post('people', { scene });
  if (!r.ok || SCENE.name !== scene) return;
  const ids = new Set(r.people.map(p => p.id));
  for (const [id, w] of walkers) if (!ids.has(id) && !w.leaving) { w.leaving = performance.now(); w.tx = null; }   // 집·일터로 들어가는 사람: 화면 밖으로 걸어 나간 뒤 사라짐
  for (const p of r.people) {
    const w = walkers.get(p.id);
    if (w?.leaving) w.leaving = 0;   // 다시 나옴
    if (w) { w.act = p.act; w.job = p.job; w.umbrella = p.umbrella; w.run = p.run; if (!w.called) w.call = p.call; continue; }
    const t = first ? tileNearMe(2, 14) : tileNearMe(0, 0, true);   // 장면에 처음 들어올 땐 이미 거리에 있고, 그 뒤 새로 나온 사람은 화면 밖에서 걸어 들어옴
    if (!t) continue;
    const [tx, ty] = t;
    walkers.set(p.id, { ...p, x: (tx + 0.5) * TILE, y: (ty + 0.7) * TILE, tx: null, ty: null, dir: 's', left: false, moving: false, wait: Math.random() * 3 });
  }
}
setInterval(loadWalkers, 10000);
function updateWalkers(dt) {
  if (walkScene !== SCENE.name) { walkers.clear(); walkTiles = null; walkScene = SCENE.name; loadWalkers(true); }   // 장면이 바뀌면 그 장면 사람들을 한 번 받아 옴
  const tiles = walkTiles || (WALK_SCENES.includes(SCENE.name) ? walkTilesOf() : []);
  for (const w of walkers.values()) {
    if (w.talking > 0) { w.talking -= dt; w.moving = false; continue; }
    if (w.call && !w.called && !me.atWork && talkBox.hidden) {   // 나를 아는 친한 사람: 보이면 다가와서 먼저 말을 걺
      const d = Math.hypot(w.x - me.x, w.y - me.y);
      if (d < 46) { w.called = true; w.bubble = { text: w.call, until: performance.now() + 5000 }; w.wait = 5; w.moving = false; face(w, me.x - w.x, me.y - w.y); notify(`${w.name}님이 말을 걸었어요! (E로 대화)`); continue; }
      if (d < TILE * 9) { w.tx = me.x + (w.x < me.x ? -28 : 28); w.ty = me.y; w.wait = 0; }
    }
    if (w.leaving) {   // 들어가는 사람: 화면 밖이면 바로, 아니면 나에게서 멀어지는 쪽으로 걸어가다 화면 밖에서 사라짐 (오래 걸리면 흐려지며)
      if (offView(w.x, w.y) || performance.now() - w.leaving > 15000) { walkers.delete(w.id); continue; }
      if (w.tx == null) { const ang = Math.atan2(w.y - me.y, w.x - me.x); w.tx = w.x + Math.cos(ang) * TILE * 6; w.ty = w.y + Math.sin(ang) * TILE * 6; if (blockedAt(w.tx, w.ty)) w.tx = null; }
    }
    if (Math.hypot(w.x - me.x, w.y - me.y) > TILE * 25 && offView(w.x, w.y)) {   // 멀리 떨어진 사람은 (보이지 않을 때만) 내 근처 화면 밖으로 옮김
      const t = tileNearMe(0, 0, true);
      if (t) { w.x = (t[0] + 0.5) * TILE; w.y = (t[1] + 0.7) * TILE; w.tx = null; }
    }
    if (w.wait > 0 && !w.leaving) { w.wait -= dt; w.moving = false; continue; }
    if (w.tx == null && w.leaving) { w.wait = 0.3; continue; }
    if (w.tx == null) {   // 가까운(6칸 안) 걸을 수 있는 칸을 새 목적지로
      for (let i = 0; i < 8 && w.tx == null; i++) {
        const [tx, ty] = tiles[Math.floor(Math.random() * tiles.length)] || [];
        if (tx != null && Math.abs((tx + 0.5) * TILE - w.x) < TILE * 6 && Math.abs((ty + 0.7) * TILE - w.y) < TILE * 6) { w.tx = (tx + 0.5) * TILE; w.ty = (ty + 0.7) * TILE; }
      }
      if (w.tx == null) { w.wait = 1; continue; }
    }
    const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy), step = (w.run ? 75 : 34) * dt;   // 비 맞는 사람은 뛰어감
    if (d < 2) { w.tx = null; w.wait = 1 + Math.random() * 4; w.moving = false; continue; }
    const nx = w.x + dx / d * step, ny = w.y + dy / d * step;
    if (blockedAt(nx, ny)) { w.tx = null; w.wait = 0.5; continue; }   // 막히면 다른 곳으로
    w.x = nx; w.y = ny; w.moving = true; face(w, dx, dy);
  }
}
function nearWalker() {
  let best = null, bd = 56;   // 걸어 다니는 사람은 조금 멀리서도 말 걸 수 있게
  for (const w of walkers.values()) { const d = Math.hypot(w.x - me.x, w.y - me.y); if (d < bd) { bd = d; best = w; } }
  return best;
}
async function talkToWalker(w) {
  w.talking = 30; face(w, me.x - w.x, me.y - w.y);
  const r = await post('person', { id: w.id });
  if (!r.ok) { w.talking = 0; walkers.delete(w.id); return notify(r.msg); }
  talk = { npc: { name: `${r.name}${r.job ? ' · ' + r.job : ''}${r.rel ? ' · ' + hearts(r.rel) : ''}`, lines: r.lines, walker: w }, i: 0 };
  w.call = null;
  if (r.give) { if (r.bag) { me.bag = r.bag; notify(`${r.name}님에게서 ${r.bag[r.bag.length - 1].name}을(를) 받았어요!`); } else notify(`${r.name}님이 선물을 줬지만 가방이 꽉 찼어요.`); }
  say(); talkBox.hidden = false;
}
// 관계 표시: 하트 (호감) + 단계
const hearts = r => (r.like >= 60 ? '♥♥♥' : r.like >= 25 ? '♥♥' : r.like > 5 ? '♥' : r.like < -15 ? '💔' : '♡') + ' ' + r.name;
// 선물 주기: 대화창의 "선물 주기" → 가방 물건 고르기 → 그 사람의 반응
const talkGift = document.getElementById('talkGift');
function showGift() {
  const w = talk.npc?.walker, items = me.bag || [];
  talkGift.hidden = !w || !items.length;
  if (talkGift.hidden) return;
  talkGift.innerHTML = talkGift.dataset.open ? items.map((it, i) => `<button type="button" data-slot="${i}">${it.name}</button>`).join('') + '<button type="button" data-slot="-1">그만두기</button>' : '<button type="button" data-open="1">선물 주기</button>';
}
talkGift.addEventListener('click', async e => {
  e.stopPropagation();   // 대화창 누르기(다음 말)와 섞이지 않게
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.open) { talkGift.dataset.open = '1'; return showGift(); }
  delete talkGift.dataset.open;
  const slot = +b.dataset.slot, w = talk.npc?.walker;
  if (slot < 0 || !w) return showGift();
  const r = await post('gift', { id: w.id, slot, scene: SCENE.name });
  if (!r.ok) { notify(r.msg); return showGift(); }
  me.bag = r.bag;
  talk = { npc: { ...talk.npc, lines: r.lines, name: talk.npc.name.replace(/ · [♥♡💔]+ .+$/, '') + ` · ${hearts({ like: r.like, name: { new: '처음 만남', known: '아는 사이', friend: '친구', close: '절친', cold: '서먹함' }[r.level] })}` }, i: 0 };
  say();
});

// ===== 휴대폰 "세상" 탭: 나라 통계 · 지역별 인구·일자리·기분 · 동네~나라 소식 · 시스템 건강 =====
let societyAt = 0;
async function loadSociety() {
  const r = await post('society');
  if (!r.ok) return;
  phone.society = r; societyAt = performance.now();
  if (phone.tab === 'world') renderPhone();
}
setInterval(() => { if (!$hud('phoneWrap').hidden && phone.tab === 'world') loadSociety(); }, 10000);
function renderWorld(scr) {
  const w = phone.society;
  if (!w || !w.stats) { scr.innerHTML = '<p class="mk-empty">세상 소식을 불러오는 중…</p>'; if (performance.now() - societyAt > 3000) loadSociety(); return; }
  const st = w.stats, SC = { local: '동네', regional: '지역', national: '나라' };
  const moodWord = m => m > 20 ? '즐거움' : m > 5 ? '좋음' : m > -5 ? '보통' : m > -20 ? '지침' : '힘듦';
  scr.innerHTML = `<div class="mk-sum"><span>한울 인구</span><b>${won(st.pop)}명</b><span>일하는 나이 중 일하는 사람</span><b>${(st.employment * 100).toFixed(1)}%</b>
    <span>사람들 기분</span><b>${moodWord(st.mood)} (${st.mood.toFixed(0)})</b><span>저축 가운뎃값</span><b>${won(Math.round(st.savings / 10000))}만 원</b>
    <span>어제 태어남 · 떠남</span><b>${st.births}명 · ${st.deaths}명</b><span>경기 · 세금</span><b>${(w.econ.demand * 100).toFixed(0)} · ${(w.econ.tax * 100).toFixed(1)}%</b></div>
    <h3 class="mk-h">지역</h3><ul class="mk-list">${w.regions.sort((a, b) => b.pop - a.pop).map(r => `<li class="mk-reg"><span>${r.name}<small>${COUNTRY.INFO[r.name] || ''}</small></span><span class="mk-price">${r.pop}명<small>일자리 ${r.jobs} · ${moodWord(r.mood)}</small></span></li>`).join('')}</ul>
    <h3 class="mk-h">소식</h3><ul class="mk-news">${w.news.map(n => `<li><small>${whenOf(n.min)} · ${SC[n.scale] || ''}${n.region ? ' · ' + n.region : ''}</small>${n.text}</li>`).join('') || '<li>아직 소식이 없어요.</li>'}</ul>
    <h3 class="mk-h">세계 시스템</h3><p class="mk-sys">계산 ${w.health.lastMs}ms · 돈 합계 ${w.health.money ? '정상' : '확인 필요'}${w.health.checks.length ? '<br>' + w.health.checks.map(c => c.text).join('<br>') : ''}</p>`;
}
// ===== 휴대폰 앱: 홈 화면에서 앱을 고름 (앞으로 부동산·차량 앱도 여기에 더함) =====
const APPS = {
  stock: { name: '한울증권', color: '#d32f2f', mark: '▲', tabs: [['list', '시세'], ['watch', '관심'], ['mine', '보유'], ['hist', '내역'], ['ipo', '공모'], ['news', '뉴스']] },
  job: { name: '한울잡', color: '#2f9e5a', mark: '잡', tabs: [['posts', '구인'], ['myjob', '내 일'], ['pay', '급여']] },
  world: { name: '세상', color: '#3d7fd6', mark: '◎', tabs: [['world', '세상']] },
  people: { name: '사람들', color: '#e8708a', mark: '♥', tabs: [['people', '아는 사람']] },
};
function renderPhone() {
  const scr = $hud('phoneScreen'), app = APPS[phone.app], nav = document.querySelector('.phone-tabs');
  $hud('phoneTitle').textContent = app ? app.name : '휴대폰';
  $hud('phoneHome').hidden = !app;
  $hud('phoneClock').textContent = today(clock.min).time;
  const tabs = app ? app.tabs : [];
  nav.hidden = tabs.length < 2;
  nav.style.gridTemplateColumns = `repeat(${tabs.length}, 1fr)`;
  const want = tabs.map(t => t[0]).join();
  if (nav.dataset.tabs !== want) { nav.dataset.tabs = want; nav.innerHTML = tabs.map(([k, label]) => `<button type="button" data-tab="${k}">${label}</button>`).join(''); }
  nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === phone.tab || (phone.tab === 'detail' && b.dataset.tab === 'list')));
  const st = $hud('mkStatus');
  if (!app) { st.className = 'phone-status'; const t = today(clock.min); st.textContent = `${t.month}월 ${t.date}일 (${t.weekday}) ${t.wxName}`; return renderHome(scr); }
  if (phone.app === 'job') return renderJob(scr, st);
  if (phone.app === 'world') { st.className = 'phone-status'; st.textContent = '한울 나라 소식과 통계'; return renderWorld(scr); }
  if (phone.app === 'people') { st.className = 'phone-status'; st.textContent = '나를 아는 사람들 · 호감 순'; return renderPeople(scr); }
  renderStock();
}
// 사람들: 나를 아는 NPC (호감 하트·단계·신뢰·만난 횟수·마지막 만남·받은 선물)
async function loadContacts() { const r = await post('contacts'); if (r.ok) { phone.contacts = r.people; if (phone.app === 'people') renderPhone(); } }
function renderPeople(scr) {
  const list = phone.contacts;
  if (!list) { scr.innerHTML = '<p class="mk-empty">불러오는 중…</p>'; return; }
  if (!list.length) { scr.innerHTML = '<p class="mk-empty">아직 아는 사람이 없어요. 거리에서 E로 말을 걸어 보세요.</p>'; return; }
  scr.innerHTML = '<ul class="mk-list">' + list.map(p => `<li class="job-row"><div><b>${p.name}</b> <small>${p.job || ''} · ${p.region}</small></div>
    <div class="job-meta"><span class="job-tag" style="background:${p.like >= 60 ? '#e8454b' : p.like >= 25 ? '#e8708a' : p.like < -15 ? '#6a6680' : '#b8a8c8'}">${p.level}</span>호감 ${hearts({ like: p.like, name: '' }).trim()} · 신뢰 ${p.trust}</div>
    <small>${p.times}번 만남 · 마지막 ${whenOf(p.last)}${p.gift ? ' · 선물: ' + p.gift : ''}</small></li>`).join('') + '</ul>';
}
function renderHome(scr) {
  scr.innerHTML = '<div class="ph-home">' + Object.entries(APPS).map(([k, a]) => `<button type="button" class="ph-app" data-app="${k}"><span class="ph-ico" style="background:${a.color}">${a.mark}</span>${a.name}</button>`).join('') + '</div>';
}
function openApp(k) {
  phone.app = k; phone.tab = APPS[k].tabs[0][0];
  if (k === 'stock') loadMarket(); if (k === 'job') loadJob(); if (k === 'world') loadSociety(); if (k === 'people') { phone.contacts = null; loadContacts(); }
  renderPhone();
}

// ===== 한울잡: 구인 공고 · 내 일 · 급여명세 / 출근 자리 켜기 / 근무 중 화면 / 알림 =====
// 서버(jobs.js)가 정한 것만 보여 줌. 10초마다 내 일 상태와 새 알림(월급·결근·자동 퇴근…)을 받아 옴
phone.app = null;
function loadJob() {
  if (!online || !me.basicUI) return;
  return post('job').then(r => { if (r.ok) gotJob(r); });
}
function gotJob(r) {
  phone.job = r;
  if (r.cash != null) me.cash = r.cash;
  // 내 일터의 출근 자리만 켬 (다른 일터 앞에는 "출근하기"가 안 뜸)
  for (const sc of Object.values(SCENES)) for (const sp of sc.spots) if (sp.type === 'work') sp.off = !(r.job && r.job.key === sp.key);
  setWorking(r.work, r.job);
  (r.inbox || []).forEach((m, i) => setTimeout(() => notify(m.text), i * 2700));   // 새 알림을 차례로
  if (!$hud('phoneWrap').hidden && phone.app === 'job') renderPhone();
}
setInterval(loadJob, 10000);
document.addEventListener('auth', () => setTimeout(loadJob, 500));
if (window.authState) setTimeout(loadJob, 1500);
const hm = m => `${Math.floor(m / 60)}시간 ${Math.round(m % 60)}분`;
const clockOf = min => today(min).time;
function renderJob(scr, st) {
  const r = phone.job;
  if (!r) { scr.innerHTML = '<p class="mk-empty">불러오는 중…</p>'; return; }
  const j = r.job;
  st.className = 'phone-status' + (r.work ? ' open' : '');
  st.textContent = r.work ? `근무 중 · ${j.name} (${clockOf(r.work.in)} 출근)` : j ? (j.next ? `다음 출근 ${today(j.next).month}월 ${today(j.next).date}일 (${today(j.next).weekday}) ${clockOf(j.next)} · ${j.where}` : '이번 주 근무 없음') : '일자리를 찾아보세요';
  if (phone.tab === 'posts') {
    scr.innerHTML = (j ? `<p class="mk-empty">지금은 ${j.name}에 다니고 있어요. 다른 곳에 가려면 "내 일"에서 그만둬야 해요.</p>` : '') + (r.postings?.length ? '<ul class="mk-list">' + r.postings.map(p => `<li class="job-row"><div><b>${p.name}</b> <small>${p.region} · ${p.where}</small></div>
      <div class="job-meta"><span class="job-tag${p.part ? ' part' : ''}">${p.part ? '알바' : '정규직'}</span>${p.title} · ${p.hours} · ${p.days}</div>
      <div class="job-meta"><b>${p.pay}</b> · 시급 ${won(p.hourly)}원 · 남은 자리 ${p.openings}</div>
      <div class="job-meta ${p.ok ? '' : 'down'}">지원 조건: ${p.req}</div>
      <button type="button" class="job-btn" data-apply="${p.emp}" ${!p.ok || j ? 'disabled' : ''}>지원하기</button></li>`).join('') + '</ul>' : '<p class="mk-empty">지금은 빈자리가 없어요.</p>');
  } else if (phone.tab === 'myjob') {
    if (!j) { scr.innerHTML = '<p class="mk-empty">아직 일자리가 없어요. "구인"에서 지원해 보세요.</p>'; return; }
    const absent = (j.absentDays || []).length;
    scr.innerHTML = `<div class="mk-sum job-sum"><span>일터</span><b>${j.name}</b><span>하는 일</span><b>${j.title} (${j.part ? '알바' : '정규직'})</b>
      <span>출근 장소</span><b>${j.region} · ${j.where}</b><span>근무</span><b>${j.days} ${j.hours}</b><span>시급</span><b>${won(j.hourly)}원</b>
      <span>급여</span><b>${j.payday}</b><span>이번에 일한 시간</span><b>${hm(j.worked)}</b><span>쌓인 급여(공제 전)</span><b>${won(j.earned)}원</b>
      <span>지각 · 결근(30일)</span><b class="${absent ? 'down' : ''}">${j.late || 0}번 · ${absent}번${absent >= 2 ? ' ⚠' : ''}</b><span>동료</span><b>${(j.coworkers || []).join(', ') || '-'}</b></div>
      <p class="job-note">근무 시간에 출근 장소 앞에서 <b>E 출근하기</b>. 한 시간 전부터 출근할 수 있고, 10분 넘게 늦으면 지각이에요. 30일 안에 결근 3번이면 해고돼요.</p>
      <button type="button" class="job-btn quit" data-quit>그만두기</button>`;
  } else {
    const ps = (r.payslips || []).slice().reverse();
    scr.innerHTML = ps.length ? '<ul class="mk-news">' + ps.map(p => `<li><small>${whenOf(p.min)} · ${p.name}</small><b>${p.label} ${won(p.net)}원</b><small>일한 시간 ${p.hours}시간 · 받은 돈 ${won(p.gross)}원 − 세금·보험 ${won(p.tax)}원 (${(p.rate * 100).toFixed(1)}%)</small></li>`).join('') + '</ul>' : '<p class="mk-empty">아직 받은 급여가 없어요. 정규직은 매달 25일, 알바는 매주 금요일에 들어와요.</p>';
  }
}
$hud('phoneScreen').addEventListener('click', async e => {
  const app = e.target.closest('[data-app]');
  if (app) return openApp(app.dataset.app);
  const ap = e.target.closest('[data-apply]');
  if (ap) { ap.disabled = true; const r = await post('apply', { emp: +ap.dataset.apply }); notify(r.ok ? '취직했어요! "내 일"에서 출근 장소와 시간을 확인해요.' : r.msg); if (r.ok) { phone.tab = 'myjob'; gotJob({ ...r, inbox: [] }); loadJob(); } else ap.disabled = false; return; }
  if (e.target.closest('[data-quit]')) { if (!confirm('정말 그만둘까요? 쌓인 급여는 바로 받아요.')) return; const r = await post('quitjob'); notify(r.ok ? '일을 그만뒀어요.' : r.msg); gotJob({ ...r }); loadJob(); }
});
$hud('phoneHome').addEventListener('click', () => { phone.app = null; renderPhone(); });

// 근무 중: 캐릭터는 일터 안(안 보임) · 못 걸음 · 아래쪽에 근무 화면(일한 시간·쌓이는 급여·퇴근하기)
function setWorking(work, job) {
  const was = !!me.atWork;
  me.atWork = !!work; me.work = work; me.job = job;
  $hud('workWrap').hidden = !work;
  if (work && !was && job && SCENE.name === job.scene) { me.x = job.x * TILE; me.y = job.y * TILE + 10; }   // 근무 중이면 일터 앞 (새로고침해도)
  if (work && job) $hud('workTitle').textContent = `${job.name} · ${job.title}`;
}
function updateWorkPanel() {
  if (!me.atWork || !me.job) return;
  const j = me.job, mins = Math.max(0, Math.min(clock.min, j.end) - Math.max(me.work.in, j.start)), total = j.end - j.start;
  $hud('workTime').textContent = `${clockOf(me.work.in)} 출근 · ${hm(mins)} 일함 · ${clockOf(j.end)} 퇴근`;
  $hud('workPay').textContent = `오늘 ${won(Math.round(mins / 60 * j.hourly))}원 쌓임`;
  $hud('workBar').style.width = Math.min(100, mins / total * 100) + '%';
}
$hud('workOut').addEventListener('click', async () => {
  const r = await post('clockout');
  notify(r.msg || '퇴근했어요.');
  gotJob(r);
});
async function clockIn() {
  const r = await post('clockin');
  notify(r.msg);
  if (r.ok) gotJob({ ...r, inbox: [] });
}
// 출근 알림: 다음 근무 30분 전·시작 시각에 (같은 근무는 한 번만)
let remindKey = '';
setInterval(() => {
  const j = phone.job?.job;
  if (!j || me.atWork || !j.next) return;
  const left = j.next - clock.min, k = j.next + (left <= 0 ? 'go' : 'soon');
  if (left <= 30 && left > 25 && remindKey !== k) { remindKey = k; notify(`30분 뒤 ${j.name} 출근이에요! (${j.where})`); }
  if (left <= 0 && left > -5 && remindKey !== k) { remindKey = k; notify(`출근 시간이에요! ${j.where}로 가요.`); }
}, 4000);
setInterval(updateWorkPanel, 500);
document.addEventListener('bagopen', () => {
  const c = $hud('invChar'), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height); g.drawImage(sprite(me.look, 's', 0), 0, 0);
  $hud('invName').textContent = me.name;
  drawIcon('invCoin', 'coin');
  $hud('invCash').textContent = (me.cash || 0).toLocaleString('ko-KR');
  fillStats();
  const items = me.bag || [];
  $hud('bagGrid').innerHTML = Array.from({ length: BAG_MAX }, (_, i) => i >= BAG_SLOTS ? '<span class="slot locked" title="더 큰 가방이 필요해요">잠김</span>'
    : items[i] ? `<span class="slot" title="${items[i].name}"><canvas id="bagIco${i}"></canvas><small>${items[i].name}</small></span>` : '<span class="slot"></span>').join('');
  items.slice(0, BAG_SLOTS).forEach((it, i) => ICONS[it.id] && drawIcon('bagIco' + i, it.id));
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
  if (typeof showGift === 'function') showGift();
}
// 받은 것 알림: 화면 위쪽 노란 띠가 2.5초 동안 뜸
const got = document.getElementById('got');
let gotTimer = 0;
function notify(text) { got.textContent = text; got.hidden = false; clearTimeout(gotTimer); gotTimer = setTimeout(() => (got.hidden = true), 2500); }
talkBox.addEventListener('click', () => {   // 대화창 누르기(또는 E·Enter·Space) = 다음 말, 마지막 말이면 닫기 (줄 것이 있으면 이때 받음)
  if (++talk.i < linesOf(talk.npc).length) return say();
  talkBox.hidden = true; cv.focus(); delete talkGift.dataset.open;
  if (talk.npc.walker) talk.npc.walker.talking = 1.5;   // 대화가 끝나면 잠깐 뒤 다시 걸음
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
  const sp = nearSpot(me.x, me.y), wk = nearWalker();
  if (wk && (!sp || Math.hypot(wk.x - me.x, wk.y - me.y) < Math.hypot(sp.x - me.x, sp.y - me.y))) { held.clear(); return talkToWalker(wk); }   // 걸어 다니는 사람에게 말 걸기
  if (!sp) return;
  held.clear();
  if (sp.type === 'seat') return sitDown(sp);
  if (sp.type === 'shop') return window.openShop();   // 마트 점원 앞: 물건 사기 창
  if (sp.type === 'terminal') return window.openTravel();
  if (sp.type === 'work') return clockIn();   // 내 일터 앞: 출근하기   // 터미널 문 앞: 고속버스 표 사기 창
  if (sp.type === 'door') return void (fade = { t0: performance.now(), sp, done: false });
  if (sp.type === 'exit' && !me.basicUI) return notify('안내소에서 기본 UI를 받아야 한가람으로 갈 수 있어요!');   // 기본 UI 없이는 못 떠남
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
  const img = thingArt(t), k = S * ART, w = img.lw * k, h = img.lh * k;
  const ox = Math.round(t.x * S - cam.x - w / 2), oy = Math.round(t.y * S - cam.y - h);
  ctx.drawImage(img, ox, oy, w, h);
  if (img.texts?.length) drawSignTexts(img.texts, ox, oy, k);
}
// 간판 글씨: 화면 해상도로 그림(깨짐 없음). 간판 넓이보다 길면 글씨를 줄여 안에 맞춤
document.fonts.load("11px 'Galmuri11 Bold'");   // 캔버스 글씨는 글꼴을 저절로 불러오지 않아서 미리 부름
function drawSignTexts(texts, ox, oy, k) {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const tx of texts) {
    const font = px => `${px}px 'Galmuri11 Bold', Galmuri11, monospace`;
    ctx.font = font(tx.size * k);
    const tw = ctx.measureText(tx.s).width, max = tx.maxW * k;
    if (tw > max) ctx.font = font(tx.size * k * max / tw);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.s, Math.round(ox + tx.x * k), Math.round(oy + (tx.y + tx.size / 2) * k) + 1);
  }
  ctx.restore();
}
function drawPlayer(p, cam, now, noShadow) {
  const k = S * SPRITE.scale;   // 캐릭터 픽셀 1칸 = k px
  const step = p.moving ? 1 + (Math.floor(now / 160) % 2) : p.swing || 0;
  const img = sprite(p.look, p.dir, step, p.pose);
  const f = toScreen(p.x, p.y), x = Math.round(f.x - cam.x), y = Math.round(f.y - cam.y);   // 발밑 자리
  if (!p.sit && !noShadow) {   // 그림자 (벤치에 앉아 있으면 벤치 그림자로 충분)
    ctx.fillStyle = 'rgba(0, 0, 0, .22)';
    ctx.beginPath(); ctx.ellipse(x, y, SPRITE.w / 3 * k, SPRITE.w / 9 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y - SPRITE.foot * k + (p.bob || 0) * k);   // 발바닥 줄이 발밑 자리에 오게 (앉아서 들썩이면 1칸 아래)
  if (p.left) ctx.scale(-1, 1);           // 왼쪽을 볼 때는 좌우 뒤집기
  ctx.drawImage(img, -SPRITE.w / 2 * k, 0, SPRITE.w * k, SPRITE.h * k);
  ctx.restore();
}
// 우산 (비·눈 오는 날 우산을 챙긴 사람): 머리 위 반원 + 손잡이, 사람마다 색이 다름
const UMB_COLORS = ['#e8454b', '#3d7fd6', '#2f9e5a', '#f2c94c', '#8a5cd6', '#1e1b3a', '#f28cb1'];
function drawUmbrella(p, cam) {
  const k = S * SPRITE.scale, f = toScreen(p.x, p.y), x = Math.round(f.x - cam.x), top = Math.round(f.y - cam.y) - SPRITE.foot * k + (p.bob || 0) * k - 3 * k, r = SPRITE.w * 0.55 * k;
  ctx.fillStyle = '#2f2b38'; ctx.fillRect(x + (p.left ? -1 : 1) * r * 0.3, top, Math.max(2, k * 0.8), r * 1.1);
  ctx.fillStyle = UMB_COLORS[p.id % UMB_COLORS.length]; ctx.beginPath(); ctx.arc(x, top + 2, r, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, k * 0.5); ctx.stroke();
}
// 머리 위 닉네임: 나무·집에 가려지지 않게 맨 마지막에 그림
// npc면 이름 위에 작은 파란 "NPC" 꼬리표 → 다른 사람(플레이어)과 구분
function drawName(p, cam, npc) {
  const y = Math.round(p.y * S - cam.y) - SPRITE.foot * S * SPRITE.scale - 8;
  ctx.font = 'bold 14px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';
  const half = ctx.measureText(p.name).width / 2 + 4, viewW = cv.width / (devicePixelRatio || 1);
  const x = Math.max(half, Math.min(viewW - half, Math.round(p.x * S - cam.x)));   // 화면 끝에서도 잘리지 않게
  ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(p.name, x, y);
  ctx.fillStyle = '#000'; ctx.fillText(p.name, x, y);
  if (npc) {
    ctx.font = 'bold 10px "Malgun Gothic", sans-serif';
    const w = ctx.measureText('NPC').width + 8, ty = y - 26;
    ctx.fillStyle = '#1e1b3a'; ctx.fillRect(Math.round(x - w / 2) - 1, ty - 1, w + 2, 14);
    ctx.fillStyle = '#3d7fd6'; ctx.fillRect(Math.round(x - w / 2), ty, w, 12);
    ctx.fillStyle = '#ffffff'; ctx.fillText('NPC', x, ty + 10);
  }
}
// 말풍선 (먼저 말을 거는 사람): 이름표 위
function drawBubble(p, cam) {
  if (!p.bubble || performance.now() > p.bubble.until) return;
  const y = Math.round(p.y * S - cam.y) - SPRITE.foot * S * SPRITE.scale - 44, x = Math.round(p.x * S - cam.x);
  ctx.font = 'bold 13px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(p.bubble.text).width + 16;
  ctx.fillStyle = '#1e1b3a'; ctx.fillRect(x - w / 2 - 2, y - 20, w + 4, 26); ctx.fillRect(x - 4, y + 6, 8, 5);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x - w / 2, y - 18, w, 22); ctx.fillRect(x - 2, y + 4, 4, 4);
  ctx.fillStyle = '#1e1b3a'; ctx.fillText(p.bubble.text, x, y - 2);
}
// E 표시: 가까운 문·NPC 위에 자판 모양 "E" + 할 일 (들어가기·나가기·대화)
function drawPrompt(sp, cam) {
  // NPC: 그 NPC 이름표 바로 위 / 도시로 떠나기: 내 캐릭터 이름표 바로 위 / 문: 정해 둔 자리(px, py)
  const who = sp.type === 'npc' || sp.type === 'shop' ? sp.npc : sp.type === 'exit' || sp.type === 'stand' ? me : null;
  const x = Math.round((who ? who.x : sp.px) * S - cam.x);
  const y = who ? Math.round(who.y * S - cam.y) - SPRITE.foot * S * SPRITE.scale - 8 - 32 - (who !== me ? 14 : 0) : Math.round(sp.py * S - cam.y);   // NPC는 꼬리표 위로
  const label = { npc: '대화', shop: '물건 사기', terminal: '표 사기', work: '출근하기', exit: '한가람으로 떠나기', seat: '앉기', stand: '일어나기' }[sp.type] || (sp.out ? '나가기' : '들어가기');
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
    const img = thingArt(th), ox = th.x * S - cam.x - img.lw * k / 2, oy = th.y * S - cam.y - img.lh * k;
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
let skyShade = 1, litRects = [];   // 이번 프레임의 어둠(밝기 배율)과 불빛 자리 [왼, 위, 오른, 아래, 그 물건의 발밑 y]
// ===== 하늘 위에 다시 그리기 =====
// 3) 불 켜진 창문(그 건물)보다 앞에 선 사람은 불빛에 덮이지 않게 다시 그림 (어둠만큼 어둡게)
// 4) 내 캐릭터가 앞에 있는 건물·나무에 가려지면 반투명하게 비쳐 보이게
const alphaOf = new WeakMap();   // 물건 그림의 투명도 (가려졌는지 볼 때 씀)
function opaqueAt(img, ix, iy) {   // ix·iy = 원래 크기 좌표 (2배 그림은 그 칸의 가운데 픽셀)
  ix = ix * (img.res || 1) + ((img.res || 1) >> 1); iy = iy * (img.res || 1) + ((img.res || 1) >> 1);
  if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return false;
  let d = alphaOf.get(img);
  if (!d) { d = img.getContext('2d').getImageData(0, 0, img.width, img.height).data; alphaOf.set(img, d); }
  return d[(iy * img.width + ix) * 4 + 3] > 0;
}
function drawOverSky(cam, now) {
  const k = S * SPRITE.scale, footY = p => (p.sit ? p.sit.by + 1 : p.y);
  const again = (p, alpha) => { ctx.save(); ctx.globalAlpha = alpha; if (skyShade < 0.99) ctx.filter = `brightness(${skyShade.toFixed(3)})`; drawPlayer(p, cam, now, true); ctx.restore(); };
  if (litRects.length) for (const p of [...NPCS, ...walkers.values(), ...others.values(), me]) {
    const x = p.x * S - cam.x, y = p.y * S - cam.y, r = [x - 8 * k, y - 17 * k, x + 8 * k, y + k];
    if (litRects.some(l => l[4] < footY(p) && r[0] < l[2] && r[2] > l[0] && r[1] < l[3] && r[3] > l[1])) again(p, 1);
  }
  if (!me.atWork && occluded(me, cam)) again(me, 0.55);
}
// 그 사람의 몸 가운데·머리 자리가 발밑보다 앞(아래)에 서 있는 물건 그림(건물·나무)에 덮였는지
function occluded(p, cam) {
  const k = S * SPRITE.scale, kk = S * ART, px0 = p.x * S - cam.x, py0 = p.y * S - cam.y, pts = [[px0, py0 - 8 * k], [px0, py0 - 13 * k]], foot = p.sit ? p.sit.by + 1 : p.y;
  return THINGS.some(t => {
    if (t.ground || t.y <= foot + 2) return false;
    const img = thingArt(t), ox = t.x * S - cam.x - img.lw * kk / 2, oy = t.y * S - cam.y - img.lh * kk;
    return pts.some(([x, y]) => opaqueAt(img, Math.floor((x - ox) / kk), Math.floor((y - oy) / kk)));
  });
}
function drawSky(cam, W, H, dt, now) {
  const t = today(clock.min), m = clock.min % DAY, out = !SCENE.indoor;
  litRects = [];
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
      const img = thingArt(th), ox = th.x * S - cam.x - img.lw * k / 2, oy = th.y * S - cam.y - img.lh * k;
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
  skyShade = (1 - gloom) * (1 - dusk) * (1 - night) * (out && t.wx === 'dust' ? 0.85 : 1);
  // 불빛: 어두운 만큼 창문·등이 노랗게 켜지고 둘레가 은은하게 밝음 (어둠 위에 그려서 밤에 또렷함)
  const lit = out ? night / 0.55 : 0;
  if (lit > 0.05) {
    const k = S * ART;
    for (const t of THINGS) {
      const L = (typeof LIGHTS[t.type] === 'function' ? LIGHTS[t.type](t.v) : LIGHTS[t.type]) || thingArt(t).lights;   // 그림에 적어 둔 창문(lit)도 켬
      if (!L) continue;
      const img = thingArt(t), ox = t.x * S - cam.x - img.lw * k / 2, oy = t.y * S - cam.y - img.lh * k;
      if (t.type === 'lamp') {   // 가로등: 발밑 바닥에 둥근 빛 웅덩이
        const fx = t.x * S - cam.x, fy = t.y * S - cam.y, rx = 34 * k;
        ctx.save(); ctx.translate(fx, fy); ctx.scale(1, 0.45);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, `rgba(255, 210, 120, ${0.32 * lit})`); g.addColorStop(1, 'rgba(255, 210, 120, 0)');
        ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
      }
      for (const [x, y, w, h] of L) {
        const cx = ox + (x + w / 2) * k, cy = oy + (y + h / 2) * k, r = Math.max(w, h) * k * (t.type === 'lamp' ? 5 : 1.6);   // 가로등은 둘레를 넓게
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255, 200, 110, ${0.28 * lit})`); g.addColorStop(1, 'rgba(255, 200, 110, 0)');
        ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        litRects.push([ox + x * k, oy + y * k, ox + (x + w) * k, oy + (y + h) * k, t.y]);   // 판정은 창문 자리만 (넓게 번지는 빛 둘레로 하면 뒤쪽 사람까지 앞에 그려짐)
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
  if (clock.ready) clock.min = clock.base + (now - clock.baseAt) / 1000 * TIME_SPEED / 60;   // 세계 시간: 받은 시각 + 지난 현실 시간 × 24
  updateHud();
  // 계절마다 바뀌는 그림 (town.js): 나무, 잔디·흙길(눈 오는 날은 눈이 쌓이고, 다음 날까지 녹다 남은 눈)
  const td = today(clock.min), tday = Math.floor(clock.min / DAY);
  ART_SEASON = td.season;
  GROUND_LOOK = td.wx === 'snow' ? 'snow' : td.season === 3 && weatherOf(tday - 1) === 'snow' ? 'melt' : ['spring', 'summer', 'autumn', 'winter'][td.season];
  // 입력: 방향키 방향 그대로(위 = 화면 위쪽). 두 키를 같이 누르면(↑→ 등) 45도 대각선
  // 장면 바꾸기: 다 어두워지면 장면을 바꾸고 문 앞(안이면 현관 매트 앞)에 섬 → 다시 밝아짐
  if (fade && !fade.done && now - fade.t0 >= FADE) { useScene(fade.sp.to); me.x = fade.sp.at.x; me.y = fade.sp.at.y; me.dir = fade.sp.face || (fade.sp.out ? 's' : 'n'); me.left = !!fade.sp.faceLeft; fade.done = true; saveProgress(); }   // 들어가면 위(안쪽), 나오면 아래를 봄
  if (fade && now - fade.t0 >= FADE * 2) fade = null;
  const busy = fade || !talkBox.hidden || !document.getElementById('leaveWrap').hidden || me.atWork;   // 근무 중에도 못 걸음   // 장면을 바꾸거나 대화하는 동안은 못 걸음
  let vx = busy ? 0 : stick.x + held.has('R') - held.has('L'), vy = busy ? 0 : stick.y + held.has('D') - held.has('U');
  if (me.sit) {   // 벤치: 앉아 있을 때 방향키를 누르면 일어남. 앉는 중·일어나는 중·앉아 있는 동안은 못 걸음
    if (me.sit.phase === 'on' && Math.hypot(vx, vy) > 0.1) standUp(now);
    vx = vy = 0;
  }
  updateSit(now);
  updateOthers(dt, now); sendMove(now); updateWalkers(dt);
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
  view = { x0: cam.x / S, y0: cam.y / S, x1: (cam.x + W) / S, y1: (cam.y + H) / S };
  drawGround(cam, W, H);
  drawShadows(ctx, S, cam);   // 물건 그림자 (바닥 위, 물건 아래)
  // 건물·나무·캐릭터를 발밑이 위쪽인 것부터 그림 → 아래쪽(앞)에 있는 것이 위에 겹침
  // 바닥 무늬(맨홀·주차 P)는 맨 먼저 → 무엇에든 가려짐
  const scene = [...thingsAround(cam.x / S, cam.y / S, (cam.x + W) / S, (cam.y + H) / S).map(t => ({ y: t.ground ? -Infinity : t.y, draw: () => drawThing(t, cam) })), ...NPCS.map(n => ({ y: n.y, draw: () => drawPlayer(n, cam, now) })), ...[...walkers.values()].map(w => ({ y: w.y, draw: () => { const fade = w.leaving ? Math.min(1, Math.max(0, (15000 - (performance.now() - w.leaving)) / 3000)) : 1; ctx.globalAlpha = fade; drawPlayer(w, cam, now); if (w.umbrella) drawUmbrella(w, cam); ctx.globalAlpha = 1; } })), ...[...others.values()].map(o => ({ y: o.sit ? o.sit.by + 1 : o.y, draw: () => drawPlayer(o, cam, now) })), { y: me.sit ? me.sit.sp.by + 1 : me.y, draw: () => { if (!me.atWork) drawPlayer(me, cam, now); } }];   // 근무 중이면 일터 안이라 안 보임   // 앉아 있으면 벤치보다 앞에 그림
  scene.sort((a, b) => a.y - b.y).forEach(o => o.draw());
  drawClocks(cam);
  drawSky(cam, W, H, dt, now);
  drawOverSky(cam, now);
  // 이름표: 건물 뒤에 완전히 가려진 걷는 NPC는 이름표도 숨김 (다른 플레이어·나는 늘 보임)
  NPCS.forEach(n => drawName(n, cam, true)); walkers.forEach(w => { if (!occluded(w, cam)) { drawName(w, cam, true); drawBubble(w, cam); } }); others.forEach(o => drawName(o, cam)); if (!me.atWork) drawName(me, cam);
  const sp = !busy && (me.sit ? me.sit.phase === 'on' && { type: 'stand' } : nearSpot(me.x, me.y)), wk = !busy && !me.sit && nearWalker();
  if (wk && (!sp || Math.hypot(wk.x - me.x, wk.y - me.y) < Math.hypot(sp.x - me.x, sp.y - me.y))) drawPrompt({ type: 'npc', npc: wk }, cam);
  else if (sp) drawPrompt(sp, cam);
  if (fade) {   // 검은 화면으로 어두워졌다 밝아짐
    const t = (now - fade.t0) / FADE;
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, t < 1 ? t : 2 - t))})`; ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}
cv.focus();
requestAnimationFrame(frame);
}
