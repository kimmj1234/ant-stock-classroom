'use strict';
// 맵 검사: node tools/mapcheck.js → 모든 장면에서
//   1) 못 지나가는 물건(건물·나무…)이 차도·횡단보도·물 위에 있지 않은지 (배는 물 위가 맞음)
//   2) 못 지나가는 물건끼리 겹치지 않는지
//   3) 처음 서는 곳에서 걸어서 모든 E 자리(문·NPC·벤치·터미널)에 닿을 수 있는지
//   4) 처음 서는 곳이 막히지 않았는지
// 게임 코드(world.js·sprites.js·town.js)를 그대로 불러와서 검사 (그림은 그리지 않음)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const stubCtx = new Proxy({}, { get: () => () => ({}) });
const ctx = vm.createContext({ console, Math, Map, Set, document: { createElement: () => ({ getContext: () => stubCtx }) } });
for (const f of ['world.js', 'workplaces.js', 'sprites.js', 'town.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const { SCENES, TILE } = vm.runInContext('({ SCENES, TILE })', ctx);
const ON_WATER = new Set(['boat']), BAD_GROUND = new Set(['R', 'Z', 'S']);
let problems = 0;
const report = (scene, msg) => { problems++; console.log(`[${scene}] ${msg}`); };
for (const [name, sc] of Object.entries(SCENES)) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < sc.cols && y < sc.rows ? sc.ground[y][x] : null);
  // 물건 자리(칸): 발밑 가운데(x)·아래(y)와 가로·세로 칸 수로 다시 계산. 자리가 모두 막힌 칸이면 못 지나가는 물건
  const solids = [];
  for (const t of sc.things) {
    if (t.ground) continue;
    const x0 = Math.round(t.x / TILE - t.w / 2), y0 = Math.round(t.y / TILE - t.d), cells = [];
    for (let y = y0; y < y0 + t.d; y++) for (let x = x0; x < x0 + t.w; x++) cells.push([x, y]);
    if (!cells.every(([x, y]) => sc.solid.has(x + ',' + y))) continue;
    for (const [x, y] of cells) {
      const g = at(x, y);
      if (g === null) report(name, `${t.type} (${x0},${y0}) 맵 밖`);
      else if (BAD_GROUND.has(g) && !(g === 'S' && ON_WATER.has(t.type))) report(name, `${t.type} (${x0},${y0}) 가 ${g === 'S' ? '물' : '차도'} 위 (${x},${y})`);
    }
    solids.push({ t, x0, y0, cells });
  }
  const owner = new Map();
  for (const s of solids) for (const [x, y] of s.cells) {
    const k = x + ',' + y, o = owner.get(k);
    if (o && o !== s) { report(name, `${o.t.type}(${o.x0},${o.y0}) 와 ${s.t.type}(${s.x0},${s.y0}) 겹침 (${x},${y})`); break; }
    owner.set(k, s);
  }
  // 걸어서 닿는 칸: 처음 자리에서 막히지 않은 칸으로 퍼짐
  const free = (x, y) => at(x, y) !== null && !sc.solid.has(x + ',' + y);
  const sx = Math.floor(sc.start.x / TILE), sy = Math.floor(sc.start.y / TILE);
  if (!free(sx, sy)) { report(name, `처음 서는 곳 (${sx},${sy})이 막힘`); continue; }
  const seen = new Set([sx + ',' + sy]), queue = [[sx, sy]];
  while (queue.length) { const [x, y] = queue.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (!seen.has(k) && free(x + dx, y + dy)) { seen.add(k); queue.push([x + dx, y + dy]); } } }
  for (const sp of sc.spots) {
    const x = Math.floor(sp.x / TILE), y = Math.floor(sp.y / TILE);
    const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((x + dx) + ',' + (y + dy)));
    if (!near) report(name, `E 자리(${sp.type}${sp.to ? ' → ' + sp.to : ''}) (${x},${y})에 걸어서 못 닿음`);
  }
  console.log(`${name}: ${sc.cols}×${sc.rows}칸, 물건 ${sc.things.length}개(막는 것 ${solids.length}), E 자리 ${sc.spots.length}곳, 걸어 다닐 수 있는 칸 ${seen.size}`);
}
console.log(problems ? `문제 ${problems}건` : '문제 없음');
process.exitCode = problems ? 1 : 0;
