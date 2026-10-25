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
  '/play': 'play.html', '/game.js': 'game.js', '/sprites.js': 'sprites.js', '/town.js': 'town.js', '/country.js': 'country.js', '/world.js': 'world.js', '/workplaces.js': 'workplaces.js',     // 게임 화면 (로그인한 사람만, 안 했으면 화면이 메인으로 보냄)
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
// 지금 게임 시각 = start + 지난 현실 시간 × 24 (현실 1시간 = 게임 하루, 현실 2.5초 = 게임 1분). 서버가 꺼져 있어도 현실 시간을 따라 계속 흐름
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const world = readJSONFile(WORLD_FILE) || { epoch: Date.now(), start: 480 };
if (!fs.existsSync(WORLD_FILE)) writeJSONFile(WORLD_FILE, world);
const WORLD_SPEED = 24;   // 현실 1초에 게임 24초 (게임 쪽은 game.js의 TIME_SPEED와 같아야 함)
if ((world.speed || 3) !== WORLD_SPEED) {   // 빠르기를 바꾸면 지금 시각에서 이어서 흐르게 기준을 다시 잡음 (시각이 튀지 않음)
  const t = Date.now(); world.start += (t - world.epoch) * (world.speed || 3) / 60000; world.epoch = t; world.speed = WORLD_SPEED;
  writeJSONFile(WORLD_FILE, world);
}
const worldMinutes = (t = Date.now()) => world.start + (t - world.epoch) * WORLD_SPEED / 60000;

// ===== 주식 시장 (economy.js): 2초마다 세계 시각까지 게임 분을 진행. 시세·뉴스는 data/market.json =====
const { marketOpen, nextOpen } = require('./world.js');
const { createMarket, BY_ID: STOCKS } = require('./economy.js');
const market = createMarket(path.join(DATA_DIR, 'market.json'), readJSONFile, writeJSONFile);
market.advance(worldMinutes());
setInterval(() => market.advance(worldMinutes()), 2000);
// ===== 세계 시뮬레이션 (sim/): 사람·일·사건·사회. 2초마다 세계 시각까지 진행(한 번에 최대 40ms), 지역·나라 사건은 주식 뉴스로도 =====
const { createSim } = require('./sim/index.js');
const sim = createSim({ file: path.join(DATA_DIR, 'sim.json'), read: readJSONFile, write: writeJSONFile, toMarket: (min, n) => market.ingest(min, n), quote: id => market.quote(id), rumors: () => market.rumors() });
sim.advance(worldMinutes());
setInterval(() => { sim.advance(worldMinutes()); market.setMacro(sim.macro()); }, 2000);   // 회사 사정(직원 사기)·경기를 시장에 알려 줌 (실적·금리 계획의 근거)
process.on('SIGINT', () => { sim.kernel.save(); process.exit(0); });   // 끌 때 마지막 상태 저장
const FEE = 0.00015, SELL_TAX = 0.0018;   // 거래 수수료 0.015%(사고팔 때), 파는 금액에 세금 0.18% (현실과 비슷하게)
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
const lifeOf = a => ({ cash: a.cash ?? 50000, bag: a.bag || [], place: a.place || null, stats: { ...STATS_START, ...a.stats }, region: a.region || '한가람', holdings: a.holdings || {} });
const SCENE_NAMES = ['field', 'home', 'city', 'h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'mart', 'byeolha', 'danbi', 'nuribeol'];   // town.js의 장면 이름 (h0~h5 = 주택가 집 안, mart = 마트 안, 나머지는 다른 지역)
// 갈 수 있는 지역: 이름 → { 장면, 지도 칸 좌표(country.js와 같음), 도착 자리 = 그 지역 터미널 문 앞(town.js terminalAt) }
const REGIONS = {
  한가람: { scene: 'city', x: 64, y: 74, at: [3424, 2490] },   // 한가람 터미널(102, 74) 문 앞
  별하항: { scene: 'byeolha', x: 30, y: 36, at: [1056, 634] },
  단비: { scene: 'danbi', x: 82, y: 92, at: [992, 1050] },
  누리벌: { scene: 'nuribeol', x: 58, y: 16, at: [1248, 506] },
};
const SCENE_REGION = { city: '한가람', mart: '한가람', h0: '한가람', h1: '한가람', h2: '한가람', h3: '한가람', h4: '한가람', h5: '한가람', byeolha: '별하항', danbi: '단비', nuribeol: '누리벌' };
// 버스 요금: 기본 1,000원 + 지도 거리 1칸에 90원 (100원 단위)
const fareOf = (from, to) => Math.round((1000 + Math.hypot(REGIONS[from].x - REGIONS[to].x, REGIONS[from].y - REGIONS[to].y) * 90) / 100) * 100;
// 마트 상품: 아이디 → [이름, 값(원)]. 값·돈·가방 칸은 모두 서버가 정하고 확인함
const ITEMS = { bread: ['빵', 2000], milk: ['우유', 1500], apple: ['사과', 1000], ramen: ['컵라면', 1200], kimbap: ['김밥', 3000], drink: ['음료수', 1000], snack: ['과자', 1500], umbrella: ['우산', 8000] };
const BAG_SIZE = 3;   // 처음 받은 가방 칸 수
const TUTORIAL_SCENES = ['field', 'home'];   // 튜토리얼 공간: 떠난 계정은 이 자리를 저장하지 않음
// ===== 함께 돌아다니기(멀티플레이) =====
// 접속한 사람마다(로그인 세션마다) 마지막 자리를 메모리에 두고, 각자 자리를 알릴 때(/api/move, 0.15초마다) 답장으로 같은 장면에 있는 다른 사람 목록을 돌려줌.
// (계속 열어 두는 실시간 연결은 인터넷 주소(Cloudflare 터널)가 중간에 모아 두는 바람에 늦게 와서, 보통 요청·답장으로 바꿈)
// 들어오는 값은 모두 검사(장면 이름·좌표 범위·방향·차림 글자 모양)하고, 5초 동안 소식이 없으면 지움
// ===== 내 일자리 (jobs.js): 세계 시뮬레이션 일터에 취직 · 출퇴근 · 급여 =====
const { createJobs } = require('./jobs.js');
const { WORKPLACES } = require('./workplaces.js');
const jobs = createJobs({ accounts, sim, lifeOf });
jobs.restore();
setInterval(() => {
  const now = worldMinutes(); let any = false;
  for (const a of Object.values(accounts)) if (a.job) { jobs.settle(a, now); any = true; }
  if (any) writeJSONFile(ACCOUNTS_FILE, accounts);
}, 20000);
const online = new Map();    // 세션 토큰 해시 → { id(무작위), name, look, scene, x, y, dir, left, moving, seat, t }
const LOOK_DIRS = ['s', 'se', 'e', 'ne', 'n'];
const okColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const okShape = v => typeof v === 'string' && /^[a-z]{1,16}$/.test(v);
function cleanLook(l) {   // 차림: 모양 이름은 영어 소문자, 색은 #RRGGBB만 (그림은 화면이 다시 한 번 확인)
  if (!l || typeof l !== 'object') return null;
  const part = p => (p && okShape(p.shape) ? { shape: p.shape, ...(okColor(p.color) ? { color: p.color } : {}) } : null);
  return { body: okShape(l.body) ? l.body : 'blob', color: okColor(l.color) ? l.color : '#f7f7f7', face: okShape(l.face) ? l.face : 'dot', hat: part(l.hat), suit: part(l.suit) };
}
setInterval(() => { const now = Date.now(); for (const [th, p] of online) if (now - p.t > 5000) online.delete(th); }, 1000);   // 5초 동안 소식 없는 사람 지움

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
      const others = [...online].filter(([t, p]) => t !== th && p.scene === b.scene)
        .map(([, p]) => ({ id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, dir: p.dir, left: p.left, moving: p.moving, seat: p.seat }));
      return json(res, 200, { ok: true, others });
    }
    if (name === 'routes' || name === 'travel') {   // 고속버스: routes = 지금 지역에서 갈 수 있는 곳과 요금 / travel { to } = 요금을 내고 그 지역 터미널로
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      const a = accounts[key], life = lifeOf(a), here = life.region;
      if (name === 'routes') return json(res, 200, { ok: true, here, routes: Object.keys(REGIONS).filter(n => n !== here).map(n => ({ name: n, fare: fareOf(here, n) })) });
      if (!Object.hasOwn(REGIONS, b.to) || b.to === here) return json(res, 400, { ok: false, msg: '갈 수 없는 곳이에요.' });
      const fare = fareOf(here, b.to), dest = REGIONS[b.to];
      if (life.cash < fare) return json(res, 400, { ok: false, msg: `돈이 부족해요. (${fare.toLocaleString('ko-KR')}원 필요)` });
      a.cash = life.cash - fare; a.region = b.to; a.place = { scene: dest.scene, x: dest.at[0], y: dest.at[1] };
      writeJSONFile(ACCOUNTS_FILE, accounts);
      return json(res, 200, { ok: true, cash: a.cash, region: b.to, place: a.place, fare });
    }
    if (name === 'people' || name === 'person' || name === 'society') {   // 세계: people { scene } = 그 장면 밖을 걷는 사람들 / person { id } = 말 걸기 / society = 나라 통계·소식
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      const now = worldMinutes();
      if (name === 'people') return json(res, 200, { ok: true, people: SCENE_NAMES.includes(b.scene) ? sim.visible(b.scene, now) : [] });
      // person: 누가 말을 걸었는지(key)도 넘겨 NPC가 그 사람을 기억함
      if (name === 'person') { const t = Number.isInteger(b.id) && sim.talk(b.id, now, key); return t ? json(res, 200, { ok: true, ...t }) : json(res, 404, { ok: false, msg: '그 사람은 지금 없어요.' }); }
      return json(res, 200, { ok: true, ...sim.society() });
    }
    if (['job', 'apply', 'quitjob', 'clockin', 'clockout'].includes(name)) {   // 일자리: job = 내 일·구인 공고·새 알림 / apply { emp } / quitjob / clockin / clockout
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      const a = accounts[key], now = worldMinutes();
      jobs.settle(a, now);
      let r = { ok: true };
      if (name === 'apply') r = jobs.apply(a, key, b.emp, now);
      if (name === 'quitjob') r = jobs.quit(a, now);
      if (name === 'clockin') {   // 출근은 일터 앞에 서 있을 때만 (마지막으로 알린 자리로 확인)
        const wp = a.job && WORKPLACES.find(w => w.key === a.job.key), me = online.get(tokenHash(tokenOf(req)));
        r = !wp ? { ok: false, msg: '다니는 일터가 없어요.' } : !me || me.scene !== wp.scene || Math.hypot(me.x - wp.x * 32, me.y - wp.y * 32) > 120 ? { ok: false, msg: `일터 앞에서 출근해야 해요. (${wp.where})` } : jobs.clockIn(a, now);
      }
      if (name === 'clockout') r = jobs.clockOut(a, now, false);
      if (name !== 'job') writeJSONFile(ACCOUNTS_FILE, accounts);
      return json(res, 200, { ...r, ...jobs.view(a, now), postings: name === 'job' ? jobs.postings(a, lifeOf(a).region) : undefined, inbox: jobs.takeInbox(a), cash: lifeOf(a).cash, stats: lifeOf(a).stats });
    }
    if (name === 'market') {   // 시세판: 장 열림 여부 · 다음 개장 · 회사별 시세 · 뉴스 · 내 돈과 가진 주식
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      const now = worldMinutes(), life = lifeOf(accounts[key]);
      market.advance(now);
      return json(res, 200, { ok: true, now, open: marketOpen(now), next: nextOpen(now), ...market.view(), cash: life.cash, holdings: life.holdings });
    }
    if (name === 'trade') {   // 사고팔기 { id, side: 'buy' | 'sell', qty } — 장이 열려 있을 때 지금 가격으로. 돈·주식 수는 서버가 확인
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      const now = worldMinutes(); market.advance(now);
      if (!marketOpen(now)) return json(res, 400, { ok: false, msg: '지금은 장이 닫혀 있어요. (평일 09:00~15:30)' });
      const qty = b.qty, a = accounts[key], life = lifeOf(a);
      if (!Object.hasOwn(STOCKS, b.id) || !['buy', 'sell'].includes(b.side)) return json(res, 400, { ok: false, msg: '잘못된 주문이에요.' });
      if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return json(res, 400, { ok: false, msg: '수량은 1주 이상으로 적어 주세요.' });
      const price = market.priceOf(b.id), amount = price * qty, fee = Math.floor(amount * FEE), h = { ...life.holdings }, cur = h[b.id] || { qty: 0, cost: 0 };
      if (b.side === 'buy') {
        if (life.cash < amount + fee) return json(res, 400, { ok: false, msg: `돈이 부족해요. (${(amount + fee).toLocaleString('ko-KR')}원 필요)` });
        a.cash = life.cash - amount - fee; h[b.id] = { qty: cur.qty + qty, cost: cur.cost + amount + fee };
      } else {
        if (cur.qty < qty) return json(res, 400, { ok: false, msg: `가진 주식이 ${cur.qty}주뿐이에요.` });
        const tax = Math.floor(amount * SELL_TAX);
        a.cash = life.cash + amount - fee - tax;
        const left = cur.qty - qty;
        if (left) h[b.id] = { qty: left, cost: Math.round(cur.cost * left / cur.qty) }; else delete h[b.id];
      }
      a.holdings = h; writeJSONFile(ACCOUNTS_FILE, accounts);
      return json(res, 200, { ok: true, price, qty, side: b.side, cash: a.cash, holdings: h });
    }
    if (name === 'shop') return json(res, 200, { ok: true, items: Object.entries(ITEMS).map(([id, [n, price]]) => ({ id, name: n, price })), bagSize: BAG_SIZE });   // 마트 상품 목록
    if (name === 'buy') {   // 물건 사기: { id } → 돈이 충분하고 가방에 빈칸이 있으면 돈을 빼고 가방에 넣음
      if (!key || !accounts[key]) return json(res, 401, { ok: false, msg: '로그인이 필요해요.' });
      const item = ITEMS[b.id], a = accounts[key], life = lifeOf(a);
      if (!item || !Object.hasOwn(ITEMS, b.id)) return json(res, 400, { ok: false, msg: '없는 물건이에요.' });
      if (life.bag.length >= BAG_SIZE) return json(res, 400, { ok: false, msg: '가방이 꽉 찼어요.' });
      if (life.cash < item[1]) return json(res, 400, { ok: false, msg: `돈이 부족해요. (${item[1].toLocaleString('ko-KR')}원 필요)` });
      a.cash = life.cash - item[1]; a.bag = [...life.bag, { id: b.id, name: item[0] }];
      writeJSONFile(ACCOUNTS_FILE, accounts);
      return json(res, 200, { ok: true, cash: a.cash, bag: a.bag });
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
      if (SCENE_REGION[p.scene] && SCENE_REGION[p.scene] !== lifeOf(a).region) return json(res, 409, { ok: false, msg: '그 지역에 가려면 표를 사야 해요.' });
      if (!(a.tutorialDone && TUTORIAL_SCENES.includes(p.scene))) { a.place = { scene: p.scene, x: Math.round(p.x), y: Math.round(p.y) }; writeJSONFile(ACCOUNTS_FILE, accounts); }
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
