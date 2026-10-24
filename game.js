'use strict';

// ===== 고정 규칙 =====
const STORE_KEY = 'stockGame.v1';
const START_CASH = 1000000;
const TARGET = 1150000;      // +15% → 성공
const LOSS_LIMIT = 850000;   // -15% → 실패
const MAX_DAY = 60;          // 60거래일이 지나면 목표 미달 실패
const DAY_MS = 1200;         // 1거래일 = 1.2초
const NEWS_CHANCE = 0.18;
const DRIFT_DAYS = 5;        // 뉴스의 여파가 이어지는 날 수

// 난이도는 "하루 변동성" 값 하나만 바꾼다 (카드 3: 값 하나만 비교)
const DIFFICULTY = {
  low:  { label: '낮음', vol: 0.012 },
  mid:  { label: '보통', vol: 0.02 },
  high: { label: '높음', vol: 0.032 },
};

const STOCKS = [
  { id: 'tech',   name: '한빛전자',   sector: '반도체·IT (성장주)',  price: 72000,  beta: 1.2 },
  { id: 'food',   name: '푸른식품',   sector: '식품 (경기방어주)',    price: 38000,  beta: 0.6 },
  { id: 'energy', name: '별빛에너지', sector: '에너지 (경기민감주)',  price: 115000, beta: 1.5 },
];

// jump: 뉴스 당일 즉시 변동, drift: 이후 DRIFT_DAYS 동안 하루 평균 변동
const NEWS = [
  { icon: 'bank', title: '중앙은행, 기준금리 인상', jump: { tech: -0.06, food: -0.01, energy: -0.03 }, drift: { tech: -0.006 },
    lesson: '금리가 오르면 돈을 빌리는 비용이 커지고, 미래 이익의 현재 가치가 낮아집니다. 그래서 미래 성장 기대가 큰 성장주(IT)가 더 크게 흔들립니다.' },
  { icon: 'up', title: '한빛전자, 분기 실적 예상치 크게 상회', jump: { tech: 0.07 }, drift: { tech: 0.008 },
    lesson: '주가는 실적 자체보다 "시장의 예상 대비" 결과에 반응합니다. 예상보다 좋은 실적을 어닝 서프라이즈라고 합니다.' },
  { icon: 'energy', title: '국제 유가 급등', jump: { energy: 0.08, food: -0.03 }, drift: { energy: 0.007 },
    lesson: '같은 뉴스도 업종마다 반대로 작용합니다. 유가 상승은 에너지 기업엔 호재, 원가가 오르는 식품 기업엔 악재입니다.' },
  { icon: 'cloud', title: '경기 침체 우려 확산', jump: { tech: -0.05, energy: -0.05, food: 0.01 }, drift: { food: 0.004 },
    lesson: '불황에도 사람들은 밥을 먹습니다. 수요가 꾸준한 식품·생활필수품 기업 주식을 경기방어주라고 합니다.' },
  { icon: 'coin', title: '푸른식품, 배당금 확대 발표', jump: { food: 0.04 },
    lesson: '배당은 회사가 번 이익의 일부를 주주에게 나눠 주는 것입니다. 배당이 늘면 꾸준한 수익을 원하는 투자자가 몰립니다.' },
  { icon: 'rumor', title: '한빛전자 신제품 출시설 (확인되지 않은 소문)', jump: { tech: 0.05 }, drift: { tech: -0.007 },
    lesson: '확인되지 않은 소문으로 오른 주가는 되돌아가기 쉽습니다. 소문만 믿고 추격 매수하는 것은 위험합니다.' },
  { icon: 'fire', title: '별빛에너지 정제시설 화재 사고', jump: { energy: -0.09 }, drift: { energy: -0.004 },
    lesson: '한 회사에만 생긴 악재(개별 위험)는 여러 종목에 나눠 담는 분산투자로 줄일 수 있습니다.' },
  { icon: 'crash', title: '시장 전체 급락 (공포성 매도)', crash: true, jump: { tech: -0.1, food: -0.06, energy: -0.1 },
    drift: { tech: 0.005, food: 0.002, energy: 0.005 },
    lesson: '시장 전체가 함께 떨어지는 위험(체계적 위험)은 분산투자로도 피하기 어렵습니다. 공포에 휩쓸려 팔면 손실이 확정되고, 급락 뒤에는 반등이 오기도 합니다.' },
];

const STATUS_LABEL = { ready: '준비', playing: '진행 중', paused: '일시정지', won: '성공', lost: '실패' };
const START_POS = { x: 168, y: 150 };   // 가운데 방 아래쪽
const SPEED = 60;                        // 방 픽셀/초

const $ = id => document.getElementById(id);
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const signed = (n, s) => (n > 0 ? '+' : '') + s;
const pct = n => signed(n, n.toFixed(2) + '%');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ===== 보존 기록 (카드 4): 기록·최고 수익률·배운 개념·설정만 저장, 현재 판은 저장하지 않음 =====
function defaultStore() {
  return {
    best: null,
    records: [],
    learned: [],
    settings: { diff: 'mid', mute: false, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches },
  };
}

function okRecord(r) {
  return r && typeof r === 'object' && hasOwn(DIFFICULTY, r.diff) && (r.result === 'won' || r.result === 'lost') &&
    Number.isInteger(r.day) && Number.isFinite(r.ret) && typeof r.cause === 'string';
}

// 형식 검사 → 통과한 값만 기본값 위에 덮어씀. 손상 시 기본값으로 시작
function loadStore() {
  const d = defaultStore();
  let raw;
  try { raw = localStorage.getItem(STORE_KEY); } catch { return { store: d, note: '저장소를 쓸 수 없어 기본값으로 시작합니다.' }; }
  if (raw === null) return { store: d, note: '' };
  if (raw.trim() === '') return { store: d, note: '저장값이 비어 있어 기본값으로 시작했습니다.' };
  let v;
  try { v = JSON.parse(raw); } catch { v = null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { store: d, note: '저장값이 손상되어 기본값으로 시작했습니다.' };
  if (Array.isArray(v.records)) d.records = v.records.filter(okRecord).slice(-200);
  if (Array.isArray(v.learned)) d.learned = [...new Set(v.learned.filter(i => Number.isInteger(i) && i >= 0 && i < NEWS.length))];
  if (Number.isFinite(v.best)) d.best = v.best;
  const s = v.settings && typeof v.settings === 'object' ? v.settings : {};
  if (hasOwn(DIFFICULTY, s.diff)) d.settings.diff = s.diff;
  if (typeof s.mute === 'boolean') d.settings.mute = s.mute;
  if (typeof s.reduce === 'boolean') d.settings.reduce = s.reduce;
  return { store: d, note: '' };
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* 저장 불가여도 게임은 계속 */ }
}

let { store, note } = loadStore();
save();

// ===== 현재 판 (새 게임마다 초기화) =====
function newGame() {
  return {
    status: 'ready', pauseReason: '', day: 0, cash: START_CASH, sel: 0, trades: 0, diff: store.settings.diff,
    shockUntil: 0, news: [], player: { ...START_POS, moving: false },
    stocks: STOCKS.map(s => ({ ...s, shares: 0, cost: 0, hist: [s.price], drift: 0, driftDays: 0 })),
  };
}
let S = newGame();
let timer = null;
let near = null;            // 지금 개미 옆에 있는 물건
const held = new Set();     // 누르고 있는 방향키

const stockValue = () => S.stocks.reduce((sum, st) => sum + st.shares * st.price, 0);
const totalAssets = () => S.cash + stockValue();
const roundPrice = p => Math.max(1000, Math.round(p / 100) * 100);
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const atDesk = () => near?.act === 'trade';

function startClock() { stopClock(); timer = setInterval(tick, DAY_MS); }
function stopClock() { clearInterval(timer); timer = null; }

// ===== 조작: 한 번 호출 = 상태 변화 한 번 =====
function start() {
  if (S.status !== 'ready') return;
  S.status = 'playing';
  startClock();
  say('게임 시작! 방향키로 왼쪽 방의 💻 컴퓨터 책상까지 가서 B로 매수해 보세요.');
  render();
}

function tradeBlocked() {
  if (S.status !== 'playing') return say(S.status === 'paused' ? '일시정지 중에는 거래할 수 없어요.' : '게임이 진행 중일 때만 거래할 수 있어요.'), true;
  if (!atDesk()) return say('💻 컴퓨터 책상 앞으로 가야 거래할 수 있어요. (왼쪽 방)'), true;
  return false;
}

function buy() {
  if (tradeBlocked()) return;
  const st = S.stocks[S.sel];
  if (S.cash < st.price) return say(`현금이 부족해요. (${st.name} 1주 = ${won(st.price)})`);
  S.cash -= st.price; st.shares++; st.cost += st.price; S.trades++;
  say(`${st.name} 1주 매수 (${won(st.price)}) → 보유 ${st.shares}주`);
  render();
}

function sell() {
  if (tradeBlocked()) return;
  const st = S.stocks[S.sel];
  if (st.shares === 0) return say(`${st.name} 주식이 없어 팔 수 없어요.`);
  const avg = st.cost / st.shares;
  st.cost -= avg; st.shares--; S.cash += st.price; S.trades++;
  say(`${st.name} 1주 매도 (${won(st.price)}, 손익 ${signed(st.price - avg, won(st.price - avg))}) → 보유 ${st.shares}주`);
  render();
}

// reason: 'manual'(P·침대) | 'auto'(창 이탈) | 'modal'(책장·TV 등을 보는 중)
function pause(reason) {
  if (S.status !== 'playing') return false;
  S.status = 'paused'; S.pauseReason = reason; stopClock(); held.clear();
  return true;
}
function resume() {
  if (S.status !== 'paused') return false;
  S.status = 'playing'; S.pauseReason = ''; startClock();
  return true;
}

function togglePause(auto = false) {
  if (S.status === 'playing') {
    pause(auto ? 'auto' : 'manual');
    say(auto ? '창을 벗어나 자동으로 일시정지했어요. P 또는 [계속]으로 이어가세요.' : '일시정지. 시간이 멈췄어요. 💤');
  } else if (S.status === 'paused' && !auto) {
    resume();
    say('다시 진행합니다.');
  } else return;
  render();
}

function restart() {
  stopClock();
  $('modal').hidden = true;
  S = newGame();
  held.clear();
  near = null;
  $('result').hidden = true;
  say('새 게임 준비 완료. [시작] 또는 Enter를 누르세요.');
  render();
  $('startBtn').focus();
}

function select(i) {
  if (!S.stocks[i] || S.sel === i) return;
  S.sel = i;
  render();
}

// ===== 시간 진행 =====
function tick() {
  if (S.status !== 'playing') return;
  S.day++;
  maybeNews();
  const vol = DIFFICULTY[S.diff].vol;
  for (const st of S.stocks) {
    const drift = st.driftDays > 0 ? st.drift : 0;
    if (st.driftDays > 0) st.driftDays--;
    st.price = roundPrice(st.price * (1 + drift + st.beta * vol * gauss()));
    st.hist.push(st.price);
  }
  checkEnd();
  render();
}

function maybeNews() {
  if (S.day < 2 || Math.random() > NEWS_CHANCE) return;
  const idx = Math.floor(Math.random() * NEWS.length), n = NEWS[idx];
  const impact = [];
  for (const st of S.stocks) {
    const j = n.jump[st.id];
    if (j) { st.price = roundPrice(st.price * (1 + j)); impact.push(`${st.name} ${pct(j * 100)}`); }
    if (n.drift && hasOwn(n.drift, st.id)) { st.drift = n.drift[st.id]; st.driftDays = DRIFT_DAYS; }
  }
  addNews({ idx, n, day: S.day, impact: impact.join(' · '), read: false });
  if (n.crash) { S.shockUntil = performance.now() + 2000; effect('crash'); }
}

function checkEnd() {
  const total = totalAssets();
  if (total >= TARGET) end('won', '목표 달성');
  else if (total <= LOSS_LIMIT) end('lost', '손실 한도 도달');
  else if (S.day >= MAX_DAY) end('lost', '기간 만료(목표 미달)');
}

function lessonFor(result, ret) {
  const vals = S.stocks.map(st => st.shares * st.price);
  const sum = vals.reduce((a, b) => a + b, 0);
  const top = sum ? Math.max(...vals) / sum : 0;
  if (result === 'won') return top > 0.7
    ? '성공했지만 한 종목에 집중했어요. 다음엔 분산투자로도 같은 결과를 낼 수 있는지 도전해 보세요.'
    : '여러 종목에 나눠 담고 뉴스에 맞게 대응했어요. 분산투자와 정보 판단이 수익을 만든 좋은 예입니다.';
  if (S.trades === 0) return '한 번도 거래하지 않았어요. 현금만 들고 있으면 손실은 없지만 수익도 없습니다.';
  if (top > 0.7 && sum > 0) return '자산 대부분이 한 종목에 몰려 있었어요. 한 회사의 악재가 전체 손실이 되지 않도록 분산투자를 해 보세요.';
  if (ret > 0) return '수익은 냈지만 목표에는 못 미쳤어요. 뉴스 직후 여파가 이어지는 며칠을 노려 보세요.';
  return '손실이 커질 때 미리 팔아 손실을 제한하는 것(손절매)도 중요한 투자 기술입니다.';
}

function end(result, cause) {
  stopClock();
  $('modal').hidden = true;
  S.status = result;
  held.clear();
  const ret = (totalAssets() / START_CASH - 1) * 100;
  store.records.push({ diff: S.diff, result, day: S.day, ret: +ret.toFixed(2), cause });
  if (store.records.length > 200) store.records.shift();
  if (store.best === null || ret > store.best) store.best = +ret.toFixed(2);
  save();
  $('resultAnt').src = antURL(result === 'won' ? 'happy' : 'sad');
  $('resultTitle').textContent = result === 'won' ? '성공!' : '실패';
  $('resultCause').textContent = `${cause} · ${S.day}거래일 · 난이도 ${DIFFICULTY[S.diff].label}`;
  $('resultRet').textContent = `최종 자산 ${won(totalAssets())} (${pct(ret)})`;
  $('resultLesson').textContent = '📘 ' + lessonFor(result, ret);
  $('result').hidden = false;
  $('resultRestart').focus();
  effect(result === 'won' ? 'win' : 'lose');
}

// ===== 방 안의 물건 (Space) =====
const modalOpen = () => !$('modal').hidden;

// 책장·칠판·TV·캐비닛을 보는 동안 시간 정지, 닫으면 이어서 진행
function openModal(title, content) {
  $('modalTitle').textContent = title;
  $('modalBody').replaceChildren(content);
  $('modal').hidden = false;
  held.clear();
  pause('modal');
  render();
  $('modalClose').focus();
}
function closeModal() {
  if (!modalOpen()) return;
  $('modal').hidden = true;
  if (S.pauseReason === 'modal') resume();
  render();
  document.activeElement?.blur();
}
const tpl = id => $(id).content.cloneNode(true);

function interact() {
  if (S.status === 'won' || S.status === 'lost') return;
  if (!near) return say('근처에 사용할 물건이 없어요. 방향키로 노란 화살표가 뜨는 곳까지 가 보세요.');
  switch (near.act) {
    case 'trade': return openModal('💻 거래 컴퓨터 — 종목 차트', buildCharts());
    case 'news': return openNews();
    case 'glossary': return openModal('📚 주식 용어 사전', tpl('tpl-glossary'));
    case 'rules': return openModal('🧑‍🏫 게임 규칙', tpl('tpl-rules'));
    case 'records': return openModal('🗂 플레이 기록', buildRecords());
    case 'sleep':
      if (S.status === 'playing' || S.status === 'paused') return togglePause();
      return say('게임 중에만 쉴 수 있어요. 먼저 [시작]을 누르세요.');
  }
}

// 읽지 않은 뉴스를 TV에서 읽으면 📘 배우기가 열리고 '배운 개념'이 늘어남
function openNews() {
  const unread = S.news.filter(e => !e.read);
  const show = unread.length ? unread : S.news.slice(0, 3);
  if (!show.length) return say('📺 아직 도착한 뉴스가 없어요.');
  const frag = document.createDocumentFragment();
  for (const e of show) {
    const div = document.createElement('div');
    div.className = 'news-card';
    div.innerHTML = '<img class="px" width="32" height="32" alt=""><div><b></b><p class="sub"></p><p class="learn"></p></div>';
    div.querySelector('img').src = iconURL(e.n.icon);
    div.querySelector('b').textContent = e.n.title;
    div.querySelector('.sub').textContent = `${e.day}일차 · ${e.impact}`;
    div.querySelector('.learn').textContent = '📘 ' + e.n.lesson;
    frag.append(div);
    e.read = true;
    if (!store.learned.includes(e.idx)) store.learned.push(e.idx);
  }
  save();
  openModal(unread.length ? `📺 새 뉴스 ${unread.length}건 — 배우기` : '📺 최근 뉴스 다시 보기', frag);
}

function buildRecords() {
  const frag = tpl('tpl-records-skeleton');
  const recs = store.records;
  const sum = frag.querySelector('.summary');
  for (const [key, d] of Object.entries(DIFFICULTY)) {
    const rs = recs.filter(r => r.diff === key);
    const tr = document.createElement('tr');
    cell(tr, d.label);
    cell(tr, rs.length);
    if (!rs.length) { ['-', '-', '-', '-'].forEach(t => cell(tr, t)); sum.append(tr); continue; }
    const rets = rs.map(r => r.ret).sort((a, b) => a - b), m = rets.length >> 1;
    const median = rets.length % 2 ? rets[m] : (rets[m - 1] + rets[m]) / 2;
    const causes = {};
    rs.filter(r => r.result === 'lost').forEach(r => { causes[r.cause] = (causes[r.cause] || 0) + 1; });
    const topCause = Object.entries(causes).sort((a, b) => b[1] - a[1])[0];
    cell(tr, `${rs.filter(r => r.result === 'won').length}/${rs.length}`);
    cell(tr, `${pct(rets[0])} ~ ${pct(rets[rets.length - 1])}`);
    cell(tr, pct(median));
    cell(tr, topCause ? `${topCause[0]} (${topCause[1]}회)` : '-');
    sum.append(tr);
  }
  const body = frag.querySelector('.records');
  recs.slice(-20).reverse().forEach((r, i) => {
    const tr = document.createElement('tr');
    cell(tr, recs.length - i);
    cell(tr, DIFFICULTY[r.diff].label);
    cell(tr, r.result === 'won' ? '성공' : '실패', r.result === 'won' ? 'up' : '');
    cell(tr, `${r.day}일`);
    cell(tr, pct(r.ret));
    cell(tr, r.cause);
    body.append(tr);
  });
  if (!recs.length) { const tr = document.createElement('tr'); cell(tr, '아직 기록이 없습니다.'); tr.firstChild.colSpan = 6; body.append(tr); }
  frag.querySelector('.best').textContent = store.best === null ? '-' : pct(store.best);
  frag.querySelector('.learned-count').textContent = `${store.learned.length} / ${NEWS.length}`;
  return frag;
}

// ===== 이동 (방향키를 누르고 있는 동안) =====
function update(dt) {
  const p = S.player;
  const canMove = (S.status === 'ready' || S.status === 'playing') && !modalOpen();
  let dx = canMove ? held.has('ArrowRight') - held.has('ArrowLeft') : 0;
  let dy = canMove ? held.has('ArrowDown') - held.has('ArrowUp') : 0;
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  p.moving = !!(dx || dy);
  if (dx && !blocked(p.x + dx * SPEED * dt, p.y)) p.x += dx * SPEED * dt;
  if (dy && !blocked(p.x, p.y + dy * SPEED * dt)) p.y += dy * SPEED * dt;
  const n = nearestObject(p.x, p.y);
  if (n !== near) { near = n; render(); }
}

// ===== 효과 (카드 5): 성공·실패·시장 급락에서만 =====
const SOUNDS = {
  win:   [[523, 0, .15], [659, .15, .15], [784, .3, .3]],
  lose:  [[392, 0, .25], [330, .25, .25], [262, .5, .4]],
  crash: [[180, 0, .2], [140, .2, .3]],
};
const FX_TEXT = { win: '목표 달성!', lose: '게임 종료', crash: '시장 급락!' };
const FX_MOOD = { win: 'happy', lose: 'sad', crash: 'shock' };
let actx = null, fxTimer = null;
const liveOsc = new Set();

function beep(notes) {
  if (store.settings.mute) return;
  try {
    actx = actx || new AudioContext();
    for (const [freq, at, dur] of notes) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; g.gain.value = 0.08;
      o.connect(g).connect(actx.destination);
      o.start(actx.currentTime + at); o.stop(actx.currentTime + at + dur);
      liveOsc.add(o); o.onended = () => liveOsc.delete(o);
    }
  } catch { /* 소리를 못 내도 게임은 계속 */ }
}
function stopSounds() { for (const o of liveOsc) { try { o.stop(); } catch { } } liveOsc.clear(); }

function effect(kind) {
  const fx = $('fx');
  $('fxText').textContent = FX_TEXT[kind];
  $('fxAnt').src = antURL(FX_MOOD[kind]);
  const anim = !store.settings.reduce;
  fx.className = `fx show fx-${kind}` + (anim ? ' anim' : '');
  if (kind === 'crash' && anim) $('roomWrap').classList.add('shake');
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => { fx.className = 'fx'; $('roomWrap').classList.remove('shake'); }, 1400);
  beep(SOUNDS[kind]);
}

// ===== 화면 =====
function say(text) { $('msg').textContent = text; }

function cell(tr, text, cls) { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; tr.append(td); }

function addNews(e) {
  S.news.unshift(e);
  if (S.news.length > 30) S.news.pop();
}

function buildStocks() {
  STOCKS.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'stock';
    b.innerHTML = '<img class="px ic" width="32" height="32" alt=""><span class="nm"></span><span class="pr"></span><span class="ch"></span><small class="hold"></small>';
    b.querySelector('.ic').src = iconURL(s.id);
    b.querySelector('.nm').textContent = `${i + 1} ${s.name}`;
    b.title = s.sector;
    b.addEventListener('click', () => select(i));
    $('stocks').append(b);
  });
}

function render() {
  const total = totalAssets(), ret = (total / START_CASH - 1) * 100;
  $('day').textContent = `${S.day} / ${MAX_DAY}일`;
  $('cash').textContent = won(S.cash);
  $('stockValue').textContent = won(stockValue());
  $('total').textContent = won(total);
  $('ret').textContent = pct(ret);
  $('ret').className = ret > 0 ? 'up' : ret < 0 ? 'down' : '';
  $('learned').textContent = `${store.learned.length} / ${NEWS.length}`;
  $('progress').value = Math.min(100, Math.max(0, (total - LOSS_LIMIT) / (TARGET - LOSS_LIMIT) * 100));
  $('badge').textContent = STATUS_LABEL[S.status];
  $('badge').dataset.s = S.status;

  [...$('stocks').children].forEach((b, i) => {
    const st = S.stocks[i], prev = st.hist[st.hist.length - 2] ?? st.price;
    const ch = (st.price / prev - 1) * 100;
    b.setAttribute('aria-pressed', i === S.sel);
    b.querySelector('.pr').textContent = won(st.price);
    const chEl = b.querySelector('.ch');
    chEl.textContent = pct(ch);
    chEl.className = 'ch ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : '');
    b.querySelector('.hold').textContent = st.shares
      ? `보유 ${st.shares}주 · 평단 ${won(st.cost / st.shares)} · 손익 ${signed(st.shares * st.price - st.cost, won(st.shares * st.price - st.cost))}`
      : '보유 0주';
  });
  const playing = S.status === 'playing', paused = S.status === 'paused';
  $('startBtn').disabled = S.status !== 'ready';
  $('buyBtn').disabled = $('sellBtn').disabled = !playing || !atDesk();
  $('pauseBtn').disabled = !(playing || paused) || modalOpen();
  $('pauseBtn').firstChild.textContent = paused ? '계속 ' : '일시정지 ';
  $('diff').disabled = playing || paused;
  $('prompt').textContent = near
    ? `[Space] ${near.label}`
    : '←↑↓→ 이동 · 물건 앞에서 Space · 💻 책상 앞에서 B 매수/S 매도 · 1·2·3 종목 · P 일시정지 · R 다시 시작';
  $('prompt').classList.toggle('on', !!near);
  const latest = S.news[0];
  $('ticker').hidden = !latest;
  if (latest) $('ticker').textContent = `📰 ${latest.day}일차 ${latest.n.title} — ${latest.impact}` + (S.news.some(e => !e.read) ? ' · 📺 TV에서 배우기!' : '');
}

// 책상 컴퓨터: 세 종목의 픽셀 캔들 차트 (빨강 상승·파랑 하락, 주황 점선 = 내 평단)
function buildCharts() {
  const frag = document.createDocumentFragment();
  S.stocks.forEach((st, i) => {
    const h = st.hist, avg = st.shares ? st.cost / st.shares : null;
    const div = document.createElement('div');
    div.className = 'chart-card' + (i === S.sel ? ' sel' : '');
    div.innerHTML = '<p class="chart-title"></p><canvas class="px chart" width="300" height="90"></canvas>';
    div.querySelector('.chart-title').textContent = `${i + 1} ${st.name} (${st.sector}) · 현재 ${won(st.price)} · 최고 ${won(Math.max(...h))} · 최저 ${won(Math.min(...h))}`
      + (avg ? ` · 평단 ${won(avg)}` : '');
    drawPixelChart(div.querySelector('canvas').getContext('2d'), h, avg, MAX_DAY);
    frag.append(div);
  });
  const p = document.createElement('p');
  p.className = 'small';
  p.textContent = '빨강 = 상승한 날, 파랑 = 하락한 날, 주황 점선 = 내 평균단가. 창을 닫고 B·S로 거래하세요.';
  frag.append(p);
  return frag;
}

const roomCtx = $('room').getContext('2d');

function mood(now) {
  if (now < S.shockUntil) return 'shock';
  if (S.status === 'paused') return 'sleep';
  if (S.status === 'won') return 'happy';
  if (S.status === 'lost') return 'sad';
  const r = totalAssets() / START_CASH - 1;
  return r > 0.01 ? 'happy' : r < -0.01 ? 'sad' : 'normal';
}

let last = performance.now();
function loop(now) {
  update(Math.min(0.05, (now - last) / 1000)); // 탭 복귀 직후 순간이동 방지
  last = now;
  const still = store.settings.reduce;
  drawRoom(roomCtx, {
    status: S.status, day: S.day, maxDay: MAX_DAY, flash: now < S.shockUntil,
    hist: S.stocks[S.sel].hist, unread: S.news.some(e => !e.read), near,
    blink: !still && Math.floor(now / 400) % 2 === 0,
    player: { x: S.player.x, y: S.player.y, mood: mood(now), bob: !still && S.player.moving && Math.floor(now / 150) % 2 === 0 },
  });
  requestAnimationFrame(loop);
}

// ===== 입력 연결 =====
$('startBtn').addEventListener('click', start);
$('buyBtn').addEventListener('click', buy);
$('sellBtn').addEventListener('click', sell);
$('pauseBtn').addEventListener('click', () => togglePause());
$('restartBtn').addEventListener('click', restart);
$('resultRestart').addEventListener('click', restart);
$('modalClose').addEventListener('click', () => closeModal());

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const KEYS = {
  KeyB: buy, KeyS: sell, KeyP: () => togglePause(), KeyR: restart,
  Digit1: () => select(0), Digit2: () => select(1), Digit3: () => select(2),
  Numpad1: () => select(0), Numpad2: () => select(1), Numpad3: () => select(2),
};
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target instanceof Element ? e.target : document.body;
  if (t.closest('select, input, textarea')) return;
  if (ARROWS.has(e.code)) { e.preventDefault(); held.add(e.code); return; }
  // 키를 누르고 있을 때의 자동 반복은 무시 → 키 한 번 = 동작 한 번
  if (e.repeat) return;
  if (modalOpen()) {
    if (['Escape', 'Space', 'Enter', 'KeyE'].includes(e.code)) { e.preventDefault(); closeModal(); }
    return;
  }
  if ((e.code === 'Space' || e.code === 'Enter') && t.closest('button')) return; // 버튼 자체 동작에 맡김
  if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); return interact(); }
  if (e.code === 'Enter' && S.status === 'ready') { e.preventDefault(); return start(); }
  const fn = KEYS[e.code];
  if (fn) { e.preventDefault(); fn(); }
});
document.addEventListener('keyup', e => held.delete(e.code));

// 포커스 이탈 시 자동 일시정지 + 눌린 키 초기화 (복귀 직후 혼자 걷거나 여러 날이 지나는 것 방지)
window.addEventListener('blur', () => { held.clear(); togglePause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { held.clear(); togglePause(true); } });

$('diff').addEventListener('change', e => {
  store.settings.diff = e.target.value; save();
  if (S.status === 'ready') S.diff = e.target.value;
  say(`난이도(변동성)를 ${DIFFICULTY[e.target.value].label}(으)로 바꿨어요. ${S.status === 'ready' ? '' : '다음 판부터 적용됩니다.'}`);
});
$('mute').addEventListener('change', e => {
  store.settings.mute = e.target.checked; save();
  if (e.target.checked) stopSounds();
});
$('reduce').addEventListener('change', e => {
  store.settings.reduce = e.target.checked; save();
  if (e.target.checked) { $('fx').classList.remove('anim'); $('roomWrap').classList.remove('shake'); }
});

// ===== 시작 =====
$('diff').value = store.settings.diff;
$('mute').checked = store.settings.mute;
$('reduce').checked = store.settings.reduce;
if (note) { $('notice').textContent = '⚠ ' + note; $('notice').hidden = false; }
$('logo').src = antURL('happy');
buildStocks();
say('[시작] 또는 Enter를 누르면 게임이 시작됩니다. 시작 전에도 방을 돌아다닐 수 있어요.');
render();
requestAnimationFrame(loop);
