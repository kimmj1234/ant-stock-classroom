'use strict';
// ===== 나의 두번째 인생 서버: 파일 제공 + 계정(로그인) =====
// 실행: node server.js → http://localhost:5000
// 메인 페이지, 로그인, 게임 화면(도시) 파일 제공. (예전 주식 게임은 52단계에서 지움 — Git 기록에 남아 있음)
// 계정·로그인 유지 정보는 data/ 에 저장되어 서버를 다시 켜도 이어집니다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 5000, HOST = '127.0.0.1';
const MAX_ACCOUNTS = 200;
const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');   // 닉네임·(비밀번호면) 소금·해시 / (구글이면) 구글 고유 번호
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');   // 로그인 쿠키 토큰의 해시 → 계정 (토큰 원문은 저장하지 않음)
const FILES = {
  '/': 'home.html', '/site.css': 'site.css', '/site.js': 'site.js', '/wordmark.css': 'wordmark.css',
  '/logo.svg': 'assets/logo.svg',                 // 브라우저 탭 아이콘: 픽셀 하트 두 개
  '/play': 'play.html', '/game.js': 'game.js', '/sprites.js': 'sprites.js', '/town.js': 'town.js',     // 게임 화면 (로그인한 사람만, 안 했으면 화면이 메인으로 보냄)
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

const readJSONFile = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
function writeJSONFile(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data));
  fs.renameSync(file + '.tmp', file);   // 쓰는 도중 꺼져도 파일이 반쯤 깨지지 않게
}

// ===== 계정 =====
const accounts = readJSONFile(ACCOUNTS_FILE) || {};   // 닉네임 key(소문자) → { name, salt, hash } 또는 { name, google }
const nameKey = n => n.normalize('NFC').toLowerCase();
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
function checkPw(pw, acc) {
  const a = Buffer.from(hashPw(pw, acc.salt), 'hex'), b = Buffer.from(acc.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cleanName = s => (typeof s === 'string' ? s.normalize('NFC').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10) : '');

// ===== 새 닉네임 규칙 (계정을 새로 만들 때) =====
// 대부분의 게임처럼: 한글(완성된 글자)·영어만, 띄어쓰기 없이 2~10글자, 대소문자 무시 중복 불가, 욕설·비하·성적 단어와 운영진 사칭 불가
const NAME_MIN = 2, NAME_MAX = 10;
const BAD_WORDS = [
  // 한국어 욕설·비하·성적 표현 (변형 일부 포함)
  '시발', '씨발', '씨빨', '씨바', '쉬발', '씨팔', '시팔', '개새', '개색', '개세끼', '새끼', '색기', '병신', '븅신', '빙신', '좆', '존나', '졸라', '지랄',
  '미친', '미췬', '닥쳐', '꺼져', '엠창', '애미', '애비', '니미', '느금', '느그', '창녀', '창놈', '걸레', '보지', '자지', '섹스', '성교', '야동', '강간', '자위',
  '한남', '김치녀', '된장녀', '일베', '메갈', '틀딱', '급식충', '맘충', '똘추', '찐따', '병자', '장애인', '정신병', '쓰레기', '개같', '개놈', '개년', '년아',
  // 영어 욕설·비하·성적 표현
  'fuck', 'fuk', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'cunt', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard', 'porn', 'sex', 'rape', 'nazi', 'hitler',
];
// 운영진 사칭: 들어 있기만 해도 안 됨 / 짧은 영어(gm·dev·mod)는 그 자체일 때만 (gmork·devon 같은 이름은 허용)
const RESERVED_PART = ['운영자', '운영진', '관리자', '개발자', '공식', '시스템', '어드민', '지엠', '매니저', 'admin', 'moderator', 'operator', 'official', 'system', 'manager', 'staff'];
const RESERVED_EXACT = ['gm', 'dev', 'mod'];
function nameProblem(raw) {
  if (typeof raw !== 'string' || !raw.length) return '닉네임을 입력해 주세요.';
  const name = raw.normalize('NFC');
  if (/\s/.test(name)) return '띄어쓰기는 쓸 수 없어요.';
  if (!/^[가-힣A-Za-z]+$/.test(name)) return '한글(완성된 글자)과 영어만 쓸 수 있어요. 숫자·특수문자·자음/모음만 따로는 안 돼요.';
  if ([...name].length < NAME_MIN || [...name].length > NAME_MAX) return `닉네임은 ${NAME_MIN}~${NAME_MAX}글자로 정해 주세요.`;
  const low = name.toLowerCase();
  if (RESERVED_EXACT.includes(low) || RESERVED_PART.some(w => low.includes(w))) return '운영자·관리자처럼 오해를 줄 수 있는 이름은 쓸 수 없어요.';
  if (BAD_WORDS.some(w => low.includes(w))) return '사용할 수 없는 단어가 들어 있어요.';
  if (accounts[nameKey(name)]) return '이미 있는 닉네임이에요.';
  return null;
}

// ===== 로그인 유지 (쿠키 토큰) =====
const tokenHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const sessions = new Map(Object.entries(readJSONFile(SESSIONS_FILE) || {}).filter(([h, key]) => /^[0-9a-f]{64}$/.test(h) && accounts[key]));   // 토큰 해시 → 계정 key
const saveSessions = () => writeJSONFile(SESSIONS_FILE, Object.fromEntries(sessions));
function startSession(key) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(tokenHash(token), key);
  saveSessions();
  return token;
}
const failures = new Map();  // 닉네임 → { n, until } 비밀번호 연속 실패 잠금

// ===== 닉네임 + 비밀번호: 처음이면 계정 생성(닉네임 규칙 검사), 있으면 비밀번호 확인 =====
function login(b) {
  const name = cleanName(b.name), pw = typeof b.password === 'string' ? b.password : '';
  if (!name) return { ok: false, msg: '닉네임을 입력해 주세요.' };
  if (pw.length < 4 || pw.length > 30) return { ok: false, msg: '비밀번호는 4~30자로 입력하세요.' };
  const key = nameKey(name), f = failures.get(key);
  if (f && f.until > Date.now()) return { ok: false, msg: `비밀번호를 여러 번 틀렸어요. ${Math.ceil((f.until - Date.now()) / 1000)}초 뒤에 다시 시도하세요.` };
  let acc = accounts[key], created = false;
  if (acc && !acc.hash) return { ok: false, msg: '구글 계정으로 만든 닉네임이에요. "Google로 로그인"을 눌러 주세요.' };
  if (acc) {
    if (!checkPw(pw, acc)) {
      const n = (f?.n || 0) + 1;
      failures.set(key, { n, until: n >= 5 ? Date.now() + 30000 : 0 });
      return { ok: false, msg: '이미 있는 닉네임이에요. 비밀번호가 맞지 않습니다.' };
    }
  } else {
    const bad = nameProblem(typeof b.name === 'string' ? b.name.trim() : '');   // 새 계정만 닉네임 규칙 검사 (앞뒤 공백은 실수로 보고 뗌)
    if (bad) return { ok: false, msg: bad };
    if (Object.keys(accounts).length >= MAX_ACCOUNTS) return { ok: false, msg: '계정이 너무 많아 새로 만들 수 없어요.' };
    const salt = crypto.randomBytes(16).toString('hex');
    acc = accounts[key] = { name, salt, hash: hashPw(pw, salt) };
    writeJSONFile(ACCOUNTS_FILE, accounts);
    created = true;
  }
  failures.delete(key);
  return { ok: true, token: startSession(key), created, msg: created ? `'${acc.name}' 계정을 새로 만들었어요.` : `'${acc.name}'(으)로 로그인했어요.` };
}

// ===== 구글 계정 로그인 (Google Identity Services) =====
// 화면의 "Google로 로그인" 버튼 → 구글이 서명한 확인증(ID 토큰) → 여기서 구글에 진짜인지 물어봄.
// 계정에는 비밀번호 대신 구글 계정 고유 번호(sub)만 저장. 처음 온 구글 계정은 닉네임을 정해야 들어옴.
// 클라이언트 ID는 공개 값(웹페이지에 그대로 들어감). 보안 비밀(secret)은 이 방식에서 쓰지 않음
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '943771274143-m1i8fsum0lko2tnf7010ld0b8uin6agg.apps.googleusercontent.com';
const pendingGoogle = new Map();   // 임시 번호 → { sub, until }: 처음 온 구글 계정이 닉네임을 정하는 10분 동안만
async function verifyGoogle(credential) {
  if (typeof credential !== 'string' || credential.length > 4096) return null;
  try {
    // 확인증은 주소(URL)에 넣지 않고 본문으로 보냄
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo', { method: 'POST', body: new URLSearchParams({ id_token: credential }) });
    if (!r.ok) return null;
    const t = await r.json();
    const ok = t.aud === GOOGLE_CLIENT_ID                                     // 우리 앱용으로 발급됐는지
      && (t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com')   // 구글이 발급했는지
      && Number(t.exp) * 1000 > Date.now()                                    // 기간이 지나지 않았는지
      && (t.email_verified === 'true' || t.email_verified === true)           // 이메일 인증된 계정인지
      && typeof t.sub === 'string' && t.sub;
    return ok ? t.sub : null;
  } catch { return null; }
}
const findGoogle = sub => Object.keys(accounts).find(k => accounts[k].google === sub);
async function googleLogin(b) {
  const sub = await verifyGoogle(b.credential);
  if (!sub) return { ok: false, msg: '구글 로그인을 확인하지 못했어요. 다시 시도해 주세요.' };
  const key = findGoogle(sub);
  if (key) return { ok: true, token: startSession(key), msg: `'${accounts[key].name}'(으)로 로그인했어요.` };
  for (const [id, pg] of pendingGoogle) if (pg.until < Date.now()) pendingGoogle.delete(id);
  const pending = crypto.randomBytes(16).toString('hex');
  pendingGoogle.set(pending, { sub, until: Date.now() + 10 * 60 * 1000 });
  return { ok: false, needName: true, pending, msg: '처음 오셨네요! 사용할 닉네임을 정해 주세요.' };
}
function googleName(b) {
  const pg = pendingGoogle.get(b.pending);
  if (!pg || pg.until < Date.now()) return { ok: false, msg: '시간이 지났어요. "Google로 로그인"을 다시 눌러 주세요.' };
  const bad = nameProblem(b.name);
  if (bad) return { ok: false, msg: bad };
  const name = b.name.normalize('NFC'), key = nameKey(name);
  if (Object.keys(accounts).length >= MAX_ACCOUNTS) return { ok: false, msg: '계정이 너무 많아 새로 만들 수 없어요.' };
  pendingGoogle.delete(b.pending);
  const had = findGoogle(pg.sub);   // 같은 구글 계정으로 두 번 눌렀으면 먼저 만든 계정으로
  if (had) return { ok: true, token: startSession(had), msg: `'${accounts[had].name}'(으)로 로그인했어요.` };
  accounts[key] = { name, google: pg.sub };
  writeJSONFile(ACCOUNTS_FILE, accounts);
  return { ok: true, token: startSession(key), created: true, msg: `'${name}' 계정을 새로 만들었어요.` };
}
const nameCheck = b => { const bad = nameProblem(b.name); return bad ? { ok: false, msg: bad } : { ok: true, msg: '사용할 수 있는 닉네임이에요.' }; };   // 입력하는 동안 화면이 물어봄
const AUTH = { login, google: googleLogin, googleName, nameCheck };   // 로그인 전에 부르는 API
// ===== 세계 시간: 모든 사람이 같은 게임 시간을 씀 (서버가 정함) =====
// 세계가 처음 열린 순간(epoch, 현실 시각)과 그때의 게임 시각(start = 3월 1일 08:00)을 data/world.json에 저장해 두고,
// 지금 게임 시각 = start + 지난 현실 시간 × 3 (현실 20초 = 게임 1분). 서버가 꺼져 있어도 현실 시간을 따라 계속 흐름
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const world = readJSONFile(WORLD_FILE) || { epoch: Date.now(), start: 480 };
if (!fs.existsSync(WORLD_FILE)) writeJSONFile(WORLD_FILE, world);
const worldMinutes = (t = Date.now()) => world.start + (t - world.epoch) * 3 / 60000;
// 생활 정보: 현금(원), 가방(물건 목록), 서 있던 자리(장면·픽셀 위치, 없으면 처음 자리), 능력치 (게임 시간은 세계 시간 하나라 계정마다 두지 않음)
// 능력치: 체력·배고픔·기분은 게이지 0~100 (100이 가장 좋음) / 지능·근력은 레벨(1부터, 돈으로 강화 — 나중엔 공부·운동 같은 행동으로도)
//         매력은 인기도(0부터, 메이플스토리 인기도처럼 다른 사람이 +1/-1을 줌, 마이너스도 됨)
const STATS_START = { health: 100, hunger: 100, mood: 80, smarts: 1, strength: 1, charm: 0 };
// 강화: Lv n → n+1에 n × 10,000원 (Lv 1→2 10,000원, 2→3 20,000원 …), 최고 Lv 99
const UPGRADABLE = ['smarts', 'strength'], MAX_LEVEL = 99;
const upgradeCost = lv => lv * 10000;
// 인기도 주기 규칙(메이플스토리처럼): 자기 자신은 안 됨, 하루(한국 날짜)에 한 번, 같은 사람에게는 30일에 한 번. 문제없으면 null, 아니면 이유
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
function fameProblem(giver, giverKey, toKey, today) {
  if (toKey === giverKey) return '자기 자신에게는 인기도를 줄 수 없어요.';
  if (giver.fameDay === today) return '인기도는 하루에 한 번만 줄 수 있어요.';
  const last = giver.fameTo?.[toKey];
  if (last && daysBetween(last, today) < 30) return '같은 사람에게는 30일에 한 번만 줄 수 있어요.';
  return null;
}
const lifeOf = a => ({ cash: a.cash ?? 50000, bag: a.bag || [], place: a.place || null, stats: { ...STATS_START, ...a.stats } });
const SCENE_NAMES = ['field', 'home', 'city'];
// ===== 함께 돌아다니기(멀티플레이) =====
// 접속한 사람마다(로그인 세션마다) 마지막 자리를 메모리에 두고, 같은 장면에 있는 다른 사람들 목록을 0.1초마다 실시간 연결로 보냄.
// 들어오는 값은 모두 검사(장면 이름·좌표 범위·방향·차림 글자 모양)하고, 10초 동안 소식이 없거나 연결이 끊기면 지움
const online = new Map();    // 세션 토큰 해시 → { id(무작위), name, look, scene, x, y, dir, left, moving, seat, t }
const streams = new Map();   // 실시간 연결(res) → { th: 세션 토큰 해시, last: 마지막으로 보낸 내용, t: 보낸 시각 }
const LOOK_DIRS = ['s', 'se', 'e', 'ne', 'n'];
const okColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const okShape = v => typeof v === 'string' && /^[a-z]{1,16}$/.test(v);
function cleanLook(l) {   // 차림: 모양 이름은 영어 소문자, 색은 #RRGGBB만 (그림은 화면이 다시 한 번 확인)
  if (!l || typeof l !== 'object') return null;
  const part = p => (p && okShape(p.shape) ? { shape: p.shape, ...(okColor(p.color) ? { color: p.color } : {}) } : null);
  return { body: okShape(l.body) ? l.body : 'blob', color: okColor(l.color) ? l.color : '#f7f7f7', face: okShape(l.face) ? l.face : 'dot', hat: part(l.hat), suit: part(l.suit) };
}
setInterval(() => {
  const now = Date.now();
  for (const [th, p] of online) if (now - p.t > 10000) online.delete(th);
  for (const [res, st] of streams) {
    const mine = online.get(st.th);
    const list = mine ? [...online].filter(([th, p]) => th !== st.th && p.scene === mine.scene)
      .map(([, p]) => ({ id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, dir: p.dir, left: p.left, moving: p.moving, seat: p.seat })) : [];
    const data = JSON.stringify(list);
    if (data !== st.last) { res.write(`data: ${data}\n\n`); st.last = data; st.t = now; }
    else if (now - st.t > 15000) { res.write(': 연결 유지\n\n'); st.t = now; }   // 오래 조용하면 연결이 끊기지 않게
  }
}, 100);   // town.js의 장면 이름 (튜토리얼 공간 = field·home)

// ===== HTTP =====
function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 8192) { resolve(null); req.destroy(); } });
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

  // 화면이 처음에 필요한 설정 (구글 로그인 버튼에 넣을 클라이언트 ID: 공개 값)
  // 실시간 연결: 같은 장면의 다른 사람들 자리를 계속 받음 (EventSource)
  if (req.method === 'GET' && url.pathname === '/api/live') {
    const th = tokenHash(tokenOf(req));
    if (!accounts[sessions.get(th)]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.write(': 연결됨\n\n');
    streams.set(res, { th, last: '', t: Date.now() });
    req.on('close', () => { streams.delete(res); if (![...streams.values()].some(v => v.th === th)) online.delete(th); });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { googleClientId: GOOGLE_CLIENT_ID });

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5), b = await readBody(req);
    if (!b) return json(res, 400, { ok: false, msg: '잘못된 요청이에요.' });
    if (AUTH[name]) {
      const { token, ...rest } = await AUTH[name](b);
      return json(res, 200, rest, token ? setCookie(token, req) : {});
    }
    if (name === 'logout') { sessions.delete(tokenHash(tokenOf(req))); saveSessions(); return json(res, 200, { ok: true }, setCookie('', req)); }
    const key = sessions.get(tokenHash(tokenOf(req)));
    if (name === 'me') {
      // 로그인 전은 정상 상황이라 200 + auth:false (브라우저 콘솔에 빨간 오류가 남지 않게)
      // guideSeen: 게임 조작 안내 창을 이미 봤는지 (처음 한 번만 띄움) / tutorialDone: 튜토리얼 공간을 떠났는지 (떠나면 다시 못 돌아감) / basicUI: 안내원에게 기본 UI를 받았는지
      return json(res, 200, key && accounts[key] ? { ok: true, me: { name: accounts[key].name, guideSeen: !!accounts[key].guideSeen, tutorialDone: !!accounts[key].tutorialDone, basicUI: !!accounts[key].basicUI, life: lifeOf(accounts[key]), world: worldMinutes() } } : { ok: false, auth: false, msg: '로그인이 필요해요.' });
    }
    // guideSeen: 조작 안내 창을 닫았음 → 다음부터 안 띄움 / tutorialDone: 튜토리얼을 떠났음 → 다음부터 도시에서 시작 / basicUI: 기본 UI를 받았음
    if (name === 'guideSeen' || name === 'tutorialDone' || name === 'basicUI') {
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      if (name === 'tutorialDone' && !accounts[key].basicUI) return json(res, 403, { ok: false, msg: '안내소에서 기본 UI를 먼저 받아야 해요.' });   // 기본 UI 없이는 튜토리얼을 못 떠남
      if (!accounts[key][name]) { accounts[key][name] = true; writeJSONFile(ACCOUNTS_FILE, accounts); }
      return json(res, 200, { ok: true });
    }
    if (name === 'move') {   // 내 자리 알리기: { scene, x, y, dir, left, moving, seat, look }
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      const inRange = v => Number.isFinite(v) && v >= 0 && v <= 5000;
      if (!SCENE_NAMES.includes(b.scene) || !inRange(b.x) || !inRange(b.y)) return json(res, 400, { ok: false, msg: '잘못된 요청이에요.' });
      const th = tokenHash(tokenOf(req));
      online.set(th, {
        id: online.get(th)?.id || crypto.randomBytes(4).toString('hex'), name: accounts[key].name, look: cleanLook(b.look),
        scene: b.scene, x: Math.round(b.x), y: Math.round(b.y), dir: LOOK_DIRS.includes(b.dir) ? b.dir : 's', left: !!b.left, moving: !!b.moving,
        seat: Number.isInteger(b.seat) && b.seat >= 0 && b.seat < 100 ? b.seat : null, t: Date.now(),
      });
      return json(res, 200, { ok: true });
    }
    if (name === 'upgrade') {   // 능력치 강화: 돈을 내고 지능·근력 1레벨 올림 (돈·레벨은 서버가 계산)
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      if (!UPGRADABLE.includes(b.stat)) return json(res, 400, { ok: false, msg: '강화할 수 없는 능력치예요.' });
      const a = accounts[key], life = lifeOf(a), lv = life.stats[b.stat], cost = upgradeCost(lv);
      if (lv >= MAX_LEVEL) return json(res, 400, { ok: false, msg: '이미 최고 레벨이에요.' });
      if (life.cash < cost) return json(res, 400, { ok: false, msg: `돈이 부족해요. (${cost.toLocaleString('ko-KR')}원 필요)` });
      a.cash = life.cash - cost; a.stats = { ...life.stats, [b.stat]: lv + 1 };
      writeJSONFile(ACCOUNTS_FILE, accounts);
      return json(res, 200, { ok: true, cash: a.cash, stats: a.stats });
    }
    if (name === 'fame') {   // 인기도 주기: { to: 닉네임, up: true(+1) / false(-1) }
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      const toKey = nameKey(cleanName(b.to) || ''), target = accounts[toKey];
      if (!target) return json(res, 404, { ok: false, msg: '그런 사람이 없어요.' });
      const giver = accounts[key], today = kstDay(), bad = fameProblem(giver, key, toKey, today);
      if (bad) return json(res, 400, { ok: false, msg: bad });
      const st = lifeOf(target).stats;
      target.stats = { ...st, charm: st.charm + (b.up === false ? -1 : 1) };
      giver.fameDay = today; giver.fameTo = { ...giver.fameTo, [toKey]: today };
      writeJSONFile(ACCOUNTS_FILE, accounts);
      return json(res, 200, { ok: true, charm: target.stats.charm });
    }
    if (name === 'progress') {   // 서 있던 자리 저장 (화면이 멈출 때·장면을 바꿀 때·5초마다·페이지를 떠날 때 보냄)
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      const a = accounts[key], p = b.place;
      // 자리: 아는 장면 + 0~5000 사이 숫자만. 튜토리얼을 떠난 계정은 도시 쪽 자리만 받음(다시 못 돌아가게)
      const inRange = v => Number.isFinite(v) && v >= 0 && v <= 5000;
      if (!p || !SCENE_NAMES.includes(p.scene) || !inRange(p.x) || !inRange(p.y)) return json(res, 400, { ok: false, msg: '잘못된 요청이에요.' });
      if (!(a.tutorialDone && p.scene !== 'city')) { a.place = { scene: p.scene, x: Math.round(p.x), y: Math.round(p.y) }; writeJSONFile(ACCOUNTS_FILE, accounts); }
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { ok: false, msg: '잘못된 요청이에요.' });
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
