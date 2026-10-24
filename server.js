'use strict';
// ===== 개미 투자 교실 서버: 파일 제공 + 계정 + 하나의 공유 시장 =====
// 실행: node server.js → http://localhost:5000
// 시장은 접속한 사람이 한 명이라도 있으면 쉬지 않고 흘러갑니다 (시작·일시정지·다시 시작 없음).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const market = require('./market');

const PORT = 5000, HOST = '127.0.0.1';
const START_CASH = 1000000, TARGET = 1150000, LOSS_LIMIT = 850000, CHALLENGE_DAYS = 60, DAY_MS = 1200;
const BODY_COLORS = ['red', 'blue', 'yellow', 'white', 'black'];
const MAX_ACCOUNTS = 200;
const DATA_FILE = path.join(__dirname, 'data', 'accounts.json');   // 별명·소금·해시·색만 저장 (비밀번호 원문 없음)
const FILES = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/pixel.js': 'pixel.js', '/game.js': 'game.js' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const M = market.createMarket();
const players = new Map();   // 공개 id → 참가자 (이번 서버 실행 동안의 계좌)
const tokens = new Map();    // 로그인 토큰(비밀) → 공개 id
const clients = new Set();   // { res, id }
const failures = new Map();  // 별명 → { n, until } 비밀번호 연속 실패 잠금
let posDirty = false;

// ===== 계정: 별명이 처음이면 자동 생성, 있으면 비밀번호 확인 =====
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {}; } catch { accounts = {}; }
function saveAccounts() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 1));
}
const nameKey = n => n.normalize('NFC').toLowerCase();
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
function checkPw(pw, acc) {
  const a = Buffer.from(hashPw(pw, acc.salt), 'hex'), b = Buffer.from(acc.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cleanName = s => (typeof s === 'string' ? s.normalize('NFC').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10) : '');

// ===== 참가자와 도전 =====
function newAccount(p) {
  p.cash = START_CASH; p.hold = {}; p.log = [];
  p.round = (p.round || 0) + 1; p.startDay = M.day;
}
const priceOf = sym => M.stocks.find(s => s.sym === sym).price;
const totalOf = p => p.cash + Object.entries(p.hold).reduce((a, [sym, h]) => a + h.qty * priceOf(sym), 0);
const online = id => [...clients].some(c => c.id === id);

// 매일 장 마감 뒤 각자의 도전 결과 확인 → 결과를 남기고 새 도전 시작
function checkChallenges() {
  for (const p of players.values()) {
    const total = totalOf(p), days = M.day - p.startDay;
    let result = null, cause = '';
    if (total >= TARGET) { result = 'won'; cause = '목표 달성'; }
    else if (total <= LOSS_LIMIT) { result = 'lost'; cause = '손실 한도 도달'; }
    else if (days >= CHALLENGE_DAYS) { result = 'lost'; cause = '기간 만료(목표 미달)'; }
    if (!result) continue;
    const conc = Object.entries(p.hold).map(([sym, h]) => h.qty * priceOf(sym));
    const stockSum = conc.reduce((a, b) => a + b, 0);
    p.last = {
      seq: (p.last?.seq || 0) + 1, round: p.round, result, cause, days, total,
      ret: +((total / START_CASH - 1) * 100).toFixed(2), trades: p.log.length, top: stockSum ? Math.max(...conc) / stockSum : 0,
    };
    newAccount(p);
  }
}

// ===== 상태 보내기 (Server-Sent Events) =====
function publicState() {
  return {
    day: M.day, month: market.monthOf(M), weather: M.weather,
    hist: M.stocks.map(s => s.hist), index: M.index, news: M.news.slice(0, 20),
    players: [...players.values()].filter(p => online(p.id)).map(p => ({
      id: p.id, name: p.name, color: p.color, total: totalOf(p), round: p.round, pos: p.pos,
    })),
  };
}
const meOf = p => p && {
  id: p.id, name: p.name, color: p.color, cash: p.cash, hold: p.hold, log: p.log.slice(0, 30),
  round: p.round, startDay: p.startDay, last: p.last || null,
};
const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
function broadcast() {
  const pub = publicState();
  for (const c of clients) send(c.res, 'state', { ...pub, me: meOf(players.get(c.id)) });
}

const META = {
  vol: market.VOL, START_CASH, TARGET, LOSS_LIMIT, CHALLENGE_DAYS, DAY_MS, BODY_COLORS,
  sectors: market.SECTORS, tagLabel: market.TAG_LABEL, weather: market.WEATHER, lessons: market.LESSON_KEYS,
  stocks: market.STOCK_DEFS.map(({ sym, sector, name, price, beta, tags, desc }) => ({ sym, sector, name, base: price, beta, tags, desc })),
};

// ===== 시장 시계: 접속자가 있을 때만 하루씩 흐름 =====
setInterval(() => {
  if (!clients.size) return;
  market.stepDay(M);
  if (M.stocks[0].hist.length > 61) M.stocks.forEach(s => s.hist.shift());   // 차트는 최근 60거래일
  if (M.index.length > 61) M.index.shift();
  checkChallenges();
  broadcast();
}, DAY_MS);

// 개미 위치는 잦으니 모아서 보냄
setInterval(() => {
  if (!posDirty) return;
  posDirty = false;
  const pos = [...players.values()].filter(p => online(p.id)).map(p => ({ id: p.id, x: p.pos.x, y: p.pos.y }));
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
    saveAccounts();
    created = true;
  }
  failures.delete(key);
  let p = [...players.values()].find(x => x.key === key);
  if (!p) {
    p = { id: crypto.randomUUID(), key, name: acc.name, color: acc.color, pos: { x: 168, y: 150 } };
    newAccount(p);
    players.set(p.id, p);
  }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, p.id);
  return { ok: true, token, created, msg: created ? `'${acc.name}' 계정을 새로 만들었어요.` : `'${acc.name}'(으)로 로그인했어요.` };
}

const API = {
  order(b, p) {
    const st = M.stocks.find(s => s.sym === b.sym), qty = b.qty;
    if (!st) return { ok: false, msg: '없는 종목이에요.' };
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return { ok: false, msg: '수량은 1주 이상의 정수로 입력하세요.' };
    const def = market.STOCK_DEFS.find(s => s.sym === b.sym), h = p.hold[st.sym] || { qty: 0, cost: 0 };
    if (b.side === 'buy') {
      const max = Math.floor(p.cash / st.price);
      if (qty > max) return { ok: false, msg: `현금이 부족해요. ${def.name}은(는) 최대 ${max}주까지 살 수 있어요.` };
      p.cash -= st.price * qty; h.qty += qty; h.cost += st.price * qty;
      p.hold[st.sym] = h;
      p.log.unshift({ day: M.day, sym: st.sym, side: 'buy', qty, price: st.price });
      return { ok: true, msg: `${def.name} ${qty}주 매수 체결 (${st.price.toLocaleString('ko-KR')}원) → 보유 ${h.qty}주` };
    }
    if (b.side === 'sell') {
      if (qty > h.qty) return { ok: false, msg: h.qty ? `보유 수량이 부족해요. ${def.name} 보유 ${h.qty}주` : `${def.name} 주식이 없어 팔 수 없어요.` };
      const avg = h.cost / h.qty, gain = Math.round((st.price - avg) * qty);
      h.qty -= qty; h.cost = h.qty ? h.cost - avg * qty : 0; p.cash += st.price * qty;
      if (!h.qty) delete p.hold[st.sym];
      p.log.unshift({ day: M.day, sym: st.sym, side: 'sell', qty, price: st.price });
      return { ok: true, msg: `${def.name} ${qty}주 매도 체결 (${st.price.toLocaleString('ko-KR')}원, 손익 ${gain > 0 ? '+' : ''}${gain.toLocaleString('ko-KR')}원) → 보유 ${h.qty}주` };
    }
    return { ok: false, msg: '매수 또는 매도만 할 수 있어요.' };
  },
  move(b, p) {
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return { ok: false };
    p.pos = { x: Math.max(0, Math.min(320, b.x)), y: Math.max(0, Math.min(176, b.y)) };
    posDirty = true;
    return { ok: true };
  },
  color(b, p) {
    if (!BODY_COLORS.includes(b.color)) return { ok: false, msg: '고를 수 없는 색이에요.' };
    p.color = b.color;
    accounts[p.key].color = b.color;
    saveAccounts();
    broadcast();
    return { ok: true };
  },
  me: () => ({ ok: true }),   // 저장된 토큰이 아직 유효한지 확인
};

function readJSON(req) {
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
const setCookie = token => ({ 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 2592000 : 0}` });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    const c = { res, id: tokens.get(tokenOf(req)) || '' };
    clients.add(c);
    send(res, 'meta', META);
    broadcast();
    const beat = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(beat); clients.delete(c); broadcast(); });
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5), b = await readJSON(req);
    if (!b || (!['login', 'logout'].includes(name) && !API[name])) return json(res, 400, { ok: false, msg: '잘못된 요청이에요.' });
    if (name === 'login') {
      const out = login(b), { token, ...rest } = out;
      return json(res, 200, rest, token ? setCookie(token) : {});
    }
    if (name === 'logout') { tokens.delete(tokenOf(req)); return json(res, 200, { ok: true }, setCookie('')); }
    const p = players.get(tokens.get(tokenOf(req)));
    // 로그인 전은 정상 상황이라 200 + auth:false (브라우저 콘솔에 빨간 오류가 남지 않게)
    if (!p) return json(res, 200, { ok: false, auth: false, msg: '로그인이 필요해요.' });
    const out = API[name](b, p);
    if (name === 'order' && out.ok) broadcast();
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
}).listen(PORT, HOST, () => console.log(`개미 투자 교실: http://localhost:${PORT}`));
