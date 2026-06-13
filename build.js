/*
 * build.js — processa os dados oficiais da Copa (formato openfootball) e gera
 * os arquivos finais do Bolão: index.html (site público) e admin.html (painel).
 *
 * Uso:  node build.js
 *
 * Entradas:
 *   worldcup.groups.json        os 12 grupos (A..L)
 *   worldcup.json               os 104 jogos
 *   src/index.template.html     template do site público (marcador /*__DATA__*\/)
 *   src/admin.template.html     template do painel (marcadores __TPL__ e __INIT__)
 *
 * Saídas (em public/, layout padrão do Vercel):
 *   public/index.html        public/bolao.seed.json
 * (public/admin.html é estático, escrito à mão — não é gerado aqui.)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

// ---------------------------------------------------------------------------
// Tradução das seleções para PT-BR + bandeira (emoji)
// ---------------------------------------------------------------------------
const TEAMS = {
  'Mexico':               { nome: 'México',               flag: '🇲🇽' },
  'South Africa':         { nome: 'África do Sul',         flag: '🇿🇦' },
  'South Korea':          { nome: 'Coreia do Sul',         flag: '🇰🇷' },
  'Czech Republic':       { nome: 'Rep. Tcheca',           flag: '🇨🇿' },
  'Canada':               { nome: 'Canadá',                flag: '🇨🇦' },
  'Bosnia & Herzegovina': { nome: 'Bósnia e Herzegovina',  flag: '🇧🇦' },
  'Qatar':                { nome: 'Catar',                 flag: '🇶🇦' },
  'Switzerland':          { nome: 'Suíça',                 flag: '🇨🇭' },
  'Brazil':               { nome: 'Brasil',                flag: '🇧🇷' },
  'Morocco':              { nome: 'Marrocos',              flag: '🇲🇦' },
  'Haiti':                { nome: 'Haiti',                 flag: '🇭🇹' },
  'Scotland':             { nome: 'Escócia',               flag: '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}' },
  'USA':                  { nome: 'Estados Unidos',        flag: '🇺🇸' },
  'Paraguay':             { nome: 'Paraguai',              flag: '🇵🇾' },
  'Australia':            { nome: 'Austrália',             flag: '🇦🇺' },
  'Turkey':               { nome: 'Turquia',               flag: '🇹🇷' },
  'Germany':              { nome: 'Alemanha',              flag: '🇩🇪' },
  'Curaçao':              { nome: 'Curaçao',               flag: '🇨🇼' },
  'Ivory Coast':          { nome: 'Costa do Marfim',       flag: '🇨🇮' },
  'Ecuador':              { nome: 'Equador',               flag: '🇪🇨' },
  'Netherlands':          { nome: 'Holanda',               flag: '🇳🇱' },
  'Japan':                { nome: 'Japão',                 flag: '🇯🇵' },
  'Sweden':               { nome: 'Suécia',                flag: '🇸🇪' },
  'Tunisia':              { nome: 'Tunísia',               flag: '🇹🇳' },
  'Belgium':              { nome: 'Bélgica',               flag: '🇧🇪' },
  'Egypt':                { nome: 'Egito',                 flag: '🇪🇬' },
  'Iran':                 { nome: 'Irã',                   flag: '🇮🇷' },
  'New Zealand':          { nome: 'Nova Zelândia',         flag: '🇳🇿' },
  'Spain':                { nome: 'Espanha',               flag: '🇪🇸' },
  'Cape Verde':           { nome: 'Cabo Verde',            flag: '🇨🇻' },
  'Saudi Arabia':         { nome: 'Arábia Saudita',        flag: '🇸🇦' },
  'Uruguay':              { nome: 'Uruguai',               flag: '🇺🇾' },
  'France':               { nome: 'França',                flag: '🇫🇷' },
  'Senegal':              { nome: 'Senegal',               flag: '🇸🇳' },
  'Iraq':                 { nome: 'Iraque',                flag: '🇮🇶' },
  'Norway':               { nome: 'Noruega',               flag: '🇳🇴' },
  'Argentina':            { nome: 'Argentina',             flag: '🇦🇷' },
  'Algeria':              { nome: 'Argélia',               flag: '🇩🇿' },
  'Austria':              { nome: 'Áustria',               flag: '🇦🇹' },
  'Jordan':               { nome: 'Jordânia',              flag: '🇯🇴' },
  'Portugal':             { nome: 'Portugal',              flag: '🇵🇹' },
  'DR Congo':             { nome: 'R.D. Congo',            flag: '🇨🇩' },
  'Uzbekistan':           { nome: 'Uzbequistão',           flag: '🇺🇿' },
  'Colombia':             { nome: 'Colômbia',              flag: '🇨🇴' },
  'England':              { nome: 'Inglaterra',            flag: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}' },
  'Croatia':              { nome: 'Croácia',               flag: '🇭🇷' },
  'Ghana':                { nome: 'Gana',                  flag: '🇬🇭' },
  'Panama':               { nome: 'Panamá',                flag: '🇵🇦' },
};

// Fases (rounds openfootball -> rótulo do bolão)
const FASE = {
  'Round of 32':           '16-avos',
  'Round of 16':           'Oitavas',
  'Quarter-final':         'Quartas',
  'Semi-final':            'Semifinal',
  'Match for third place': 'Disputa 3º',
  'Final':                 'Final',
};

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const PARTICIPANTES = ['Ryan', 'Filipe', 'Rapha', 'Rafael', 'Isaac', 'Miguel', 'Rogério', 'Davi', 'Sérgio'];

// ---------------------------------------------------------------------------
// Helpers de seleção e placeholders do mata-mata
// ---------------------------------------------------------------------------
function team(name) {
  if (TEAMS[name]) return { nome: TEAMS[name].nome, flag: TEAMS[name].flag };
  // Placeholder do mata-mata
  return { nome: placeholderLabel(name), flag: '' };
}

function placeholderLabel(code) {
  // "1A" / "2B"          -> "1º Grupo A" / "2º Grupo B"
  // "3C/D/F/G/H"         -> "3º (C/D/F/G/H)"
  // "W74"                -> "Vencedor J74"
  // "L101"               -> "Perdedor J101"
  let m;
  if ((m = /^W(\d+)$/.exec(code))) return 'Vencedor J' + m[1];
  if ((m = /^L(\d+)$/.exec(code))) return 'Perdedor J' + m[1];
  if ((m = /^(\d)([A-L])$/.exec(code))) return m[1] + 'º Grupo ' + m[2];
  if ((m = /^(\d)([A-L](?:\/[A-L])+)$/.exec(code))) return m[1] + 'º (' + m[2] + ')';
  return code; // fallback: mantém o código original
}

// ---------------------------------------------------------------------------
// Conversão de horário para Brasília (BRT, UTC-3, sem horário de verão)
// ---------------------------------------------------------------------------
// time: "13:00 UTC-6", date: "2026-06-11" -> { data:"qui 11/06", hora:"16:00" }
function toBRT(dateStr, timeStr) {
  const [hhmm, tz] = timeStr.split(' ');
  const [h, min] = hhmm.split(':').map(Number);
  const off = parseInt(tz.replace('UTC', ''), 10); // ex.: -6
  const [Y, M, D] = dateStr.split('-').map(Number);
  // Instante em UTC = horário local - offset. BRT = UTC - 3.
  // Usamos Date.UTC para deixar o JS cuidar da virada de dia.
  const utc = Date.UTC(Y, M - 1, D, h - off, min); // h - off = horas em UTC
  const brt = new Date(utc - 3 * 3600 * 1000);      // desloca para UTC-3
  const dd = String(brt.getUTCDate()).padStart(2, '0');
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(brt.getUTCHours()).padStart(2, '0');
  const mi = String(brt.getUTCMinutes()).padStart(2, '0');
  return {
    data: SEMANA[brt.getUTCDay()] + ' ' + dd + '/' + mm,
    hora: hh + ':' + mi,
    _sort: brt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Montagem do objeto BOLAO
// ---------------------------------------------------------------------------
function buildBolao() {
  const groupsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'worldcup.groups.json'), 'utf8'));
  const wc = JSON.parse(fs.readFileSync(path.join(ROOT, 'worldcup.json'), 'utf8'));

  const groups = groupsRaw.groups.map(g => ({
    nome: 'Grupo ' + g.name.replace('Group ', ''),
    times: g.teams.map(t => team(t)),
  }));

  // Separa fase de grupos (tem .group) do mata-mata.
  const isGroup = m => typeof m.group === 'string' && /^Group /.test(m.group);
  const groupMatches = wc.matches.filter(isGroup);
  const koMatches = wc.matches.filter(m => !isGroup(m));

  // Fase de grupos: ordena por instante BRT (cronológico) -> números 1..72
  const groupFix = groupMatches.map(m => {
    const t = toBRT(m.date, m.time);
    return { raw: m, t };
  }).sort((a, b) => a.t._sort - b.t._sort || a.raw.team1.localeCompare(b.raw.team1));

  // Mata-mata: mantém a ordem do arquivo (ordem do chaveamento) -> 73..104.
  // As referências W##/L## do openfootball já usam essa numeração global.
  const koFix = koMatches.map(m => ({ raw: m, t: toBRT(m.date, m.time) }));

  const ordered = [...groupFix, ...koFix];
  const fixtures = ordered.map((o, i) => {
    const m = o.raw;
    const grupoNome = isGroup(m) ? ('Grupo ' + m.group.replace('Group ', '')) : null;
    const ft = m.score && m.score.ft;
    return {
      n: i + 1,
      fase: grupoNome || FASE[m.round] || m.round,
      grupo: grupoNome,
      data: o.t.data,
      hora: o.t.hora,
      casa: team(m.team1),
      fora: team(m.team2),
      placar: ft ? { casa: ft[0], fora: ft[1] } : { casa: null, fora: null },
    };
  });

  const participants = PARTICIPANTES.map(nome => ({ nome, palpites: {} }));

  return { groups, fixtures, participants };
}

// ---------------------------------------------------------------------------
// Geração dos artefatos:
//   - bolao.seed.json  estado inicial (semeado no banco quando vazio)
//   - index.html       site público (renderização vem de src/index.template.html)
// O admin.html é estático (escrito à mão) e fala com /api/state; não é gerado aqui.
// ---------------------------------------------------------------------------
function main() {
  const BOLAO = buildBolao();

  // Sanidade
  const assert = (cond, msg) => { if (!cond) { console.error('ERRO:', msg); process.exit(1); } };
  assert(BOLAO.fixtures.length === 104, `esperado 104 jogos, obtido ${BOLAO.fixtures.length}`);
  assert(BOLAO.groups.length === 12, `esperado 12 grupos, obtido ${BOLAO.groups.length}`);
  assert(BOLAO.participants.length === 9, `esperado 9 participantes, obtido ${BOLAO.participants.length}`);

  // Os artefatos estáticos vão para public/ (layout padrão do Vercel).
  const PUB = path.join(ROOT, 'public');
  fs.mkdirSync(PUB, { recursive: true });

  // bolao.seed.json — dados iniciais (committado; a função usa quando o banco está vazio).
  fs.writeFileSync(path.join(PUB, 'bolao.seed.json'), JSON.stringify(BOLAO, null, 2));

  // index.html — copia do template (que já busca os dados em /api/state).
  const indexTpl = fs.readFileSync(path.join(ROOT, 'src', 'index.template.html'), 'utf8');
  fs.writeFileSync(path.join(PUB, 'index.html'), indexTpl);

  const comResultado = BOLAO.fixtures.filter(f => f.placar.casa != null).length;
  console.log('OK  public/bolao.seed.json e public/index.html gerados.');
  console.log(`    ${BOLAO.fixtures.length} jogos, ${BOLAO.groups.length} grupos, ${BOLAO.participants.length} participantes.`);
  console.log(`    ${comResultado} jogos com resultado no seed.`);
}

if (require.main === module) main();
module.exports = { buildBolao, toBRT, placeholderLabel };
