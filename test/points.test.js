/*
 * Testes da regra de pontuação (seção 3 / 7 do prompt).
 * Uso:  node test/points.test.js
 */
'use strict';

// Mesma função usada no site e no admin.
function points(RC, RF, PC, PF){
  if (RC==null || RF==null || PC==null || PF==null) return null;
  if (PC===RC && PF===RF) return 25;
  if (RC===RF) return (PC===PF) ? 5 : 0;
  const venceuCerto = (RC>RF && PC>PF) || (RC<RF && PC<PF);
  if (!venceuCerto) return 0;
  let p = 10;
  if (Math.max(RC,RF) === Math.max(PC,PF)) p = Math.max(p,18);
  if (Math.min(RC,RF) === Math.min(PC,PF)) p = Math.max(p,15);
  if ((RC-RF) === (PC-PF))                 p = Math.max(p,12);
  return p;
}

// [RC,RF, PC,PF, esperado]
const casos = [
  [2,0, 2,0, 25],
  [1,1, 0,0,  5],
  [2,0, 2,1, 18],
  [4,1, 3,0, 12],
  [2,0, 1,0, 15],
  [2,1, 1,0, 12],
  [4,1, 2,1, 15],
  [2,1, 0,2,  0],
  [1,1, 2,2,  5],
  [0,3, 1,3, 18],
];

let ok = 0, fail = 0;
for (const [RC,RF,PC,PF,exp] of casos){
  const got = points(RC,RF,PC,PF);
  const pass = got === exp;
  if (pass) ok++; else fail++;
  console.log(`${pass?'✓':'✗'} points(${RC},${RF}, ${PC},${PF}) == ${got}  (esperado ${exp})`);
}
console.log(`\n${ok}/${casos.length} casos passaram.`);
process.exit(fail === 0 ? 0 : 1);
