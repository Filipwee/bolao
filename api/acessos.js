/*
 * /api/acessos — gestão de credenciais dos participantes (somente admin).
 *
 * Exige o cabeçalho  x-admin-password: <ADMIN_PASSWORD>.  POST com { action }:
 *
 *   { action:'list' }                                  -> { users:[{login,nome,senha,id}] }
 *   { action:'set',  login, senha, id, nome }          -> cria/atualiza um acesso
 *   { action:'remove', login }                         -> remove um acesso
 *
 * Cada acesso liga um  login  ao  id  de um participante do estado. As senhas
 * ficam só aqui (bolao:auth), nunca no GET público de /api/state.
 */
'use strict';

const { readAuth, writeAuth, adminOk, parseBody } = require('../lib/store');

const norm = s => String(s || '').trim().toLowerCase();

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Método não permitido.' });
    }
    res.setHeader('Cache-Control', 'no-store');

    if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD não configurada no servidor.' });
    if (!adminOk(req)) return res.status(401).json({ error: 'Senha incorreta.' });

    const body = parseBody(req) || {};
    const auth = await readAuth();

    if (body.action === 'list') {
      const users = Object.entries(auth.users)
        .map(([login, u]) => ({ login, nome: u.nome, senha: u.senha, id: u.id }))
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
      return res.status(200).json({ users });
    }

    if (body.action === 'set') {
      const login = norm(body.login);
      const senha = String(body.senha == null ? '' : body.senha);
      if (!login) return res.status(400).json({ error: 'Login obrigatório.' });
      if (!senha) return res.status(400).json({ error: 'Senha obrigatória.' });
      if (!body.id) return res.status(400).json({ error: 'Participante (id) obrigatório.' });
      // Um login por participante: se este id já tinha outro login, remove o antigo.
      for (const [l, u] of Object.entries(auth.users)) {
        if (u.id === body.id && l !== login) delete auth.users[l];
      }
      auth.users[login] = { id: body.id, nome: body.nome || '', senha };
      await writeAuth(auth);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'remove') {
      const login = norm(body.login);
      if (auth.users[login]) { delete auth.users[login]; await writeAuth(auth); }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno.', detail: String(e && e.message || e) });
  }
};
