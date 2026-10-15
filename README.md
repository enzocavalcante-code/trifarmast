<!-- A logo tem duas versões: a clara aparece no tema escuro do GitHub. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/assets/logo-dark.png">
  <img src="frontend/assets/logo.png" alt="Trifarmas" width="420">
</picture>

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-1e8a4c?style=for-the-badge)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-1e8a4c?style=for-the-badge)
![JavaScript](https://img.shields.io/badge/javascript-f7df1e?style=for-the-badge&logo=javascript&logoColor=000000)
![Node.js](https://img.shields.io/badge/node.js-5fa04e?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgresql-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Render](https://img.shields.io/badge/render-5a4fcf?style=for-the-badge&logo=render&logoColor=white)

<!-- Quer os badges com os números do repositório (tamanho, forks, issues)?
     Depois de publicar no GitHub, troque SEU-USUARIO/trifarmas pelo caminho real
     e tire estes cinco de dentro do comentário:

![GitHub repo size](https://img.shields.io/github/repo-size/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
![GitHub language count](https://img.shields.io/github/languages/count/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
![GitHub forks](https://img.shields.io/github/forks/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
![GitHub issues](https://img.shields.io/github/issues/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
![GitHub pull requests](https://img.shields.io/github/issues-pr/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
-->

<img src="frontend/assets/preview.png" alt="Telas do Trifarmas: busca de remédios, lembretes e pedidos">

> O Trifarmas compara o preço do mesmo remédio em várias farmácias e mostra onde
> sai mais barato perto de você. Dá para montar o carrinho, pagar pelo app, retirar
> na farmácia com um código, lembrar a hora de tomar e juntar pontos que viram desconto.

### Ajustes e melhorias

O projeto ainda está em desenvolvimento e as próximas atualizações serão voltadas para as seguintes tarefas:

- [x] Comparar o preço de 160 remédios em 6 farmácias
- [x] Entrar com e-mail e senha ou com a conta do Google
- [x] Carrinho, pagamento e código de retirada
- [x] Receita médica: anexar PDF/foto ou mostrar na retirada
- [x] Pontos que viram cupons de desconto
- [x] Mapa com farmácias de verdade ao redor
- [x] Lembretes de remédio em três passos, com repetição por vários dias
- [x] Ver a senha enquanto digita
- [x] Modo escuro e tamanho do texto ajustável
- [ ] Ler a receita pela câmera e achar o remédio mais barato
- [ ] Preços de verdade (tabela da CMED e dados das farmácias, quando o projeto real for feito)
- [ ] Pagamento de verdade com Pix(quando o projeto real for feito)
- [ ] Retirada confirmada pela própria farmácia, no balcão(quando o projeto real for feito)
- [ ] Aplicativo para Android e IOS(quando o projeto real for feito)

## 💻 Pré-requisitos

Antes de começar, verifique se você atendeu aos seguintes requisitos:

- Você instalou a versão mais recente do `Node.js 20 ou superior` (a API não roda em versões mais antigas).
- Você tem um `PostgreSQL 14 ou superior` rodando na sua máquina — ou um banco gratuito no [Render](https://render.com).
- Você tem o `Python 3` instalado (só para abrir o site durante o desenvolvimento) ou qualquer outro servidor de arquivos.
- Você tem uma máquina `Windows, Linux ou macOS`. O projeto funciona igual nos três.
- Para o login com o Google, você criou um `ID do cliente OAuth` no [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

## 🚀 Instalando o Trifarmas

Para instalar o Trifarmas, siga estas etapas:

Linux e macOS:

```bash
git clone https://github.com/SEU-USUARIO/trifarmas.git
cd trifarmas/backend
cp .env.example .env     # abra o .env e preencha DATABASE_URL e JWT_SECRET
npm install
```

Windows:

```powershell
git clone https://github.com/SEU-USUARIO/trifarmas.git
cd trifarmas\backend
copy .env.example .env   # abra o .env e preencha DATABASE_URL e JWT_SECRET
npm install
```

Na primeira vez que a API subir, ela cria as tabelas sozinha e já preenche o
catálogo com as farmácias, os 160 remédios e as recompensas.

## ☕ Usando o Trifarmas

Para usar o Trifarmas, siga estas etapas:

```bash
# 1. a API (pasta backend)
npm run dev                    # http://localhost:3000

# 2. o site (em outro terminal, pasta frontend)
python3 -m http.server 8000    # no Windows: py -m http.server 8000
```

Abra `http://localhost:8000` e entre com a conta de teste que já vem criada:

```
e-mail: trifarmas@gmail.com
senha:  123456
```

Com o app aberto, você pode:

- **Buscar um remédio** pelo nome ou pelo princípio ativo (funciona com ou sem acento) e ver o preço em cada farmácia, da mais barata para a mais cara.
- **Montar o carrinho** e comparar quanto o pedido inteiro custa em cada farmácia antes de pagar.
- **Pagar** (simulado) e receber o **código de retirada** na aba Pedidos.
- **Resolver a receita** dos remédios que exigem: anexar PDF/foto ou mostrar na retirada.
- **Criar lembretes** em três toques — remédio, horário e dia —, com opção de repetir por 7, 15 ou 30 dias.
- **Ver as farmácias ao redor** no mapa, pela localização do aparelho ou digitando o CEP.
- **Juntar pontos** (1 ponto a cada R$ 1 pago) e trocar por cupons de desconto.

Para conferir se a API está no ar, abra `http://localhost:3000/health` — a resposta
deve ser `{"ok":true}`.

## 🌐 Publicando na internet

O projeto é dividido em duas partes, publicadas em lugares diferentes:

| Pasta       | O que é                                | Onde publicar |
|-------------|----------------------------------------|---------------|
| `frontend/` | Site estático (HTML, CSS, JS, imagens) | **Vercel**    |
| `backend/`  | API Node.js + banco PostgreSQL         | **Render**    |

**Render (backend):** crie um banco PostgreSQL (plano free) e um Web Service com
*Root Directory* `backend`, *Build* `npm install` e *Start* `npm start`. Preencha as
variáveis `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID` e `CORS_ORIGINS`
(a URL do Vercel). O arquivo `backend/render.yaml` faz tudo isso de uma vez pelo
menu *New + → Blueprint*.

**Vercel (site):** aponte `API_URL` em `frontend/config.js` para o endereço do
Render, crie o projeto com *Root Directory* `frontend` e *Framework Preset* **Other**.
Por fim, adicione a URL do Vercel nas *Origens JavaScript autorizadas* do seu
Client ID do Google.



## 🤝 Colaboradores

Agradecemos às seguintes pessoas que contribuíram para este projeto:

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/enzocavalcante-code" title="Perfil no GitHub">
              <img src="frontend/assets/logo.png" alt="Trifarmas" width="80px">
      </a>
    </td>

  </tr>
</table>

---

Os preços, o pagamento e a aprovação da receita deste app são **simulados**, para
fins de estudo. Nenhuma cobrança é feita de verdade.
