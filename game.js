'use strict';
// ===== 개미 투자 교실 (브라우저) =====
// 시장·사건·계좌·기록은 서버(server.js)가 정하고, 여기서는 보여 주기·내 개미 이동·주문 보내기만 합니다.
// 끝이 없는 게임: 클리어·실패·다시 시작이 없고, 계좌는 계정에 계속 이어집니다.
// 게임 시계: 오전 9시 개장 ~ 오후 6시 마감. 장 밖 시간에는 집 밖에서 알바·동전·은행으로 돈을 벌 수 있습니다.

const STORE_KEY = 'stockGame.v2';
const START_POS = { x: 168, y: 150 };
const SPEED = 60;   // 방 픽셀/초

const $ = id => document.getElementById(id);
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const signed = (n, s) => (n > 0 ? '+' : '') + s;
const pct = n => signed(n, n.toFixed(2) + '%');
const upDown = n => (n > 0 ? 'up' : n < 0 ? 'down' : '');

// ===== 이 브라우저의 설정 (카드 4): 소리 끄기·움직임 줄이기 =====
// 기록·배운 개념은 계정(서버)에 저장되어 내 것만 보입니다.
function loadStore() {
  const d = { settings: { mute: false, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches } };
  let raw;
  try { raw = localStorage.getItem(STORE_KEY); } catch { return { store: d, note: '저장소를 쓸 수 없어 기본 설정으로 시작합니다.' }; }
  if (raw === null) return { store: d, note: '' };
  if (raw.trim() === '') return { store: d, note: '저장값이 비어 있어 기본 설정으로 시작했습니다.' };
  let v;
  try { v = JSON.parse(raw); } catch { v = null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { store: d, note: '저장값이 손상되어 기본 설정으로 시작했습니다.' };
  const s = v.settings && typeof v.settings === 'object' ? v.settings : {};
  if (typeof s.mute === 'boolean') d.settings.mute = s.mute;
  if (typeof s.reduce === 'boolean') d.settings.reduce = s.reduce;
  return { store: d, note: '' };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* 저장 불가여도 게임은 계속 */ }
}
let { store, note } = loadStore();
save();

// ===== 서버에서 받는 값 =====
let META = null;   // 종목·업종 (접속 때 한 번)
let ST = null;     // 공유 시장 상태
let ME = null;     // 내 계좌·기록 (로그인했을 때만)
const others = new Map();   // 다른 참가자 개미 위치
let sel = 0, sector = 'all', pcTab = 'hold', newsSeen = 0;

// ===== 내 개미 (위치는 이 브라우저가 정하고 서버에 알림) =====
const P = { ...START_POS, moving: false, scene: 'inside' };
let near = null;
const held = new Set();

const loggedIn = () => !!ME;
const atDesk = () => near?.act === 'trade';
const stockOf = i => META.stocks[i];
const priceOf = i => ST.hist[i][ST.hist[i].length - 1];
const changeOf = i => { const h = ST.hist[i], prev = h[h.length - 2] ?? h[h.length - 1]; return { diff: h[h.length - 1] - prev, rate: (h[h.length - 1] / prev - 1) * 100 }; };
const symIndex = sym => META.stocks.findIndex(s => s.sym === sym);
const holdings = () => Object.entries(ME?.hold || {}).map(([sym, h]) => ({ i: symIndex(sym), ...h }));
const stockValue = () => holdings().reduce((a, h) => a + h.qty * priceOf(h.i), 0);
const totalAssets = () => (ME ? ME.cash + ME.bank + stockValue() : 0);
const fmtTime = c => { const h = Math.floor(c / 60), m = c % 60; return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`; };
const isNight = c => c < 6 * 60 || c >= 19 * 60;
const nearCoin = () => (P.scene === 'outside' && ST ? ST.coins.find(c => Math.hypot(c.x - P.x, c.y - P.y) < 12) : null);
const hasUnread = () => !!ME && ST.news.some(n => n.id > ME.readUpTo);

// ===== 서버 통신: 로그인은 HttpOnly 쿠키로 유지 (비밀값이 화면·주소·저장소에 남지 않음) =====
async function api(name, body = {}) {
  try {
    const r = await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.auth === false && name !== 'me' && ME) showLogin('로그인이 만료됐어요. 다시 로그인해 주세요.');
    if (d.me) ME = d.me;
    return d;
  } catch {
    return { ok: false, msg: '서버에 연결할 수 없어요. node server.js 가 켜져 있는지 확인하세요.' };
  }
}

let es = null;
function connect() {
  es?.close();
  es = new EventSource('/api/stream');
  es.addEventListener('meta', e => { META = JSON.parse(e.data); buildSectors(); render(); });
  es.addEventListener('state', e => onState(JSON.parse(e.data)));
  es.addEventListener('pos', e => JSON.parse(e.data).forEach(p => others.set(p.id, p)));
  es.onerror = () => say('서버 연결이 끊겼어요. 다시 연결하는 중…');
}

function onState(s) {
  const first = !ST;
  ST = s;
  if (s.me) ME = s.me;
  const latest = s.news[0]?.id || 0;
  if (!first) for (const n of s.news) if (n.id > newsSeen && n.crash) effect('crash');
  newsSeen = Math.max(newsSeen, latest);
  for (const p of s.players) if (!others.has(p.id)) others.set(p.id, { id: p.id, ...p.pos, scene: p.scene });
  render();
}

// ===== 로그인: 닉네임이 처음이면 계정 생성, 있으면 비밀번호 확인 =====
function showLogin(msg = '') {
  ME = null;
  closeAll();
  $('login').hidden = false;
  $('loginMsg').textContent = msg;
  $('loginAnt').src = antURL('happy');
  $('loginName').focus();
  render();
}
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const d = await api('login', { name: $('loginName').value, password: $('loginPw').value });
  $('loginPw').value = '';
  if (!d.ok) { $('loginMsg').textContent = d.msg; return; }
  $('login').hidden = true;
  connect();          // 쿠키를 가진 채로 다시 연결 → 서버가 내 계좌를 보내 줌
  say(d.msg + ' 방향키로 움직이고, 물건 앞에서 E를 누르세요.');
});
$('logoutBtn').addEventListener('click', async () => {
  await api('logout');
  showLogin('로그아웃했어요.');
  connect();
});

// ===== 주문 한 번 = 체결 한 번 (B/S 키는 1주, 컴퓨터 주문창은 입력한 수량) =====
let orderQueue = Promise.resolve();
function trade(side, qty) {
  if (!loggedIn()) return say('로그인이 필요해요.');
  if (!atDesk()) return say('💻 컴퓨터 책상 앞으로 가야 거래할 수 있어요. (왼쪽 방)');
  const sym = stockOf(sel).sym;
  // 차례대로 보내 응답 순서가 섞이지 않게 함
  orderQueue = orderQueue.then(async () => {
    const d = await api('order', { sym, side, qty });
    say(d.msg);
    render();
  });
}

// ===== 창들 =====
const isOpen = id => !$(id).hidden;
const anyOpen = () => ['modal', 'pc', 'tv', 'book', 'work'].some(isOpen);
function show(id, focusId) { held.clear(); $(id).hidden = false; $(focusId)?.focus(); }
function hide(id) { if (!isOpen(id)) return; $(id).hidden = true; document.activeElement?.blur(); render(); }
function closeAll() { ['modal', 'pc', 'tv', 'book'].forEach(hide); }

function openModal(title, content) {
  $('modalTitle').textContent = title;
  $('modalBody').replaceChildren(content);
  show('modal', 'modalClose');
}
const tpl = id => $(id).content.cloneNode(true);

async function interact() {
  const coin = nearCoin();
  if (coin) { const d = await api('coin', { id: coin.id }); say(d.msg); return render(); }
  if (!near) return say('근처에 사용할 물건이 없어요. 노란 화살표가 뜨는 곳까지 가 보세요.');
  switch (near.act) {
    case 'trade': return openPC();
    case 'news': return openTV();
    case 'glossary': return openBook();
    case 'work': return startWork();
    case 'bank': return loggedIn() ? openBank() : say('로그인이 필요해요.');
    case 'rules': return openModal('🧑‍🏫 게임 규칙', tpl('tpl-rules'));
    case 'records': return loggedIn() ? openModal(`🗂 ${ME.name}의 투자 기록`, buildRecords()) : say('로그인이 필요해요.');
    case 'color': {
      if (!loggedIn()) return say('로그인이 필요해요.');
      const d = await api('color', { color: near.color });
      say(d.ok ? `🎨 캐릭터가 ${BODY_NAME[near.color]}이 되었어요!` : d.msg);
      return render();
    }
  }
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function row(cells, cls) { const tr = el('tr', cls); cells.forEach(([t, c]) => tr.append(el('td', c, t))); return tr; }
function dlRows(dl, pairs) { dl.replaceChildren(...pairs.flatMap(([k, v, c]) => [el('dt', '', k), el('dd', c, v)])); }

// ===== 🗂 캐비닛: 내 기록만 (서버의 내 계정에서 옴) =====
function buildRecords() {
  const frag = tpl('tpl-records'), total = totalAssets(), ret = (total / META.START_CASH - 1) * 100;
  const set = (cls, text, c) => { const e = frag.querySelector(cls); e.textContent = text; if (c) e.className += ' ' + c; };
  set('.r-total', won(total));
  set('.r-ret', pct(ret), upDown(ret));
  set('.r-realized', signed(ME.realized, won(ME.realized)), upDown(ME.realized));
  set('.r-best', won(ME.best));
  set('.r-trades', `${ME.log.length}건`);
  set('.r-learned', `${ME.learned.length} / ${META.lessons.length}`);
  set('.r-earned', won(ME.earned));
  set('.r-interest', won(ME.interest));
  drawPixelChart(frag.querySelector('.r-chart').getContext('2d'), ME.assetHist.length ? ME.assetHist : [total], null, 120);
  const body = frag.querySelector('.r-log');
  if (!ME.log.length) body.append(row([['아직 거래 기록이 없습니다. 💻 컴퓨터에서 첫 주식을 사 보세요.']]));
  ME.log.slice(0, 50).forEach(l => body.append(row([[l.side === 'buy' ? '매수' : '매도', l.side === 'buy' ? 'up' : 'down'], [stockOf(symIndex(l.sym)).name],
    [`${l.qty}주`], [won(l.price)], [won(l.price * l.qty)], [l.gain === undefined ? '-' : signed(l.gain, won(l.gain)), upDown(l.gain || 0)]])));
  return frag;
}

// ===== 🏪 편의점 알바: 일하는 동안은 움직일 수 없고, 끝나면 시급 =====
let workTimer = null;
async function startWork() {
  if (!loggedIn()) return say('로그인이 필요해요.');
  const d = await api('workStart');
  say(d.msg);
  if (!d.ok) return;
  show('work');
  const bar = $('workBar'), t0 = performance.now();
  clearInterval(workTimer);
  workTimer = setInterval(async () => {
    const f = Math.min(1, (performance.now() - t0) / META.WORK_MS);
    bar.value = f * 100;
    if (f < 1) return;
    clearInterval(workTimer);
    const r = await api('workDone');
    say(r.msg);
    hide('work');
  }, 100);
}

// ===== 🏦 은행: 예금은 원금이 줄지 않고 장 마감 때마다 이자 =====
function openBank() {
  const frag = tpl('tpl-bank');
  const amt = frag.querySelector('.b-amount');
  const refresh = () => {
    const box = $('modalBody');
    box.querySelector('.b-cash').textContent = won(ME.cash);
    box.querySelector('.b-bank').textContent = won(ME.bank);
    box.querySelector('.b-rate').textContent = `하루 ${(ST.depositRate * 100).toFixed(2)}%`;
    box.querySelector('.b-next').textContent = won(Math.floor(ME.bank * ST.depositRate));
  };
  const go = async action => {
    const d = await api('bank', { action, amount: Number(amt.value) });
    $('modalBody').querySelector('.b-msg').textContent = d.msg;
    say(d.msg); refresh(); render();
  };
  frag.querySelector('.b-dep').addEventListener('click', () => go('deposit'));
  frag.querySelector('.b-wd').addEventListener('click', () => go('withdraw'));
  frag.querySelector('.b-dep-all').addEventListener('click', () => { amt.value = ME.cash; go('deposit'); });
  frag.querySelector('.b-wd-all').addEventListener('click', () => { amt.value = ME.bank; go('withdraw'); });
  openModal('🏦 개미은행', frag);
  refresh();
}

// ===== 📺 TV: 개미뉴스 방송 =====
const MACRO = ['rate', 'fx', 'oil', 'crash', 'rally'], INDUSTRY = ['chipCycle', 'evPolicy', 'flu'];
const newsTag = n => (n.crash ? '속보' : n.key.startsWith('w_') ? '날씨' : MACRO.includes(n.key) ? '경제' : INDUSTRY.includes(n.key) ? '산업' : '기업');
const studioCtx = $('tvStudio').getContext('2d');
let tvId = null;   // 보고 있는 뉴스 (새 뉴스가 와도 화면이 바뀌지 않게 id로 기억)

function openTV() {
  if (!ST.news.length) return say('📺 아직 방송할 뉴스가 없어요. 조금만 기다려 보세요.');
  const unread = ME ? ST.news.filter(n => n.id > ME.readUpTo) : [];
  tvId = (unread.length ? unread[unread.length - 1] : ST.news[0]).id;   // 안 본 뉴스 중 가장 오래된 것부터
  show('tv', 'tvNext');
  renderTV();
}
function tvMove(step) {   // step +1 = 더 최근 뉴스, -1 = 더 지난 뉴스
  const k = ST.news.findIndex(n => n.id === tvId);
  const next = ST.news[Math.max(0, Math.min(ST.news.length - 1, k - step))];
  if (next) { tvId = next.id; renderTV(); }
}
function renderTV() {
  if (!isOpen('tv') || !ST) return;
  const k = Math.max(0, ST.news.findIndex(n => n.id === tvId)), n = ST.news[k];
  tvId = n.id;
  const sum = n.impacts.reduce((a, i) => a + i.j, 0);
  drawStudio(studioCtx, n.crash ? 'shock' : sum >= 0 ? 'happy' : 'sad', sum >= 0);
  $('tvWeather').textContent = `${ST.season} · ${META.weather[ST.weather].name}`;
  $('tvIcon').src = iconURL(n.icon);
  $('tvTag').textContent = newsTag(n);
  $('tvTag').className = 'tv-tag' + (n.crash ? ' breaking' : '');
  $('tvHeadline').textContent = n.title;
  $('tvLearn').textContent = '📘 배우기 · ' + n.lesson;
  const max = Math.max(...n.impacts.map(i => Math.abs(i.j)), 0.01);
  $('tvImpacts').replaceChildren(...n.impacts.slice(0, 6).map(i => {
    const li = el('li', upDown(i.j)), bar = el('span', 'bar');
    bar.style.width = `${Math.abs(i.j) / max * 100}%`;
    li.append(el('span', 'nm', stockOf(symIndex(i.sym)).name), bar, el('span', 'v', `${i.j > 0 ? '▲' : '▼'} ${pct(i.j * 100)}`));
    return li;
  }));
  if (n.impacts.length > 6) $('tvImpacts').append(el('li', 'more', `외 ${n.impacts.length - 6}종목`));
  const idx = ST.index[ST.index.length - 1];
  $('tvTicker').textContent = `개미지수 ${idx.toFixed(2)}  ◆  ` + ST.news.filter(x => x.id !== n.id).slice(0, 6).map(x => x.title).join('  ◆  ');
  $('tvPage').textContent = `${ST.news.length - k} / ${ST.news.length}` + (hasUnread() ? ' · 안 본 뉴스 있음' : '');
  $('tvPrev').disabled = k === ST.news.length - 1;
  $('tvNext').disabled = k === 0;
  markRead(n);
}
// 뉴스를 보면 읽은 것으로 표시하고 그 사건의 개념을 '배운 개념'에 더함 (TV·뉴스 앱 공통)
const learning = new Set();
function markRead(n) {
  if (!ME || learning.has(n.id) || (n.id <= ME.readUpTo && ME.learned.includes(n.key))) return;
  learning.add(n.id);
  api('learn', { newsId: n.id }).then(() => { learning.delete(n.id); render(); });
}

// ===== 📚 책장: 용어책 (한 장 = 용어 하나) =====
const TERMS = [
  { term: '주식', icon: 'doc', lead: '회사의 주인이 될 수 있는 증서 한 조각.',
    detail: '회사는 큰돈이 필요할 때 회사를 잘게 나눈 조각(주식)을 팔아 돈을 모읍니다. 주식을 산 사람은 그만큼 회사의 주인(주주)이 되어, 회사가 잘되면 주가 상승이나 배당으로 이익을 나눠 받습니다.',
    example: '이 게임의 30개 회사는 모두 가상 회사예요. 한빛전자 1주를 사면 한빛전자의 아주 작은 주인이 됩니다.',
    tip: '주식은 예금과 달리 원금이 보장되지 않아요. 회사가 어려워지면 가격이 떨어질 수 있어요.' },
  { term: '주가', icon: 'up', lead: '주식 한 주의 가격.',
    detail: '주가는 사려는 사람과 팔려는 사람이 만나는 가격에서 정해집니다. 그 회사의 앞날이 밝다고 보는 사람이 많으면 사려는 사람이 늘어 오르고, 걱정하는 사람이 많으면 내립니다.',
    example: 'HTS 현재가 옆의 ▲▼는 바로 전날보다 얼마나 올랐는지·내렸는지 보여 줘요.',
    tip: '주가는 "지금의 실적"보다 "앞으로의 기대"를 먼저 반영해요.' },
  { term: '매수와 매도', icon: 'coin', lead: '주식을 사는 것(매수)과 파는 것(매도).',
    detail: '매수하면 현금이 주식으로 바뀌고, 매도하면 주식이 다시 현금으로 바뀝니다. 사고판다고 해서 바로 돈을 벌거나 잃는 것은 아니고, 산 가격과 판 가격의 차이가 손익이 됩니다.',
    example: '💻 컴퓨터 책상 앞에서 B를 누르면 1주 매수, S를 누르면 1주 매도예요. HTS에서는 수량을 정해 한 번에 주문할 수 있어요.',
    tip: '여러 번 나눠서 사고팔면 한 번에 몰아서 할 때보다 운에 덜 휘둘려요.' },
  { term: '호가와 잔량', icon: 'doc', lead: '사고팔겠다고 내놓은 가격(호가)과 그 가격에 기다리는 수량(잔량).',
    detail: '시장에는 "이 가격이면 팔겠다"는 매도 호가와 "이 가격이면 사겠다"는 매수 호가가 줄지어 있습니다. 호가는 가격대마다 정해진 단위(호가 단위)로만 움직입니다. 예를 들어 5만~20만 원 주식은 100원 단위입니다.',
    example: 'HTS 가운데의 호가 창에서 위쪽 파란 칸이 매도 호가, 아래쪽 빨간 칸이 매수 호가예요. 막대가 길수록 잔량이 많아요.',
    tip: '한쪽 잔량이 유난히 많으면 그 가격을 넘기 어렵다는 신호로 읽기도 해요.' },
  { term: '평균단가 (평단)', icon: 'coin', lead: '여러 번 나눠 산 주식의 1주당 평균 구매 가격.',
    detail: '7만 원에 1주, 8만 원에 1주를 샀다면 평균단가는 7만 5천 원입니다. 현재가가 평균단가보다 높으면 이익, 낮으면 손실 상태입니다. 팔 때는 평균단가가 바뀌지 않습니다.',
    example: 'HTS 차트의 주황 점선이 내 평균단가예요. 잔고 탭에서 종목별 평단을 볼 수 있어요.',
    tip: '떨어질 때 더 사서 평단을 낮추는 것(물타기)은 회사가 회복할 때만 효과가 있어요.' },
  { term: '평가손익과 실현손익', icon: 'up', lead: '아직 안 판 주식의 손익(평가)과 팔아서 확정된 손익(실현).',
    detail: '주식을 들고 있는 동안의 이익·손실은 화면 속 숫자일 뿐이라 "평가손익"이라고 합니다. 팔아야 비로소 "실현손익"으로 확정됩니다.',
    example: '🗂 캐비닛의 내 투자 기록에서 실현 손익을, HTS 잔고 탭에서 평가손익을 볼 수 있어요.',
    tip: '평가이익이 났다고 안심하지 마세요. 팔기 전까지는 언제든 바뀔 수 있어요.' },
  { term: '수익률', icon: 'up', lead: '처음 돈에 비해 얼마나 늘었는지(줄었는지)의 비율.',
    detail: '수익률 = (지금 자산 ÷ 처음 자산 − 1) × 100%입니다. 100만 원이 110만 원이 되면 +10%입니다. 금액보다 수익률로 비교해야 시작 금액이 다른 사람과도 공정하게 비교할 수 있습니다.',
    example: '화면 위 "수익률 (100만 원 대비)"가 내 수익률이에요.',
    tip: '-50%가 되면 다시 원금으로 돌아가려면 +100%가 필요해요. 큰 손실을 피하는 게 중요한 이유예요.' },
  { term: '업종 (섹터)', icon: 'tech', lead: '비슷한 일을 하는 회사들의 묶음.',
    detail: '같은 업종의 회사들은 같은 뉴스에 함께 움직이는 경우가 많습니다. 반도체 가격이 오르면 반도체 회사들이 함께 오르는 식입니다.',
    example: '이 게임에는 IT·반도체, 바이오·제약, 식품·생활, 에너지·화학, 자동차·운송, 유통·레저의 6개 업종에 5종목씩 있어요. HTS 업종 탭으로 골라 보세요.',
    tip: '같은 업종 안에서만 여러 종목을 사면 분산 효과가 작아요.' },
  { term: '지수', icon: 'bank', lead: '여러 종목의 가격을 하나로 묶은 시장 온도계.',
    detail: '지수를 보면 오늘 시장 전체가 좋았는지 나빴는지 한눈에 알 수 있습니다. 실제로는 코스피·코스닥 같은 지수가 있습니다.',
    example: '개미지수는 30종목의 가격이 처음보다 평균 얼마나 변했는지를 1000을 기준으로 보여 줘요.',
    tip: '내 수익률을 지수와 비교해 보세요. 시장보다 잘했는지 알 수 있어요.' },
  { term: '베타 (시장 민감도)', icon: 'storm', lead: '시장이 1% 움직일 때 그 종목이 평균 몇 % 움직이는지.',
    detail: '베타가 1보다 크면 시장보다 크게 흔들리고, 1보다 작으면 덜 흔들립니다. 오를 때 많이 오르는 종목은 떨어질 때도 많이 떨어집니다.',
    example: 'HTS 기업 정보 탭에서 종목마다 베타를 볼 수 있어요. 씽씽배터리는 1.6, 맑은생활은 0.5예요.',
    tip: '불안한 시기에는 베타가 낮은 종목이 마음 편할 수 있어요.' },
  { term: '분산투자', icon: 'bag', lead: '여러 종목·업종에 나눠 담아 위험을 줄이는 방법.',
    detail: '"달걀을 한 바구니에 담지 말라"는 말처럼, 한 회사에만 투자하면 그 회사의 사고 하나로 큰 손실이 납니다. 서로 다르게 움직이는 종목에 나눠 담으면 한쪽 손실을 다른 쪽이 메워 줍니다.',
    example: '폭염에는 햇살음료가 오르고 풍년농산이 내려요. 둘 다 갖고 있으면 날씨에 덜 흔들려요.',
    tip: '시장 전체가 떨어지는 급락(체계적 위험)은 분산투자로도 피하기 어려워요.' },
  { term: '경기방어주와 경기민감주', icon: 'food', lead: '경기를 덜 타는 주식과 크게 타는 주식.',
    detail: '식품·통신·생활용품처럼 불황에도 꼭 사는 물건을 파는 회사는 경기방어주입니다. 자동차·여행·화학처럼 경기가 좋을 때 많이 팔리는 회사는 경기민감주입니다.',
    example: '푸른식품·바다통신·모두마트는 방어주, 놀자여행·질주자동차는 민감주예요.',
    tip: '나쁜 뉴스가 이어질 때 방어주 비중을 늘리는 것도 방법이에요.' },
  { term: '금리와 주가', icon: 'bank', lead: '돈을 빌리는 값(금리)이 오르면 주가에는 보통 부담.',
    detail: '금리가 오르면 회사의 이자 부담이 커지고, 예금만 해도 이자를 많이 받으니 주식의 매력이 줄어듭니다. 특히 먼 미래의 이익을 기대받는 성장주가 더 크게 떨어집니다.',
    example: '"기준금리 인상" 뉴스가 나오면 누리소프트·씽씽배터리처럼 금리에 민감한 종목이 크게 흔들려요.',
    tip: '금리 인하 뉴스는 반대로 성장주에 좋은 소식이에요.' },
  { term: '환율과 수출주', icon: 'car', lead: '원·달러 환율이 오르면 수출 회사에 유리.',
    detail: '환율이 1,300원에서 1,450원이 되면, 같은 1달러어치를 팔아도 원화로 150원을 더 받습니다. 그래서 수출 회사는 유리하고, 해외에서 연료를 사 오는 항공사나 해외여행은 불리해집니다.',
    example: '"환율 돌파" 뉴스에는 한빛전자·질주자동차가 오르고 하늘항공·놀자여행이 내려요.',
    tip: '같은 뉴스가 업종마다 반대로 작용하는 대표적인 예예요.' },
  { term: '배당과 자사주 매입', icon: 'coin', lead: '회사가 번 돈을 주주에게 돌려주는 방법.',
    detail: '배당은 이익의 일부를 현금으로 나눠 주는 것이고, 자사주 매입은 회사가 자기 주식을 사들여 주식 수를 줄이는 것입니다. 둘 다 "주주를 챙긴다"는 신호라 주가에 좋게 작용합니다.',
    example: '"자사주 매입·배당 확대 발표" 뉴스가 나온 종목은 그날 오르는 경우가 많아요.',
    tip: '배당을 꾸준히 주는 회사는 대체로 실적이 안정적이에요.' },
  { term: '어닝 서프라이즈', icon: 'star', lead: '실적이 시장의 예상보다 훨씬 좋게 나온 것.',
    detail: '주가는 이미 "이 정도는 벌겠지"라는 예상을 담고 있습니다. 그래서 실적이 좋아도 예상보다 못하면 떨어지고(어닝 쇼크), 예상을 크게 넘으면 오릅니다.',
    example: '"분기 영업이익 시장 예상 웃돌아" 뉴스가 어닝 서프라이즈, "실적 예상치 크게 밑돌아"가 어닝 쇼크예요.',
    tip: '좋은 회사와 좋은 주식(싸게 살 수 있는 주식)은 다를 수 있어요.' },
  { term: '신약 임상', icon: 'pill', lead: '새 약을 사람에게 시험해 효과와 안전을 확인하는 단계.',
    detail: '신약은 1상·2상·3상 임상을 거쳐 허가를 받아야 팔 수 있습니다. 10년 넘게 걸리기도 하고, 마지막 단계에서 실패하면 기대가 한꺼번에 사라집니다.',
    example: '"임상 3상 성공"이면 바이오 종목이 하루에 10~20% 넘게 오르고, "실패"면 그만큼 떨어지기도 해요.',
    tip: '바이오처럼 결과가 한 번에 갈리는 종목은 큰 비중을 싣지 않는 게 안전해요.' },
  { term: '날씨와 주가', icon: 'sun', lead: '날씨가 바뀌면 사람들이 사는 물건이 바뀐다.',
    detail: '폭염에는 음료·에어컨이, 한파에는 난방·겨울옷이 잘 팔립니다. 비가 많이 오면 배달·게임은 늘고 여행·농업은 피해를 봅니다. 회사의 매출 기대가 달라지면 주가도 움직입니다.',
    example: '창밖 날씨를 보세요. 폭염 특보가 나오면 햇살음료·시원가전이 오르고 풍년농산이 내려요.',
    tip: '날씨 영향은 며칠 이어지다가 사라지는 경우가 많아요.' },
  { term: '소문과 확인', icon: 'rumor', lead: '확인되지 않은 이야기에 사지 말 것.',
    detail: '"인수설"처럼 확인되지 않은 소문에 주가가 갑자기 오르기도 합니다. 하지만 사실이 아니면 금방 제자리로 돌아오고, 뒤늦게 따라 산 사람이 손해를 봅니다.',
    example: '이 게임의 "인수설 솔솔" 뉴스는 처음엔 오르지만 그 뒤 며칠 동안 내려가도록 만들어져 있어요.',
    tip: '회사가 공식으로 발표했는지(공시) 확인하는 습관을 들이세요.' },
  { term: '손절매', icon: 'warn', lead: '더 큰 손실을 막으려고 손해를 보고 파는 것.',
    detail: '"언젠가 오르겠지" 하고 버티다가 손실이 커지는 경우가 많습니다. 미리 "−10%면 판다" 같은 기준을 정해 두면 감정에 휘둘리지 않습니다.',
    example: '경영 비리나 임상 실패처럼 회사 자체에 큰 문제가 생긴 뉴스라면 기다려도 회복이 느릴 수 있어요.',
    tip: '손절매는 실패가 아니라 다음 기회를 위해 돈을 지키는 기술이에요.' },
];
let page = 0;
function openBook() { show('book', 'bookNext'); renderBook(); }
function turnPage(step) { page = Math.max(0, Math.min(TERMS.length - 1, page + step)); renderBook(); }
function renderBook() {
  const t = TERMS[page];
  $('bookIcon').src = iconURL(t.icon);
  $('bookTerm').textContent = t.term;
  $('bookLead').textContent = t.lead;
  $('bookDetail').textContent = t.detail;
  $('bookExample').textContent = t.example;
  $('bookTip').textContent = '💡 ' + t.tip;
  $('bookLeftNo').textContent = `- ${page * 2 + 1} -`;
  $('bookRightNo').textContent = `- ${page * 2 + 2} -  (${page + 1} / ${TERMS.length})`;
  $('bookPrev').disabled = page === 0;
  $('bookNext').disabled = page === TERMS.length - 1;
}

// ===== 💻 책상 컴퓨터: 개미증권 HTS (시장은 멈추지 않음) =====
const pcChartCtx = $('pcChart').getContext('2d');
// 컴퓨터를 켜면 바탕화면 → 아이콘으로 앱(HTS / 내 주식)을 엶
let pcApp = null;
function openPC() {
  $('pcQty').value = 1;
  show('pc');
  openApp(null);
  say('컴퓨터를 켰어요. 바탕화면에서 앱을 고르세요.');
}
const APPS = {
  hts: { el: 'appHts', name: '📈 개미증권 HTS', icon: 'up' },
  mine: { el: 'appMine', name: '📂 내 주식', icon: 'bag' },
  news: { el: 'appNews', name: '📰 최근 뉴스', icon: 'rumor' },
  terms: { el: 'appTerms', name: '📖 주식 용어', icon: 'doc' },
};
function openApp(app) {
  pcApp = app;
  $('pcDesktop').hidden = !!app;
  for (const [k, a] of Object.entries(APPS)) $(a.el).hidden = app !== k;
  if (app === 'news') newsSel = (ME && ST.news.filter(n => n.id > ME.readUpTo).pop()?.id) || ST.news[0]?.id || null;
  render();
  (app === 'hts' ? $('pcBuy') : app === 'terms' ? $('termSearch') : app ? $(APPS[app].el).querySelector('.app-close') : $('pcDesktop').querySelector('.desk-icon'))?.focus();
}

// 📰 최근 뉴스 앱: 왼쪽 목록, 오른쪽 기사
let newsSel = null;
function renderNewsApp() {
  $('newsClock').textContent = marketText();
  const list = ST.news;
  if (!list.length) {
    $('newsList').replaceChildren(el('p', 'pc-empty', '아직 뉴스가 없어요.'));
    return $('newsView').replaceChildren(el('p', 'pc-empty', '장이 열리면 사건이 일어나고 뉴스가 도착해요.'));
  }
  if (!list.some(n => n.id === newsSel)) newsSel = list[0].id;
  $('newsList').replaceChildren(...list.map(n => {
    const b = el('button', 'split-item' + (n.id === newsSel ? ' sel' : '') + (ME && n.id > ME.readUpTo ? ' unread' : ''));
    const img = el('img', 'px'); img.src = iconURL(n.icon); img.width = img.height = 16; img.alt = '';
    b.append(img, el('span', 'si-tag', newsTag(n)), el('span', 'si-text', n.title));
    b.addEventListener('click', () => { newsSel = n.id; render(); });
    return b;
  }));
  const n = list.find(x => x.id === newsSel), v = $('newsView');
  const head = el('div', 'nv-head'), img = el('img', 'px');
  img.src = iconURL(n.icon); img.width = img.height = 40; img.alt = '';
  head.append(img, el('span', 'tv-tag' + (n.crash ? ' breaking' : ''), newsTag(n)));
  const imp = el('ul', 'tv-impacts');
  const max = Math.max(...n.impacts.map(i => Math.abs(i.j)), 0.01);
  n.impacts.forEach(i => {
    const li = el('li', upDown(i.j)), bar = el('span', 'bar');
    bar.style.width = `${Math.abs(i.j) / max * 100}%`;
    li.append(el('span', 'nm', stockOf(symIndex(i.sym)).name), bar, el('span', 'v', `${i.j > 0 ? '▲' : '▼'} ${pct(i.j * 100)}`));
    imp.append(li);
  });
  v.replaceChildren(head, el('h2', 'nv-title', n.title), el('h3', '', '영향받은 종목'), imp, el('p', 'tv-learn', '📘 배우기 · ' + n.lesson));
  markRead(n);
}

// 📖 주식 용어 앱: 검색 + 목록 + 설명 (책장 용어책과 같은 내용)
let termSel = 0;
const termMatches = () => {
  const q = $('termSearch').value.trim();
  return TERMS.map((t, i) => i).filter(i => !q || [TERMS[i].term, TERMS[i].lead, TERMS[i].detail].some(x => x.includes(q)));
};
function renderTermsApp() {
  const ids = termMatches();
  if (ids.length && !ids.includes(termSel)) termSel = ids[0];
  $('termList').replaceChildren(...(ids.length ? ids.map(i => {
    const b = el('button', 'split-item' + (i === termSel ? ' sel' : ''));
    const img = el('img', 'px'); img.src = iconURL(TERMS[i].icon); img.width = img.height = 16; img.alt = '';
    b.append(img, el('span', 'si-text', TERMS[i].term));
    b.addEventListener('click', () => { termSel = i; render(); });
    return b;
  }) : [el('p', 'pc-empty', '찾는 용어가 없어요.')]));
  if (!ids.length) return $('termView').replaceChildren();
  const t = TERMS[termSel], img = el('img', 'px');
  img.src = iconURL(t.icon); img.width = img.height = 48; img.alt = '';
  $('termView').replaceChildren(img, el('h2', 'nv-title', t.term), el('p', 'tv-learn', t.lead),
    el('h3', '', '자세히 알아보기'), el('p', '', t.detail), el('h3', '', '게임에서 보면'), el('p', '', t.example), el('p', 'term-tip', '💡 ' + t.tip));
}
const SECTOR_COLOR = { tech: '#3b82f6', bio: '#e03e3e', food: '#f7c948', energy: '#8a76b8', auto: '#22a35a', leisure: '#f08a24' };
const marketText = () => `${fmtTime(ST.clock)} · ${ST.open ? '장 운영 중' : '장 마감'} · ${ST.season} · ${META.weather[ST.weather].name}`;

// 📂 내 주식: 내가 가진 종목만 모아 보기
function renderMine() {
  $('mineClock').textContent = marketText();
  const own = holdings().map(o => {
    const st = stockOf(o.i), p = priceOf(o.i), c = changeOf(o.i);
    return { ...o, st, p, c, value: p * o.qty, avg: o.cost / o.qty, pl: p * o.qty - o.cost };
  }).sort((a, b) => b.value - a.value);
  const cost = own.reduce((a, o) => a + o.cost, 0), value = own.reduce((a, o) => a + o.value, 0);
  const pl = value - cost, today = own.reduce((a, o) => a + o.c.diff * o.qty, 0);
  dlRows($('mineSum'), [
    ['보유 종목', `${own.length}개`], ['총 매입금액', won(cost)], ['총 평가금액', won(value)],
    ['평가손익', signed(pl, won(pl)), upDown(pl)], ['수익률', cost ? pct(pl / cost * 100) : '-', upDown(pl)],
    ['오늘 변동', signed(today, won(today)), upDown(today)],
  ]);
  const bySector = {};
  own.forEach(o => { bySector[o.st.sector] = (bySector[o.st.sector] || 0) + o.value; });
  const parts = Object.entries(bySector).sort((a, b) => b[1] - a[1]);
  $('mineAlloc').replaceChildren(...parts.map(([k, v]) => {
    const seg = el('span'); seg.style.flexBasis = `${v / value * 100}%`; seg.style.background = SECTOR_COLOR[k];
    seg.title = `${META.sectors[k].name} ${(v / value * 100).toFixed(1)}%`;
    return seg;
  }));
  $('mineLegend').replaceChildren(...parts.map(([k, v]) => {
    const sp = el('span', '', `${META.sectors[k].name} ${(v / value * 100).toFixed(0)}%`), i = el('i');
    i.style.background = SECTOR_COLOR[k]; sp.prepend(i);
    return sp;
  }));
  if (!own.length) {
    const p = el('p', 'pc-empty', '아직 가진 주식이 없어요. ');
    const go = el('button', 'mine-go', '개미증권 HTS 열기');
    go.addEventListener('click', () => openApp('hts'));
    p.append(go);
    return $('mineList').replaceChildren(p);
  }
  $('mineList').replaceChildren(...own.map(o => {
    const card = el('button', 'mine-card');
    const head = el('div', 'mc-head'), img = el('img', 'px');
    img.src = iconURL(META.sectors[o.st.sector].icon); img.width = img.height = 20; img.alt = '';
    head.append(img, el('b', '', o.st.name), el('span', 'mc-sec', META.sectors[o.st.sector].name));
    const price = el('div', 'mc-price ' + upDown(o.c.diff));
    price.append(el('span', 'big', won(o.p)), el('span', '', `${o.c.diff > 0 ? '▲' : o.c.diff < 0 ? '▼' : '-'} ${pct(o.c.rate)}`));
    const cv = el('canvas', 'px mc-chart'); cv.width = 300; cv.height = 90;
    drawPixelChart(cv.getContext('2d'), ST.hist[o.i], o.avg, 60);
    const dl = el('dl', 'pc-dl');
    dlRows(dl, [['보유', `${o.qty}주`], ['평단', won(o.avg)], ['평가금액', won(o.value)],
      ['평가손익', signed(o.pl, won(o.pl)), upDown(o.pl)], ['수익률', pct(o.pl / o.cost * 100), upDown(o.pl)], ['비중', `${(o.value / value * 100).toFixed(1)}%`]]);
    card.append(head, price, cv, dl);
    card.addEventListener('click', () => { sel = o.i; openApp('hts'); });
    return card;
  }));
}
function buildSectors() {
  const tabs = [['all', '전체'], ...Object.entries(META.sectors).map(([k, s]) => [k, s.name])];
  $('pcSectors').replaceChildren(...tabs.map(([k, name]) => {
    const b = el('button', '', name);
    b.dataset.sector = k;
    b.addEventListener('click', () => { sector = k; render(); });
    return b;
  }));
}
const visibleStocks = () => META.stocks.map((s, i) => i).filter(i => sector === 'all' || stockOf(i).sector === sector);
function select(i) { sel = i; render(); }

// 한국 주식시장 호가 단위, 잔량은 시세가 같으면 같은 값
const tickSize = p => (p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : 500);
const fakeVol = (...k) => 30 + (k.reduce((h, v) => (h * 31 + v) % 9973, 7) * 37) % 900;

function renderPC() {
  if (!isOpen('pc') || !META || !ST) return;
  $('taskTray').textContent = marketText();
  $('taskApp').textContent = pcApp ? APPS[pcApp].name : '';
  if (pcApp === 'mine') return renderMine();
  if (pcApp === 'news') return renderNewsApp();
  if (pcApp === 'terms') return renderTermsApp();
  if (pcApp !== 'hts') return;
  const st = stockOf(sel), price = priceOf(sel), { diff, rate } = changeOf(sel);
  const mine = ME?.hold[st.sym], avg = mine ? mine.cost / mine.qty : 0;
  $('pcClock').textContent = marketText();
  const idx = ST.index, iNow = idx[idx.length - 1], iPrev = idx[idx.length - 2] ?? iNow;
  $('pcIndex').textContent = `개미지수 ${iNow.toFixed(2)} ${iNow >= iPrev ? '▲' : '▼'}${pct((iNow / iPrev - 1) * 100)}`;
  $('pcIndex').className = 'pc-index ' + upDown(iNow - iPrev);

  [...$('pcSectors').children].forEach(b => b.setAttribute('aria-selected', b.dataset.sector === sector));
  $('pcWatch').replaceChildren(...visibleStocks().map(i => {
    const s = stockOf(i), c = changeOf(i), b = el('button', 'pc-w' + (i === sel ? ' sel' : ''));
    const img = el('img', 'px'); img.src = iconURL(META.sectors[s.sector].icon); img.width = img.height = 16; img.alt = '';
    b.append(img, el('span', 'n', s.name + (ME?.hold[s.sym] ? ' ●' : '')), el('span', 'p ' + upDown(c.diff), won(priceOf(i))), el('span', 'c ' + upDown(c.diff), pct(c.rate)));
    b.addEventListener('click', () => select(i));
    return b;
  }));
  const total = totalAssets(), ret = ME ? (total / META.START_CASH - 1) * 100 : 0;
  dlRows($('pcAccount'), ME ? [
    ['총자산', won(total)], ['수익률', pct(ret), upDown(ret)], ['예수금(현금)', won(ME.cash)],
    ['주식 평가액', won(stockValue())], ['은행 예금', won(ME.bank)], ['실현 손익', signed(ME.realized, won(ME.realized)), upDown(ME.realized)],
  ] : [['로그인', '필요']]);

  const q = $('pcQuote'); q.replaceChildren();
  const head = el('div', 'pc-q-head');
  head.append(el('b', '', st.name), el('span', 'pc-sector', META.sectors[st.sector].name));
  const pr = el('div', 'pc-q-price ' + upDown(diff));
  pr.append(el('span', 'big', won(price)), el('span', '', `${diff > 0 ? '▲' : diff < 0 ? '▼' : '-'} ${won(Math.abs(diff))} (${pct(rate)})`));
  const h = ST.hist[sel];
  q.append(head, pr, el('div', 'pc-q-meta', `최근 고가 ${won(Math.max(...h))} · 저가 ${won(Math.min(...h))}` + (mine ? ` · 보유 ${mine.qty}주 · 평단 ${won(avg)}` : '')));
  drawPixelChart(pcChartCtx, h, mine ? avg : null, 60);

  document.querySelectorAll('.pc-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === pcTab));
  const tab = $('pcTab'); tab.replaceChildren();
  if (pcTab === 'hold') {
    const own = holdings();
    if (!own.length) tab.append(el('p', 'pc-empty', '보유 종목이 없습니다. 오른쪽 주문창에서 매수해 보세요.'));
    else {
      const t = el('table'); t.append(row([['종목'], ['보유'], ['평단'], ['현재가'], ['평가금액'], ['평가손익'], ['수익률']], 'th'));
      own.forEach(o => { const a = o.cost / o.qty, p = priceOf(o.i), g = (p - a) * o.qty, r = (p / a - 1) * 100;
        t.append(row([[stockOf(o.i).name], [`${o.qty}주`], [won(a)], [won(p)], [won(p * o.qty)], [signed(g, won(g)), upDown(g)], [pct(r), upDown(r)]])); });
      tab.append(t);
    }
  } else if (pcTab === 'log') {
    if (!ME?.log.length) tab.append(el('p', 'pc-empty', '체결 내역이 없습니다.'));
    else {
      const t = el('table'); t.append(row([['종목'], ['구분'], ['수량'], ['체결가'], ['금액'], ['확정 손익']], 'th'));
      ME.log.slice(0, 30).forEach(l => t.append(row([[stockOf(symIndex(l.sym)).name], [l.side === 'buy' ? '매수' : '매도', l.side === 'buy' ? 'up' : 'down'],
        [`${l.qty}주`], [won(l.price)], [won(l.price * l.qty)], [l.gain === undefined ? '-' : signed(l.gain, won(l.gain)), upDown(l.gain || 0)]])));
      tab.append(t);
    }
  } else if (pcTab === 'info') {
    tab.append(el('p', '', st.desc));
    tab.append(el('p', 'pc-sub', `업종 ${META.sectors[st.sector].name} · 시장 민감도(베타) ${st.beta} — 시장 전체가 1% 움직일 때 평균 ${st.beta}% 움직입니다.`));
    tab.append(el('p', 'pc-sub', '특징: ' + st.tags.map(t => META.tagLabel[t]).join(' / ')));
    const related = ST.news.filter(n => n.impacts.some(i => i.sym === st.sym));
    tab.append(el('p', 'pc-sub', related.length ? '이 종목을 움직인 최근 사건' : '최근 이 종목을 움직인 사건이 없습니다.'));
    related.slice(0, 5).forEach(n => { const j = n.impacts.find(i => i.sym === st.sym).j; tab.append(el('p', 'pc-news ' + upDown(j), `${n.title} (${pct(j * 100)})`)); });
  } else {
    const t = el('table'); t.append(row([['순위'], ['참가자'], ['총자산'], ['수익률']], 'th'));
    [...ST.players].sort((a, b) => b.total - a.total).forEach((p, k) => {
      const r = (p.total / META.START_CASH - 1) * 100;
      t.append(row([[`${k + 1}`], [p.name + (p.id === ME?.id ? ' (나)' : '')], [won(p.total)], [pct(r), upDown(r)]]));
    });
    tab.append(t);
  }

  const tk = tickSize(price), book = $('pcBook'); book.replaceChildren();
  for (let k = 5; k >= -5; k--) {
    if (k === 0) continue;
    const vol = fakeVol(price, sel, k), tr = el('tr', k > 0 ? 'ask' : 'bid');
    const bar = el('td', 'vol', vol.toLocaleString('ko-KR')); bar.style.setProperty('--w', `${vol / 9.3}%`);
    tr.append(k > 0 ? bar : el('td'), el('td', 'pr' + (Math.abs(k) === 1 ? ' near' : ''), (price + k * tk).toLocaleString('ko-KR')), k < 0 ? bar : el('td'));
    book.append(tr);
  }

  const qty = Number($('pcQty').value);
  $('pcOrderName').textContent = `${st.name} · ${won(price)}`;
  dlRows($('pcOrderInfo'), [
    ['주문 금액', Number.isInteger(qty) && qty > 0 ? won(price * qty) : '-'],
    ['매수 가능', ME ? `${Math.floor(ME.cash / price)}주` : '-'], ['보유 수량', `${mine?.qty || 0}주`],
  ]);
  $('pcBuy').disabled = $('pcSell').disabled = !ME || !ST.open;
  $('pcStatus').textContent = (ST.open ? `● 장 운영 중 (${fmtTime(ST.clock)}) — 오후 6시에 마감 · 모든 참가자가 같은 시세를 봅니다`
    : `● 장 마감 (${fmtTime(ST.clock)}) — 오전 9시에 다시 열려요. 그동안 집 밖에서 알바·은행을 이용해 보세요`) + ' · ↑↓ 종목 · Esc 닫기';
}
function setQty(kind) {
  const n = kind === 'max' ? Math.floor((ME?.cash || 0) / priceOf(sel)) : kind === 'all' ? (ME?.hold[stockOf(sel).sym]?.qty || 0) : Number(kind);
  $('pcQty').value = Math.max(1, n);
  renderPC();
}

// ===== 효과 (카드 5): 시장 급락 사건에서만 =====
let actx = null, fxTimer = null, shockUntil = 0;
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
function effect() {
  shockUntil = performance.now() + 2000;
  const fx = $('fx'), anim = !store.settings.reduce;
  $('fxText').textContent = '시장 급락!';
  $('fxAnt').src = antURL('shock', ME?.color);
  fx.className = 'fx show fx-crash' + (anim ? ' anim' : '');
  if (anim) $('roomWrap').classList.add('shake');
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => { fx.className = 'fx'; $('roomWrap').classList.remove('shake'); }, 1400);
  beep([[180, 0, .2], [140, .2, .3]]);
}

// ===== 화면 =====
// 방 위 안내는 4초 뒤 사라짐 (HTS 주문 결과 칸은 계속 남음)
let msgTimer = null;
function say(text) {
  $('msg').textContent = text;
  $('pcMsg').textContent = text;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 4000);
}

function render() {
  if (!META || !ST) return;
  const total = totalAssets(), ret = ME ? (total / META.START_CASH - 1) * 100 : 0;
  const idx = ST.index, iNow = idx[idx.length - 1], iPrev = idx[idx.length - 2] ?? iNow;
  $('time').textContent = `${fmtTime(ST.clock)} ${ST.open ? '개장' : '마감'}`;
  $('time').className = ST.open ? 'up' : '';
  $('weather').textContent = `${ST.season} · ${META.weather[ST.weather].name}`;
  $('bank').textContent = ME ? won(ME.bank) : '-';
  $('index').textContent = `${iNow.toFixed(1)} (${pct((iNow / iPrev - 1) * 100)})`;
  $('index').className = upDown(iNow - iPrev);
  $('cash').textContent = ME ? won(ME.cash) : '-';
  $('stockValue').textContent = ME ? won(stockValue()) : '-';
  $('total').textContent = ME ? won(total) : '-';
  $('ret').textContent = ME ? pct(ret) : '-';
  $('ret').className = upDown(ret);
  $('learned').textContent = ME ? `${ME.learned.length} / ${META.lessons.length}` : '-';
  $('who').textContent = ME ? `👤 ${ME.name}` : '';
  $('logoutBtn').hidden = !ME;

  const coin = nearCoin();
  $('prompt').textContent = coin ? `[E] 🪙 동전 줍기 (${won(coin.value)})`
    : near ? (near.act === 'trade' ? `[E] 💻 컴퓨터 켜기 (HTS) · B 매수 · S 매도 — 선택 종목: ${stockOf(sel).name} ${won(priceOf(sel))}`
      : near.act === 'work' ? `[E] ${near.label} (시급 ${won(META.WAGE)}, 오늘 ${ME?.shiftsLeft ?? 0}번 남음)` : `[E] ${near.label}`)
    : P.scene === 'inside'
      ? '←↑↓→ 이동 · 물건 앞에서 E · 💻 책상: HTS · 📺 TV: 뉴스 · 🎨 고양이 옆 발판: 색 · ↓ 가운데 방 아래 현관으로 나가기'
      : '🏪 편의점 알바 · 🏦 은행 예금 · 🪙 동전 줍기 · ↑ 집 문으로 들어가기';
  $('prompt').classList.toggle('on', !!(near || coin));

  const unread = ME ? ST.news.filter(n => n.id > ME.readUpTo).length : 0;
  $('newsCount').textContent = !ME ? '-' : unread ? `📺 ${unread}건` : '없음';
  $('newsCount').className = unread ? 'up' : '';

  // 접속자 순위: 평소엔 작은 칩, 누르거나 마우스를 올리면 펼침 (방 그림을 덜 가리게)
  const ranked = [...ST.players].sort((a, b) => b.total - a.total), myRank = ranked.findIndex(p => p.id === ME?.id) + 1;
  $('onlineBtn').textContent = `👥 ${ranked.length}명 접속` + (myRank ? ` · 나 ${myRank}위` : '') + (boardOpen ? ' ▴' : ' ▾');
  $('onlineBtn').setAttribute('aria-expanded', boardOpen);
  $('scoreboard').classList.toggle('open', boardOpen);
  $('scoreboard').replaceChildren(...ranked.map((p, k) => {
    const li = el('li', p.id === ME?.id ? 'me' : ''), r = (p.total / META.START_CASH - 1) * 100;
    const sw = el('i'); sw.style.background = BODY[p.color]?.r || BODY.red.r;
    li.append(el('span', 'rk', `${k + 1}`), sw, el('span', 'nm', p.name), el('span', 'rt ' + upDown(r), pct(r)));
    return li;
  }));
  renderBillboard();
  renderPC();
  renderTV();
}

let boardOpen = false;
$('onlineBtn').addEventListener('click', () => { boardOpen = !boardOpen; render(); });

// 방 크기: 화면에 들어가는 가장 큰 '정수 배율'(3배, 4배…)로 맞춰 픽셀이 고르고 또렷하게 보이게 함
function fitRoom() {
  const col = $('roomCol');
  const availW = col.parentElement.clientWidth - 8;
  const availH = innerHeight - col.getBoundingClientRect().top - $('prompt').offsetHeight - 30;
  const raw = Math.min(availW / 320, availH / 176);
  const scale = raw >= 2 ? Math.floor(raw) : Math.max(1, raw);   // 아주 작은 화면만 소수 배율
  const w = `${Math.floor(320 * scale) + 8}px`;
  if (col.style.width !== w) col.style.width = w;
}
addEventListener('resize', fitRoom);
const fitObserver = new ResizeObserver(fitRoom);
fitObserver.observe(document.querySelector('.hud'));
fitObserver.observe($('prompt'));

// 집 밖 전광판: 모든 계정의 자산 순위 TOP 10 (그림의 화면 칸 위치에 맞춰 띄움)
function renderBillboard() {
  const bb = $('billboard'), sc = BILLBOARD.screen;
  bb.hidden = P.scene !== 'outside';
  if (bb.hidden) return;
  Object.assign(bb.style, { left: `${sc.x / 3.2}%`, top: `${sc.y / 1.76}%`, width: `${sc.w / 3.2}%`, height: `${sc.h / 1.76}%` });
  $('bbList').replaceChildren(...ST.top10.map((p, k) => {
    const li = el('li', p.name === ME?.name ? 'me' : '');
    li.append(el('span', 'rk', `${k + 1}`), el('span', 'nm', p.name), el('span', 'am', `${Math.round(p.total / 10000).toLocaleString('ko-KR')}만`));
    return li;
  }));
}

// 이름표: 방 그림 위에 HTML로 띄움. 겹치면 가장 앞(아래쪽)에 서 있는 개미의 이름만 보임
function renderLabels(ants) {
  const box = $('labels'), want = new Set(ants.map(a => a.id));
  for (const n of [...box.children]) if (!want.has(n.dataset.id)) n.remove();
  const shown = [];
  for (const a of [...ants].sort((x, y) => y.y - x.y)) {
    let n = box.querySelector(`[data-id="${a.id}"]`);
    if (!n) { n = el('span', 'tag'); n.dataset.id = a.id; box.append(n); }
    if (n.textContent !== a.name) n.textContent = a.name;
    n.classList.toggle('me', !!a.me);
    n.style.left = `${a.x / 3.2}%`;
    n.style.top = `${(a.y - 18) / 1.76}%`;
    const r = n.getBoundingClientRect();
    const hidden = shown.some(s => r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top);
    n.style.visibility = hidden ? 'hidden' : 'visible';
    if (!hidden) shown.push(r);
  }
}

// ===== 이동 (방향키를 누르고 있는 동안) =====
const roomCtx = $('room').getContext('2d');
let lastSent = 0, sentX = 0, sentY = 0, sentScene = '', lastCoin = null;
function update(dt, now) {
  const canMove = loggedIn() && !anyOpen() && $('login').hidden;
  let dx = canMove ? held.has('ArrowRight') - held.has('ArrowLeft') : 0;
  let dy = canMove ? held.has('ArrowDown') - held.has('ArrowUp') : 0;
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  P.moving = !!(dx || dy);
  if (dx && !blocked(P.x + dx * SPEED * dt, P.y, P.scene)) P.x += dx * SPEED * dt;
  if (dy && !blocked(P.x, P.y + dy * SPEED * dt, P.scene)) P.y += dy * SPEED * dt;
  // 현관: 가운데 방 아래로 → 집 밖 / 집 문 앞에서 위로 → 집 안
  if (P.scene === 'inside' && P.y >= 174 && P.x > EXIT[0] + 4 && P.x < EXIT[1] - 4) {
    Object.assign(P, { scene: 'outside', x: 172, y: 56 });
    say('집 밖으로 나왔어요. 편의점 알바, 은행 예금, 동전 줍기로 돈을 벌 수 있어요.');
    near = undefined;
    render();
  } else if (P.scene === 'outside' && P.y <= 49 && P.x > HOUSE_DOOR[0] + 4 && P.x < HOUSE_DOOR[1] - 4) {
    Object.assign(P, { scene: 'inside', x: 172, y: 158 });
    say('집으로 들어왔어요.');
    near = undefined;
  }
  const n = nearestObject(P.x, P.y, P.scene);
  const c = nearCoin()?.id;
  if (n !== near || c !== lastCoin) { near = n; lastCoin = c; render(); }
  if (ME && now - lastSent > 150 && (Math.round(P.x) !== sentX || Math.round(P.y) !== sentY || P.scene !== sentScene)) {
    lastSent = now; sentX = Math.round(P.x); sentY = Math.round(P.y); sentScene = P.scene;
    api('move', { x: sentX, y: sentY, scene: P.scene });
  }
}

let last = performance.now();
function loop(now) {
  update(Math.min(0.05, (now - last) / 1000), now); // 탭 복귀 직후 순간이동 방지
  last = now;
  if (META && ST) {
    const still = store.settings.reduce;
    const ants = ST.players.filter(p => p.id !== ME?.id && (others.get(p.id)?.scene || p.scene) === P.scene).map(p => {
      const pos = others.get(p.id) || p.pos, r = p.total / META.START_CASH - 1;
      return { id: p.id, name: p.name, x: pos.x, y: pos.y, color: p.color, mood: r > 0.01 ? 'happy' : r < -0.01 ? 'sad' : 'normal' };
    });
    if (ME) {
      const r = totalAssets() / META.START_CASH - 1;
      ants.push({ id: ME.id, name: ME.name, me: true, x: P.x, y: P.y, color: ME.color,
        mood: now < shockUntil ? 'shock' : r > 0.01 ? 'happy' : r < -0.01 ? 'sad' : 'normal',
        bob: !still && (P.moving || isOpen('work')) && Math.floor(now / 150) % 2 === 0 });
    }
    drawRoom(roomCtx, {
      scene: P.scene, clock: ST.clock, night: isNight(ST.clock), coins: ST.coins, day: ST.index.length, weather: ST.weather, anim: still ? 0 : Math.floor(now / 120), flash: now < shockUntil,
      hist: ST.hist[sel], unread: hasUnread(), near, myColor: ME?.color,
      blink: !still && Math.floor(now / 400) % 2 === 0, ants,
    });
    renderLabels(ants);
  }
  requestAnimationFrame(loop);
}

// ===== 입력 연결 =====
$('modalClose').addEventListener('click', () => hide('modal'));
document.querySelectorAll('.app-close').forEach(b => b.addEventListener('click', () => openApp(null)));
document.querySelectorAll('.desk-icon').forEach(b => {
  b.querySelector('img').src = iconURL(APPS[b.dataset.app].icon);
  b.addEventListener('click', () => openApp(b.dataset.app));
});
$('pcPower').addEventListener('click', () => hide('pc'));
$('termSearch').addEventListener('input', render);
$('tvClose').addEventListener('click', () => hide('tv'));
$('tvPrev').addEventListener('click', () => tvMove(-1));
$('tvNext').addEventListener('click', () => tvMove(1));
$('bookClose').addEventListener('click', () => hide('book'));
$('bookPrev').addEventListener('click', () => turnPage(-1));
$('bookNext').addEventListener('click', () => turnPage(1));
$('pcBuy').addEventListener('click', () => trade('buy', Number($('pcQty').value)));
$('pcSell').addEventListener('click', () => trade('sell', Number($('pcQty').value)));
$('pcQty').addEventListener('input', renderPC);
document.querySelectorAll('.pc-quick button').forEach(b => b.addEventListener('click', () => setQty(b.dataset.q)));
document.querySelectorAll('.pc-tabs button').forEach(b => b.addEventListener('click', () => { pcTab = b.dataset.tab; renderPC(); }));

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || !$('login').hidden) return;
  const t = e.target instanceof Element ? e.target : document.body;
  const closeKey = e.code === 'Escape' || (e.code === 'KeyE' && !t.closest('input'));
  if (isOpen('tv') || isOpen('book')) {
    const id = isOpen('tv') ? 'tv' : 'book';
    if (closeKey) { e.preventDefault(); return hide(id); }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      const step = e.code === 'ArrowRight' ? 1 : -1;
      return id === 'tv' ? tvMove(step) : turnPage(step);
    }
    if (ARROWS.has(e.code)) e.preventDefault();
    return;
  }
  if (isOpen('pc')) {
    // Esc·E: 앱 → 바탕화면 → 컴퓨터 끄기
    if (closeKey) { e.preventDefault(); return pcApp ? openApp(null) : hide('pc'); }
    if (t.closest('input') && !(t.id === 'termSearch' && (e.code === 'ArrowUp' || e.code === 'ArrowDown'))) return; // 입력 중
    // 뉴스·용어 앱: ↑↓로 목록 이동 (검색창에서도 됨)
    if ((pcApp === 'news' || pcApp === 'terms') && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      e.preventDefault();
      const step = e.code === 'ArrowDown' ? 1 : -1;
      if (pcApp === 'news') { const k = ST.news.findIndex(n => n.id === newsSel); newsSel = ST.news[Math.max(0, Math.min(ST.news.length - 1, k + step))]?.id ?? newsSel; }
      else { const ids = termMatches(), k = ids.indexOf(termSel); termSel = ids[Math.max(0, Math.min(ids.length - 1, k + step))] ?? termSel; }
      return render();
    }
    if (pcApp === 'hts' && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      e.preventDefault();
      const list = visibleStocks(), k = list.indexOf(sel);
      return select(list[(k + (e.code === 'ArrowDown' ? 1 : list.length - 1)) % list.length] ?? list[0]);
    }
    if (ARROWS.has(e.code)) return e.preventDefault();
  }
  if (t.closest('select, input, textarea')) return;
  if (ARROWS.has(e.code)) { e.preventDefault(); held.add(e.code); return; }
  // 키를 누르고 있을 때의 자동 반복은 무시 → 키 한 번 = 동작 한 번
  if (e.repeat) return;
  if (isOpen('modal')) {
    if (closeKey) { e.preventDefault(); hide('modal'); }
    return;
  }
  if (e.code === 'KeyE') { e.preventDefault(); return interact(); }
  if (e.code === 'KeyB') { e.preventDefault(); return trade('buy', 1); }
  if (e.code === 'KeyS') { e.preventDefault(); return trade('sell', 1); }
});
document.addEventListener('keyup', e => held.delete(e.code));
// 창을 벗어나면 눌린 키만 초기화 (시장은 모두의 것이라 멈추지 않음)
window.addEventListener('blur', () => held.clear());

function applyReduce() {
  document.body.classList.toggle('reduce', store.settings.reduce);
  if (store.settings.reduce) { $('fx').classList.remove('anim'); $('roomWrap').classList.remove('shake'); }
}
$('mute').addEventListener('change', e => {
  store.settings.mute = e.target.checked; save();
  if (e.target.checked) stopSounds();
});
$('reduce').addEventListener('change', e => { store.settings.reduce = e.target.checked; save(); applyReduce(); });

// ===== 시작 =====
$('mute').checked = store.settings.mute;
$('reduce').checked = store.settings.reduce;
applyReduce();
if (note) { $('notice').textContent = '⚠ ' + note; $('notice').hidden = false; }
$('logo').src = antURL('happy');
connect();
api('me').then(d => { if (d.ok) { say('다시 오셨네요! 방향키로 움직이고, 물건 앞에서 E를 누르세요.'); render(); } else showLogin(); });
fitRoom();
requestAnimationFrame(loop);
