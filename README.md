# Trifarmas

Compare o preço dos remédios nas farmácias perto de você, junte pontos e troque
por desconto. O projeto tem três partes independentes:

| Pasta        | O que é                                        | Onde publicar |
|--------------|------------------------------------------------|---------------|
| `frontend/`  | Site (HTML, CSS, JS) — funciona como app (PWA) | **Vercel**    |
| `backend/`   | API Node.js + banco PostgreSQL                 | **Render**    |
| `mobile/`    | App em Flutter (Android e iPhone)              | seu celular   |

O site e o app usam **a mesma API e o mesmo banco**: o que você faz num aparece
no outro.

```
frontend/  index.html · farmacia.html (painel do balcão) · styles.css
           config.js · api.js · app.js · medicine.js (histórico, genéricos e avisos)
           cart.js · orders.js · location.js · pwa.js · sw.js · manifest.webmanifest
backend/   src/ (server, rotas, segurança, pontos, preços, e-mail)
           db/ (schema.sql, catalog.js, equivalents.js, seed.js) · test/ · render.yaml
mobile/    lib/ (telas, estado, API) — veja mobile/README.md
.github/   testes automáticos a cada push
```

## O que o app faz

- **Comparar preços** de 160 remédios em 6 farmácias parceiras.
- **Genérico equivalente**: quando existe um remédio com o mesmo princípio ativo,
  a mesma dosagem e a mesma forma mais barato, o app mostra na hora, comparando
  o **preço por comprimido**. A troca sempre pede a confirmação do farmacêutico.
- **Histórico de preço** de cada remédio e aviso de **"avise quando baixar"**.
- **Carrinho dividido**: o app calcula se sai mais barato retirar em duas
  farmácias e cria um pedido (com código próprio) para cada uma.
- **Código de retirada validado pela farmácia**: quem confirma a entrega é o
  balcão, no painel `/farmacia.html`. Só então os pontos entram — o cliente não
  consegue mais dar o pedido como retirado sozinho.
- **Receita médica**: anexar PDF/foto ou mostrar na retirada.
- **Lembretes** de remédio com notificação.
- **Pontos e cupons**: 1 ponto por R$ 1 pago, creditado na confirmação da retirada.
- **Mapa** com farmácias reais ao redor (OpenStreetMap).
- **Conta**: entrar com e-mail/senha ou Google, esqueci minha senha, trocar foto,
  tema escuro, tamanho do texto, **baixar meus dados** e **excluir a conta** (LGPD).
- **Instalável**: no celular, o site pode ser instalado na tela de início (PWA).

## Segurança

- Senha guardada com bcrypt; sessão por token (JWT) de 7 dias.
- 5 senhas erradas bloqueiam a conta por 15 minutos; há limite de tentativas por
  internet (IP) no login, no cadastro e na recuperação de senha.
- Código de recuperação de 6 números, válido por 15 minutos, guardado só como hash.
- Cabeçalhos de segurança em todas as respostas da API.
- Preços e quantidades vêm sempre do banco — o navegador não consegue alterá-los.

## Regras de pontos

- 1 ponto para cada R$ 1 pago, creditado **quando a farmácia confirma a retirada**.
- Contas novas começam com 0 pontos.
- Pontos viram cupons (aba Pontos) e o cupom é escolhido na tela de pagamento.
- No pedido dividido, o cupom entra no pedido de maior valor.

## Preços

Os preços são **simulados para teste** e oscilam até ±6% por dia, de forma
igual para todo mundo. É isso que faz o histórico e os alertas terem o que
mostrar. Para congelar: `SIMULATE_DAILY_PRICES=false` no Render.

## 1. Publicar o backend no Render

**Opção A — Blueprint (cria banco + API de uma vez)**
1. Suba o repositório no GitHub.
2. No Render: **New + → Blueprint**, escolha o repositório e aponte para `backend/render.yaml`.
3. Preencha `CORS_ORIGINS` (URL do Vercel) e `PHARMACY_PIN` (senha do balcão).

**Opção B — manual**
1. **New + → PostgreSQL** (plano free). Copie a *Internal Database URL*.
2. **New + → Web Service**: Root Directory `backend`, Build `npm install`, Start `npm start`.
3. Variáveis de ambiente (veja `backend/.env.example`):
   `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `CORS_ORIGINS`,
   **`PHARMACY_PIN`**, `ALLOW_DEMO_GOOGLE`, `SIMULATE_DAILY_PRICES`.

> **Importante:** sem `PHARMACY_PIN` o painel da farmácia fica desligado e
> nenhum pedido consegue ser concluído (os pontos não entram).

As tabelas são criadas e o catálogo é preenchido automaticamente na primeira
inicialização. Teste em `https://SEU-SERVICO.onrender.com/health`.

## 2. Publicar o site no Vercel

1. Em `frontend/config.js`, troque `API_URL` pela URL do serviço no Render.
2. No Vercel: **Add New → Project**, Root Directory `frontend`,
   Framework Preset **Other** (sem build). Deploy.
3. No Google Cloud Console, adicione a URL do Vercel em
   *Origens JavaScript autorizadas* do Client ID OAuth.

O painel da farmácia fica em `https://SEU-SITE.vercel.app/farmacia.html`.

## 3. Rodar o app Flutter

Veja **`mobile/README.md`** (passo a passo, permissões e login com Google).

## Atualizando uma versão já publicada

- O banco se atualiza sozinho ao reiniciar a API: novas tabelas e colunas são
  criadas sem apagar usuários, pedidos ou lembretes.
- Ao publicar uma versão nova do site, troque o número do cache em
  `frontend/sw.js` (`const CACHE = 'trifarmas-v1'`) para o celular baixar os
  arquivos novos.
- Se trocar o Client ID do Google, troque em **três lugares**:
  `frontend/config.js`, `mobile/lib/config.dart` e a variável
  `GOOGLE_CLIENT_ID` no Render.

## Recuperação de senha por e-mail

Sem configuração, o código de 6 números aparece nos **logs do Render** (serve
para testar). Para enviar de verdade, crie uma conta gratuita no
[Resend](https://resend.com) e configure `RESEND_API_KEY` e `MAIL_FROM`.

## Testes

```bash
# API com um PostgreSQL de verdade
createdb trifarmas_test
cd backend
DATABASE_URL=postgres://postgres@localhost:5432/trifarmas_test DATABASE_SSL=false npm test
```

São 18 testes cobrindo login e bloqueio por tentativas, recuperação de senha,
pedidos, código de retirada, divisão do carrinho, cupons, alertas de preço,
lembretes e exclusão de conta. Eles também rodam sozinhos no GitHub a cada push
(`.github/workflows/testes.yml`).

## Rodar localmente

```bash
# backend (precisa de um PostgreSQL local)
cd backend && cp .env.example .env    # ajuste DATABASE_URL e PHARMACY_PIN
npm install && npm run dev            # http://localhost:3000

# site
cd frontend && py -m http.server 8000 # http://localhost:8000
```

Conta de teste criada automaticamente: `trifarmas@gmail.com` / `123456`.

## O que ainda não é real

Pagamento (Pix/cartão), preços das farmácias e a aprovação da receita são
**simulados**. O painel da farmácia usa uma senha única para todas as lojas —
num sistema de verdade, cada farmácia teria a sua conta.
