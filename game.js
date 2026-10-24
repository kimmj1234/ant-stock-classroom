'use strict';
// ===== 개미 투자 교실 (브라우저) =====
// 시장·사건·계좌는 서버(server.js)가 정하고, 여기서는 보여 주기·내 개미 이동·주문 보내기만 합니다.

const STORE_KEY = 'stockGame.v2';
const START_POS = { x: 168, y: 150 };
const SPEED = 60;   // 방 픽셀/초

const $ = id => document.getElementById(id);
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const signed = (n, s) => (n > 0 ? '+' : '') + s;
const pct = n => signed(n, n.toFixed(2) + '%');
const upDown = n => (n > 0 ? 'up' : n < 0 ? 'down' : '');

// ===== 이 브라우저에 보존하는 값 (카드 4): 내 도전 기록·최고 수익률·배운 개념·설정 =====
function defaultStore() {
  return { best: null, records: [], learned: [], settings: { mute: false, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches } };
}
function okRecord(r) {
  return r && typeof r === 'object' && (r.result === 'won' || r.result === 'lost') && Number.isInteger(r.day) &&
    Number.isFinite(r.ret) && typeof r.cause === 'string' && Number.isFinite(r.vol);
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
  if (Array.isArray(v.learned)) d.learned = [...new Set(v.learned.filter(k => typeof k === 'string' && k.length < 20))];
  if (Number.isFinite(v.best)) d.best = v.best;
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
let META = null;   // 종목·업종·규칙 (접속 때 한 번)
let ST = null;     // 공유 시장 상태 (매일)
let ME = null;     // 내 계좌 (로그인했을 때만)
const others = new Map();   // 다른 참가자 개미 위치
let sel = 0, sector = 'all', pcTab = 'hold';
let newsSeen = 0, readUpTo = 0, resultSeq = null;

// ===== 내 개미 (위치는 이 브라우저가 정하고 서버에 알림) =====
const P = { ...START_POS, moving: false };
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
const totalAssets = () => (ME ? ME.cash + stockValue() : 0);

// ===== 서버 통신: 로그인은 HttpOnly 쿠키로 유지 (비밀값이 화면·주소·저장소에 남지 않음) =====
async function api(name, body = {}) {
  try {
    const r = await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.auth === false && name !== 'me' && ME) showLogin('로그인이 만료됐어요. 다시 로그인해 주세요.');
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
  if (first) { newsSeen = readUpTo = latest; }
  for (const n of s.news) if (n.id > newsSeen && n.crash) effect('crash');
  newsSeen = Math.max(newsSeen, latest);
  for (const p of s.players) if (!others.has(p.id)) others.set(p.id, { id: p.id, ...p.pos });
  if (ME) {
    const seq = ME.last?.seq || 0;
    if (resultSeq === null) resultSeq = seq;
    else if (seq !== resultSeq) { resultSeq = seq; showResult(ME.last); }
  }
  render();
}

// ===== 로그인: 닉네임이 처음이면 계정 생성, 있으면 비밀번호 확인 =====
function showLogin(msg = '') {
  ME = null; resultSeq = null;
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
  closePC(); closeModal();
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
    if (d.me) ME = d.me;
    say(d.msg);
    render();
  });
}

// ===== 방 안의 물건 (E) =====
const modalOpen = () => !$('modal').hidden;
const pcOpen = () => !$('pc').hidden;
const resultOpen = () => !$('result').hidden;

function openModal(title, content) {
  $('modalTitle').textContent = title;
  $('modalBody').replaceChildren(content);
  $('modal').hidden = false;
  held.clear();
  $('modalClose').focus();
}
function closeModal() {
  if (!modalOpen()) return;
  $('modal').hidden = true;
  document.activeElement?.blur();
}
const tpl = id => $(id).content.cloneNode(true);

async function interact() {
  if (!near) return say('근처에 사용할 물건이 없어요. 노란 화살표가 뜨는 곳까지 가 보세요.');
  switch (near.act) {
    case 'trade': return openPC();
    case 'news': return openNews();
    case 'glossary': return openModal('📚 주식 용어 사전', tpl('tpl-glossary'));
    case 'rules': return openModal('🧑‍🏫 게임 규칙', tpl('tpl-rules'));
    case 'records': return openModal('🗂 내 도전 기록', buildRecords());
    case 'color': {
      if (!loggedIn()) return say('로그인이 필요해요.');
      const d = await api('color', { color: near.color });
      if (d.me) ME = d.me;
      say(d.ok ? `🎨 캐릭터가 ${BODY_NAME[near.color]}이 되었어요!` : d.msg);
      return render();
    }
  }
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function row(cells, cls) { const tr = el('tr', cls); cells.forEach(([t, c]) => tr.append(el('td', c, t))); return tr; }
function dlRows(dl, pairs) { dl.replaceChildren(...pairs.flatMap(([k, v, c]) => [el('dt', '', k), el('dd', c, v)])); }
const impactText = n => n.impacts.slice(0, 4).map(i => `${stockOf(symIndex(i.sym)).name} ${pct(i.j * 100)}`).join(' · ')
  + (n.impacts.length > 4 ? ` 외 ${n.impacts.length - 4}종목` : '');

// TV: 읽지 않은 뉴스와 📘 배우기 → 배운 개념 증가
function openNews() {
  if (!ST) return;
  const unread = ST.news.filter(n => n.id > readUpTo);
  const show = unread.length ? unread : ST.news.slice(0, 5);
  if (!show.length) return say('📺 아직 도착한 뉴스가 없어요.');
  const frag = document.createDocumentFragment();
  for (const n of show) {
    const div = el('div', 'news-card');
    const img = el('img', 'px'); img.src = iconURL(n.icon); img.width = img.height = 32; img.alt = '';
    const body = el('div');
    body.append(el('b', n.crash ? 'up' : '', n.title), el('p', 'sub', `${n.day}일차 · ${impactText(n)}`), el('p', 'learn', '📘 ' + n.lesson));
    div.append(img, body);
    frag.append(div);
    if (!store.learned.includes(n.key)) store.learned.push(n.key);
  }
  readUpTo = Math.max(readUpTo, ST.news[0]?.id || 0);
  save();
  openModal(unread.length ? `📺 새 뉴스 ${unread.length}건 — 배우기` : '📺 최근 뉴스 다시 보기', frag);
  render();
}

// 캐비닛: 변동성 값별로 묶은 내 도전 기록 (카드 3: 값 하나를 바꿔 비교)
function buildRecords() {
  const frag = tpl('tpl-records-skeleton');
  const recs = store.records;
  const sum = frag.querySelector('.summary');
  for (const vol of [...new Set(recs.map(r => r.vol))]) {
    const rs = recs.filter(r => r.vol === vol);
    const rets = rs.map(r => r.ret).sort((a, b) => a - b), m = rets.length >> 1;
    const median = rets.length % 2 ? rets[m] : (rets[m - 1] + rets[m]) / 2;
    const causes = {};
    rs.filter(r => r.result === 'lost').forEach(r => { causes[r.cause] = (causes[r.cause] || 0) + 1; });
    const top = Object.entries(causes).sort((a, b) => b[1] - a[1])[0];
    sum.append(row([[`${(vol * 100).toFixed(1)}%`], [rs.length], [`${rs.filter(r => r.result === 'won').length}/${rs.length}`],
      [`${pct(rets[0])} ~ ${pct(rets[rets.length - 1])}`], [pct(median)], [top ? `${top[0]} (${top[1]}회)` : '-']]));
  }
  if (!recs.length) sum.append(row([['아직 기록이 없습니다.']]));
  const body = frag.querySelector('.records');
  recs.slice(-20).reverse().forEach((r, i) => body.append(row([[recs.length - i], [r.result === 'won' ? '성공' : '실패', r.result === 'won' ? 'up' : ''],
    [`${r.day}일`], [pct(r.ret)], [r.cause], [`${(r.vol * 100).toFixed(1)}%`]])));
  frag.querySelector('.best').textContent = store.best === null ? '-' : pct(store.best);
  frag.querySelector('.learned-count').textContent = `${store.learned.length} / ${META.lessons.length}`;
  return frag;
}

// ===== 도전 결과 (서버가 판정, 바로 다음 도전 시작) =====
function lessonFor(r) {
  if (r.result === 'won') return r.top > 0.7
    ? '성공했지만 한 종목에 집중했어요. 다음엔 여러 업종에 나눠서도 같은 결과를 낼 수 있는지 도전해 보세요.'
    : '여러 종목에 나눠 담고 뉴스에 맞게 대응했어요. 분산투자와 정보 판단이 수익을 만든 좋은 예입니다.';
  if (r.trades === 0) return '한 번도 거래하지 않았어요. 현금만 들고 있으면 손실은 없지만 수익도 없습니다.';
  if (r.top > 0.7) return '자산 대부분이 한 종목에 몰려 있었어요. 한 회사의 악재가 전체 손실이 되지 않도록 업종을 나눠 보세요.';
  if (r.ret > 0) return '수익은 냈지만 목표에는 못 미쳤어요. TV에서 사건을 읽고 여파가 이어지는 며칠을 노려 보세요.';
  return '손실이 커질 때 미리 팔아 손실을 제한하는 것(손절매)도 중요한 투자 기술입니다.';
}
function showResult(r) {
  store.records.push({ result: r.result, day: r.days, ret: r.ret, cause: r.cause, vol: META.vol });
  if (store.records.length > 200) store.records.shift();
  if (store.best === null || r.ret > store.best) store.best = r.ret;
  save();
  closePC(); closeModal(); held.clear();
  $('resultAnt').src = antURL(r.result === 'won' ? 'happy' : 'sad', ME.color);
  $('resultTitle').textContent = `${r.round}회차 도전 ${r.result === 'won' ? '성공!' : '실패'}`;
  $('resultCause').textContent = `${r.cause} · ${r.days}거래일`;
  $('resultRet').textContent = `최종 자산 ${won(r.total)} (${pct(r.ret)})`;
  $('resultLesson').textContent = '📘 ' + lessonFor(r) + ' 다음 도전은 100만 원으로 이미 시작됐어요.';
  $('result').hidden = false;
  $('resultClose').focus();
  effect(r.result === 'won' ? 'win' : 'lose');
}
function closeResult() { $('result').hidden = true; document.activeElement?.blur(); }

// ===== 책상 컴퓨터: 개미증권 HTS (시장은 멈추지 않음) =====
const pcChartCtx = $('pcChart').getContext('2d');
function openPC() {
  held.clear();
  $('pc').hidden = false;
  $('pcQty').value = 1;
  say('HTS를 켰어요. 업종을 고르고, 종목을 눌러 수량을 정해 매수·매도하세요.');
  render();
  $('pcBuy').focus();
}
function closePC() {
  if (!pcOpen()) return;
  $('pc').hidden = true;
  document.activeElement?.blur();
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

// 한국 주식시장 호가 단위, 잔량은 같은 날엔 같은 값
const tickSize = p => (p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : 500);
const fakeVol = (...k) => 30 + (k.reduce((h, v) => (h * 31 + v) % 9973, 7) * 37) % 900;

function renderPC() {
  if (!pcOpen() || !META || !ST) return;
  const st = stockOf(sel), price = priceOf(sel), { diff, rate } = changeOf(sel);
  const mine = ME?.hold[st.sym], avg = mine ? mine.cost / mine.qty : 0;
  $('pcClock').textContent = `${ST.day}일차 · ${ST.month}월 · ${META.weather[ST.weather].name}`;
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
    ['주식 평가액', won(stockValue())], ['목표까지', total >= META.TARGET ? '달성' : won(META.TARGET - total)],
  ] : [['로그인', '필요']]);

  const q = $('pcQuote'); q.replaceChildren();
  const head = el('div', 'pc-q-head');
  head.append(el('b', '', st.name), el('span', 'pc-sector', META.sectors[st.sector].name));
  const pr = el('div', 'pc-q-price ' + upDown(diff));
  pr.append(el('span', 'big', won(price)), el('span', '', `${diff > 0 ? '▲' : diff < 0 ? '▼' : '-'} ${won(Math.abs(diff))} (${pct(rate)})`));
  const h = ST.hist[sel];
  q.append(head, pr, el('div', 'pc-q-meta', `60일 고가 ${won(Math.max(...h))} · 저가 ${won(Math.min(...h))}` + (mine ? ` · 보유 ${mine.qty}주 · 평단 ${won(avg)}` : '')));
  drawPixelChart(pcChartCtx, h, mine ? avg : null, 60);

  document.querySelectorAll('.pc-tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === pcTab));
  const tab = $('pcTab'); tab.replaceChildren();
  if (pcTab === 'hold') {
    const own = holdings();
    if (!own.length) tab.append(el('p', 'pc-empty', '보유 종목이 없습니다. 오른쪽 주문창에서 매수해 보세요.'));
    else {
      const t = el('table'); t.append(row([['종목'], ['보유'], ['평단'], ['현재가'], ['평가금액'], ['손익'], ['수익률']], 'th'));
      own.forEach(o => { const a = o.cost / o.qty, p = priceOf(o.i), g = (p - a) * o.qty, r = (p / a - 1) * 100;
        t.append(row([[stockOf(o.i).name], [`${o.qty}주`], [won(a)], [won(p)], [won(p * o.qty)], [signed(g, won(g)), upDown(g)], [pct(r), upDown(r)]])); });
      tab.append(t);
    }
  } else if (pcTab === 'log') {
    if (!ME?.log.length) tab.append(el('p', 'pc-empty', '이번 도전의 체결 내역이 없습니다.'));
    else {
      const t = el('table'); t.append(row([['일차'], ['종목'], ['구분'], ['수량'], ['체결가'], ['금액']], 'th'));
      ME.log.forEach(l => t.append(row([[`${l.day}일`], [stockOf(symIndex(l.sym)).name], [l.side === 'buy' ? '매수' : '매도', l.side === 'buy' ? 'up' : 'down'], [`${l.qty}주`], [won(l.price)], [won(l.price * l.qty)]])));
      tab.append(t);
    }
  } else if (pcTab === 'info') {
    tab.append(el('p', '', st.desc));
    tab.append(el('p', 'pc-sub', `업종 ${META.sectors[st.sector].name} · 시장 민감도(베타) ${st.beta} — 시장 전체가 1% 움직일 때 평균 ${st.beta}% 움직입니다.`));
    tab.append(el('p', 'pc-sub', '특징: ' + st.tags.map(t => META.tagLabel[t]).join(' / ')));
    const related = ST.news.filter(n => n.impacts.some(i => i.sym === st.sym));
    tab.append(el('p', 'pc-sub', related.length ? '이 종목을 움직인 최근 사건' : '최근 이 종목을 움직인 사건이 없습니다.'));
    related.slice(0, 5).forEach(n => { const j = n.impacts.find(i => i.sym === st.sym).j; tab.append(el('p', 'pc-news ' + upDown(j), `${n.day}일차 · ${n.title} (${pct(j * 100)})`)); });
  } else {
    const t = el('table'); t.append(row([['순위'], ['참가자'], ['도전'], ['총자산'], ['수익률']], 'th'));
    [...ST.players].sort((a, b) => b.total - a.total).forEach((p, k) => {
      const r = (p.total / META.START_CASH - 1) * 100;
      t.append(row([[`${k + 1}`], [p.name + (p.id === ME?.id ? ' (나)' : '')], [`${p.round}회차`], [won(p.total)], [pct(r), upDown(r)]]));
    });
    tab.append(t);
  }

  const tk = tickSize(price), book = $('pcBook'); book.replaceChildren();
  for (let k = 5; k >= -5; k--) {
    if (k === 0) continue;
    const vol = fakeVol(ST.day, sel, k), tr = el('tr', k > 0 ? 'ask' : 'bid');
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
  $('pcBuy').disabled = $('pcSell').disabled = !ME;
  $('pcStatus').textContent = '● 장 운영 중 — 시장은 멈추지 않고, 모든 참가자가 같은 시세를 봅니다 · ↑↓ 종목 · B/S 1주 · Esc 닫기';
}
function setQty(kind) {
  const n = kind === 'max' ? Math.floor((ME?.cash || 0) / priceOf(sel)) : kind === 'all' ? (ME?.hold[stockOf(sel).sym]?.qty || 0) : Number(kind);
  $('pcQty').value = Math.max(1, n);
  renderPC();
}

// ===== 효과 (카드 5): 도전 성공·실패, 시장 급락에서만 =====
const SOUNDS = {
  win:   [[523, 0, .15], [659, .15, .15], [784, .3, .3]],
  lose:  [[392, 0, .25], [330, .25, .25], [262, .5, .4]],
  crash: [[180, 0, .2], [140, .2, .3]],
};
const FX_TEXT = { win: '목표 달성!', lose: '도전 종료', crash: '시장 급락!' };
const FX_MOOD = { win: 'happy', lose: 'sad', crash: 'shock' };
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
function effect(kind) {
  if (kind === 'crash') shockUntil = performance.now() + 2000;
  const fx = $('fx'), anim = !store.settings.reduce;
  $('fxText').textContent = FX_TEXT[kind];
  $('fxAnt').src = antURL(FX_MOOD[kind], ME?.color);
  fx.className = `fx show fx-${kind}` + (anim ? ' anim' : '');
  if (kind === 'crash' && anim) $('roomWrap').classList.add('shake');
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => { fx.className = 'fx'; $('roomWrap').classList.remove('shake'); }, 1400);
  beep(SOUNDS[kind]);
}

// ===== 화면 =====
function say(text) { $('msg').textContent = text; $('pcMsg').textContent = text; }

function render() {
  if (!META || !ST) return;
  const total = totalAssets(), ret = ME ? (total / META.START_CASH - 1) * 100 : 0;
  const idx = ST.index, iNow = idx[idx.length - 1], iPrev = idx[idx.length - 2] ?? iNow;
  $('round').textContent = ME ? `${ME.round}회차 · ${ST.day - ME.startDay}/${META.CHALLENGE_DAYS}일` : '로그인 필요';
  $('weather').textContent = `${ST.month}월 · ${META.weather[ST.weather].name}`;
  $('index').textContent = `${iNow.toFixed(1)} (${pct((iNow / iPrev - 1) * 100)})`;
  $('index').className = upDown(iNow - iPrev);
  $('cash').textContent = ME ? won(ME.cash) : '-';
  $('stockValue').textContent = ME ? won(stockValue()) : '-';
  $('total').textContent = ME ? won(total) : '-';
  $('ret').textContent = ME ? pct(ret) : '-';
  $('ret').className = upDown(ret);
  $('learned').textContent = `${store.learned.length} / ${META.lessons.length}`;
  $('progress').value = ME ? Math.min(100, Math.max(0, (total - META.LOSS_LIMIT) / (META.TARGET - META.LOSS_LIMIT) * 100)) : 50;
  $('who').textContent = ME ? `👤 ${ME.name}` : '';
  $('logoutBtn').hidden = !ME;

  $('prompt').textContent = near
    ? (near.act === 'trade' ? `[E] 💻 컴퓨터 켜기 (HTS) · B 매수 · S 매도 — 선택 종목: ${stockOf(sel).name} ${won(priceOf(sel))}` : `[E] ${near.label}`)
    : '←↑↓→ 이동 · 물건 앞에서 E · 💻 책상에서 HTS로 거래 · 📺 TV에서 뉴스 배우기 · 🎨 고양이 옆 발판에서 색 바꾸기';
  $('prompt').classList.toggle('on', !!near);

  const latest = ST.news[0];
  $('ticker').hidden = !latest;
  if (latest) $('ticker').textContent = `📰 ${latest.day}일차 ${latest.title}` + (ST.news.some(n => n.id > readUpTo) ? ' · 📺 TV에서 배우기!' : '');

  $('scoreboard').replaceChildren(...[...ST.players].sort((a, b) => b.total - a.total).map((p, k) => {
    const li = el('li', p.id === ME?.id ? 'me' : ''), r = (p.total / META.START_CASH - 1) * 100;
    const sw = el('i'); sw.style.background = BODY[p.color]?.r || BODY.red.r;
    li.append(el('span', 'rk', `${k + 1}`), sw, el('span', 'nm', p.name), el('span', 'rt ' + upDown(r), pct(r)));
    return li;
  }));
  renderPC();
}

// 이름표: 방 그림 위에 HTML로 띄움 (그림 크기가 바뀌어도 비율로 따라감)
function renderLabels(ants) {
  const box = $('labels'), want = new Set(ants.map(a => a.id));
  for (const n of [...box.children]) if (!want.has(n.dataset.id)) n.remove();
  for (const a of ants) {
    let n = box.querySelector(`[data-id="${a.id}"]`);
    if (!n) { n = el('span', 'tag'); n.dataset.id = a.id; box.append(n); }
    if (n.textContent !== a.name) n.textContent = a.name;
    n.classList.toggle('me', a.me);
    n.style.left = `${a.x / 3.2}%`;
    n.style.top = `${(a.y - 18) / 1.76}%`;
  }
}

// ===== 이동 (방향키를 누르고 있는 동안) =====
const roomCtx = $('room').getContext('2d');
let lastSent = 0, sentX = 0, sentY = 0;
function update(dt, now) {
  const canMove = loggedIn() && !modalOpen() && !pcOpen() && !resultOpen() && $('login').hidden;
  let dx = canMove ? held.has('ArrowRight') - held.has('ArrowLeft') : 0;
  let dy = canMove ? held.has('ArrowDown') - held.has('ArrowUp') : 0;
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  P.moving = !!(dx || dy);
  if (dx && !blocked(P.x + dx * SPEED * dt, P.y)) P.x += dx * SPEED * dt;
  if (dy && !blocked(P.x, P.y + dy * SPEED * dt)) P.y += dy * SPEED * dt;
  const n = nearestObject(P.x, P.y);
  if (n !== near) { near = n; render(); }
  if (ME && now - lastSent > 150 && (Math.round(P.x) !== sentX || Math.round(P.y) !== sentY)) {
    lastSent = now; sentX = Math.round(P.x); sentY = Math.round(P.y);
    api('move', { x: sentX, y: sentY });
  }
}

let last = performance.now();
function loop(now) {
  update(Math.min(0.05, (now - last) / 1000), now); // 탭 복귀 직후 순간이동 방지
  last = now;
  if (META && ST) {
    const still = store.settings.reduce;
    const ants = ST.players.filter(p => p.id !== ME?.id).map(p => {
      const pos = others.get(p.id) || p.pos, r = p.total / META.START_CASH - 1;
      return { id: p.id, name: p.name, x: pos.x, y: pos.y, color: p.color, mood: r > 0.01 ? 'happy' : r < -0.01 ? 'sad' : 'normal' };
    });
    if (ME) {
      const r = totalAssets() / META.START_CASH - 1;
      ants.push({ id: ME.id, name: ME.name, me: true, x: P.x, y: P.y, color: ME.color,
        mood: now < shockUntil ? 'shock' : r > 0.01 ? 'happy' : r < -0.01 ? 'sad' : 'normal',
        bob: !still && P.moving && Math.floor(now / 150) % 2 === 0 });
    }
    drawRoom(roomCtx, {
      day: ST.day, weather: ST.weather, anim: still ? 0 : Math.floor(now / 120), flash: now < shockUntil,
      hist: ST.hist[sel], unread: ST.news.some(n => n.id > readUpTo), near, myColor: ME?.color,
      blink: !still && Math.floor(now / 400) % 2 === 0, ants,
    });
    renderLabels(ants);
  }
  requestAnimationFrame(loop);
}

// ===== 입력 연결 =====
$('modalClose').addEventListener('click', closeModal);
$('resultClose').addEventListener('click', closeResult);
$('pcClose').addEventListener('click', closePC);
$('pcBuy').addEventListener('click', () => trade('buy', Number($('pcQty').value)));
$('pcSell').addEventListener('click', () => trade('sell', Number($('pcQty').value)));
$('pcQty').addEventListener('input', renderPC);
document.querySelectorAll('.pc-quick button').forEach(b => b.addEventListener('click', () => setQty(b.dataset.q)));
document.querySelectorAll('.pc-tabs button').forEach(b => b.addEventListener('click', () => { pcTab = b.dataset.tab; renderPC(); }));

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || !$('login').hidden) return;
  const t = e.target instanceof Element ? e.target : document.body;
  if (resultOpen()) {
    if (['Escape', 'KeyE'].includes(e.code)) { e.preventDefault(); closeResult(); }
    return;
  }
  if (pcOpen()) {
    if (e.code === 'Escape' || (e.code === 'KeyE' && !t.closest('input'))) { e.preventDefault(); return closePC(); }
    if (t.closest('input')) return; // 수량 입력 중
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
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
  if (modalOpen()) {
    if (['Escape', 'KeyE'].includes(e.code)) { e.preventDefault(); closeModal(); }
    return;
  }
  if (e.code === 'KeyE') { e.preventDefault(); return interact(); }
  if (e.code === 'KeyB') { e.preventDefault(); return trade('buy', 1); }
  if (e.code === 'KeyS') { e.preventDefault(); return trade('sell', 1); }
});
document.addEventListener('keyup', e => held.delete(e.code));
// 창을 벗어나면 눌린 키만 초기화 (시장은 모두의 것이라 멈추지 않음)
window.addEventListener('blur', () => held.clear());

$('mute').addEventListener('change', e => {
  store.settings.mute = e.target.checked; save();
  if (e.target.checked) stopSounds();
});
$('reduce').addEventListener('change', e => {
  store.settings.reduce = e.target.checked; save();
  if (e.target.checked) { $('fx').classList.remove('anim'); $('roomWrap').classList.remove('shake'); }
});

// ===== 시작 =====
$('mute').checked = store.settings.mute;
$('reduce').checked = store.settings.reduce;
if (note) { $('notice').textContent = '⚠ ' + note; $('notice').hidden = false; }
$('logo').src = antURL('happy');
connect();
api('me').then(d => { if (d.ok) { if (d.me) ME = d.me; say('다시 오셨네요! 방향키로 움직이고, 물건 앞에서 E를 누르세요.'); render(); } else showLogin(); });
requestAnimationFrame(loop);
