# 🏆 Bolão da Copa do Mundo 2026

Bolão de palpites para a Copa de 2026 (48 seleções, 104 jogos), hospedado no **Vercel**
como um app de verdade: site público + **painel de admin online** protegido por senha.
Você lança os resultados e palpites de qualquer lugar e **todos veem ao vivo**, sem
precisar republicar.

Interface toda em **português**, horários no fuso de **Brasília (BRT, UTC-3)**, tema escuro.

## Como funciona

```
Admin (admin.html, com senha)  ──POST /api/state──►  Banco (Upstash Redis)
                                                          │
Site público (index.html)  ──GET /api/state──────────────┘  (atualiza sozinho)
```

- **`index.html`** — site público. Busca os dados em `/api/state` e renderiza o ranking,
  jogos, grupos e palpites. Atualiza sozinho a cada 60s.
- **`admin.html`** — painel online. Pede a senha, carrega o estado e salva cada alteração
  na hora (autosave). Abas: ⚽ Resultados, 📝 Palpites, 🛠️ Ferramentas.
- **`api/state.js`** — função serverless do Vercel. `GET` é público; `POST` exige o
  cabeçalho `x-admin-password` igual à variável `ADMIN_PASSWORD`.
- **`bolao.seed.json`** — dados iniciais da Copa (gerados de `worldcup.json`). A função
  usa esse seed enquanto o banco estiver vazio.

| Arquivo | O que é |
|---|---|
| `index.html`, `admin.html` | Site público e painel (estáticos). |
| `api/state.js` | Função serverless (GET público / POST com senha). |
| `bolao.seed.json` | Dados iniciais (committado). |
| `build.js` | Regenera `bolao.seed.json` e `index.html` a partir dos JSON oficiais. |
| `dev-server.js` | Servidor local para testar tudo sem o Vercel. |
| `worldcup.json`, `worldcup.groups.json` | Dados oficiais (formato openfootball). |
| `test/` | Testes da pontuação (`points.test.js`) e da API (`api.local.js`). |

## Deploy no Vercel (uma vez)

1. **Suba o projeto** no Vercel: **Add New… → Project**, conecte o repositório (ou arraste
   a pasta). Preset de framework: **Other**. Não precisa de build command.
2. **Crie o banco (Redis):** no projeto, aba **Storage → Create Database → Upstash (Redis)**,
   e conecte ao projeto. Isso injeta automaticamente as variáveis `KV_REST_API_URL` e
   `KV_REST_API_TOKEN`.
3. **Defina a senha do admin:** **Settings → Environment Variables → `ADMIN_PASSWORD`** =
   a senha que você quiser.
4. **Redeploy** (para pegar as variáveis novas). Pronto:
   - Site público: `https://SEU-PROJETO.vercel.app`
   - Admin: `https://SEU-PROJETO.vercel.app/admin.html`

> Só você tem a senha do admin. Os participantes te mandam os palpites e você cadastra
> (inclusive colando em massa).

## Uso (dia a dia)

1. Abra **`/admin.html`** e entre com a senha.
2. **⚽ Resultados** — digite os gols (casa × fora) de cada jogo. Salva sozinho; todos veem na hora.
3. **📝 Palpites** — escolha o participante e digite, ou use **Colar em massa** (palpites de
   um participante, por número de jogo). Formatos: `1: 2x0`, `Jogo 1 2 x 0`, `1 - 2x0`, `1 2:0`.
4. **📥 Colar do grupo** — cole a mensagem do grupo (palpites de **vários participantes para
   um jogo**, por nome). O painel detecta o jogo pelos times, casa os nomes com os
   participantes e mostra uma prévia para você confirmar antes de aplicar. Exemplo:

   ```
   BOLÃO

   CATAR X SUÍÇA

   Isaac 2 x 0 Suíça
   Rapha 2 x 2
   Filipe 4x0 Suíça
   ```
5. **🛠️ Ferramentas** — backup `.json`, importar backup, e resetar para os dados originais.

## Rodar localmente

```bash
npm install
# Windows PowerShell:
$env:ADMIN_PASSWORD='admin'; node dev-server.js
# macOS/Linux:
ADMIN_PASSWORD=admin node dev-server.js
```

Abra `http://localhost:3000` (site) e `http://localhost:3000/admin.html` (admin, senha `admin`).
Sem Redis configurado, o estado fica **só em memória** (zera ao reiniciar) — ótimo para testar.

## Manutenção dos dados

Se os JSON oficiais mudarem (ex.: tabela atualizada), regenere os artefatos:

```bash
node build.js              # recria bolao.seed.json e index.html
node test/points.test.js   # testes da pontuação (10 casos)
node test/api.local.js     # testes da API (GET/POST/auth/validação)
```

## Regra de pontuação

Por jogo, vale **sempre a maior** pontuação aplicável (resultado real × palpite):

| Pontos | Quando |
|---:|---|
| **25** | Placar exato. |
| **18** | Acertou o vencedor **e** a quantidade de gols do **vencedor**. |
| **15** | Acertou o vencedor **e** a quantidade de gols do **perdedor**. |
| **12** | Acertou o vencedor **e** o **saldo** de gols. |
| **10** | Acertou só o vencedor. |
| **5** | Acertou que seria **empate**, sem o placar exato. |
| **0** | Errou o resultado (ou faltou resultado/palpite). |

**Ranking:** ordena por pontos (desc). **Desempate oficial:** mais **placares exatos**.
A classificação dos grupos usa vitória = 3, empate = 1 (ordena por pontos → saldo → gols pró)
e destaca os 2 primeiros de cada grupo.
