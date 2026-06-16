/*
 * lib/store.js — camada compartilhada de armazenamento + autenticação do Bolão.
 *
 * Usada por todas as funções em api/. Centraliza:
 *   - leitura/escrita do ESTADO público (resultados + palpites)   chave  bolao:state
 *   - leitura/escrita das CREDENCIAIS dos participantes (privado)  chave  bolao:auth
 *   - tabela de kickoff (instante de início) por número de jogo, vinda do seed
 *   - regra de SIGILO: stripState() oculta palpites de jogos que ainda não começaram
 *
 * Armazenamento: Upstash Redis (Vercel). Sem as variáveis de ambiente, cai num
 * cache em memória — útil para dev/local e para os testes (não persiste).
 *
 * IMPORTANTE: as credenciais (bolao:auth) NUNCA são retornadas pelo GET público.
 */
'use strict';

const SEED = require('../public/bolao.seed.json');

const KEY_STATE = 'bolao:state';
const KEY_AUTH = 'bolao:auth';

// ---- Armazenamento -------------------------------------------------------
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasRedis = !!(REDIS_URL && REDIS_TOKEN);

let _redis = null;
function redis() {
  if (_redis) return _redis;
  const { Redis } = require('@upstash/redis'); // require preguiçoso: só quando há banco
  _redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  return _redis;
}

// Fallback em memória (dev/local, quando não há Redis configurado).
const mem = { state: null, auth: null };

async function readState() {
  if (hasRedis) return (await redis().get(KEY_STATE)) || SEED;
  return mem.state || SEED;
}
async function writeState(state) {
  if (hasRedis) await redis().set(KEY_STATE, state);
  else mem.state = state;
}

// Blob de credenciais: { users: { "<login>": { id, nome, senha } } }
async function readAuth() {
  let a = hasRedis ? await redis().get(KEY_AUTH) : mem.auth;
  if (!a || typeof a !== 'object') a = {};
  if (!a.users || typeof a.users !== 'object') a.users = {};
  return a;
}
async function writeAuth(auth) {
  if (hasRedis) await redis().set(KEY_AUTH, auth);
  else mem.auth = auth;
}

// ---- Kickoff por número de jogo (fonte da verdade = seed) ----------------
// O estado salvo no banco pode não ter o campo kickoff (foi adicionado depois),
// então usamos sempre o seed, indexado pelo nº do jogo (1..104), que é estável.
const KICKOFF = {};
for (const f of SEED.fixtures) if (f.kickoff) KICKOFF[f.n] = Date.parse(f.kickoff);

function kickoffOf(n) {
  const t = KICKOFF[Number(n)];
  return Number.isFinite(t) ? t : null;
}
// Jogo já começou? (sem kickoff conhecido => tratamos como começado, por segurança)
function jaComecou(n, now = Date.now()) {
  const t = kickoffOf(n);
  return t == null ? true : now >= t;
}

// ---- Sigilo: oculta palpites de jogos que ainda não começaram ------------
// Devolve uma CÓPIA do estado. Para todo jogo que ainda não começou, remove o
// palpite daquele jogo de todos os participantes — exceto do dono (revealId),
// que precisa ver/editar o próprio. Também injeta o kickoff em cada fixture
// (informação pública e útil para o cliente saber quando trava).
function stripState(state, now = Date.now(), revealId = null) {
  const s = JSON.parse(JSON.stringify(state));
  for (const f of s.fixtures) {
    const k = kickoffOf(f.n);
    if (k != null) f.kickoff = new Date(k).toISOString();
  }
  for (const p of s.participants || []) {
    if (!p || !p.palpites) continue;
    if (revealId && p.id === revealId) continue; // dono vê os próprios
    for (const key of Object.keys(p.palpites)) {
      if (!jaComecou(key, now)) delete p.palpites[key];
    }
  }
  return s;
}

// ---- Helpers de segurança ------------------------------------------------
function timingSafeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function adminOk(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const got = req.headers['x-admin-password'] || '';
  return timingSafeEqual(got, expected);
}

// Valida login+senha de um participante contra o blob de auth.
// Retorna { id, nome, login } ou null.
async function authParticipant(login, senha) {
  if (!login || senha == null) return null;
  const auth = await readAuth();
  const u = auth.users[String(login).trim().toLowerCase()];
  if (!u) return null;
  if (!timingSafeEqual(senha, u.senha)) return null;
  return { id: u.id, nome: u.nome, login: String(login).trim().toLowerCase() };
}

function parseBody(req) {
  if (req.body == null) return null;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  return req.body;
}

module.exports = {
  SEED,
  readState, writeState, readAuth, writeAuth,
  kickoffOf, jaComecou, stripState,
  timingSafeEqual, adminOk, authParticipant, parseBody,
};
