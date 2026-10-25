'use strict';
// 거리 검사: node sim/street.js → 처음 세계에서 하루를 돌리며 시간마다 지역 맵에 보이는(밖에 나와 있는) 사람 수를 셈
const { createSim } = require('./index.js');
const { DAY } = require('../world.js');
const sim = createSim({ file: 'mem', read: () => null, write: () => {} });
const start = DAY;   // 1일째 0시
sim.advance(start);
const row = [];
for (let h = 0; h < 24; h++) {
  sim.kernel.advance(start + h * 60 + 30, 1e9);
  row.push(`${String(h).padStart(2)}시 ${['city', 'byeolha', 'danbi', 'nuribeol'].map(s => String(sim.visible(s, start + h * 60 + 30).length).padStart(2)).join(' ')}`);
}
console.log('시각  한가람 별하항 단비 누리벌\n' + row.join('\n'));
