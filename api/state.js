/*
 * /api/state — estado do bolão (resultados + palpites).
 *
 *   GET   -> público. Retorna o estado atual, MAS com os palpites de jogos que
 *            ainda não começaram ocultados (sigilo). Veja lib/store.stripState.
 *   POST  -> admin. Exige o cabeçalho  x-admin-password: <ADMIN_PASSWORD>.
 *            Grava o estado enviado no corpo (JSON). O admin pode editar
 *            qualquer palpite a qualquer momento (sem trava de kickoff).
 *
 * As credenciais dos participantes ficam em outra chave (bolao:auth) e NUNCA
 * são retornadas aqui. Veja api/palpite.js (participante) e api/acessos.js (admin).
 */
'use strict';

const { SEED, readState, writeState, stripState, adminOk, parseBody } = require('../lib/store');

function validState(s) {
  return s && typeof s === 'object'
    && Array.isArray(s.fixtures) && s.fixtures.length === SEED.fixtures.length
    && Array.isArray(s.groups)
    && Array.isArray(s.participants);
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const state = await readState();
      // O admin (header x-admin-password válido) recebe o estado COMPLETO, sem
      // ocultar palpites — precisa disso para editar. O público recebe filtrado.
      if (adminOk(req)) return res.status(200).json(state);
      return res.status(200).json(stripState(state));
    }

    if (req.method === 'POST') {
      if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD não configurada no servidor.' });
      if (!adminOk(req)) return res.status(401).json({ error: 'Senha incorreta.' });

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
