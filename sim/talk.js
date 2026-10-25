'use strict';
// ===== 말 걸기: 그 사람의 지금 삶으로 대사를 만듦 =====
// 말투(성격·나이): 밝음·수줍음·무뚝뚝·다정·어르신·아이 / 주제 12가지(소개·일·지금·기억·가족·친구·날씨·지역·회사 주가·취미·꿈과 걱정·소문) 중
// 그 사람에게 맞는 것만 모아 사람·날·시각마다 다르게 3개쯤 고름 → 같은 사람도 다음에 만나면 다른 이야기, 사람마다 말투가 다름
// 난수는 (날·시각, 사람, 용도)로 정해져 같은 시각에 다시 말 걸면 같은 대답
const { hash, weatherOf, DAY } = require('../world.js');
const { OCC } = require('./data.js');

const jong = s => { const c = s.charCodeAt(s.length - 1) - 0xac00; return c >= 0 && c <= 11171 ? c % 28 : 0; };
const ro = s => s + (jong(s) && jong(s) !== 8 ? '으로' : '로'), eun = s => s + (jong(s) ? '은' : '는'), ira = s => s + (jong(s) ? '이' : '');
const iE = s => s + (jong(s) ? '이에요' : '예요'), eul = s => s + (jong(s) ? '을' : '를'), ira2 = s => s + (jong(s) ? '이라고' : '라고');
const past = t => t.replace(/다(!?)$/, '어요$1');
// 아이 말투: 존댓말 끝을 반말로 (…예요 → …야, …해요 → …해)
const banmal = t => t.replace(/이에요/g, '이야').replace(/예요/g, '야').replace(/([가-힣])요(?=[.!?~ ]|$)/g, '$1');

// 말투: 어르신(65+) · 아이(19 아래, 반말) · 밝음(외향) · 수줍음(내향) · 무뚝뚝(덜 상냥) · 다정(상냥)
function toneOf(n, age) {
  if (age >= 65) return 'elder';
  if (age < 19) return 'kid';
  if (n.tr.e > 0.68) return 'bright';
  if (n.tr.e < 0.3) return 'shy';
  if (n.tr.a < 0.3) return 'blunt';
  return n.tr.a > 0.7 ? 'warm' : 'plain';
}
const GREET = {
  elder: ['허허, 젊은이 반갑구먼.', '어이구, 누군가 했네. 반가워요.', '날이 이런데 어디 가는 길인가?'],
  kid: ['안녕! 너 처음 보는데?', '어, 안녕하세요!', '와, 누구세요?'],
  bright: ['안녕하세요! 반가워요!', '오, 처음 뵙네요! 안녕하세요!', '반가워요~ 좋은 하루예요!'],
  shy: ['아… 안녕하세요.', '저, 저요? …안녕하세요.', '…네, 안녕하세요.'],
  blunt: ['네, 무슨 일이에요?', '뭐예요? 바쁜데.', '음, 안녕하세요.'],
  warm: ['안녕하세요, 오늘 하루는 어때요?', '어머, 반가워요. 밥은 먹었어요?', '안녕하세요~ 날씨가 이런데 조심히 다녀요.'],
  plain: ['안녕하세요.', '아, 안녕하세요.', '네, 안녕하세요.'],
};
const CLOSE = {
  elder: ['그럼 살펴 가게나.', '허허, 또 보세.', '밥 잘 챙겨 먹고 다니게.'],
  kid: ['나 이제 가야 돼! 안녕!', '다음에 또 놀아요!', '엄마가 기다려서 가 볼게요!'],
  bright: ['그럼 좋은 하루 보내요!', '다음에 또 이야기해요!', '즐거웠어요! 또 봐요~'],
  shy: ['그럼… 이만.', '저, 저 가 볼게요.', '…또 봬요.'],
  blunt: ['그럼 이만.', '할 일 있어서 가요.', '됐죠? 가 볼게요.'],
  warm: ['감기 조심하고요!', '무슨 일 있으면 언제든 말해요.', '오늘도 힘내요!'],
  plain: ['그럼 들어가세요.', '다음에 봬요.', '좋은 하루 보내세요.'],
};
// 직업 이야기 (그 직업만의 일상)
const WORK = {
  office: ['요즘 회의가 너무 많아서 정작 일을 못 해요.', '보고서 마감이 코앞이에요. 오늘도 야근각이네요.', '점심 메뉴 고르는 게 하루 중 제일 어려워요.'],
  dev: ['어제 고친 오류가 오늘 또 나왔어요… 개발자의 숙명이죠.', '새 기능을 만드는 중인데 꽤 재밌어요.', '커피 없으면 코드가 안 써져요.'],
  researcher: ['실험 결과가 생각처럼 안 나와서 고민이에요.', '이번 연구가 잘되면 신약이 될 수도 있어요.', '연구실 불이 꺼지는 날이 별로 없어요.'],
  banker: ['요즘 대출 상담하러 오는 분이 부쩍 늘었어요.', '금리가 오르락내리락해서 문의 전화가 많아요.', '돈 세는 일보다 사람 상대하는 일이 더 어려워요.'],
  builder: ['새 아파트 공사 현장에서 일해요. 몸은 힘들어도 보람 있어요.', '비 오는 날은 공사를 못 해서 쉬어요.', '안전모는 꼭 써야 해요. 목숨이 걸린 일이라서요.'],
  vendor: ['오늘 사과가 아주 달아요. 하나 맛보고 가요!', '요즘 손님이 마트로 많이 가서 장사가 예전 같지 않아요.', '새벽부터 물건 떼 오느라 바빴어요.'],
  farmer: ['봄엔 모내기, 가을엔 추수… 농사는 하늘이 반은 지어 줘요.', '올해는 날씨가 도와줘야 할 텐데요.', '흙 만지는 게 제일 마음 편해요.'],
  fisher: ['새벽 네 시면 배를 띄워요. 바다 냄새가 좋아요.', '날이 궂으면 배를 못 띄우니 공치는 날이죠.', '요즘 고등어가 잘 잡혀요.'],
  factory: ['공장 기계 소리에 이젠 익숙해졌어요.', '요즘 주문이 밀려서 특근이 많아요.', '우리 공장에서 만든 물건이 전국에 팔린대요.'],
  trucker: ['하루에 몇 백 킬로미터씩 달려요.', '휴게소 우동이 제 낙이에요.', '물건이 늦으면 다 제 탓이 되니 늘 마음이 급해요.'],
  forester: ['산불 조심! 요즘 날이 건조해요.', '나무 한 그루 키우는 데 몇십 년이 걸려요.'],
  miner: ['갱도 안은 한여름에도 서늘해요.', '안전 점검은 매일 해요. 땅속은 늘 조심해야죠.'],
  shipbuilder: ['배 한 척 만드는 데 일 년이 넘게 걸려요.', '용접 불꽃 보는 게 일상이에요.'],
  engineer: ['바람이 좋은 날은 발전기가 신나게 돌아요.', '태풍 오면 발전기를 멈춰야 해요.'],
  docker: ['컨테이너가 끝도 없이 들어와요.', '배가 들어오는 날은 밤샘이에요.'],
  hotel: ['주말엔 손님이 많아서 정신없어요.', '손님이 웃으며 체크아웃하면 뿌듯해요.'],
  saltworker: ['햇볕 좋은 날이 소금 거두기 좋은 날이에요.', '비 오면 소금밭이 다 녹아 버려요.'],
  clerk: ['계산대에 서 있으면 동네 사람들 다 알게 돼요.', '오늘 우유가 할인이에요!'],
  barista: ['오늘 원두가 아주 좋아요. 한 잔 하고 가요.', '라떼 그림 그리는 게 제일 재밌어요.'],
  cook: ['오늘 찌개가 잘 끓었어요.', '점심시간엔 정말 눈코 뜰 새가 없어요.'],
  teacher: ['아이들이 요즘 장난이 늘었어요. 그래도 귀여워요.', '시험 문제 내는 게 생각보다 어려워요.'],
  nurse: ['요즘 감기 환자가 많아요. 손 잘 씻어요!', '밤 근무가 이어지면 낮밤이 헷갈려요.'],
  doctor: ['건강은 건강할 때 지키는 거예요.', '진료 대기가 길어서 환자분들께 미안해요.'],
  driver: ['버스 운전한 지 꽤 됐어요. 단골 승객도 있어요.', '출퇴근 시간엔 길이 꽉 막혀요.'],
  civil: ['민원 처리하다 보면 하루가 금방 가요.', '동네 일을 하니 보람이 있어요.'],
};
// 지역 이야기
const REGION_TALK = {
  한가람: ['한가람은 나라 한가운데라 어디든 가기 편해요.', '높은 빌딩이 계속 들어서서 동네가 몰라보게 변했어요.'],
  별하항: ['별하항은 새벽 수산시장이 제일 활기차요.', '바다 보면서 사는 게 별하항 사람들 자랑이죠.'],
  단비: ['단비는 공장 굴뚝 연기가 쉴 날이 없어요.', '공장 덕분에 일자리가 많은 동네예요.'],
  누리벌: ['누리벌 쌀이 나라에서 제일 맛있다니까요.', '가을에 논이 금빛으로 물들면 정말 장관이에요.'],
};
const HOBBY = ['등산', '낚시', '독서', '요리', '게임', '그림 그리기', '축구', '노래', '사진 찍기', '뜨개질', '자전거', '화분 가꾸기'];

function makeTalk({ S, n, min, age, empName, ageOf, news, quote }) {
  const day = Math.floor(min / DAY), h = Math.floor((min % DAY) / 60), R = k => hash(day * 24 + h, n.id, k);
  const pick = (list, k) => list[Math.floor(R(k) * list.length)];
  const tone = toneOf(n, age), job = OCC[n.occ], kid = tone === 'kid', wx = weatherOf(day);
  const topics = [];
  // 소개
  topics.push(() => kid ? `나는 ${ira(n.name)}야! ${age}살이야.` : job ? pick([`저는 ${n.name}, ${empName ? empName + '에서 ' : ''}${ro(job.name)} 일해요.`, `${job.name} ${iE(n.name)}. ${age}살이고요.`, `${empName || '이 동네'}에서 일하는 ${ira2(n.name)} 해요.`], 1)
    : n.occ === 'retired' ? pick([`${n.name}일세. 일은 그만두고 쉬는 중이지.`, `나는 ${n.name}. 올해 ${age}이라네.`], 1) : n.occ === 'jobless' ? `저는 ${iE(n.name)}. 요즘 일자리를 찾는 중이에요.` : `저는 ${n.name}, ${age}살이에요.`);
  // 일
  if (job) topics.push(() => {
    if (job.weather?.includes(wx)) return pick(['오늘은 날씨 때문에 일을 공쳤어요.', '이런 날은 쉴 수밖에 없어요. 그만큼 벌이도 줄지만요.'], 2);
    if (n.stress > 70) return pick(['요즘 일이 너무 많아서 좀 지쳤어요.', '솔직히 그만두고 싶을 때가 많아요.'], 2);
    return pick(WORK[n.occ] || ['일은 그럭저럭 할 만해요.'], 2);
  });
  if (n.occ === 'jobless') topics.push(() => pick([`이력서를 열 군데 넘게 넣었는데 연락이 없네요.`, `일을 쉰 지 ${Math.max(1, day - (n.joblessSince ?? day))}일째예요. 마음이 조급해요.`, '다른 지역으로 가 볼까도 생각 중이에요.'], 3));
  if (n.occ === 'student') topics.push(() => pick(kid ? ['시험 망했어… 엄마한테 혼날 것 같아.', '오늘 급식에 치킨 나왔다!', '학교 끝나면 친구들이랑 놀 거야!'] : ['수업이 너무 길어요.'], 3));
  if (n.occ === 'retired') topics.push(() => pick(['아침마다 산책하는 게 낙이지.', '젊었을 땐 나도 꽤 바빴다네.', '경로당 친구들이랑 바둑 두는 재미로 산다네.'], 3));
  // 지금 하는 일과 기분
  topics.push(() => {
    const low = Object.entries(n.need).sort((a, b) => a[1] - b[1])[0];
    if (low[1] < 45) return { food: pick(['배가 고파서 뭐 먹으러 가는 길이에요.', '꼬르륵… 들렸어요?'], 4), energy: pick(['어제 잠을 설쳐서 피곤해요.', '하품이 계속 나와요.'], 4), social: pick(['요즘 사람을 못 만나서 좀 외로웠는데, 말 걸어 줘서 고마워요.', '누구랑 수다 떨고 싶었어요.'], 4), fun: pick(['요즘 너무 심심해요. 뭐 재밌는 거 없어요?', '사는 게 좀 지루하네요.'], 4) }[low[0]];
    return n.mood > 25 ? pick(['오늘은 왠지 기분이 좋아요!', '요즘 일이 술술 풀려요.'], 4) : n.mood < -15 ? pick(['요즘 좀 우울해요.', '기운이 하나도 없네요.'], 4) : pick(['그냥 평범한 하루예요.', '별일 없이 지내요.'], 4);
  });
  // 기억 (꼭 가장 최근 것만은 아님)
  if (n.mem.length) topics.push(() => { const m = n.mem[Math.floor(R(5) * Math.min(3, n.mem.length))]; return `${m.d === day ? '오늘' : m.d === day - 1 ? '어제' : '얼마 전에'} ${past(m.t)}`; });
  // 가족
  const sp = S.people.list[n.spouse], kids = n.kids.map(k => S.people.list[k]).filter(Boolean);
  if (sp || kids.length) topics.push(() => {
    if (kids.length && R(6) < 0.6) { const k = kids[Math.floor(R(7) * kids.length)], ka = ageOf(k, day); return ka < 7 ? `우리 ${ira(k.name)}가 요즘 말을 곧잘 해요. 너무 귀여워요.` : ka < 19 ? `우리 ${k.name}${jong(k.name) ? '이' : ''} 학교 다니는데, 공부는 안 하고 놀기만 해요.` : `우리 ${k.name}${jong(k.name) ? '은' : '는'} 벌써 다 커서 ${OCC[k.occ]?.name || '제 앞가림'} 일을 해요.`; }
    return sp ? pick([`${eun(sp.name)} 제 배우자예요. 오늘 저녁은 같이 먹기로 했어요.`, `배우자 ${sp.name}${jong(sp.name) ? '이' : '가'} 요즘 ${OCC[sp.occ] ? OCC[sp.occ].name + ' 일' : '집안일'} 때문에 바빠요.`], 6) : null;
  });
  // 친구
  const fr = Object.entries(n.friends).sort((a, b) => b[1] - a[1]).map(([i]) => S.people.list[i]).find(f => f && f.id !== n.spouse);
  if (fr) topics.push(() => pick([`요즘 ${fr.name}님이랑 자주 만나요.`, `${fr.name}님 알아요? 제일 친한 친구예요.`, `이따 ${fr.name}님이랑 밥 먹기로 했어요.`], 8));
  // 날씨
  const WX_TALK = { rain: ['비가 와서 그런지 몸이 찌뿌둥하네요.', '우산 챙겼어요? 하루 종일 온대요.'], storm: ['태풍 때문에 다들 집에 있어요. 조심해요!', '바람 소리가 무서울 정도예요.'], snow: ['눈 오는 거 좋아해요? 길은 미끄럽지만요.', '눈사람 만들고 싶네요.'], dust: ['황사 때문에 목이 칼칼해요. 마스크 써요.', '하늘이 누렇네요.'], cloud: ['하늘이 잔뜩 흐리네요.', '곧 비라도 올 것 같아요.'], sun: ['날씨 정말 좋다! 이런 날은 산책해야죠.', '햇볕이 따뜻해서 좋아요.'] };
  topics.push(() => pick(WX_TALK[wx] || ['날씨가 오락가락하네요.'], 9));
  // 지역
  if (REGION_TALK[n.region]) topics.push(() => pick(REGION_TALK[n.region], 10));
  // 우리 회사 주가 (상장 회사 일터면)
  const emp = S.work.emps[n.emp], q = emp?.company && quote?.(emp.company);
  if (q && q.prev) topics.push(() => { const ch = (q.price - q.prev) / q.prev * 100; return Math.abs(ch) < 0.5 ? `우리 ${q.name} 주가는 요즘 잠잠해요.` : ch > 0 ? `우리 ${q.name} 주가가 오늘 ${ch.toFixed(1)}% 올랐대요! 분위기 좋아요.` : `우리 ${q.name} 주가가 ${(-ch).toFixed(1)}% 떨어져서 다들 표정이 안 좋아요.`; });
  // 취미 (사람마다 하나, 번호로 정해짐)
  if (!kid || age >= 10) topics.push(() => { const hb = HOBBY[Math.floor(hash(n.id, 3, 77) * HOBBY.length)]; return pick([`쉬는 날엔 ${eul(hb)} 해요.`, `요즘 ${hb}에 푹 빠졌어요.`], 11); });
  // 꿈과 걱정 (나이에 따라)
  topics.push(() => age < 19 ? pick(['나중에 크면 우주비행사 될 거야!', '빨리 어른이 되고 싶어.'], 12) : age < 35 ? pick(['언젠가 내 가게를 차리고 싶어요.', '집값이 너무 비싸서 독립이 걱정이에요.', '돈 모아서 해외여행 가는 게 꿈이에요.'], 12) : age < 65 ? pick(['애들 학비 대느라 허리가 휘어요.', '노후 준비를 슬슬 해야 하는데 걱정이에요.', '건강이 최고예요. 요즘 운동을 시작했어요.'], 12) : pick(['손주 보는 게 제일 행복하지.', '무릎이 예전 같지 않아.'], 12));
  // 소문
  if (news && !/[.!?…]$/.test(news)) news += '.';
  if (news) topics.push(() => pick([`그나저나 들었어요? ${news}`, `뉴스 봤어요? ${news}`, `동네에 소문이 돌던데, ${news}`], 13));

  // 고르기: 인사 + (소개는 60%) + 나머지에서 섞어 2~3개 + 끝인사
  const [intro, ...rest] = topics;
  const order = rest.map((f, i) => [R(20 + i), f]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const lines = [pick(GREET[tone], 0)];
  if (R(14) < 0.6) lines.push(intro());
  for (const f of order) { if (lines.length >= 4 + (R(15) < 0.5 ? 1 : 0)) break; const l = f(); if (l) lines.push(l); }
  lines.push(pick(CLOSE[tone], 16));
  return kid ? lines.map((l, i) => (i === 0 || i === lines.length - 1 ? l : banmal(l))) : lines;   // 인사·끝인사는 이미 아이 말투
}

module.exports = { makeTalk };
