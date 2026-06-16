/*
 * /api/palpite — área do participante (login próprio).
 *
 *   POST { login, senha }                      -> "login": valida e devolve
 *                                                 nome + os palpites do próprio.
 *   POST { login, senha, palpites: {n:{casa,fora}, ...} }
 *                                              -> salva os palpites do próprio.
 *                                                 Jogos que JÁ COMEÇARAM são
 *                                                 ignorados (trava no kickoff) e
 *                                                 voltam listados em "travados".
 *
 * Cada participante só altera os PRÓPRIOS palpites — nunca resultados nem
 * palpites de outros. As credenciais ficam em bolao:auth (veja lib/store).
 */
'use strict';

const { readState, writeState, authParticipant, jaComecou, parseBody, SEED } = require('../lib/store');

const NJOGOS = SEED.fixtures.length;

function limpaPalpite(v) {
  // Aceita {casa, fora}. null/'' em qualquer lado => apagar o palpite.
  if (!v || typeof v !== 'object') return undefined;
  const c = v.casa, f = v.fora;
  if (c == null || c === '' || f == null || f === '') return null; // sinaliza "apagar"
  const casa = Math.max(0, parseInt(c, 10));
  const fora = Math.max(0, parseInt(f, 10));
  if (!Number.isFinite(casa) || !Number.isFinite(fora)) return undefined;
  return { casa, fora };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Método não permitido.' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const body = parseBody(req) || {};
    const user = await authParticipant(body.login, body.senha);
    if (!user) return res.status(401).json({ error: 'Login ou senha incorretos.' });

    const state = await readState();
    const part = (state.participants || []).find(p => p.id === user.id);
    if (!part) return res.status(404).json({ error: 'Conta sem participante vinculado. Avise o admin.' });
    if (!part.palpites || typeof part.palpites !== 'object') part.palpites = {};

    const travados = [];
    let alterados = 0;

    if (body.palpites && typeof body.palpites === 'object') {
      const now = Date.now();
      for (const [k, raw] of Object.entries(body.palpites)) {
        const n = parseInt(k, 10);
        if (!(n >= 1 && n <= NJOGOS)) continue;
        if (jaComecou(n, now)) { travados.push(n); continue; } // trava: jogo já começou
        const val = limpaPalpite(raw);
        if (val === undefined) continue;
        if (val === null) { if (part.palpites[String(n)]) { delete part.palpites[String(n)]; alterados++; } }
        else { part.palpites[String(n)] = val; alterados++; }
      }
      if (alterados) await writeState(state);
    }

    return res.status(200).json({
      ok: true,
      id: user.id,
      nome: part.nome,
      palpites: part.palpites,
      alterados,
      travados,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno.', detail: String(e && e.message || e) });
  }
};
