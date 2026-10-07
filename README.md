# Trifarmas

O projeto está dividido em duas partes independentes:

| Pasta        | O que é                                   | Onde publicar |
|--------------|-------------------------------------------|---------------|
| `frontend/`  | Site estático (HTML, CSS, JS, imagens)    | **Vercel**    |
| `backend/`   | API Node.js + banco PostgreSQL            | **Render**    |

O front-end não guarda mais dados no navegador: usuários, pontos, pedidos,
lembretes, fotos de perfil e o catálogo (farmácias, remédios, recompensas)
ficam no banco PostgreSQL, acessado apenas pelo backend.

```
frontend/  index.html · styles.css · app.js · api.js · config.js · assets/ · vercel.json
backend/   src/ (server, rotas, auth, db) · db/schema.sql · db/seed.js · render.yaml · .env.example
```

## 1. Publicar o backend no Render

**Opção A — Blueprint (cria banco + API de uma vez)**
1. Suba o repositório no GitHub.
2. No Render: **New + → Blueprint**, escolha o repositório e aponte para `backend/render.yaml`.
3. Quando pedir, preencha `CORS_ORIGINS` com a URL do Vercel (ex.: `https://trifarmas.vercel.app`).

**Opção B — manual**
1. **New + → PostgreSQL** (plano free). Copie a *Internal Database URL*.
2. **New + → Web Service**: Root Directory `backend`, Build `npm install`, Start `npm start`.
3. Variáveis de ambiente (veja `backend/.env.example`):
   `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `CORS_ORIGINS`, `ALLOW_DEMO_GOOGLE`.

As tabelas são criadas e o catálogo é preenchido automaticamente na primeira
inicialização. Teste em `https://SEU-SERVICO.onrender.com/health`.

## 2. Publicar o front-end no Vercel
1. Em `frontend/config.js`, troque `API_URL` pela URL do serviço no Render.
2. No Vercel: **Add New → Project**, Root Directory `frontend`, Framework Preset **Other**
   (sem build). Deploy.
3. No Google Cloud Console, adicione a URL do Vercel em
   *Origens JavaScript autorizadas* do Client ID OAuth.

## Rodar localmente
```bash
# backend (precisa de um PostgreSQL local)
cd backend && cp .env.example .env    # ajuste DATABASE_URL
npm install && npm run dev            # http://localhost:3000

# frontend
cd frontend && py -m http.server 8000 # http://localhost:8000
```
Conta de teste criada automaticamente: `trifarmas@gmail.com` / `123456`.
