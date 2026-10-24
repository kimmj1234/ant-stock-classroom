'use strict';
// ===== 나의 두번째 인생 서버: 파일 제공 + 계정 + 하나의 공유 시장 =====
// 실행: node server.js → http://localhost:5000
// 끝이 없는 게임입니다. 게임 시계는 접속자가 있으면 계속 흐르고, 장은 닫히지 않습니다(자정마다 하루가 바뀜),
// 시장·계좌는 data/ 에 저장되어 서버를 다시 켜도 이어집니다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const market = require('./market');

const PORT = 5000, HOST = '127.0.0.1';
const START_CASH = 1000000;
const GAME_MINUTE_MS = 2000;                   // 게임 1분 = 실제 2초 (실제 1분 = 게임 30분, 하루 = 실제 48분)
const MARKET_MS = 1000;                        // 시세는 실제 1초마다 움직임 (게임 시계와 따로)
// 집 밖에서 돈 버는 방법 (위치는 pixel.js의 바깥 지도와 같음)
const STORE = { x: 8, y: 6, w: 88, h: 50 }, BANK = { x: 224, y: 6, w: 88, h: 50 };
const WAGE = 15000, WORK_MS = 8000, SHIFTS_PER_DAY = 3;
const COIN_SPOTS = [[30, 85], [80, 125], [100, 165], [140, 120], [200, 165], [230, 85], [60, 105], [270, 85], [20, 160], [300, 85], [120, 75], [200, 125]];
const MAX_COINS = 5;
const BODY_COLORS = ['red', 'blue', 'yellow', 'white', 'black'];
const MAX_ACCOUNTS = 200, LOG_MAX = 200, ASSET_MAX = 120;
const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');   // 별명·소금·해시·색 (비밀번호 원문 없음)
const STATE_FILE = path.join(DATA_DIR, 'state.json');         // 시장과 각자의 계좌
// / = 메인 홈페이지, /play = 게임
const FILES = { '/': 'home.html', '/play': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/pixel.js': 'pixel.js', '/hd.js': 'hd.js', '/game.js': 'game.js' };
Object.assign(FILES, { '/site.css': 'site.css', '/site.js': 'site.js', '/wordmark.css': 'wordmark.css' });   // 메인 페이지 메뉴바, 글자 로고
FILES['/logo.svg'] = 'assets/logo.svg';   // 로고: 픽셀 하트 두 개 (목숨 두 개 = 두 번째 인생)
for (const c of ['red', 'blue', 'yellow', 'white', 'black']) FILES[`/assets/person-${c}.png`] = `assets/person-${c}.png`;   // 고화질 캐릭터 그림
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

const readJSONFile = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
function writeJSONFile(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data));
  fs.renameSync(file + '.tmp', file);   // 쓰는 도중 꺼져도 파일이 반쯤 깨지지 않게
}

// ===== 저장된 시장 불러오기 (형식이 맞지 않으면 새 시장) =====
function loadMarket(saved) {
  const ok = saved && Array.isArray(saved.stocks) && saved.stocks.length === market.STOCK_DEFS.length &&
    saved.stocks.every((s, i) => s.sym === market.STOCK_DEFS[i].sym && Number.isFinite(s.price) && s.price > 0 && Array.isArray(s.hist)) &&
    Array.isArray(saved.index) && Array.isArray(saved.news) && market.WEATHER[saved.weather] && Number.isInteger(saved.day);
  if (!ok) return market.createMarket();
  const fresh = market.createMarket();
  for (const k of ['open', 'tick', 'sinceNews', 'clock', 'depositRate']) if (saved[k] === undefined) saved[k] = fresh[k];
  saved.stocks.forEach(st => { if (!Number.isFinite(st.raw)) st.raw = st.price; });
  return saved;
}
const saved = readJSONFile(STATE_FILE) || {};
const M = loadMarket(saved.market);
if (!M.open) market.openDay(M);   // 장은 항상 열려 있음 (예전 저장 파일이 마감 상태여도 바로 개장)
let coins = [], coinId = 0;

// ===== 계정: 별명이 처음이면 자동 생성, 있으면 비밀번호 확인 =====
const accounts = readJSONFile(ACCOUNTS_FILE) || {};
const nameKey = n => n.normalize('NFC').toLowerCase();
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
function checkPw(pw, acc) {
  const a = Buffer.from(hashPw(pw, acc.salt), 'hex'), b = Buffer.from(acc.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cleanName = s => (typeof s === 'string' ? s.normalize('NFC').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10) : '');

// ===== 참가자 계좌 (계정 key 하나에 하나, 끝 없이 이어짐) =====
const players = new Map();   // 공개 id → 참가자
const tokens = new Map();    // 로그인 토큰의 해시 → 공개 id (토큰 원문은 저장하지 않음)
const tokenHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const clients = new Set();   // { res, id }
const failures = new Map();  // 별명 → { n, until } 비밀번호 연속 실패 잠금
let posDirty = false;

const num = (v, d) => (Number.isFinite(v) ? v : d);
function makePlayer(key, acc, s = {}) {
  const hold = {};
  if (s.hold && typeof s.hold === 'object') {
    for (const [sym, h] of Object.entries(s.hold)) {
      if (M.stocks.some(x => x.sym === sym) && Number.isInteger(h?.qty) && h.qty > 0 && Number.isFinite(h.cost)) hold[sym] = { qty: h.qty, cost: h.cost };
    }
  }
  return {
    id: crypto.randomUUID(), key, name: acc.name, color: acc.color,
    cash: num(s.cash, START_CASH), bank: Math.max(0, num(s.bank, 0)), hold, realized: num(s.realized, 0), best: num(s.best, START_CASH),
    earned: num(s.earned, 0), interest: num(s.interest, 0),
    // 오늘 수익률의 출발점 (처음엔 시작 100만 원 기준, 자정마다 그때 총자산으로 바뀜)
    dayStart: num(s.dayStart, START_CASH), dayExtra: num(s.dayExtra, 0), shiftDay: num(s.shiftDay, -1), shifts: num(s.shifts, 0), work: null,
    scene: s.scene === 'outside' ? 'outside' : 'inside',
    log: Array.isArray(s.log) ? s.log.slice(0, LOG_MAX) : [], assetHist: Array.isArray(s.assetHist) ? s.assetHist.filter(Number.isFinite).slice(-ASSET_MAX) : [],
    learned: Array.isArray(s.learned) ? s.learned.filter(k => market.LESSON_KEYS.some(l => l.key === k)) : [],
    readUpTo: num(s.readUpTo, M.newsId),
    // 마지막으로 서 있던 자리 (새로고침·재접속해도 이어서)
    pos: { x: Math.max(0, Math.min(320, num(s.pos?.x, 168))), y: Math.max(0, Math.min(176, num(s.pos?.y, 150))) },
  };
}
for (const [key, s] of Object.entries(saved.portfolios || {})) if (accounts[key]) { const p = makePlayer(key, accounts[key], s); players.set(p.id, p); }
// 서버를 다시 켜도 로그인이 이어지도록 (쿠키 토큰의 해시 → 계정)
for (const [h, key] of Object.entries(saved.sessions || {})) {
  const p = [...players.values()].find(x => x.key === key);
  if (p && /^[0-9a-f]{64}$/.test(h)) tokens.set(h, p.id);
}

const nearRect = (p, r, d = 24) => Math.hypot(Math.max(r.x - p.pos.x, 0, p.pos.x - (r.x + r.w)), Math.max(r.y - p.pos.y, 0, p.pos.y - (r.y + r.h))) <= d;
const priceOf = sym => M.stocks.find(s => s.sym === sym).price;
// 오늘 수익률의 기준: 오늘 자정의 총자산 + 그 뒤 알바·동전·예금 이자로 번 돈 (주식으로 번 것만, 게임 하루마다 새로 시작)
const baseOf = p => p.dayStart + (p.earned + p.interest - p.dayExtra);
const totalOf = p => p.cash + p.bank + Object.entries(p.hold).reduce((a, [sym, h]) => a + h.qty * priceOf(sym), 0);
const online = id => [...clients].some(c => c.id === id);

function saveState() {
  const portfolios = {};
  for (const p of players.values()) {
    const { cash, bank, hold, realized, best, log, assetHist, learned, readUpTo, earned, interest, dayStart, dayExtra, shiftDay, shifts, pos, scene } = p;
    portfolios[p.key] = { cash, bank, hold, realized, best, log, assetHist, learned, readUpTo, earned, interest, dayStart, dayExtra, shiftDay, shifts, pos, scene };
  }
  const sessions = {};
  for (const [h, id] of tokens) { const p = players.get(id); if (p) sessions[h] = p.key; }
  writeJSONFile(STATE_FILE, { market: M, portfolios, sessions });
}

// ===== 상태 보내기 (Server-Sent Events) =====
function publicState() {
  return {
    season: market.seasonName(M), weather: M.weather, clock: M.clock, open: M.open, depositRate: M.depositRate,
    coins: coins.map(({ id, x, y }) => ({ id, x, y })),   // 금액은 보내지 않음 → 주운 뒤에야 알 수 있음
    // 전광판: 접속하지 않은 사람까지 모든 계정의 자산 순위 TOP 10
    top10: [...players.values()].map(p => ({ name: p.name, total: totalOf(p), base: baseOf(p) })).sort((a, b) => b.total - a.total).slice(0, 10),
    hist: M.stocks.map(s => s.hist), index: M.index, news: M.news.slice(0, 20), day: M.day, forces: market.forcesOf(M),
    players: [...players.values()].filter(p => online(p.id)).map(p => ({ id: p.id, name: p.name, color: p.color, total: totalOf(p), base: baseOf(p), pos: p.pos, scene: p.scene })),
  };
}
// 내 기록은 나에게만 보냄
const meOf = p => p && {
  id: p.id, name: p.name, color: p.color, cash: p.cash, bank: p.bank, hold: p.hold, log: p.log, realized: p.realized,
  earned: p.earned, interest: p.interest, shiftsLeft: SHIFTS_PER_DAY - (p.shiftDay === M.day ? p.shifts : 0), workUntil: p.work?.until || 0,
  base: baseOf(p), best: p.best, assetHist: p.assetHist, learned: p.learned, readUpTo: p.readUpTo, pos: p.pos, scene: p.scene,
};
const send = (res, event, data) => res?.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
function broadcast() {
  const pub = publicState();
  for (const c of clients) send(c.res, 'state', { ...pub, me: meOf(players.get(c.id)) });
}

const META = {
  vol: market.VOL, START_CASH, BODY_COLORS, WAGE, WORK_MS, SHIFTS_PER_DAY,
  sectors: market.SECTORS, tagLabel: market.TAG_LABEL, weather: market.WEATHER, lessons: market.LESSON_KEYS,
  stocks: market.STOCK_DEFS.map(({ sym, sector, name, price, beta, tags, desc }) => ({ sym, sector, name, base: price, beta, tags, desc })),
};

// ===== 게임 시계: 접속자가 있을 때만 흐름. 장은 쉬지 않고 10분마다 시세, 자정에 하루 마감(예금 이자) → 바로 새 하루 =====
function closeOfDay() {
  for (const p of players.values()) {
    const pay = Math.floor(p.bank * M.depositRate);
    p.bank += pay; p.interest += pay;
    const t = totalOf(p);
    p.assetHist.push(t);
    if (p.assetHist.length > ASSET_MAX) p.assetHist.shift();
    p.best = Math.max(p.best, t);
    p.dayStart = t; p.dayExtra = p.earned + p.interest;   // 오늘 수익률 0%에서 다시 시작
  }
}
function maybeSpawnCoin() {
  if (coins.length >= MAX_COINS || Math.random() > 0.3) return;   // 2초마다 30% → 이전과 비슷한 빈도
  const free = COIN_SPOTS.filter(([x, y]) => !coins.some(c => c.x === x && c.y === y));
  const [x, y] = free[Math.floor(Math.random() * free.length)];
  coins.push({ id: ++coinId, x, y, value: 100 + 50 * Math.floor(Math.random() * 9) });
}
let ticks = 0;
setInterval(() => {
  for (const c of clients) if (!c.res && Date.now() - c.seen > 5000) clients.delete(c);   // 5초 넘게 안 받아 간 폴링 접속자는 나간 것으로 봄
  if (!clients.size) return;
  M.clock = (Math.floor(M.clock) + 1) % 1440;
  if (M.clock === 0) { market.closeDay(M); closeOfDay(); market.openDay(M); }   // 자정: 오늘 일봉을 닫고 곧바로 새 일봉 (거래는 끊기지 않음)
  maybeSpawnCoin();
  broadcast();
  if (++ticks % 5 === 0) saveState();
}, GAME_MINUTE_MS);

// 시세: 실제 1초마다 한 번 (접속자가 있을 때만, 게임 시계처럼)
setInterval(() => {
  if (!clients.size || !M.open) return;
  market.stepTick(M);
  broadcast();
}, MARKET_MS);

// 개미 위치는 잦으니 모아서 보냄
setInterval(() => {
  if (!posDirty) return;
  posDirty = false;
  const pos = [...players.values()].filter(p => online(p.id)).map(p => ({ id: p.id, x: p.pos.x, y: p.pos.y, scene: p.scene }));
  for (const c of clients) send(c.res, 'pos', pos);
}, 150);

// ===== API =====
function login(b) {
  const name = cleanName(b.name), pw = typeof b.password === 'string' ? b.password : '';
  if (!name) return { ok: false, msg: '닉네임을 1~10자로 입력하세요.' };
  if (pw.length < 4 || pw.length > 30) return { ok: false, msg: '비밀번호는 4~30자로 입력하세요.' };
  const key = nameKey(name), f = failures.get(key);
  if (f && f.until > Date.now()) return { ok: false, msg: `비밀번호를 여러 번 틀렸어요. ${Math.ceil((f.until - Date.now()) / 1000)}초 뒤에 다시 시도하세요.` };
  let acc = accounts[key], created = false;
  if (acc) {
    if (!checkPw(pw, acc)) {
      const n = (f?.n || 0) + 1;
      failures.set(key, { n, until: n >= 5 ? Date.now() + 30000 : 0 });
      return { ok: false, msg: '이미 있는 닉네임이에요. 비밀번호가 맞지 않습니다.' };
    }
  } else {
    if (Object.keys(accounts).length >= MAX_ACCOUNTS) return { ok: false, msg: '계정이 너무 많아 새로 만들 수 없어요.' };
    const salt = crypto.randomBytes(16).toString('hex');
    acc = accounts[key] = { name, salt, hash: hashPw(pw, salt), color: 'red' };
    writeJSONFile(ACCOUNTS_FILE, accounts);
    created = true;
  }
  failures.delete(key);
  let p = [...players.values()].find(x => x.key === key);
  if (!p) { p = makePlayer(key, acc); players.set(p.id, p); }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(tokenHash(token), p.id);
  return { ok: true, token, created, msg: created ? `'${acc.name}' 계정을 새로 만들었어요. 100만 원으로 시작합니다.` : `'${acc.name}'(으)로 로그인했어요.` };
}

const API = {
  order(b, p) {
    const st = M.stocks.find(s => s.sym === b.sym), qty = b.qty;
    if (!st) return { ok: false, msg: '없는 종목이에요.' };
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return { ok: false, msg: '수량은 1주 이상의 정수로 입력하세요.' };
    const def = market.STOCK_DEFS.find(s => s.sym === b.sym), h = p.hold[st.sym] || { qty: 0, cost: 0 };
    let msg;
    if (b.side === 'buy') {
      const max = Math.floor(p.cash / st.price);
      if (qty > max) return { ok: false, msg: `현금이 부족해요. ${def.name}은(는) 최대 ${max}주까지 살 수 있어요.` };
      p.cash -= st.price * qty; h.qty += qty; h.cost += st.price * qty;
      p.hold[st.sym] = h;
      msg = `${def.name} ${qty}주 매수 체결 (${st.price.toLocaleString('ko-KR')}원) → 보유 ${h.qty}주`;
      p.log.unshift({ sym: st.sym, side: 'buy', qty, price: st.price, at: Date.now() });
    } else if (b.side === 'sell') {
      if (qty > h.qty) return { ok: false, msg: h.qty ? `보유 수량이 부족해요. ${def.name} 보유 ${h.qty}주` : `${def.name} 주식이 없어 팔 수 없어요.` };
      const avg = h.cost / h.qty, gain = Math.round((st.price - avg) * qty);
      h.qty -= qty; h.cost = h.qty ? h.cost - avg * qty : 0; p.cash += st.price * qty; p.realized += gain;
      if (!h.qty) delete p.hold[st.sym];
      msg = `${def.name} ${qty}주 매도 체결 (${st.price.toLocaleString('ko-KR')}원, 손익 ${gain > 0 ? '+' : ''}${gain.toLocaleString('ko-KR')}원) → 보유 ${h.qty}주`;
      p.log.unshift({ sym: st.sym, side: 'sell', qty, price: st.price, gain, at: Date.now() });
    } else return { ok: false, msg: '매수 또는 매도만 할 수 있어요.' };
    if (p.log.length > LOG_MAX) p.log.pop();
    return { ok: true, msg };
  },
  move(b, p) {
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !['inside', 'outside'].includes(b.scene)) return { ok: false };
    p.scene = b.scene;
    p.pos = { x: Math.max(0, Math.min(320, b.x)), y: Math.max(0, Math.min(176, b.y)) };
    posDirty = true;
    return { ok: true };
  },
  color(b, p) {
    if (!BODY_COLORS.includes(b.color)) return { ok: false, msg: '고를 수 없는 색이에요.' };
    p.color = accounts[p.key].color = b.color;
    writeJSONFile(ACCOUNTS_FILE, accounts);
    broadcast();
    return { ok: true };
  },
  // TV에서 뉴스를 보면 그 사건의 개념을 배운 것으로 기록
  learn(b, p) {
    const n = M.news.find(x => x.id === b.newsId);
    if (!n) return { ok: false };
    if (!p.learned.includes(n.key)) p.learned.push(n.key);
    p.readUpTo = Math.max(p.readUpTo, n.id);
    return { ok: true };
  },
  // 🏪 편의점 알바: 시작 → WORK_MS 뒤 완료 요청 → 시급 지급 (하루 SHIFTS_PER_DAY번)
  workStart(b, p) {
    if (p.scene !== 'outside' || !nearRect(p, STORE)) return { ok: false, msg: '편의점 앞에서만 알바를 할 수 있어요.' };
    if (p.work) return { ok: false, msg: '이미 일하는 중이에요.' };
    if (p.shiftDay !== M.day) { p.shiftDay = M.day; p.shifts = 0; }
    if (p.shifts >= SHIFTS_PER_DAY) return { ok: false, msg: '오늘 알바는 다 했어요. 자정이 지나면 다시 할 수 있어요.' };
    p.work = { until: Date.now() + WORK_MS };
    return { ok: true, msg: '🏪 편의점 알바 시작! 손님을 맞는 중…' };
  },
  workDone(b, p) {
    if (!p.work) return { ok: false, msg: '일하는 중이 아니에요.' };
    if (Date.now() < p.work.until - 300) return { ok: false, msg: '아직 일하는 중이에요.' };
    p.work = null; p.shifts++; p.cash += WAGE; p.earned += WAGE;
    return { ok: true, msg: `🏪 알바 끝! 시급 ${WAGE.toLocaleString('ko-KR')}원을 받았어요. (오늘 남은 알바 ${SHIFTS_PER_DAY - p.shifts}번)` };
  },
  // 🪙 동전 줍기: 서버가 아는 내 위치가 동전 가까이일 때만
  coin(b, p) {
    const k = coins.findIndex(c => c.id === b.id);
    if (k < 0) return { ok: false, msg: '이미 누가 주워 갔어요.' };
    const c = coins[k];
    if (p.scene !== 'outside' || Math.hypot(p.pos.x - c.x, p.pos.y - c.y) > 16) return { ok: false, msg: '동전에 더 가까이 가세요.' };
    coins.splice(k, 1);
    p.cash += c.value; p.earned += c.value;
    broadcast();
    return { ok: true, msg: `🪙 동전 ${c.value.toLocaleString('ko-KR')}원을 주웠어요!` };
  },
  // 🏦 은행: 예금은 원금이 그대로이고, 자정마다 이자가 붙음
  bank(b, p) {
    if (p.scene !== 'outside' || !nearRect(p, BANK)) return { ok: false, msg: '은행 앞에서만 이용할 수 있어요.' };
    const amt = b.amount;
    if (!Number.isInteger(amt) || amt < 1) return { ok: false, msg: '금액은 1원 이상의 정수로 입력하세요.' };
    if (b.action === 'deposit') {
      if (amt > p.cash) return { ok: false, msg: `현금이 부족해요. 최대 ${p.cash.toLocaleString('ko-KR')}원까지 맡길 수 있어요.` };
      p.cash -= amt; p.bank += amt;
      return { ok: true, msg: `🏦 ${amt.toLocaleString('ko-KR')}원을 예금했어요.` };
    }
    if (b.action === 'withdraw') {
      if (amt > p.bank) return { ok: false, msg: `예금이 부족해요. 최대 ${p.bank.toLocaleString('ko-KR')}원까지 찾을 수 있어요.` };
      p.bank -= amt; p.cash += amt;
      return { ok: true, msg: `🏦 ${amt.toLocaleString('ko-KR')}원을 찾았어요.` };
    }
    return { ok: false, msg: '예금 또는 출금만 할 수 있어요.' };
  },
  me: () => ({ ok: true }),   // 로그인이 아직 유효한지 확인
};

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2048) { resolve(null); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve(null); } });
  });
}
function json(res, code, data, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
// 로그인 토큰은 HttpOnly 쿠키로만 주고받음 (화면·주소·페이지 저장소에 남지 않음)
const COOKIE = 'antTok';
const tokenOf = req => (req.headers.cookie || '').split(';').map(c => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1] || '';
// 터널(https)로 들어온 요청이면 Secure를 붙여 https에서만 쿠키가 오가게 함
const setCookie = (token, req) => ({ 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 2592000 : 0}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}` });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    const c = { res, id: tokens.get(tokenHash(tokenOf(req))) || '' };
    clients.add(c);
    send(res, 'meta', META);
    broadcast();
    const beat = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(beat); clients.delete(c); broadcast(); });
    return;
  }

  // 무료 터널(trycloudflare)은 실시간 스트림을 붙잡아 둘 때가 있음 → 화면이 직접 최신 상태를 받아 감.
  // 이렇게 받아 가는 사람도 접속자(clients)로 셈 (res 없이 seen 시각만)
  if (req.method === 'GET' && url.pathname === '/api/poll') {
    const id = tokens.get(tokenHash(tokenOf(req))) || '';
    // ?peek: 홈페이지가 마을 모습만 보는 것은 접속으로 세지 않음 (아무도 게임에 없으면 시계·시세는 멈춰 있음)
    if (id && !url.searchParams.has('peek')) {
      let c = [...clients].find(c => !c.res && c.id === id);
      if (!c) clients.add(c = { id });
      c.seen = Date.now();
    }
    return json(res, 200, { ...publicState(), me: meOf(players.get(id)), meta: url.searchParams.has('meta') ? META : undefined });
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5), b = await readBody(req);
    if (!b || (!['login', 'logout'].includes(name) && !API[name])) return json(res, 400, { ok: false, msg: '잘못된 요청이에요.' });
    if (name === 'login') {
      const { token, ...rest } = login(b);
      return json(res, 200, rest, token ? setCookie(token, req) : {});
    }
    if (name === 'logout') { tokens.delete(tokenHash(tokenOf(req))); return json(res, 200, { ok: true }, setCookie('', req)); }
    const p = players.get(tokens.get(tokenHash(tokenOf(req))));
    // 로그인 전은 정상 상황이라 200 + auth:false (브라우저 콘솔에 빨간 오류가 남지 않게)
    if (!p) return json(res, 200, { ok: false, auth: false, msg: '로그인이 필요해요.' });
    const out = API[name](b, p);
    if (['order', 'bank', 'workDone'].includes(name) && out.ok) broadcast();
    return json(res, 200, { ...out, me: meOf(p) });
  }

  if (req.method === 'GET' && FILES[url.pathname]) {
    const file = FILES[url.pathname];
    return fs.readFile(path.join(__dirname, file), (err, data) => {
      if (err) { res.writeHead(500); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-store' });
      res.end(data);
    });
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('없는 주소입니다.');
}).listen(PORT, HOST, () => console.log(`나의 두번째 인생: http://localhost:${PORT}`));

// 서버를 끌 때 마지막 상태 저장
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { saveState(); process.exit(0); });
