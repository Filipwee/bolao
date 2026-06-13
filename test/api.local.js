/*
 * Testa api/state.js no modo memória (sem Redis), simulando req/res do Vercel.
 * Uso:  node test/api.local.js
 */
'use strict';
process.env.ADMIN_PASSWORD = 'segredo';
// Garante modo memória (sem variáveis de Redis).
delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;

const handler = require('../api/state.js');
const seed = require('../public/bolao.seed.json');

function mockRes(){
  return { _code:0, _json:null, _h:{},
    setHeader(k,v){ this._h[k]=v; },
    status(c){ this._code=c; return this; },
    json(o){ this._json=o; return this; } };
}
async function call(method, { headers={}, body=null } = {}){
  const req = { method, headers, body };
  const res = mockRes();
  await handler(req, res);
  return res;
}

let ok=0, fail=0;
function check(desc, cond){ if(cond){ ok++; console.log('✓', desc); } else { fail++; console.log('✗', desc); } }

(async () => {
  // 1) GET inicial -> seed
  let r = await call('GET');
  check('GET retorna 200', r._code===200);
  check('GET retorna seed com 104 jogos', r._json && r._json.fixtures.length===104);
  check('GET marca no-store', r._h['Cache-Control']==='no-store');

  // 2) POST sem senha -> 401
  r = await call('POST', { body: seed });
  check('POST sem senha -> 401', r._code===401);

  // 3) POST com senha errada -> 401
  r = await call('POST', { headers:{'x-admin-password':'errada'}, body: seed });
  check('POST senha errada -> 401', r._code===401);

  // 4) POST com senha certa + estado válido -> 200 e persiste
  const novo = JSON.parse(JSON.stringify(seed));
  const ryan = novo.participants.find(p=>p.nome==='Ryan');
  ryan.palpites['1'] = { casa:2, fora:0 };
  ryan.palpites['2'] = { casa:2, fora:1 };
  r = await call('POST', { headers:{'x-admin-password':'segredo'}, body: novo });
  check('POST válido -> 200 ok', r._code===200 && r._json.ok===true);

  // 5) GET reflete o que foi salvo
  r = await call('GET');
  const ry = r._json.participants.find(p=>p.nome==='Ryan');
  check('GET reflete o palpite salvo', ry && ry.palpites['1'] && ry.palpites['1'].casa===2);

  // 6) POST com corpo recebido como STRING (como vem cru às vezes) -> 200
  r = await call('POST', { headers:{'x-admin-password':'segredo'}, body: JSON.stringify(novo) });
  check('POST com body string -> 200', r._code===200);

  // 7) POST estado inválido -> 400
  r = await call('POST', { headers:{'x-admin-password':'segredo'}, body: { fixtures:[], groups:[], participants:[] } });
  check('POST estado inválido -> 400', r._code===400);

  // 8) Método não suportado -> 405
  r = await call('PUT');
  check('PUT -> 405', r._code===405);

  console.log(`\n${ok} ok, ${fail} falhas.`);
  process.exit(fail===0 ? 0 : 1);
})();
