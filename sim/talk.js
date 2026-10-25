'use strict';
// ===== 말 걸기: 그 사람의 지금 삶으로 대사를 만듦 =====
// 말투(성격·나이): 밝음·수줍음·무뚝뚝·다정·어르신·아이 / 주제 12가지(소개·일·지금·기억·가족·친구·날씨·지역·회사 주가·취미·꿈과 걱정·소문) 중
// 그 사람에게 맞는 것만 모아 고름. 같은 사람은 늘 같은 사실을 말하고 나를 기억함 (makeTalk 위 설명)
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
  reporter: ['특종 하나 잡으려고 하루 종일 돌아다녀요.', '마감 시간만 다가오면 손이 떨려요.', '요즘 증권가 소식 취재하느라 정신없어요.'],
};
// ===== 회사 소문: 직원은 자기 회사 계획을, 기자는 여러 회사 계획을 앎 (주식 시장의 계획 q를 사람마다 다르게 느낌 → 대체로 맞지만 틀릴 때도 있음) =====
const whenOf = (release, min) => { const d = Math.floor(release / DAY) - Math.floor(min / DAY); return d <= 0 ? '오늘' : d === 1 ? '내일' : d <= 3 ? '며칠 안에' : '다음 주쯤'; };
const ga = s => s + (jong(s) ? '이' : '가');
function insiderLine(p, sense, min) {
  const w = whenOf(p.release, min), good = sense > 0.15, bad = sense < -0.15;
  if (p.kind === 'product') return good ? `우리 회사에서 ${w} ${ga(p.item)} 나와요. 안에서 반응이 정말 좋아요. 기대해 봐도 좋을 거예요.` : bad ? `${w} 나올 ${p.item}, 솔직히 잘 될지 걱정이에요. 회사 안에서도 말이 많아요.` : `${w} ${p.item} 나온다는데, 잘 될지는 저도 잘 모르겠어요.`;
  if (p.kind === 'earnings') return good ? `이번 분기 우리 회사 장사가 꽤 잘됐대요. ${w} 실적 발표인데 다들 기대하는 눈치예요.` : bad ? `이번 분기 실적이 별로라는 말이 돌아요. ${w} 발표인데 위에서 분위기가 안 좋아요.` : `이번 분기 실적은 그냥 예년 수준일 것 같아요.`;
  if (p.kind === 'contract') return good ? `요즘 회사가 ${p.item} 협상 중인데 거의 다 됐다는 얘기가 있어요.` : bad ? `${p.item} 협상이 삐걱댄다는 말이 있어요. 잘 안 될 수도 있대요.` : `${p.item} 협상 중이라는데 어떻게 될지 모르겠어요.`;
  return null;
}
function reporterLine(p, sense, min) {
  const w = whenOf(p.release, min), good = sense > 0.15, bad = sense < -0.15;
  if (p.kind === 'product') return `취재해 보니 ${ga(p.name)} ${w} ${eul(p.item)} 내놓는대요. ${good ? '업계 반응이 꽤 좋아요.' : bad ? '그런데 내부에서 걱정이 많다더라고요.' : '잘 될지는 아직 반반이에요.'}`;
  if (p.kind === 'earnings') return `${p.name} 실적 발표가 ${w}인데, ${good ? '시장 예상보다 좋을 거란 말이 돌아요.' : bad ? '예상보다 나쁠 거란 얘기가 있어요.' : '예상 수준일 것 같아요.'}`;
  if (p.kind === 'contract') return `${ga(p.name)} ${p.item} 따내려고 협상 중이래요. ${good ? '성사 가능성이 높다는 분위기예요.' : bad ? '경쟁사에 밀린다는 얘기도 있고요.' : '결과는 아직 모르겠어요.'}`;
  if (p.kind === 'rate') return `${w} 한울은행 금리 회의가 있는데 ${sense > 0.3 ? '올릴 거란 전망이 많아요. 은행주엔 좋고 건설주엔 부담이죠.' : sense < -0.3 ? '내릴 거란 전망이 많아요. 건설주가 웃을지도요.' : '동결할 거란 전망이 많아요.'}`;
  return null;
}
// 지역 이야기
const REGION_TALK = {
  한가람: ['한가람은 나라 한가운데라 어디든 가기 편해요.', '높은 빌딩이 계속 들어서서 동네가 몰라보게 변했어요.'],
  별하항: ['별하항은 새벽 수산시장이 제일 활기차요.', '바다 보면서 사는 게 별하항 사람들 자랑이죠.'],
  단비: ['단비는 공장 굴뚝 연기가 쉴 날이 없어요.', '공장 덕분에 일자리가 많은 동네예요.'],
  누리벌: ['누리벌 쌀이 나라에서 제일 맛있다니까요.', '가을에 논이 금빛으로 물들면 정말 장관이에요.'],
};
const HOBBY = ['등산', '낚시', '독서', '요리', '게임', '그림 그리기', '축구', '노래', '사진 찍기', '뜨개질', '자전거', '화분 가꾸기'];

// 다시 만났을 때 인사 (같은 날 / 며칠 만)
const AGAIN_TODAY = { elder: ['허허, 또 만났구먼.', '아까 그 젊은이로구먼.'], kid: ['어? 또 만났네!', '아까 그 사람이다!'], bright: ['어, 또 만났네요! 반가워요!', '오늘만 두 번째네요!'], shy: ['아… 또 뵙네요.', '저, 아까…'], blunt: ['또 왔어요?', '아까 봤잖아요.'], warm: ['어머, 또 만났네요. 반가워요.', '또 보네요. 오늘 많이 바빠요?'], plain: ['또 뵙네요.', '아까 뵀죠?'] };
const AGAIN = { elder: ['허허, 오랜만일세.', '이게 얼마 만인가.'], kid: ['오랜만이야!', '어, 그때 그 사람!'], bright: ['와, 오랜만이에요! 잘 지냈어요?', '오랜만이에요! 보고 싶었어요!'], shy: ['아, 오랜만이에요…', '…기억나요. 오랜만이에요.'], blunt: ['오랜만이네요.', '또 보네요.'], warm: ['오랜만이에요! 그동안 잘 지냈어요?', '반가워요, 오랜만이네요.'], plain: ['오랜만이에요.', '오랜만에 뵙네요.'] };

// 대사 만들기. 일관성:
//   · 나를 기억함(met): 처음엔 인사·소개, 같은 날 다시 만나면 "또 만났네요", 며칠 만이면 "오랜만이에요" (소개는 처음 한 번만)
//   · 그 사람의 사실(말투 고르기·취미·꿈과 걱정·동네 이야기·주제 순서)은 늘 같음 → 사람 번호로 정한 고정 난수 F
//   · 하루 동안 바뀌는 것(오늘의 직업 이야기 등)은 그날 고정 → D
//   · 첫마디는 늘 머리 위 표시와 같은 "지금 하는 일"(+ 실제 욕구에 맞는 이유)
//   · 다시 말 걸면 아직 안 한 다음 주제로 넘어감 (만난 횟수만큼 순서를 돌림)
function makeTalk({ S, n, min, age, empName, ageOf, news, quote, met, doing, rumors = [] }) {
  const day = Math.floor(min / DAY), h = Math.floor((min % DAY) / 60);
  const F = k => hash(n.id, 501, k), D = k => hash(day, n.id, k);
  const fix = (list, k) => list[Math.floor(F(k) * list.length)], today = (list, k) => list[Math.floor(D(k) * list.length)];
  const tone = toneOf(n, age), job = OCC[n.occ], kid = tone === 'kid', wx = weatherOf(day), N = n.need;
  const lines = [];
  // 인사 (나를 기억하는지)
  const sameDay = met.last != null && Math.floor(met.last / DAY) === day;
  lines.push(fix(!met.times ? GREET[tone] : sameDay ? AGAIN_TODAY[tone] : AGAIN[tone], 1));
  // 소개는 처음 만났을 때만
  if (!met.times) lines.push(kid ? `나는 ${ira(n.name)}야! ${age}살이야.` : job ? fix([`저는 ${n.name}, ${empName ? empName + '에서 ' : ''}${ro(job.name)} 일해요.`, `${job.name} ${iE(n.name)}. ${age}살이고요.`, `${empName || '이 동네'}에서 일하는 ${ira2(n.name)} 해요.`], 2)
    : n.occ === 'retired' ? fix([`${n.name}일세. 일은 그만두고 쉬는 중이지.`, `나는 ${n.name}. 올해 ${age}이라네.`], 2) : n.occ === 'jobless' ? `저는 ${iE(n.name)}. 요즘 일자리를 찾는 중이에요.` : `저는 ${n.name}, ${age}살이에요.`);
  // 지금 하는 일 = 머리 위 표시와 같음 + 실제 욕구에 맞는 이유
  const NOW = { reporter: '취재하는 중이에요.', commute: h < 12 ? '출근하는 길이에요.' : '퇴근하는 길이에요.', walk: '산책하는 중이에요.', shop: '장 보러 가는 길이에요.', cafe: '카페 가는 길이에요.', eatOut: '밥 먹으러 가는 길이에요.', visit: '친구 만나러 가는 길이에요.', jobhunt: '일자리 알아보러 다니는 중이에요.', market: '시장 구경하는 중이에요.', work: n.occ === 'vendor' ? '장사하는 중이에요.' : '일하는 중이에요.' };
  const why = n.act === 'eatOut' && N.food < 60 ? ' 배가 고파서요.' : n.act === 'cafe' && N.social < 50 ? ' 사람 구경도 할 겸요.' : n.act === 'walk' && N.fun < 50 ? ' 바람 좀 쐬려고요.' : n.act === 'commute' && N.energy < 40 ? (h < 12 ? ' 아직 잠이 덜 깼어요.' : ' 오늘 좀 지쳤어요.') : n.act === 'shop' && n.groceries < 3 ? ' 냉장고가 텅 비었거든요.' : '';
  lines.push((n.occ === 'reporter' && n.act === 'work' ? NOW.reporter : NOW[n.act] || `지금은 ${doing}이에요.`) + why);
  // 회사 소문 (사람마다 느끼는 정도가 다름: 결과 q + 그 사람·그 계획마다 고정된 착각). 무뚝뚝한 사람은 절반쯤 입을 다묾
  const feel = (p, k) => p.q + (hash(n.id, p.id, 61) - 0.5) * k;
  const myCo = S.work.emps[n.emp]?.company;
  if (n.occ === 'reporter') {
    rumors.slice().sort((a, b) => a.release - b.release).filter((p, i) => hash(n.id, p.id, 62) < 0.6 || i === 0).slice(0, 2).forEach(p => { const l = reporterLine(p, p.kind === 'rate' ? (hash(n.id, p.id, 63) < 0.75 ? p.q : 0) : feel(p, 0.9), min); if (l) lines.push(l); });
  } else if (myCo && !kid) {
    const p = rumors.filter(p => p.co === myCo).sort((a, b) => a.release - b.release)[0];
    if (p) lines.push(tone === 'blunt' && F(30) < 0.5 ? '회사 일은 함부로 말 못 해요. 보안이라서요.' : insiderLine(p, feel(p, 0.6), min));
  }
  // 주제 (그 사람에게 맞는 것만, 순서는 사람마다 고정)
  const topics = [];
  if (job) topics.push(() => job.weather?.includes(wx) ? '오늘은 날씨 때문에 일을 공쳤어요. 그만큼 벌이도 줄었고요.' : n.stress > 70 ? '요즘 일이 너무 많아서 좀 지쳤어요.' : today(WORK[n.occ] || ['일은 그럭저럭 할 만해요.'], 3));
  if (n.occ === 'jobless') topics.push(() => `일을 쉰 지 ${Math.max(1, day - (n.joblessSince ?? day))}일째예요. ${fix(['이력서를 열 군데 넘게 넣었는데 연락이 없네요.', '다른 지역으로 가 볼까도 생각 중이에요.'], 4)}`);
  if (n.occ === 'student') topics.push(() => kid ? today(['시험 망했어… 엄마한테 혼날 것 같아.', '오늘 급식에 치킨 나왔다!', '학교 끝나면 친구들이랑 놀 거야!'], 4) : '수업이 너무 길어요.');
  if (n.occ === 'retired') topics.push(() => fix(['아침마다 산책하는 게 낙이지.', '경로당 친구들이랑 바둑 두는 재미로 산다네.', '젊었을 땐 나도 꽤 바빴다네.'], 4));
  topics.push(() => n.mood > 25 ? '요즘 기분이 꽤 좋아요.' : n.mood < -15 ? '요즘 좀 우울해요.' : N.energy < 35 ? '좀 피곤해요. 오늘은 일찍 자야겠어요.' : N.social < 35 ? '요즘 사람을 못 만나서 좀 외로웠어요. 말 걸어 줘서 고마워요.' : '그냥 평범하게 지내요.');
  if (n.mem.length) topics.push(() => { const m = n.mem[0]; return `${m.d === day ? '오늘' : m.d === day - 1 ? '어제' : '얼마 전에'} ${past(m.t)}`; });
  const sp = S.people.list[n.spouse], kids = n.kids.map(k => S.people.list[k]).filter(Boolean);
  if (kids.length) topics.push(() => { const k = kids[0], ka = ageOf(k, day); return ka < 7 ? `우리 ${ira(k.name)}가 요즘 말을 곧잘 해요. 너무 귀여워요.` : ka < 19 ? `우리 ${k.name}${jong(k.name) ? '이' : ''} 학교 다니는데, 공부는 안 하고 놀기만 해요.` : `우리 ${k.name}${jong(k.name) ? '은' : '는'} 벌써 다 커서 ${OCC[k.occ]?.name || '제 앞가림'} 일을 해요.`; });
  if (sp) topics.push(() => `배우자 ${sp.name}${jong(sp.name) ? '이' : '가'} ${OCC[sp.occ] ? OCC[sp.occ].name + ' 일을 해요.' : '집에 있어요.'}`);
  const fr = Object.entries(n.friends).sort((a, b) => b[1] - a[1]).map(([i]) => S.people.list[i]).find(f => f && f.id !== n.spouse);
  if (fr) topics.push(() => `제일 친한 친구는 ${fr.name}님이에요. 요즘 자주 만나요.`);
  const WX_TALK = { rain: '비가 와서 그런지 몸이 찌뿌둥하네요.', storm: '태풍 때문에 다들 집에 있어요. 조심해요!', snow: '눈이 오네요. 길이 미끄러우니 조심해요.', dust: '황사 때문에 목이 칼칼해요. 마스크 써요.', cloud: '하늘이 잔뜩 흐리네요.', sun: '날씨가 참 좋네요.' };
  topics.push(() => WX_TALK[wx] || '날씨가 오락가락하네요.');
  if (REGION_TALK[n.region]) topics.push(() => fix(REGION_TALK[n.region], 5));
  const emp = S.work.emps[n.emp], q = emp?.company && quote?.(emp.company);
  if (q && q.prev) topics.push(() => { const ch = (q.price - q.prev) / q.prev * 100; return Math.abs(ch) < 0.5 ? `우리 ${q.name} 주가는 요즘 잠잠해요.` : ch > 0 ? `우리 ${q.name} 주가가 오늘 ${ch.toFixed(1)}% 올랐대요! 분위기 좋아요.` : `우리 ${q.name} 주가가 오늘 ${(-ch).toFixed(1)}% 떨어져서 다들 표정이 안 좋아요.`; });
  if (!kid || age >= 10) topics.push(() => `쉬는 날엔 ${eul(fix(HOBBY, 6))} 해요.`);
  topics.push(() => fix(age < 19 ? ['나중에 크면 우주비행사 될 거야!', '빨리 어른이 되고 싶어.'] : age < 35 ? ['언젠가 내 가게를 차리고 싶어요.', '집값이 너무 비싸서 독립이 걱정이에요.', '돈 모아서 해외여행 가는 게 꿈이에요.'] : age < 65 ? ['애들 학비 대느라 허리가 휘어요.', '노후 준비를 슬슬 해야 하는데 걱정이에요.', '건강이 최고예요. 요즘 운동을 시작했어요.'] : ['손주 보는 게 제일 행복하지.', '무릎이 예전 같지 않아.'], 7));
  if (news && !/[.!?…]$/.test(news)) news += '.';
  if (news) topics.push(() => `그나저나 들었어요? ${news}`);
  // 순서: 사람마다 고정, 만난 횟수만큼 돌려서 다음 이야기 (밝은 사람은 한 마디 더)
  const order = topics.map((f, i) => [F(20 + i), f]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const take = n.tr.e > 0.6 ? 3 : 2, start = (met.times * take) % order.length;
  for (let i = 0; i < take && i < order.length; i++) { const l = order[(start + i) % order.length](); if (l && !lines.includes(l)) lines.push(l); }
  lines.push(fix(CLOSE[tone], 8));
  return kid ? lines.map((l, i) => (i === 0 || i === lines.length - 1 ? l : banmal(l))) : lines;   // 인사·끝인사는 이미 아이 말투
}

module.exports = { makeTalk };
