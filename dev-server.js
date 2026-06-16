/*
 * Servidor de desenvolvimento local — serve os arquivos estáticos e a função
 * /api/state, do mesmo jeito que o Vercel faz em produção. Útil para testar
 * tudo (site + admin) na sua máquina antes do deploy.
 *
 * Uso:
 *   ADMIN_PASSWORD=minha-senha node dev-server.js
 *   (no Windows PowerShell:  $env:ADMIN_PASSWORD='minha-senha'; node dev-server.js)
 *
 * Sem Redis configurado, o estado fica só em memória (zera ao reiniciar).
 * Abra http://localhost:3000  (site)  e  http://localhost:3000/admin.html
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

if (!process.env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = 'admin';
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = { '.html':'text/html; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.ico':'image/x-icon' };

function readBody(req){
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // API — roteia /api/<nome> para ./api/<nome>.js (mesmo mapeamento do Vercel).
  if (url.startsWith('/api/')) {
    const name = url.slice('/api/'.length);
    const file = path.join(ROOT, 'api', name + '.js');
    if (!file.startsWith(path.join(ROOT, 'api')) || !fs.existsSync(file)) {
      res.statusCode = 404; return res.end('not found');
    }
    const handler = require(file);
    // Polyfill dos helpers que o runtime do Vercel adiciona ao `res`.
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
    const raw = await readBody(req);
    // Imita o Vercel: corpo JSON desserializado em req.body.
    req.body = raw && req.headers['content-type'] && req.headers['content-type'].includes('json')
      ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw || null;
    return handler(req, res);
  }

  // Estáticos servidos de public/ (mesmo layout do Vercel). Impede path traversal.
  const PUB = path.join(ROOT, 'public');
  let file = url === '/' ? '/index.html' : decodeURIComponent(url);
  const full = path.join(PUB, file);
  if (!full.startsWith(PUB)) { res.statusCode = 403; return res.end('forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', MIME[path.extname(full)] || 'application/octet-stream');
    res.end(buf);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Bolão rodando em http://localhost:${PORT}`);
    console.log(`Admin em http://localhost:${PORT}/admin.html  (senha: ${process.env.ADMIN_PASSWORD})`);
  });
}
module.exports = server;
