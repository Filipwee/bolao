# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A **"Bolão da Copa do Mundo 2026"** (World Cup 2026 prediction pool) for ~9 friends. The
admin enters real match results and each participant's predictions; the app computes scores
and shows a live ranking.

It is deployed to **Vercel** as a real app: static frontend + a serverless function + a
Redis store. The admin updates data **online** (password-protected) and everyone sees it
live — no redeploy needed.

> The original spec is `PROMPT_CLAUDE_CODE.txt` (Portuguese). It describes an earlier
> **fully-static** design where data was embedded in the HTML and the admin generated a new
> `index.html` to redeploy. The project has since **pivoted to the online architecture below**
> (admin updates live via an API + database). The spec is still authoritative for the
> **data model, match numbering, and scoring rules**, but the static-embedding / admin
> `buildIndex()` mechanism it describes is no longer used.

### Conventions (non-negotiable)

- **All UI text in Brazilian Portuguese.** Team names translated to PT with flag emoji (map in `build.js`).
- **All times in Brasília time (BRT, UTC-3, no DST).** Source `"20:00 UTC-6"` → converted in `build.js`.
- **No frontend framework, no CDN, no libraries.** Dark theme, mobile-responsive. The only
  npm dependency is `@upstash/redis` (used by the serverless function).

## Architecture

```
worldcup.json + worldcup.groups.json   (openfootball source)
        │  build.js  (translate → BRT → number 1–104 + kickoff ISO)
        ▼
public/bolao.seed.json   (initial BOLAO state, committed)
        │  seeded into the store on first read
        ▼
Upstash Redis   bolao:state (público)   +   bolao:auth (credenciais, privado)
   ▲ POST /api/state    (admin, x-admin-password)        ── public/admin.html
   ▲ POST /api/acessos  (admin: cria login/senha)         ── public/admin.html (aba Acessos)
   ▲ POST /api/palpite  (participante: login+senha)       ── public/meu.html
   └ GET  /api/state    (público, palpites futuros ocultos)── public/index.html (auto-refresh 60s)

Vercel layout (set in vercel.json): static assets in public/ (served at /), serverless
functions in api/, shared code in lib/ (bundled, not routed), build = `node build.js`.
```

- **`lib/store.js`** — camada compartilhada por todas as funções `api/`. Lê/grava o estado
  (`bolao:state`) e as credenciais (`bolao:auth`); tabela de **kickoff por nº de jogo** (vinda
  do seed); `stripState()` (sigilo); `authParticipant()`/`adminOk()`. **Fallback em memória**
  quando não há env de Redis (`KV_REST_API_*`/`UPSTASH_REDIS_REST_*`) — é o que faz dev local e
  testes rodarem sem provisionar nada. O require de `@upstash/redis` é **preguiçoso**.
- **`api/state.js`** — `GET` público devolve o estado com os palpites de **jogos que ainda não
  começaram ocultados** (`stripState`); com header `x-admin-password` válido devolve o estado
  **completo** (o admin precisa para editar). `POST` (admin) valida e grava o estado inteiro.
- **`api/palpite.js`** — área do participante. `POST {login,senha}` faz login e retorna nome +
  os próprios palpites; `POST {login,senha,palpites}` salva **só os próprios** palpites,
  **rejeitando jogos que já começaram** (trava no kickoff; volta em `travados`).
- **`api/acessos.js`** — admin (`x-admin-password`): `list`/`set`/`remove` credenciais. Liga um
  `login` ao `id` de um participante. Senhas ficam só em `bolao:auth`, **nunca** no GET público.
- **`index.html`** — site público, 4 abas (Ranking / Jogos / Grupos / Palpites) + botão "Fazer
  meu bolão" (→ `/meu.html`). Gerado por `build.js` a partir de `src/index.template.html`.
  Palpites de jogos não iniciados aparecem como 🔒 (já vêm ocultos do servidor).
- **`meu.html`** — página do participante (estática, escrita à mão). Login (login+senha em
  `localStorage`) → carrega fixtures do GET público e os próprios palpites do `POST /api/palpite`
  → autosave debounced; inputs travam no horário do jogo.
- **`admin.html`** — estático (NÃO gerado). Gate por senha (validada via `POST /api/acessos`
  `list`, sem gravar) → carrega o estado completo (GET com header) → **migra ids** dos
  participantes → autosave debounced. O save normal faz **merge** (parte do estado mais recente
  do servidor e reaplica só as edições de palpite da sessão — `palpEdits`) para não desfazer o
  que os participantes salvam em paralelo; reset/import gravam de forma autoritativa
  (`agendarSave(true)`). Abas novas: **👥 Acessos** (gera/edita login+senha, copia mensagem) e
  **📋 Relatório** (mensagem com os palpites de todos por jogo/participante).
- **`dev-server.js`** — servidor local que imita o Vercel: serve estáticos e roteia
  **qualquer `/api/<nome>`** para `./api/<nome>.js`, **polyfillando `res.status()`/`res.json()`**
  e parseando o corpo JSON em `req.body`.

### State shape (the `BOLAO` / `state` object — see prompt §2)

- `groups[]`: `{ nome, times: [{nome,flag} ×4] }` — 12 groups.
- `fixtures[]`: 104 matches `{ n, fase, grupo, data, hora, kickoff, casa:{nome,flag}, fora:{nome,flag}, placar:{casa,fora} }`.
  `placar` is `{casa:null, fora:null}` until played; `grupo` is `null` in the knockout stage.
  `kickoff` is the **real UTC instant** of the match (ISO) — the server uses it (looked up by
  `n` from the seed, the source of truth) to lock predictions and hide future ones.
- `participants[]`: `{ id, nome, palpites }` — `id` is a stable uuid (links to credentials in
  `bolao:auth`; assigned lazily by admin.html `ensureIds()` on first load). `palpites` keyed by
  **match number as a string**: `{ "1": {casa:2, fora:0} }`. Initial 9 (seed): Ryan, Filipe,
  Rapha, Rafael, Isaac, Miguel, Rogério, Davi, Sérgio (production has more).
- **`bolao:auth`** (separate Redis key, NEVER in the public GET): `{ users: { "<login>": { id,
  nome, senha } } }`. Passwords are stored in plaintext server-side (acceptable for ~12 friends;
  lets the admin re-share them). The login check is timing-safe.

### Sigilo & trava (the new self-service rules)

- **Lock at kickoff**: a participant can only edit a game's prediction while `now < kickoff(n)`.
  `api/palpite.js` enforces it server-side; `meu.html`/`index.html` reflect it client-side.
- **Secrecy**: `stripState()` removes predictions of not-yet-started games from the public GET
  for everyone (the owner sees their own via the authenticated `/api/palpite` login). Once a
  game kicks off, its predictions become public.

### Match numbering (prompt §1c) — handled in `build.js`

Group stage (72 games) numbered **chronologically** by BRT datetime → 1–72; knockout in
**file order** (= bracket order) → 73–104 (R32 73–88, R16 89–96, QF 97–100, SF 101–102, 3rd 103, Final 104).
The openfootball `W74`/`L101` placeholders already use this global numbering, so the
references line up. Placeholders translate to PT labels (`"1A"`→`"1º Grupo A"`, `"W74"`→`"Vencedor J74"`, etc.).

### Scoring (prompt §3 — CRITICAL, keep identical in all copies)

`points(RC,RF,PC,PF)` lives **duplicated** in `index.html` (via template), `admin.html`,
`meu.html`, and `test/points.test.js` — keep them byte-identical if you change one. Highest applicable tier:
25 exact · 18 winner+winner's goals · 15 winner+loser's goals · 12 winner+goal-difference ·
10 winner only · 5 correct draw · 0 wrong (or `null` if result/prediction missing). Ranking
sorts by points desc → exact scores desc → name asc; tiebreak = most exact scores.

**Knockout multiplier**: the base `points()` value is multiplied by `multFase(fase)` —
16-avos ×1.5 · Oitavas ×2 · Quartas ×3 · Semifinal ×4 · Disputa 3º ×4 · Final ×5 · grupos ×1.
`multFase` is also **duplicated** (same four places) — keep in sync. The **exact-score count**
(`exatos`, used for tiebreak) is based on the *base* 25, not the multiplied value, and pill colors
key off the base tier (`corPts(base)`); only the displayed number is multiplied (`fmtPts`, with a
comma decimal). Points can now be fractional (e.g. 18×1.5 = 27, 15×1.5 = 22,5).

### Knockout bracket resolution (display-only) — `lib/store.js`

The knockout fixtures store placeholders (`"1º Grupo A"`, `"2º Grupo B"`, `"3º (A/B/C/D/F)"`,
`"Vencedor J74"`, `"Perdedor J101"`). `resolverChaveamento(state)` fills the real team names+flags
from results when possible: group positions from `classificacaoGrupo` (only once the group's 6
games are played), winners/losers of prior knockout games, and the 8 third-place slots via the
fixed `TERCEIRO_POR_JOGO` map (this Cup's qualified thirds: groups **B, D, E, F, I, J, K, L**).
It runs **inside `stripState`**, so it only affects the public/participant GET copy — the stored
state keeps the placeholders. It's purely cosmetic: scoring keys off the game **number**, never
the team name. Standings use the same simplified tiebreak as the Grupos tab (points → goal-diff →
goals-for → name), not FIFA's full criteria.

`admin.html` **mirrors** `resolverChaveamento` client-side (`fixturesResolvidos()` → a resolved
deep copy of `state`) **only for display** — results/palpites/relatório/colar show real team names,
but `state` is still saved with the placeholders (so the merge-save never persists resolved names).
Keep the admin copy in sync with `lib/store.js` (incl. `TERCEIRO_POR_JOGO`).

## Commands

```bash
npm install                 # gets @upstash/redis (also what Vercel runs)
node build.js               # regenerate public/bolao.seed.json + public/index.html from the JSONs
npm test                    # runs the three test files below
node test/points.test.js    # 10 scoring cases (prompt §3/§7)
node test/api.local.js      # /api/state: GET/POST/auth/validation (in-memory mode)
node test/auth.local.js     # acessos → login → trava no kickoff → sigilo público vs admin
node dev-server.js          # full local app at http://localhost:3000 (ADMIN_PASSWORD env, default "admin")
                            #   site /, admin /admin.html, participante /meu.html
```

On Vercel, `vercel.json` runs `node build.js` and serves `public/`. The generated
`public/index.html` and `public/bolao.seed.json` are **also committed** so the function's
`require('../public/bolao.seed.json')` resolves even before the build runs.

## Deploy (Vercel)

Import the repo (`vercel.json` sets framework/build/output — no dashboard tweaks needed).
Then: **Storage → Create Database → Upstash (Redis)** linked to the project (injects
`KV_REST_API_*`), and **Settings → Env Vars → `ADMIN_PASSWORD`**. Redeploy. Public site at
`/`, admin at `/admin.html`. Full steps in `README.md`.

## Gotchas

- The `</script>` literal: if you ever re-embed HTML inside a `<script>`, write the closing
  tag as `<\/script>` so the HTML parser doesn't end the block early (same string in JS).
- `build.js` is the **only** place team translations, flags, and BRT conversion live — edit
  there, then re-run it and commit the regenerated `bolao.seed.json` + `index.html`.
- `src/index.template.html` is the source for `public/index.html` (build.js copies it). Edit
  the template, not the generated file. `public/admin.html` is hand-written (no template).
- Static files live in `public/`; functions in `api/`. Don't put HTML at the repo root —
  Vercel serves `public/` (per `vercel.json`).
