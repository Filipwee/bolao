/*
 * Teste de integração (em memória) do fluxo novo:
 *   acessos (admin) -> login do participante -> salvar palpite com trava no
 *   kickoff -> sigilo no GET público vs GET admin.
 *
 * Uso:  node test/auth.local.js
 */
'use strict';
process.env.ADMIN_PASSWORD = 'segredo';
delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;

const stateH = require('../api/state.js');
const palpiteH = require('../api/palpite.js');
const acessosH = require('../api/acessos.js');
const { SEED, kickoffOf } = require('../lib/store');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓', m); } else { fail++; console.log('✗', m); } };

function call(handler, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise(resolve => {
    const req = { method, headers, body };
    const res = {
      statusCode: 200, _json: null,
      setHeader() {}, status(c) { this.statusCode = c; return this; },
      json(o) { this._json = o; resolve({ status: this.statusCode, body: o }); return this; },
    };
    handler(req, res);
  });
}
const ADM = { 'x-admin-password': 'segredo' };

(async () => {
  // Acha um jogo no passado e um no futuro em relação a agora.
  const now = Date.now();
  const passado = SEED.fixtures.find(f => kickoffOf(f.n) < now);
  const futuro = SEED.fixtures.find(f => kickoffOf(f.n) > now);
  ok(passado && futuro, `achou jogo passado (#${passado&&passado.n}) e futuro (#${futuro&&futuro.n})`);

  // 1) Admin grava um estado migrado (participantes com id).
  const st = JSON.parse(JSON.stringify(SEED));
  st.participants.forEach((p, i) => p.id = 'p' + i);
  const ryanId = st.participants[0].id;
  let r = await call(stateH, { method: 'POST', headers: { ...ADM, 'content-type': 'application/json' }, body: st });
  ok(r.status === 200, 'admin POST estado migrado -> 200');

  // 2) Admin cria um acesso para o participante 0.
  r = await call(acessosH, { method: 'POST', headers: { ...ADM, 'content-type': 'application/json' },
    body: { action: 'set', login: 'Ryan', senha: 'abc123', id: ryanId, nome: 'Ryan' } });
  ok(r.status === 200, 'acessos set -> 200');

  // 2b) listar acessos (admin)
  r = await call(acessosH, { method: 'POST', headers: ADM, body: { action: 'list' } });
  ok(r.body.users.length === 1 && r.body.users[0].login === 'ryan', 'acessos list mostra o login normalizado');

  // 3) Login do participante (senha errada -> 401)
  r = await call(palpiteH, { method: 'POST', body: { login: 'ryan', senha: 'xxx' } });
  ok(r.status === 401, 'login senha errada -> 401');

  // 3b) Login correto -> 200 com nome
  r = await call(palpiteH, { method: 'POST', body: { login: 'ryan', senha: 'abc123' } });
  ok(r.status === 200 && r.body.nome === 'Ryan', 'login correto -> 200 com nome');

  // 4) Salva palpite no jogo futuro (aceito) e no passado (travado)
  r = await call(palpiteH, { method: 'POST', body: { login: 'ryan', senha: 'abc123',
    palpites: { [futuro.n]: { casa: 2, fora: 1 }, [passado.n]: { casa: 0, fora: 0 } } } });
  ok(r.body.alterados === 1, 'salvou só o jogo futuro (1 alterado)');
  ok(r.body.travados.includes(passado.n), `jogo passado #${passado.n} veio em travados`);
  ok(r.body.palpites[String(futuro.n)] && r.body.palpites[String(futuro.n)].casa === 2, 'palpite do jogo futuro persistiu');

  // 4b) Pênaltis: empate de mata-mata guarda o 'pen'; não-empate descarta.
  const futMata = SEED.fixtures.find(f => f.n >= 73 && kickoffOf(f.n) > now);
  if (futMata) {
    r = await call(palpiteH, { method: 'POST', body: { login: 'ryan', senha: 'abc123',
      palpites: { [futMata.n]: { casa: 1, fora: 1, pen: 'casa' } } } });
    ok(r.body.palpites[String(futMata.n)] && r.body.palpites[String(futMata.n)].pen === 'casa',
      'empate de mata-mata guarda o vencedor de pênaltis');
    r = await call(palpiteH, { method: 'POST', body: { login: 'ryan', senha: 'abc123',
      palpites: { [futMata.n]: { casa: 2, fora: 1, pen: 'casa' } } } });
    ok(r.body.palpites[String(futMata.n)] && r.body.palpites[String(futMata.n)].pen === undefined,
      'não-empate descarta o vencedor de pênaltis');
  } else { ok(true, '(sem jogo de mata-mata futuro para testar pênaltis)'); }

  // 5) Sigilo: GET público esconde o palpite do jogo futuro
  r = await call(stateH, { method: 'GET' });
  const ryanPub = r.body.participants.find(p => p.id === ryanId);
  ok(!ryanPub.palpites[String(futuro.n)], 'GET público OCULTA o palpite do jogo futuro');

  // 6) GET admin mostra tudo
  r = await call(stateH, { method: 'GET', headers: ADM });
  const ryanAdm = r.body.participants.find(p => p.id === ryanId);
  ok(!!ryanAdm.palpites[String(futuro.n)], 'GET admin MOSTRA o palpite do jogo futuro');

  // 7) GET público injeta kickoff nos fixtures
  ok(typeof r.body.fixtures[0].kickoff === 'string', 'fixtures trazem kickoff');

  console.log(`\n${pass} ok, ${fail} falhas.`);
  process.exit(fail ? 1 : 0);
})();
