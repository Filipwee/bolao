/*
 * /api/state — estado do bolão (resultados + palpites).
 *
 *   GET   -> público. Retorna o estado atual (ou o seed, se o banco estiver vazio).
 *   POST  -> admin. Exige o cabeçalho  x-admin-password: <ADMIN_PASSWORD>.
 *            Grava o estado enviado no corpo (JSON).
 *
 * Armazenamento: Upstash Redis (Vercel Marketplace). A função lê as variáveis
 * KV_REST_API_URL / KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_URL / _TOKEN).
 * Sem essas variáveis (ex.: rodando localmente), usa um cache em memória — útil
 * para desenvolvimento, mas NÃO persiste entre execuções/instâncias.
 */
'use strict';

const SEED = require('../public/bolao.seed.json');
const KEY = 'bolao:state';

// ---- Armazenamento -------------------------------------------------------
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

let _redis = null;
function redis() {
  if (_redis) return _redis;
  const { Redis } = require('@upstash/redis');     // require preguiçoso: só quando há banco
  _redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  return _redis;
}

// Fallback em memória (dev/local, quando não há Redis configurado).
const mem = { state: null };

async function readState() {
  if (REDIS_URL && REDIS_TOKEN) {
    const s = await redis().get(KEY);     // @upstash/redis já desserializa JSON
    return s || SEED;
  }
  return mem.state || SEED;
}

async function writeState(state) {
  if (REDIS_URL && REDIS_TOKEN) {
    await redis().set(KEY, state);
  } else {
    mem.state = state;
  }
}

// ---- Helpers -------------------------------------------------------------
function timingSafeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function validState(s) {
  return s && typeof s === 'object'
    && Array.isArray(s.fixtures) && s.fixtures.length === SEED.fixtures.length
    && Array.isArray(s.groups)
    && Array.isArray(s.participants);
}

function parseBody(req) {
  if (req.body == null) return null;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  return req.body; // já desserializado pelo runtime do Vercel
}

// ---- Handler -------------------------------------------------------------
module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const state = await readState();
      return res.status(200).json(state);
    }

    if (req.method === 'POST') {
      const expected = process.env.ADMIN_PASSWORD;
      if (!expected) return res.status(500).json({ error: 'ADMIN_PASSWORD não configurada no servidor.' });
      const got = req.headers['x-admin-password'] || '';
      if (!timingSafeEqual(got, expected)) return res.status(401).json({ error: 'Senha incorreta.' });

      const body = parseBody(req);
      if (!validState(body)) return res.status(400).json({ error: 'Estado inválido.' });

      await writeState(body);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno.', detail: String(e && e.message || e) });
  }
};
