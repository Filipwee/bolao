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

// Multiplicador de pontos por fase do mata-mata (igual ao site/admin/meu).
function multFase(fase){
  switch (fase){
    case '16-avos':   return 1.5;
    case 'Oitavas':   return 2;
    case 'Quartas':   return 3;
    case 'Semifinal': return 4;
    case 'Disputa 3º':return 4;
    case 'Final':     return 5;
    default:          return 1;
  }
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

// [fase, base, esperado] — pontos efetivos = base × multFase(fase)
const casosMult = [
  ['Grupo A',   25, 25],
  ['16-avos',   18, 27],
  ['16-avos',   15, 22.5],
  ['Oitavas',   25, 50],
  ['Quartas',   10, 30],
  ['Semifinal', 18, 72],
  ['Disputa 3º',12, 48],
  ['Final',     25, 125],
];
for (const [fase, base, exp] of casosMult){
  const got = base * multFase(fase);
  const pass = got === exp;
  if (pass) ok++; else fail++;
  console.log(`${pass?'✓':'✗'} ${base} × mult(${fase}) == ${got}  (esperado ${exp})`);
}
console.log(`\nTotal: ${ok} ok, ${fail} falhas.`);
process.exit(fail === 0 ? 0 : 1);
