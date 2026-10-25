'use strict';
// ===== 세계 규칙 (브라우저와 서버가 같이 씀): 고정 난수 · 달력 · 요일 · 날씨 · 주식시장 여는 시간 =====
// 브라우저: play.html이 다른 스크립트보다 먼저 불러서 전역으로 씀 / 서버: require('./world.js')
// 날씨가 화면(비·태풍)과 주가(서버)에서 똑같아야 해서 한곳에 둠

// 칸·날짜 → 0~1 사이 고정 난수 (같은 값이면 늘 같은 결과: 맵 얼룩·배치·날씨에 씀)
const hash = (x, y, s = 0) => { let h = Math.imul(x + 1013, 374761393) ^ Math.imul(y + 7, 668265263) ^ Math.imul(s + 3, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// 달력: 게임 하루 = 1440분, 1년 365일. 게임 0일째 = 1년 3월 1일 월요일
const DAY = 1440;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const doyOf = day => (59 + day) % 365;   // 1년 중 며칠째 (1월 1일 = 0)
function monthDay(doy) {   // 1년 중 며칠째 → [월, 일]
  let m = 0;
  while (doy >= MONTH_DAYS[m]) doy -= MONTH_DAYS[m++];
  return [m + 1, doy + 1];
}
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const weekdayOf = day => ((day % 7) + 7) % 7;   // 0 월요일 ~ 6 일요일

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

// 주식시장: 평일(월~금) 09:00 ~ 15:30에만 거래 (현실 한국 거래소와 같음)
const MARKET_OPEN = 9 * 60, MARKET_CLOSE = 15 * 60 + 30;
const marketOpen = min => { const day = Math.floor(min / DAY), t = min - day * DAY; return weekdayOf(day) < 5 && t >= MARKET_OPEN && t < MARKET_CLOSE; };
// 다음에 장이 열리는 시각(분)
function nextOpen(min) {
  let day = Math.floor(min / DAY);
  if (min - day * DAY >= MARKET_OPEN) day++;
  while (weekdayOf(day) >= 5) day++;
  return day * DAY + MARKET_OPEN;
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
if (typeof module === 'object') module.exports = { hash, DAY, doyOf, monthDay, WEEKDAYS, weekdayOf, weatherOf, JANGMA, MARKET_OPEN, MARKET_CLOSE, marketOpen, nextOpen, temperature };
